import request from 'supertest';
import { PaymentMatchingService } from '../../src/payments/payment-matching.service.js';
import { PaymentProvider } from '../../src/generated/prisma/client.js';
import { integrationSuite } from './helpers/test-app.js';

describe('Payment initiation and authenticated SePay confirmation', () => {
  const context = integrationSuite();
  it('creates/reuses one Payment and active PaymentAttempt from authoritative discounted totals', async () => {
    const { fixtures: f, app, prisma } = context();
    const s = await f.createScenario();
    const voucher = await f.createVoucher();
    const b = await f.createBookingHoldFixture(s, [2], voucher.code);
    const initiate = () =>
      request(app.getHttpServer())
        .post('/api/v1/payments/sepay')
        .auth(f.token(s.customer), { type: 'bearer' })
        .send({ bookingId: b.id });
    const first = await initiate().expect(201);
    const again = await initiate().expect(201);
    expect(again.body).toEqual(first.body);
    expect(first.body).toMatchObject({
      amount: '490000',
      currency: 'VND',
      provider: 'SEPAY',
      status: 'PENDING',
      method: 'POST',
      paymentUrl: 'https://checkout.invalid/integration',
    });
    expect(first.body.formFields).toMatchObject({
      order_invoice_number: first.body.merchantReference,
      order_amount: '490000',
    });
    const loaded = await f.loadBooking(b.id);
    expect(loaded.payment).toMatchObject({
      amount: b.totalAmount,
      currency: b.currency,
      status: 'PENDING',
    });
    expect(loaded.payment?.attempts).toHaveLength(1);
    expect(loaded.payment?.attempts[0]).toMatchObject({
      status: 'PENDING',
      amount: b.totalAmount,
      currency: 'VND',
      merchantReference: first.body.merchantReference,
    });
    expect(b.platformFeeAmount! + b.vendorAmount!).toBe(b.totalAmount);
    expect(await prisma.payment.count()).toBe(1);
  });
  it('authenticates IPN and atomically confirms payment, attempt, multi-item booking and voucher claim', async () => {
    const { fixtures: f } = context();
    const s = await f.createScenario({ slots: 2 });
    const voucher = await f.createVoucher();
    const b = await f.createBookingHoldFixture(s, [2, 1], voucher.code);
    const p = await f.createPaymentFixture(s.customer, b.id);
    const payload = f.ipn(p);
    await f.sendIpn(payload).expect(200, { success: true });
    const confirmed = await f.loadBooking(b.id);
    expect(confirmed).toMatchObject({
      status: 'CONFIRMED',
      payment: { status: 'SUCCEEDED', amount: b.totalAmount },
      voucherClaim: { status: 'REDEEMED' },
    });
    expect(confirmed.payment?.attempts[0]).toMatchObject({
      status: 'SUCCEEDED',
      providerTransactionId: payload.transaction.transaction_id,
    });
    expect(
      confirmed.items.every(
        (item) =>
          item.reservation?.status === 'CONFIRMED' &&
          item.reservation.confirmedAt?.getTime() ===
            confirmed.confirmedAt?.getTime(),
      ),
    ).toBe(true);
    expect(confirmed.voucherClaim?.redeemedAt).toEqual(confirmed.confirmedAt);
    await f.sendIpn(payload).expect(200);
    expect(await f.loadBooking(b.id)).toEqual(confirmed);
    expect(await f.available(s.slots[0]!.id)).toBe(8);
    expect(await f.available(s.slots[1]!.id)).toBe(9);
  });
  it.each([null, 'incorrect-integration-secret'])(
    'rejects missing/invalid IPN authentication without any business mutation (%#)',
    async (secret) => {
      const { fixtures: f } = context();
      const s = await f.createScenario();
      const b = await f.createBookingHoldFixture(s);
      const p = await f.createPaymentFixture(s.customer, b.id);
      const before = await f.loadBooking(b.id);
      await f.sendIpn(f.ipn(p), secret).expect(401);
      expect(await f.loadBooking(b.id)).toEqual(before);
    },
  );
  it.each(['amount', 'currency', 'reference', 'status'] as const)(
    'acknowledges an invalid %s event without confirming any aggregate',
    async (mismatch) => {
      const { fixtures: f } = context();
      const s = await f.createScenario();
      const b = await f.createBookingHoldFixture(s);
      const p = await f.createPaymentFixture(s.customer, b.id);
      const before = await f.loadBooking(b.id);
      const payload = f.ipn(p);
      if (mismatch === 'amount') {
        payload.order.order_amount = '1.00';
        payload.transaction.transaction_amount = '1';
      }
      if (mismatch === 'currency') {
        payload.order.order_currency = 'USD';
        payload.transaction.transaction_currency = 'USD';
      }
      if (mismatch === 'reference')
        payload.order.order_invoice_number = `UNKNOWN${f.unique()}`;
      if (mismatch === 'status')
        payload.transaction.transaction_status = 'DECLINED';
      await f.sendIpn(payload).expect(200, { success: true });
      expect(await f.loadBooking(b.id)).toEqual(before);
      expect(await f.available(s.slots[0]!.id)).toBe(9);
    },
  );
  it('matches exact merchant reference when different bookings have identical amounts', async () => {
    const { fixtures: f } = context();
    const a = await f.createScenario();
    const b = await f.createScenario();
    const ba = await f.createBookingHoldFixture(a);
    const bb = await f.createBookingHoldFixture(b);
    const pa = await f.createPaymentFixture(a.customer, ba.id);
    const pb = await f.createPaymentFixture(b.customer, bb.id);
    expect(pa.amount).toBe(pb.amount);
    expect(pa.merchantReference).not.toBe(pb.merchantReference);
    const beforeB = await f.loadBooking(bb.id);
    const event = f.ipn(pa);
    await f.sendIpn(event).expect(200);
    expect((await f.loadBooking(ba.id)).status).toBe('CONFIRMED');
    expect(await f.loadBooking(bb.id)).toEqual(beforeB);
    // A transaction already associated with A cannot be reused to confirm B.
    await f.sendIpn(f.ipn(pb, event.transaction.transaction_id)).expect(200);
    expect(await f.loadBooking(bb.id)).toEqual(beforeB);
  });
  it('rejects an incorrect provider in real matching logic', async () => {
    const { fixtures: f, app } = context();
    const s = await f.createScenario();
    const b = await f.createBookingHoldFixture(s);
    const p = await f.createPaymentFixture(s.customer, b.id);
    const match = await app.get(PaymentMatchingService).match({
      provider: 'UNSUPPORTED' as PaymentProvider,
      merchantReference: p.merchantReference,
      providerTransactionId: f.unique(),
      amount: BigInt(p.amount),
      currency: p.currency,
    });
    expect(match).toMatchObject({
      matched: false,
      reason: 'PROVIDER_MISMATCH',
    });
    expect((await f.loadBooking(b.id)).payment?.status).toBe('PENDING');
  });
  it('treats browser success query parameters as a read, never proof of payment', async () => {
    const { fixtures: f, app } = context();
    const s = await f.createScenario();
    const b = await f.createBookingHoldFixture(s);
    const p = await f.createPaymentFixture(s.customer, b.id);
    const before = await f.loadBooking(b.id);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/payments/${p.paymentId}?return=success&status=SUCCEEDED`)
      .auth(f.token(s.customer), { type: 'bearer' })
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'PENDING',
      booking: { status: 'PENDING_PAYMENT' },
    });
    expect(await f.loadBooking(b.id)).toEqual(before);
    const stranger = await f.createCustomer();
    await request(app.getHttpServer())
      .get(`/api/v1/payments/${p.paymentId}`)
      .auth(f.token(stranger), { type: 'bearer' })
      .expect(403);
  });
  it('records late payment facts without resurrecting an expired booking or its voucher', async () => {
    const { fixtures: f } = context();
    const s = await f.createScenario({ slots: 2 });
    const voucher = await f.createVoucher();
    const b = await f.createBookingHoldFixture(s, [1, 1], voucher.code);
    const p = await f.createPaymentFixture(s.customer, b.id);
    await f.backdate(b.id);
    await f.sweep();
    const expired = await f.loadBooking(b.id);
    await f.sendIpn(f.ipn(p)).expect(200);
    const late = await f.loadBooking(b.id);
    expect(late).toMatchObject({
      status: 'EXPIRED',
      confirmedAt: null,
      expiredAt: expired.expiredAt,
      payment: { status: 'SUCCEEDED' },
      voucherClaim: { status: 'RELEASED' },
    });
    expect(late.payment?.attempts[0]?.status).toBe('SUCCEEDED');
    expect(
      late.items.every((item) => item.reservation?.status === 'EXPIRED'),
    ).toBe(true);
    expect(await f.available(s.slots[0]!.id)).toBe(10);
  });
});
