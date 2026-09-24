import { createHash, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from '../src/auth/auth.module.js';
import type { JwtPayload } from '../src/auth/types/jwt-payload.type.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  RefreshTokenRevokedReason,
  UserStatus,
} from '../src/generated/prisma/client.js';

const CUSTOMER_ROLE = {
  id: '10000000-0000-4000-8000-000000000001',
  code: 'CUSTOMER',
  name: 'Customer',
  description: null,
  isSystem: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string | null;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  profile: {
    id: string;
    userId: string;
    fullName: string;
    phone: string | null;
    avatarUrl: string | null;
    locale: string;
    timezone: string;
    createdAt: Date;
    updatedAt: Date;
  };
  userRoles: Array<{
    userId: string;
    roleId: string;
    assignedAt: Date;
    role: typeof CUSTOMER_ROLE;
  }>;
};

type UserCreateArguments = {
  data: {
    email: string;
    passwordHash: string;
    profile: {
      create: {
        fullName: string;
        phone?: string;
      };
    };
    userRoles: {
      create: {
        roleId: string;
      };
    };
  };
};

type StoredRefreshToken = {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: RefreshTokenRevokedReason | null;
  replacedByTokenId: string | null;
  lastUsedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
};

type RefreshTokenCreateData = Partial<StoredRefreshToken> &
  Pick<StoredRefreshToken, 'userId' | 'tokenHash' | 'familyId' | 'expiresAt'>;

class InMemoryPrisma {
  users: StoredUser[] = [];
  refreshTokens: StoredRefreshToken[] = [];

  readonly role = {
    findUnique: async ({ where }: { where: { code: string } }) =>
      where.code === CUSTOMER_ROLE.code ? CUSTOMER_ROLE : null,
  };

  readonly user = {
    findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
      this.users.find(
        (user) => user.id === where.id || user.email === where.email,
      ) ?? null,

    create: async ({ data }: UserCreateArguments): Promise<StoredUser> => {
      if (this.users.some((user) => user.email === data.email)) {
        const error = new Error('Unique constraint failed');
        Object.assign(error, { code: 'P2002' });
        throw error;
      }

      const now = new Date();
      const userId = randomUUID();
      const user: StoredUser = {
        id: userId,
        email: data.email,
        passwordHash: data.passwordHash,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        profile: {
          id: randomUUID(),
          userId,
          fullName: data.profile.create.fullName,
          phone: data.profile.create.phone ?? null,
          avatarUrl: null,
          locale: 'vi-VN',
          timezone: 'Asia/Ho_Chi_Minh',
          createdAt: now,
          updatedAt: now,
        },
        userRoles: [
          {
            userId,
            roleId: data.userRoles.create.roleId,
            assignedAt: now,
            role: CUSTOMER_ROLE,
          },
        ],
      };
      this.users.push(user);
      return user;
    },

    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { lastLoginAt: Date };
    }): Promise<StoredUser> => {
      const user = this.users.find((candidate) => candidate.id === where.id);
      if (!user) {
        throw new Error('User not found');
      }
      user.lastLoginAt = data.lastLoginAt;
      return user;
    },
  };

  readonly refreshToken = {
    create: async ({
      data,
    }: {
      data: RefreshTokenCreateData;
    }): Promise<StoredRefreshToken> => {
      if (
        this.refreshTokens.some((token) => token.tokenHash === data.tokenHash)
      ) {
        throw new Error('Unique refresh token hash');
      }

      const token: StoredRefreshToken = {
        id: data.id ?? randomUUID(),
        userId: data.userId,
        tokenHash: data.tokenHash,
        familyId: data.familyId,
        expiresAt: data.expiresAt,
        revokedAt: data.revokedAt ?? null,
        revokedReason: data.revokedReason ?? null,
        replacedByTokenId: data.replacedByTokenId ?? null,
        lastUsedAt: data.lastUsedAt ?? null,
        userAgent: data.userAgent ?? null,
        ipAddress: data.ipAddress ?? null,
        createdAt: data.createdAt ?? new Date(),
      };
      this.refreshTokens.push(token);
      return token;
    },

    findUnique: async ({
      where,
      include,
      select,
    }: {
      where: { tokenHash: string };
      include?: { user?: unknown };
      select?: { userId?: boolean; familyId?: boolean };
    }) => {
      const token = this.refreshTokens.find(
        (candidate) => candidate.tokenHash === where.tokenHash,
      );
      if (!token) return null;
      if (select) {
        return {
          ...(select.userId ? { userId: token.userId } : {}),
          ...(select.familyId ? { familyId: token.familyId } : {}),
        };
      }
      if (include?.user) {
        const user = this.users.find(
          (candidate) => candidate.id === token.userId,
        );
        return user ? { ...token, user } : null;
      }
      return token;
    },

    updateMany: async ({
      where,
      data,
    }: {
      where: {
        id?: string;
        userId?: string;
        familyId?: string;
        revokedAt?: null;
        expiresAt?: { gt: Date };
      };
      data: Partial<StoredRefreshToken>;
    }): Promise<{ count: number }> => {
      const matches = this.refreshTokens.filter(
        (token) =>
          (where.id === undefined || token.id === where.id) &&
          (where.userId === undefined || token.userId === where.userId) &&
          (where.familyId === undefined || token.familyId === where.familyId) &&
          (where.revokedAt === undefined || token.revokedAt === null) &&
          (where.expiresAt === undefined ||
            token.expiresAt > where.expiresAt.gt),
      );
      for (const token of matches) {
        Object.assign(token, data);
      }
      return { count: matches.length };
    },
  };

  async $transaction<T>(
    callback: (transaction: InMemoryPrisma) => Promise<T>,
  ): Promise<T> {
    return callback(this);
  }

  reset(): void {
    this.users = [];
    this.refreshTokens = [];
  }
}

