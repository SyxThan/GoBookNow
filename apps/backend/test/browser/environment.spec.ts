import { assertBrowserTargets } from './environment.js';

describe('Browser test target safety', () => {
  const safe: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    DATABASE_URL:
      'postgresql://test:test@127.0.0.1:5434/gobook_test_e2e?schema=public',
    INTEGRATION_TEST_ALLOW_CLEANUP: '1',
    E2E_BASE_URL: 'http://127.0.0.1:3100',
    BACKEND_BASE_URL: 'http://127.0.0.1:3101',
  };

  it('accepts only an explicitly opted-in isolated database and loopback servers', () => {
    expect(assertBrowserTargets(safe)).toEqual({
      frontend: safe.E2E_BASE_URL,
      backend: safe.BACKEND_BASE_URL,
    });
  });

  it.each([
    { NODE_ENV: 'production' },
    { INTEGRATION_TEST_ALLOW_CLEANUP: '0' },
    { DATABASE_URL: undefined },
    { DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/gobook' },
    { DATABASE_URL: 'postgresql://test:test@127.0.0.1:5433/gobook_test' },
    {
      DATABASE_URL:
        'postgresql://test:test@shared.example.invalid/gobook_test_e2e',
    },
    {
      DATABASE_URL:
        'postgresql://test:test@127.0.0.1:5434/gobook_test_e2e?schema=customers',
    },
    {
      DATABASE_URL:
        'postgresql://test:test@127.0.0.1:5434/gobook_test_e2e?options=unsafe',
    },
    { E2E_BASE_URL: 'https://staging.example.invalid' },
    { BACKEND_BASE_URL: 'https://api.example.invalid' },
    { E2E_BASE_URL: 'http://127.0.0.1:3100/redirect' },
    { BACKEND_BASE_URL: safe.E2E_BASE_URL },
  ])('rejects unsafe targets before setup or cleanup (%#)', (change) => {
    expect(() => assertBrowserTargets({ ...safe, ...change })).toThrow();
  });
});
