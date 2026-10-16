import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BookingStatus,
  ServiceKind,
  SlotStatus,
  TicketStatus,
} from '../generated/prisma/client.js';
import type { PrismaService } from '../database/prisma/prisma.service.js';
import type { TicketTokenService } from './ticket-token.service.js';
import { TicketCheckInService } from './ticket-check-in.service.js';
import { TicketValidationReason } from './ticket-validation.constants.js';
import type {
  TicketValidationAssessment,
  TicketValidationContext,
  TicketValidationService,
} from './ticket-validation.service.js';

const NOW = new Date('2026-10-12T03:00:00.000Z');
const ACTOR_ID = '10000000-0000-4000-8000-000000000001';
const VENDOR_ID = '20000000-0000-4000-8000-000000000001';
const TICKET_ID = '30000000-0000-4000-8000-000000000001';

function context(
  overrides: Partial<{
    ticketStatus: TicketStatus;
    checkedInAt: Date | null;
    bookingStatus: BookingStatus;
    slotStatus: SlotStatus;
  }> = {},
): TicketValidationContext {
  return {
    id: TICKET_ID,
    ticketCode: 'GBT-UNIT-1',
    sequenceNo: 1,
    status: overrides.ticketStatus ?? TicketStatus.ISSUED,
    checkedInAt: overrides.checkedInAt ?? null,
    bookingItem: {
      serviceTitleSnapshot: 'Unit Workshop',
      slotStartAtSnapshot: new Date('2026-10-12T02:00:00.000Z'),
      slotEndAtSnapshot: new Date('2026-10-12T04:00:00.000Z'),
      booking: {
        id: '40000000-0000-4000-8000-000000000001',
        bookingCode: 'GBK-UNIT-1',
        status: overrides.bookingStatus ?? BookingStatus.CONFIRMED,
        vendorId: VENDOR_ID,
      },
      service: {
        id: '50000000-0000-4000-8000-000000000001',
        vendorId: VENDOR_ID,
        kind: ServiceKind.EVENT,
        deletedAt: null,
      },
      slot: {
        id: '60000000-0000-4000-8000-000000000001',
        serviceId: '50000000-0000-4000-8000-000000000001',
        startAt: new Date('2026-10-12T02:00:00.000Z'),
        endAt: new Date('2026-10-12T04:00:00.000Z'),
        status: overrides.slotStatus ?? SlotStatus.OPEN,
        deletedAt: null,
      },
    },
  };
}

function assessment(
  reason = TicketValidationReason.VALID,
): TicketValidationAssessment {
  return {
    valid: reason === TicketValidationReason.VALID,
    checkInEligible: reason === TicketValidationReason.VALID,
    reason,
  };
}

function setup(
  input: {
    current?: TicketValidationContext;
    decision?: TicketValidationAssessment;
    updateCount?: number;
    invalidToken?: boolean;
    ownershipError?: boolean;
  } = {},
) {
  const current = input.current ?? context();
  const updateMany = vi
    .fn()
    .mockResolvedValue({ count: input.updateCount ?? 1 });
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: TICKET_ID }]),
    ticket: {
      findUnique: vi.fn().mockResolvedValue(current),
      updateMany,
    },
  };
  const runTransaction = vi.fn(
    async (callback: (client: typeof transaction) => unknown) =>
      callback(transaction),
  );
  const prisma = {
    $transaction: runTransaction,
  } as unknown as PrismaService;
  const verifyAndResolveToken = input.invalidToken
    ? vi.fn().mockRejectedValue(new UnauthorizedException())
    : vi.fn().mockResolvedValue({ id: TICKET_ID });
  const ticketTokens = {
    verifyAndResolveToken,
  } as unknown as TicketTokenService;
  const validation = {
    requireApprovedVendorId: vi.fn().mockResolvedValue(VENDOR_ID),
    findContext: vi.fn().mockResolvedValue(current),
    assertVendorOwnership: input.ownershipError
      ? vi.fn(() => {
          throw new ForbiddenException('Ticket belongs to another Vendor');
        })
      : vi.fn(),
    databaseNow: vi.fn().mockResolvedValue(NOW),
    assessContextBeforeTime: vi
      .fn()
      .mockReturnValue(
        input.decision?.reason === TicketValidationReason.VALID
          ? null
          : (input.decision ?? null),
      ),
    assessContext: vi.fn().mockReturnValue(input.decision ?? assessment()),
  } as unknown as TicketValidationService;
  return {
    service: new TicketCheckInService(prisma, ticketTokens, validation),
    transaction,
    prisma,
    ticketTokens,
    validation,
    updateMany,
    runTransaction,
    verifyAndResolveToken,
  };
}

