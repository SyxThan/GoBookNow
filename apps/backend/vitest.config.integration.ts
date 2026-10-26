import { defineConfig } from 'vitest/config';
import {
  assertIntegrationDatabase,
  loadTestEnvironment,
} from './test/integration/helpers/test-environment.js';

loadTestEnvironment();
assertIntegrationDatabase();

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    include: ['test/integration/**/*.int-spec.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    globalSetup: ['./test/integration/helpers/global-setup.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/integration.xml' },
    env: {
      JWT_ACCESS_SECRET: 'integration-only-access-secret',
      JWT_ACCESS_EXPIRES_IN: '15m',
      SEPAY_ENV: 'sandbox',
      SEPAY_IPN_SECRET: 'integration-only-ipn-secret',
      TICKET_TOKEN_SECRET: 'integration-only-ticket-secret-at-least-32-bytes',
      PLATFORM_COMMISSION_BPS: '1000',
      BOOKING_HOLD_TTL_MINUTES: '10',
      BOOKING_EXPIRATION_INTERVAL_SECONDS: '3600',
    },
  },
});
