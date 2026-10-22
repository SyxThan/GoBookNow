import { randomUUID } from 'node:crypto';
import { integrationSuite } from './helpers/test-app.js';

describe('Booking hold with real PostgreSQL', () => {
  const context = integrationSuite();
  it('creates pricing and commission snapshots and consumes effective capacity without changing Slot.capacity', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario();
    const response = await f
      .holdRequest(s.customer, {
        items: [{ slotId: s.slots[0]!.id, quantity: 2 }],
      })
      .expect(201);
    const booking = await f.loadBooking(response.body.id);
    expect(booking).toMatchObject({
      customerId: s.customer.id,
      vendorId: s.vendor.id,
      status: 'PENDING_PAYMENT',
      totalAmount: 500_000n,
      subtotalAmount: 500_000n,
      voucherDiscountAmount: 0n,
      currency: 'VND',
      commissionBps: 1000,
      platformFeeAmount: 50_000n,
      vendorAmount: 450_000n,
    });
    expect(booking.commissionSnapshot).toMatchObject({
      basis: 'NET_AFTER_DISCOUNT',
      netAmount: '500000',
    });
    expect(booking.items).toHaveLength(1);
    expect(booking.items[0]).toMatchObject({
      quantity: 2,
      unitPriceAmount: 250_000n,
      subtotalAmount: 500_000n,
      slotStartAtSnapshot: s.slots[0]!.startAt,
      slotEndAtSnapshot: s.slots[0]!.endAt,
      reservation: {
        status: 'HELD',
        quantity: 2,
        expiresAt: booking.expiresAt,
      },
    });
    expect(await f.available(s.slots[0]!.id)).toBe(8);
    expect(
      (await prisma.slot.findUniqueOrThrow({ where: { id: s.slots[0]!.id } }))
        .capacity,
    ).toBe(10);
  });
  it('holds multiple slots with independent availability and accurate item totals', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario({ slots: 2 });
    await prisma.slot.update({
      where: { id: s.slots[0]!.id },
      data: { capacity: 5, priceAmount: 100_000n },
    });
    await prisma.slot.update({
      where: { id: s.slots[1]!.id },
      data: { capacity: 8, priceAmount: 200_000n },
    });
    const b = await f.createBookingHoldFixture(s, [2, 1]);
    expect(b.items).toHaveLength(2);
    expect(b.totalAmount).toBe(400_000n);
    expect(b.items.reduce((sum, item) => sum + item.subtotalAmount, 0n)).toBe(
      b.totalAmount,
    );
    expect(b.items.every((item) => item.reservation?.status === 'HELD')).toBe(
      true,
    );
    expect(await f.available(s.slots[0]!.id)).toBe(3);
    expect(await f.available(s.slots[1]!.id)).toBe(7);
  });
  it('preserves immutable price/time snapshots and initiates payment from the booking total', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario();
    const b = await f.createBookingHoldFixture(s, [2]);
    await prisma.service.update({
      where: { id: s.service.id },
      data: { priceAmount: 900_000n, title: 'Changed title' },
    });
    await prisma.slot.update({
      where: { id: s.slots[0]!.id },
      data: {
        priceAmount: 800_000n,
        startAt: new Date(s.slots[0]!.startAt.getTime() + 60_000),
      },
    });
    const payment = await f.createPaymentFixture(s.customer, b.id);
    expect(BigInt(payment.amount)).toBe(b.totalAmount);
    const after = await f.loadBooking(b.id);
    expect(after.items).toEqual(b.items);
    expect(after.totalAmount).toBe(500_000n);
  });
  it.each([0, -1, 1001, 1.5, 'invalid', null])(
    'rejects invalid quantity %s without persisting any aggregate',
    async (quantity) => {
      const { fixtures: f, prisma } = context();
      const s = await f.createScenario();
      await f
        .holdRequest(s.customer, {
          items: [{ slotId: s.slots[0]!.id, quantity }],
        })
        .expect(400);
      expect(await prisma.booking.count()).toBe(0);
      expect(await prisma.bookingItem.count()).toBe(0);
      expect(await prisma.reservation.count()).toBe(0);
      expect(await f.available(s.slots[0]!.id)).toBe(10);
    },
  );
  it('rejects unknown slots and unexpected authoritative DTO fields without partial data', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario();
    await f
      .holdRequest(s.customer, {
        items: [{ slotId: randomUUID(), quantity: 1 }],
      })
      .expect(404);
    await f
      .holdRequest(s.customer, {
        items: [{ slotId: s.slots[0]!.id, quantity: 1 }],
        totalAmount: 1,
      })
      .expect(400);
    expect(await prisma.booking.count()).toBe(0);
    expect(await prisma.reservation.count()).toBe(0);
  });
  it.each(['CANCELLED', 'CLOSED'] as const)(
    'rejects a %s slot without consuming capacity',
    async (status) => {
      const { fixtures: f, prisma } = context();
      const s = await f.createScenario();
      await prisma.slot.update({
        where: { id: s.slots[0]!.id },
        data: { status },
      });
      await f
        .holdRequest(s.customer, {
          items: [{ slotId: s.slots[0]!.id, quantity: 1 }],
        })
        .expect(409);
      expect(await prisma.booking.count()).toBe(0);
      expect(await f.available(s.slots[0]!.id)).toBe(10);
    },
  );
  it('rejects insufficient capacity across multiple slots atomically', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario({ slots: 2, capacity: 5 });
    const other = await f.createCustomer();
    await f.createConfirmedReservationFixture(
      { ...s, customer: other, slots: [s.slots[1]!] },
      [4],
    );
    const before = {
      bookings: await prisma.booking.count(),
      items: await prisma.bookingItem.count(),
      reservations: await prisma.reservation.count(),
    };
    const voucher = await f.createVoucher();
    await f
      .holdRequest(s.customer, {
        items: s.slots.map((slot) => ({ slotId: slot.id, quantity: 2 })),
        voucherCode: voucher.code,
      })
      .expect(409);
    expect(await prisma.booking.count()).toBe(before.bookings);
    expect(await prisma.bookingItem.count()).toBe(before.items);
    expect(await prisma.reservation.count()).toBe(before.reservations);
    expect(await prisma.voucherClaim.count()).toBe(0);
    expect(await f.available(s.slots[0]!.id)).toBe(5);
    expect(await f.available(s.slots[1]!.id)).toBe(1);
  });
  it('replays a semantic hold once and rejects changed quantity, slot or voucher under the same key', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario({ slots: 2 });
    const key = randomUUID();
    const body = { items: [{ slotId: s.slots[0]!.id, quantity: 2 }] };
    const first = await f.holdRequest(s.customer, body, key).expect(201);
    const duplicate = await f.holdRequest(s.customer, body, key).expect(200);
    expect(duplicate.body).toEqual(first.body);
    for (const change of [
      { items: [{ slotId: s.slots[0]!.id, quantity: 3 }] },
      { items: [{ slotId: s.slots[1]!.id, quantity: 2 }] },
      { ...body, voucherCode: 'DIFFERENT' },
    ]) {
      const conflict = await f.holdRequest(s.customer, change, key).expect(409);
      expect(conflict.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
    }
    expect(await prisma.booking.count()).toBe(1);
    expect(await prisma.bookingItem.count()).toBe(1);
    expect(await prisma.reservation.count()).toBe(1);
    expect(await f.available(s.slots[0]!.id)).toBe(8);
  });
});
