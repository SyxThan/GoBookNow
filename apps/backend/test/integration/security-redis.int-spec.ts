import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { RateLimitStore } from '../../src/security/rate-limit.js';
import { assertIntegrationDatabase } from './helpers/test-environment.js';

describe('Security: shared Redis store', () => {
  it('enforces one atomic quota across two independent application stores', async () => {
    assertIntegrationDatabase();
    const target =
      process.env.SECURITY_TEST_REDIS_URL ?? 'redis://127.0.0.1:6380';
    const url = new URL(target);
    if (
      url.hostname !== '127.0.0.1' ||
      url.port !== '6380' ||
      url.username ||
      url.password
    )
      throw new Error('Redis test must use dedicated local port 6380');
    const config = new ConfigService({
      RATE_LIMIT_STORAGE: 'redis',
      RATE_LIMIT_REDIS_URL: target,
    });
    const first = new RateLimitStore(config),
      second = new RateLimitStore(config);
    try {
      const key = `test:${randomUUID()}`;
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          (i % 2 ? first : second).consume(key, 5, 1500),
        ),
      );
      expect(results.filter((result) => result === 0)).toHaveLength(5);
      expect(results.filter((result) => result > 0)).toHaveLength(7);
      await expect
        .poll(() => second.consume(key, 5, 1500), { timeout: 3500 })
        .toBe(0);
    } finally {
      first.onModuleDestroy();
      second.onModuleDestroy();
    }
  });
});
