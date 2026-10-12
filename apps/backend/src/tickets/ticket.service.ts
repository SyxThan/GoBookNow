import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  Prisma,
  ReservationStatus,
  TicketStatus,
  type Ticket,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { CustomerTicketListResponseDto } from './dto/customer-ticket-response.dto.js';

const ISSUANCE_ATTEMPTS = 5;
const TICKET_CODE_BYTES = 6;
const TOKEN_NONCE_BYTES = 24;

type LockedRow = { id: string };

@Injectable()
export class TicketService {
  constructor(private readonly prisma: PrismaService) {}

  async issueTicketsForBooking(bookingId: string): Promise<Ticket[]> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockBooking(transaction, bookingId);

      const booking = await transaction.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          status: true,
          items: {
            orderBy: { id: 'asc' },
            select: {
              id: true,
              quantity: true,
              reservation: { select: { status: true, quantity: true } },
            },
          },
        },
      });
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.status !== BookingStatus.CONFIRMED) {
        throw new ConflictException(
          'Tickets can only be issued for a confirmed Booking',
        );
      }
      if (booking.items.length === 0) {
        throw new ConflictException('Confirmed Booking has no BookingItems');
      }
      if (
        booking.items.some(
          ({ quantity, reservation }) =>
            reservation?.status !== ReservationStatus.CONFIRMED ||
            reservation.quantity !== quantity,
        )
      ) {
        throw new ConflictException(
          'Confirmed Booking has inconsistent Reservation state',
        );
      }

      for (let attempt = 0; attempt < ISSUANCE_ATTEMPTS; attempt += 1) {
        const existing = await transaction.ticket.findMany({
          where: { bookingItem: { bookingId } },
          select: { bookingItemId: true, sequenceNo: true },
        });
        this.assertNoUnexpectedTickets(booking.items, existing);

        const existingKeys = new Set(
          existing.map(
            ({ bookingItemId, sequenceNo }) => `${bookingItemId}:${sequenceNo}`,
          ),
        );
        const missing = booking.items.flatMap((item) =>
          Array.from({ length: item.quantity }, (_, index) => ({
            bookingItemId: item.id,
            sequenceNo: index + 1,
          })).filter(
            ({ bookingItemId, sequenceNo }) =>
              !existingKeys.has(`${bookingItemId}:${sequenceNo}`),
          ),
        );

        if (missing.length === 0) break;
        await transaction.ticket.createMany({
          data: missing.map(({ bookingItemId, sequenceNo }) => ({
            bookingItemId,
            sequenceNo,
            ticketCode: this.generateTicketCode(),
            tokenNonce: this.generateTokenNonce(),
          })),
          skipDuplicates: true,
        });
      }

      const tickets = await transaction.ticket.findMany({
        where: { bookingItem: { bookingId } },
        orderBy: [{ bookingItemId: 'asc' }, { sequenceNo: 'asc' }],
      });
      this.assertExactTicketCounts(booking.items, tickets);
      return tickets;
    });
  }

  getTicketsForBooking(bookingId: string): Promise<Ticket[]> {
    return this.prisma.ticket.findMany({
      where: { bookingItem: { bookingId } },
      orderBy: [{ bookingItemId: 'asc' }, { sequenceNo: 'asc' }],
    });
  }

  getTicketsForBookingItem(bookingItemId: string): Promise<Ticket[]> {
    return this.prisma.ticket.findMany({
      where: { bookingItemId },
      orderBy: { sequenceNo: 'asc' },
    });
  }

  async getTicketById(id: string): Promise<Ticket> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async getCustomerTicketsForBooking(
    customerId: string,
    bookingId: string,
  ): Promise<CustomerTicketListResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        bookingCode: true,
        customerId: true,
        status: true,
        items: {
          orderBy: { id: 'asc' },
          select: {
            quantity: true,
            serviceTitleSnapshot: true,
            slotStartAtSnapshot: true,
            slotEndAtSnapshot: true,
            tickets: {
              orderBy: { sequenceNo: 'asc' },
              select: {
                id: true,
                ticketCode: true,
                sequenceNo: true,
                status: true,
                issuedAt: true,
                checkedInAt: true,
              },
            },
          },
        },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.customerId !== customerId) {
      throw new ForbiddenException('Booking belongs to another customer');
    }

    return {
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      bookingStatus: booking.status,
      tickets: booking.items.flatMap((item) =>
        item.tickets.map((ticket) => ({
          id: ticket.id,
          ticketCode: ticket.ticketCode,
          sequenceNo: ticket.sequenceNo,
          status: ticket.status,
          issuedAt: ticket.issuedAt.toISOString(),
          checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
          bookingItem: {
            serviceTitle: item.serviceTitleSnapshot,
            slotStartAt: item.slotStartAtSnapshot.toISOString(),
            slotEndAt: item.slotEndAtSnapshot.toISOString(),
            quantity: item.quantity,
          },
        })),
      ),
    };
  }

  async getCustomerTicketForQr(
    customerId: string,
    ticketId: string,
  ): Promise<Ticket> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        bookingItem: {
          select: {
            booking: { select: { customerId: true, status: true } },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.bookingItem.booking.customerId !== customerId) {
      throw new ForbiddenException('Ticket belongs to another customer');
    }
    if (ticket.bookingItem.booking.status !== BookingStatus.CONFIRMED) {
      throw new ConflictException({
        code: 'BOOKING_NOT_CONFIRMED',
        message:
          'Ticket QR is unavailable because the Booking is not confirmed',
      });
    }
    if (ticket.status === TicketStatus.VOIDED) {
      throw new ConflictException({
        code: 'TICKET_VOIDED',
        message: 'Voided Ticket QR is unavailable',
      });
    }

    const { bookingItem: _bookingItem, ...credentialTicket } = ticket;
    return credentialTicket;
  }

  private async lockBooking(
    transaction: Pick<Prisma.TransactionClient, '$queryRaw'>,
    bookingId: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<LockedRow[]>(Prisma.sql`
      SELECT "id" FROM "bookings"
      WHERE "id" = ${bookingId}::uuid
      FOR UPDATE
    `);
    if (!rows[0]) throw new NotFoundException('Booking not found');
  }

  private assertNoUnexpectedTickets(
    items: readonly { id: string; quantity: number }[],
    tickets: readonly { bookingItemId: string; sequenceNo: number }[],
  ): void {
    const quantities = new Map(items.map(({ id, quantity }) => [id, quantity]));
    if (
      tickets.some(({ bookingItemId, sequenceNo }) => {
        const quantity = quantities.get(bookingItemId);
        return (
          quantity === undefined || sequenceNo < 1 || sequenceNo > quantity
        );
      })
    ) {
      throw new ConflictException(
        'Existing Tickets are inconsistent with BookingItem quantities',
      );
    }
  }

  private assertExactTicketCounts(
    items: readonly { id: string; quantity: number }[],
    tickets: readonly { bookingItemId: string; sequenceNo: number }[],
  ): void {
    this.assertNoUnexpectedTickets(items, tickets);
    for (const item of items) {
      const itemTickets = tickets.filter(
        ({ bookingItemId }) => bookingItemId === item.id,
      );
      const sequences = new Set(
        itemTickets.map(({ sequenceNo }) => sequenceNo),
      );
      if (
        itemTickets.length !== item.quantity ||
        sequences.size !== item.quantity
      ) {
        throw new ConflictException(
          `Ticket count does not match BookingItem quantity for ${item.id}`,
        );
      }
    }
  }

  private generateTicketCode(): string {
    return `GBT-${randomBytes(TICKET_CODE_BYTES).toString('hex').toUpperCase()}`;
  }

  private generateTokenNonce(): string {
    return randomBytes(TOKEN_NONCE_BYTES).toString('base64url');
  }
}
