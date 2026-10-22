import { randomUUID } from 'node:crypto';
import { BookingsService } from '../../src/bookings/bookings.service.js';
import { PaymentSettlementService } from '../../src/payments/payment-settlement.service.js';
import { integrationSuite } from './helpers/test-app.js';

describe('Real transaction rollback under PostgreSQL constraint failures', () => {
  const context = integrationSuite();
  it('rolls back booking/items/reservations after a voucher claim fails, then retries the same idempotency key', async () => {
    const { fixtures: f, prisma, app } = context();
    const s = await f.createScenario({ slots: 2 });
    const voucher = await f.createVoucher();
    const key = randomUUID();
    const body = {
      items: s.slots.map((slot) => ({ slotId: slot.id, quantity: 2 })),
      voucherCode: voucher.code,
    };
    await prisma.$executeRawUnsafe(
      `ALTER TABLE voucher_claims ADD CONSTRAINT integration_fault CHECK (status <> 'RESERVED')`,
    );
    try {
      // voucherClaim.create is the final write, after the nested booking/items/reservations.
      await expect(
        app.get(BookingsService).hold(s.customer.id, key, body),
      ).rejects.toThrow('integration_fault');
      expect(await prisma.booking.count()).toBe(0);
      expect(await prisma.bookingItem.count()).toBe(0);
      expect(await prisma.reservation.count()).toBe(0);
      expect(await prisma.voucherClaim.count()).toBe(0);
      expect(await prisma.payment.count()).toBe(0);
      for (const slot of s.slots) expect(await f.available(slot.id)).toBe(10);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE voucher_claims DROP CONSTRAINT integration_fault',
      );
    }
    await f.holdRequest(s.customer, body, key).expect(201);
    await f.holdRequest(s.customer, body, key).expect(200);
    expect(await prisma.booking.count()).toBe(1);
    expect(await prisma.bookingItem.count()).toBe(2);
    expect(await prisma.reservation.count()).toBe(2);
    expect(await prisma.voucherClaim.count()).toBe(1);
  });
  it('rolls back payment and attempt success plus booking confirmation when reservation confirmation fails', async () => {
    const { fixtures: f, prisma, app } = context();
    const s = await f.createScenario({ slots: 2 });
    const voucher = await f.createVoucher();
    const b = await f.createBookingHoldFixture(s, [1, 1], voucher.code);
    const p = await f.createPaymentFixture(s.customer, b.id);
    const before = await f.loadBooking(b.id);
    const input = f.settlementInput(b.id, p);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE reservations ADD CONSTRAINT integration_fault CHECK (status <> 'CONFIRMED')`,
    );
    try {
      // Settlement has already written PaymentAttempt, Payment and Booking here.
      await expect(
        app.get(PaymentSettlementService).settle(input),
      ).rejects.toThrow('integration_fault');
      expect(await f.loadBooking(b.id)).toEqual(before);
      expect(before).toMatchObject({
        status: 'PENDING_PAYMENT',
        payment: { status: 'PENDING' },
        voucherClaim: { status: 'RESERVED' },
      });
      expect(before.payment?.attempts[0]).toMatchObject({
        status: 'PENDING',
        providerTransactionId: null,
      });
      for (const slot of s.slots) expect(await f.available(slot.id)).toBe(9);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE reservations DROP CONSTRAINT integration_fault',
      );
    }
    expect(await app.get(PaymentSettlementService).settle(input)).toMatchObject(
      { outcome: 'CONFIRMED' },
    );
    const confirmed = await f.loadBooking(b.id);
    expect(confirmed).toMatchObject({
      status: 'CONFIRMED',
      payment: { status: 'SUCCEEDED' },
      voucherClaim: { status: 'REDEEMED' },
    });
    expect(
      confirmed.items.every((item) => item.reservation?.status === 'CONFIRMED'),
    ).toBe(true);
    await app.get(PaymentSettlementService).settle(input);
    expect(await f.loadBooking(b.id)).toEqual(confirmed);
  });
  it('rolls back reservation expiration if the later booking write fails', async () => {
    const { fixtures: f, prisma } = context();
    const s = await f.createScenario({ slots: 2 });
    const voucher = await f.createVoucher();
    const b = await f.createBookingHoldFixture(s, [1, 1], voucher.code);
    await f.backdate(b.id);
    const before = await f.loadBooking(b.id);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE bookings ADD CONSTRAINT integration_fault CHECK (status <> 'EXPIRED')`,
    );
    try {
      await expect(f.sweep()).rejects.toThrow('integration_fault');
      expect(await f.loadBooking(b.id)).toEqual(before);
      expect(
        before.items.every((item) => item.reservation?.status === 'HELD'),
      ).toBe(true);
      expect(before.voucherClaim?.status).toBe('RESERVED');
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE bookings DROP CONSTRAINT integration_fault',
      );
    }
    await f.sweep();
    expect((await f.loadBooking(b.id)).status).toBe('EXPIRED');
    expect((await f.loadBooking(b.id)).voucherClaim?.status).toBe('RELEASED');
  });
});
