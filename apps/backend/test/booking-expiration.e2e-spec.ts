import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  RoleCode,
  type RoleCode as Role,
} from '../src/auth/constants/role.constants.js';
import { AuthModule } from '../src/auth/auth.module.js';
import type { JwtPayload } from '../src/auth/types/jwt-payload.type.js';
import { BookingsModule } from '../src/bookings/bookings.module.js';
import { BookingExpirationService } from '../src/bookings/expiration/booking-expiration.service.js';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  BookingStatus,
  CategoryScope,
  PricingSource,
  ReservationStatus,
  ServiceKind,
  ServiceStatus,
  SlotStatus,
  UserStatus,
  VendorStatus,
} from '../src/generated/prisma/client.js';

type Identity = { id: string; roles: Role[] };
type DbNowRow = { now: Date };

describe('Booking expiration worker (e2e, PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let expiration: BookingExpirationService;
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const vendorIds: string[] = [];
  const categoryIds: string[] = [];
  const serviceIds: string[] = [];
  const slotIds: string[] = [];
  let customerA: Identity;
  let customerB: Identity;
  let vendorId: string;
  let categoryId: string;
  let serviceId: string;

  beforeAll(async () => {
    process.env.BOOKING_HOLD_TTL_MINUTES = '10';
    process.env.BOOKING_EXPIRATION_INTERVAL_SECONDS = '60';
    process.env.BOOKING_EXPIRATION_BATCH_SIZE = '100';

    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        BookingsModule,
      ],
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
    jwt = fixture.get(JwtService);
    expiration = fixture.get(BookingExpirationService);

    await Promise.all(
      Object.values(RoleCode).map((code) =>
        prisma.role.upsert({
          where: { code },
          update: {},
          create: { code, name: code, isSystem: true },
        }),
      ),
    );

    customerA = await createIdentity([RoleCode.CUSTOMER]);
    customerB = await createIdentity([RoleCode.CUSTOMER]);
    const vendorUser = await createIdentity([RoleCode.VENDOR]);
    vendorId = await createVendor(vendorUser.id, VendorStatus.APPROVED, 'main');
    categoryId = await createCategory(CategoryScope.EVENT, true, 'main');
    serviceId = await createService({
      vendorId,
      categoryId,
      suffix: 'main',
      priceAmount: 150_000n,
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.booking.deleteMany({
        where: { customerId: { in: userIds } },
      });
      await prisma.slot.deleteMany({ where: { id: { in: slotIds } } });
      await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
      await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  function at(day: number, hour: number): Date {
    return new Date(Date.UTC(2099, 2, day, hour));
  }

  function addMs(date: Date, milliseconds: number): Date {
    return new Date(date.getTime() + milliseconds);
  }

  async function databaseNow(): Promise<Date> {
    const [row] = await prisma.$queryRaw<DbNowRow[]>`
      SELECT NOW() AS "now"
    `;
    if (!row) throw new Error('Failed to read database time');
    return row.now;
  }

  async function createIdentity(roles: Role[]): Promise<Identity> {
    const roleRows = await prisma.role.findMany({
      where: { code: { in: roles } },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        email: `expiration-${run}-${randomUUID()}@example.com`,
        status: UserStatus.ACTIVE,
        userRoles: { create: roleRows.map(({ id }) => ({ roleId: id })) },
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return { id: user.id, roles };
  }

  async function createVendor(
    ownerUserId: string,
    status: VendorStatus,
    suffix: string,
  ): Promise<string> {
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId,
        displayName: `Expiration Vendor ${suffix} ${run}`,
        slug: `expiration-vendor-${suffix}-${run}`,
        status,
      },
      select: { id: true },
    });
    vendorIds.push(vendor.id);
    return vendor.id;
  }

  async function createCategory(
    scope: CategoryScope,
    isActive: boolean,
    suffix: string,
  ): Promise<string> {
    const category = await prisma.category.create({
      data: {
        code: `EXPIRATION_${suffix.toUpperCase()}_${run.toUpperCase()}`,
        name: `Expiration Category ${suffix} ${run}`,
        slug: `expiration-category-${suffix}-${run}`,
        scope,
        isActive,
      },
      select: { id: true },
    });
    categoryIds.push(category.id);
    return category.id;
  }

  async function createService(input: {
    vendorId: string;
    categoryId: string;
    suffix: string;
    priceAmount?: bigint;
  }): Promise<string> {
    const service = await prisma.service.create({
      data: {
        vendorId: input.vendorId,
        categoryId: input.categoryId,
        kind: ServiceKind.EVENT,
        title: `Expiration Service ${input.suffix} ${run}`,
        slug: `expiration-service-${input.suffix}-${run}`,
        priceAmount: input.priceAmount ?? 150_000n,
        currency: 'VND',
        status: ServiceStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    serviceIds.push(service.id);
    return service.id;
  }

  async function createSlot(
    input: {
      service?: string;
      day?: number;
      capacity?: number;
    } = {},
  ): Promise<string> {
    const day = input.day ?? slotIds.length + 1;
    const slot = await prisma.slot.create({
      data: {
        serviceId: input.service ?? serviceId,
        startAt: at(day, 2),
        endAt: at(day, 4),
        capacity: input.capacity ?? 10,
        status: SlotStatus.OPEN,
      },
      select: { id: true },
    });
    slotIds.push(slot.id);
    return slot.id;
  }

  function token(identity: Identity): string {
    const payload: JwtPayload = {
      sub: identity.id,
      roles: identity.roles,
      type: 'access',
    };
    return jwt.sign(payload);
  }

  function hold(
    identity: Identity,
    body: Record<string, unknown>,
    idempotencyKey = randomUUID(),
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/bookings/hold')
      .set('Idempotency-Key', idempotencyKey)
      .auth(token(identity), { type: 'bearer' })
      .send(body);
  }

  async function createBookingWithReservations(input: {
    status?: BookingStatus;
    customer?: Identity;
    expiresAt: Date | null;
    expiredAt?: Date | null;
    confirmedAt?: Date | null;
    cancelledAt?: Date | null;
    reservations: Array<{
      slotId?: string;
      quantity?: number;
      status: ReservationStatus;
      expiresAt?: Date | null;
      confirmedAt?: Date | null;
      releasedAt?: Date | null;
    }>;
  }): Promise<{
    bookingId: string;
    reservationIds: string[];
    slotIds: string[];
  }> {
    const createdSlotIds: string[] = [];
    const itemCreates = await Promise.all(
      input.reservations.map(async (reservation, index) => {
        const slotId = reservation.slotId ?? (await createSlot());
        createdSlotIds.push(slotId);
        const slot = await prisma.slot.findUniqueOrThrow({
          where: { id: slotId },
          select: { serviceId: true, startAt: true, endAt: true },
        });

        return {
          serviceId: slot.serviceId,
          slotId,
          quantity: reservation.quantity ?? 1,
          unitPriceAmount: 0n,
          subtotalAmount: 0n,
          currency: 'VND',
          pricingSource: PricingSource.SERVICE,
          serviceTitleSnapshot: `Expiration snapshot ${index} ${run}`,
          slotStartAtSnapshot: slot.startAt,
          slotEndAtSnapshot: slot.endAt,
          reservation: {
            create: {
              slotId,
              quantity: reservation.quantity ?? 1,
              status: reservation.status,
              expiresAt:
                reservation.expiresAt === undefined
                  ? input.expiresAt
                  : reservation.expiresAt,
              confirmedAt: reservation.confirmedAt,
              releasedAt: reservation.releasedAt,
            },
          },
        };
      }),
    );

    const booking = await prisma.booking.create({
      data: {
        bookingCode: `EXP-${run}-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        customerId: input.customer?.id ?? customerA.id,
        vendorId,
        status: input.status ?? BookingStatus.PENDING_PAYMENT,
        currency: 'VND',
        subtotalAmount: 0n,
        totalAmount: 0n,
        expiresAt: input.expiresAt,
        expiredAt: input.expiredAt,
        confirmedAt: input.confirmedAt,
        cancelledAt: input.cancelledAt,
        items: { create: itemCreates },
      },
      include: { items: { include: { reservation: true } } },
    });

    return {
      bookingId: booking.id,
      reservationIds: booking.items.flatMap((item) =>
        item.reservation ? [item.reservation.id] : [],
      ),
      slotIds: createdSlotIds,
    };
  }

  async function createExistingReservation(input: {
    slotId: string;
    quantity: number;
    status: ReservationStatus;
    expiresAt?: Date | null;
  }): Promise<void> {
    const bookingStatus =
      input.status === ReservationStatus.CONFIRMED
        ? BookingStatus.CONFIRMED
        : BookingStatus.PENDING_PAYMENT;
    await createBookingWithReservations({
      status: bookingStatus,
      customer: customerB,
      expiresAt: input.expiresAt ?? null,
      confirmedAt:
        bookingStatus === BookingStatus.CONFIRMED ? new Date() : undefined,
      reservations: [
        {
          slotId: input.slotId,
          quantity: input.quantity,
          status: input.status,
          expiresAt: input.expiresAt ?? null,
        },
      ],
    });
  }

  it('expires one pending-payment Booking and its HELD Reservation atomically', async () => {
    const past = addMs(await databaseNow(), -60_000);
    const { bookingId, reservationIds } = await createBookingWithReservations({
      expiresAt: past,
      reservations: [{ status: ReservationStatus.HELD, expiresAt: past }],
    });

    const result = await expiration.sweepExpiredBookings();

    expect(result.expiredBookings).toBeGreaterThanOrEqual(1);
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { items: { include: { reservation: true } } },
    });
    expect(booking.status).toBe(BookingStatus.EXPIRED);
    expect(booking.expiredAt).not.toBeNull();
    expect(booking.cancelledAt).toBeNull();
    expect(booking.items[0]?.reservation?.id).toBe(reservationIds[0]);
    expect(booking.items[0]?.reservation?.status).toBe(
      ReservationStatus.EXPIRED,
    );
    expect(booking.items[0]?.reservation?.releasedAt).toBeNull();
  });

  it('does not expire not-yet-expired, confirmed, cancelled, or already expired Bookings', async () => {
    const now = await databaseNow();
    const past = addMs(now, -60_000);
    const future = addMs(now, 60 * 60 * 1000);
    const pendingFuture = await createBookingWithReservations({
      expiresAt: future,
      reservations: [{ status: ReservationStatus.HELD, expiresAt: future }],
    });
    const confirmed = await createBookingWithReservations({
      status: BookingStatus.CONFIRMED,
      expiresAt: past,
      confirmedAt: past,
      reservations: [{ status: ReservationStatus.CONFIRMED, expiresAt: past }],
    });
    const cancelled = await createBookingWithReservations({
      status: BookingStatus.CANCELLED,
      expiresAt: past,
      cancelledAt: past,
      reservations: [{ status: ReservationStatus.RELEASED, expiresAt: past }],
    });
    const alreadyExpired = await createBookingWithReservations({
      status: BookingStatus.EXPIRED,
      expiresAt: past,
      expiredAt: past,
      reservations: [{ status: ReservationStatus.EXPIRED, expiresAt: past }],
    });

    await expiration.sweepExpiredBookings();

    await expectBookingStatus(
      pendingFuture.bookingId,
      BookingStatus.PENDING_PAYMENT,
    );
    await expectReservationStatuses(pendingFuture.reservationIds, [
      ReservationStatus.HELD,
    ]);
    await expectBookingStatus(confirmed.bookingId, BookingStatus.CONFIRMED);
    await expectReservationStatuses(confirmed.reservationIds, [
      ReservationStatus.CONFIRMED,
    ]);
    await expectBookingStatus(cancelled.bookingId, BookingStatus.CANCELLED);
    await expectReservationStatuses(cancelled.reservationIds, [
      ReservationStatus.RELEASED,
    ]);
    await expectBookingStatus(alreadyExpired.bookingId, BookingStatus.EXPIRED);
    await expectReservationStatuses(alreadyExpired.reservationIds, [
      ReservationStatus.EXPIRED,
    ]);
  });

  it('only transitions HELD Reservations to EXPIRED inside an expired Booking', async () => {
    const past = addMs(await databaseNow(), -60_000);
    const fixture = await createBookingWithReservations({
      expiresAt: past,
      reservations: [
        { status: ReservationStatus.HELD, expiresAt: past },
        { status: ReservationStatus.EXPIRED, expiresAt: past },
        {
          status: ReservationStatus.RELEASED,
          expiresAt: past,
          releasedAt: past,
        },
      ],
    });

    await expiration.sweepExpiredBookings();

    await expectBookingStatus(fixture.bookingId, BookingStatus.EXPIRED);
    await expectReservationStatuses(fixture.reservationIds, [
      ReservationStatus.EXPIRED,
      ReservationStatus.EXPIRED,
      ReservationStatus.RELEASED,
    ]);
  });

  it('reuses capacity after expiresAt even before finalization, then finalizes without Slot mutation', async () => {
    const slotId = await createSlot({ capacity: 1 });
    const first = await hold(customerA, {
      items: [{ slotId, quantity: 1 }],
    }).expect(201);

    await hold(customerB, { items: [{ slotId, quantity: 1 }] })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('INSUFFICIENT_CAPACITY'));

    const past = addMs(await databaseNow(), -60_000);
    await prisma.booking.update({
      where: { id: first.body.id as string },
      data: { expiresAt: past },
    });
    await prisma.reservation.updateMany({
      where: { bookingItem: { bookingId: first.body.id as string } },
      data: { expiresAt: past },
    });

    await hold(customerB, { items: [{ slotId, quantity: 1 }] }).expect(201);

    await expiration.sweepExpiredBookings();

    const expired = await prisma.booking.findUniqueOrThrow({
      where: { id: first.body.id as string },
      include: { items: { include: { reservation: true } } },
    });
    expect(expired.status).toBe(BookingStatus.EXPIRED);
    expect(expired.items[0]?.reservation?.status).toBe(
      ReservationStatus.EXPIRED,
    );
    const slot = await prisma.slot.findUniqueOrThrow({ where: { id: slotId } });
    expect(slot.capacity).toBe(1);
  });

  it('expires all HELD Reservations in a multi-item Booking together', async () => {
    const past = addMs(await databaseNow(), -60_000);
    const fixture = await createBookingWithReservations({
      expiresAt: past,
      reservations: [
        { status: ReservationStatus.HELD, expiresAt: past },
        { status: ReservationStatus.HELD, expiresAt: past },
        { status: ReservationStatus.HELD, expiresAt: past },
      ],
    });

    await expiration.sweepExpiredBookings();

    await expectBookingStatus(fixture.bookingId, BookingStatus.EXPIRED);
    await expectReservationStatuses(fixture.reservationIds, [
      ReservationStatus.EXPIRED,
      ReservationStatus.EXPIRED,
      ReservationStatus.EXPIRED,
    ]);
  });

  it('is safe for concurrent workers and idempotent reruns', async () => {
    const past = addMs(await databaseNow(), -60_000);
    const fixture = await createBookingWithReservations({
      expiresAt: past,
      reservations: [{ status: ReservationStatus.HELD, expiresAt: past }],
    });

    await expect(
      Promise.all([
        expiration.sweepExpiredBookings(),
        expiration.sweepExpiredBookings(),
      ]),
    ).resolves.toHaveLength(2);
    await expectBookingStatus(fixture.bookingId, BookingStatus.EXPIRED);
    await expectReservationStatuses(fixture.reservationIds, [
      ReservationStatus.EXPIRED,
    ]);

    const rerun = await expiration.sweepExpiredBookings();
    expect(rerun.expiredBookings).toBe(0);
  });

  it('processes bounded batches without starvation', async () => {
    const ancient = new Date('2000-01-01T00:00:00.000Z');
    const fixtures = await Promise.all(
      [0, 1, 2].map((index) =>
        createBookingWithReservations({
          expiresAt: addMs(ancient, index * 1000),
          reservations: [
            {
              status: ReservationStatus.HELD,
              expiresAt: addMs(ancient, index * 1000),
            },
          ],
        }),
      ),
    );

    const first = await expiration.sweepExpiredBookings({ batchSize: 2 });
    expect(first.candidateCount).toBe(2);
    expect(first.expiredBookings).toBe(2);
    const afterFirst = await prisma.booking.findMany({
      where: { id: { in: fixtures.map(({ bookingId }) => bookingId) } },
      orderBy: { expiresAt: 'asc' },
      select: { status: true },
    });
    expect(afterFirst.map(({ status }) => status)).toEqual([
      BookingStatus.EXPIRED,
      BookingStatus.EXPIRED,
      BookingStatus.PENDING_PAYMENT,
    ]);

    const second = await expiration.sweepExpiredBookings({ batchSize: 2 });
    expect(second.expiredBookings).toBe(1);
    for (const fixture of fixtures) {
      await expectBookingStatus(fixture.bookingId, BookingStatus.EXPIRED);
    }
  });

  it('keeps hold capacity semantics aligned with expiration states', async () => {
    const now = await databaseNow();
    const past = addMs(now, -60_000);
    const future = addMs(now, 60 * 60 * 1000);
    const slotId = await createSlot({ capacity: 10 });

    await createExistingReservation({
      slotId,
      quantity: 3,
      status: ReservationStatus.CONFIRMED,
    });
    await createExistingReservation({
      slotId,
      quantity: 4,
      status: ReservationStatus.HELD,
      expiresAt: future,
    });
    await createExistingReservation({
      slotId,
      quantity: 5,
      status: ReservationStatus.HELD,
      expiresAt: past,
    });
    await createExistingReservation({
      slotId,
      quantity: 5,
      status: ReservationStatus.EXPIRED,
      expiresAt: past,
    });
    await createExistingReservation({
      slotId,
      quantity: 5,
      status: ReservationStatus.RELEASED,
      expiresAt: past,
    });

    await hold(customerA, { items: [{ slotId, quantity: 3 }] }).expect(201);
    await hold(customerB, { items: [{ slotId, quantity: 1 }] }).expect(409);
  });

  async function expectBookingStatus(
    bookingId: string,
    status: BookingStatus,
  ): Promise<void> {
    await expect(
      prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status });
  }

  async function expectReservationStatuses(
    reservationIds: string[],
    statuses: ReservationStatus[],
  ): Promise<void> {
    const reservations = await prisma.reservation.findMany({
      where: { id: { in: reservationIds } },
      select: { id: true, status: true },
    });
    const statusById = new Map(
      reservations.map((reservation) => [reservation.id, reservation.status]),
    );
    expect(reservationIds.map((id) => statusById.get(id))).toEqual(statuses);
  }
});
