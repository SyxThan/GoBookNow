import { Prisma } from '../generated/prisma/client.js';
import { serializeMoneyAmount } from '../pricing/money.utils.js';
import type { BookingResponseDto } from './dto/booking-response.dto.js';

export const bookingHoldResponseSelect = {
  id: true,
  bookingCode: true,
  status: true,
  currency: true,
  subtotalAmount: true,
  totalAmount: true,
  expiresAt: true,
  items: {
    select: {
      id: true,
      serviceId: true,
      slotId: true,
      quantity: true,
      unitPriceAmount: true,
      subtotalAmount: true,
      pricingSource: true,
      serviceTitleSnapshot: true,
      slotStartAtSnapshot: true,
      slotEndAtSnapshot: true,
      reservation: {
        select: {
          id: true,
          status: true,
          expiresAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const satisfies Prisma.BookingSelect;

export type BookingHoldRecord = Prisma.BookingGetPayload<{
  select: typeof bookingHoldResponseSelect;
}>;

export function mapBookingHoldResponse(
  booking: BookingHoldRecord,
): BookingResponseDto {
  return {
    id: booking.id,
    bookingCode: booking.bookingCode,
    status: booking.status,
    currency: booking.currency,
    subtotalAmount: serializeMoneyAmount(booking.subtotalAmount),
    totalAmount: serializeMoneyAmount(booking.totalAmount),
    expiresAt: booking.expiresAt?.toISOString() ?? null,
    items: booking.items.map((item) => {
      if (!item.reservation) {
        throw new Error('Booking hold response requires item reservations');
      }

      return {
        id: item.id,
        serviceId: item.serviceId,
        slotId: item.slotId,
        serviceTitle: item.serviceTitleSnapshot,
        startAt: item.slotStartAtSnapshot.toISOString(),
        endAt: item.slotEndAtSnapshot.toISOString(),
        quantity: item.quantity,
        unitPriceAmount: serializeMoneyAmount(item.unitPriceAmount),
        subtotalAmount: serializeMoneyAmount(item.subtotalAmount),
        pricingSource: item.pricingSource,
        reservation: {
          id: item.reservation.id,
          status: item.reservation.status,
          expiresAt: item.reservation.expiresAt?.toISOString() ?? null,
        },
      };
    }),
  };
}
