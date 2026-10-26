import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { RefundsModule } from '../refunds/refunds.module.js';
import { BookingCodeService } from './booking-code.service.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { CustomerBookingReadService } from './customer-booking-read.service.js';
import { CancellationPolicyProvider } from './cancellation/cancellation-policy.provider.js';
import { BookingCancellationService } from './cancellation/booking-cancellation.service.js';
import { CapacityService } from './capacity.service.js';
import { BookingExpirationScheduler } from './expiration/booking-expiration.scheduler.js';
import { BookingExpirationService } from './expiration/booking-expiration.service.js';
import {
  AdminVouchersController,
  CustomerVouchersController,
} from '../vouchers/vouchers.controller.js';
import { VouchersService } from '../vouchers/vouchers.service.js';

@Module({
  imports: [AuthModule, PricingModule, RefundsModule],
  controllers: [
    BookingsController,
    AdminVouchersController,
    CustomerVouchersController,
  ],
  providers: [
    BookingsService,
    CustomerBookingReadService,
    CapacityService,
    BookingCodeService,
    CancellationPolicyProvider,
    BookingCancellationService,
    BookingExpirationService,
    BookingExpirationScheduler,
    VouchersService,
  ],
  exports: [BookingsService, CapacityService, BookingExpirationService],
})
export class BookingsModule {}
