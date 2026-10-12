import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma/prisma.service.js';
import {
  BookingStatus,
  ServiceKind,
  SlotStatus,
  TicketStatus,
} from '../generated/prisma/client.js';
import type { TicketTokenService } from './ticket-token.service.js';
import { TicketValidationReason } from './ticket-validation.constants.js';
import { TicketValidationService } from './ticket-validation.service.js';

const NOW = new Date('2026-10-12T03:00:00.000Z');
const START = new Date('2026-10-12T02:00:00.000Z');
const END = new Date('2026-10-12T04:00:00.000Z');

function context(
  overrides: {
    ticketStatus?: TicketStatus;
    checkedInAt?: Date | null;
    bookingStatus?: BookingStatus;
    bookingVendorId?: string;
    serviceVendorId?: string;
    serviceKind?: ServiceKind;
    slotStatus?: SlotStatus;
    slotStartAt?: Date;
    slotEndAt?: Date;
    slotServiceId?: string;
    serviceDeletedAt?: Date | null;
    slotDeletedAt?: Date | null;
  } = {},
) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    ticketCode: 'GBT-VALIDATION',
    sequenceNo: 1,
    status: overrides.ticketStatus ?? TicketStatus.ISSUED,
    checkedInAt: overrides.checkedInAt ?? null,
    bookingItem: {
      serviceTitleSnapshot: 'Original Workshop',
      slotStartAtSnapshot: START,
      slotEndAtSnapshot: END,
      booking: {
        id: '22222222-2222-4222-8222-222222222222',
        bookingCode: 'GBK-VALIDATION',
        status: overrides.bookingStatus ?? BookingStatus.CONFIRMED,
        vendorId: overrides.bookingVendorId ?? 'vendor-a',
      },
      service: {
        id: 'service-a',
        vendorId: overrides.serviceVendorId ?? 'vendor-a',
        kind: overrides.serviceKind ?? ServiceKind.EVENT,
        deletedAt: overrides.serviceDeletedAt ?? null,
      },
      slot: {
        id: 'slot-a',
        serviceId: overrides.slotServiceId ?? 'service-a',
        startAt: overrides.slotStartAt ?? START,
        endAt: overrides.slotEndAt ?? END,
        status: overrides.slotStatus ?? SlotStatus.OPEN,
        deletedAt: overrides.slotDeletedAt ?? null,
      },
    },
  };
}

function setup(ticketContext = context()) {
  const findVendor = vi.fn().mockResolvedValue({ id: 'vendor-a' });
  const findTicket = vi.fn().mockResolvedValue(ticketContext);
  const databaseNow = vi.fn().mockResolvedValue([{ now: NOW }]);
  const verifyAndResolveToken = vi.fn().mockResolvedValue({
    id: ticketContext.id,
  });
  const prisma = {
    vendor: { findFirst: findVendor },
    ticket: { findUnique: findTicket },
    $queryRaw: databaseNow,
  } as unknown as PrismaService;
  const tokens = {
    verifyAndResolveToken,
  } as unknown as TicketTokenService;
  return {
    service: new TicketValidationService(prisma, tokens),
    findVendor,
    findTicket,
    databaseNow,
    verifyAndResolveToken,
  };
}