describe('Authentication (e2e)', () => {
  const prisma = new InMemoryPrisma();
  const validRegistration = {
    email: '  Customer@Example.COM  ',
    password: 'CorrectHorseBatteryStaple!',
    fullName: '  Test Customer  ',
    phone: '  +84 901 234 567  ',
  };

  let app: INestApplication<App>;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-only-access-secret';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.REFRESH_TOKEN_TTL_DAYS = '7';
    process.env.AUTH_REFRESH_COOKIE_NAME = 'gobook_refresh_token';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    jwtService = moduleFixture.get(JwtService);
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => {
    prisma.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  const register = (overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...validRegistration, ...overrides });

  const getSetCookie = (response: {
    headers: Record<string, string | string[] | undefined>;
  }): string => {
    const value = response.headers['set-cookie'];
    const cookie = Array.isArray(value) ? value[0] : value;
    if (!cookie) throw new Error('Expected a Set-Cookie header');
    return cookie;
  };

  const getCookiePair = (response: {
    headers: Record<string, string | string[] | undefined>;
  }): string => getSetCookie(response).split(';')[0]!;

  const getRawRefreshToken = (response: {
    headers: Record<string, string | string[] | undefined>;
  }): string => getCookiePair(response).split('=')[1]!;

  describe('POST /auth/register', () => {
    it('registers valid input with a 201 response', async () => {
      const response = await register().expect(201);

      expect(response.body).toMatchObject({
        user: {
          email: 'customer@example.com',
          fullName: 'Test Customer',
          roles: ['CUSTOMER'],
        },
        tokenType: 'Bearer',
        expiresIn: 900,
      });
      expect(response.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects an invalid email', () =>
      register({ email: 'not-an-email' }).expect(400));

    it('rejects a missing required field', () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'customer@example.com', password: 'long-enough' })
        .expect(400));

    it('rejects a short password', () =>
      register({ password: 'short' }).expect(400));

    it('returns 409 for a duplicate normalized email', async () => {
      await register().expect(201);
      await register({ email: 'CUSTOMER@example.com' }).expect(409);
    });

    it('rejects unknown properties', () =>
      register({ role: 'ADMIN' }).expect(400));

    it('assigns only the CUSTOMER role', async () => {
      await register().expect(201);

      expect(prisma.users[0]?.userRoles.map(({ role }) => role.code)).toEqual([
        'CUSTOMER',
      ]);
    });

    it('stores an Argon2id hash instead of plaintext', async () => {
      await register().expect(201);

      const storedHash = prisma.users[0]?.passwordHash;
      expect(storedHash).toMatch(/^\$argon2id\$/);
      expect(storedHash).not.toBe(validRegistration.password);
      await expect(
        argon2.verify(storedHash!, validRegistration.password),
      ).resolves.toBe(true);
    });

    it('never returns passwordHash', async () => {
      const response = await register().expect(201);

      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('creates a trimmed user profile', async () => {
      await register().expect(201);

      expect(prisma.users[0]?.profile).toMatchObject({
        fullName: 'Test Customer',
        phone: '+84 901 234 567',
      });
    });

    it('stores only a SHA-256 refresh-token hash and session metadata', async () => {
      const response = await register().expect(201);
      const rawToken = getRawRefreshToken(response);
      const storedToken = prisma.refreshTokens[0]!;

      expect(storedToken.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(storedToken.tokenHash).toBe(
        createHash('sha256').update(rawToken).digest('hex'),
      );
      expect(storedToken.tokenHash).not.toBe(rawToken);
      expect(storedToken.familyId).toEqual(expect.any(String));
      expect(storedToken.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(JSON.stringify(response.body)).not.toContain(rawToken);
    });

    it('sets the refresh token in a scoped HttpOnly cookie', async () => {
      const response = await register().expect(201);
      const cookie = getSetCookie(response);

      expect(cookie).toContain('gobook_refresh_token=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/api/v1/auth');
      expect(cookie).toContain('Max-Age=604800');
      expect(response.body).not.toHaveProperty('refreshToken');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await register().expect(201);
    });

    const login = (email: string, password: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password });

    it('accepts correct credentials and normalized email', async () => {
      const response = await login(
        '  CUSTOMER@EXAMPLE.COM ',
        validRegistration.password,
      ).expect(200);

      expect(response.body.user.email).toBe('customer@example.com');
    });

    it('rejects a wrong password with 401', () =>
      login('customer@example.com', 'wrong-password').expect(401));

    it('rejects an unknown email with 401', () =>
      login('unknown@example.com', 'wrong-password').expect(401));

    it('uses the same generic error for wrong and unknown credentials', async () => {
      const wrongPassword = await login(
        'customer@example.com',
        'wrong-password',
      ).expect(401);
      const unknownEmail = await login(
        'unknown@example.com',
        'wrong-password',
      ).expect(401);

      expect(wrongPassword.body.message).toBe('Invalid email or password');
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });

    it('prevents a SUSPENDED user from logging in', async () => {
      prisma.users[0]!.status = UserStatus.SUSPENDED;

      await login('customer@example.com', validRegistration.password).expect(
        403,
      );
    });

    it('prevents a DISABLED user from logging in', async () => {
      prisma.users[0]!.status = UserStatus.DISABLED;

      await login('customer@example.com', validRegistration.password).expect(
        403,
      );
    });

    it('updates lastLoginAt after successful login', async () => {
      expect(prisma.users[0]?.lastLoginAt).toBeNull();

      await login('customer@example.com', validRegistration.password).expect(
        200,
      );

      expect(prisma.users[0]?.lastLoginAt).toBeInstanceOf(Date);
    });

    it('returns a Bearer access token', async () => {
      const response = await login(
        'customer@example.com',
        validRegistration.password,
      ).expect(200);

      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 900,
      });
    });

    it('creates a separate refresh-token family for every login', async () => {
      const response = await login(
        'customer@example.com',
        validRegistration.password,
      ).expect(200);
      const rawToken = getRawRefreshToken(response);
      const loginToken = prisma.refreshTokens.at(-1)!;

      expect(loginToken.tokenHash).toBe(
        createHash('sha256').update(rawToken).digest('hex'),
      );
      expect(loginToken.familyId).not.toBe(prisma.refreshTokens[0]!.familyId);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates a valid token and returns only a new access token', async () => {
      const registration = await register().expect(201);
      const oldCookie = getCookiePair(registration);
      const oldRawToken = getRawRefreshToken(registration);
      const oldStoredToken = prisma.refreshTokens[0]!;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', oldCookie)
        .expect(200);

      const newRawToken = getRawRefreshToken(response);
      const newStoredToken = prisma.refreshTokens[1]!;
      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 900,
      });
      expect(response.body).not.toHaveProperty('user');
      expect(response.body).not.toHaveProperty('refreshToken');
      expect(response.body.accessToken).not.toBe(registration.body.accessToken);
      expect(newRawToken).not.toBe(oldRawToken);
      expect(oldStoredToken.revokedAt).toBeInstanceOf(Date);
      expect(oldStoredToken.lastUsedAt).toBeInstanceOf(Date);
      expect(oldStoredToken.revokedReason).toBe(
        RefreshTokenRevokedReason.ROTATED,
      );
      expect(oldStoredToken.replacedByTokenId).toBe(newStoredToken.id);
      expect(newStoredToken.familyId).toBe(oldStoredToken.familyId);
      expect(newStoredToken.revokedAt).toBeNull();
    });

    it('rejects a rotated token when it is reused', async () => {
      const registration = await register().expect(201);
      const oldCookie = getCookiePair(registration);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', oldCookie)
        .expect(200);
      const reused = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', oldCookie)
        .expect(401);

      expect(reused.body.message).toBe('Invalid refresh token');
    });

    it('rejects an expired refresh token', async () => {
      const registration = await register().expect(201);
      prisma.refreshTokens[0]!.expiresAt = new Date(Date.now() - 1);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', getCookiePair(registration))
        .expect(401);
    });

    it('rejects a malformed or random refresh token', () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', 'gobook_refresh_token=not-a-real-token')
        .expect(401));

    it('rejects a missing refresh cookie', () =>
      request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401));

    it('allows only one of two concurrent rotations', async () => {
      const registration = await register().expect(201);
      const cookie = getCookiePair(registration);

      const responses = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Cookie', cookie),
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Cookie', cookie),
      ]);

      expect(
        responses
          .map(({ status }) => status)
          .sort((left, right) => left - right),
      ).toEqual([200, 401]);
      expect(
        prisma.refreshTokens.filter((token) => !token.revokedAt),
      ).toHaveLength(1);
    });

    it.each([UserStatus.SUSPENDED, UserStatus.DISABLED])(
      'rejects and revokes the family for a %s user',
      async (status) => {
        const registration = await register().expect(201);
        prisma.users[0]!.status = status;

        await request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Cookie', getCookiePair(registration))
          .expect(403);

        expect(prisma.refreshTokens[0]).toMatchObject({
          revokedAt: expect.any(Date),
          revokedReason: RefreshTokenRevokedReason.ACCOUNT_DISABLED,
        });
      },
    );
  });

  describe('POST /auth/logout', () => {
    it('revokes the current family, clears the cookie, and blocks refresh', async () => {
      const registration = await register().expect(201);
      const cookie = getCookiePair(registration);

      const logout = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      expect(prisma.refreshTokens[0]).toMatchObject({
        revokedAt: expect.any(Date),
        revokedReason: RefreshTokenRevokedReason.LOGOUT,
      });
      expect(getSetCookie(logout)).toContain('gobook_refresh_token=;');
      expect(getSetCookie(logout)).toContain('Expires=Thu, 01 Jan 1970');
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('is idempotent with a revoked token', async () => {
      const registration = await register().expect(201);
      const cookie = getCookiePair(registration);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(204);
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(204);
    });

    it('is idempotent without a cookie', () =>
      request(app.getHttpServer()).post('/api/v1/auth/logout').expect(204));

    it('logs out only the selected session family', async () => {
      await register().expect(201);
      const loginA = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'customer@example.com',
          password: validRegistration.password,
        })
        .expect(200);
      const loginB = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'customer@example.com',
          password: validRegistration.password,
        })
        .expect(200);

      const tokenA = prisma.refreshTokens[1]!;
      const tokenB = prisma.refreshTokens[2]!;
      expect(tokenA.familyId).not.toBe(tokenB.familyId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', getCookiePair(loginA))
        .expect(204);

      expect(tokenA.revokedReason).toBe(RefreshTokenRevokedReason.LOGOUT);
      expect(tokenB.revokedAt).toBeNull();
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', getCookiePair(loginB))
        .expect(200);
    });
  });

  describe('JWT and GET /auth/me', () => {
    const registerAndGetToken = async (): Promise<string> => {
      const response = await register().expect(201);
      return response.body.accessToken as string;
    };

    it('creates a verifiable minimal access-token payload', async () => {
      const token = await registerAndGetToken();
      const payload = await jwtService.verifyAsync<JwtPayload>(token);

      expect(payload).toMatchObject({
        sub: prisma.users[0]?.id,
        roles: ['CUSTOMER'],
        type: 'access',
      });
      expect(payload).not.toHaveProperty('passwordHash');
      expect(payload).not.toHaveProperty('profile');
    });

    it('rejects an invalid token', () =>
      request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401));

    it('rejects a tampered token', async () => {
      const token = await registerAndGetToken();
      const parts = token.split('.');
      parts[1] = `${parts[1]!.startsWith('a') ? 'b' : 'a'}${parts[1]!.slice(1)}`;

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${parts.join('.')}`)
        .expect(401);
    });

    it('rejects a missing token', () =>
      request(app.getHttpServer()).get('/api/v1/auth/me').expect(401));

    it('returns the current user for a valid token', async () => {
      const token = await registerAndGetToken();
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: prisma.users[0]?.id,
        email: 'customer@example.com',
        profile: {
          fullName: 'Test Customer',
          phone: '+84 901 234 567',
        },
        roles: ['CUSTOMER'],
      });
    });

    it('never exposes passwordHash from /auth/me', async () => {
      const token = await registerAndGetToken();
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });
  });
});
