import request from 'supertest';
import { hash } from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { integrationSuite } from './helpers/test-app.js';

describe('Cross-origin portal refresh sessions', () => {
  const origins = { customer: 'http://localhost:3000', vendor: 'http://localhost:3002', admin: 'http://localhost:3003' };
  const previous = { FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN, VENDOR_ORIGIN: process.env.VENDOR_ORIGIN, ADMIN_ORIGIN: process.env.ADMIN_ORIGIN, CORS_ORIGINS: process.env.CORS_ORIGINS };
  beforeAll(() => Object.assign(process.env, { FRONTEND_ORIGIN: origins.customer, VENDOR_ORIGIN: origins.vendor, ADMIN_ORIGIN: origins.admin, CORS_ORIGINS: Object.values(origins).join(',') }));
  const context = integrationSuite();
  afterAll(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

  it('keeps three identities isolated across login, rotation, logout and forged portal headers', async () => {
    const { app, prisma, fixtures: f } = context();
    const customer = await f.createCustomer(), vendor = await f.createApprovedVendor(), admin = await f.createAdmin();
    const accounts = { customer: customer.id, vendor: vendor.ownerUserId, admin: admin.id };
    const password = 'Portal-Integration-Only-2026';
    const passwordHash = await hash(password);
    const jar = new Map<string, string>();
    function saveCookies(response: request.Response) {
      const values = response.headers['set-cookie'] as string[] | undefined;
      for (const value of values ?? []) { const cookie = value.split(';')[0]!; jar.set(cookie.split('=')[0]!, cookie); }
    }
    const cookies = () => [...jar.values()].join('; ');
    for (const portal of ['customer', 'vendor', 'admin'] as const) {
      const user = await prisma.user.update({ where: { id: accounts[portal] }, data: { passwordHash } });
      const response = await request(app.getHttpServer()).post('/api/v1/auth/login')
        .set('Origin', origins[portal]).set('X-Portal', portal)
        .send({ email: user.email, password }).expect(200);
      saveCookies(response);
      expect(response.headers['access-control-allow-origin']).toBe(origins[portal]);
    }
    expect([...jar.keys()].sort()).toEqual(['gobook_refresh_token', 'gobook_refresh_token_admin', 'gobook_refresh_token_vendor']);
    for (const portal of ['customer', 'vendor', 'admin'] as const) {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh')
        .set('Origin', origins[portal]).set('X-Portal', portal).set('Cookie', cookies()).expect(200);
      saveCookies(response);
      expect(app.get(JwtService).verify<{ sub: string }>(response.body.accessToken).sub).toBe(accounts[portal]);
    }
    await request(app.getHttpServer()).post('/api/v1/auth/refresh')
      .set('Origin', origins.customer).set('X-Portal', 'admin').set('Cookie', cookies()).expect(403);
    await request(app.getHttpServer()).post('/api/v1/auth/logout')
      .set('Origin', origins.vendor).set('X-Portal', 'vendor').set('Cookie', cookies()).expect(204);
    await request(app.getHttpServer()).post('/api/v1/auth/refresh')
      .set('Origin', origins.vendor).set('X-Portal', 'vendor').set('Cookie', cookies()).expect(401);
    for (const portal of ['customer', 'admin'] as const) {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh')
        .set('Origin', origins[portal]).set('X-Portal', portal).set('Cookie', cookies()).expect(200);
      saveCookies(response);
      expect(app.get(JwtService).verify<{sub:string}>(response.body.accessToken).sub).toBe(accounts[portal]);
    }
    const denied = await request(app.getHttpServer()).post('/api/v1/auth/register')
      .set('Origin', origins.customer).set('X-Portal', 'admin')
      .send({fullName:'No cross-portal account',email:'cross-portal-denied@example.invalid',password}).expect(403);
    expect(denied.headers['set-cookie']).toBeUndefined();
    expect(await prisma.user.count({where:{email:'cross-portal-denied@example.invalid'}})).toBe(0);
  });
});
