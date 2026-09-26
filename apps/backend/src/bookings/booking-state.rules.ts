import {
  BookingStatus,
  ReservationStatus,
} from '../generated/prisma/client.js';

export const BOOKING_STATUS_TRANSITIONS: Readonly<
  Record<BookingStatus, readonly BookingStatus[]>
> = Object.freeze({
  [BookingStatus.PENDING_PAYMENT]: [
    BookingStatus.CONFIRMED,
    BookingStatus.EXPIRED,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.CONFIRMED]: [BookingStatus.CANCELLED],
  [BookingStatus.EXPIRED]: [],
  [BookingStatus.CANCELLED]: [],
});

export const RESERVATION_STATUS_TRANSITIONS: Readonly<
  Record<ReservationStatus, readonly ReservationStatus[]>
> = Object.freeze({
  [ReservationStatus.HELD]: [
    ReservationStatus.CONFIRMED,
    ReservationStatus.EXPIRED,
    ReservationStatus.RELEASED,
  ],
  [ReservationStatus.CONFIRMED]: [ReservationStatus.RELEASED],
  [ReservationStatus.EXPIRED]: [],
  [ReservationStatus.RELEASED]: [],
});

export const TERMINAL_BOOKING_STATUSES = Object.freeze([
  BookingStatus.EXPIRED,
  BookingStatus.CANCELLED,
] satisfies readonly BookingStatus[]);

export const TERMINAL_RESERVATION_STATUSES = Object.freeze([
  ReservationStatus.EXPIRED,
  ReservationStatus.RELEASED,
] satisfies readonly ReservationStatus[]);

export function canTransitionBookingStatus(
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  return BOOKING_STATUS_TRANSITIONS[from].includes(to);
}

export function canTransitionReservationStatus(
  from: ReservationStatus,
  to: ReservationStatus,
): boolean {
  return RESERVATION_STATUS_TRANSITIONS[from].includes(to);
}
