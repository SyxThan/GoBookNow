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

export const ticketValidationContextSelect = {
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

export type TicketValidationContext = Prisma.TicketGetPayload<{
  select: typeof ticketValidationContextSelect;
}>;
type DbNowRow = { now: Date };
export type TicketValidationClient = Pick<
  Prisma.TransactionClient,
  'vendor' | 'ticket' | '$queryRaw'
>;

export type TicketValidationAssessment = {
  valid: boolean;
  checkInEligible: boolean;
  reason: TicketValidationReason;
};

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
    const vendorId = await this.requireApprovedVendorId(input.actorUserId);

    let ticketId: string;
    try {
      ticketId = (await this.ticketTokens.verifyAndResolveToken(input.token))
        .id;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) return this.invalidToken();
      throw error;
    }

    const context = await this.findContext(ticketId);
    if (!context) {
      return this.decision(
        true,
        false,
        false,
        TicketValidationReason.TICKET_NOT_FOUND,
      );
    }

    const assessmentBeforeTime = this.assessContextBeforeTime(
      context,
      vendorId,
    );
    if (assessmentBeforeTime) {
      return this.toResult(context, assessmentBeforeTime);
    }

    const now = await this.databaseNow();
    const assessment = this.assessContext(context, vendorId, now);
    return this.toResult(context, assessment);
  }

  async requireApprovedVendorId(
    actorUserId: string,
    client: TicketValidationClient = this.prisma,
  ): Promise<string> {
    const vendor = await client.vendor.findFirst({
      where: {
        ownerUserId: actorUserId,
        status: VendorStatus.APPROVED,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!vendor) throw new ForbiddenException('Approved Vendor is required');
    return vendor.id;
  }

  findContext(
    ticketId: string,
    client: TicketValidationClient = this.prisma,
  ): Promise<TicketValidationContext | null> {
    return client.ticket.findUnique({
      where: { id: ticketId },
      select: ticketValidationContextSelect,
    });
  }

  assertVendorOwnership(
    context: TicketValidationContext,
    vendorId: string,
  ): void {
    if (context.bookingItem.booking.vendorId !== vendorId) {
      throw new ForbiddenException('Ticket does not belong to this Vendor');
    }
  }

  assessContext(
    context: TicketValidationContext,
    vendorId: string,
    now: Date,
  ): TicketValidationAssessment {
    const assessmentBeforeTime = this.assessContextBeforeTime(
      context,
      vendorId,
    );
    if (assessmentBeforeTime) return assessmentBeforeTime;

    if (now >= context.bookingItem.slot.endAt) {
      return this.assessment(TicketValidationReason.SLOT_EXPIRED);
    }
    if (now < context.bookingItem.slot.startAt) {
      return this.assessment(TicketValidationReason.SLOT_NOT_STARTED);
    }

    return this.assessment(TicketValidationReason.VALID);
  }

  assessContextBeforeTime(
    context: TicketValidationContext,
    vendorId: string,
  ): TicketValidationAssessment | null {
    this.assertVendorOwnership(context, vendorId);
    if (
      context.bookingItem.service.vendorId !== vendorId ||
      context.bookingItem.slot.serviceId !== context.bookingItem.service.id ||
      context.bookingItem.service.deletedAt ||
      context.bookingItem.slot.deletedAt
    ) {
      return this.assessment(TicketValidationReason.INCONSISTENT_TICKET_DATA);
    }

    if (context.status === TicketStatus.VOIDED) {
      return this.assessment(TicketValidationReason.TICKET_VOIDED);
    }

    const bookingReason = this.bookingFailureReason(
      context.bookingItem.booking.status,
    );
    if (bookingReason) return this.assessment(bookingReason);

    if (context.bookingItem.slot.status === SlotStatus.CANCELLED) {
      return this.assessment(TicketValidationReason.SLOT_CANCELLED);
    }

    if (context.status === TicketStatus.CHECKED_IN) {
      return this.assessment(TicketValidationReason.ALREADY_CHECKED_IN);
    }
    return null;
  }

  toResult(
    context: TicketValidationContext,
    assessment: TicketValidationAssessment,
  ): TicketValidationResultDto {
    return this.decision(
      true,
      assessment.valid,
      assessment.checkInEligible,
      assessment.reason,
      context,
    );
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

  private assessment(
    reason: TicketValidationReason,
  ): TicketValidationAssessment {
    return {
      valid:
        reason === TicketValidationReason.VALID ||
        reason === TicketValidationReason.SLOT_NOT_STARTED ||
        reason === TicketValidationReason.ALREADY_CHECKED_IN,
      checkInEligible: reason === TicketValidationReason.VALID,
      reason,
    };
  }

  private decision(
    authentic: boolean,
    valid: boolean,
    checkInEligible: boolean,
    reason: TicketValidationReason,
    context?: TicketValidationContext,
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

  async databaseNow(
    client: TicketValidationClient = this.prisma,
  ): Promise<Date> {
    const [row] = await client.$queryRaw<DbNowRow[]>`
      SELECT NOW() AS "now"
    `;
    if (!row) throw new Error('Database did not return its current time');
    return row.now;
  }
}
