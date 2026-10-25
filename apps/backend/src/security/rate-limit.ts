import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createClient } from 'redis';
import type { Request, Response } from 'express';
import { uuid } from '../observability/context.js';
import { validIpnSecret } from '../payments/sepay-ipn-auth.guard.js';

// Native CommonJS loading also works inside Playwright's ESM fixture loader.
const { ThrottlerStorageService } = createRequire(import.meta.url)(
  '@nestjs/throttler',
) as typeof import('@nestjs/throttler');

type Group = 'AUTH' | 'REFRESH' | 'WRITE' | 'READ' | 'WEBHOOK';
const limits: Record<Group, [number, number]> = {
  AUTH: [20, 10],
  REFRESH: [120, 120],
  WRITE: [600, 120],
  READ: [1200, 300],
  WEBHOOK: [120, 120],
};
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const increment = `local hits=redis.call('INCR',KEYS[1]); if hits==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return {hits,redis.call('PTTL',KEYS[1])}`;

@Injectable()
export class RateLimitStore implements OnModuleDestroy {
  private readonly memory = new ThrottlerStorageService();
  private redis?: ReturnType<typeof createClient>;
  private connecting?: Promise<unknown>;
  constructor(private readonly config: ConfigService) {
    const mode = config.get<string>('RATE_LIMIT_STORAGE') ?? 'memory';
    if (!['memory', 'redis'].includes(mode))
      throw new Error('Invalid rate-limit storage');
    if (mode === 'redis') {
      const url = config.getOrThrow<string>('RATE_LIMIT_REDIS_URL');
      this.redis = createClient({
        url,
        socket: { connectTimeout: 1500, reconnectStrategy: false },
        disableOfflineQueue: true,
      });
      this.redis.on('error', () => {
        /* Never log connection credentials. */
      });
    }
  }
  async consume(key: string, limit: number, ttl: number) {
    try {
      if (!this.redis) {
        const result = await this.memory.increment(
          key,
          ttl,
          limit,
          0,
          'security',
        );
        return result.isBlocked ? Math.max(1, result.timeToBlockExpire) : 0;
      }
      if (!this.redis.isReady) {
        this.connecting ??= this.redis.connect().finally(() => {
          this.connecting = undefined;
        });
        await this.connecting;
      }
      const result = (await this.redis.eval(increment, {
        keys: [`gobook:rate:${hash(key)}`],
        arguments: [String(ttl)],
      })) as number[];
      return result[0]! > limit ? Math.max(1, Math.ceil(result[1]! / 1000)) : 0;
    } catch {
      throw new ServiceUnavailableException({
        code: 'RATE_LIMIT_UNAVAILABLE',
        message: 'Service temporarily unavailable.',
      });
    }
  }
  onModuleDestroy() {
    this.memory.onApplicationShutdown();
    if (this.redis?.isOpen) this.redis.destroy();
  }
}

export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly store: RateLimitStore,
    private readonly jwt: JwtService,
  ) {
    this.number('RATE_LIMIT_WINDOW_MS', 60_000);
    this.number('RATE_LIMIT_AUTH_ACCOUNT', 10);
    for (const group of Object.keys(limits) as Group[]) {
      this.number(`RATE_LIMIT_${group}_IP`, limits[group][0]);
      this.number(`RATE_LIMIT_${group}_SUBJECT`, limits[group][1]);
    }
  }
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    if (request.method === 'OPTIONS' || request.path === '/api/v1/health')
      return true;
    const webhook = request.path === '/api/v1/webhooks/sepay/ipn';
    if (
      webhook &&
      validIpnSecret(
        request.get('X-Secret-Key'),
        this.config.get<string>('SEPAY_IPN_SECRET'),
      )
    )
      return true;
    const group: Group = webhook
      ? 'WEBHOOK'
      : /\/auth\/(login|register)$/.test(request.path)
        ? 'AUTH'
        : /\/auth\/(refresh|logout)$/.test(request.path)
          ? 'REFRESH'
          : ['GET', 'HEAD'].includes(request.method)
            ? 'READ'
            : 'WRITE';
    const ttl = this.number('RATE_LIMIT_WINDOW_MS', 60_000);
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const scopes: Array<[string, number]> = [
      [`ip:${ip}`, this.number(`RATE_LIMIT_${group}_IP`, limits[group][0])],
    ];
    if (group === 'AUTH' && typeof request.body?.email === 'string')
      scopes.push([
        `account:${hash(request.body.email.trim().toLowerCase().slice(0, 320))}`,
        this.number('RATE_LIMIT_AUTH_ACCOUNT', 10),
      ]);
    const bearer = request
      .get('Authorization')
      ?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (bearer) {
      try {
        const payload = await this.jwt.verifyAsync<{
          sub?: string;
          type?: string;
        }>(bearer);
        if (payload.type === 'access' && uuid(payload.sub))
          scopes.push([
            `subject:${payload.sub}`,
            this.number(`RATE_LIMIT_${group}_SUBJECT`, limits[group][1]),
          ]);
      } catch {
        /* JWT guard retains responsibility for authentication. */
      }
    }
    for (const [scope, limit] of scopes) {
      const retry = await this.store.consume(`${group}:${scope}`, limit, ttl);
      if (retry) {
        response.setHeader('Retry-After', retry);
        throw new HttpException(
          {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
          },
          429,
        );
      }
    }
    return true;
  }
  private number(key: string, fallback: number) {
    const value = Number(this.config.get(key) ?? fallback);
    if (!Number.isInteger(value) || value <= 0 || value > 3_600_000)
      throw new Error('Invalid rate-limit setting');
    return value;
  }
}
