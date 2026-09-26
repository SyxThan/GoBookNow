import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { BookingCodeService } from './booking-code.service.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { CapacityService } from './capacity.service.js';

@Module({
  imports: [AuthModule, PricingModule],
  controllers: [BookingsController],
  providers: [BookingsService, CapacityService, BookingCodeService],
  exports: [BookingsService, CapacityService],
})
export class BookingsModule {}
