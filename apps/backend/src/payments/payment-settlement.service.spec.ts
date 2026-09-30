import { Logger } from '@nestjs/common';
import type { PrismaService } from '../database/prisma/prisma.service.js';
import {
  BookingStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentStatus,
  ReservationStatus,
} from '../generated/prisma/client.js';
import {
  type PaymentSettlementInput,
  PaymentSettlementService,
} from './payment-settlement.service.js';

const NOW = new Date('2026-10-01T00:00:00.000Z');
const FUTURE = new Date('2026-10-01T00:10:00.000Z');
const PAST = new Date('2026-09-30T23:59:00.000Z');

type TestReservation = {
  id: string;
  status: ReservationStatus;
  expiresAt: Date | null;
  confirmedAt: Date | null;
};

type TestState = {
  attempt: {
    id: string;
    paymentId: string;
    provider: PaymentProvider;
    status: PaymentAttemptStatus;
    amount: bigint;
    currency: string;
    providerTransactionId: string | null;
    expiresAt: Date | null;
    succeededAt: Date | null;
  };
  payment: {
    id: string;
    bookingId: string;
    status: PaymentStatus;
    amount: bigint;
    currency: string;
    succeededAt: Date | null;
    booking: {
      id: string;
      status: BookingStatus;
      totalAmount: bigint;
      currency: string;
      expiresAt: Date | null;
      confirmedAt: Date | null;
      expiredAt: Date | null;
      items: Array<{
        id: string;
        reservation: TestReservation | null;
      }>;
    };
  };
  slotCapacity: number;
};

type SetupOptions = Partial<{
  attemptStatus: PaymentAttemptStatus;
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  providerTransactionId: string | null;
  bookingExpiresAt: Date | null;
  attemptExpiresAt: Date | null;
  reservationStatuses: ReservationStatus[];
  reservationExpiresAt: Date | null;
  missingReservation: boolean;
  paymentAmount: bigint;
  failReservationConfirmation: boolean;
}>;

function input(): PaymentSettlementInput {
  return {
    attemptId: 'attempt-1',
    paymentId: 'payment-1',
    bookingId: 'booking-1',
    provider: PaymentProvider.SEPAY,
    providerTransactionId: 'TX1',
    amount: 250_000n,
    currency: 'VND',
  };
}

