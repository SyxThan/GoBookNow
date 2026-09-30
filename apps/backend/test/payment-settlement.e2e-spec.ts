import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BookingExpirationService } from '../src/bookings/expiration/booking-expiration.service.js';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  BookingStatus,
  CategoryScope,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentStatus,
  PricingSource,
  ReservationStatus,
  ServiceKind,
  ServiceStatus,
  SlotStatus,
  UserStatus,
  VendorStatus,
} from '../src/generated/prisma/client.js';
import { PaymentsModule } from '../src/payments/payments.module.js';
import {
  type PaymentSettlementInput,
  PaymentSettlementService,
} from '../src/payments/payment-settlement.service.js';

const IPN_SECRET = 'booking-confirmation-e2e-secret';
type DbNowRow = { now: Date };

describe('Atomic payment settlement (e2e, PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let settlement: PaymentSettlementService;
  let expiration: BookingExpirationService;
  const run = randomUUID().replace(/-/g, '').slice(0, 8);
  const userIds: string[] = [];
  const vendorIds: string[] = [];
  const categoryIds: string[] = [];
  const serviceIds: string[] = [];
  const slotIds: string[] = [];
  let customerId: string;
  let vendorId: string;
  let serviceId: string;
  let sequence = 0;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: 'booking-confirmation-jwt-secret',
              SEPAY_IPN_SECRET: IPN_SECRET,
              BOOKING_EXPIRATION_BATCH_SIZE: '100',
            }),
          ],
        }),
        PrismaModule,
        PaymentsModule,
      ],
      providers: [BookingExpirationService],
    }).compile();

    app = fixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = fixture.get(PrismaService);
    settlement = fixture.get(PaymentSettlementService);
    expiration = fixture.get(BookingExpirationService);

    const customer = await createUser('customer');
    customerId = customer;
    const ownerId = await createUser('owner');
    vendorId = await createVendor(ownerId);
    const categoryId = await createCategory();
    serviceId = await createService(categoryId);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.paymentAttempt.deleteMany({
        where: { payment: { booking: { customerId } } },
      });
      await prisma.payment.deleteMany({
        where: { booking: { customerId } },
      });
      await prisma.booking.deleteMany({ where: { customerId } });
      await prisma.slot.deleteMany({ where: { id: { in: slotIds } } });
      await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
      await prisma.category.deleteMany({
        where: { id: { in: categoryIds } },
      });
      await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  async function databaseNow(): Promise<Date> {
    const [row] = await prisma.$queryRaw<DbNowRow[]>`
      SELECT NOW() AS "now"
    `;
    if (!row) throw new Error('Failed to read database time');
    return row.now;
  }

  async function createUser(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `confirmation-${run}-${label}@example.com`,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function createVendor(ownerUserId: string): Promise<string> {
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId,
        displayName: `Confirmation Vendor ${run}`,
        slug: `confirmation-vendor-${run}`,
        status: VendorStatus.APPROVED,
      },
      select: { id: true },
    });
    vendorIds.push(vendor.id);
    return vendor.id;
  }

  async function createCategory(): Promise<string> {
    const category = await prisma.category.create({
      data: {
        code: `CONFIRM_${run.toUpperCase()}`,
        name: `Confirmation Category ${run}`,
        slug: `confirmation-category-${run}`,
        scope: CategoryScope.EVENT,
      },
      select: { id: true },
    });
    categoryIds.push(category.id);
    return category.id;
  }

  async function createService(categoryId: string): Promise<string> {
    const service = await prisma.service.create({
      data: {
        vendorId,
        categoryId,
        kind: ServiceKind.EVENT,
        title: `Confirmation Service ${run}`,
        slug: `confirmation-service-${run}`,
        priceAmount: 100_000n,
        currency: 'VND',
        status: ServiceStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    serviceIds.push(service.id);
    return service.id;
  }

  async function createSlot(index: number): Promise<{
    id: string;
    startAt: Date;
    endAt: Date;
    capacity: number;
  }> {
    const slot = await prisma.slot.create({
      data: {
        serviceId,
        startAt: new Date(Date.UTC(2099, 0, index + 1, 2)),
        endAt: new Date(Date.UTC(2099, 0, index + 1, 4)),
        capacity: 10,
        status: SlotStatus.OPEN,
      },
      select: { id: true, startAt: true, endAt: true, capacity: true },
    });
    slotIds.push(slot.id);
    return slot;
  }

  async function createAggregate(input: {
    itemCount: number;
    expiresAt: Date;
  }): Promise<{
    settlementInput: PaymentSettlementInput;
    merchantReference: string;
    slotCapacities: Array<{ id: string; capacity: number }>;
  }> {
    sequence += 1;
    const totalAmount = BigInt(input.itemCount) * 100_000n;
    const slots = [];
    for (let index = 0; index < input.itemCount; index += 1) {
      slots.push(await createSlot(sequence * 10 + index));
    }

    const booking = await prisma.booking.create({
      data: {
        bookingCode: `CNF-${run}-${sequence}`,
        customerId,
        vendorId,
        status: BookingStatus.PENDING_PAYMENT,
        currency: 'VND',
        subtotalAmount: totalAmount,
        totalAmount,
        expiresAt: input.expiresAt,
        items: {
          create: slots.map((slot, index) => ({
            serviceId,
            slotId: slot.id,
            quantity: 1,
            unitPriceAmount: 100_000n,
            subtotalAmount: 100_000n,
            currency: 'VND',
            pricingSource: PricingSource.SERVICE,
            serviceTitleSnapshot: `Confirmation snapshot ${index}`,
            slotStartAtSnapshot: slot.startAt,
            slotEndAtSnapshot: slot.endAt,
            reservation: {
              create: {
                slotId: slot.id,
                quantity: 1,
                status: ReservationStatus.HELD,
                expiresAt: input.expiresAt,
              },
            },
          })),
        },
      },
      select: { id: true },
    });
    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        status: PaymentStatus.PENDING,
        amount: totalAmount,
        currency: 'VND',
      },
      select: { id: true },
    });
    const merchantReference = `GBK${run}${sequence}`.toUpperCase();
    const attempt = await prisma.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        provider: PaymentProvider.SEPAY,
        status: PaymentAttemptStatus.PENDING,
        amount: totalAmount,
        currency: 'VND',
        merchantReference,
        expiresAt: input.expiresAt,
      },
      select: { id: true },
    });

    return {
      merchantReference,
      settlementInput: {
        attemptId: attempt.id,
        paymentId: payment.id,
        bookingId: booking.id,
        provider: PaymentProvider.SEPAY,
        providerTransactionId: `TX-${run}-${sequence}`,
        amount: totalAmount,
        currency: 'VND',
      },
      slotCapacities: slots.map(({ id, capacity }) => ({ id, capacity })),
    };
  }

  async function loadAggregate(bookingId: string) {
    return prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        payment: { include: { attempts: true } },
        items: {
          orderBy: { id: 'asc' },
          include: { reservation: true },
        },
      },
    });
  }

  function ipnPayload(input: {
    merchantReference: string;
    providerTransactionId: string;
    amount: bigint;
  }) {
    return {
      timestamp: 1_757_058_220,
      notification_type: 'ORDER_PAID',
      order: {
        id: 'provider-order-id',
        order_id: 'provider-order-code',
        order_status: 'CAPTURED',
        order_currency: 'VND',
        order_amount: `${input.amount}.00`,
        order_invoice_number: input.merchantReference,
      },
      transaction: {
        id: 'provider-transaction-row-id',
        payment_method: 'BANK_TRANSFER',
        transaction_id: input.providerTransactionId,
        transaction_type: 'PAYMENT',
        transaction_status: 'APPROVED',
        transaction_amount: input.amount.toString(),
        transaction_currency: 'VND',
      },
      customer: null,
    };
  }

  it('settles a multi-item Booking through authenticated SePay IPN and keeps Slot capacity unchanged', async () => {
    const future = new Date((await databaseNow()).getTime() + 10 * 60_000);
    const fixture = await createAggregate({ itemCount: 3, expiresAt: future });
    const body = ipnPayload({
      merchantReference: fixture.merchantReference,
      providerTransactionId: fixture.settlementInput.providerTransactionId,
      amount: fixture.settlementInput.amount,
    });

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/sepay/ipn')
      .set('X-Secret-Key', IPN_SECRET)
      .send(body)
      .expect(200, { success: true });

    const first = await loadAggregate(fixture.settlementInput.bookingId);
    expect(first.status).toBe(BookingStatus.CONFIRMED);
    expect(first.confirmedAt).not.toBeNull();
    expect(first.payment?.status).toBe(PaymentStatus.SUCCEEDED);
    expect(first.payment?.attempts[0]?.status).toBe(
      PaymentAttemptStatus.SUCCEEDED,
    );
    expect(first.items.map(({ reservation }) => reservation?.status)).toEqual([
      ReservationStatus.CONFIRMED,
      ReservationStatus.CONFIRMED,
      ReservationStatus.CONFIRMED,
    ]);
    expect(
      first.items.every(
        ({ reservation }) =>
          reservation?.confirmedAt?.getTime() === first.confirmedAt?.getTime(),
      ),
    ).toBe(true);

    const firstBookingConfirmedAt = first.confirmedAt;
    const firstReservationConfirmedAt = first.items.map(
      ({ reservation }) => reservation?.confirmedAt,
    );
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/sepay/ipn')
      .set('X-Secret-Key', IPN_SECRET)
      .send(body)
      .expect(200, { success: true });

    const duplicate = await loadAggregate(fixture.settlementInput.bookingId);
    expect(duplicate.confirmedAt).toEqual(firstBookingConfirmedAt);
    expect(
      duplicate.items.map(({ reservation }) => reservation?.confirmedAt),
    ).toEqual(firstReservationConfirmedAt);
    const slots = await prisma.slot.findMany({
      where: { id: { in: fixture.slotCapacities.map(({ id }) => id) } },
      select: { id: true, capacity: true },
      orderBy: { id: 'asc' },
    });
    expect(slots).toEqual(
      [...fixture.slotCapacities].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    );
  });

  it('concurrent duplicate settlement converges without duplicate effects', async () => {
    const future = new Date((await databaseNow()).getTime() + 10 * 60_000);
    const fixture = await createAggregate({ itemCount: 2, expiresAt: future });

    const results = await Promise.all([
      settlement.settle(fixture.settlementInput),
      settlement.settle(fixture.settlementInput),
    ]);

    expect(results.map(({ outcome }) => outcome).sort()).toEqual([
      'ALREADY_CONFIRMED',
      'CONFIRMED',
    ]);
    const aggregate = await loadAggregate(fixture.settlementInput.bookingId);
    expect(aggregate.status).toBe(BookingStatus.CONFIRMED);
    expect(
      aggregate.items.every(
        ({ reservation }) =>
          reservation?.status === ReservationStatus.CONFIRMED,
      ),
    ).toBe(true);
    expect(
      aggregate.items.every(
        ({ reservation }) =>
          reservation?.confirmedAt?.getTime() ===
          aggregate.confirmedAt?.getTime(),
      ),
    ).toBe(true);
  });

  it('keeps an expiration-versus-confirmation race internally consistent', async () => {
    const expired = await createAggregate({
      itemCount: 2,
      expiresAt: new Date('1900-01-01T00:00:00.000Z'),
    });

    await Promise.all([
      settlement.settle(expired.settlementInput),
      expiration.sweepExpiredBookings({ batchSize: 1 }),
    ]);

    const expiredAggregate = await loadAggregate(
      expired.settlementInput.bookingId,
    );
    expect(expiredAggregate.payment?.status).toBe(PaymentStatus.SUCCEEDED);
    expect(expiredAggregate.status).toBe(BookingStatus.EXPIRED);
    expect(
      expiredAggregate.items.every(
        ({ reservation }) => reservation?.status === ReservationStatus.EXPIRED,
      ),
    ).toBe(true);
  });
});
