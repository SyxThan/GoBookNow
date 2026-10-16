import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, TicketStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { TicketCheckInResultDto } from './dto/ticket-check-in.dto.js';
import { TicketTokenService } from './ticket-token.service.js';
import { TicketValidationReason } from './ticket-validation.constants.js';
import {
  type TicketValidationContext,
  TicketValidationService,
} from './ticket-validation.service.js';

type LockedTicketRow = { id: string };

const CHECK_IN_MESSAGES: Record<TicketValidationReason, string> = {
  [TicketValidationReason.VALID]: 'Ticket is eligible for check-in.',
  [TicketValidationReason.INVALID_TOKEN]: 'Ticket credential is invalid.',
  [TicketValidationReason.TICKET_NOT_FOUND]: 'Ticket credential is invalid.',
  [TicketValidationReason.TICKET_VOIDED]: 'Voided Ticket cannot be checked in.',
  [TicketValidationReason.ALREADY_CHECKED_IN]:
    'Ticket has already been checked in.',
  [TicketValidationReason.BOOKING_NOT_CONFIRMED]:
    'Ticket Booking is not confirmed.',
  [TicketValidationReason.BOOKING_CANCELLED]:
    'Ticket Booking has been cancelled.',
  [TicketValidationReason.BOOKING_EXPIRED]: 'Ticket Booking has expired.',
  [TicketValidationReason.SLOT_CANCELLED]: 'Ticket Slot has been cancelled.',
  [TicketValidationReason.SLOT_EXPIRED]: 'Ticket Slot has expired.',
  [TicketValidationReason.SLOT_NOT_STARTED]: 'Ticket Slot has not started yet.',
  [TicketValidationReason.INCONSISTENT_TICKET_DATA]:
    'Ticket data is inconsistent.',
};

@Injectable()
export class TicketCheckInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketTokens: TicketTokenService,
    private readonly validation: TicketValidationService,
  ) {}

  async checkIn(input: {
    token: string;
    actorUserId: string;
  }): Promise<TicketCheckInResultDto> {
    const vendorId = await this.validation.requireApprovedVendorId(
      input.actorUserId,
    );
    const ticketId = await this.resolveTicketId(input.token);

    // Reject cross-Vendor requests before they can contend for another
    // Vendor's Ticket row. Ownership is checked again under the lock below.
    const preliminaryContext = await this.validation.findContext(ticketId);
    if (!preliminaryContext) throw this.invalidToken();
    this.validation.assertVendorOwnership(preliminaryContext, vendorId);
    const bookingId = preliminaryContext.bookingItem.booking.id;

    return this.prisma.$transaction(async (transaction) => {
      const lockedBooking = await transaction.$queryRaw<LockedTicketRow[]>(
        Prisma.sql`
          SELECT "id"
          FROM "bookings"
          WHERE "id" = ${bookingId}::uuid
          FOR UPDATE
        `,
      );
      if (!lockedBooking[0]) throw this.invalidToken();

      const lockedTicket = await transaction.$queryRaw<
        LockedTicketRow[]
      >(Prisma.sql`
        SELECT "id"
        FROM "tickets"
        WHERE "id" = ${ticketId}::uuid
        FOR UPDATE
      `);
      if (!lockedTicket[0]) throw this.invalidToken();

      try {
        await this.ticketTokens.verifyAndResolveToken(input.token, transaction);
      } catch (error: unknown) {
        if (error instanceof UnauthorizedException) throw this.invalidToken();
        throw error;
      }

      const context = await this.validation.findContext(ticketId, transaction);
      if (!context) throw this.invalidToken();

      const assessmentBeforeTime = this.validation.assessContextBeforeTime(
        context,
        vendorId,
      );
      if (assessmentBeforeTime) {
        throw this.conflict(assessmentBeforeTime.reason, context);
      }

      const now = await this.validation.databaseNow(transaction);
      const assessment = this.validation.assessContext(context, vendorId, now);
      if (!assessment.checkInEligible) {
        throw this.conflict(assessment.reason, context);
      }

      const transition = await transaction.ticket.updateMany({
        where: { id: ticketId, status: TicketStatus.ISSUED },
        data: {
          status: TicketStatus.CHECKED_IN,
          checkedInAt: now,
          checkedInByUserId: input.actorUserId,
        },
      });
      if (transition.count !== 1) {
        const current = await this.validation.findContext(
          ticketId,
          transaction,
        );
        throw this.conflict(
          current?.status === TicketStatus.CHECKED_IN
            ? TicketValidationReason.ALREADY_CHECKED_IN
            : TicketValidationReason.INCONSISTENT_TICKET_DATA,
          current ?? context,
        );
      }

      return this.result(context, now);
    });
  }

  private async resolveTicketId(token: string): Promise<string> {
    try {
      return (await this.ticketTokens.verifyAndResolveToken(token)).id;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw this.invalidToken();
      throw error;
    }
  }

  private invalidToken(): BadRequestException {
    return new BadRequestException({
      code: TicketValidationReason.INVALID_TOKEN,
      message: CHECK_IN_MESSAGES[TicketValidationReason.INVALID_TOKEN],
    });
  }

  private conflict(
    reason: TicketValidationReason,
    context: TicketValidationContext,
  ): ConflictException {
    return new ConflictException({
      code: reason,
      message: CHECK_IN_MESSAGES[reason],
      ...(reason === TicketValidationReason.ALREADY_CHECKED_IN &&
      context.checkedInAt
        ? { checkedInAt: context.checkedInAt.toISOString() }
        : {}),
    });
  }

  private result(
    context: TicketValidationContext,
    checkedInAt: Date,
  ): TicketCheckInResultDto {
    const item = context.bookingItem;
    return {
      success: true,
      ticket: {
        id: context.id,
        ticketCode: context.ticketCode,
        status: TicketStatus.CHECKED_IN,
        sequenceNo: context.sequenceNo,
        checkedInAt: checkedInAt.toISOString(),
      },
      booking: { bookingCode: item.booking.bookingCode },
      service: {
        title: item.serviceTitleSnapshot,
        kind: item.service.kind,
      },
      slot: {
        startAt: item.slotStartAtSnapshot.toISOString(),
        endAt: item.slotEndAtSnapshot.toISOString(),
      },
    };
  }
}