function setup(options: SetupOptions = {}) {
  const reservationStatuses = options.reservationStatuses ?? [
    ReservationStatus.HELD,
  ];
  const bookingStatus = options.bookingStatus ?? BookingStatus.PENDING_PAYMENT;
  const initialConfirmedAt = new Date('2026-09-30T20:00:00.000Z');
  const state: TestState = {
    attempt: {
      id: 'attempt-1',
      paymentId: 'payment-1',
      provider: PaymentProvider.SEPAY,
      status: options.attemptStatus ?? PaymentAttemptStatus.PENDING,
      amount: 250_000n,
      currency: 'VND',
      providerTransactionId:
        options.providerTransactionId ??
        (options.attemptStatus === PaymentAttemptStatus.SUCCEEDED
          ? 'TX1'
          : null),
      expiresAt:
        options.attemptExpiresAt === undefined
          ? FUTURE
          : options.attemptExpiresAt,
      succeededAt:
        options.attemptStatus === PaymentAttemptStatus.SUCCEEDED
          ? initialConfirmedAt
          : null,
    },
    payment: {
      id: 'payment-1',
      bookingId: 'booking-1',
      status: options.paymentStatus ?? PaymentStatus.PENDING,
      amount: options.paymentAmount ?? 250_000n,
      currency: 'VND',
      succeededAt:
        options.paymentStatus === PaymentStatus.SUCCEEDED
          ? initialConfirmedAt
          : null,
      booking: {
        id: 'booking-1',
        status: bookingStatus,
        totalAmount: 250_000n,
        currency: 'VND',
        expiresAt:
          options.bookingExpiresAt === undefined
            ? FUTURE
            : options.bookingExpiresAt,
        confirmedAt:
          bookingStatus === BookingStatus.CONFIRMED ? initialConfirmedAt : null,
        expiredAt:
          bookingStatus === BookingStatus.EXPIRED ? initialConfirmedAt : null,
        items: reservationStatuses.map((status, index) => ({
          id: `item-${index + 1}`,
          reservation:
            options.missingReservation &&
            index === reservationStatuses.length - 1
              ? null
              : {
                  id: `reservation-${index + 1}`,
                  status,
                  expiresAt:
                    options.reservationExpiresAt === undefined
                      ? FUTURE
                      : options.reservationExpiresAt,
                  confirmedAt:
                    status === ReservationStatus.CONFIRMED
                      ? initialConfirmedAt
                      : null,
                },
        })),
      },
    },
    slotCapacity: 10,
  };

  let rawCall = 0;
  const paymentAttempt = {
    findUnique: vi
      .fn()
      .mockImplementation(() => Promise.resolve(state.attempt)),
    findFirst: vi.fn().mockResolvedValue(null),
    updateMany: vi.fn().mockImplementation(({ data }) => {
      if (state.attempt.status !== PaymentAttemptStatus.PENDING) {
        return Promise.resolve({ count: 0 });
      }
      Object.assign(state.attempt, data);
      return Promise.resolve({ count: 1 });
    }),
  };
  const payment = {
    findUnique: vi
      .fn()
      .mockImplementation(() => Promise.resolve(state.payment)),
    updateMany: vi.fn().mockImplementation(({ data }) => {
      if (state.payment.status !== PaymentStatus.PENDING) {
        return Promise.resolve({ count: 0 });
      }
      Object.assign(state.payment, data);
      return Promise.resolve({ count: 1 });
    }),
  };
  const booking = {
    updateMany: vi.fn().mockImplementation(({ data }) => {
      if (state.payment.booking.status !== BookingStatus.PENDING_PAYMENT) {
        return Promise.resolve({ count: 0 });
      }
      Object.assign(state.payment.booking, data);
      return Promise.resolve({ count: 1 });
    }),
  };
  const reservation = {
    updateMany: vi.fn().mockImplementation(({ data }) => {
      const candidates = state.payment.booking.items.flatMap((item) =>
        item.reservation?.status === ReservationStatus.HELD
          ? [item.reservation]
          : [],
      );
      const affected =
        data.status === ReservationStatus.CONFIRMED &&
        options.failReservationConfirmation
          ? candidates.slice(0, Math.max(0, candidates.length - 1))
          : candidates;
      affected.forEach((item) => Object.assign(item, data));
      return Promise.resolve({ count: affected.length });
    }),
  };
  const transaction = {
    $queryRaw: vi.fn().mockImplementation(() => {
      rawCall += 1;
      if (rawCall === 1)
        return Promise.resolve([{ id: state.payment.booking.id }]);
      if (rawCall === 2) return Promise.resolve([{ id: state.payment.id }]);
      if (rawCall === 3) return Promise.resolve([{ id: state.attempt.id }]);
      if (rawCall === 4) {
        return Promise.resolve(
          state.payment.booking.items.flatMap(({ reservation }) =>
            reservation ? [{ id: reservation.id }] : [],
          ),
        );
      }
      return Promise.resolve([{ now: NOW }]);
    }),
    paymentAttempt,
    payment,
    booking,
    reservation,
  };
  const prisma = {
    $transaction: vi.fn(async (callback) => {
      rawCall = 0;
      const snapshot = structuredClone(state);
      try {
        return await callback(transaction);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    }),
  } as unknown as PrismaService;

  return {
    service: new PaymentSettlementService(prisma),
    state,
    transaction,
  };
}

describe('PaymentSettlementService', () => {
  const loggerLog = vi
    .spyOn(Logger.prototype, 'log')
    .mockImplementation(() => undefined);
  const loggerWarn = vi
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);

  afterAll(() => {
    loggerLog.mockRestore();
    loggerWarn.mockRestore();
  });

  it('atomically succeeds Payment and confirms Booking and Reservation', async () => {
    const { service, state } = setup();

    await expect(service.settle(input())).resolves.toMatchObject({
      outcome: 'CONFIRMED',
      reservationCount: 1,
      confirmedAt: NOW,
    });
    expect(state.attempt.status).toBe(PaymentAttemptStatus.SUCCEEDED);
    expect(state.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(state.payment.booking.status).toBe(BookingStatus.CONFIRMED);
    expect(state.payment.booking.confirmedAt).toEqual(NOW);
    expect(state.payment.booking.items[0]?.reservation).toMatchObject({
      status: ReservationStatus.CONFIRMED,
      confirmedAt: NOW,
    });
  });

  it('confirms all Reservations in a multi-item Booking without changing Slot capacity', async () => {
    const { service, state } = setup({
      reservationStatuses: [
        ReservationStatus.HELD,
        ReservationStatus.HELD,
        ReservationStatus.HELD,
      ],
    });

    const beforeCapacity = state.slotCapacity;
    await expect(service.settle(input())).resolves.toMatchObject({
      outcome: 'CONFIRMED',
      reservationCount: 3,
    });

    expect(
      state.payment.booking.items.map(({ reservation }) => reservation?.status),
    ).toEqual([
      ReservationStatus.CONFIRMED,
      ReservationStatus.CONFIRMED,
      ReservationStatus.CONFIRMED,
    ]);
    expect(state.slotCapacity).toBe(beforeCapacity);
  });

  it('completes a pre-existing successful Payment without recreating it', async () => {
    const { service, state, transaction } = setup({
      attemptStatus: PaymentAttemptStatus.SUCCEEDED,
      paymentStatus: PaymentStatus.SUCCEEDED,
    });

    await expect(service.settle(input())).resolves.toMatchObject({
      outcome: 'CONFIRMED',
    });
    expect(transaction.paymentAttempt.updateMany).not.toHaveBeenCalled();
    expect(transaction.payment.updateMany).not.toHaveBeenCalled();
    expect(state.payment.booking.status).toBe(BookingStatus.CONFIRMED);
  });

  it('rejects a terminal non-succeeded Payment without confirming Booking', async () => {
    const { service, state } = setup({ paymentStatus: PaymentStatus.EXPIRED });

    await expect(service.settle(input())).resolves.toMatchObject({
      outcome: 'RECONCILIATION_REQUIRED',
      reason: 'PAYMENT_NOT_PROCESSABLE',
    });
    expect(state.payment.booking.status).toBe(BookingStatus.PENDING_PAYMENT);
    expect(state.payment.booking.items[0]?.reservation?.status).toBe(
      ReservationStatus.HELD,
    );
  });

  it('is idempotent and preserves confirmedAt on duplicate settlement', async () => {
    const { service, state, transaction } = setup();

    await service.settle(input());
    const bookingConfirmedAt = state.payment.booking.confirmedAt;
    const reservationConfirmedAt =
      state.payment.booking.items[0]?.reservation?.confirmedAt;
    vi.clearAllMocks();

    await expect(service.settle(input())).resolves.toMatchObject({
      outcome: 'ALREADY_CONFIRMED',
      confirmedAt: bookingConfirmedAt,
    });
    expect(state.payment.booking.confirmedAt).toEqual(bookingConfirmedAt);
    expect(state.payment.booking.items[0]?.reservation?.confirmedAt).toEqual(
      reservationConfirmedAt,
    );
    expect(transaction.paymentAttempt.updateMany).not.toHaveBeenCalled();
    expect(transaction.payment.updateMany).not.toHaveBeenCalled();
    expect(transaction.booking.updateMany).not.toHaveBeenCalled();
    expect(transaction.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('records a late payment but never resurrects an expired Booking', async () => {
    const { service, state } = setup({
      bookingStatus: BookingStatus.EXPIRED,
      reservationStatuses: [ReservationStatus.EXPIRED],
      bookingExpiresAt: PAST,
      reservationExpiresAt: PAST,
    });

    await expect(service.settle(input())).resolves.toMatchObject({
      outcome: 'RECONCILIATION_REQUIRED',
      reason: 'BOOKING_EXPIRED',
    });
    expect(state.attempt.status).toBe(PaymentAttemptStatus.SUCCEEDED);
    expect(state.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(state.payment.booking.status).toBe(BookingStatus.EXPIRED);
    expect(state.payment.booking.items[0]?.reservation?.status).toBe(
      ReservationStatus.EXPIRED,
    );
  });

  it('atomically expires an elapsed pending hold while preserving the payment fact', async () => {
    const { service, state } = setup({
      bookingExpiresAt: PAST,
      reservationExpiresAt: PAST,
    });

    await expect(service.settle(input())).resolves.toMatchObject({
      outcome: 'RECONCILIATION_REQUIRED',
      reason: 'BOOKING_EXPIRED',
    });
    expect(state.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(state.payment.booking.status).toBe(BookingStatus.EXPIRED);
    expect(state.payment.booking.items[0]?.reservation?.status).toBe(
      ReservationStatus.EXPIRED,
    );
  });

  it('records payment but does not resurrect a cancelled Booking', async () => {
    const { service, state } = setup({
      bookingStatus: BookingStatus.CANCELLED,
      reservationStatuses: [ReservationStatus.RELEASED],
    });

    await expect(service.settle(input())).resolves.toMatchObject({
      outcome: 'RECONCILIATION_REQUIRED',
      reason: 'BOOKING_CANCELLED',
    });
    expect(state.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(state.payment.booking.status).toBe(BookingStatus.CANCELLED);
    expect(state.payment.booking.items[0]?.reservation?.status).toBe(
      ReservationStatus.RELEASED,
    );
  });

  it.each([
    [ReservationStatus.EXPIRED, 'RESERVATION_EXPIRED'],
    [ReservationStatus.RELEASED, 'RESERVATION_RELEASED'],
  ] as const)(
    'rejects a %s Reservation without partially confirming siblings',
    async (invalidStatus, reason) => {
      const { service, state } = setup({
        reservationStatuses: [ReservationStatus.HELD, invalidStatus],
      });

      await expect(service.settle(input())).resolves.toMatchObject({
        outcome: 'RECONCILIATION_REQUIRED',
        reason,
      });
      expect(state.payment.booking.status).toBe(BookingStatus.PENDING_PAYMENT);
      expect(state.payment.booking.items[0]?.reservation?.status).toBe(
        ReservationStatus.HELD,
      );
      expect(state.payment.booking.items[1]?.reservation?.status).toBe(
        invalidStatus,
      );
    },
  );

  it('detects mixed HELD/CONFIRMED Reservation state without repairing it', async () => {
    const { service, state } = setup({
      reservationStatuses: [
        ReservationStatus.HELD,
        ReservationStatus.CONFIRMED,
        ReservationStatus.HELD,
      ],
    });

    await expect(service.settle(input())).resolves.toMatchObject({
      outcome: 'RECONCILIATION_REQUIRED',
      reason: 'INCONSISTENT_RESERVATION_STATE',
    });
    expect(state.payment.booking.status).toBe(BookingStatus.PENDING_PAYMENT);
    expect(
      state.payment.booking.items.map(({ reservation }) => reservation?.status),
    ).toEqual([
      ReservationStatus.HELD,
      ReservationStatus.CONFIRMED,
      ReservationStatus.HELD,
    ]);
  });

  it('requires one Reservation per BookingItem', async () => {
    const { service, state } = setup({
      reservationStatuses: [ReservationStatus.HELD, ReservationStatus.HELD],
      missingReservation: true,
    });

    await expect(service.settle(input())).resolves.toMatchObject({
      outcome: 'RECONCILIATION_REQUIRED',
      reason: 'RESERVATION_MISSING',
    });
    expect(state.payment.booking.status).toBe(BookingStatus.PENDING_PAYMENT);
  });

  it('uses Payment and Booking snapshots instead of current catalog prices', async () => {
    const { service, state } = setup();
    const unrelatedCurrentServicePrice = 999_999n;

    await expect(service.settle(input())).resolves.toMatchObject({
      outcome: 'CONFIRMED',
    });
    expect(state.payment.amount).toBe(250_000n);
    expect(state.payment.booking.totalAmount).toBe(250_000n);
    expect(unrelatedCurrentServicePrice).not.toBe(state.payment.amount);
  });

  it('rejects a Payment/Booking amount snapshot mismatch', async () => {
    const { service, state } = setup({ paymentAmount: 300_000n });

    await expect(service.settle(input())).resolves.toMatchObject({
      outcome: 'RECONCILIATION_REQUIRED',
      reason: 'FINANCIAL_SNAPSHOT_MISMATCH',
    });
    expect(state.attempt.status).toBe(PaymentAttemptStatus.PENDING);
    expect(state.payment.status).toBe(PaymentStatus.PENDING);
    expect(state.payment.booking.status).toBe(BookingStatus.PENDING_PAYMENT);
  });

  it('rolls back every state if the Reservation update count is incomplete', async () => {
    const { service, state } = setup({
      reservationStatuses: [
        ReservationStatus.HELD,
        ReservationStatus.HELD,
        ReservationStatus.HELD,
      ],
      failReservationConfirmation: true,
    });

    await expect(service.settle(input())).rejects.toThrow(
      'Reservation set changed during payment settlement',
    );
    expect(state.attempt.status).toBe(PaymentAttemptStatus.PENDING);
    expect(state.payment.status).toBe(PaymentStatus.PENDING);
    expect(state.payment.booking.status).toBe(BookingStatus.PENDING_PAYMENT);
    expect(
      state.payment.booking.items.map(({ reservation }) => reservation?.status),
    ).toEqual([
      ReservationStatus.HELD,
      ReservationStatus.HELD,
      ReservationStatus.HELD,
    ]);
  });
});
