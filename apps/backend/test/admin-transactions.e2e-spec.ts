import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminTransactionsModule } from '../src/admin-transactions/admin-transactions.module.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { RoleCode } from '../src/auth/constants/role.constants.js';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import { PaymentAttemptStatus, PaymentProvider, PaymentStatus, RefundKind, RefundReason,
  RefundStatus, UserStatus, VendorStatus } from '../src/generated/prisma/client.js';
import { ensureSystemRoles } from './helpers/system-roles.js';

describe('Admin Transactions (e2e, PostgreSQL)', () => {
  let app: INestApplication; let prisma: PrismaService; let jwt: JwtService;
  const run = randomUUID().slice(0, 8);
  const users: string[] = []; const bookings: string[] = []; const payments: string[] = [];
  let adminId: string; let customerId: string; let vendorUserId: string; let vendorId: string;
  let paymentId: string; let bookingCode: string; let email: string; let merchantReference: string;
  const token = (id: string, role: RoleCode) => jwt.sign({ sub: id, roles: [role], type: 'access' });
  const get = (path: string, id = adminId, role = RoleCode.ADMIN) =>
    request(app.getHttpServer()).get(`/api/v1/admin/transactions${path}`)
      .auth(token(id, role), { type: 'bearer' });
  async function user(role: RoleCode) {
    const row = await prisma.user.create({ data: { email: `admin-tx-${run}-${randomUUID()}@example.com`,
      status: UserStatus.ACTIVE, userRoles: { create: { role: { connect: { code: role } } } } } });
    users.push(row.id); return row;
  }
  async function createPayment(status: PaymentStatus, amount: bigint) {
    const booking = await prisma.booking.create({ data: { bookingCode: `ATX${run.toUpperCase()}${randomUUID().slice(0, 8).toUpperCase()}`,
      customerId, vendorId, status: 'CONFIRMED', subtotalAmount: amount, totalAmount: amount } });
    bookings.push(booking.id);
    const payment = await prisma.payment.create({ data: { bookingId: booking.id, status, amount,
      succeededAt: status === PaymentStatus.SUCCEEDED ? new Date() : null } });
    payments.push(payment.id);
    return { booking, payment };
  }
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }),
      PrismaModule, AuthModule, AdminTransactionsModule] }).compile();
    app = fixture.createNestApplication(); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = fixture.get(PrismaService); jwt = fixture.get(JwtService);
    await ensureSystemRoles(prisma);
    adminId = (await user(RoleCode.ADMIN)).id;
    const customer = await user(RoleCode.CUSTOMER); customerId = customer.id; email = customer.email;
    vendorUserId = (await user(RoleCode.VENDOR)).id;
    vendorId = (await prisma.vendor.create({ data: { ownerUserId: vendorUserId,
      displayName: `Admin TX Vendor ${run}`, slug: `admin-tx-${run}`, status: VendorStatus.APPROVED } })).id;
    const first = await createPayment(PaymentStatus.SUCCEEDED, 100_000n);
    paymentId = first.payment.id; bookingCode = first.booking.bookingCode;
    merchantReference = `ATX-REF-${run}`;
    for (const [index, status] of [PaymentAttemptStatus.FAILED, PaymentAttemptStatus.CANCELLED,
      PaymentAttemptStatus.SUCCEEDED].entries()) {
      await prisma.paymentAttempt.create({ data: { paymentId, provider: PaymentProvider.SEPAY,
        status, amount: 100_000n, merchantReference: `${merchantReference}-${index}`,
        providerTransactionId: index === 2 ? `sepay-${run}` : null,
        failedAt: status === PaymentAttemptStatus.FAILED ? new Date() : null,
        succeededAt: status === PaymentAttemptStatus.SUCCEEDED ? new Date() : null,
        failureCode: status === PaymentAttemptStatus.FAILED ? 'TEST_FAILURE' : null } });
    }
    for (const [index, status, amount] of [[0, RefundStatus.SUCCEEDED, 25_000n],
      [1, RefundStatus.SUCCEEDED, 15_000n], [2, RefundStatus.PENDING, 10_000n]] as const) {
      await prisma.refund.create({ data: { paymentId, idempotencyKey: `admin-tx-${run}-${index}`,
        status, kind: RefundKind.PARTIAL, reason: RefundReason.MANUAL_ADJUSTMENT,
        amount, currency: 'VND', succeededAt: status === RefundStatus.SUCCEEDED ? new Date() : null } });
    }
    await createPayment(PaymentStatus.PENDING, 70_000n);
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.refund.deleteMany({ where: { paymentId: { in: payments } } });
      await prisma.paymentAttempt.deleteMany({ where: { paymentId: { in: payments } } });
      await prisma.payment.deleteMany({ where: { id: { in: payments } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookings } } });
      if (vendorId) await prisma.vendor.delete({ where: { id: vendorId } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    await app?.close();
  });
  it('enforces ADMIN RBAC and read-only routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/transactions').expect(401);
    await get('', customerId, RoleCode.CUSTOMER).expect(403);
    await get('', vendorUserId, RoleCode.VENDOR).expect(403);
    await get('').expect(200);
    await request(app.getHttpServer()).post('/api/v1/admin/transactions')
      .auth(token(adminId, RoleCode.ADMIN), { type: 'bearer' }).expect(404);
  });
  it('searches real references, Booking, Customer, statuses and paginates at Payment grain', async () => {
    for (const query of [`search=${paymentId}`, `search=${merchantReference}-1`, `search=sepay-${run}`,
      `bookingCode=${bookingCode}`, `bookingId=${bookings[0]}`, `userId=${customerId}`,
      `userEmail=${encodeURIComponent(email)}`, 'paymentStatus=SUCCEEDED',
      'attemptStatus=FAILED', 'provider=SEPAY']) {
      const response = await get(`?${query}`).expect(200);
      expect(response.body.data.map((row: { id: string }) => row.id)).toContain(paymentId);
    }
    const page = await get('?limit=1&page=2&sort=oldest').expect(200);
    expect(page.body).toMatchObject({ page: 2, limit: 1 });
    expect(page.body.data).toHaveLength(1);
    expect(page.body.total).toBeGreaterThanOrEqual(2);
    await get('?paymentStatus=FAILED').expect(400);
    await get('?page=0').expect(400);
    await get('?from=2026-10-21T00:00:00Z&to=2026-10-20T00:00:00Z').expect(400);
  });
  it('shows all attempts/refunds, decimal-string money and no secret fields', async () => {
    const response = await get(`/${paymentId}`).expect(200);
    expect(response.body).toMatchObject({ status: 'SUCCEEDED', amount: '100000',
      refund: { state: 'PARTIAL', succeededAmount: '40000', pendingAmount: '10000' } });
    expect(response.body.attempts).toHaveLength(3);
    expect(response.body.refunds).toHaveLength(3);
    expect(response.body.timeline.map((event: { type: string }) => event.type)).toContain('REFUND_SUCCEEDED');
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|tokenNonce|qrToken|failureMessage|idempotencyKey/);
    await get(`/${randomUUID()}`).expect(404);
  });
  it('aggregates Payment and Refund independently, without duplicate join counts', async () => {
    const response = await get(`/summary?bookingCode=${bookingCode}`).expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.byStatus.SUCCEEDED).toEqual({ count: 1, amount: '100000' });
    expect(response.body.refunds.SUCCEEDED).toEqual({ count: 2, amount: '40000' });
    expect(response.body.refunds.PENDING).toEqual({ count: 1, amount: '10000' });
  });
});
