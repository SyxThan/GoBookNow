import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BookingStatus,
  Prisma,
  SlotStatus,
  TicketStatus,
  VendorStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { TicketValidationResultDto } from './dto/ticket-validation.dto.js';
import { TicketTokenService } from './ticket-token.service.js';
import { TicketValidationReason } from './ticket-validation.constants.js';

const validationContextSelect = {
  id: true,
  ticketCode: true,
  sequenceNo: true,
  status: true,
  checkedInAt: true,
  bookingItem: {
    select: {
      serviceTitleSnapshot: true,
      slotStartAtSnapshot: true,
      slotEndAtSnapshot: true,
      booking: {
        select: {
          id: true,
          bookingCode: true,
          status: true,
          vendorId: true,
        },
      },
      service: {
        select: {
          id: true,
          vendorId: true,
          kind: true,
          deletedAt: true,
        },
      },
      slot: {
        select: {
          id: true,
          serviceId: true,
          startAt: true,
          endAt: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  },
} as const satisfies Prisma.TicketSelect;

type ValidationContext = Prisma.TicketGetPayload<{
  select: typeof validationContextSelect;
}>;
type DbNowRow = { now: Date };

@Injectable()
export class TicketValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketTokens: TicketTokenService,
  ) {}

  async validateTokenForVendor(input: {
    token: string;
    actorUserId: string;
  }): Promise<TicketValidationResultDto> {
    const vendor = await this.prisma.vendor.findFirst({
      where: {
        ownerUserId: input.actorUserId,
        status: VendorStatus.APPROVED,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!vendor) throw new ForbiddenException('Approved Vendor is required');

    let ticketId: string;
    try {
      ticketId = (await this.ticketTokens.verifyAndResolveToken(input.token))
        .id;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) return this.invalidToken();
      throw error;
    }

    const context = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: validationContextSelect,
    });
    if (!context) {
      return this.decision(
        true,
        false,
        false,
        TicketValidationReason.TICKET_NOT_FOUND,
      );
    }

    if (context.bookingItem.booking.vendorId !== vendor.id) {
      throw new ForbiddenException('Ticket does not belong to this Vendor');
    }

    const result = this.withContext(context);
    if (
      context.bookingItem.service.vendorId !== vendor.id ||
      context.bookingItem.slot.serviceId !== context.bookingItem.service.id ||
      context.bookingItem.service.deletedAt ||
      context.bookingItem.slot.deletedAt
    ) {
      return result(
        false,
        false,
        TicketValidationReason.INCONSISTENT_TICKET_DATA,
      );
    }

    if (context.status === TicketStatus.VOIDED) {
      return result(false, false, TicketValidationReason.TICKET_VOIDED);
    }

    const bookingReason = this.bookingFailureReason(
      context.bookingItem.booking.status,
    );
    if (bookingReason) return result(false, false, bookingReason);

    if (context.bookingItem.slot.status === SlotStatus.CANCELLED) {
      return result(false, false, TicketValidationReason.SLOT_CANCELLED);
    }

    if (context.status === TicketStatus.CHECKED_IN) {
      return result(true, false, TicketValidationReason.ALREADY_CHECKED_IN);
    }

    const now = await this.databaseNow();
    if (now >= context.bookingItem.slot.endAt) {
      return result(false, false, TicketValidationReason.SLOT_EXPIRED);
    }
    if (now < context.bookingItem.slot.startAt) {
      return result(true, false, TicketValidationReason.SLOT_NOT_STARTED);
    }

    return result(true, true, TicketValidationReason.VALID);
  }

  private invalidToken(): TicketValidationResultDto {
    return this.decision(
      false,
      false,
      false,
      TicketValidationReason.INVALID_TOKEN,
    );
  }

  private bookingFailureReason(
    status: BookingStatus,
  ): TicketValidationReason | null {
    if (status === BookingStatus.CANCELLED) {
      return TicketValidationReason.BOOKING_CANCELLED;
    }
    if (status === BookingStatus.EXPIRED) {
      return TicketValidationReason.BOOKING_EXPIRED;
    }
    if (status !== BookingStatus.CONFIRMED) {
      return TicketValidationReason.BOOKING_NOT_CONFIRMED;
    }
    return null;
  }

  private withContext(context: ValidationContext) {
    return (
      valid: boolean,
      checkInEligible: boolean,
      reason: TicketValidationReason,
    ): TicketValidationResultDto =>
      this.decision(true, valid, checkInEligible, reason, context);
  }

  private decision(
    authentic: boolean,
    valid: boolean,
    checkInEligible: boolean,
    reason: TicketValidationReason,
    context?: ValidationContext,
  ): TicketValidationResultDto {
    if (!context) return { authentic, valid, checkInEligible, reason };

    const item = context.bookingItem;
    return {
      authentic,
      valid,
      checkInEligible,
      reason,
      ticket: {
        id: context.id,
        ticketCode: context.ticketCode,
        status: context.status,
        sequenceNo: context.sequenceNo,
        checkedInAt: context.checkedInAt?.toISOString() ?? null,
      },
      booking: {
        id: item.booking.id,
        bookingCode: item.booking.bookingCode,
        status: item.booking.status,
      },
      service: {
        id: item.service.id,
        title: item.serviceTitleSnapshot,
        kind: item.service.kind,
      },
      slot: {
        id: item.slot.id,
        startAt: item.slotStartAtSnapshot.toISOString(),
        endAt: item.slotEndAtSnapshot.toISOString(),
        status: item.slot.status,
      },
    };
  }

  private async databaseNow(): Promise<Date> {
    const [row] = await this.prisma.$queryRaw<DbNowRow[]>`
      SELECT NOW() AS "now"
    `;
    if (!row) throw new Error('Database did not return its current time');
    return row.now;
  }
}
