import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from '../src/auth/auth.module.js';
import {
  RoleCode,
  type RoleCode as Role,
} from '../src/auth/constants/role.constants.js';
import type { JwtPayload } from '../src/auth/types/jwt-payload.type.js';
import { CategoriesModule } from '../src/categories/categories.module.js';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import { CategoryScope, UserStatus } from '../src/generated/prisma/client.js';

type Identity = { id: string; roles: Role[] };

describe('Category management (e2e, PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  const run = randomUUID().slice(0, 8).toUpperCase();
  const categoryIds: string[] = [];
  const userIds: string[] = [];

  let admin: Identity;
  let customer: Identity;
  let vendor: Identity;
  let categoryId: string;
  let categorySlug: string;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        CategoriesModule,
      ],
    }).compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = fixture.get(PrismaService);
    jwt = fixture.get(JwtService);

    await Promise.all(
      Object.values(RoleCode).map((code) =>
        prisma.role.upsert({
          where: { code },
          update: {},
          create: { code, name: code, isSystem: true },
        }),
      ),
    );
    admin = await createIdentity([RoleCode.ADMIN]);
    customer = await createIdentity([RoleCode.CUSTOMER]);
    vendor = await createIdentity([RoleCode.VENDOR]);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  async function createIdentity(roles: Role[]): Promise<Identity> {
    const roleRows = await prisma.role.findMany({
      where: { code: { in: roles } },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        email: `category-${run}-${randomUUID()}@example.com`,
        status: UserStatus.ACTIVE,
        userRoles: { create: roleRows.map(({ id }) => ({ roleId: id })) },
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return { id: user.id, roles };
  }

  async function token(identity: Identity): Promise<string> {
    const payload: JwtPayload = {
      sub: identity.id,
      roles: identity.roles,
      type: 'access',
    };
    return jwt.signAsync(payload);
  }

  async function createCategory(
    identity: Identity,
    body: Record<string, unknown>,
    expectedStatus = 201,
  ) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .auth(await token(identity), { type: 'bearer' })
      .send(body)
      .expect(expectedStatus);
    if (expectedStatus === 201) categoryIds.push(response.body.id as string);
    return response;
  }

  it('lets ADMIN create an active category with normalized code and generated slug', async () => {
    const response = await createCategory(admin, {
      code: `health_${run.toLowerCase()}`,
      name: `Chăm sóc sức khỏe ${run}`,
      scope: CategoryScope.SERVICE,
      description: '  Category description  ',
      icon: '  heart  ',
      sortOrder: 30,
    });
    categoryId = response.body.id as string;
    categorySlug = response.body.slug as string;
    expect(response.body).toMatchObject({
      code: `HEALTH_${run}`,
      name: `Chăm sóc sức khỏe ${run}`,
      slug: `cham-soc-suc-khoe-${run.toLowerCase()}`,
      scope: CategoryScope.SERVICE,
      description: 'Category description',
      icon: 'heart',
      sortOrder: 30,
      isActive: true,
    });
    expect(response.body).not.toHaveProperty('deletedAt');
  });

  it('enforces ADMIN authorization and validates immutable/client-controlled fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .send({ code: `NOAUTH_${run}`, name: 'No Auth', scope: 'SERVICE' })
      .expect(401);
    await createCategory(
      customer,
      { code: `CUSTOMER_${run}`, name: 'Customer', scope: 'SERVICE' },
      403,
    );
    await createCategory(
      vendor,
      { code: `VENDOR_${run}`, name: 'Vendor', scope: 'EVENT' },
      403,
    );
    await createCategory(
      admin,
      { code: 'invalid-code', name: 'Invalid', scope: 'SERVICE' },
      400,
    );
    await createCategory(
      admin,
      {
        code: `FORGED_${run}`,
        name: 'Forged',
        scope: 'SERVICE',
        slug: 'client-slug',
        isActive: false,
      },
      400,
    );
    await createCategory(
      admin,
      {
        code: `NEGATIVE_${run}`,
        name: 'Negative order',
        scope: 'SERVICE',
        sortOrder: -1,
      },
      400,
    );
  });

  it('maps duplicate code to 409 and safely suffixes slug collisions', async () => {
    await createCategory(
      admin,
      {
        code: `health_${run.toLowerCase()}`,
        name: 'Duplicate code',
        scope: CategoryScope.SERVICE,
      },
      409,
    );
    const collisionName = `Collision ${run}`;
    const first = await createCategory(admin, {
      code: `COLLISION_A_${run}`,
      name: collisionName,
      scope: CategoryScope.EVENT,
    });
    const second = await createCategory(admin, {
      code: `COLLISION_B_${run}`,
      name: collisionName,
      scope: CategoryScope.EVENT,
    });
    expect(first.body.slug).toBe(`collision-${run.toLowerCase()}`);
    expect(second.body.slug).toMatch(
      new RegExp(`^collision-${run.toLowerCase()}-[a-f0-9]{8}$`),
    );
  });

  it('serves active categories publicly with scope/search filters and stable sorting', async () => {
    const first = await createCategory(admin, {
      code: `SORT_A_${run}`,
      name: `Sort ${run} Alpha`,
      scope: CategoryScope.SERVICE,
      sortOrder: 20,
    });
    const second = await createCategory(admin, {
      code: `SORT_B_${run}`,
      name: `Sort ${run} Beta`,
      scope: CategoryScope.SERVICE,
      sortOrder: 10,
    });
    await createCategory(admin, {
      code: `SORT_EVENT_${run}`,
      name: `Sort ${run} Event`,
      scope: CategoryScope.EVENT,
      sortOrder: 1,
    });

    const serviceList = await request(app.getHttpServer())
      .get(`/api/v1/categories?scope=SERVICE&search=${run}`)
      .expect(200);
    expect(
      serviceList.body.every(
        (category: { scope: string; isActive: boolean }) =>
          category.scope === CategoryScope.SERVICE && category.isActive,
      ),
    ).toBe(true);
    const orderedIds = serviceList.body
      .filter((category: { code: string }) => category.code.startsWith('SORT_'))
      .map((category: { id: string }) => category.id);
    expect(orderedIds).toEqual([second.body.id, first.body.id]);

    const eventList = await request(app.getHttpServer())
      .get(`/api/v1/categories?scope=EVENT&search=${run}`)
      .expect(200);
    expect(eventList.body.length).toBeGreaterThanOrEqual(3);
    expect(
      eventList.body.every(
        (category: { scope: string }) => category.scope === CategoryScope.EVENT,
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .get('/api/v1/categories?scope=INVALID')
      .expect(400);
  });

  it('returns public detail without soft-delete metadata', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/categories/${categorySlug}`)
      .expect(200);
    expect(detail.body).toMatchObject({ id: categoryId, isActive: true });
    expect(detail.body).not.toHaveProperty('deletedAt');
    await request(app.getHttpServer())
      .get('/api/v1/categories/not-a-real-category')
      .expect(404);
  });

  it('updates editable fields while code and slug stay immutable', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}`)
      .auth(await token(customer), { type: 'bearer' })
      .send({ name: 'Forbidden update' })
      .expect(403);
    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}`)
      .auth(await token(admin), { type: 'bearer' })
      .send({
        name: `Updated Category ${run}`,
        description: 'Updated description',
        scope: CategoryScope.EVENT,
        sortOrder: 5,
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      code: `HEALTH_${run}`,
      slug: categorySlug,
      name: `Updated Category ${run}`,
      description: 'Updated description',
      scope: CategoryScope.EVENT,
      sortOrder: 5,
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}`)
      .auth(await token(admin), { type: 'bearer' })
      .send({ code: `CHANGED_${run}` })
      .expect(400);
  });

  it('deactivates and activates without losing the category', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}/deactivate`)
      .auth(await token(admin), { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => expect(body.isActive).toBe(false));
    await request(app.getHttpServer())
      .get(`/api/v1/categories/${categorySlug}`)
      .expect(404);
    const publicList = await request(app.getHttpServer())
      .get(`/api/v1/categories?search=${run}`)
      .expect(200);
    expect(
      publicList.body.some(
        (category: { id: string }) => category.id === categoryId,
      ),
    ).toBe(false);

    const adminList = await request(app.getHttpServer())
      .get(`/api/v1/admin/categories?isActive=false&search=${run}`)
      .auth(await token(admin), { type: 'bearer' })
      .expect(200);
    expect(
      adminList.body.some(
        (category: { id: string }) => category.id === categoryId,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}/activate`)
      .auth(await token(admin), { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => expect(body.isActive).toBe(true));
    await request(app.getHttpServer())
      .get(`/api/v1/categories/${categorySlug}`)
      .expect(200);
  });

  it('soft-deletes, retains the row, and hides it from public APIs', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/categories/${categoryId}`)
      .auth(await token(vendor), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/categories/${categoryId}`)
      .auth(await token(admin), { type: 'bearer' })
      .expect(204);

    expect(
      await prisma.category.findUnique({
        where: { id: categoryId },
        select: { isActive: true, deletedAt: true },
      }),
    ).toEqual({ isActive: false, deletedAt: expect.any(Date) });
    await request(app.getHttpServer())
      .get(`/api/v1/categories/${categorySlug}`)
      .expect(404);
    const publicList = await request(app.getHttpServer())
      .get(`/api/v1/categories?search=${run}`)
      .expect(200);
    expect(
      publicList.body.some(
        (category: { id: string }) => category.id === categoryId,
      ),
    ).toBe(false);
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/categories/${categoryId}`)
      .auth(await token(admin), { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${randomUUID()}/activate`)
      .auth(await token(admin), { type: 'bearer' })
      .expect(404);
  });
});
