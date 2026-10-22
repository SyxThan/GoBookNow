import request from 'supertest';
import { PAYMENT_CHECKOUT_PROVIDER } from '../../src/payments/providers/payment-checkout-provider.js';
import { integrationSuite } from './helpers/test-app.js';
import { contendOnRow } from './helpers/concurrency.js';

describe('Payment edge cases: durable money facts and exactly-once entitlements', () => {
  const context = integrationSuite();
  afterEach(() => vi.restoreAllMocks());

  it.each(['amount', 'currency', 'invalid-order-amount'] as const)(
    'durably retains the approved transaction when provider %s fields disagree',
    async (mismatch) => {
      const { fixtures: f, prisma } = context();
      const s = await f.createScenario();
      const b = await f.createBookingHoldFixture(s);
      const p = await f.createPaymentFixture(s.customer, b.id);
      const before = await f.loadBooking(b.id);
      const body = f.ipn(p);
      if (mismatch === 'amount') body.transaction.transaction_amount = '200000';
      if (mismatch === 'currency') body.order.order_currency = 'USD';
      if (mismatch === 'invalid-order-amount')
        body.order.order_amount = 'invalid';
      await f.sendIpn(body).expect(200);
      const facts = await prisma.paymentReconciliation.findMany();
      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({
        receivedAmount: mismatch === 'amount' ? 200_000n : 250_000n,
        currency: 'VND',
        providerTransactionId: body.transaction.transaction_id,
        reason:
          mismatch === 'invalid-order-amount'
            ? 'PROVIDER_INVALID_AMOUNT'
            : `PROVIDER_${mismatch.toUpperCase()}_MISMATCH`,
      });
      expect(await f.loadBooking(b.id)).toEqual(before);
      expect(await prisma.ticket.count()).toBe(0);
    },
  );

  it.each(['', 'Bearer synthetic-secret', 'wrong-header'])(
    'rejects malformed authentication %j without tickets or financial mutation',
    async (secret) => {
      const { fixtures: f, prisma, app } = context();
      const s = await f.createScenario();
      const b = await f.createBookingHoldFixture(s);
      const p = await f.createPaymentFixture(s.customer, b.id);
      const before = await f.loadBooking(b.id);
      const call = request(app.getHttpServer())
        .post('/api/v1/webhooks/sepay/ipn')
        .send(f.ipn(p));
      await call
        .set(secret === 'wrong-header' ? 'X-API-Key' : 'X-Secret-Key', secret)
        .expect(401);
      expect(await f.loadBooking(b.id)).toEqual(before);
      expect(await prisma.ticket.count()).toBe(0);
      expect(await prisma.paymentReconciliation.count()).toBe(0);
    },
  );

  it.each([
    'order',
    'transaction',
    'notification_type',
    'order.order_invoice_number',
    'transaction.transaction_id',
    'transaction.transaction_amount',
    'transaction.transaction_currency',
  ])('rejects missing %s safely against PostgreSQL', async (path) => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario();
    const b = await f.createBookingHoldFixture(s);
    const p = await f.createPaymentFixture(s.customer, b.id);
    const before = await f.loadBooking(b.id);
    const body: Record<string, any> = f.ipn(p);
    const [parent, key] = path.split('.');
    if (key) delete body[parent!][key];
    else delete body[parent!];
    await f.sendIpn(body).expect(400);
    expect(await f.loadBooking(b.id)).toEqual(before);
    expect(await prisma.ticket.count()).toBe(0);
    expect(await prisma.paymentReconciliation.count()).toBe(0);
  });

  it.each([
    null,
    {},
    [],
    '',
    '-1',
    '0',
    '1e5',
    'abc',
    '250000.01',
    '9223372036854775808',
    '9'.repeat(129),
  ])(
    'never converts invalid incoming amount %# into a successful payment',
    async (amount) => {
      const { fixtures: f, prisma } = context();
      const s = await f.createScenario();
      const b = await f.createBookingHoldFixture(s);
      const p = await f.createPaymentFixture(s.customer, b.id);
      const before = await f.loadBooking(b.id);
      const body: Record<string, any> = f.ipn(p);
      body.order.order_amount = amount;
      body.transaction.transaction_amount = amount;
      const response = await f.sendIpn(body);
      expect([200, 400]).toContain(response.status);
      expect(await f.loadBooking(b.id)).toEqual(before);
      expect(await prisma.ticket.count()).toBe(0);
      expect(await prisma.paymentReconciliation.count()).toBe(0);
    },
  );

  it.each(['TRANSACTION_VOID', 'ORDER_CREATED'])(
    'does not settle unsupported %s events',
    async (notification_type) => {
      const { fixtures: f, prisma } = context();
      const s = await f.createScenario();
      const b = await f.createBookingHoldFixture(s);
      const p = await f.createPaymentFixture(s.customer, b.id);
      const before = await f.loadBooking(b.id);
      await f.sendIpn({ ...f.ipn(p), notification_type }).expect(200);
      expect(await f.loadBooking(b.id)).toEqual(before);
      expect(await prisma.ticket.count()).toBe(0);
    },
  );

  it('preserves unknown-reference and wrong-currency authenticated facts for durable review', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario();
    const b = await f.createBookingHoldFixture(s);
    const p = await f.createPaymentFixture(s.customer, b.id);
    const before = await f.loadBooking(b.id);
    const unknown = f.ipn({
      amount: p.amount,
      merchantReference: `UNKNOWN${f.unique()}`,
    });
    const currency = f.ipn(p);
    currency.order.order_currency = currency.transaction.transaction_currency =
      'USD';
    for (const body of [unknown, currency]) {
      await f.sendIpn(body).expect(200);
      await f.sendIpn(body).expect(200);
    }
    expect(await prisma.paymentReconciliation.count()).toBe(2);
    expect(
      (await prisma.paymentReconciliation.findMany())
        .map((fact) => fact.reason)
        .sort(),
    ).toEqual(['CURRENCY_MISMATCH', 'UNKNOWN_REFERENCE']);
    expect(await f.loadBooking(b.id)).toEqual(before);
    expect(await prisma.ticket.count()).toBe(0);
  });

  it('recovers ticket issuance after a post-confirmation database failure without paying again', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario({ slots: 2 });
    const b = await f.createBookingHoldFixture(s, [2, 3]);
    const p = await f.createPaymentFixture(s.customer, b.id);
    const body = f.ipn(p);
    await prisma.$executeRawUnsafe(
      'ALTER TABLE tickets ADD CONSTRAINT integration_ticket_fault CHECK (sequence_no <> 2)',
    );
    try {
      await f.sendIpn(body).expect(500);
      const committed = await f.loadBooking(b.id);
      expect(committed).toMatchObject({
        status: 'CONFIRMED',
        payment: { status: 'SUCCEEDED' },
      });
      expect(
        committed.items.every(
          (item) => item.reservation?.status === 'CONFIRMED',
        ),
      ).toBe(true);
      expect(await prisma.ticket.count()).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE tickets DROP CONSTRAINT integration_ticket_fault',
      );
    }
    await f.sendIpn(body).expect(200);
    const tickets = await prisma.ticket.findMany({ orderBy: { id: 'asc' } });
    expect(tickets).toHaveLength(5);
    await f.sendIpn(body).expect(200);
    expect(await prisma.ticket.findMany({ orderBy: { id: 'asc' } })).toEqual(
      tickets,
    );
    expect(await prisma.payment.count()).toBe(1);
  });

  it('rolls back late money and reconciliation if refund persistence fails, then safely retries', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario();
    const b = await f.createBookingHoldFixture(s);
    const p = await f.createPaymentFixture(s.customer, b.id);
    await f.backdate(b.id);
    await f.sweep();
    const before = await f.loadBooking(b.id);
    const body = f.ipn(p);
    await prisma.$executeRawUnsafe(
      'ALTER TABLE refunds ADD CONSTRAINT integration_refund_fault CHECK (amount < 0)',
    );
    try {
      await f.sendIpn(body).expect(500);
      expect(await f.loadBooking(b.id)).toEqual(before);
      expect(await prisma.paymentReconciliation.count()).toBe(0);
      expect(await prisma.refund.count()).toBe(0);
      expect(await prisma.ticket.count()).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE refunds DROP CONSTRAINT integration_refund_fault',
      );
    }
    await f.sendIpn(body).expect(200);
    expect((await f.loadBooking(b.id)).payment?.status).toBe('SUCCEEDED');
    expect(await prisma.refund.count()).toBe(1);
    expect(await prisma.paymentReconciliation.count()).toBe(1);
  });

  it('issues exactly five stable tickets after ten duplicate authenticated deliveries', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario({ slots: 2 });
    const voucher = await f.createVoucher();
    const b = await f.createBookingHoldFixture(s, [2, 3], voucher.code);
    const p = await f.createPaymentFixture(s.customer, b.id);
    const event = f.ipn(p);
    await f.sendIpn(event).expect(200);
    const tickets = await prisma.ticket.findMany({
      where: { bookingItem: { bookingId: b.id } },
      orderBy: { id: 'asc' },
    });
    expect(tickets).toHaveLength(5);
    expect(
      new Set(
        tickets.map((ticket) => `${ticket.bookingItemId}:${ticket.sequenceNo}`),
      ).size,
    ).toBe(5);
    const confirmed = await f.loadBooking(b.id);
    for (let delivery = 1; delivery < 10; delivery++)
      await f.sendIpn(event).expect(200);
    expect(await f.loadBooking(b.id)).toEqual(confirmed);
    expect(
      await prisma.ticket.findMany({
        where: { bookingItem: { bookingId: b.id } },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(tickets);
    expect(confirmed.commissionSnapshot).toEqual(b.commissionSnapshot);
    expect(confirmed.payment?.amount).toBe(b.totalAmount);
    expect(confirmed.voucherClaim?.status).toBe('REDEEMED');
  });

  it('durably reserves one full late refund and never steals reassigned capacity', async () => {
    const { fixtures: f, prisma } = context();
    const a = await f.createScenario({ capacity: 1 });
    const voucher = await f.createVoucher();
    const original = await f.createBookingHoldFixture(a, [1], voucher.code);
    const payment = await f.createPaymentFixture(a.customer, original.id);
    await f.backdate(original.id);
    await f.sweep();
    const other = await f.createCustomer();
    const replacement = await f.createConfirmedReservationFixture({
      ...a,
      customer: other,
    });
    const replacementBefore = await f.loadBooking(replacement.id);
    const payload = f.ipn(payment);
    const concurrent = await contendOnRow(
      'bookings',
      original.id,
      [0, 1, 2].map(() => async () => f.sendIpn(payload)),
    );
    expect(concurrent.map((response) => response.status)).toEqual([
      200, 200, 200,
    ]);
    for (let delivery = 0; delivery < 5; delivery++)
      await f.sendIpn(payload).expect(200);
    const late = await f.loadBooking(original.id);
    expect(late).toMatchObject({
      status: 'EXPIRED',
      confirmedAt: null,
      payment: { status: 'SUCCEEDED', amount: original.totalAmount },
      voucherClaim: { status: 'RELEASED' },
    });
    expect(late.items[0]?.reservation?.status).toBe('EXPIRED');
    expect(
      await prisma.ticket.count({
        where: { bookingItem: { bookingId: original.id } },
      }),
    ).toBe(0);
    const refunds = await prisma.refund.findMany({
      where: { paymentId: payment.paymentId },
    });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      status: 'PENDING',
      kind: 'FULL',
      reason: 'SYSTEM_CORRECTION',
      amount: original.totalAmount,
      currency: 'VND',
      succeededAt: null,
    });
    expect(await f.loadBooking(replacement.id)).toEqual(replacementBefore);
    expect(await f.available(a.slots[0]!.id)).toBe(0);
    expect(
      (await prisma.slot.findUniqueOrThrow({ where: { id: a.slots[0]!.id } }))
        .capacity,
    ).toBe(1);
  });

  it.each(['200000', '300000'])(
    'persists received amount %s for reconciliation without rewriting authoritative money',
    async (amount) => {
      const { fixtures: f, prisma } = context();
      const s = await f.createScenario();
      const b = await f.createBookingHoldFixture(s);
      const p = await f.createPaymentFixture(s.customer, b.id);
      const before = await f.loadBooking(b.id);
      const event = f.ipn({ merchantReference: p.merchantReference, amount });
      await f.sendIpn(event).expect(200);
      await f.sendIpn(event).expect(200);
      expect(await f.loadBooking(b.id)).toEqual(before);
      expect(await prisma.ticket.count()).toBe(0);
      const facts = await prisma.$queryRaw<
        Array<{ received_amount: bigint; reason: string }>
      >`SELECT received_amount, reason FROM payment_reconciliations WHERE provider_transaction_id = ${event.transaction.transaction_id}`;
      expect(facts).toEqual([
        { received_amount: BigInt(amount), reason: 'AMOUNT_MISMATCH' },
      ]);
    },
  );

  it('recovers the same persisted attempt when the checkout response fails after commit', async () => {
    const { fixtures: f, prisma, app } = context();
    const s = await f.createScenario();
    const b = await f.createBookingHoldFixture(s);
    vi.spyOn(
      app.get(PAYMENT_CHECKOUT_PROVIDER),
      'createCheckout',
    ).mockRejectedValueOnce(new Error('Synthetic lost checkout response'));
    await expect(f.createPaymentFixture(s.customer, b.id)).rejects.toThrow(
      'Synthetic lost checkout response',
    );
    const unknown = await f.loadBooking(b.id);
    expect(unknown.payment?.attempts).toHaveLength(1);
    const recovered = await f.createPaymentFixture(s.customer, b.id);
    expect(recovered.paymentId).toBe(unknown.payment?.id);
    expect(recovered.attemptId).toBe(unknown.payment?.attempts[0]?.id);
    expect(recovered.merchantReference).toBe(
      unknown.payment?.attempts[0]?.merchantReference,
    );
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.paymentAttempt.count()).toBe(1);
    expect(await f.loadBooking(b.id)).toEqual(unknown);
  });

  it('repeated status reads and return hints never mutate money or initiate payment while IPN is delayed', async () => {
    const { fixtures: f, prisma, app } = context();
    const s = await f.createScenario();
    const b = await f.createBookingHoldFixture(s);
    const p = await f.createPaymentFixture(s.customer, b.id);
    const before = await f.loadBooking(b.id);
    for (const hint of ['success', 'error', 'cancel', 'success']) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/payments/${p.paymentId}?return=${hint}`)
        .auth(f.token(s.customer), { type: 'bearer' })
        .expect(200);
      expect(response.body).toMatchObject({
        status: 'PENDING',
        booking: { status: 'PENDING_PAYMENT' },
      });
    }
    expect(await f.loadBooking(b.id)).toEqual(before);
    expect(await prisma.ticket.count()).toBe(0);
    await f.sendIpn(f.ipn(p)).expect(200);
    expect((await f.loadBooking(b.id)).status).toBe('CONFIRMED');
  });
});
