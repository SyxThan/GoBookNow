import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SentryModule } from '@sentry/nestjs/setup';
import { HttpPlatformModule } from './security/http-platform.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AdminTransactionsModule } from './admin-transactions/admin-transactions.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuditModule } from './audit/audit.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { PrismaModule } from './database/prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { RefundsModule } from './refunds/refunds.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { ServicesModule } from './services/services.module.js';
import { SlotsModule } from './slots/slots.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { VendorApplicationsModule } from './vendor-applications/vendor-applications.module.js';
import { VendorsModule } from './vendors/vendors.module.js';
import { VendorOperationsModule } from './vendor-operations/vendor-operations.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    HttpPlatformModule,
    SentryModule.forRoot(),
    AdminTransactionsModule,
    AuthModule,
    AuditModule,
    BookingsModule,
    CategoriesModule,
    HealthModule,
    PaymentsModule,
    RefundsModule,
    ReviewsModule,
    ServicesModule,
    SlotsModule,
    TicketsModule,
    VendorsModule,
    VendorOperationsModule,
    VendorApplicationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
