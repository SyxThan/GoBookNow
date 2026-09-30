import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

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
      !this.secretsMatch(incomingSecret, expectedSecret)
    ) {
      throw new UnauthorizedException('Invalid SePay IPN credentials');
    }

    return true;
  }

  private secretsMatch(incoming: string, expected: string): boolean {
    const incomingDigest = createHash('sha256').update(incoming).digest();
    const expectedDigest = createHash('sha256').update(expected).digest();
    return timingSafeEqual(incomingDigest, expectedDigest);
  }
}
