import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthModule } from '../../../src/auth/auth.module.js';
import { BookingsModule } from '../../../src/bookings/bookings.module.js';
import { BookingExpirationScheduler } from '../../../src/bookings/expiration/booking-expiration.scheduler.js';
import { PrismaModule } from '../../../src/database/prisma/prisma.module.js';
import { PrismaService } from '../../../src/database/prisma/prisma.service.js';
import { PaymentsModule } from '../../../src/payments/payments.module.js';
import {
  PAYMENT_CHECKOUT_PROVIDER,
  type PaymentCheckoutProvider,
} from '../../../src/payments/providers/payment-checkout-provider.js';
import { ensureSystemRoles } from '../../helpers/system-roles.js';
import { FixtureFactory } from './fixtures.js';
import { assertIntegrationDatabase } from './test-environment.js';
import { cleanTestDatabase } from './test-database.js';

const checkout: PaymentCheckoutProvider = {
  createCheckout: async (input) => ({
    paymentUrl: 'https://checkout.invalid/integration',
    method: 'POST',
    formFields: {
      order_invoice_number: input.merchantReference,
      order_amount: input.amount.toString(),
      currency: input.currency,
    },
  }),
};

export function integrationSuite() {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: FixtureFactory;
  beforeAll(async () => {
    assertIntegrationDatabase();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PrismaModule,
        AuthModule,
        BookingsModule,
        PaymentsModule,
      ],
    })
      .overrideProvider(PAYMENT_CHECKOUT_PROVIDER)
      .useValue(checkout)
      // Keep time under each test's control; expiration business logic remains real.
      .overrideProvider(BookingExpirationScheduler)
      .useValue({})
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });
  beforeEach(async () => {
    await cleanTestDatabase(prisma);
    await ensureSystemRoles(prisma);
    fixtures = new FixtureFactory(app, prisma);
  });
  afterEach(async () => {
    if (prisma) await cleanTestDatabase(prisma);
  });
  afterAll(async () => {
    await app?.close();
  });
  return () => ({ app, prisma, fixtures });
}
