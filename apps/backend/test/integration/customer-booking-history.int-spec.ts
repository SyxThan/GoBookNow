import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { integrationSuite } from './helpers/test-app.js';

describe('Customer booking history and recovery', () => {
  const context = integrationSuite();

  it('returns an empty, owned history and rejects anonymous or non-customer callers', async () => {
    const { app, fixtures: f } = context();
    const customer = await f.createCustomer();
    const admin = await f.createAdmin();
    const url = '/api/v1/bookings/me';
    await request(app.getHttpServer()).get(url).expect(401);
    await request(app.getHttpServer())
      .get(url)
      .auth(f.token(admin), { type: 'bearer' })
      .expect(403);
    const result = await request(app.getHttpServer())
      .get(url)
      .auth(f.token(customer), { type: 'bearer' })
      .expect(200);
    expect(result.body).toMatchObject({ items: [], total: 0, page: 1 });
  });

  it('lists historical and fresh multi-item holds once, sorted and paginated, without leaking other customers', async () => {
    const { app, fixtures: f, prisma } = context();
    const scenario = await f.createScenario({ slots: 2 });
    const other = await f.createCustomer();
    const first = await f.createBookingHoldFixture(scenario, [2, 1]);
    const second = await f.createBookingHoldFixture(scenario, [1, 1]);
    const otherBooking = await prisma.booking.create({
      data: {
        bookingCode: `GBK-OTHER-${randomUUID().slice(0, 8)}`,
        customerId: other.id,
        vendorId: scenario.vendor.id,
        status: 'PENDING_PAYMENT',
        subtotalAmount: 10n,
        totalAmount: 10n,
        currency: 'VND',
      },
    });
    const get = (path: string) =>
      request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .auth(f.token(scenario.customer), { type: 'bearer' });
    const list = await get('/bookings/me').expect(200);
    expect(list.body.total).toBe(2);
    expect(
      list.body.items.map((booking: { id: string }) => booking.id),
    ).toEqual([second.id, first.id]);
    expect(list.body.items[1]).toMatchObject({
      bookingStatus: 'PENDING_PAYMENT',
      displayStatus: 'WAITING_PAYMENT',
      paymentSummary: null,
      canInitiatePayment: true,
      totalAmount: first.totalAmount.toString(),
    });
    expect(list.body.items[1].items).toHaveLength(2);
    expect(JSON.stringify(list.body)).not.toMatch(
      /tokenNonce|formFields|secretKey|providerTransactionId/,
    );
    const page = await get(
      '/bookings/me?status=PENDING_PAYMENT&page=2&limit=1',
    ).expect(200);
    expect(page.body).toMatchObject({ total: 2, page: 2, totalPages: 2 });
    expect(page.body.items).toHaveLength(1);
    expect(
      (
        await get(
          `/bookings/me?search=${encodeURIComponent(first.bookingCode)}`,
        ).expect(200)
      ).body.total,
    ).toBe(1);
    expect(
      (await get('/bookings/me?search=Integration%20event').expect(200)).body
        .total,
    ).toBe(2);
    const today = new Date(Date.now() + 7 * 60 * 60_000)
      .toISOString()
      .slice(0, 10);
    expect(
      (await get(`/bookings/me?from=${today}&to=${today}`).expect(200)).body
        .total,
    ).toBe(2);
    await get('/bookings/me?limit=101').expect(400);
    expect(
      (await get(`/bookings/${otherBooking.id}`).expect(404)).body.message,
    ).toBe('Booking not found');
    await request(app.getHttpServer())
      .post('/api/v1/payments/sepay')
      .auth(f.token(scenario.customer), { type: 'bearer' })
      .send({ bookingId: otherBooking.id })
      .expect(403);
    expect(
      (await get(`/bookings/${first.id}`).expect(200)).body.items,
    ).toHaveLength(2);
    expect(await prisma.booking.count()).toBe(3);
    expect(await prisma.payment.count()).toBe(0);
  });

  it('shows an initiated attempt as pending and confirms only after valid IPN', async () => {
    const { app, fixtures: f, prisma } = context();
    const scenario = await f.createScenario();
    const booking = await f.createBookingHoldFixture(scenario);
    const payment = await f.createPaymentFixture(scenario.customer, booking.id);
    const get = () =>
      request(app.getHttpServer())
        .get(`/api/v1/bookings/${booking.id}`)
        .auth(f.token(scenario.customer), { type: 'bearer' });
    const pending = await get().expect(200);
    expect(pending.body).toMatchObject({
      bookingStatus: 'PENDING_PAYMENT',
      displayStatus: 'WAITING_CONFIRMATION',
      canInitiatePayment: false,
      paymentSummary: {
        paymentId: payment.paymentId,
        status: 'PENDING',
        merchantReference: payment.merchantReference,
      },
    });
    await get().expect(200);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.paymentAttempt.count()).toBe(1);
    await f.sendIpn(f.ipn(payment)).expect(200);
    const confirmed = await get().expect(200);
    expect(confirmed.body).toMatchObject({
      bookingStatus: 'CONFIRMED',
      displayStatus: 'CONFIRMED',
      paymentSummary: { status: 'SUCCEEDED' },
    });
    expect(confirmed.body.canInitiatePayment).toBe(false);
    expect(confirmed.body.ticketCount).toBeGreaterThan(0);
  });

  it('keeps expired holds visible and never offers payment continuation', async () => {
    const { app, fixtures: f } = context();
    const scenario = await f.createScenario();
    const booking = await f.createBookingHoldFixture(scenario);
    await f.backdate(booking.id);
    await f.sweep();
    const result = await request(app.getHttpServer())
      .get(`/api/v1/bookings/${booking.id}`)
      .auth(f.token(scenario.customer), { type: 'bearer' })
      .expect(200);
    expect(result.body).toMatchObject({
      bookingStatus: 'EXPIRED',
      displayStatus: 'EXPIRED',
      canInitiatePayment: false,
      ticketCount: 0,
    });
  });

  it('shows late payment as an expired booking with a pending correction refund', async () => {
    const { app, fixtures: f } = context();
    const scenario = await f.createScenario();
    const booking = await f.createBookingHoldFixture(scenario);
    const payment = await f.createPaymentFixture(scenario.customer, booking.id);
    await f.backdate(booking.id);
    await f.sweep();
    await f.sendIpn(f.ipn(payment)).expect(200);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/bookings/${booking.id}`)
      .auth(f.token(scenario.customer), { type: 'bearer' })
      .expect(200);
    expect(response.body).toMatchObject({
      bookingStatus: 'EXPIRED',
      displayStatus: 'REFUND_PENDING',
      canInitiatePayment: false,
      ticketCount: 0,
      paymentSummary: { status: 'SUCCEEDED' },
      refunds: [{ status: 'PENDING', reason: 'SYSTEM_CORRECTION' }],
    });
  });

  it('shows a cancelled booking and its pending refund without offering payment', async () => {
    const { app, fixtures: f, prisma } = context();
    const scenario = await f.createScenario();
    const confirmed = await f.createConfirmedReservationFixture(scenario);
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { bookingId: confirmed.id },
    });
    await prisma.booking.update({
      where: { id: confirmed.id },
      data: { status: 'CANCELLED' },
    });
    await prisma.refund.create({
      data: {
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        kind: 'FULL',
        reason: 'BOOKING_CANCELLATION',
        status: 'PENDING',
        idempotencyKey: `history-${randomUUID()}`,
      },
    });
    const response = await request(app.getHttpServer())
      .get(`/api/v1/bookings/${confirmed.id}`)
      .auth(f.token(scenario.customer), { type: 'bearer' })
      .expect(200);
    expect(response.body).toMatchObject({
      bookingStatus: 'CANCELLED',
      displayStatus: 'REFUND_PENDING',
      canInitiatePayment: false,
      refunds: [{ status: 'PENDING' }],
    });
  });
});
