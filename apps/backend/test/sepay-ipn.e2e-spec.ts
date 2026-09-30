import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  BookingStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentStatus,
  ReservationStatus,
} from '../src/generated/prisma/client.js';
import { PaymentMatchingService } from '../src/payments/payment-matching.service.js';
import { PaymentSettlementService } from '../src/payments/payment-settlement.service.js';
import { SepayIpnAuthGuard } from '../src/payments/sepay-ipn-auth.guard.js';
import { SepayIpnController } from '../src/payments/sepay-ipn.controller.js';
import { SepayIpnService } from '../src/payments/sepay-ipn.service.js';

const IPN_SECRET = 'synthetic-e2e-ipn-secret';

function validPayload() {
  return {
    timestamp: 1_757_058_220,
    notification_type: 'ORDER_PAID',
    order: {
      id: 'provider-order-id',
      order_id: 'provider-order-code',
      order_status: 'CAPTURED',
      order_currency: 'VND',
      order_amount: '250000.00',
      order_invoice_number: 'GBKABCDEF1234567890',
      custom_data: [],
    },
    transaction: {
      id: 'provider-transaction-row-id',
      payment_method: 'BANK_TRANSFER',
      transaction_id: 'SEPAY-TXN-001',
      transaction_type: 'PAYMENT',
      transaction_status: 'APPROVED',
      transaction_amount: '250000',
      transaction_currency: 'VND',
      card_number: null,
    },
    customer: null,
    agreement: null,
  };
}

describe('SePay Payment Gateway IPN authentication (e2e)', () => {
  let app: INestApplication;
  const processIpn = vi.fn().mockResolvedValue({ success: true });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ SEPAY_IPN_SECRET: IPN_SECRET })],
        }),
      ],
      controllers: [SepayIpnController],
      providers: [
        SepayIpnAuthGuard,
        { provide: SepayIpnService, useValue: { process: processIpn } },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => vi.clearAllMocks());

  afterAll(async () => app.close());

  const send = (secret?: string, body: object = validPayload()) => {
    const pending = request(app.getHttpServer())
      .post('/api/v1/webhooks/sepay/ipn')
      .send(body);
    return secret === undefined ? pending : pending.set('X-Secret-Key', secret);
  };

  it('rejects a missing X-Secret-Key', () => send().expect(401));

  it('rejects a wrong X-Secret-Key without echoing it', async () => {
    const wrongSecret = 'do-not-echo-this-secret';
    const response = await send(wrongSecret).expect(401);
    expect(JSON.stringify(response.body)).not.toContain(wrongSecret);
    expect(processIpn).not.toHaveBeenCalled();
  });

  it('accepts the correct provider secret without requiring Bearer JWT', async () => {
    const response = await send(IPN_SECRET).expect(200);
    expect(response.body).toEqual({ success: true });
    expect(processIpn).toHaveBeenCalledOnce();
  });

  it('returns 400 for a structurally invalid authenticated payload', async () => {
    await send(IPN_SECRET, {
      ...validPayload(),
      transaction: { transaction_id: 'SEPAY-TXN-001' },
    }).expect(400);
    expect(processIpn).not.toHaveBeenCalled();
  });
});