describe('TicketValidationService', () => {
  it('returns VALID for an owned ISSUED Ticket in an active OPEN Slot', async () => {
    const { service, findVendor, verifyAndResolveToken } = setup();

    await expect(
      service.validateTokenForVendor({
        token: 'opaque-token',
        actorUserId: 'vendor-owner-a',
      }),
    ).resolves.toMatchObject({
      authentic: true,
      valid: true,
      checkInEligible: true,
      reason: TicketValidationReason.VALID,
      ticket: { ticketCode: 'GBT-VALIDATION', status: TicketStatus.ISSUED },
      booking: { bookingCode: 'GBK-VALIDATION' },
      service: {
        title: 'Original Workshop',
        kind: ServiceKind.EVENT,
      },
      slot: { status: SlotStatus.OPEN },
    });
    expect(findVendor).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerUserId: 'vendor-owner-a',
          status: 'APPROVED',
          deletedAt: null,
        }),
      }),
    );
    expect(verifyAndResolveToken).toHaveBeenCalledWith('opaque-token');
  });

  it.each(['malformed', 'tampered-signature', 'tampered-nonce', 'unknown'])(
    'returns a metadata-free INVALID_TOKEN result for %s credentials',
    async () => {
      const fixture = setup();
      fixture.verifyAndResolveToken.mockRejectedValue(
        new UnauthorizedException('Invalid ticket token'),
      );

      const result = await fixture.service.validateTokenForVendor({
        token: 'sensitive-input',
        actorUserId: 'vendor-owner-a',
      });
      expect(result).toEqual({
        authentic: false,
        valid: false,
        checkInEligible: false,
        reason: TicketValidationReason.INVALID_TOKEN,
      });
      expect(fixture.findTicket).not.toHaveBeenCalled();
    },
  );

  it('requires an approved Vendor profile before verifying credentials', async () => {
    const fixture = setup();
    fixture.findVendor.mockResolvedValue(null);

    await expect(
      fixture.service.validateTokenForVendor({
        token: 'opaque-token',
        actorUserId: 'draft-vendor-owner',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.verifyAndResolveToken).not.toHaveBeenCalled();
  });

  it('blocks a different Vendor without returning Ticket context', async () => {
    const fixture = setup(context({ bookingVendorId: 'vendor-b' }));

    await expect(
      fixture.service.validateTokenForVendor({
        token: 'opaque-token',
        actorUserId: 'vendor-owner-a',
      }),
    ).rejects.toThrow('Ticket does not belong to this Vendor');
  });

  it('returns a metadata-free TICKET_NOT_FOUND result for a post-verification race', async () => {
    const fixture = setup();
    fixture.findTicket.mockResolvedValue(null);
    await expect(validate(fixture.service)).resolves.toEqual({
      authentic: true,
      valid: false,
      checkInEligible: false,
      reason: TicketValidationReason.TICKET_NOT_FOUND,
    });
  });

  it('returns TICKET_VOIDED for an authentic voided Ticket', async () => {
    const { service } = setup(context({ ticketStatus: TicketStatus.VOIDED }));
    await expect(validate(service)).resolves.toMatchObject({
      authentic: true,
      valid: false,
      checkInEligible: false,
      reason: TicketValidationReason.TICKET_VOIDED,
    });
  });

  it('returns ALREADY_CHECKED_IN without treating the Ticket as fake', async () => {
    const checkedInAt = new Date('2026-10-12T02:30:00.000Z');
    const fixture = setup(
      context({ ticketStatus: TicketStatus.CHECKED_IN, checkedInAt }),
    );
    const result = await validate(fixture.service);
    expect(result).toMatchObject({
      authentic: true,
      valid: true,
      checkInEligible: false,
      reason: TicketValidationReason.ALREADY_CHECKED_IN,
      ticket: { checkedInAt: checkedInAt.toISOString() },
    });
    expect(fixture.databaseNow).not.toHaveBeenCalled();
  });

  it.each([
    [BookingStatus.CANCELLED, TicketValidationReason.BOOKING_CANCELLED],
    [BookingStatus.EXPIRED, TicketValidationReason.BOOKING_EXPIRED],
    [
      BookingStatus.PENDING_PAYMENT,
      TicketValidationReason.BOOKING_NOT_CONFIRMED,
    ],
  ])('maps Booking %s to %s', async (bookingStatus, reason) => {
    const { service } = setup(context({ bookingStatus }));
    await expect(validate(service)).resolves.toMatchObject({
      authentic: true,
      valid: false,
      checkInEligible: false,
      reason,
    });
  });

  it('rejects a cancelled Slot', async () => {
    const { service } = setup(context({ slotStatus: SlotStatus.CANCELLED }));
    await expect(validate(service)).resolves.toMatchObject({
      valid: false,
      checkInEligible: false,
      reason: TicketValidationReason.SLOT_CANCELLED,
    });
  });

  it('uses database time to reject an elapsed Slot', async () => {
    const { service, databaseNow } = setup(
      context({ slotEndAt: new Date('2026-10-12T03:00:00.000Z') }),
    );
    await expect(validate(service)).resolves.toMatchObject({
      valid: false,
      checkInEligible: false,
      reason: TicketValidationReason.SLOT_EXPIRED,
    });
    expect(databaseNow).toHaveBeenCalledOnce();
  });

  it('keeps a future Slot valid but not yet eligible', async () => {
    const { service } = setup(
      context({ slotStartAt: new Date('2026-10-12T03:00:00.001Z') }),
    );
    await expect(validate(service)).resolves.toMatchObject({
      authentic: true,
      valid: true,
      checkInEligible: false,
      reason: TicketValidationReason.SLOT_NOT_STARTED,
    });
  });

  it('does not treat CLOSED booking availability as Slot cancellation', async () => {
    const { service } = setup(context({ slotStatus: SlotStatus.CLOSED }));
    await expect(validate(service)).resolves.toMatchObject({
      valid: true,
      checkInEligible: true,
      reason: TicketValidationReason.VALID,
      slot: { status: SlotStatus.CLOSED },
    });
  });

  it('returns SERVICE context without Event-only assumptions', async () => {
    const { service } = setup(context({ serviceKind: ServiceKind.SERVICE }));
    await expect(validate(service)).resolves.toMatchObject({
      reason: TicketValidationReason.VALID,
      service: { kind: ServiceKind.SERVICE },
    });
  });

  it.each([
    { serviceVendorId: 'vendor-b' },
    { slotServiceId: 'service-b' },
    { serviceDeletedAt: NOW },
    { slotDeletedAt: NOW },
  ])(
    'returns INCONSISTENT_TICKET_DATA for broken context %#',
    async (value) => {
      const { service } = setup(context(value));
      await expect(validate(service)).resolves.toMatchObject({
        valid: false,
        checkInEligible: false,
        reason: TicketValidationReason.INCONSISTENT_TICKET_DATA,
      });
    },
  );

  it('is repeatable and performs no write or state mutation', async () => {
    const ticketContext = context();
    const before = structuredClone(ticketContext);
    const fixture = setup(ticketContext);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => validate(fixture.service)),
    );
    expect(results.every((result) => result.reason === 'VALID')).toBe(true);
    expect(ticketContext).toEqual(before);
    expect(fixture.findTicket).toHaveBeenCalledTimes(5);
    expect(fixture.databaseNow).toHaveBeenCalledTimes(5);
  });
});

function validate(service: TicketValidationService) {
  return service.validateTokenForVendor({
    token: 'opaque-token',
    actorUserId: 'vendor-owner-a',
  });
}
