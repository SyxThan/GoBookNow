import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { portalCookieName } from './portal-cookie.js';

const config = new ConfigService({ FRONTEND_ORIGIN: 'http://localhost:3000', VENDOR_ORIGIN: 'http://localhost:3002', ADMIN_ORIGIN: 'http://localhost:3003' });
function request(portal?: string, origin?: string) {
  return { get: (name: string) => name === 'X-Portal' ? portal : name === 'Origin' ? origin : undefined } as Pick<Request, 'get'>;
}
describe('Portal refresh cookie isolation', () => {
  it('preserves legacy/customer cookies and separates vendor/admin cookies', () => {
    expect(portalCookieName('refresh', request(), config)).toBe('refresh');
    expect(portalCookieName('refresh', request('customer', 'http://localhost:3000'), config)).toBe('refresh');
    expect(portalCookieName('refresh', request('vendor', 'http://localhost:3002'), config)).toBe('refresh_vendor');
    expect(portalCookieName('refresh', request('admin', 'http://localhost:3003'), config)).toBe('refresh_admin');
  });
  it.each([
    ['admin', 'http://localhost:3000'], ['vendor', 'http://localhost:3003'],
    ['customer', 'http://localhost:3002'], [undefined, 'http://localhost:3002'],
    ['admin', 'https://attacker.invalid'],
  ])('rejects browser origin selecting another portal cookie (%s)', (portal, origin) => {
    expect(() => portalCookieName('refresh', request(portal, origin), config)).toThrow('origin does not match');
  });
  it('rejects arbitrary cookie namespaces', () => {
    expect(() => portalCookieName('refresh', request('../admin'), config)).toThrow('Invalid authentication portal');
  });
});
