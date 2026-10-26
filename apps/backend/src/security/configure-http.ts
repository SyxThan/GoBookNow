import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import {
  json,
  urlencoded,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import helmet from 'helmet';
import { requestContext, uuid } from '../observability/context.js';
import { logger, safeErrorName } from '../observability/logger.js';
import { captureUnexpected } from '../observability/sentry.js';
import {
  origins,
  trustedProxies,
  validateProduction,
} from './configuration.js';
import { RateLimitGuard, RateLimitStore } from './rate-limit.js';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const parserStatus =
      error &&
      typeof error === 'object' &&
      'type' in error &&
      ['entity.too.large', 'entity.parse.failed'].includes(String(error.type))
        ? error.type === 'entity.too.large'
          ? 413
          : 400
        : undefined;
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : (parserStatus ?? 500);
    const requestId =
      requestContext.getStore()?.requestId ??
      String(response.getHeader('X-Request-Id') ?? randomUUID());
    if (status >= 500) {
      logger.emit('error', 'http.unexpected_error', {
        statusCode: status,
        errorCode: safeErrorName(error),
      });
      captureUnexpected(error);
      response
        .status(status)
        .json({
          statusCode: status,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Đã xảy ra lỗi hệ thống.',
          requestId,
        });
      return;
    }
    const body =
      error instanceof HttpException
        ? error.getResponse()
        : { message: 'Invalid request body' };
    response
      .status(status)
      .json({
        statusCode: status,
        ...(typeof body === 'string' ? { message: body } : body),
        requestId,
      });
  }
}

export function configureHttp(app: INestApplication, useJsonLogger = true) {
  const config = app.get(ConfigService);
  validateProduction(config);
  const allowlist = origins(config);
  app.getHttpAdapter().getInstance().set('trust proxy', trustedProxies(config));
  if (useJsonLogger) app.useLogger(logger);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = randomUUID();
    const external = request.get('X-Request-Id');
    const started = performance.now();
    requestContext.run(
      {
        requestId,
        ...(uuid(external) ? { clientCorrelationId: external } : {}),
      },
      () => {
        response.setHeader('X-Request-Id', requestId);
        response.once('finish', () =>
          logger.emit('info', 'http.completed', {
            method: request.method,
            route: request.route?.path ?? '/unmatched',
            statusCode: response.statusCode,
            durationMs: Math.round(performance.now() - started),
          }),
        );
        next();
      },
    );
  });
  app.use(
    helmet({
      contentSecurityPolicy: false,
      strictTransportSecurity:
        config.get('NODE_ENV') === 'production'
          ? { maxAge: 15_552_000, includeSubDomains: false, preload: false }
          : false,
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: (
      origin: string | undefined,
      done: (error: Error | null, allow: boolean) => void,
    ) => done(null, !origin || allowlist.includes(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Request-Id',
      'X-Portal',
      'sentry-trace',
      'baggage',
    ],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const origin = request.get('Origin');
    if (
      request.method === 'POST' &&
      /\/auth\/(login|register|refresh|logout)$/.test(request.path) &&
      ((origin && !allowlist.includes(origin)) ||
        (!origin && request.get('Sec-Fetch-Site') === 'cross-site'))
    ) {
      response
        .status(403)
        .json({
          statusCode: 403,
          code: 'ORIGIN_NOT_ALLOWED',
          message: 'Browser origin is not allowed.',
          requestId: requestContext.getStore()?.requestId,
        });
      return;
    }
    next();
  });
  const ordinary = json({ limit: '256kb' });
  const webhook = json({ limit: '64kb' });
  app.use((request: Request, response: Response, next: NextFunction) =>
    (request.path === '/api/v1/webhooks/sepay/ipn' ? webhook : ordinary)(
      request,
      response,
      next,
    ),
  );
  app.use(urlencoded({ extended: false, limit: '64kb' }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalGuards(
    new RateLimitGuard(config, app.get(RateLimitStore), app.get(JwtService)),
  );
  app.useGlobalFilters(new SafeExceptionFilter());
  app.setGlobalPrefix('api/v1');
}
