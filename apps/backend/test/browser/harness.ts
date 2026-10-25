import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/database/prisma/prisma.service.js';
import { BookingExpirationService } from '../../src/bookings/expiration/booking-expiration.service.js';
import { FixtureFactory } from '../integration/helpers/fixtures.js';
import { cleanTestDatabase } from '../integration/helpers/test-database.js';
import { ensureSystemRoles } from '../helpers/system-roles.js';
import { createBrowserApplication } from './application.js';

export async function createBrowserHarness() {
  const app = await createBrowserApplication();
  const prisma = app.get(PrismaService);
  const fixtures = new FixtureFactory(app, prisma);
  return {
    prisma,
    async reset() {
      await cleanTestDatabase(prisma);
      await ensureSystemRoles(prisma);
    },
    async catalog() {
      const vendor = await fixtures.createApprovedVendor();
      const service = await fixtures.createService(vendor.id);
      const title = `E2E Experience ${randomUUID().slice(0, 8)}`;
      await prisma.service.update({
        where: { id: service.id },
        data: { title },
      });
      const slot = await fixtures.createSlot(service.id, {
        capacity: 5,
        priceAmount: 275_000n,
      });
      return { ...service, title, vendor, slot };
    },
    loadBooking: (id: string) => fixtures.loadBooking(id),
    available: (slotId: string) => fixtures.available(slotId),
    voucher: () => fixtures.createVoucher(),
    async expire(bookingId: string) {
      await fixtures.backdate(bookingId);
      const expiration = app.get(BookingExpirationService);
      await expiration.sweepExpiredBookings();
      const once = await fixtures.loadBooking(bookingId);
      await expiration.sweepExpiredBookings();
      return { once, twice: await fixtures.loadBooking(bookingId) };
    },
    async success(bookingId: string, transactionId = `E2ETX${randomUUID()}`) {
      const booking = await fixtures.loadBooking(bookingId);
      const payment = booking.payment;
      if (!payment || payment.attempts.length !== 1)
        throw new Error('Expected one browser-initiated payment attempt');
      const payload = fixtures.ipn(
        {
          merchantReference: payment.attempts[0]!.merchantReference,
          amount: payment.amount.toString(),
        },
        transactionId,
      );
      payload.timestamp = Math.floor(Date.now() / 1000);
      // Node fetch: this secret never enters the browser or Playwright request log.
      const response = await fetch(
        `${process.env.BACKEND_BASE_URL}/api/v1/webhooks/sepay/ipn`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Secret-Key': process.env.SEPAY_IPN_SECRET!,
          },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok)
        throw new Error(`Synthetic IPN failed: HTTP ${response.status}`);
      return transactionId;
    },
    async close() {
      await app.close();
    },
    async cleanup() {
      await cleanTestDatabase(prisma);
    },
  };
}
