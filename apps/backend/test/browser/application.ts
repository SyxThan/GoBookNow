import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { configureHttp } from '../../src/security/configure-http.js';
import { HttpPlatformModule } from '../../src/security/http-platform.module.js';
import { AuthModule } from '../../src/auth/auth.module.js';
import { BookingsModule } from '../../src/bookings/bookings.module.js';
import { CategoriesModule } from '../../src/categories/categories.module.js';
import { PrismaModule } from '../../src/database/prisma/prisma.module.js';
import { HealthModule } from '../../src/health/health.module.js';
import { PaymentsModule } from '../../src/payments/payments.module.js';
import { ReviewsModule } from '../../src/reviews/reviews.module.js';
import { ServicesModule } from '../../src/services/services.module.js';
import { SlotsModule } from '../../src/slots/slots.module.js';
import { TicketsModule } from '../../src/tickets/tickets.module.js';
import { AdminTransactionsModule } from '../../src/admin-transactions/admin-transactions.module.js';
import { VendorOperationsModule } from '../../src/vendor-operations/vendor-operations.module.js';
import { VendorApplicationsModule } from '../../src/vendor-applications/vendor-applications.module.js';
import { VendorsModule } from '../../src/vendors/vendors.module.js';
import { FILE_STORAGE_PROVIDER } from '../../src/storage/storage.constants.js';
import { loadBrowserEnvironment } from './environment.js';

export async function createBrowserApplication() {
  loadBrowserEnvironment();
  // These are the real production modules/controllers/guards. Only external file
  // storage is blocked; hosted checkout uses the real signer with synthetic keys.
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      PrismaModule,
      HttpPlatformModule,
      AuthModule,
      BookingsModule,
      CategoriesModule,
      HealthModule,
      PaymentsModule,
      ReviewsModule,
      ServicesModule,
      SlotsModule,
      TicketsModule,
      AdminTransactionsModule,
      VendorOperationsModule,
      VendorsModule,
      VendorApplicationsModule,
    ],
  })
    .overrideProvider(FILE_STORAGE_PROVIDER)
    .useValue({
      uploadImage: () => {
        throw new Error('External uploads are disabled in E2E');
      },
      deleteImage: () => {
        throw new Error('External uploads are disabled in E2E');
      },
    })
    .compile();
  const app = module.createNestApplication({
    bodyParser: false,
    logger: false,
  });
  configureHttp(app);
  await app.init();
  return app;
}
