import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminTransactionsModule } from '../../src/admin-transactions/admin-transactions.module.js';
import { VendorOperationsModule } from '../../src/vendor-operations/vendor-operations.module.js';
import { ServicesModule } from '../../src/services/services.module.js';
import { SlotsModule } from '../../src/slots/slots.module.js';
import { ReviewsModule } from '../../src/reviews/reviews.module.js';
import { RoleCode } from '../../src/auth/constants/role.constants.js';
import { integrationSuite } from './helpers/test-app.js';

describe('Security: real HTTP and PostgreSQL', () => {
  const suite = integrationSuite([
    AdminTransactionsModule,
    VendorOperationsModule,
    ServicesModule,
    SlotsModule,
    ReviewsModule,
  ]);
  const api = () => request(suite().app.getHttpServer());

  it('limits failed logins, rejects forged proxy bypass and resets the short test window', async () => {
    const config = suite().app.get(ConfigService);
    config.set('RATE_LIMIT_AUTH_IP', 3);
    config.set('RATE_LIMIT_WINDOW_MS', 1500);
    try {
      for (let i = 0; i < 3; i++)
        await api()
          .post('/api/v1/auth/login')
          .send({
            email: 'missing@example.invalid',
            password: 'synthetic-bad-password',
          })
          .expect(401);
      const blocked = await api()
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '203.0.113.77')
        .send({
          email: 'different@example.invalid',
          password: 'synthetic-bad-password',
        })
        .expect(429);
      expect(blocked.body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(blocked.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      await expect
        .poll(
          async () =>
            (
              await api()
                .post('/api/v1/auth/login')
                .send({
                  email: 'missing@example.invalid',
                  password: 'synthetic-bad-password',
                })
            ).status,
          { timeout: 4000 },
        )
        .toBe(401);
      await api().get('/api/v1/health').expect(404); // module intentionally absent; no authentication bypass.
    } finally {
      config.set('RATE_LIMIT_AUTH_IP', 20);
      config.set('RATE_LIMIT_WINDOW_MS', 60_000);
    }
  });

  it.each([
    '/api/v1/admin/transactions',
    '/api/v1/vendor/bookings',
    '/api/v1/vendor/dashboard/overview',
  ])('requires authentication at %s', async (path) => {
    await api().get(path).expect(401);
    await api().get(path).auth('not-a-jwt', { type: 'bearer' }).expect(401);
    const customer = await suite().fixtures.createCustomer();
    const expired = suite()
      .app.get(JwtService)
      .sign(
        { sub: customer.id, roles: ['CUSTOMER'], type: 'access' },
        { expiresIn: -1 },
      );
    await api().get(path).auth(expired, { type: 'bearer' }).expect(401);
  });

  it('rejects Customer/Vendor access to Admin, Customer access to Vendor and Admin-only access to Vendor', async () => {
    const { fixtures } = suite();
    const customer = await fixtures.createCustomer();
    const vendor = await fixtures.createIdentity([RoleCode.VENDOR]);
    const admin = await fixtures.createAdmin();
    for (const user of [customer, vendor])
      await api()
        .get('/api/v1/admin/transactions')
        .auth(fixtures.token(user), { type: 'bearer' })
        .expect(403);
    for (const user of [customer, admin])
      await api()
        .get('/api/v1/vendor/bookings')
        .auth(fixtures.token(user), { type: 'bearer' })
        .expect(403);
    await api()
      .get('/api/v1/vendor/dashboard/overview')
      .auth(fixtures.token(vendor), { type: 'bearer' })
      .expect(403);
    await api()
      .get('/api/v1/admin/transactions')
      .auth(fixtures.token(admin), { type: 'bearer' })
      .expect(200);
  });

  it('honors role revocation despite an unexpired previously privileged JWT', async () => {
    const { fixtures, prisma } = suite();
    const admin = await fixtures.createAdmin();
    const token = fixtures.token(admin);
    await api()
      .get('/api/v1/admin/transactions')
      .auth(token, { type: 'bearer' })
      .expect(200);
    await prisma.userRole.deleteMany({ where: { userId: admin.id } });
    await api()
      .get('/api/v1/admin/transactions')
      .auth(token, { type: 'bearer' })
      .expect(403);
  });

  it('prevents cross-Customer Booking, Payment, Ticket QR, cancellation and Review access without mutation', async () => {
    const { fixtures, prisma } = suite();
    const scenario = await fixtures.createScenario();
    const booking = await fixtures.createConfirmedReservationFixture(scenario);
    const stranger = await fixtures.createCustomer();
    const token = fixtures.token(stranger);
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { bookingItem: { bookingId: booking.id } },
    });
    for (const path of [
      `/api/v1/bookings/${booking.id}/tickets`,
      `/api/v1/payments/${booking.payment!.id}`,
      `/api/v1/tickets/${ticket.id}/qr`,
    ]) {
      const result = await api().get(path).auth(token, { type: 'bearer' });
      expect([403, 404]).toContain(result.status);
      expect(result.body).not.toHaveProperty('amount');
      expect(result.body).not.toHaveProperty('tickets');
    }
    await api()
      .post(`/api/v1/bookings/${booking.id}/cancellation/preview`)
      .auth(token, { type: 'bearer' })
      .expect(403);
    await api()
      .post(`/api/v1/bookings/${booking.id}/cancel`)
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(403);
    await api()
      .post(`/api/v1/bookings/${booking.id}/review`)
      .auth(token, { type: 'bearer' })
      .send({ rating: 5, comment: 'untrusted' })
      .expect(403);
    expect(await fixtures.loadBooking(booking.id)).toEqual(booking);
    expect(await prisma.refund.count()).toBe(0);
    expect(await prisma.review.count()).toBe(0);
    expect(await prisma.ticket.count()).toBe(1);
  });

  it('prevents cross-Vendor Booking, Services, Slots and Ticket validation/check-in access', async () => {
    const { fixtures, prisma } = suite();
    const scenario = await fixtures.createScenario();
    const booking = await fixtures.createConfirmedReservationFixture(scenario);
    const other = await fixtures.createApprovedVendor();
    const token = fixtures.token({
      id: other.ownerUserId,
      roles: [RoleCode.VENDOR],
    });
    await api()
      .get(`/api/v1/vendor/bookings/${booking.id}`)
      .auth(token, { type: 'bearer' })
      .expect(404);
    const serviceResult = await api()
      .patch(`/api/v1/vendor/services/${scenario.service.id}`)
      .auth(token, { type: 'bearer' })
      .send({ title: 'unauthorized mutation' });
    expect([403, 404]).toContain(serviceResult.status);
    const slotResult = await api()
      .patch(
        `/api/v1/vendor/services/${scenario.service.id}/slots/${scenario.slots[0]!.id}`,
      )
      .auth(token, { type: 'bearer' })
      .send({ capacity: 999 });
    expect([403, 404]).toContain(slotResult.status);
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { bookingItem: { bookingId: booking.id } },
    });
    // Real QR credentials generated by the existing signing service, never logged.
    const { TicketTokenService } =
      await import('../../src/tickets/ticket-token.service.js');
    const credential = suite()
      .app.get(TicketTokenService)
      .generateToken(ticket);
    for (const action of ['validate', 'check-in']) {
      const result = await api()
        .post(`/api/v1/vendor/tickets/${action}`)
        .auth(token, { type: 'bearer' })
        .send({ token: credential });
      expect([403, 404]).toContain(result.status);
    }
    expect(
      (await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
        .status,
    ).toBe('ISSUED');
    expect(
      (
        await prisma.slot.findUniqueOrThrow({
          where: { id: scenario.slots[0]!.id },
        })
      ).capacity,
    ).toBe(10);
  });

  it('provides explicit credentialed preflight only to allowed origins, and blocks cross-site cookie auth', async () => {
    const origin = 'http://127.0.0.1:3000';
    const result = await api()
      .options('/api/v1/bookings/hold')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'Authorization, Content-Type, Idempotency-Key, X-Request-Id',
      )
      .expect(204);
    expect(result.headers['access-control-allow-origin']).toBe(origin);
    expect(result.headers['access-control-allow-credentials']).toBe('true');
    expect(result.headers['access-control-allow-headers']).toContain(
      'Idempotency-Key',
    );
    const rejected = await api()
      .options('/api/v1/bookings/hold')
      .set('Origin', 'https://attacker.example.invalid')
      .set('Access-Control-Request-Method', 'POST');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
    await api()
      .post('/api/v1/auth/refresh')
      .set('Origin', 'https://attacker.example.invalid')
      .set('Cookie', 'gobook_refresh_token=synthetic')
      .expect(403);
    await api()
      .post('/api/v1/auth/logout')
      .set('Sec-Fetch-Site', 'cross-site')
      .set('Cookie', 'gobook_refresh_token=synthetic')
      .expect(403);
  });

  it('sets API headers, generates canonical IDs and never trusts arbitrary client correlation', async () => {
    const supplied = randomUUID();
    const response = await api()
      .get('/api/v1/admin/transactions')
      .set('X-Request-Id', supplied)
      .expect(401);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-request-id']).not.toBe(supplied);
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    const invalid = await api()
      .get('/missing?accessToken=must-never-log')
      .set('X-Request-Id', 'untrusted-secret-text');
    expect(invalid.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects unknown money/identity fields, invalid UUIDs and oversized JSON without creating business rows', async () => {
    const { fixtures, prisma } = suite();
    const scenario = await fixtures.createScenario();
    const token = fixtures.token(scenario.customer);
    for (const extra of [
      { totalAmount: '1' },
      { customerId: randomUUID() },
      { platformFee: 0 },
      { commission: 0 },
      { discountAmount: 1 },
    ]) {
      await api()
        .post('/api/v1/bookings/hold')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', randomUUID())
        .send({
          items: [{ slotId: scenario.slots[0]!.id, quantity: 1 }],
          ...extra,
        })
        .expect(400);
    }
    await api()
      .post('/api/v1/bookings/hold')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ slotId: 'not-uuid', quantity: -1 }] })
      .expect(400);
    await api()
      .get('/api/v1/payments/not-uuid')
      .auth(token, { type: 'bearer' })
      .expect(400);
    const tooLarge = await api()
      .post('/api/v1/bookings/hold')
      .auth(token, { type: 'bearer' })
      .send({ payload: 'x'.repeat(270_000) })
      .expect(413);
    expect(tooLarge.body).not.toHaveProperty('stack');
    expect(await prisma.booking.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
  });

  it('does not impose the low auth quota on authenticated webhook duplicates without Origin', async () => {
    const { fixtures, prisma } = suite();
    const scenario = await fixtures.createScenario();
    const booking = await fixtures.createBookingHoldFixture(scenario);
    const payment = await fixtures.createPaymentFixture(
      scenario.customer,
      booking.id,
    );
    const body = fixtures.ipn(payment);
    for (let i = 0; i < 25; i++) await fixtures.sendIpn(body).expect(200);
    expect((await fixtures.loadBooking(booking.id)).status).toBe('CONFIRMED');
    expect(await prisma.ticket.count()).toBe(1);
  });
});
