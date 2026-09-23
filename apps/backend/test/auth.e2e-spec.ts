import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from '../src/auth/auth.module.js';
import type { JwtPayload } from '../src/auth/types/jwt-payload.type.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import { UserStatus } from '../src/generated/prisma/client.js';

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

class InMemoryPrisma {
  users: StoredUser[] = [];

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

  reset(): void {
    this.users = [];
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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    jwtService = moduleFixture.get(JwtService);
    app = moduleFixture.createNestApplication();
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
