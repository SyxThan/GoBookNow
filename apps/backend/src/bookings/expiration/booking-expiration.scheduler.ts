import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingExpirationService } from './booking-expiration.service.js';
import {
  BOOKING_EXPIRATION_INTERVAL_SECONDS_ENV,
  DEFAULT_BOOKING_EXPIRATION_INTERVAL_SECONDS,
  MAX_BOOKING_EXPIRATION_INTERVAL_SECONDS,
} from './booking-expiration.constants.js';

@Injectable()
export class BookingExpirationScheduler
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(BookingExpirationScheduler.name);
  private readonly intervalSeconds: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly expiration: BookingExpirationService,
    config: ConfigService,
  ) {
    this.intervalSeconds = this.parseIntervalSeconds(
      config.get<string>(BOOKING_EXPIRATION_INTERVAL_SECONDS_ENV),
    );
  }

  onModuleInit(): void {
    this.timer = setInterval(
      () => void this.runScheduledSweep(),
      this.intervalSeconds * 1_000,
    );
    this.timer.unref?.();
    this.logger.log(
      `Booking expiration scheduler started intervalSeconds=${this.intervalSeconds}`,
    );
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runScheduledSweep(): Promise<void> {
    if (this.running) {
      this.logger.warn(
        'Skipping booking expiration sweep because the previous sweep is still running',
      );
      return;
    }

    this.running = true;
    try {
      await this.expiration.sweepExpiredBookings();
    } catch (error: unknown) {
      this.logger.error(
        'Scheduled booking expiration sweep failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private parseIntervalSeconds(rawValue: string | undefined): number {
    const value =
      rawValue === undefined
        ? DEFAULT_BOOKING_EXPIRATION_INTERVAL_SECONDS
        : Number(rawValue);
    if (
      !Number.isInteger(value) ||
      value <= 0 ||
      value > MAX_BOOKING_EXPIRATION_INTERVAL_SECONDS
    ) {
      throw new Error(
        `${BOOKING_EXPIRATION_INTERVAL_SECONDS_ENV} must be an integer from 1 to ${MAX_BOOKING_EXPIRATION_INTERVAL_SECONDS}`,
      );
    }
    return value;
  }
}
