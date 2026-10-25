import * as Sentry from '@sentry/nestjs';
import { requestContext, uuid } from './context.js';
import { safeErrorName, safeFields } from './logger.js';

export function sanitizeEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: 'node',
    environment: event.environment,
    release: event.release,
    tags: { service: 'gobook-backend' },
    contexts: {
      application: safeFields({
        ...event.contexts?.application,
        ...requestContext.getStore(),
      }),
    },
    exception: {
      values: (event.exception?.values ?? []).map((error) => ({
        type: [
          'Error',
          'TypeError',
          'RangeError',
          'PrismaClientKnownRequestError',
        ].includes(error.type ?? '')
          ? error.type
          : 'Error',
        value: 'Unexpected application error',
        stacktrace: {
          frames: error.stacktrace?.frames?.map((frame) => ({
            filename: frame.filename
              ?.split(/[?#]/)[0]
              ?.replace(/^https?:\/\/[^/]+/, '')
              .replaceAll('\\', '/')
              .split('/')
              .filter(Boolean)
              .slice(-3)
              .join('/'),
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          })),
        },
      })),
    },
  };
}
export function sampleRate(value: string | undefined): number {
  if (value === undefined || value === '') return 0;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1)
    throw new Error('Sentry sampling must be between zero and one');
  return rate;
}
export function initializeSentry(options: Partial<Sentry.NodeOptions> = {}) {
  if (Sentry.getClient()) return;
  const dsn = process.env.SENTRY_DSN;
  // Missing/invalid monitoring configuration never prevents business startup.
  try {
    Sentry.init({
      dsn: dsn || undefined,
      enabled: Boolean(dsn),
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
        stackFrameVariables: false,
        frameContextLines: 0,
        queues: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        mcp: { inputs: false, outputs: false },
      },
      includeServerName: false,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      release: process.env.SENTRY_RELEASE,
      tracesSampleRate: sampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
      traceLifecycle: 'stream',
      beforeSend: (event, hint) => {
        const error = hint.originalException;
        if (
          error &&
          typeof error === 'object' &&
          'getStatus' in error &&
          typeof error.getStatus === 'function' &&
          Number(error.getStatus()) < 500
        )
          return null;
        return sanitizeEvent(event);
      },
      beforeBreadcrumb: () => null,
      beforeSendLog: () => null,
      beforeSendMetric: () => null,
      beforeSendSpan: (span) => ({
        ...span,
        name: 'application.operation',
        attributes: {},
        links: [],
      }),
      ...options,
    });
  } catch {
    /* Optional monitoring stays disabled on invalid config. */
  }
}
export function captureUnexpected(error: unknown) {
  try {
    const context = requestContext.getStore();
    Sentry.withScope((scope) => {
      scope.setContext('application', safeFields(context));
      if (uuid(context?.userId)) scope.setUser({ id: context.userId });
      Sentry.captureException(
        error instanceof Error ? error : new Error(safeErrorName(error)),
      );
    });
  } catch {
    /* Monitoring failure never changes the API response. */
  }
}
