import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { RoleCode } from '../src/auth/constants/role.constants.js';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import { BookingStatus, CategoryScope, PaymentStatus, ReservationStatus,
  ServiceKind, ServiceStatus, SlotStatus, UserStatus, VendorStatus } from '../src/generated/prisma/client.js';
import { VendorOperationsModule } from '../src/vendor-operations/vendor-operations.module.js';
import { ensureSystemRoles } from './helpers/system-roles.js';

describe('Vendor operations (e2e, PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const run = randomUUID().slice(0, 8);
  const users: string[] = [];
  const vendors: string[] = [];
  const services: string[] = [];
  const slots: string[] = [];
  const bookings: string[] = [];
  let vendorAUser: string;
  let vendorBUser: string;
  let customer: string;
  let vendorA: string;
  let vendorB: string;
  let serviceA: string;
  let categoryId: string;
  let paidBookingId: string;
  let otherBookingId: string;
  let futureSlotId: string;
  let now: Date;

  const token = (id: string, roles: RoleCode[]) => jwt.sign({ sub: id, roles, type: 'access' });
  const get = (id: string, roles: RoleCode[], path: string) =>
    request(app.getHttpServer()).get(`/api/v1${path}`).auth(token(id, roles), { type: 'bearer' });

  async function user(role: RoleCode) {
    const row = await prisma.user.create({ data: { email: `ops-${run}-${randomUUID()}@example.com`,
      status: UserStatus.ACTIVE, userRoles: { create: { role: { connect: { code: role } } } } } });
    users.push(row.id); return row.id;
  }
  async function vendor(ownerUserId: string) {
    const row = await prisma.vendor.create({ data: { ownerUserId, displayName: `Ops ${run}`,
      slug: `ops-${run}-${randomUUID().slice(0, 8)}`, status: VendorStatus.APPROVED } });
    vendors.push(row.id); return row.id;
  }
  async function service(vendorId: string) {
    const row = await prisma.service.create({ data: { vendorId, categoryId, kind: ServiceKind.EVENT,
      title: `Ops Event ${run}`, slug: `ops-event-${run}-${randomUUID().slice(0, 8)}`,
      priceAmount: 100_000n, currency: 'VND', status: ServiceStatus.PUBLISHED } });
    services.push(row.id); return row.id;
  }
  async function slot(serviceId: string, startAt: Date, capacity = 10, status = SlotStatus.OPEN) {
    const row = await prisma.slot.create({ data: { serviceId, startAt,
      endAt: new Date(startAt.getTime() + 3_600_000), capacity, status } });
    slots.push(row.id); return row.id;
  }
  async function booking(input: { vendorId: string; serviceId: string; slotIds: string[]; status: BookingStatus;
    gross: bigint; discount?: bigint; paid?: boolean; legacy?: boolean; createdAt?: Date; quantities?: number[] }) {
    const slotRows = await prisma.slot.findMany({ where: { id: { in: input.slotIds } }, select: { id: true, startAt: true, endAt: true } });
    const slotById = new Map(slotRows.map((row) => [row.id, row]));
    const discount = input.discount ?? 0n;
    const net = input.gross - discount;
    const fee = net / 10n;
    const itemGross = input.gross / BigInt(input.slotIds.length);
    const itemDiscount = discount / BigInt(input.slotIds.length);
    const itemFee = fee / BigInt(input.slotIds.length);
    const row = await prisma.booking.create({ data: {
      bookingCode: `OPS${run.toUpperCase()}${randomUUID().slice(0, 8).toUpperCase()}`,
      customerId: customer, vendorId: input.vendorId, status: input.status, currency: 'VND',
      subtotalAmount: input.gross, voucherDiscountAmount: discount, totalAmount: net,
      ...(input.legacy ? {} : { commissionBps: 1000, platformFeeAmount: fee, vendorAmount: net - fee,
        commissionSnapshot: { version: 1, basis: 'NET_AFTER_DISCOUNT', commissionBps: 1000,
          grossAmount: input.gross.toString(), discountAmount: discount.toString(),
          netAmount: net.toString(), platformFeeAmount: fee.toString(), vendorAmount: (net - fee).toString() } }),
      createdAt: input.createdAt,
      items: { create: input.slotIds.map((slotId, index) => ({ serviceId: input.serviceId, slotId,
        quantity: input.quantities?.[index] ?? 1, unitPriceAmount: itemGross / BigInt(input.quantities?.[index] ?? 1),
        subtotalAmount: itemGross, voucherDiscountAmount: itemDiscount,
        ...(input.legacy ? {} : { platformFeeAmount: itemFee, vendorAmount: itemGross - itemDiscount - itemFee }),
        currency: 'VND', pricingSource: 'SERVICE', serviceTitleSnapshot: `Ops Event ${run}`,
        slotStartAtSnapshot: slotById.get(slotId)!.startAt,
        slotEndAtSnapshot: slotById.get(slotId)!.endAt,
        reservation: { create: { slotId, quantity: input.quantities?.[index] ?? 1,
          status: input.status === BookingStatus.CONFIRMED ? ReservationStatus.CONFIRMED :
            input.status === BookingStatus.CANCELLED ? ReservationStatus.RELEASED : ReservationStatus.EXPIRED } },
      })) },
      ...(input.paid ? { payment: { create: { status: PaymentStatus.SUCCEEDED,
        amount: net, currency: 'VND', succeededAt: now } } } : {}),
    }, include: { payment: true } });
    bookings.push(row.id); return row;
  }

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }),
      PrismaModule, AuthModule, VendorOperationsModule] }).compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = fixture.get(PrismaService); jwt = fixture.get(JwtService);
    await ensureSystemRoles(prisma);
    now = new Date();
    vendorAUser = await user(RoleCode.VENDOR); vendorBUser = await user(RoleCode.VENDOR);
    customer = await user(RoleCode.CUSTOMER);
    vendorA = await vendor(vendorAUser); vendorB = await vendor(vendorBUser);
    const category = await prisma.category.create({ data: { code: `OPS_${run.toUpperCase()}`,
      name: 'Ops category', slug: `ops-category-${run}`, scope: CategoryScope.EVENT } });
    categoryId = category.id;
    serviceA = await service(vendorA); const serviceB = await service(vendorB);
    futureSlotId = await slot(serviceA, new Date(now.getTime() + 86_400_000), 10);
    const pastSlot = await slot(serviceA, new Date(now.getTime() - 86_400_000), 20);
    const paid = await booking({ vendorId: vendorA, serviceId: serviceA, slotIds: [futureSlotId, pastSlot],
      status: BookingStatus.CONFIRMED, gross: 500_000n, discount: 60_000n, paid: true });
    paidBookingId = paid.id;
    await prisma.refund.createMany({ data: [
      { paymentId: paid.payment!.id, idempotencyKey: randomUUID(), status: 'SUCCEEDED', kind: 'PARTIAL',
        reason: 'MANUAL_ADJUSTMENT', amount: 100_000n, currency: 'VND', succeededAt: now },
      { paymentId: paid.payment!.id, idempotencyKey: randomUUID(), status: 'PENDING', kind: 'PARTIAL',
        reason: 'MANUAL_ADJUSTMENT', amount: 50_000n, currency: 'VND' },
    ] });
    const cancelled = await booking({ vendorId: vendorA, serviceId: serviceA,
      slotIds: [await slot(serviceA, new Date(now.getTime() + 86_400_000))],
      status: BookingStatus.CANCELLED, gross: 100_000n, paid: true });
    await prisma.refund.create({ data: { paymentId: cancelled.payment!.id, idempotencyKey: randomUUID(),
      status: 'SUCCEEDED', kind: 'FULL', reason: 'BOOKING_CANCELLATION', amount: 100_000n,
      currency: 'VND', succeededAt: now } });
    await booking({ vendorId: vendorA, serviceId: serviceA,
      slotIds: [await slot(serviceA, new Date(now.getTime() - 86_400_000))],
      status: BookingStatus.EXPIRED, gross: 200_000n });
    await booking({ vendorId: vendorA, serviceId: serviceA,
      slotIds: [await slot(serviceA, new Date(now.getTime() - 86_400_000))],
      status: BookingStatus.CONFIRMED, gross: 50_000n, paid: true, legacy: true });
    const other = await booking({ vendorId: vendorB, serviceId: serviceB,
      slotIds: [await slot(serviceB, new Date(now.getTime() + 86_400_000))],
      status: BookingStatus.CONFIRMED, gross: 999_000n, paid: true });
    otherBookingId = other.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.refund.deleteMany({ where: { payment: { bookingId: { in: bookings } } } });
      await prisma.payment.deleteMany({ where: { bookingId: { in: bookings } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookings } } });
      await prisma.slot.deleteMany({ where: { id: { in: slots } } });
      await prisma.service.deleteMany({ where: { id: { in: services } } });
      if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
      await prisma.vendor.deleteMany({ where: { id: { in: vendors } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    await app?.close();
  });

  it('scopes list and detail to the approved Vendor', async () => {
    const own = await get(vendorAUser, [RoleCode.VENDOR], '/vendor/bookings?status=UPCOMING').expect(200);
    expect(own.body.data.map((row: { bookingId: string }) => row.bookingId)).toContain(paidBookingId);
    expect(own.body.data.map((row: { bookingId: string }) => row.bookingId)).not.toContain(otherBookingId);
    await get(vendorBUser, [RoleCode.VENDOR], `/vendor/bookings/${paidBookingId}`).expect(404);
    await get(customer, [RoleCode.CUSTOMER], '/vendor/bookings').expect(403);
    await request(app.getHttpServer()).get('/api/v1/vendor/bookings').expect(401);
    const detail = await get(vendorAUser, [RoleCode.VENDOR], `/vendor/bookings/${paidBookingId}`).expect(200);
    expect(detail.body).toMatchObject({ grossAmount: '500000', discountAmount: '60000', netAmount: '440000',
      platformFeeAmount: '44000', vendorAmount: '396000',
      refunds: { succeededAmount: '100000', pendingAmount: '50000' },
      retained: { netAmount: '340000', projectedNetAfterPending: '290000',
        platformFeeAmount: '34000', vendorAmount: '306000' } });
    expect(detail.body.items).toHaveLength(2);
    expect(JSON.stringify(detail.body)).not.toContain('tokenNonce');
  });

  it('filters operational status, pagination, search, and rejects invalid query', async () => {
    const all = await get(vendorAUser, [RoleCode.VENDOR], '/vendor/bookings?status=ALL&limit=2&page=1').expect(200);
    expect(all.body.pagination.total).toBe(4);
    expect(all.body.data).toHaveLength(2);
    const completed = await get(vendorAUser, [RoleCode.VENDOR], '/vendor/bookings?status=COMPLETED').expect(200);
    expect(completed.body.data).toHaveLength(1);
    const cancelled = await get(vendorAUser, [RoleCode.VENDOR], '/vendor/bookings?status=CANCELLED').expect(200);
    expect(cancelled.body.data).toHaveLength(1);
    const searched = await get(vendorAUser, [RoleCode.VENDOR], `/vendor/bookings?search=${encodeURIComponent((await prisma.booking.findUniqueOrThrow({ where: { id: paidBookingId } })).bookingCode)}`).expect(200);
    expect(searched.body.pagination.total).toBe(1);
    await get(vendorAUser, [RoleCode.VENDOR], '/vendor/bookings?limit=101').expect(400);
    await get(vendorAUser, [RoleCode.VENDOR], '/vendor/bookings?from=2026-10-20T00:00:00Z&to=2026-10-19T00:00:00Z').expect(400);
  });

  it('uses payment cohorts, refund states, commission coverage, and isolates Vendor analytics', async () => {
    const from = new Date(now.getTime() - 86_400_000).toISOString();
    const to = new Date(now.getTime() + 86_400_000).toISOString();
    const dashboard = await get(vendorAUser, [RoleCode.VENDOR], `/vendor/dashboard/overview?from=${from}&to=${to}`).expect(200);
    expect(dashboard.body.bookings).toMatchObject({ total: 4, confirmed: 2, cancelled: 1, paid: 3,
      paidCancelled: 1, cancellationRateBps: 3333 });
    expect(dashboard.body.financial).toMatchObject({ paidRevenue: '590000', succeededRefunds: '200000',
      pendingRefunds: '50000', netRetainedRevenue: '390000', estimatedPlatformFee: '34000',
      estimatedVendorEarnings: '306000', commissionUnknownBookingCount: 1 });
    const other = await get(vendorBUser, [RoleCode.VENDOR], `/vendor/dashboard/overview?from=${from}&to=${to}`).expect(200);
    expect(other.body.financial.paidRevenue).toBe('999000');
    await get(customer, [RoleCode.CUSTOMER], '/vendor/dashboard/overview').expect(403);
  });

  it('calculates quantity-aware occupancy and excludes cancelled Slots and expired holds', async () => {
    const historical = new Date('2020-01-01T00:00:00.000Z');
    const start = new Date(now.getTime() + 12 * 3_600_000);
    const first = await slot(serviceA, start, 10);
    const second = await slot(serviceA, new Date(start.getTime() + 4 * 3_600_000), 20, SlotStatus.CLOSED);
    const cancelled = await slot(serviceA, new Date(start.getTime() + 8 * 3_600_000), 5, SlotStatus.CANCELLED);
    await booking({ vendorId: vendorA, serviceId: serviceA, slotIds: [first], status: BookingStatus.CONFIRMED,
      gross: 700_000n, quantities: [7], createdAt: historical });
    await booking({ vendorId: vendorA, serviceId: serviceA, slotIds: [second], status: BookingStatus.CONFIRMED,
      gross: 800_000n, quantities: [8], createdAt: historical });
    const held = await booking({ vendorId: vendorA, serviceId: serviceA, slotIds: [first], status: BookingStatus.PENDING_PAYMENT,
      gross: 200_000n, quantities: [2], createdAt: historical });
    await prisma.reservation.updateMany({ where: { bookingItem: { bookingId: held.id } },
      data: { status: ReservationStatus.HELD, expiresAt: new Date(now.getTime() + 3_600_000) } });
    const expiredHold = await booking({ vendorId: vendorA, serviceId: serviceA, slotIds: [second], status: BookingStatus.PENDING_PAYMENT,
      gross: 500_000n, quantities: [5], createdAt: historical });
    await prisma.reservation.updateMany({ where: { bookingItem: { bookingId: expiredHold.id } },
      data: { status: ReservationStatus.HELD, expiresAt: new Date(now.getTime() - 3_600_000) } });
    await booking({ vendorId: vendorA, serviceId: serviceA, slotIds: [cancelled], status: BookingStatus.CANCELLED,
      gross: 500_000n, quantities: [5], createdAt: historical });
    const from = new Date(now.getTime() + 3_600_000).toISOString();
    const to = new Date(now.getTime() + 2 * 86_400_000).toISOString();
    const response = await get(vendorAUser, [RoleCode.VENDOR], `/vendor/dashboard/occupancy?from=${from}&to=${to}`).expect(200);
    expect(response.body.occupancy).toEqual({ confirmedQuantity: 16, activeHeldQuantity: 2,
      totalCapacity: 50, rateBps: 3200 });
  });
});