describe('SePay strict payment matching (e2e)', () => {
  let app: INestApplication;
  let rawCall = 0;

  const makeAttempt = (suffix: 'a' | 'b', merchantReference: string) => ({
    id: `attempt-${suffix}`,
    paymentId: `payment-${suffix}`,
    provider: PaymentProvider.SEPAY,
    status: PaymentAttemptStatus.PENDING,
    amount: 250_000n,
    currency: 'VND',
    merchantReference,
    providerTransactionId: null as string | null,
    expiresAt: new Date('2026-10-01T00:10:00.000Z'),
    succeededAt: null as Date | null,
    payment: {
      id: `payment-${suffix}`,
      bookingId: `booking-${suffix}`,
      status: PaymentStatus.PENDING,
      amount: 250_000n,
      currency: 'VND',
      succeededAt: null as Date | null,
      booking: {
        id: `booking-${suffix}`,
        status: BookingStatus.PENDING_PAYMENT,
        totalAmount: 250_000n,
        currency: 'VND',
        expiresAt: new Date('2026-10-01T00:10:00.000Z'),
        confirmedAt: null as Date | null,
        items: [
          {
            id: `item-${suffix}`,
            reservation: {
              id: `reservation-${suffix}`,
              status: ReservationStatus.HELD,
              expiresAt: new Date('2026-10-01T00:10:00.000Z'),
              confirmedAt: null as Date | null,
            },
          },
        ],
      },
    },
  });

  let attemptA = makeAttempt('a', 'GBKA');
  let attemptB = makeAttempt('b', 'GBKB');
  const attempts = () => [attemptA, attemptB];
  let currentAttempt = attemptA;
  const transaction = {
    $queryRaw: vi.fn(() => {
      rawCall += 1;
      const phase = (rawCall - 1) % 5;
      if (phase === 0) {
        return Promise.resolve([{ id: currentAttempt.payment.booking.id }]);
      }
      if (phase === 1) {
        return Promise.resolve([{ id: currentAttempt.payment.id }]);
      }
      if (phase === 2) return Promise.resolve([{ id: currentAttempt.id }]);
      if (phase === 3) {
        return Promise.resolve(
          currentAttempt.payment.booking.items.map(({ reservation }) => ({
            id: reservation.id,
          })),
        );
      }
      return Promise.resolve([{ now: new Date('2026-10-01T00:00:00.000Z') }]);
    }),
    paymentAttempt: {
      findUnique: vi.fn(
        ({ where }: { where: { id?: string; merchantReference?: string } }) => {
          const found = attempts().find(
            (attempt) =>
              (where.id !== undefined && attempt.id === where.id) ||
              (where.merchantReference !== undefined &&
                attempt.merchantReference === where.merchantReference),
          );
          if (found) currentAttempt = found;
          return Promise.resolve(found ?? null);
        },
      ),
      findFirst: vi.fn(
        ({
          where,
        }: {
          where: {
            provider: PaymentProvider;
            providerTransactionId: string;
            id: { not: string };
          };
        }) =>
          Promise.resolve(
            attempts().find(
              (attempt) =>
                attempt.provider === where.provider &&
                attempt.providerTransactionId === where.providerTransactionId &&
                attempt.id !== where.id.not,
            ) ?? null,
          ),
      ),
      update: vi.fn(
        ({ where, data }: { where: { id: string }; data: object }) => {
          const attempt = attempts().find(({ id }) => id === where.id)!;
          Object.assign(attempt, data);
          return Promise.resolve(attempt);
        },
      ),
      updateMany: vi.fn(
        ({ where, data }: { where: { id: string }; data: object }) => {
          const attempt = attempts().find(({ id }) => id === where.id);
          if (!attempt || attempt.status !== PaymentAttemptStatus.PENDING) {
            return Promise.resolve({ count: 0 });
          }
          Object.assign(attempt, data);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    payment: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          attempts().find(({ payment }) => payment.id === where.id)?.payment ??
            null,
        ),
      ),
      update: vi.fn(
        ({ where, data }: { where: { id: string }; data: object }) => {
          const payment = attempts().find(
            (attempt) => attempt.payment.id === where.id,
          )!.payment;
          Object.assign(payment, data);
          return Promise.resolve(payment);
        },
      ),
      updateMany: vi.fn(
        ({ where, data }: { where: { id: string }; data: object }) => {
          const payment = attempts().find(
            (attempt) => attempt.payment.id === where.id,
          )?.payment;
          if (!payment || payment.status !== PaymentStatus.PENDING) {
            return Promise.resolve({ count: 0 });
          }
          Object.assign(payment, data);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    booking: {
      updateMany: vi.fn(({ data }: { data: object }) => {
        if (
          currentAttempt.payment.booking.status !==
          BookingStatus.PENDING_PAYMENT
        ) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(currentAttempt.payment.booking, data);
        return Promise.resolve({ count: 1 });
      }),
    },
    reservation: {
      updateMany: vi.fn(({ data }: { data: object }) => {
        const held = currentAttempt.payment.booking.items
          .map(({ reservation }) => reservation)
          .filter(({ status }) => status === ReservationStatus.HELD);
        held.forEach((reservation) => Object.assign(reservation, data));
        return Promise.resolve({ count: held.length });
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(
      (callback: (client: typeof transaction) => Promise<void>) =>
        callback(transaction),
    ),
    paymentAttempt: transaction.paymentAttempt,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ SEPAY_IPN_SECRET: IPN_SECRET })],
        }),
      ],
      controllers: [SepayIpnController],
      providers: [
        SepayIpnAuthGuard,
        PaymentMatchingService,
        PaymentSettlementService,
        SepayIpnService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    rawCall = 0;
    attemptA = makeAttempt('a', 'GBKA');
    attemptB = makeAttempt('b', 'GBKB');
    currentAttempt = attemptA;
  });

  afterAll(async () => app.close());

  const sendMatchingPayload = (
    overrides: Partial<{
      merchantReference: string;
      amount: string;
      transactionId: string;
    }> = {},
  ) => {
    const body = validPayload();
    body.order.order_invoice_number = overrides.merchantReference ?? 'GBKA';
    body.order.order_amount = overrides.amount ?? '250000.00';
    body.transaction.transaction_amount = overrides.amount ?? '250000';
    body.transaction.transaction_id = overrides.transactionId ?? 'TX1';
    body.order.custom_data = {
      bookingId: 'booking-b',
      paymentId: 'payment-b',
      customerId: 'customer-b',
    };

    return request(app.getHttpServer())
      .post('/api/v1/webhooks/sepay/ipn')
      .set('X-Secret-Key', IPN_SECRET)
      .send(body);
  };

  it('matches exact reference A only, despite equal amounts and manipulated custom data', async () => {
    await sendMatchingPayload().expect(200, { success: true });

    expect(transaction.paymentAttempt.updateMany).toHaveBeenCalledOnce();
    expect(transaction.paymentAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'attempt-a' }),
      }),
    );
    expect(transaction.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'payment-a' }),
      }),
    );
    expect(attemptA.payment.booking.status).toBe(BookingStatus.CONFIRMED);
    expect(attemptA.payment.booking.items[0]?.reservation.status).toBe(
      ReservationStatus.CONFIRMED,
    );
    expect(attemptB.status).toBe(PaymentAttemptStatus.PENDING);
    expect(attemptB.payment.status).toBe(PaymentStatus.PENDING);
    expect(attemptB.payment.booking.status).toBe(BookingStatus.PENDING_PAYMENT);
  });

  it('does not mark any Payment successful for an unknown reference', async () => {
    await sendMatchingPayload({ merchantReference: 'UNKNOWN' }).expect(200, {
      success: true,
    });

    expect(transaction.paymentAttempt.updateMany).not.toHaveBeenCalled();
    expect(transaction.payment.updateMany).not.toHaveBeenCalled();
    expect(transaction.booking.updateMany).not.toHaveBeenCalled();
  });

  it('does not mark any Payment successful for a wrong amount', async () => {
    await sendMatchingPayload({ amount: '300000' }).expect(200, {
      success: true,
    });

    expect(transaction.paymentAttempt.updateMany).not.toHaveBeenCalled();
    expect(transaction.payment.updateMany).not.toHaveBeenCalled();
    expect(transaction.booking.updateMany).not.toHaveBeenCalled();
  });

  it('handles duplicate delivery idempotently without a second update', async () => {
    await sendMatchingPayload().expect(200, { success: true });
    const bookingConfirmedAt = attemptA.payment.booking.confirmedAt;
    const reservationConfirmedAt =
      attemptA.payment.booking.items[0]?.reservation.confirmedAt;
    await sendMatchingPayload().expect(200, { success: true });

    expect(transaction.paymentAttempt.updateMany).toHaveBeenCalledOnce();
    expect(transaction.payment.updateMany).toHaveBeenCalledOnce();
    expect(transaction.booking.updateMany).toHaveBeenCalledOnce();
    expect(transaction.reservation.updateMany).toHaveBeenCalledOnce();
    expect(attemptA.providerTransactionId).toBe('TX1');
    expect(attemptA.payment.booking.confirmedAt).toEqual(bookingConfirmedAt);
    expect(attemptA.payment.booking.items[0]?.reservation.confirmedAt).toEqual(
      reservationConfirmedAt,
    );
    expect(attemptB.providerTransactionId).toBeNull();
  });
});
