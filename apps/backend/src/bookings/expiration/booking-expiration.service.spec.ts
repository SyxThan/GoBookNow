import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  ReservationStatus,
} from '../../generated/prisma/client.js';
import type { PrismaService } from '../../database/prisma/prisma.service.js';
import { BookingExpirationService } from './booking-expiration.service.js';

describe('BookingExpirationService', () => {
  it('rolls back Reservation changes if Booking expiration cannot complete', async () => {
    const databaseNow = new Date('2026-09-26T10:00:00.000Z');
    const state = {
      booking: {
        id: 'booking-1',
        status: BookingStatus.PENDING_PAYMENT,
        expiresAt: new Date('2026-09-26T09:59:00.000Z'),
        expiredAt: null as Date | null,
      },
      reservation: {
        status: ReservationStatus.HELD,
        expiresAt: new Date('2026-09-26T09:59:00.000Z'),
      },
    };
    const transaction = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ now: databaseNow }])
        .mockResolvedValueOnce([{ id: state.booking.id }]),
      booking: {
        findFirst: vi.fn().mockResolvedValue({ id: state.booking.id }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      reservation: {
        updateMany: vi.fn().mockImplementation(() => {
          state.reservation.status = ReservationStatus.EXPIRED;
          return Promise.resolve({ count: 1 });
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => {
        const snapshot = {
          booking: { ...state.booking },
          reservation: { ...state.reservation },
        };
        try {
          return await callback(transaction);
        } catch (error) {
          state.booking = snapshot.booking;
          state.reservation = snapshot.reservation;
          throw error;
        }
      }),
    } as unknown as PrismaService;
    const config = {
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const service = new BookingExpirationService(prisma, config);
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const loggerLog = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    try {
      await expect(service.sweepExpiredBookings()).rejects.toThrow(
        'Booking expiration state changed unexpectedly',
      );
      expect(state.booking.status).toBe(BookingStatus.PENDING_PAYMENT);
      expect(state.reservation.status).toBe(ReservationStatus.HELD);
    } finally {
      loggerError.mockRestore();
      loggerLog.mockRestore();
    }
  });
});
