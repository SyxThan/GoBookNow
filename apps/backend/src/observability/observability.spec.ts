import { randomUUID } from 'node:crypto';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
type TestTransport = ReturnType<NonNullable<Sentry.NodeOptions['transport']>>;
type Envelope = Parameters<TestTransport['send']>[0];
import { JsonLogger, safeFields } from './logger.js';
import { bindContext, jobContext, requestContext } from './context.js';
import {
  captureUnexpected,
  initializeSentry,
  sampleRate,
  sanitizeEvent,
} from './sentry.js';

describe('Observability privacy and context', () => {
  it('serializes only approved metadata and string money, excluding nested secrets and raw errors', () => {
    const lines: string[] = [];
    const log = new JsonLogger((line) => lines.push(line));
    const secret = 'sensitive-password-jwt-bank-ticket-value';
    log.error(new Error(secret));
    log.log({
      event: 'payment.initiated',
      amount: 123n,
      currency: 'VND',
      password: secret,
      nested: { accessToken: secret },
      headers: { Authorization: secret },
      body: secret,
      signedFields: secret,
    });
    expect(lines.join('')).not.toContain(secret);
    expect(JSON.parse(lines[1]!).amount).toBe('123');
    expect(safeFields({ userId: 'forged', bookingId: 'forged' })).toEqual({});
    expect(
      safeFields({
        passwordId: randomUUID(),
        providerTransactionId: randomUUID(),
      }),
    ).toEqual({});
  });
  it('isolates concurrent async requests and binds only validated context IDs', async () => {
    const lines: string[] = [];
    const log = new JsonLogger((line) => lines.push(line));
    const a = randomUUID(),
      b = randomUUID();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    await Promise.all(
      [a, b].map((id) =>
        requestContext.run({ requestId: id }, async () => {
          bindContext({ userId: id, paymentId: 'forged' });
          if (id === a) await barrier;
          else release();
          log.emit('info', 'http.completed');
        }),
      ),
    );
    const records = lines.map(
      (line) =>
        JSON.parse(line) as {
          requestId: string;
          userId: string;
          paymentId?: string;
        },
    );
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.userId).toBe(record.requestId);
      expect(record.paymentId).toBeUndefined();
    }
    expect(requestContext.getStore()).toBeUndefined();
    jobContext('booking.expiration', () => {
      expect(requestContext.getStore()?.jobId).toMatch(/^[0-9a-f-]{36}$/);
      expect(requestContext.getStore()?.userId).toBeUndefined();
    });
  });
  it('does not let a failing log sink affect business behavior', () => {
    expect(() =>
      new JsonLogger(() => {
        throw new Error('sink unavailable');
      }).emit('info', 'payment.succeeded'),
    ).not.toThrow();
  });
  it('strips Sentry PII, SQL, stack source variables and URL/query credentials', () => {
    const secret = 'sensitive-password-token-bank-nonce';
    const sanitized = sanitizeEvent({
      type: undefined,
      request: {
        url: `https://site.invalid/?accessToken=${secret}`,
        headers: { Authorization: secret },
        data: secret,
        cookies: { key: secret },
      },
      user: { email: secret },
      extra: { bank: secret },
      breadcrumbs: [{ message: secret }],
      exception: {
        values: [
          {
            type: 'Error',
            value: secret,
            stacktrace: {
              frames: [
                {
                  filename: `https://site.invalid/app.js?token=${secret}`,
                  vars: { password: secret },
                  pre_context: [secret],
                },
              ],
            },
          },
        ],
      },
    });
    expect(JSON.stringify(sanitized)).not.toContain(secret);
    expect(
      sanitized.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename,
    ).toBe('app.js');
  });
  it.each(['-0.1', '1.1', 'not-a-number'])(
    'rejects invalid monitoring sampling %s',
    (value) => expect(() => sampleRate(value)).toThrow(),
  );
});

describe('Sentry official SDK transport', () => {
  afterEach(async () => {
    await Sentry.close(100);
    Sentry.getCurrentScope().setClient(undefined);
  });
  it('captures unexpected failures once, filters expected 4xx and preserves safe request context', async () => {
    const envelopes: Envelope[] = [];
    initializeSentry({
      dsn: 'https://public@example.invalid/1',
      enabled: true,
      defaultIntegrations: false,
      transport: () => ({
        send: (envelope) => {
          envelopes.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    });
    const id = randomUUID();
    const error = new Error('sensitive-password-never-send');
    requestContext.run({ requestId: id }, () => {
      captureUnexpected(error);
      captureUnexpected(error);
      captureUnexpected(new ForbiddenException('private'));
      captureUnexpected(new BadRequestException('private'));
    });
    await Sentry.flush(1000);
    const events = envelopes.flatMap((envelope) =>
      envelope[1]
        .filter(([header]) => header.type === 'event')
        .map(([, payload]) => payload),
    );
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).toContain(id);
    expect(JSON.stringify(events)).not.toContain(
      'sensitive-password-never-send',
    );
  });
  it('works without a DSN and when transport rejects asynchronously', async () => {
    initializeSentry();
    expect(() => captureUnexpected(new Error('disabled'))).not.toThrow();
    await Sentry.close(100);
    Sentry.getCurrentScope().setClient(undefined);
    initializeSentry({
      dsn: 'https://public@example.invalid/1',
      enabled: true,
      defaultIntegrations: false,
      transport: () => ({
        send: () => Promise.reject(new Error('offline')),
        flush: () => Promise.resolve(true),
      }),
    });
    expect(() => captureUnexpected(new Error('unexpected'))).not.toThrow();
    await Sentry.flush(100);
  });
});
