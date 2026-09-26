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

describe('Booking reservation hold (e2e, PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const vendorIds: string[] = [];
  const categoryIds: string[] = [];
  const serviceIds: string[] = [];
  const slotIds: string[] = [];
  let customerA: Identity;
  let customerB: Identity;
  let customerC: Identity;
  let vendorUser: Identity;
  let vendorId: string;
  let categoryId: string;
  let serviceId: string;

  beforeAll(async () => {
    process.env.BOOKING_HOLD_TTL_MINUTES = '10';

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
    customerC = await createIdentity([RoleCode.CUSTOMER]);
    vendorUser = await createIdentity([RoleCode.VENDOR]);
    vendorId = await createVendor(vendorUser.id, VendorStatus.APPROVED, 'main');
    categoryId = await createCategory(CategoryScope.EVENT, true, 'main');
    serviceId = await createService({
      vendorId,
      categoryId,
      status: ServiceStatus.PUBLISHED,
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
    return new Date(Date.UTC(2099, 0, day, hour));
  }

  async function createIdentity(roles: Role[]): Promise<Identity> {
    const roleRows = await prisma.role.findMany({
      where: { code: { in: roles } },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        email: `hold-${run}-${randomUUID()}@example.com`,
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
    deletedAt?: Date,
  ): Promise<string> {
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId,
        displayName: `Hold Vendor ${suffix} ${run}`,
        slug: `hold-vendor-${suffix}-${run}`,
        status,
        deletedAt,
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
    deletedAt?: Date,
  ): Promise<string> {
    const category = await prisma.category.create({
      data: {
        code: `HOLD_${suffix.toUpperCase()}_${run.toUpperCase()}`,
        name: `Hold Category ${suffix} ${run}`,
        slug: `hold-category-${suffix}-${run}`,
        scope,
        isActive,
        deletedAt,
      },
      select: { id: true },
    });
    categoryIds.push(category.id);
    return category.id;
  }

  async function createService(input: {
    vendorId: string;
    categoryId: string;
    status: ServiceStatus;
    suffix: string;
    priceAmount?: bigint;
    currency?: string;
    deletedAt?: Date;
  }): Promise<string> {
    const service = await prisma.service.create({
      data: {
        vendorId: input.vendorId,
        categoryId: input.categoryId,
        kind: ServiceKind.EVENT,
        title: `Hold Service ${input.suffix} ${run}`,
        slug: `hold-service-${input.suffix}-${run}`,
        priceAmount: input.priceAmount ?? 150_000n,
        currency: input.currency ?? 'VND',
        status: input.status,
        publishedAt:
          input.status === ServiceStatus.PUBLISHED ? new Date() : undefined,
        deletedAt: input.deletedAt,
      },
      select: { id: true },
    });
    serviceIds.push(service.id);
    return service.id;
  }

  async function createSlot(input: {
    service?: string;
    day?: number;
    capacity?: number;
    status?: SlotStatus;
    priceAmount?: bigint | null;
    deletedAt?: Date;
    past?: boolean;
  }): Promise<string> {
    const day = input.day ?? slotIds.length + 1;
    const slot = await prisma.slot.create({
      data: {
        serviceId: input.service ?? serviceId,
        startAt: input.past ? new Date('2020-01-01T00:00:00.000Z') : at(day, 2),
        endAt: input.past ? new Date('2020-01-01T02:00:00.000Z') : at(day, 4),
        capacity: input.capacity ?? 10,
        priceAmount: input.priceAmount,
        status: input.status ?? SlotStatus.OPEN,
        deletedAt: input.deletedAt,
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
    idempotencyKey: string | null = randomUUID(),
  ) {
    const agent = request(app.getHttpServer()).post('/api/v1/bookings/hold');
    if (idempotencyKey !== null) agent.set('Idempotency-Key', idempotencyKey);
    return agent.auth(token(identity), { type: 'bearer' }).send(body);
  }

  async function createExistingReservation(input: {
    slotId: string;
    quantity: number;
    status: ReservationStatus;
    expiresAt?: Date | null;
  }): Promise<void> {
    const slot = await prisma.slot.findUniqueOrThrow({
      where: { id: input.slotId },
      select: { serviceId: true, service: { select: { vendorId: true } } },
    });
    await prisma.booking.create({
      data: {
        bookingCode: `TEST-${run}-${randomUUID().slice(0, 12)}`,
        customerId: customerC.id,
        vendorId: slot.service.vendorId,
        subtotalAmount: 0n,
        totalAmount: 0n,
        currency: 'VND',
        status:
          input.status === ReservationStatus.CONFIRMED
            ? BookingStatus.CONFIRMED
            : BookingStatus.PENDING_PAYMENT,
        expiresAt: input.expiresAt ?? null,
        items: {
          create: {
            serviceId: slot.serviceId,
            slotId: input.slotId,
            quantity: input.quantity,
            unitPriceAmount: 0n,
            subtotalAmount: 0n,
            currency: 'VND',
            pricingSource: PricingSource.SERVICE,
            serviceTitleSnapshot: 'Existing reservation',
            slotStartAtSnapshot: at(1, 2),
            slotEndAtSnapshot: at(1, 4),
            reservation: {
              create: {
                slotId: input.slotId,
                quantity: input.quantity,
                status: input.status,
                expiresAt: input.expiresAt,
              },
            },
          },
        },
      },
    });
  }

  async function activeQuantity(slotId: string): Promise<number> {
    const now = new Date();
    const result = await prisma.reservation.aggregate({
      where: {
        slotId,
        OR: [
          { status: ReservationStatus.CONFIRMED },
          { status: ReservationStatus.HELD, expiresAt: { gt: now } },
        ],
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  it('validates auth, role, idempotency key, body shape, and trusted fields', async () => {
    const slotId = await createSlot({ capacity: 5 });

    await request(app.getHttpServer())
      .post('/api/v1/bookings/hold')
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ slotId, quantity: 1 }] })
      .expect(401);

    await hold(vendorUser, { items: [{ slotId, quantity: 1 }] }).expect(403);
    await hold(customerA, { items: [{ slotId, quantity: 1 }] }, null).expect(
      400,
    );
    await hold(customerA, { items: [] }).expect(400);
    await hold(customerA, {
      items: Array.from({ length: 11 }, () => ({
        slotId: randomUUID(),
        quantity: 1,
      })),
    }).expect(400);

    for (const quantity of [0, -1, 1.5]) {
      await hold(customerA, { items: [{ slotId, quantity }] }).expect(400);
    }

    await hold(customerA, {
      items: [
        { slotId, quantity: 1 },
        { slotId, quantity: 2 },
      ],
    }).expect(400);
    await hold(customerA, {
      customerId: customerB.id,
      items: [{ slotId, quantity: 1, price: '1' }],
    }).expect(400);
  });

  it('creates a hold only for public OPEN future Slots', async () => {
    const open = await createSlot({ capacity: 2 });
    const response = await hold(customerA, {
      items: [{ slotId: open, quantity: 2 }],
    }).expect(201);
    expect(response.body).toMatchObject({
      status: BookingStatus.PENDING_PAYMENT,
      currency: 'VND',
      subtotalAmount: '300000',
      totalAmount: '300000',
      items: [
        {
          slotId: open,
          quantity: 2,
          unitPriceAmount: '150000',
          reservation: { status: ReservationStatus.HELD },
        },
      ],
    });

    const inactiveCategory = await createCategory(
      CategoryScope.EVENT,
      false,
      'inactive',
    );
    const pendingOwner = await createIdentity([RoleCode.VENDOR]);
    const pendingVendor = await createVendor(
      pendingOwner.id,
      VendorStatus.DRAFT,
      'pending',
    );
    const cases = [
      await createSlot({ status: SlotStatus.CLOSED }),
      await createSlot({ status: SlotStatus.CANCELLED }),
      await createSlot({ deletedAt: new Date() }),
      await createSlot({ past: true }),
      await createSlot({
        service: await createService({
          vendorId,
          categoryId,
          status: ServiceStatus.DRAFT,
          suffix: 'draft',
        }),
      }),
      await createSlot({
        service: await createService({
          vendorId,
          categoryId,
          status: ServiceStatus.HIDDEN,
          suffix: 'hidden',
        }),
      }),
      await createSlot({
        service: await createService({
          vendorId,
          categoryId,
          status: ServiceStatus.ARCHIVED,
          suffix: 'archived',
        }),
      }),
      await createSlot({
        service: await createService({
          vendorId: pendingVendor,
          categoryId,
          status: ServiceStatus.PUBLISHED,
          suffix: 'pending-vendor',
        }),
      }),
      await createSlot({
        service: await createService({
          vendorId,
          categoryId: inactiveCategory,
          status: ServiceStatus.PUBLISHED,
          suffix: 'inactive-category',
        }),
      }),
    ];

    for (const unavailable of cases) {
      await hold(customerB, {
        items: [{ slotId: unavailable, quantity: 1 }],
      }).expect(409);
    }
  });

  it('enforces capacity from CONFIRMED and unexpired HELD reservations only', async () => {
    const exact = await createSlot({ capacity: 10 });
    await hold(customerA, { items: [{ slotId: exact, quantity: 10 }] }).expect(
      201,
    );

    const over = await createSlot({ capacity: 10 });
    await hold(customerA, { items: [{ slotId: over, quantity: 11 }] })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('INSUFFICIENT_CAPACITY'));

    const confirmed = await createSlot({ capacity: 10 });
    await createExistingReservation({
      slotId: confirmed,
      quantity: 7,
      status: ReservationStatus.CONFIRMED,
    });
    await hold(customerA, {
      items: [{ slotId: confirmed, quantity: 3 }],
    }).expect(201);

    const confirmedOver = await createSlot({ capacity: 10 });
    await createExistingReservation({
      slotId: confirmedOver,
      quantity: 7,
      status: ReservationStatus.CONFIRMED,
    });
    await hold(customerA, {
      items: [{ slotId: confirmedOver, quantity: 4 }],
    }).expect(409);

    const held = await createSlot({ capacity: 10 });
    await createExistingReservation({
      slotId: held,
      quantity: 6,
      status: ReservationStatus.HELD,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await hold(customerA, { items: [{ slotId: held, quantity: 4 }] }).expect(
      201,
    );

    const heldOver = await createSlot({ capacity: 10 });
    await createExistingReservation({
      slotId: heldOver,
      quantity: 6,
      status: ReservationStatus.HELD,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await hold(customerA, {
      items: [{ slotId: heldOver, quantity: 5 }],
    }).expect(409);

    const mixed = await createSlot({ capacity: 10 });
    await createExistingReservation({
      slotId: mixed,
      quantity: 3,
      status: ReservationStatus.CONFIRMED,
    });
    await createExistingReservation({
      slotId: mixed,
      quantity: 4,
      status: ReservationStatus.HELD,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await createExistingReservation({
      slotId: mixed,
      quantity: 5,
      status: ReservationStatus.HELD,
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await createExistingReservation({
      slotId: mixed,
      quantity: 5,
      status: ReservationStatus.EXPIRED,
    });
    await createExistingReservation({
      slotId: mixed,
      quantity: 5,
      status: ReservationStatus.RELEASED,
    });
    await hold(customerA, { items: [{ slotId: mixed, quantity: 3 }] }).expect(
      201,
    );
    expect(await activeQuantity(mixed)).toBe(10);
  });

  it('prevents oversell under concurrent requests', async () => {
    const single = await createSlot({ capacity: 1 });
    const singleResponses = await Promise.all([
      hold(customerA, { items: [{ slotId: single, quantity: 1 }] }),
      hold(customerB, { items: [{ slotId: single, quantity: 1 }] }),
    ]);
    expect(
      singleResponses.map(({ status }) => status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    expect(await activeQuantity(single)).toBe(1);

    const split = await createSlot({ capacity: 5 });
    const splitResponses = await Promise.all([
      hold(customerA, { items: [{ slotId: split, quantity: 3 }] }),
      hold(customerB, { items: [{ slotId: split, quantity: 3 }] }),
    ]);
    expect(
      splitResponses.map(({ status }) => status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    expect(await activeQuantity(split)).toBeLessThanOrEqual(5);

    const higher = await createSlot({ capacity: 10 });
    const customers = await Promise.all(
      Array.from({ length: 20 }, () => createIdentity([RoleCode.CUSTOMER])),
    );
    const responses = await Promise.all(
      customers.map((customer) =>
        hold(customer, { items: [{ slotId: higher, quantity: 1 }] }),
      ),
    );
    expect(responses.filter(({ status }) => status === 201)).toHaveLength(10);
    expect(responses.filter(({ status }) => status === 409)).toHaveLength(10);
    expect(await activeQuantity(higher)).toBe(10);
  });

  it('rolls back multi-item holds and rejects multi-vendor bookings atomically', async () => {
    const available = await createSlot({ capacity: 5 });
    const full = await createSlot({ capacity: 1 });
    await createExistingReservation({
      slotId: full,
      quantity: 1,
      status: ReservationStatus.HELD,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const key = randomUUID();
    await hold(
      customerA,
      {
        items: [
          { slotId: available, quantity: 1 },
          { slotId: full, quantity: 1 },
        ],
      },
      key,
    ).expect(409);
    expect(
      await prisma.booking.findFirst({
        where: { customerId: customerA.id, idempotencyKey: key },
      }),
    ).toBeNull();
    expect(
      await prisma.reservation.count({ where: { slotId: available } }),
    ).toBe(0);

    const otherOwner = await createIdentity([RoleCode.VENDOR]);
    const otherVendor = await createVendor(
      otherOwner.id,
      VendorStatus.APPROVED,
      'other',
    );
    const otherService = await createService({
      vendorId: otherVendor,
      categoryId,
      status: ServiceStatus.PUBLISHED,
      suffix: 'other-vendor',
    });
    const otherSlot = await createSlot({ service: otherService, capacity: 5 });
    const multiVendorKey = randomUUID();
    await hold(
      customerA,
      {
        items: [
          { slotId: available, quantity: 1 },
          { slotId: otherSlot, quantity: 1 },
        ],
      },
      multiVendorKey,
    ).expect(400);
    expect(
      await prisma.booking.findFirst({
        where: { customerId: customerA.id, idempotencyKey: multiVendorKey },
      }),
    ).toBeNull();
  });

  it('persists server-side price snapshots, zero-price holds, totals, and TTL', async () => {
    const inherited = await createSlot({ capacity: 10, priceAmount: null });
    const override = await createSlot({ capacity: 10, priceAmount: 120_000n });
    const free = await createSlot({ capacity: 10, priceAmount: 0n });
    const before = Date.now();
    const response = await hold(customerA, {
      items: [
        { slotId: free, quantity: 3 },
        { slotId: inherited, quantity: 2 },
        { slotId: override, quantity: 1 },
      ],
    }).expect(201);

    expect(response.body.subtotalAmount).toBe('420000');
    expect(response.body.totalAmount).toBe('420000');
    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: free,
          unitPriceAmount: '0',
          subtotalAmount: '0',
          pricingSource: PricingSource.SLOT,
        }),
        expect.objectContaining({
          slotId: inherited,
          unitPriceAmount: '150000',
          subtotalAmount: '300000',
          pricingSource: PricingSource.SERVICE,
        }),
        expect.objectContaining({
          slotId: override,
          unitPriceAmount: '120000',
          subtotalAmount: '120000',
          pricingSource: PricingSource.SLOT,
        }),
      ]),
    );

    const expiresAt = new Date(response.body.expiresAt as string);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 9 * 60 * 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 11 * 60 * 1000,
    );
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: response.body.id as string },
      include: { items: { include: { reservation: true } } },
    });
    expect(booking.items).toHaveLength(3);
    for (const item of booking.items) {
      expect(item.reservation?.status).toBe(ReservationStatus.HELD);
      expect(item.reservation?.expiresAt?.toISOString()).toBe(
        booking.expiresAt?.toISOString(),
      );
    }

    await prisma.service.update({
      where: { id: serviceId },
      data: { priceAmount: 999_999n, title: `Changed ${run}` },
    });
    await prisma.slot.update({
      where: { id: override },
      data: { priceAmount: 1n },
    });
    const reloaded = await prisma.bookingItem.findMany({
      where: { bookingId: booking.id },
      orderBy: { slotId: 'asc' },
    });
    expect(
      reloaded.map((item) => ({
        slotId: item.slotId,
        unitPriceAmount: item.unitPriceAmount,
        subtotalAmount: item.subtotalAmount,
      })),
    ).toEqual(
      expect.arrayContaining([
        { slotId: free, unitPriceAmount: 0n, subtotalAmount: 0n },
        {
          slotId: inherited,
          unitPriceAmount: 150_000n,
          subtotalAmount: 300_000n,
        },
        {
          slotId: override,
          unitPriceAmount: 120_000n,
          subtotalAmount: 120_000n,
        },
      ]),
    );
  });

  it('is idempotent for replay, conflicts for changed payloads, and handles same-key concurrency', async () => {
    const replaySlot = await createSlot({ capacity: 5 });
    const replayKey = randomUUID();
    const first = await hold(
      customerA,
      { items: [{ slotId: replaySlot, quantity: 2 }] },
      replayKey,
    ).expect(201);
    const replay = await hold(
      customerA,
      { items: [{ slotId: replaySlot, quantity: 2 }] },
      replayKey,
    ).expect(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(
      await prisma.booking.count({
        where: { customerId: customerA.id, idempotencyKey: replayKey },
      }),
    ).toBe(1);
    expect(await activeQuantity(replaySlot)).toBe(2);
    await hold(
      customerA,
      { items: [{ slotId: replaySlot, quantity: 3 }] },
      replayKey,
    ).expect(409);
    await hold(
      customerA,
      { items: [{ slotId: await createSlot({ capacity: 5 }), quantity: 2 }] },
      replayKey,
    ).expect(409);
    await hold(
      customerA,
      { items: [{ slotId: replaySlot, quantity: 2 }] },
      randomUUID(),
    ).expect(201);

    const expiredReplaySlot = await createSlot({ capacity: 5 });
    const expiredKey = randomUUID();
    const expired = await hold(
      customerA,
      { items: [{ slotId: expiredReplaySlot, quantity: 1 }] },
      expiredKey,
    ).expect(201);
    await prisma.booking.update({
      where: { id: expired.body.id as string },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await prisma.reservation.updateMany({
      where: { bookingItem: { bookingId: expired.body.id as string } },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expiredReplay = await hold(
      customerA,
      { items: [{ slotId: expiredReplaySlot, quantity: 1 }] },
      expiredKey,
    ).expect(200);
    expect(expiredReplay.body.id).toBe(expired.body.id);

    const concurrentSlot = await createSlot({ capacity: 5 });
    const concurrentKey = randomUUID();
    const concurrent = await Promise.all([
      hold(
        customerB,
        { items: [{ slotId: concurrentSlot, quantity: 2 }] },
        concurrentKey,
      ),
      hold(
        customerB,
        { items: [{ slotId: concurrentSlot, quantity: 2 }] },
        concurrentKey,
      ),
    ]);
    expect(
      concurrent.map(({ status }) => status).sort((a, b) => a - b),
    ).toEqual([200, 201]);
    expect(concurrent[0].body.id).toBe(concurrent[1].body.id);
    expect(await activeQuantity(concurrentSlot)).toBe(2);
  });
});
