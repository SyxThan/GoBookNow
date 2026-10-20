import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RoleCode } from '../src/auth/constants/role.constants.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import { BookingStatus, CategoryScope, ServiceKind, ServiceStatus, UserStatus, VendorStatus } from '../src/generated/prisma/client.js';
import { ReviewsModule } from '../src/reviews/reviews.module.js';
import { ensureSystemRoles } from './helpers/system-roles.js';

describe('Verified Booking Reviews (e2e, PostgreSQL)', () => {
  let app: INestApplication; let prisma: PrismaService; let jwt: JwtService;
  const run = randomUUID().slice(0, 8);
  const users: string[] = []; const bookingIds: string[] = []; const slotIds: string[] = [];
  let customerA: string; let customerB: string; let vendorUser: string; let admin: string;
  let vendorId: string; let serviceId: string; let categoryId: string;
  let completedId: string; let concurrentId: string;
  let pastSlot: string; let futureSlot: string; let activeSlot: string;

  function auth(id: string, role: RoleCode) { return { id, role, token: jwt.sign({ sub: id, roles: [role], type: 'access' }) }; }
  function post(id: string, role: RoleCode, bookingId: string, body: object = { rating: 5, comment: 'Rất tốt' }) {
    return request(app.getHttpServer()).post(`/api/v1/bookings/${bookingId}/review`)
      .auth(auth(id, role).token, { type: 'bearer' }).send(body);
  }
  function get(id: string, role: RoleCode, path: string) {
    return request(app.getHttpServer()).get(`/api/v1${path}`).auth(auth(id, role).token, { type: 'bearer' });
  }
  async function createUser(role: RoleCode) {
    const row = await prisma.user.create({ data: { email: `review-${run}-${randomUUID()}@example.com`,
      status: UserStatus.ACTIVE, userRoles: { create: { role: { connect: { code: role } } } } } });
    users.push(row.id); return row.id;
  }
  async function createSlot(startAt: Date, endAt: Date) {
    const row = await prisma.slot.create({ data: { serviceId, startAt, endAt, capacity: 10 } });
    slotIds.push(row.id); return row.id;
  }
  async function createBooking(status: BookingStatus, slots: string[], customerId = customerA) {
    const slotRows = await prisma.slot.findMany({ where: { id: { in: slots } } });
    const byId = new Map(slotRows.map((row) => [row.id, row]));
    const row = await prisma.booking.create({ data: { bookingCode: `REV${run.toUpperCase()}${randomUUID().slice(0, 8).toUpperCase()}`,
      customerId, vendorId, status, currency: 'VND', subtotalAmount: BigInt(slots.length) * 100_000n,
      totalAmount: BigInt(slots.length) * 100_000n,
      items: { create: slots.map((slotId) => ({ serviceId, slotId, quantity: 1,
        unitPriceAmount: 100_000n, subtotalAmount: 100_000n, currency: 'VND', pricingSource: 'SERVICE',
        serviceTitleSnapshot: 'Review test event', slotStartAtSnapshot: byId.get(slotId)!.startAt,
        slotEndAtSnapshot: byId.get(slotId)!.endAt })) } } });
    bookingIds.push(row.id); return row.id;
  }

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule,
      AuthModule, ReviewsModule] }).compile();
    app = fixture.createNestApplication(); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = fixture.get(PrismaService); jwt = fixture.get(JwtService);
    await ensureSystemRoles(prisma);
    customerA = await createUser(RoleCode.CUSTOMER); customerB = await createUser(RoleCode.CUSTOMER);
    vendorUser = await createUser(RoleCode.VENDOR); admin = await createUser(RoleCode.ADMIN);
    const vendor = await prisma.vendor.create({ data: { ownerUserId: vendorUser, displayName: `Review Vendor ${run}`,
      slug: `review-vendor-${run}`, status: VendorStatus.APPROVED } }); vendorId = vendor.id;
    const category = await prisma.category.create({ data: { code: `REVIEW_${run.toUpperCase()}`,
      name: 'Review category', slug: `review-category-${run}`, scope: CategoryScope.EVENT } }); categoryId = category.id;
    const service = await prisma.service.create({ data: { vendorId, categoryId, kind: ServiceKind.EVENT,
      title: 'Review test event', slug: `review-service-${run}`, priceAmount: 100_000n,
      status: ServiceStatus.PUBLISHED } }); serviceId = service.id;
    const now = Date.now();
    pastSlot = await createSlot(new Date(now - 86_400_000), new Date(now - 82_800_000));
    const pastSlotB = await createSlot(new Date(now - 172_800_000), new Date(now - 169_200_000));
    const pastSlotC = await createSlot(new Date(now - 259_200_000), new Date(now - 255_600_000));
    futureSlot = await createSlot(new Date(now + 86_400_000), new Date(now + 90_000_000));
    activeSlot = await createSlot(new Date(now - 3_600_000), new Date(now + 3_600_000));
    completedId = await createBooking(BookingStatus.CONFIRMED, [pastSlot, pastSlotB, pastSlotC]);
    concurrentId = await createBooking(BookingStatus.CONFIRMED, [pastSlot]);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.review.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
      await prisma.slot.deleteMany({ where: { id: { in: slotIds } } });
      if (serviceId) await prisma.service.delete({ where: { id: serviceId } });
      if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
      if (vendorId) await prisma.vendor.delete({ where: { id: vendorId } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    await app?.close();
  });

  it('requires all immutable item end snapshots and CONFIRMED state', async () => {
    const mixed = await createBooking(BookingStatus.CONFIRMED, [pastSlot, futureSlot]);
    const active = await createBooking(BookingStatus.CONFIRMED, [pastSlot, activeSlot]);
    const cases: [BookingStatus, string[]][] = [
      [BookingStatus.PENDING_PAYMENT, [pastSlot]], [BookingStatus.EXPIRED, [pastSlot]],
      [BookingStatus.CANCELLED, [pastSlot]], [BookingStatus.CONFIRMED, []],
    ];
    for (const [status, slots] of cases) {
      const id = await createBooking(status, slots);
      const response = await post(customerA, RoleCode.CUSTOMER, id).expect(409);
      expect(response.body.code).toBe(status === BookingStatus.CANCELLED ? 'REVIEW_BOOKING_CANCELLED' : 'REVIEW_BOOKING_NOT_COMPLETED');
    }
    for (const id of [mixed, active]) {
      const response = await post(customerA, RoleCode.CUSTOMER, id).expect(409);
      expect(response.body.code).toBe('REVIEW_BOOKING_NOT_COMPLETED');
    }
    expect((await get(customerA, RoleCode.CUSTOMER, `/bookings/${completedId}/review/eligibility`).expect(200)).body.eligible).toBe(true);
    // A later live Slot edit cannot change the Booking's immutable end snapshot.
    await prisma.slot.update({ where: { id: pastSlot }, data: { endAt: new Date(Date.now() + 172_800_000) } });
    expect((await get(customerA, RoleCode.CUSTOMER, `/bookings/${completedId}/review/eligibility`).expect(200)).body.eligible).toBe(true);
  });

  it('protects ownership, role, validation, and one-Review uniqueness', async () => {
    await post(customerB, RoleCode.CUSTOMER, completedId).expect(403);
    await post(vendorUser, RoleCode.VENDOR, completedId).expect(403);
    await post(admin, RoleCode.ADMIN, completedId).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/bookings/${completedId}/review`).send({ rating: 5 }).expect(401);
    await post(customerA, RoleCode.CUSTOMER, completedId, { rating: 0 }).expect(400);
    await post(customerA, RoleCode.CUSTOMER, completedId, { rating: 5, customerId: customerB }).expect(400);
    const created = await post(customerA, RoleCode.CUSTOMER, completedId).expect(201);
    expect(created.body).toMatchObject({ bookingId: completedId, rating: 5, comment: 'Rất tốt' });
    const duplicate = await post(customerA, RoleCode.CUSTOMER, completedId).expect(409);
    expect(duplicate.body.code).toBe('REVIEW_ALREADY_EXISTS');
    expect(await prisma.review.count({ where: { bookingId: completedId } })).toBe(1);
  });

  it('serializes concurrent creates into one Review row', async () => {
    const results = await Promise.all([post(customerA, RoleCode.CUSTOMER, concurrentId),
      post(customerA, RoleCode.CUSTOMER, concurrentId)]);
    expect(results.map((result) => result.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await prisma.review.count({ where: { bookingId: concurrentId } })).toBe(1);
  });

  it('updates and soft-deletes only owner content; public count is one per Booking', async () => {
    const review = await prisma.review.findUniqueOrThrow({ where: { bookingId: completedId } });
    const before = await request(app.getHttpServer()).get(`/api/v1/vendors/${vendorId}/reviews`).expect(200);
    expect(before.body.reviewCount).toBe(2); // 3 items in completedId still count once.
    expect(before.body.averageRating).toBe(5);
    await request(app.getHttpServer()).patch(`/api/v1/reviews/${review.id}`)
      .auth(auth(customerB, RoleCode.CUSTOMER).token, { type: 'bearer' }).send({ rating: 1 }).expect(403);
    await request(app.getHttpServer()).patch(`/api/v1/reviews/${review.id}`)
      .auth(auth(customerA, RoleCode.CUSTOMER).token, { type: 'bearer' })
      .send({ rating: 4, comment: '  Tốt  ', bookingId: concurrentId }).expect(400);
    const updated = await request(app.getHttpServer()).patch(`/api/v1/reviews/${review.id}`)
      .auth(auth(customerA, RoleCode.CUSTOMER).token, { type: 'bearer' })
      .send({ rating: 4, comment: '  Tốt  ' }).expect(200);
    expect(updated.body).toMatchObject({ rating: 4, comment: 'Tốt', bookingId: completedId });
    const mine = await get(customerA, RoleCode.CUSTOMER, '/reviews/me?limit=1').expect(200);
    expect(mine.body.pagination.total).toBe(2);
    await request(app.getHttpServer()).delete(`/api/v1/reviews/${review.id}`)
      .auth(auth(customerA, RoleCode.CUSTOMER).token, { type: 'bearer' }).expect(204);
    await request(app.getHttpServer()).delete(`/api/v1/reviews/${review.id}`)
      .auth(auth(customerA, RoleCode.CUSTOMER).token, { type: 'bearer' }).expect(204);
    const after = await request(app.getHttpServer()).get(`/api/v1/vendors/${vendorId}/reviews`).expect(200);
    expect(after.body.reviewCount).toBe(1);
    expect(after.body.averageRating).toBe(5);
    expect(JSON.stringify(after.body)).not.toContain('example.com');
    await get(customerA, RoleCode.CUSTOMER, `/bookings/${completedId}/review`).expect(404);
    expect((await post(customerA, RoleCode.CUSTOMER, completedId).expect(409)).body.code).toBe('REVIEW_ALREADY_EXISTS');
    expect(await prisma.review.count({ where: { bookingId: completedId } })).toBe(1);
  });
});
