import { ConflictException } from '@nestjs/common';
import {
  BookingStatus,
  PaymentStatus,
  ReservationStatus,
  TicketStatus,
} from '../../generated/prisma/client.js';
import type { PrismaService } from '../../database/prisma/prisma.service.js';
import type { RefundService } from '../../refunds/refund.service.js';
import { BookingCancellationService } from './booking-cancellation.service.js';

const NOW = new Date('2026-10-16T03:00:00.000Z');
const CUSTOMER_ID = '10000000-0000-4000-8000-000000000001';
const BOOKING_ID = '20000000-0000-4000-8000-000000000001';

function aggregate(
  overrides: Partial<{
    policy: unknown;
    ticketStatus: TicketStatus;
  }> = {},
) {
  const amounts = [300_000n, 200_000n, 200_000n];
  const starts = [2_880, 120, 30];
  return {
    id: BOOKING_ID,
    customerId: CUSTOMER_ID,
    status: BookingStatus.CONFIRMED,
    currency: 'VND',
    totalAmount: 700_000n,
    cancellationPolicySnapshot:
      'policy' in overrides
        ? overrides.policy
        : {
            version: 1,
            policyCode: 'UNIT_V1',
            tiers: [
              { minMinutesBeforeStart: 1_440, refundBps: 10_000 },
              { minMinutesBeforeStart: 60, refundBps: 5_000 },
              { minMinutesBeforeStart: 0, refundBps: 0 },
            ],
            afterStart: { cancellationAllowed: false, refundBps: 0 },
          },
    payment: {
      id: '30000000-0000-4000-8000-000000000001',
      status: PaymentStatus.SUCCEEDED,
      amount: 700_000n,
      currency: 'VND',
    },
    items: amounts.map((amount, index) => ({
      id: `40000000-0000-4000-8000-00000000000${index + 1}`,
      subtotalAmount: amount,
      voucherDiscountAmount: 0n,
      slotStartAtSnapshot: new Date(NOW.getTime() + starts[index]! * 60_000),
      reservation: {
        id: `50000000-0000-4000-8000-00000000000${index + 1}`,
        status: ReservationStatus.CONFIRMED,
      },
      tickets: [
        {
          id: `60000000-0000-4000-8000-00000000000${index + 1}`,
          status: overrides.ticketStatus ?? TicketStatus.ISSUED,
        },
      ],
    })),
  };
}

function setup(booking = aggregate()) {
  const transaction = {
    booking: { findUnique: vi.fn().mockResolvedValue(booking) },
    $queryRaw: vi.fn().mockResolvedValue([{ now: NOW }]),
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;
  const refunds = {} as RefundService;
  return {
    service: new BookingCancellationService(prisma, refunds),
    transaction,
  };
}

describe('BookingCancellationService preview', () => {
  it('uses DB time and immutable item snapshots for the multi-slot breakdown', async () => {
    const { service, transaction } = setup();

    await expect(service.preview(CUSTOMER_ID, BOOKING_ID)).resolves.toEqual(
      expect.objectContaining({
        bookingId: BOOKING_ID,
        cancellationAllowed: true,
        reason: 'PARTIAL_REFUND',
        originalAmount: '700000',
        refundAmount: '400000',
        cancellationFeeAmount: '300000',
        policyVersion: 1,
      }),
    );
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.booking.findUnique).toHaveBeenCalledTimes(1);
    expect(Object.keys(transaction)).toEqual(['booking', '$queryRaw']);
  });

  it('bases a voucher Booking refund on net item amounts actually paid', async () => {
    const booking = aggregate();
    booking.items = booking.items.slice(0, 2);
    booking.items[0]!.voucherDiscountAmount = 36_000n;
    booking.items[1]!.voucherDiscountAmount = 24_000n;
    booking.totalAmount = 440_000n;
    booking.payment.amount = 440_000n;
    const { service } = setup(booking);
    await expect(service.preview(CUSTOMER_ID, BOOKING_ID)).resolves.toEqual(
      expect.objectContaining({
        originalAmount: '440000',
        refundAmount: '352000',
        cancellationFeeAmount: '88000',
      }),
    );
  });

  it('rejects legacy data without a cancellation policy snapshot', async () => {
    const { service } = setup(aggregate({ policy: null }));

    await expect(
      service.preview(CUSTOMER_ID, BOOKING_ID),
    ).rejects.toMatchObject({
      response: { code: 'POLICY_SNAPSHOT_MISSING' },
    } satisfies Partial<ConflictException>);
  });

  it('rejects the whole Booking when any Ticket is already checked in', async () => {
    const { service } = setup(
      aggregate({ ticketStatus: TicketStatus.CHECKED_IN }),
    );

    await expect(
      service.preview(CUSTOMER_ID, BOOKING_ID),
    ).rejects.toMatchObject({
      response: { code: 'TICKET_ALREADY_USED' },
    } satisfies Partial<ConflictException>);
  });
});
