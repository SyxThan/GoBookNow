import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../src/auth/guards/roles.guard.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  BookingStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentStatus,
  ReservationStatus,
} from '../src/generated/prisma/client.js';
import { PaymentsModule } from '../src/payments/payments.module.js';
import {
  PAYMENT_CHECKOUT_PROVIDER,
  type PaymentCheckoutProvider,
} from '../src/payments/providers/payment-checkout-provider.js';

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-09-27T10:00:00.000Z');
const EXPIRES_AT = new Date('2026-09-27T10:10:00.000Z');

describe('Payment initiation (e2e)', () => {
  let app: INestApplication;

  const transaction = {
    $queryRaw: vi.fn(),
    booking: { findUnique: vi.fn() },
    payment: { create: vi.fn() },
    paymentAttempt: { findFirst: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((callback) => callback(transaction)),
    payment: { findUnique: vi.fn() },
  };
  const createCheckout = vi.fn().mockResolvedValue({
    paymentUrl: 'https://pay-sandbox.sepay.vn/v1/checkout/init',
    method: 'POST',
    formFields: {
      merchant: 'sandbox-merchant',
      operation: 'PURCHASE',
      payment_method: 'BANK_TRANSFER',
      order_invoice_number: 'GBKABCDEF1234567890',
      order_amount: '300000',
      currency: 'VND',
      signature: 'signed',
    },
  });
  const provider: PaymentCheckoutProvider = {
    createCheckout,
  };
  const authGuard: CanActivate = {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest<{
        headers: { authorization?: string };
        user?: unknown;
      }>();
      if (request.headers.authorization !== 'Bearer customer-token') {
        throw new UnauthorizedException('Bearer access token is required');
      }
      request.user = {
        id: CUSTOMER_ID,
        email: 'customer@example.test',
        roles: ['CUSTOMER'],
        profile: null,
      };
      return true;
    },
  };

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-only-access-secret';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PaymentsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(PAYMENT_CHECKOUT_PROVIDER)
      .useValue(provider)
      .overrideGuard(JwtAuthGuard)
      .useValue(authGuard)
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

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
    transaction.$queryRaw
      .mockResolvedValueOnce([{ id: BOOKING_ID }])
      .mockResolvedValueOnce([{ now: NOW }]);
    transaction.booking.findUnique.mockResolvedValue({
      id: BOOKING_ID,
      bookingCode: 'GBK-20260927-ABC12345',
      customerId: CUSTOMER_ID,
      status: BookingStatus.PENDING_PAYMENT,
      totalAmount: 300_000n,
      currency: 'VND',
      expiresAt: EXPIRES_AT,
      items: [
        {
          reservation: {
            status: ReservationStatus.HELD,
            expiresAt: EXPIRES_AT,
          },
        },
      ],
      payment: null,
    });
    transaction.payment.create.mockResolvedValue({
      id: 'payment-1',
      status: PaymentStatus.PENDING,
      amount: 300_000n,
      currency: 'VND',
    });
    transaction.paymentAttempt.findFirst.mockResolvedValue(null);
    transaction.paymentAttempt.create.mockResolvedValue({
      id: 'attempt-1',
      provider: PaymentProvider.SEPAY,
      status: PaymentAttemptStatus.PENDING,
      amount: 300_000n,
      currency: 'VND',
      merchantReference: 'GBKABCDEF1234567890',
      expiresAt: EXPIRES_AT,
    });
    createCheckout.mockResolvedValue({
      paymentUrl: 'https://pay-sandbox.sepay.vn/v1/checkout/init',
      method: 'POST',
      formFields: {
        merchant: 'sandbox-merchant',
        operation: 'PURCHASE',
        payment_method: 'BANK_TRANSFER',
        order_invoice_number: 'GBKABCDEF1234567890',
        order_amount: '300000',
        currency: 'VND',
        signature: 'signed',
      },
    });
    prisma.payment.findUnique.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      status: PaymentStatus.PENDING,
      amount: 300_000n,
      currency: 'VND',
      booking: {
        id: BOOKING_ID,
        customerId: CUSTOMER_ID,
        status: BookingStatus.PENDING_PAYMENT,
        expiresAt: EXPIRES_AT,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const initiate = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/payments/sepay')
      .set('Authorization', 'Bearer customer-token')
      .send(body);

  it('returns a signed POST form without serializing bigint directly', async () => {
    const response = await initiate({ bookingId: BOOKING_ID }).expect(201);

    expect(response.body).toMatchObject({
      paymentId: 'payment-1',
      attemptId: 'attempt-1',
      provider: 'SEPAY',
      status: 'PENDING',
      amount: '300000',
      currency: 'VND',
      merchantReference: 'GBKABCDEF1234567890',
      paymentUrl: 'https://pay-sandbox.sepay.vn/v1/checkout/init',
      method: 'POST',
      formFields: {
        operation: 'PURCHASE',
        payment_method: 'BANK_TRANSFER',
        order_amount: '300000',
        signature: 'signed',
      },
      expiresAt: EXPIRES_AT.toISOString(),
    });
  });

  it('requires authentication', () =>
    request(app.getHttpServer())
      .post('/api/v1/payments/sepay')
      .send({ bookingId: BOOKING_ID })
      .expect(401));

  it('rejects malformed booking IDs', () =>
    initiate({ bookingId: 'not-a-uuid' }).expect(400));

  it('rejects an authoritative client amount instead of allowing override', () =>
    initiate({ bookingId: BOOKING_ID, amount: '1' }).expect(400));

  it('returns only the customer-owned authoritative Payment state', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/payments/33333333-3333-4333-8333-333333333333')
      .set('Authorization', 'Bearer customer-token')
      .expect(200);

    expect(response.body).toEqual({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'PENDING',
      amount: '300000',
      currency: 'VND',
      booking: {
        id: BOOKING_ID,
        status: 'PENDING_PAYMENT',
      },
      expiresAt: EXPIRES_AT.toISOString(),
    });
    expect(response.body).not.toHaveProperty('providerTransactionId');
  });

  it('does not expose another customer Payment', async () => {
    prisma.payment.findUnique.mockResolvedValueOnce({
      id: '33333333-3333-4333-8333-333333333333',
      status: PaymentStatus.PENDING,
      amount: 300_000n,
      currency: 'VND',
      booking: {
        id: BOOKING_ID,
        customerId: '44444444-4444-4444-8444-444444444444',
        status: BookingStatus.PENDING_PAYMENT,
        expiresAt: EXPIRES_AT,
      },
    });

    await request(app.getHttpServer())
      .get('/api/v1/payments/33333333-3333-4333-8333-333333333333')
      .set('Authorization', 'Bearer customer-token')
      .expect(403);
  });
});
