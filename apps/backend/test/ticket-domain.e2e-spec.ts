import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  BookingStatus,
  CategoryScope,
  PaymentStatus,
  PricingSource,
  ReservationStatus,
  ServiceKind,
  ServiceStatus,
  SlotStatus,
  TicketStatus,
  UserStatus,
  VendorStatus,
} from '../src/generated/prisma/client.js';
import { TicketService } from '../src/tickets/ticket.service.js';
import { TicketsModule } from '../src/tickets/tickets.module.js';

describe('Ticket domain foundation (e2e, PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tickets: TicketService;
  const run = randomUUID().replaceAll('-', '').slice(0, 10);
  let customerId: string;
  let ownerId: string;
  let vendorId: string;
  let categoryId: string;
  let serviceId: string;
  let slotId: string;
  let bookingSequence = 0;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              TICKET_TOKEN_SECRET:
                'ticket-domain-e2e-secret-with-at-least-32-bytes',
            }),
          ],
        }),
        PrismaModule,
        TicketsModule,
      ],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
    prisma = fixture.get(PrismaService);
    tickets = fixture.get(TicketService);

    customerId = await createUser('customer');
    ownerId = await createUser('owner');
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId: ownerId,
        displayName: `Ticket Vendor ${run}`,
        slug: `ticket-vendor-${run}`,
        status: VendorStatus.APPROVED,
      },
    });
    vendorId = vendor.id;
    const category = await prisma.category.create({
      data: {
        code: `TICKET_${run.toUpperCase()}`,
        name: `Ticket Category ${run}`,
        slug: `ticket-category-${run}`,
        scope: CategoryScope.EVENT,
      },
    });
    categoryId = category.id;
    const service = await prisma.service.create({
      data: {
        vendorId,
        categoryId,
        kind: ServiceKind.EVENT,
        title: `Ticket Event ${run}`,
        slug: `ticket-event-${run}`,
        priceAmount: 100_000n,
        status: ServiceStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
    serviceId = service.id;
    const slot = await prisma.slot.create({
      data: {
        serviceId,
        startAt: new Date('2099-01-01T02:00:00.000Z'),
        endAt: new Date('2099-01-01T04:00:00.000Z'),
        capacity: 100,
        status: SlotStatus.OPEN,
      },
    });
    slotId = slot.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.ticket.deleteMany({
        where: { bookingItem: { booking: { customerId } } },
      });
      await prisma.payment.deleteMany({
        where: { booking: { customerId } },
      });
      await prisma.booking.deleteMany({ where: { customerId } });
      await prisma.slot.deleteMany({ where: { id: slotId } });
      await prisma.service.deleteMany({ where: { id: serviceId } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.vendor.deleteMany({ where: { id: vendorId } });
      await prisma.user.deleteMany({
        where: { id: { in: [customerId, ownerId] } },
      });
    }
    await app?.close();
  });

  async function createUser(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `ticket-${run}-${label}@example.com`,
        status: UserStatus.ACTIVE,
      },
    });
    return user.id;
  }

  async function createBooking(
    quantities: number[],
    status: BookingStatus = BookingStatus.CONFIRMED,
  ) {
    bookingSequence += 1;
    const reservationStatus =
      status === BookingStatus.CONFIRMED
        ? ReservationStatus.CONFIRMED
        : status === BookingStatus.EXPIRED
          ? ReservationStatus.EXPIRED
          : status === BookingStatus.CANCELLED
            ? ReservationStatus.RELEASED
            : ReservationStatus.HELD;
    return prisma.booking.create({
      data: {
        bookingCode: `TKT-${run}-${bookingSequence}`,
        customerId,
        vendorId,
        status,
        subtotalAmount: BigInt(
          quantities.reduce((sum, quantity) => sum + quantity * 100_000, 0),
        ),
        totalAmount: BigInt(
          quantities.reduce((sum, quantity) => sum + quantity * 100_000, 0),
        ),
        confirmedAt: status === BookingStatus.CONFIRMED ? new Date() : null,
        items: {
          create: quantities.map((quantity) => ({
            serviceId,
            slotId,
            quantity,
            unitPriceAmount: 100_000n,
            subtotalAmount: BigInt(quantity * 100_000),
            pricingSource: PricingSource.SERVICE,
            serviceTitleSnapshot: `Ticket Event ${run}`,
            slotStartAtSnapshot: new Date('2099-01-01T02:00:00.000Z'),
            slotEndAtSnapshot: new Date('2099-01-01T04:00:00.000Z'),
            reservation: {
              create: {
                slotId,
                quantity,
                status: reservationStatus,
                confirmedAt:
                  reservationStatus === ReservationStatus.CONFIRMED
                    ? new Date()
                    : null,
              },
            },
          })),
        },
      },
      include: { items: true },
    });
  }

  it('issues one ISSUED Ticket with sequence 1 for quantity 1', async () => {
    const booking = await createBooking([1]);
    const result = await tickets.issueTicketsForBooking(booking.id);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      bookingItemId: booking.items[0]!.id,
      sequenceNo: 1,
      status: TicketStatus.ISSUED,
    });
  });

  it('issues exactly quantity Tickets with unique identities and sequences', async () => {
    const booking = await createBooking([3]);
    const result = await tickets.issueTicketsForBooking(booking.id);
    expect(result.map(({ sequenceNo }) => sequenceNo)).toEqual([1, 2, 3]);
    expect(new Set(result.map(({ id }) => id)).size).toBe(3);
    expect(new Set(result.map(({ ticketCode }) => ticketCode)).size).toBe(3);
    expect(new Set(result.map(({ tokenNonce }) => tokenNonce)).size).toBe(3);
  });

  it('issues all units for a multi-item Booking', async () => {
    const booking = await createBooking([2, 3]);
    const result = await tickets.issueTicketsForBooking(booking.id);
    expect(result).toHaveLength(5);
    expect(
      result.filter(
        ({ bookingItemId }) => bookingItemId === booking.items[0]!.id,
      ),
    ).toHaveLength(2);
    expect(
      result.filter(
        ({ bookingItemId }) => bookingItemId === booking.items[1]!.id,
      ),
    ).toHaveLength(3);
  });

  it.each([
    BookingStatus.PENDING_PAYMENT,
    BookingStatus.EXPIRED,
    BookingStatus.CANCELLED,
  ])('rejects issuance for a %s Booking', async (status) => {
    const booking = await createBooking([2], status);
    await expect(tickets.issueTicketsForBooking(booking.id)).rejects.toThrow(
      'Tickets can only be issued for a confirmed Booking',
    );
    await expect(
      prisma.ticket.count({
        where: { bookingItem: { bookingId: booking.id } },
      }),
    ).resolves.toBe(0);
  });

  it('rejects a confirmed Booking with a mismatched Reservation quantity', async () => {
    const booking = await createBooking([2]);
    await prisma.reservation.update({
      where: { bookingItemId: booking.items[0]!.id },
      data: { quantity: 1 },
    });

    await expect(tickets.issueTicketsForBooking(booking.id)).rejects.toThrow(
      'Confirmed Booking has inconsistent Reservation state',
    );
    await expect(
      prisma.ticket.count({
        where: { bookingItem: { bookingId: booking.id } },
      }),
    ).resolves.toBe(0);
  });

  it('is idempotent and preserves existing credentials and issuedAt', async () => {
    const booking = await createBooking([3]);
    const first = await tickets.issueTicketsForBooking(booking.id);
    const second = await tickets.issueTicketsForBooking(booking.id);
    expect(second).toEqual(first);
  });

  it('serializes concurrent issuance and creates no duplicate units', async () => {
    const booking = await createBooking([2, 3]);
    const results = await Promise.allSettled([
      tickets.issueTicketsForBooking(booking.id),
      tickets.issueTicketsForBooking(booking.id),
      tickets.issueTicketsForBooking(booking.id),
    ]);
    expect(results.every(({ status }) => status === 'fulfilled')).toBe(true);
    const stored = await tickets.getTicketsForBooking(booking.id);
    expect(stored).toHaveLength(5);
    expect(
      new Set(
        stored.map(
          ({ bookingItemId, sequenceNo }) => `${bookingItemId}:${sequenceNo}`,
        ),
      ).size,
    ).toBe(5);
  });

  it('enforces positive values and all credential uniqueness constraints', async () => {
    const booking = await createBooking([1]);
    const itemId = booking.items[0]!.id;
    const base = {
      bookingItemId: itemId,
      sequenceNo: 1,
      ticketCode: `GBT-${run.toUpperCase()}-A`,
      tokenNonce: `${run}abcdefghijklmnopqrstuv`,
    };

    await prisma.ticket.create({ data: base });
    await expect(
      prisma.ticket.create({
        data: {
          ...base,
          ticketCode: `GBT-${run}-B`,
          tokenNonce: `${run}BBBBBBBBBBBBBBBBBBBBBB`,
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.ticket.create({
        data: {
          ...base,
          sequenceNo: 2,
          tokenNonce: `${run}CCCCCCCCCCCCCCCCCCCCCC`,
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.ticket.create({
        data: { ...base, sequenceNo: 2, ticketCode: `GBT-${run}-C` },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.ticket.create({
        data: {
          ...base,
          sequenceNo: 0,
          ticketCode: `GBT-${run}-ZERO`,
          tokenNonce: `${run}DDDDDDDDDDDDDDDDDDDDDD`,
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.ticket.create({
        data: {
          ...base,
          sequenceNo: 2,
          ticketCode: `GBT-${run}-VERSION`,
          tokenNonce: `${run}EEEEEEEEEEEEEEEEEEEEEE`,
          tokenVersion: 0,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it('does not mutate Payment, Reservation quantity, or Slot capacity', async () => {
    const booking = await createBooking([2]);
    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        status: PaymentStatus.SUCCEEDED,
        amount: booking.totalAmount,
        succeededAt: new Date(),
      },
    });
    const beforeSlot = await prisma.slot.findUniqueOrThrow({
      where: { id: slotId },
    });
    const beforeReservation = await prisma.reservation.findUniqueOrThrow({
      where: { bookingItemId: booking.items[0]!.id },
    });

    await tickets.issueTicketsForBooking(booking.id);

    expect(
      await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).toEqual(payment);
    expect(
      await prisma.slot.findUniqueOrThrow({ where: { id: slotId } }),
    ).toEqual(beforeSlot);
    expect(
      await prisma.reservation.findUniqueOrThrow({
        where: { bookingItemId: booking.items[0]!.id },
      }),
    ).toEqual(beforeReservation);
  });
});
