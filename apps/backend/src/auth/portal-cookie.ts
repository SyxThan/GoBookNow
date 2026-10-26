import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

export function portalCookieName(
  baseName: string,
  request: Pick<Request, 'get'>,
  config: ConfigService,
): string {
  const portal = request.get('X-Portal') ?? 'customer';
  if (!['customer', 'vendor', 'admin'].includes(portal)) {
    throw new BadRequestException('Invalid authentication portal');
  }
  const origin = request.get('Origin');
  const key = portal === 'customer' ? 'FRONTEND_ORIGIN' : portal === 'vendor' ? 'VENDOR_ORIGIN' : 'ADMIN_ORIGIN';
  const expected = config.get<string>(key)?.trim();
  // Browser callers cannot select another portal's HttpOnly cookie. Non-browser
  // clients still need possession of the correct refresh credential itself.
  if (origin && (!expected || origin !== expected)) {
    throw new ForbiddenException('Authentication portal origin does not match');
  }
  return portal === 'customer' ? baseName : `${baseName}_${portal}`;
}