describe('TicketCheckInService', () => {
  it('atomically stores CHECKED_IN, database time, and the authenticated actor', async () => {
    const { service, updateMany, verifyAndResolveToken } = setup();

    await expect(
      service.checkIn({ token: 'opaque', actorUserId: ACTOR_ID }),
    ).resolves.toMatchObject({
      success: true,
      ticket: {
        id: TICKET_ID,
        status: TicketStatus.CHECKED_IN,
        checkedInAt: NOW.toISOString(),
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: TICKET_ID, status: TicketStatus.ISSUED },
      data: {
        status: TicketStatus.CHECKED_IN,
        checkedInAt: NOW,
        checkedInByUserId: ACTOR_ID,
      },
    });
    expect(verifyAndResolveToken).toHaveBeenCalledTimes(2);
  });

  it('locks Booking before Ticket to serialize check-in against cancellation', async () => {
    const { service, transaction } = setup();

    await service.checkIn({ token: 'opaque', actorUserId: ACTOR_ID });

    const rawCalls = transaction.$queryRaw.mock.calls as Array<
      [{ strings: readonly string[] }]
    >;
    expect(rawCalls).toHaveLength(2);
    expect(rawCalls[0]![0].strings.join(' ')).toContain('"bookings"');
    expect(rawCalls[1]![0].strings.join(' ')).toContain('"tickets"');
  });

  it('rejects malformed credentials without opening a transaction', async () => {
    const { service, runTransaction } = setup({ invalidToken: true });

    await expect(
      service.checkIn({ token: 'tampered', actorUserId: ACTOR_ID }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: TicketValidationReason.INVALID_TOKEN },
    } satisfies Partial<BadRequestException>);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it.each([
    TicketValidationReason.TICKET_VOIDED,
    TicketValidationReason.ALREADY_CHECKED_IN,
    TicketValidationReason.BOOKING_CANCELLED,
    TicketValidationReason.BOOKING_EXPIRED,
    TicketValidationReason.SLOT_CANCELLED,
    TicketValidationReason.SLOT_EXPIRED,
    TicketValidationReason.SLOT_NOT_STARTED,
  ])('rejects %s without mutating the Ticket', async (reason) => {
    const checkedInAt = new Date('2026-10-12T02:30:00.000Z');
    const current = context({
      ticketStatus:
        reason === TicketValidationReason.ALREADY_CHECKED_IN
          ? TicketStatus.CHECKED_IN
          : reason === TicketValidationReason.TICKET_VOIDED
            ? TicketStatus.VOIDED
            : TicketStatus.ISSUED,
      checkedInAt:
        reason === TicketValidationReason.ALREADY_CHECKED_IN
          ? checkedInAt
          : null,
    });
    const { service, updateMany } = setup({
      current,
      decision: {
        valid: reason === TicketValidationReason.ALREADY_CHECKED_IN,
        checkInEligible: false,
        reason,
      },
    });

    await expect(
      service.checkIn({ token: 'opaque', actorUserId: ACTOR_ID }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects another Vendor before acquiring a Ticket row lock', async () => {
    const { service, runTransaction } = setup({ ownershipError: true });

    await expect(
      service.checkIn({ token: 'opaque', actorUserId: ACTOR_ID }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(runTransaction).not.toHaveBeenCalled();
  });
});
