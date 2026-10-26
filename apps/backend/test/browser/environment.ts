import { config } from 'dotenv';
import { assertIntegrationDatabase } from '../integration/helpers/test-environment.js';

export function loadBrowserEnvironment(): void {
  // Never load a developer .env. Existing explicit CI variables take precedence.
  config({ path: '.env.e2e', quiet: true });
  const { frontend, backend, vendor, admin } = assertBrowserTargets();
  Object.assign(process.env, {
    E2E_BASE_URL: frontend,
    BACKEND_BASE_URL: backend,
    FRONTEND_ORIGIN: frontend,
    VENDOR_E2E_BASE_URL: vendor,
    ADMIN_E2E_BASE_URL: admin,
    VENDOR_ORIGIN: vendor,
    ADMIN_ORIGIN: admin,
    CORS_ORIGINS: [frontend, vendor, admin].join(","),
    NEXT_PUBLIC_CUSTOMER_URL: frontend,
    NEXT_PUBLIC_VENDOR_URL: vendor,
    NEXT_PUBLIC_ADMIN_URL: admin,
    NEXT_PUBLIC_API_URL: `${backend}/api/v1`,
    NEXT_TELEMETRY_DISABLED: '1',
    JWT_ACCESS_SECRET: 'e2e-only-access-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    AUTH_COOKIE_SECURE: 'false',
    AUTH_COOKIE_SAME_SITE: 'lax',
    SEPAY_ENV: 'sandbox',
    SEPAY_MERCHANT_ID: 'e2e-only-merchant',
    SEPAY_SECRET_KEY: 'e2e-only-form-signing-secret',
    SEPAY_IPN_SECRET: 'e2e-only-ipn-secret',
    SEPAY_SUCCESS_URL: `${frontend}/payment/result`,
    SEPAY_ERROR_URL: `${frontend}/payment/result`,
    SEPAY_CANCEL_URL: `${frontend}/payment/result`,
    TICKET_TOKEN_SECRET: 'e2e-only-ticket-secret-at-least-32-bytes',
    PLATFORM_COMMISSION_BPS: '1000',
    BOOKING_HOLD_TTL_MINUTES: '10',
    BOOKING_EXPIRATION_INTERVAL_SECONDS: '3600',
  });
}

export function assertBrowserTargets(env: NodeJS.ProcessEnv = process.env) {
  const database = assertIntegrationDatabase(env);
  if (!/^\/gobook_test_e2e(?:_[a-z0-9]+)*$/.test(database.pathname))
    throw new Error('Browser tests require their own gobook_test_e2e database');
  const frontend = localOrigin(env.E2E_BASE_URL ?? 'http://127.0.0.1:3100');
  const backend = localOrigin(env.BACKEND_BASE_URL ?? 'http://127.0.0.1:3101');
  const vendor = localOrigin(env.VENDOR_E2E_BASE_URL ?? 'http://127.0.0.1:3102');
  const admin = localOrigin(env.ADMIN_E2E_BASE_URL ?? 'http://127.0.0.1:3103');
  if (new Set([frontend, backend, vendor, admin]).size !== 4) throw new Error('All portal/API origins must differ');
  return { frontend, backend, vendor, admin };
}

function localOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error(
      'Full browser suite only accepts explicit loopback HTTP origins',
    );
  return url.origin;
}
