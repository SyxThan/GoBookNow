import { integrationSuite } from './helpers/test-app.js';

describe('Reservation expiration integration', () => {
  const context = integrationSuite();
  it('expires a multi-slot hold once, releases its voucher and preserves timestamps on repeat', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario({ slots: 2, capacity: 3 });
    const voucher = await f.createVoucher();
    const b = await f.createBookingHoldFixture(s, [2, 1], voucher.code);
    await f.backdate(b.id);
    expect(await f.sweep()).toMatchObject({
      expiredBookings: 1,
      expiredReservations: 2,
    });
    const expired = await f.loadBooking(b.id);
    expect(expired.status).toBe('EXPIRED');
    expect(expired.expiredAt).toBeInstanceOf(Date);
    expect(expired.voucherClaim).toMatchObject({
      status: 'RELEASED',
      releasedAt: expired.expiredAt,
    });
    expect(
      expired.items.every((item) => item.reservation?.status === 'EXPIRED'),
    ).toBe(true);
    expect(await f.available(s.slots[0]!.id)).toBe(3);
    expect(await f.available(s.slots[1]!.id)).toBe(3);
    expect((await prisma.slot.findMany()).map((slot) => slot.capacity)).toEqual(
      [3, 3],
    );
    expect(await f.sweep()).toMatchObject({
      expiredBookings: 0,
      expiredReservations: 0,
    });
    expect(await f.loadBooking(b.id)).toEqual(expired);
  });
  it('ignores stale holds and voucher claims before the worker has finalized them', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario({ capacity: 1 });
    const voucher = await f.createVoucher(1);
    const b = await f.createBookingHoldFixture(s, [1], voucher.code);
    expect(await f.available(s.slots[0]!.id)).toBe(0);
    await f.backdate(b.id);
    expect((await f.loadBooking(b.id)).items[0]!.reservation?.status).toBe(
      'HELD',
    );
    expect(await f.available(s.slots[0]!.id)).toBe(1);
    const other = await f.createCustomer();
    const next = await f.createBookingHoldFixture(
      { ...s, customer: other },
      [1],
      voucher.code,
    );
    expect(next.voucherClaim?.status).toBe('RESERVED');
    expect(await f.available(s.slots[0]!.id)).toBe(0);
    expect(await prisma.voucherClaim.count()).toBe(2);
    await f.sweep();
    expect((await f.loadBooking(b.id)).voucherClaim?.status).toBe('RELEASED');
    expect((await f.loadBooking(next.id)).status).toBe('PENDING_PAYMENT');
  });
  it('keeps active holds and confirmed reservations consuming capacity', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario({ capacity: 5 });
    const confirmed = await f.createConfirmedReservationFixture(s, [2]);
    const other = await f.createCustomer();
    const active = await f.createBookingHoldFixture(
      { ...s, customer: other },
      [1],
    );
    const before = await f.loadBooking(active.id);
    await f.sweep();
    expect(await f.loadBooking(active.id)).toEqual(before);
    expect((await f.loadBooking(confirmed.id)).status).toBe('CONFIRMED');
    expect(
      (await f.loadBooking(confirmed.id)).items[0]!.reservation?.status,
    ).toBe('CONFIRMED');
    expect(await f.available(s.slots[0]!.id)).toBe(2);
    expect(
      (await prisma.slot.findUniqueOrThrow({ where: { id: s.slots[0]!.id } }))
        .capacity,
    ).toBe(5);
  });
  it('lets concurrent workers finalize the same hold only once', async () => {
    const { fixtures: f } = context();
    const s = await f.createScenario({ slots: 2 });
    const b = await f.createBookingHoldFixture(s);
    await f.backdate(b.id);
    const results = await Promise.all([f.sweep(), f.sweep(), f.sweep()]);
    expect(
      results.reduce((sum, result) => sum + result.expiredBookings, 0),
    ).toBe(1);
    expect(
      results.reduce((sum, result) => sum + result.expiredReservations, 0),
    ).toBe(2);
    expect(
      (await f.loadBooking(b.id)).items.every(
        (item) => item.reservation?.status === 'EXPIRED',
      ),
    ).toBe(true);
  });
});
