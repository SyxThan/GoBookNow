import {
  Controller,
  Get,
  INestApplication,
  Injectable,
  Patch,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthService } from '../src/auth/auth.service.js';
import { OwnershipService } from '../src/auth/authorization/ownership.service.js';
import { RoleCode } from '../src/auth/constants/role.constants.js';
import { RequireOwnership } from '../src/auth/decorators/ownership.decorator.js';
import { Roles } from '../src/auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { OwnershipGuard } from '../src/auth/guards/ownership.guard.js';
import { RolesGuard } from '../src/auth/guards/roles.guard.js';
import type {
  CurrentUser,
  JwtPayload,
} from '../src/auth/types/jwt-payload.type.js';
import type { ResourceOwnershipResolver } from '../src/auth/types/ownership-policy.type.js';

const JWT_SECRET = 'authorization-test-secret';
const CUSTOMER_ID = '10000000-0000-4000-8000-000000000001';
const VENDOR_ID = '20000000-0000-4000-8000-000000000002';
const OTHER_VENDOR_ID = '20000000-0000-4000-8000-000000000003';
const ADMIN_ID = '30000000-0000-4000-8000-000000000003';

const identities: Record<string, CurrentUser> = {
  [CUSTOMER_ID]: {
    id: CUSTOMER_ID,
    email: 'customer@example.com',
    profile: null,
    roles: [RoleCode.CUSTOMER],
  },
  [VENDOR_ID]: {
    id: VENDOR_ID,
    email: 'vendor@example.com',
    profile: null,
    roles: [RoleCode.CUSTOMER, RoleCode.VENDOR],
  },
  [OTHER_VENDOR_ID]: {
    id: OTHER_VENDOR_ID,
    email: 'other-vendor@example.com',
    profile: null,
    roles: [RoleCode.VENDOR],
  },
  [ADMIN_ID]: {
    id: ADMIN_ID,
    email: 'admin@example.com',
    profile: null,
    roles: [RoleCode.ADMIN],
  },
};

@Injectable()
class TestResourceOwnershipResolver implements ResourceOwnershipResolver {
  private readonly owners: Record<string, string> = {
    'customer-resource': CUSTOMER_ID,
    'vendor-resource': VENDOR_ID,
    'other-vendor-resource': OTHER_VENDOR_ID,
  };

  async resolveOwnerUserId(resourceId: string): Promise<string | null> {
    return this.owners[resourceId] ?? null;
  }
}

@Controller('authorization-test')
@UseGuards(JwtAuthGuard, RolesGuard)
class AuthorizationTestController {
  @Get('unrestricted')
  unrestricted(): { allowed: true } {
    return { allowed: true };
  }

  @Get('customer')
  @Roles(RoleCode.CUSTOMER)
  customer(): { allowed: true } {
    return { allowed: true };
  }

  @Get('vendor')
  @Roles(RoleCode.VENDOR)
  vendor(): { allowed: true } {
    return { allowed: true };
  }

  @Get('admin')
  @Roles(RoleCode.ADMIN)
  admin(): { allowed: true } {
    return { allowed: true };
  }

  @Get('customer-or-admin')
  @Roles(RoleCode.CUSTOMER, RoleCode.ADMIN)
  customerOrAdmin(): { allowed: true } {
    return { allowed: true };
  }

  @Get('users/:userId')
  @UseGuards(OwnershipGuard)
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR, RoleCode.ADMIN)
  @RequireOwnership({ type: 'SELF', param: 'userId' })
  self(): { allowed: true } {
    return { allowed: true };
  }

  @Get('admin-bypass/users/:userId')
  @UseGuards(OwnershipGuard)
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR, RoleCode.ADMIN)
  @RequireOwnership({
    type: 'SELF',
    param: 'userId',
    adminBypass: true,
  })
  selfWithAdminBypass(): { allowed: true } {
    return { allowed: true };
  }

  @Patch('resources/:resourceId')
  @UseGuards(OwnershipGuard)
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR, RoleCode.ADMIN)
  @RequireOwnership({
    type: 'RESOURCE',
    param: 'resourceId',
    resolver: TestResourceOwnershipResolver,
  })
  resource(): { allowed: true } {
    return { allowed: true };
  }

  @Patch('vendor-resources/:resourceId')
  @UseGuards(OwnershipGuard)
  @Roles(RoleCode.VENDOR, RoleCode.ADMIN)
  @RequireOwnership({
    type: 'RESOURCE',
    param: 'resourceId',
    resolver: TestResourceOwnershipResolver,
    adminBypass: true,
  })
  vendorResource(): { allowed: true } {
    return { allowed: true };
  }
}

