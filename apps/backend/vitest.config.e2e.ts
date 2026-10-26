import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
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
