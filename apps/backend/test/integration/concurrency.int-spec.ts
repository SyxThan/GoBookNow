import { randomUUID } from 'node:crypto';
import { contendOnRow } from './helpers/concurrency.js';
import { integrationSuite } from './helpers/test-app.js';

describe('Concurrent lifecycle transactions on independent PostgreSQL connections', () => {
  const context = integrationSuite();
  it('prevents two concurrent holds from exceeding slot capacity across repeated lock races', async () => {
    const { fixtures: f, prisma } = context();
    for (let cycle = 0; cycle < 3; cycle++) {
      const s = await f.createScenario({ capacity: 1 });
      const second = await f.createCustomer();
      const responses = await contendOnRow(
        'slots',
        s.slots[0]!.id,
        [s.customer, second].map(
          (customer) => async () =>
            f.holdRequest(customer, {
              items: [{ slotId: s.slots[0]!.id, quantity: 1 }],
            }),
        ),
      );
      expect(
        responses
          .map((response) => response.status)
          .sort((left, right) => left - right),
      ).toEqual([201, 409]);
      expect(
        await prisma.reservation.count({ where: { slotId: s.slots[0]!.id } }),
      ).toBe(1);
      expect(
        await prisma.booking.count({
          where: { customerId: { in: [s.customer.id, second.id] } },
        }),
      ).toBe(1);
      expect(await f.available(s.slots[0]!.id)).toBe(0);
      expect(
        (await prisma.slot.findUniqueOrThrow({ where: { id: s.slots[0]!.id } }))
          .capacity,
      ).toBe(1);
    }
  });
  it('converges concurrent duplicate holds on one booking and one capacity consumption', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario({ capacity: 1 });
    const key = randomUUID();
    const body = { items: [{ slotId: s.slots[0]!.id, quantity: 1 }] };
    const responses = await contendOnRow(
      'slots',
      s.slots[0]!.id,
      [0, 1, 2].map(() => async () => f.holdRequest(s.customer, body, key)),
    );
    expect(
      responses
        .map((response) => response.status)
        .sort((left, right) => left - right),
    ).toEqual([200, 200, 201]);
    expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
    expect(await prisma.booking.count()).toBe(1);
    expect(await prisma.reservation.count()).toBe(1);
    expect(await f.available(s.slots[0]!.id)).toBe(0);
  });
  it('converges repeated concurrent authenticated duplicate IPNs without unique-constraint 500s', async () => {
    const { fixtures: f, prisma } = context();
    for (let cycle = 0; cycle < 3; cycle++) {
      const s = await f.createScenario({ slots: 2 });
      const b = await f.createBookingHoldFixture(s);
      const p = await f.createPaymentFixture(s.customer, b.id);
      const event = f.ipn(p);
      const responses = await contendOnRow(
        'bookings',
        b.id,
        [0, 1, 2].map(() => async () => f.sendIpn(event)),
      );
      expect(responses.map((response) => response.status)).toEqual([
        200, 200, 200,
      ]);
      const confirmed = await f.loadBooking(b.id);
      expect(confirmed).toMatchObject({
        status: 'CONFIRMED',
        payment: { status: 'SUCCEEDED' },
      });
      expect(confirmed.payment?.attempts).toHaveLength(1);
      expect(
        await prisma.ticket.count({
          where: { bookingItem: { bookingId: b.id } },
        }),
      ).toBe(2);
      expect(confirmed.payment?.attempts[0]).toMatchObject({
        status: 'SUCCEEDED',
        providerTransactionId: event.transaction.transaction_id,
      });
      expect(
        confirmed.items.every(
          (item) =>
            item.reservation?.status === 'CONFIRMED' &&
            item.reservation.confirmedAt?.getTime() ===
              confirmed.confirmedAt?.getTime(),
        ),
      ).toBe(true);
      expect(
        await prisma.paymentAttempt.count({
          where: { providerTransactionId: event.transaction.transaction_id },
        }),
      ).toBe(1);
      await f.sendIpn(event).expect(200);
      expect(await f.loadBooking(b.id)).toEqual(confirmed);
    }
  });
  it('reuses one payment and one pending attempt during concurrent initiation', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario();
    const b = await f.createBookingHoldFixture(s);
    const results = await contendOnRow(
      'bookings',
      b.id,
      [0, 1, 2].map(() => () => f.createPaymentFixture(s.customer, b.id)),
    );
    expect(new Set(results.map((result) => result.paymentId)).size).toBe(1);
    expect(new Set(results.map((result) => result.attemptId)).size).toBe(1);
    expect(
      new Set(results.map((result) => result.merchantReference)).size,
    ).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.paymentAttempt.count()).toBe(1);
    const aggregate = await f.loadBooking(b.id);
    expect(aggregate).toMatchObject({
      status: 'PENDING_PAYMENT',
      payment: { status: 'PENDING', amount: b.totalAmount },
    });
    expect(aggregate.payment?.attempts[0]?.status).toBe('PENDING');
    expect(await f.available(s.slots[0]!.id)).toBe(9);
  });
  it('keeps payment/expiration races coherent for both expired and active multi-slot voucher holds', async () => {
    const { fixtures: f, prisma } = context();
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const expired of [false, true]) {
        const s = await f.createScenario({ slots: 2 });
        const voucher = await f.createVoucher();
        const b = await f.createBookingHoldFixture(s, [1, 1], voucher.code);
        const p = await f.createPaymentFixture(s.customer, b.id);
        if (expired) await f.backdate(b.id);
        await Promise.all([f.sendIpn(f.ipn(p)).expect(200), f.sweep()]);
        const result = await f.loadBooking(b.id);
        expect(result.status).toBe(expired ? 'EXPIRED' : 'CONFIRMED');
        expect(result.payment?.status).toBe('SUCCEEDED');
        expect(result.payment?.attempts[0]?.status).toBe('SUCCEEDED');
        expect(
          result.items.every(
            (item) =>
              item.reservation?.status === (expired ? 'EXPIRED' : 'CONFIRMED'),
          ),
        ).toBe(true);
        expect(result.voucherClaim?.status).toBe(
          expired ? 'RELEASED' : 'REDEEMED',
        );
        expect(
          await prisma.ticket.count({
            where: { bookingItem: { bookingId: b.id } },
          }),
        ).toBe(expired ? 0 : 2);
        expect(
          await prisma.refund.count({
            where: { paymentId: p.paymentId, status: 'PENDING' },
          }),
        ).toBe(expired ? 1 : 0);
        for (const slot of s.slots)
          expect(await f.available(slot.id)).toBe(expired ? 10 : 9);
      }
    }
  });
});