describe('Authorization (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  beforeAll(async () => {
    const authService = {
      getCurrentUser: vi.fn(async (userId: string): Promise<CurrentUser> => {
        const user = identities[userId];
        if (!user) {
          throw new UnauthorizedException(
            'Authenticated user no longer exists',
          );
        }
        return user;
      }),
    };

    const moduleFixture = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: JWT_SECRET })],
      controllers: [AuthorizationTestController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        OwnershipGuard,
        OwnershipService,
        TestResourceOwnershipResolver,
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const tokenFor = async (
    userId: string,
    roles?: string[],
  ): Promise<string> => {
    const user = identities[userId];
    if (!user) throw new Error('Unknown test identity');
    const payload: JwtPayload = {
      sub: user.id,
      roles: roles ?? user.roles,
      type: 'access',
    };
    return jwtService.signAsync(payload);
  };

  const expectGet = async (
    path: string,
    status: number,
    userId?: string,
  ): Promise<void> => {
    const call = request(app.getHttpServer()).get(`/api/v1${path}`);
    if (userId) {
      call.auth(await tokenFor(userId), { type: 'bearer' });
    }
    await call.expect(status);
  };

  it('returns 401 before RBAC when the access token is missing', async () => {
    await expectGet('/authorization-test/customer', 401);
  });

  it('allows an authenticated route without @Roles metadata', async () => {
    await expectGet('/authorization-test/unrestricted', 200, CUSTOMER_ID);
  });

  it('enforces CUSTOMER membership and accepts CUSTOMER+VENDOR', async () => {
    await expectGet('/authorization-test/customer', 200, CUSTOMER_ID);
    await expectGet('/authorization-test/customer', 200, VENDOR_ID);
    await expectGet('/authorization-test/customer', 403, OTHER_VENDOR_ID);
    await expectGet('/authorization-test/customer', 403, ADMIN_ID);
  });

  it('enforces VENDOR membership', async () => {
    await expectGet('/authorization-test/vendor', 200, VENDOR_ID);
    await expectGet('/authorization-test/vendor', 403, CUSTOMER_ID);
    await expectGet('/authorization-test/vendor', 403, ADMIN_ID);
  });

  it('does not grant ADMIN implicitly to other roles', async () => {
    await expectGet('/authorization-test/admin', 200, ADMIN_ID);
    await expectGet('/authorization-test/admin', 403, CUSTOMER_ID);
  });

  it('uses OR semantics for multiple allowed roles', async () => {
    await expectGet('/authorization-test/customer-or-admin', 200, ADMIN_ID);
  });

  it('uses roles from the signed access token identity', async () => {
    const vendorToken = await tokenFor(CUSTOMER_ID, [RoleCode.VENDOR]);

    await request(app.getHttpServer())
      .get('/api/v1/authorization-test/vendor')
      .auth(vendorToken, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/authorization-test/customer')
      .auth(vendorToken, { type: 'bearer' })
      .expect(403);
  });

  it('allows self ownership and denies another user', async () => {
    await expectGet(
      `/authorization-test/users/${CUSTOMER_ID}`,
      200,
      CUSTOMER_ID,
    );
    await expectGet(`/authorization-test/users/${VENDOR_ID}`, 403, CUSTOMER_ID);
  });

  it('denies the correct owner when the required role is missing', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/authorization-test/vendor-resources/customer-resource')
      .auth(await tokenFor(CUSTOMER_ID), { type: 'bearer' })
      .expect(403);
  });

  it('supports vendor resource ownership through a trusted resolver', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/authorization-test/vendor-resources/vendor-resource')
      .auth(await tokenFor(VENDOR_ID), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/authorization-test/vendor-resources/vendor-resource')
      .auth(await tokenFor(OTHER_VENDOR_ID), { type: 'bearer' })
      .expect(403);
  });

  it('does not trust an owner ID supplied in the request body', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/authorization-test/resources/customer-resource')
      .auth(await tokenFor(CUSTOMER_ID), { type: 'bearer' })
      .send({ ownerUserId: OTHER_VENDOR_ID })
      .expect(200);

    await request(app.getHttpServer())
      .patch('/api/v1/authorization-test/resources/customer-resource')
      .auth(await tokenFor(OTHER_VENDOR_ID), { type: 'bearer' })
      .send({ ownerUserId: OTHER_VENDOR_ID })
      .expect(403);
  });

  it('allows ADMIN bypass only on routes that opt in', async () => {
    await expectGet(
      `/authorization-test/admin-bypass/users/${CUSTOMER_ID}`,
      200,
      ADMIN_ID,
    );
    await expectGet(`/authorization-test/users/${CUSTOMER_ID}`, 403, ADMIN_ID);
  });

  it('returns 404 when the trusted resource resolver finds no resource', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/authorization-test/resources/missing-resource')
      .auth(await tokenFor(CUSTOMER_ID), { type: 'bearer' })
      .expect(404);
  });
});
