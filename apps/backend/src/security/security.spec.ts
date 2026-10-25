import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { ExecutionContext } from '@nestjs/common';
import { RateLimitGuard, RateLimitStore } from './rate-limit.js';
import {
  origins,
  trustedProxies,
  validateProduction,
} from './configuration.js';

describe('Security configuration', () => {
  it.each([
    '*',
    'https://app.example/path',
    'https://user:pass@app.example',
    'null',
    '',
  ])('rejects unsafe origins %s', (value) => {
    expect(() =>
      origins(
        new ConfigService({ NODE_ENV: 'production', CORS_ORIGINS: value }),
      ),
    ).toThrow();
  });
  it('keeps default proxy trust disabled and accepts only explicit IP ranges', () => {
    expect(trustedProxies(new ConfigService())).toBe(false);
    expect(
      trustedProxies(
        new ConfigService({ TRUST_PROXY_CIDRS: '127.0.0.1,10.0.0.0/24' }),
      ),
    ).toEqual(['127.0.0.1', '10.0.0.0/24']);
    for (const value of [
      'true',
      '1',
      '0.0.0.0/0',
      'unknown',
      '10.0.0.0/99',
      '10.0.0.0/24/8',
    ])
      expect(() =>
        trustedProxies(new ConfigService({ TRUST_PROXY_CIDRS: value })),
      ).toThrow();
  });
  it('fails closed for missing production secrets or insecure cookies', () => {
    const values = {
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.invalid',
      JWT_ACCESS_SECRET: 'synthetic-production-shape-at-least-32-bytes',
      SEPAY_IPN_SECRET: 'synthetic-production-shape-at-least-32-bytes',
      SEPAY_SECRET_KEY: 'synthetic-production-shape-at-least-32-bytes',
      TICKET_TOKEN_SECRET: 'synthetic-production-shape-at-least-32-bytes',
      AUTH_COOKIE_SECURE: 'true',
      RATE_LIMIT_SINGLE_INSTANCE: 'true',
    };
    expect(() => validateProduction(new ConfigService(values))).not.toThrow();
    expect(() =>
      validateProduction(
        new ConfigService({ ...values, JWT_ACCESS_SECRET: 'change-me' }),
      ),
    ).toThrow();
    expect(() =>
      validateProduction(
        new ConfigService({ ...values, AUTH_COOKIE_SECURE: 'false' }),
      ),
    ).toThrow();
    expect(() =>
      validateProduction(
        new ConfigService({ ...values, RATE_LIMIT_SINGLE_INSTANCE: 'false' }),
      ),
    ).toThrow();
  });
});

describe('Rate limit identity and lifecycle', () => {
  it('isolates verified subjects while preserving the shared IP baseline', async () => {
    const config = new ConfigService({
      RATE_LIMIT_READ_IP: 100,
      RATE_LIMIT_READ_SUBJECT: 1,
    });
    const jwt = new JwtService({ secret: 'synthetic-unit-signing-key' });
    const store = new RateLimitStore(config);
    const guard = new RateLimitGuard(config, store, jwt);
    const context = (id: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'GET',
            path: '/api/v1/payments/example',
            ip: '127.0.0.1',
            get: () => `Bearer ${jwt.sign({ sub: id, type: 'access' })}`,
          }),
          getResponse: () => ({ setHeader: vi.fn() }),
        }),
      }) as unknown as ExecutionContext;
    const a = randomUUID(),
      b = randomUUID();
    try {
      await expect(guard.canActivate(context(a))).resolves.toBe(true);
      await expect(guard.canActivate(context(a))).rejects.toMatchObject({
        status: 429,
      });
      await expect(guard.canActivate(context(b))).resolves.toBe(true);
    } finally {
      store.onModuleDestroy();
    }
  });
  it('resets memory counters when the configured window expires without waiting in real time', async () => {
    vi.useFakeTimers();
    const store = new RateLimitStore(new ConfigService());
    try {
      expect(await store.consume('unique', 1, 1000)).toBe(0);
      expect(await store.consume('unique', 1, 1000)).toBeGreaterThan(0);
      vi.advanceTimersByTime(1001);
      expect(await store.consume('unique', 1, 1000)).toBe(0);
    } finally {
      store.onModuleDestroy();
      vi.useRealTimers();
    }
  });
});
