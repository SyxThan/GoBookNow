import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { VendorAnalyticsService } from './vendor-analytics.service.js';
import { VendorBookingsService } from './vendor-bookings.service.js';
import { VendorBookingsController, VendorDashboardController } from './vendor-operations.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [VendorBookingsController, VendorDashboardController],
  providers: [VendorBookingsService, VendorAnalyticsService],
})
export class VendorOperationsModule {}
