import {
  BookingStatus,
  ReservationStatus,
} from '../generated/prisma/client.js';
import {
  BOOKING_STATUS_TRANSITIONS,
  RESERVATION_STATUS_TRANSITIONS,
  TERMINAL_BOOKING_STATUSES,
  TERMINAL_RESERVATION_STATUSES,
  canTransitionBookingStatus,
  canTransitionReservationStatus,
} from './booking-state.rules.js';

describe('booking state rules', () => {
  it('allows only the documented Booking transitions', () => {
    expect(BOOKING_STATUS_TRANSITIONS).toEqual({
      [BookingStatus.PENDING_PAYMENT]: [
        BookingStatus.CONFIRMED,
        BookingStatus.EXPIRED,
        BookingStatus.CANCELLED,
      ],
      [BookingStatus.CONFIRMED]: [BookingStatus.CANCELLED],
      [BookingStatus.EXPIRED]: [],
      [BookingStatus.CANCELLED]: [],
    });

    expect(
      canTransitionBookingStatus(
        BookingStatus.PENDING_PAYMENT,
        BookingStatus.CONFIRMED,
      ),
    ).toBe(true);
    expect(
      canTransitionBookingStatus(
        BookingStatus.PENDING_PAYMENT,
        BookingStatus.EXPIRED,
      ),
    ).toBe(true);
    expect(
      canTransitionBookingStatus(
        BookingStatus.PENDING_PAYMENT,
        BookingStatus.CANCELLED,
      ),
    ).toBe(true);
    expect(
      canTransitionBookingStatus(
        BookingStatus.CONFIRMED,
        BookingStatus.CANCELLED,
      ),
    ).toBe(true);
    expect(
      canTransitionBookingStatus(
        BookingStatus.EXPIRED,
        BookingStatus.CONFIRMED,
      ),
    ).toBe(false);
    expect(
      canTransitionBookingStatus(
        BookingStatus.CANCELLED,
        BookingStatus.CONFIRMED,
      ),
    ).toBe(false);
    expect(
      canTransitionBookingStatus(
        BookingStatus.CONFIRMED,
        BookingStatus.PENDING_PAYMENT,
      ),
    ).toBe(false);
    expect(TERMINAL_BOOKING_STATUSES).toEqual([
      BookingStatus.EXPIRED,
      BookingStatus.CANCELLED,
    ]);
  });

  it('allows only the documented Reservation transitions', () => {
    expect(RESERVATION_STATUS_TRANSITIONS).toEqual({
      [ReservationStatus.HELD]: [
        ReservationStatus.CONFIRMED,
        ReservationStatus.EXPIRED,
        ReservationStatus.RELEASED,
      ],
      [ReservationStatus.CONFIRMED]: [ReservationStatus.RELEASED],
      [ReservationStatus.EXPIRED]: [],
      [ReservationStatus.RELEASED]: [],
    });

    expect(
      canTransitionReservationStatus(
        ReservationStatus.HELD,
        ReservationStatus.CONFIRMED,
      ),
    ).toBe(true);
    expect(
      canTransitionReservationStatus(
        ReservationStatus.HELD,
        ReservationStatus.EXPIRED,
      ),
    ).toBe(true);
    expect(
      canTransitionReservationStatus(
        ReservationStatus.HELD,
        ReservationStatus.RELEASED,
      ),
    ).toBe(true);
    expect(
      canTransitionReservationStatus(
        ReservationStatus.CONFIRMED,
        ReservationStatus.RELEASED,
      ),
    ).toBe(true);
    expect(
      canTransitionReservationStatus(
        ReservationStatus.EXPIRED,
        ReservationStatus.CONFIRMED,
      ),
    ).toBe(false);
    expect(
      canTransitionReservationStatus(
        ReservationStatus.RELEASED,
        ReservationStatus.HELD,
      ),
    ).toBe(false);
    expect(
      canTransitionReservationStatus(
        ReservationStatus.CONFIRMED,
        ReservationStatus.HELD,
      ),
    ).toBe(false);
    expect(TERMINAL_RESERVATION_STATUSES).toEqual([
      ReservationStatus.EXPIRED,
      ReservationStatus.RELEASED,
    ]);
  });
});
