import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from '../src/auth/auth.module.js';
import {
  RoleCode,
  type RoleCode as Role,
} from '../src/auth/constants/role.constants.js';
import type { JwtPayload } from '../src/auth/types/jwt-payload.type.js';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  CategoryScope,
  ServiceKind,
  ServiceStatus,
  SlotStatus,
  UserStatus,
  VendorStatus,
} from '../src/generated/prisma/client.js';
import { PricingService } from '../src/pricing/pricing.service.js';
import { SlotsModule } from '../src/slots/slots.module.js';

type Identity = { id: string; roles: Role[] };

describe('Slot availability (e2e, PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let pricing: PricingService;
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const vendorIds: string[] = [];
  const serviceIds: string[] = [];
  const categoryIds: string[] = [];
  let vendorA: Identity;
  let vendorB: Identity;
  let customer: Identity;
  let admin: Identity;
  let unapprovedVendor: Identity;
  let vendorAId: string;
  let unapprovedVendorId: string;
  let serviceCategoryId: string;
  let eventCategoryId: string;
  let serviceAId: string;
  let serviceBId: string;
  let eventServiceId: string;
  let archivedServiceId: string;
  let draftServiceId: string;
  let hiddenServiceId: string;
  let nonApprovedServiceId: string;
  let publicServiceId: string;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        SlotsModule,
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
    pricing = fixture.get(PricingService);

    await Promise.all(
      Object.values(RoleCode).map((code) =>
        prisma.role.upsert({
          where: { code },
          update: {},
          create: { code, name: code, isSystem: true },
        }),
      ),
    );
    vendorA = await createIdentity([RoleCode.VENDOR]);
    vendorB = await createIdentity([RoleCode.VENDOR]);
    customer = await createIdentity([RoleCode.CUSTOMER]);
    admin = await createIdentity([RoleCode.ADMIN]);
    unapprovedVendor = await createIdentity([RoleCode.VENDOR]);
    vendorAId = await createVendor(vendorA, VendorStatus.APPROVED, 'Slot A');
    await createVendor(vendorB, VendorStatus.APPROVED, 'Slot B');
    unapprovedVendorId = await createVendor(
      unapprovedVendor,
      VendorStatus.DRAFT,
      'Slot Pending',
    );
    serviceCategoryId = await createCategory(
      CategoryScope.SERVICE,
      'Service Slot',
    );
    eventCategoryId = await createCategory(CategoryScope.EVENT, 'Event Slot');
    serviceAId = await createService({
      vendorId: vendorAId,
      categoryId: serviceCategoryId,
      kind: ServiceKind.SERVICE,
      status: ServiceStatus.PUBLISHED,
      durationMinutes: 60,
      suffix: 'service-a',
    });
    serviceBId = await createService({
      vendorId: vendorAId,
      categoryId: serviceCategoryId,
      kind: ServiceKind.SERVICE,
      status: ServiceStatus.PUBLISHED,
      durationMinutes: 60,
      suffix: 'service-b',
    });
    eventServiceId = await createService({
      vendorId: vendorAId,
      categoryId: eventCategoryId,
      kind: ServiceKind.EVENT,
      status: ServiceStatus.PUBLISHED,
      durationMinutes: null,
      suffix: 'event',
    });
    archivedServiceId = await createService({
      vendorId: vendorAId,
      categoryId: eventCategoryId,
      kind: ServiceKind.EVENT,
      status: ServiceStatus.ARCHIVED,
      durationMinutes: null,
      suffix: 'archived',
    });
    draftServiceId = await createService({
      vendorId: vendorAId,
      categoryId: eventCategoryId,
      kind: ServiceKind.EVENT,
      status: ServiceStatus.DRAFT,
      durationMinutes: null,
      suffix: 'draft',
    });
    hiddenServiceId = await createService({
      vendorId: vendorAId,
      categoryId: eventCategoryId,
      kind: ServiceKind.EVENT,
      status: ServiceStatus.HIDDEN,
      durationMinutes: null,
      suffix: 'hidden',
    });
    nonApprovedServiceId = await createService({
      vendorId: unapprovedVendorId,
      categoryId: eventCategoryId,
      kind: ServiceKind.EVENT,
      status: ServiceStatus.PUBLISHED,
      durationMinutes: null,
      suffix: 'not-approved',
    });
    publicServiceId = await createService({
      vendorId: vendorAId,
      categoryId: eventCategoryId,
      kind: ServiceKind.EVENT,
      status: ServiceStatus.PUBLISHED,
      durationMinutes: null,
      suffix: 'public',
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.slot.deleteMany({
        where: { serviceId: { in: serviceIds } },
      });
      await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
      await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  function at(day: number, hour: number, minute = 0): string {
    return new Date(Date.UTC(2099, 0, day, hour, minute)).toISOString();
  }

  async function createIdentity(roles: Role[]): Promise<Identity> {
    const roleRows = await prisma.role.findMany({
      where: { code: { in: roles } },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        email: `slot-${run}-${randomUUID()}@example.com`,
        status: UserStatus.ACTIVE,
        userRoles: { create: roleRows.map(({ id }) => ({ roleId: id })) },
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return { id: user.id, roles };
  }

  async function createVendor(
    identity: Identity,
    status: VendorStatus,
    name: string,
  ): Promise<string> {
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId: identity.id,
        displayName: `${name} ${run}`,
        slug: `${name.toLowerCase().replaceAll(' ', '-')}-${run}`,
        status,
      },
      select: { id: true },
    });
    vendorIds.push(vendor.id);
    return vendor.id;
  }

  async function createCategory(
    scope: CategoryScope,
    name: string,
  ): Promise<string> {
    const category = await prisma.category.create({
      data: {
        code: `${scope}_SLOT_${run.toUpperCase()}`,
        name: `${name} ${run}`,
        slug: `${name.toLowerCase().replaceAll(' ', '-')}-${run}`,
        scope,
      },
      select: { id: true },
    });
    categoryIds.push(category.id);
    return category.id;
  }

  async function createService(input: {
    vendorId: string;
    categoryId: string;
    kind: ServiceKind;
    status: ServiceStatus;
    durationMinutes: number | null;
    suffix: string;
  }): Promise<string> {
    const service = await prisma.service.create({
      data: {
        vendorId: input.vendorId,
        categoryId: input.categoryId,
        kind: input.kind,
        title: `Slot ${input.suffix} ${run}`,
        slug: `slot-${input.suffix}-${run}`,
        priceAmount: 1000n,
        durationMinutes: input.durationMinutes,
        status: input.status,
        publishedAt:
          input.status === ServiceStatus.PUBLISHED ? new Date() : undefined,
      },
      select: { id: true },
    });
    serviceIds.push(service.id);
    return service.id;
  }

  async function token(identity: Identity): Promise<string> {
    const payload: JwtPayload = {
      sub: identity.id,
      roles: identity.roles,
      type: 'access',
    };
    return jwt.signAsync(payload);
  }

  async function createSlot(
    identity: Identity,
    serviceId: string,
    body: Record<string, unknown>,
    expectedStatus = 201,
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceId}/slots`)
      .auth(await token(identity), { type: 'bearer' })
      .send(body)
      .expect(expectedStatus);
  }

  async function directSlot(input: {
    serviceId: string;
    startAt: string;
    endAt: string;
    capacity?: number;
    status?: SlotStatus;
    priceAmount?: bigint | null;
    deletedAt?: Date;
  }) {
    return prisma.slot.create({
      data: {
        serviceId: input.serviceId,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        capacity: input.capacity ?? 10,
        priceAmount: input.priceAmount,
        status: input.status ?? SlotStatus.OPEN,
        deletedAt: input.deletedAt,
      },
    });
  }

  it('enforces auth, role, ownership, Vendor approval, Service state, and capacity', async () => {
    const valid = { startAt: at(1, 0), endAt: at(1, 1), capacity: 1 };
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceBId}/slots`)
      .send(valid)
      .expect(401);
    await createSlot(customer, serviceBId, valid, 403);
    await createSlot(admin, serviceBId, valid, 403);
    await createSlot(vendorB, serviceBId, valid, 403);
    await createSlot(unapprovedVendor, nonApprovedServiceId, valid, 403);
    await createSlot(vendorA, archivedServiceId, valid, 409);
    await createSlot(vendorA, draftServiceId, {
      startAt: at(7, 0),
      endAt: at(7, 1),
      capacity: 10,
    });
    await createSlot(vendorA, hiddenServiceId, {
      startAt: at(8, 0),
      endAt: at(8, 1),
      capacity: 10,
    });

    const created = await createSlot(vendorA, serviceBId, valid);
    expect(created.body).toMatchObject({
      serviceId: serviceBId,
      capacity: 1,
      status: SlotStatus.OPEN,
    });
    for (const capacity of [0, -1, 1.5, 100_001]) {
      await createSlot(
        vendorA,
        serviceBId,
        { startAt: at(2, 0), endAt: at(2, 1), capacity },
        400,
      );
    }
    await createSlot(
      vendorA,
      serviceBId,
      { ...valid, serviceId: archivedServiceId, status: SlotStatus.CLOSED },
      400,
    );
  });

  it('validates absolute ISO timestamps, ordering, future start, and timezone instants', async () => {
    for (const body of [
      { startAt: at(3, 0), endAt: at(3, 0), capacity: 10 },
      { startAt: at(3, 1), endAt: at(3, 0), capacity: 10 },
      {
        startAt: '2020-01-01T00:00:00.000Z',
        endAt: '2020-01-01T01:00:00.000Z',
        capacity: 10,
      },
      { startAt: 'not-a-date', endAt: at(3, 1), capacity: 10 },
      {
        startAt: '2099-01-03T00:00:00',
        endAt: '2099-01-03T01:00:00',
        capacity: 10,
      },
    ]) {
      await createSlot(vendorA, eventServiceId, body, 400);
    }

    const offset = await createSlot(vendorA, serviceAId, {
      startAt: '2099-01-04T09:00:00+07:00',
      endAt: '2099-01-04T10:00:00+07:00',
      capacity: 10,
    });
    expect(offset.body.startAt).toBe('2099-01-04T02:00:00.000Z');
    expect(offset.body.endAt).toBe('2099-01-04T03:00:00.000Z');
    const stored = await prisma.slot.findUniqueOrThrow({
      where: { id: offset.body.id as string },
    });
    expect(stored.startAt.toISOString()).toBe('2099-01-04T02:00:00.000Z');

    await createSlot(
      vendorA,
      serviceAId,
      { startAt: at(5, 0), endAt: at(5, 0, 30), capacity: 10 },
      400,
    );
    const event = await createSlot(vendorA, eventServiceId, {
      startAt: at(5, 0),
      endAt: at(5, 1, 30),
      capacity: 100,
    });
    expect(event.body.capacity).toBe(100);
  });

  it('enforces the database time and capacity CHECK constraints', async () => {
    await expect(
      directSlot({
        serviceId: eventServiceId,
        startAt: at(6, 0),
        endAt: at(6, 0),
      }),
    ).rejects.toBeTruthy();
    await expect(
      directSlot({
        serviceId: eventServiceId,
        startAt: at(6, 0),
        endAt: at(6, 1),
        capacity: 0,
      }),
    ).rejects.toBeTruthy();
  });

  it('rejects all overlap shapes, allows adjacency, and respects status/deletion', async () => {
    const anchor = await createSlot(vendorA, eventServiceId, {
      startAt: at(10, 9),
      endAt: at(10, 10),
      capacity: 10,
    });
    for (const [startAt, endAt] of [
      [at(10, 9), at(10, 10)],
      [at(10, 8, 30), at(10, 9, 30)],
      [at(10, 9, 30), at(10, 10, 30)],
      [at(10, 9, 15), at(10, 9, 45)],
      [at(10, 8, 30), at(10, 10, 30)],
    ]) {
      await createSlot(
        vendorA,
        eventServiceId,
        { startAt, endAt, capacity: 10 },
        409,
      );
    }
    await createSlot(vendorA, eventServiceId, {
      startAt: at(10, 10),
      endAt: at(10, 11),
      capacity: 10,
    });

    await request(app.getHttpServer())
      .post(
        `/api/v1/vendor/services/${eventServiceId}/slots/${anchor.body.id}/close`,
      )
      .auth(await token(vendorA), { type: 'bearer' })
      .expect(201);
    await createSlot(
      vendorA,
      eventServiceId,
      { startAt: at(10, 9), endAt: at(10, 10), capacity: 10 },
      409,
    );
    await request(app.getHttpServer())
      .post(
        `/api/v1/vendor/services/${eventServiceId}/slots/${anchor.body.id}/cancel`,
      )
      .auth(await token(vendorA), { type: 'bearer' })
      .expect(201);
    await createSlot(vendorA, eventServiceId, {
      startAt: at(10, 9),
      endAt: at(10, 10),
      capacity: 10,
    });

    const deleted = await createSlot(vendorA, eventServiceId, {
      startAt: at(11, 9),
      endAt: at(11, 10),
      capacity: 10,
    });
    await request(app.getHttpServer())
      .delete(
        `/api/v1/vendor/services/${eventServiceId}/slots/${deleted.body.id}`,
      )
      .auth(await token(vendorA), { type: 'bearer' })
      .expect(204);
    await createSlot(vendorA, eventServiceId, {
      startAt: at(11, 9),
      endAt: at(11, 10),
      capacity: 10,
    });

    const vendorToken = await token(vendorA);
    const concurrent = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(`/api/v1/vendor/services/${eventServiceId}/slots`)
          .auth(vendorToken, { type: 'bearer' })
          .send({
            startAt: at(12, 9),
            endAt: at(12, 10),
            capacity: 10,
          }),
      ),
    );
    expect(
      concurrent.map(({ status }) => status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    expect(
      await prisma.slot.count({
        where: {
          serviceId: eventServiceId,
          startAt: new Date(at(12, 9)),
          deletedAt: null,
        },
      }),
    ).toBe(1);
  });

  it('supports vendor list/detail/update and enforces ownership on every mutation', async () => {
    const created = await createSlot(vendorA, serviceBId, {
      startAt: at(20, 0),
      endAt: at(20, 1),
      capacity: 10,
    });
    const slotId = created.body.id as string;
    const vendorToken = await token(vendorA);
    const list = await request(app.getHttpServer())
      .get(
        `/api/v1/vendor/services/${serviceBId}/slots?status=OPEN&from=${encodeURIComponent(at(19, 23, 30))}&to=${encodeURIComponent(at(20, 0, 30))}&page=1&limit=1`,
      )
      .auth(vendorToken, { type: 'bearer' })
      .expect(200);
    expect(list.body).toMatchObject({ page: 1, limit: 1 });
    expect(
      list.body.items.some((slot: { id: string }) => slot.id === slotId),
    ).toBe(true);
    await request(app.getHttpServer())
      .get(`/api/v1/vendor/services/${serviceBId}/slots`)
      .auth(await token(vendorB), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/vendor/services/${serviceBId}/slots/${slotId}`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/vendor/services/${serviceAId}/slots/${slotId}`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(404);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/vendor/services/${serviceBId}/slots/${slotId}`)
      .auth(vendorToken, { type: 'bearer' })
      .send({ capacity: 25 })
      .expect(200);
    expect(updated.body.capacity).toBe(25);
    await request(app.getHttpServer())
      .patch(`/api/v1/vendor/services/${serviceBId}/slots/${slotId}`)
      .auth(vendorToken, { type: 'bearer' })
      .send({ status: SlotStatus.CANCELLED, serviceId: eventServiceId })
      .expect(400);

    const vendorBToken = await token(vendorB);
    await request(app.getHttpServer())
      .patch(`/api/v1/vendor/services/${serviceBId}/slots/${slotId}`)
      .auth(vendorBToken, { type: 'bearer' })
      .send({ capacity: 30 })
      .expect(403);
    for (const action of ['close', 'open', 'cancel']) {
      await request(app.getHttpServer())
        .post(`/api/v1/vendor/services/${serviceBId}/slots/${slotId}/${action}`)
        .auth(vendorBToken, { type: 'bearer' })
        .expect(403);
    }
    await request(app.getHttpServer())
      .delete(`/api/v1/vendor/services/${serviceBId}/slots/${slotId}`)
      .auth(vendorBToken, { type: 'bearer' })
      .expect(403);
  });

  it('supports inherited, overridden, free, and reset Slot pricing', async () => {
    const inherited = await createSlot(vendorA, eventServiceId, {
      startAt: at(25, 0),
      endAt: at(25, 1),
      capacity: 10,
    });
    expect(inherited.body).toMatchObject({
      priceAmount: null,
      effectivePrice: {
        amount: '1000',
        currency: 'VND',
        source: 'SERVICE',
      },
    });

    const overridden = await createSlot(vendorA, eventServiceId, {
      startAt: at(26, 0),
      endAt: at(26, 1),
      capacity: 10,
      priceAmount: '1200',
    });
    expect(overridden.body).toMatchObject({
      priceAmount: '1200',
      effectivePrice: {
        amount: '1200',
        currency: 'VND',
        source: 'SLOT',
      },
    });

    const path = `/api/v1/vendor/services/${eventServiceId}/slots/${overridden.body.id}`;
    const vendorToken = await token(vendorA);
    const free = await request(app.getHttpServer())
      .patch(path)
      .auth(vendorToken, { type: 'bearer' })
      .send({ priceAmount: '0' })
      .expect(200);
    expect(free.body).toMatchObject({
      priceAmount: '0',
      effectivePrice: { amount: '0', currency: 'VND', source: 'SLOT' },
    });

    const reset = await request(app.getHttpServer())
      .patch(path)
      .auth(vendorToken, { type: 'bearer' })
      .send({ priceAmount: null })
      .expect(200);
    expect(reset.body).toMatchObject({
      priceAmount: null,
      effectivePrice: {
        amount: '1000',
        currency: 'VND',
        source: 'SERVICE',
      },
    });

    await request(app.getHttpServer())
      .post(`${path}/close`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(path)
      .auth(vendorToken, { type: 'bearer' })
      .send({ priceAmount: '1300' })
      .expect(200)
      .expect(({ body }) =>
        expect(body.effectivePrice).toEqual({
          amount: '1300',
          currency: 'VND',
          source: 'SLOT',
        }),
      );

    for (const priceAmount of [
      '-1',
      '12.5',
      '1,000',
      'abc',
      ' ',
      '9223372036854775808',
    ]) {
      await createSlot(
        vendorA,
        eventServiceId,
        {
          startAt: at(27, 0),
          endAt: at(27, 1),
          capacity: 10,
          priceAmount,
        },
        400,
      );
    }
  });

  it('keeps captured prices immutable after Service and Slot price changes', async () => {
    const inherited = await directSlot({
      serviceId: serviceAId,
      startAt: at(27, 0),
      endAt: at(27, 1),
      priceAmount: null,
    });
    await prisma.service.update({
      where: { id: serviceAId },
      data: { priceAmount: 100_000n },
    });
    const firstInherited = await pricing.createSlotSnapshot(inherited.id, 2);
    await prisma.service.update({
      where: { id: serviceAId },
      data: { priceAmount: 150_000n },
    });
    const secondInherited = await pricing.createSlotSnapshot(inherited.id, 2);
    expect(firstInherited.unitPriceAmount).toBe(100_000n);
    expect(firstInherited.subtotalAmount).toBe(200_000n);
    expect(secondInherited.unitPriceAmount).toBe(150_000n);
    expect(Object.isFrozen(firstInherited)).toBe(true);

    const overridden = await directSlot({
      serviceId: eventServiceId,
      startAt: at(28, 0),
      endAt: at(28, 1),
      priceAmount: 120_000n,
    });
    const firstOverride = await pricing.createSlotSnapshot(overridden.id, 1);
    await prisma.slot.update({
      where: { id: overridden.id },
      data: { priceAmount: 180_000n },
    });
    const secondOverride = await pricing.createSlotSnapshot(overridden.id, 1);
    expect(firstOverride.unitPriceAmount).toBe(120_000n);
    expect(secondOverride.unitPriceAmount).toBe(180_000n);

    await prisma.slot.update({
      where: { id: overridden.id },
      data: { priceAmount: 0n },
    });
    expect(await pricing.createSlotSnapshot(overridden.id, 3)).toMatchObject({
      unitPriceAmount: 0n,
      subtotalAmount: 0n,
      pricingSource: 'SLOT',
    });

    await prisma.slot.update({
      where: { id: overridden.id },
      data: { priceAmount: 9_007_199_254_740_993n },
    });
    expect(await pricing.createSlotSnapshot(overridden.id, 2)).toMatchObject({
      unitPriceAmount: 9_007_199_254_740_993n,
      subtotalAmount: 18_014_398_509_481_986n,
    });
  });

  it('enforces OPEN/CLOSED/CANCELLED transitions and future reopening', async () => {
    const first = await createSlot(vendorA, serviceBId, {
      startAt: at(30, 0),
      endAt: at(30, 1),
      capacity: 10,
    });
    const firstPath = `/api/v1/vendor/services/${serviceBId}/slots/${first.body.id}`;
    const vendorToken = await token(vendorA);
    await request(app.getHttpServer())
      .post(`${firstPath}/close`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe(SlotStatus.CLOSED));
    await request(app.getHttpServer())
      .post(`${firstPath}/close`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`${firstPath}/open`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe(SlotStatus.OPEN));
    await request(app.getHttpServer())
      .post(`${firstPath}/cancel`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${firstPath}/open`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`${firstPath}/close`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(409);

    const second = await createSlot(vendorA, serviceBId, {
      startAt: at(31, 0),
      endAt: at(31, 1),
      capacity: 10,
    });
    const secondPath = `/api/v1/vendor/services/${serviceBId}/slots/${second.body.id}`;
    await request(app.getHttpServer())
      .post(`${secondPath}/close`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${secondPath}/cancel`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(201);

    const past = await directSlot({
      serviceId: serviceBId,
      startAt: '2020-01-01T00:00:00.000Z',
      endAt: '2020-01-01T01:00:00.000Z',
      status: SlotStatus.CLOSED,
    });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceBId}/slots/${past.id}/open`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(409);
  });

  it('revalidates duration/overlap on update and blocks started or cancelled Slots', async () => {
    const anchor = await createSlot(vendorA, eventServiceId, {
      startAt: at(40, 0),
      endAt: at(40, 2),
      capacity: 10,
    });
    const mover = await createSlot(vendorA, eventServiceId, {
      startAt: at(41, 0),
      endAt: at(41, 1),
      capacity: 10,
    });
    const moverPath = `/api/v1/vendor/services/${eventServiceId}/slots/${mover.body.id}`;
    const vendorToken = await token(vendorA);
    await request(app.getHttpServer())
      .patch(moverPath)
      .auth(vendorToken, { type: 'bearer' })
      .send({ startAt: at(40, 1), endAt: at(40, 3) })
      .expect(409);
    await request(app.getHttpServer())
      .patch(moverPath)
      .auth(vendorToken, { type: 'bearer' })
      .send({ startAt: at(42, 0), endAt: at(42, 3), capacity: 20 })
      .expect(200);
    expect(anchor.body.status).toBe(SlotStatus.OPEN);

    const serviceSlot = await createSlot(vendorA, serviceAId, {
      startAt: at(43, 0),
      endAt: at(43, 1),
      capacity: 10,
    });
    await request(app.getHttpServer())
      .patch(
        `/api/v1/vendor/services/${serviceAId}/slots/${serviceSlot.body.id}`,
      )
      .auth(vendorToken, { type: 'bearer' })
      .send({ endAt: at(43, 0, 30) })
      .expect(400);

    const started = await directSlot({
      serviceId: serviceAId,
      startAt: '2020-01-02T00:00:00.000Z',
      endAt: '2020-01-02T01:00:00.000Z',
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/vendor/services/${serviceAId}/slots/${started.id}`)
      .auth(vendorToken, { type: 'bearer' })
      .send({ priceAmount: '2000' })
      .expect(409);

    const cancelled = await directSlot({
      serviceId: eventServiceId,
      startAt: at(44, 0),
      endAt: at(44, 1),
      status: SlotStatus.CANCELLED,
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/vendor/services/${eventServiceId}/slots/${cancelled.id}`)
      .auth(vendorToken, { type: 'bearer' })
      .send({ priceAmount: '2000' })
      .expect(409);
  });

  it('soft-deletes only future Slots and excludes deleted rows from management', async () => {
    const future = await createSlot(vendorA, serviceBId, {
      startAt: at(50, 0),
      endAt: at(50, 1),
      capacity: 10,
    });
    const path = `/api/v1/vendor/services/${serviceBId}/slots/${future.body.id}`;
    const vendorToken = await token(vendorA);
    await request(app.getHttpServer())
      .delete(path)
      .auth(vendorToken, { type: 'bearer' })
      .expect(204);
    const row = await prisma.slot.findUniqueOrThrow({
      where: { id: future.body.id as string },
    });
    expect(row.deletedAt).toBeInstanceOf(Date);
    await request(app.getHttpServer())
      .get(path)
      .auth(vendorToken, { type: 'bearer' })
      .expect(404);
    const list = await request(app.getHttpServer())
      .get(`/api/v1/vendor/services/${serviceBId}/slots`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(200);
    expect(
      list.body.items.some(
        (slot: { id: string }) => slot.id === future.body.id,
      ),
    ).toBe(false);

    const past = await directSlot({
      serviceId: serviceBId,
      startAt: '2020-02-01T00:00:00.000Z',
      endAt: '2020-02-01T01:00:00.000Z',
    });
    await request(app.getHttpServer())
      .delete(`/api/v1/vendor/services/${serviceBId}/slots/${past.id}`)
      .auth(vendorToken, { type: 'bearer' })
      .expect(409);
  });

  it('returns only ordered future OPEN Slots for a publicly visible Service', async () => {
    const first = await directSlot({
      serviceId: publicServiceId,
      startAt: at(70, 8),
      endAt: at(70, 12),
      capacity: 100,
    });
    const second = await directSlot({
      serviceId: publicServiceId,
      startAt: at(71, 8),
      endAt: at(71, 9),
      capacity: 20,
      priceAmount: 2500n,
    });
    await directSlot({
      serviceId: publicServiceId,
      startAt: at(72, 8),
      endAt: at(72, 9),
      status: SlotStatus.CLOSED,
    });
    await directSlot({
      serviceId: publicServiceId,
      startAt: at(73, 8),
      endAt: at(73, 9),
      status: SlotStatus.CANCELLED,
    });
    await directSlot({
      serviceId: publicServiceId,
      startAt: at(74, 8),
      endAt: at(74, 9),
      deletedAt: new Date(),
    });
    await directSlot({
      serviceId: publicServiceId,
      startAt: '2020-03-01T00:00:00.000Z',
      endAt: '2020-03-01T01:00:00.000Z',
    });

    const list = await request(app.getHttpServer())
      .get(`/api/v1/services/${publicServiceId}/slots?page=1&limit=20`)
      .expect(200);
    expect(list.body.items.map((slot: { id: string }) => slot.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(list.body.items[0]).toEqual({
      id: first.id,
      startAt: at(70, 8),
      endAt: at(70, 12),
      capacity: 100,
      status: SlotStatus.OPEN,
      price: { amount: '1000', currency: 'VND', source: 'SERVICE' },
    });
    expect(list.body.items[0]).not.toHaveProperty('priceAmount');
    expect(list.body.items[0]).not.toHaveProperty('remainingCapacity');
    expect(list.body.items[0]).not.toHaveProperty('serviceId');
    expect(list.body.items[1].price).toEqual({
      amount: '2500',
      currency: 'VND',
      source: 'SLOT',
    });

    const ranged = await request(app.getHttpServer())
      .get(
        `/api/v1/services/${publicServiceId}/slots?from=${encodeURIComponent(at(70, 10))}&to=${encodeURIComponent(at(70, 11))}`,
      )
      .expect(200);
    expect(ranged.body.items.map((slot: { id: string }) => slot.id)).toEqual([
      first.id,
    ]);
    await request(app.getHttpServer())
      .get(
        `/api/v1/services/${publicServiceId}/slots?from=${encodeURIComponent(at(70, 11))}&to=${encodeURIComponent(at(70, 10))}`,
      )
      .expect(400);
  });

  it('hides Slots when the parent Service or Vendor is not publicly visible', async () => {
    for (const serviceId of [
      draftServiceId,
      hiddenServiceId,
      archivedServiceId,
      nonApprovedServiceId,
    ]) {
      await directSlot({
        serviceId,
        startAt: at(80, 0),
        endAt: at(80, 1),
      });
      await request(app.getHttpServer())
        .get(`/api/v1/services/${serviceId}/slots`)
        .expect(404);
    }
    await request(app.getHttpServer())
      .get(`/api/v1/services/${randomUUID()}/slots`)
      .expect(404);
  });
});
