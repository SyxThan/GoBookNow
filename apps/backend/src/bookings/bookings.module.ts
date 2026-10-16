import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { RefundsModule } from '../refunds/refunds.module.js';
import { BookingCodeService } from './booking-code.service.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { CancellationPolicyProvider } from './cancellation/cancellation-policy.provider.js';
import { BookingCancellationService } from './cancellation/booking-cancellation.service.js';
import { CapacityService } from './capacity.service.js';
import { BookingExpirationScheduler } from './expiration/booking-expiration.scheduler.js';
import { BookingExpirationService } from './expiration/booking-expiration.service.js';

@Module({
  imports: [AuthModule, PricingModule, RefundsModule],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    CapacityService,
    BookingCodeService,
    CancellationPolicyProvider,
    BookingCancellationService,
    BookingExpirationService,
    BookingExpirationScheduler,
  ],
  exports: [BookingsService, CapacityService, BookingExpirationService],
})
export class BookingsModule {}
