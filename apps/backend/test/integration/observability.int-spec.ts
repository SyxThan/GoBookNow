import { Controller, Get, Module } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
type TestTransport = ReturnType<NonNullable<Sentry.NodeOptions['transport']>>;
type Envelope = Parameters<TestTransport['send']>[0];
import request from 'supertest';
import { integrationSuite } from './helpers/test-app.js';
import { logger } from '../../src/observability/logger.js';
import { initializeSentry } from '../../src/observability/sentry.js';
import { requestContext } from '../../src/observability/context.js';
import { safeFields } from '../../src/observability/logger.js';

// Isolated test fixture, never imported by a production module.
@Controller('diagnostics-fixture')
class DiagnosticsFixture {
  @Get('unexpected') unexpected() {
    throw new Error('private-password-ticket-nonce-database-url');
  }
}
@Module({ controllers: [DiagnosticsFixture] })
class DiagnosticsFixtureModule {}

describe('Observability: real HTTP boundary', () => {
  const suite = integrationSuite([DiagnosticsFixtureModule]);
  const api = () => request(suite().app.getHttpServer());
  afterEach(async () => {
    vi.restoreAllMocks();
    await Sentry.close(100);
    Sentry.getCurrentScope().setClient(undefined);
  });

  it('returns safe correlated 500, logs once and sends one sanitized SDK event through a test transport', async () => {
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
    const logs = vi.spyOn(logger, 'emit');
    const response = await api()
      .get('/api/v1/diagnostics-fixture/unexpected?password=do-not-send')
      .set('Authorization', 'Bearer private-token')
      .expect(500);
    expect(response.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Đã xảy ra lỗi hệ thống.',
      requestId: response.headers['x-request-id'],
    });
    await Sentry.flush(1000);
    const events = envelopes.flatMap((envelope) =>
      envelope[1]
        .filter(([header]) => header.type === 'event')
        .map(([, payload]) => payload),
    );
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).toContain(response.body.requestId);
    for (const secret of ['private-password', 'private-token', 'do-not-send']) {
      expect(JSON.stringify(events)).not.toContain(secret);
      expect(JSON.stringify(response.body)).not.toContain(secret);
      expect(JSON.stringify(logs.mock.calls)).not.toContain(secret);
    }
    expect(
      logs.mock.calls.filter(([, event]) => event === 'http.unexpected_error'),
    ).toHaveLength(1);
  });

  it('correlates committed Hold and Payment events with authenticated user and canonical request IDs', async () => {
    const contexts: Record<string, unknown>[] = [];
    const logs = vi.spyOn(logger, 'emit');
    logs.mockImplementation((_level, event, fields) => {
      contexts.push({
        event,
        ...requestContext.getStore(),
        ...safeFields(fields),
      });
    });
    const { fixtures } = suite();
    const scenario = await fixtures.createScenario();
    const held = await fixtures
      .holdRequest(scenario.customer, {
        items: [{ slotId: scenario.slots[0]!.id, quantity: 2 }],
      })
      .expect(201);
    const payment = await api()
      .post('/api/v1/payments/sepay')
      .auth(fixtures.token(scenario.customer), { type: 'bearer' })
      .send({ bookingId: held.body.id })
      .expect(201);
    const holdEvent = logs.mock.calls.find(
      ([, event]) => event === 'booking.hold.created',
    );
    const paymentEvent = logs.mock.calls.find(
      ([, event]) => event === 'payment.initiated',
    );
    expect(holdEvent?.[2]).toMatchObject({
      bookingId: held.body.id,
      userId: scenario.customer.id,
    });
    expect(paymentEvent?.[2]).toMatchObject({
      bookingId: held.body.id,
      paymentId: payment.body.paymentId,
    });
    expect(held.headers['x-request-id']).not.toBe(
      payment.headers['x-request-id'],
    );
    expect(
      contexts.find((entry) => entry.event === 'booking.hold.created'),
    ).toMatchObject({
      requestId: held.headers['x-request-id'],
      userId: scenario.customer.id,
      bookingId: held.body.id,
    });
    expect(
      contexts.find((entry) => entry.event === 'payment.initiated'),
    ).toMatchObject({
      requestId: payment.headers['x-request-id'],
      userId: scenario.customer.id,
      bookingId: held.body.id,
      paymentId: payment.body.paymentId,
    });
    expect(JSON.stringify(contexts)).not.toContain('formFields');
    expect(JSON.stringify(contexts)).not.toContain('Authorization');
  });

  it('keeps the real Booking/Payment flow available while Sentry transport fails', async () => {
    initializeSentry({
      dsn: 'https://public@example.invalid/1',
      enabled: true,
      defaultIntegrations: false,
      transport: () => ({
        send: () => Promise.reject(new Error('offline')),
        flush: () => Promise.resolve(true),
      }),
    });
    await api().get('/api/v1/diagnostics-fixture/unexpected').expect(500);
    const { fixtures } = suite();
    const scenario = await fixtures.createScenario();
    const hold = await fixtures
      .holdRequest(scenario.customer, {
        items: [{ slotId: scenario.slots[0]!.id, quantity: 1 }],
      })
      .expect(201);
    const payment = await api()
      .post('/api/v1/payments/sepay')
      .auth(fixtures.token(scenario.customer), { type: 'bearer' })
      .send({ bookingId: hold.body.id })
      .expect(201);
    await fixtures.sendIpn(fixtures.ipn(payment.body)).expect(200);
    expect((await fixtures.loadBooking(hold.body.id)).status).toBe('CONFIRMED');
    expect(await suite().prisma.ticket.count()).toBe(1);
  });
});
