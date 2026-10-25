import type { LoggerService } from '@nestjs/common';
import { requestContext, uuid } from './context.js';

const identifiers = new Set([
  'requestId',
  'clientCorrelationId',
  'userId',
  'bookingId',
  'paymentId',
  'jobId',
  'ticketId',
  'refundId',
  'attemptId',
  'reservationId',
  'serviceId',
  'vendorId',
  'actorUserId',
]);

const numeric = new Set([
  'durationMs',
  'statusCode',
  'reservationCount',
  'ticketCount',
  'expiredBookings',
  'expiredReservations',
  'candidateCount',
  'batchSize',
  'skippedBookings',
]);
const tokens = new Set([
  'event',
  'reason',
  'errorCode',
  'method',
  'status',
  'jobType',
]);
const knownErrors = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'PrismaClientKnownRequestError',
  'PrismaClientUnknownRequestError',
]);
export function safeFields(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || input instanceof Error) return {};
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (identifiers.has(key) && uuid(value)) output[key] = value;
    else if (
      numeric.has(key) &&
      typeof value === 'number' &&
      Number.isFinite(value)
    )
      output[key] = value;
    else if (
      tokens.has(key) &&
      typeof value === 'string' &&
      /^[\w.-]{1,100}$/.test(value)
    )
      output[key] = value;
    else if (
      key === 'route' &&
      typeof value === 'string' &&
      /^\/[\w/:.-]{0,180}$/.test(value)
    )
      output[key] = value;
    else if (
      key === 'currency' &&
      typeof value === 'string' &&
      /^[A-Z]{3}$/.test(value)
    )
      output[key] = value;
    else if (key === 'amount' && /^\d{1,19}$/.test(String(value)))
      output[key] = String(value);
  }
  return output;
}
export function safeErrorName(error: unknown) {
  return error instanceof Error && knownErrors.has(error.name)
    ? error.name
    : 'Error';
}

export class JsonLogger implements LoggerService {
  constructor(
    private readonly write: (line: string) => void = (line) => {
      process.stdout.write(`${line}\n`);
    },
  ) {}
  emit(level: string, event: string, fields: unknown = {}) {
    try {
      this.write(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level,
          service: 'gobook-backend',
          environment:
            process.env.NODE_ENV === 'production'
              ? 'production'
              : process.env.NODE_ENV === 'test'
                ? 'test'
                : 'development',
          message: event,
          ...safeFields(requestContext.getStore()),
          ...safeFields(fields),
          event,
        }),
      );
    } catch {
      /* Logging must never change financial behavior. */
    }
  }
  log(message: unknown) {
    this.emit('info', this.event(message, 'application.log'), message);
  }
  warn(message: unknown) {
    this.emit('warn', this.event(message, 'application.warning'), message);
  }
  error(message: unknown) {
    this.emit('error', this.event(message, 'application.error'), message);
  }
  debug(message: unknown) {
    if (process.env.NODE_ENV !== 'production')
      this.emit('debug', 'application.debug', message);
  }
  verbose(message: unknown) {
    this.debug(message);
  }
  fatal(message: unknown) {
    this.error(message);
  }
  private event(input: unknown, fallback: string) {
    const event = safeFields(input).event;
    return typeof event === 'string' ? event : fallback;
  }
}
export const logger = new JsonLogger();
