import { BookingStatus } from '../generated/prisma/client.js';

/** Shared operational completion rule. Callers supply authoritative database time. */
export function isBookingCompleted(
  booking: { status: BookingStatus; items: readonly { slotEndAtSnapshot: Date }[] },
  dbNow: Date,
): boolean {
  return booking.status === BookingStatus.CONFIRMED &&
    booking.items.length > 0 &&
    booking.items.every((item) => item.slotEndAtSnapshot <= dbNow);
}
