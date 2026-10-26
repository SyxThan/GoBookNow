import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    fileParallelism: false,
    env: {
      PLATFORM_COMMISSION_BPS: '1000',
      TICKET_TOKEN_SECRET: 'e2e-only-ticket-secret-at-least-32-bytes',
    },
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
