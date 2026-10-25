import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { logger } from '../observability/logger.js';

export function validIpnSecret(
  incoming: string | undefined,
  expected: string | undefined,
): boolean {
  if (!incoming || !expected?.trim()) return false;
  return timingSafeEqual(
    createHash('sha256').update(incoming).digest(),
    createHash('sha256').update(expected.trim()).digest(),
  );
}

@Injectable()
export class SepayIpnAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const incomingSecret = request.get('X-Secret-Key');
    const expectedSecret = this.config.get<string>('SEPAY_IPN_SECRET')?.trim();

    if (
      !incomingSecret ||
      !expectedSecret ||
      !validIpnSecret(incomingSecret, expectedSecret)
    ) {
      logger.emit('warn', 'payment.webhook.rejected');
      throw new UnauthorizedException('Invalid SePay IPN credentials');
    }

    logger.emit('info', 'payment.webhook.received');
    return true;
  }
}
