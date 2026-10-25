import { isIP } from 'node:net';
import type { ConfigService } from '@nestjs/config';

export function origins(config: ConfigService): string[] {
  const source =
    config.get<string>('CORS_ORIGINS') ??
    config.get<string>('FRONTEND_ORIGIN') ??
    (config.get('NODE_ENV') === 'production' ? '' : 'http://127.0.0.1:3000');
  const result = source
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!result.length) throw new Error('Explicit CORS origins are required');
  for (const value of result) {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== value ||
      url.username ||
      url.password ||
      (config.get('NODE_ENV') === 'production' && url.protocol !== 'https:')
    )
      throw new Error('Invalid CORS origin');
  }
  return [...new Set(result)];
}
export function trustedProxies(config: ConfigService): false | string[] {
  const value = config.get<string>('TRUST_PROXY_CIDRS')?.trim();
  if (!value) return false;
  const entries = value.split(',').map((entry) => entry.trim());
  for (const entry of entries) {
    const [address, prefix] = entry.split('/');
    const version = isIP(address!);
    if (
      entry.split('/').length > 2 ||
      !version ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (version === 4 ? 32 : 128)))
    )
      throw new Error(
        'Trust proxy requires explicit IP addresses or CIDR ranges',
      );
  }
  return entries;
}
export function validateProduction(config: ConfigService) {
  origins(config);
  trustedProxies(config);
  if (config.get('NODE_ENV') !== 'production') return;
  for (const key of [
    'JWT_ACCESS_SECRET',
    'SEPAY_IPN_SECRET',
    'SEPAY_SECRET_KEY',
    'TICKET_TOKEN_SECRET',
  ]) {
    const value = config.get<string>(key) ?? '';
    if (
      Buffer.byteLength(value) < 32 ||
      /change.?me|placeholder|e2e-only|integration-only|your[_-]/i.test(value)
    )
      throw new Error(`Production requires a non-placeholder ${key}`);
  }
  if (String(config.get('AUTH_COOKIE_SECURE')) !== 'true')
    throw new Error('Production refresh cookies require Secure=true');
  if (
    config.get('RATE_LIMIT_STORAGE') !== 'redis' &&
    config.get('RATE_LIMIT_SINGLE_INSTANCE') !== 'true'
  )
    throw new Error(
      'Production requires shared Redis limiting or an explicit single-instance guarantee',
    );
}
