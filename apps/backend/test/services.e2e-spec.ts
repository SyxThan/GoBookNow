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
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  CategoryScope,
  ServiceKind,
  ServiceStatus,
  UserStatus,
  VendorStatus,
} from '../src/generated/prisma/client.js';
import { ServicesModule } from '../src/services/services.module.js';

type Identity = { id: string; roles: Role[] };

describe('Service catalog (e2e, PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const vendorIds: string[] = [];
  const categoryIds: string[] = [];

  let vendorA: Identity;
  let vendorB: Identity;
  let unapprovedVendor: Identity;
  let customer: Identity;
  let admin: Identity;
  let vendorAId: string;
  let vendorBId: string;
  let unapprovedVendorId: string;
  let serviceCategoryId: string;
  let secondServiceCategoryId: string;
  let eventCategoryId: string;
  let inactiveCategoryId: string;
  let serviceId: string;
  let serviceSlug: string;
  let eventServiceId: string;
  let eventServiceSlug: string;
  let draftCollisionId: string;
  let draftCollisionSlug: string;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        ServicesModule,
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

    vendorA = await createIdentity([RoleCode.VENDOR]);
    vendorB = await createIdentity([RoleCode.VENDOR]);
    unapprovedVendor = await createIdentity([RoleCode.VENDOR]);
    customer = await createIdentity([RoleCode.CUSTOMER]);
    admin = await createIdentity([RoleCode.ADMIN]);
    vendorAId = await createVendor(vendorA, VendorStatus.APPROVED, 'Vendor A');
    vendorBId = await createVendor(vendorB, VendorStatus.APPROVED, 'Vendor B');
    unapprovedVendorId = await createVendor(
      unapprovedVendor,
      VendorStatus.DRAFT,
      'Unapproved Vendor',
    );

    serviceCategoryId = await createCategory(
      'SERVICE_MAIN',
      'Service Main',
      CategoryScope.SERVICE,
      true,
    );
    secondServiceCategoryId = await createCategory(
      'SERVICE_SECOND',
      'Service Second',
      CategoryScope.SERVICE,
      true,
    );
    eventCategoryId = await createCategory(
      'EVENT_MAIN',
      'Event Main',
      CategoryScope.EVENT,
      true,
    );
    inactiveCategoryId = await createCategory(
      'SERVICE_INACTIVE',
      'Inactive Service',
      CategoryScope.SERVICE,
      false,
    );
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.service.deleteMany({
        where: {
          OR: [
            { vendorId: { in: vendorIds } },
            { categoryId: { in: categoryIds } },
          ],
        },
      });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
      await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
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
        email: `service-${run}-${randomUUID()}@example.com`,
        status: UserStatus.ACTIVE,
        userRoles: { create: roleRows.map(({ id }) => ({ roleId: id })) },
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return { id: user.id, roles };
  }

  async function createVendor(
    identity: Identity,
    status: VendorStatus,
    displayName: string,
  ): Promise<string> {
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId: identity.id,
        displayName: `${displayName} ${run}`,
        slug: `${displayName.toLowerCase().replaceAll(' ', '-')}-${run}`,
        status,
      },
      select: { id: true },
    });
    vendorIds.push(vendor.id);
    return vendor.id;
  }

  async function createCategory(
    code: string,
    name: string,
    scope: CategoryScope,
    isActive: boolean,
  ): Promise<string> {
    const category = await prisma.category.create({
      data: {
        code: `${code}_${run.toUpperCase()}`,
        name: `${name} ${run}`,
        slug: `${name.toLowerCase().replaceAll(' ', '-')}-${run}`,
        scope,
        isActive,
      },
      select: { id: true },
    });
    categoryIds.push(category.id);
    return category.id;
  }

  async function token(identity: Identity): Promise<string> {
    const payload: JwtPayload = {
      sub: identity.id,
      roles: identity.roles,
      type: 'access',
    };
    return jwt.signAsync(payload);
  }

  async function createService(
    identity: Identity,
    body: Record<string, unknown>,
    expectedStatus = 201,
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/vendor/services')
      .auth(await token(identity), { type: 'bearer' })
      .send(body)
      .expect(expectedStatus);
  }

  it('creates unified SERVICE and EVENT drafts with safe string money', async () => {
    const service = await createService(vendorA, {
      categoryId: serviceCategoryId,
      kind: ServiceKind.SERVICE,
      title: `Massage thư giãn 60 phút ${run}`,
      summary: '  Relaxing massage  ',
      description: 'Full service description',
      thumbnailUrl: 'https://example.com/massage.jpg',
      priceAmount: '250000',
      durationMinutes: 60,
    });
    serviceId = service.body.id as string;
    serviceSlug = service.body.slug as string;
    expect(service.body).toMatchObject({
      kind: ServiceKind.SERVICE,
      title: `Massage thư giãn 60 phút ${run}`,
      slug: `massage-thu-gian-60-phut-${run}`,
      summary: 'Relaxing massage',
      priceAmount: '250000',
      currency: 'VND',
      durationMinutes: 60,
      status: ServiceStatus.DRAFT,
      publishedAt: null,
      category: { id: serviceCategoryId },
      vendor: { id: vendorAId },
    });
    expect(typeof service.body.priceAmount).toBe('string');

    const event = await createService(vendorA, {
      categoryId: eventCategoryId,
      kind: ServiceKind.EVENT,
      title: `Workshop TypeScript ${run}`,
      summary: 'Hands-on workshop',
      priceAmount: '150000',
      durationMinutes: null,
    });
    eventServiceId = event.body.id as string;
    eventServiceSlug = event.body.slug as string;
    expect(event.body).toMatchObject({
      kind: ServiceKind.EVENT,
      priceAmount: '150000',
      durationMinutes: null,
      status: ServiceStatus.DRAFT,
    });

    const collision = await createService(vendorA, {
      categoryId: serviceCategoryId,
      kind: ServiceKind.SERVICE,
      title: `Massage thư giãn 60 phút ${run}`,
      priceAmount: '0',
    });
    draftCollisionId = collision.body.id as string;
    draftCollisionSlug = collision.body.slug as string;
    expect(draftCollisionSlug).toMatch(
      new RegExp(`^massage-thu-gian-60-phut-${run}-[a-f0-9]{8}$`),
    );
  });

  it('enforces role, approved Vendor, DTO, price, and Category compatibility', async () => {
    const validBody = {
      categoryId: serviceCategoryId,
      kind: ServiceKind.SERVICE,
      title: `Authorization ${run}`,
      priceAmount: '50000',
    };
    await request(app.getHttpServer())
      .post('/api/v1/vendor/services')
      .send(validBody)
      .expect(401);
    await createService(customer, validBody, 403);
    await createService(admin, validBody, 403);
    await createService(unapprovedVendor, validBody, 403);
    await createService(vendorA, { ...validBody, vendorId: vendorBId }, 400);
    await createService(
      vendorA,
      { ...validBody, categoryId: eventCategoryId },
      400,
    );
    await createService(
      vendorA,
      {
        ...validBody,
        kind: ServiceKind.EVENT,
        categoryId: serviceCategoryId,
      },
      400,
    );
    await createService(
      vendorA,
      { ...validBody, categoryId: inactiveCategoryId },
      404,
    );
    await createService(
      vendorA,
      { ...validBody, categoryId: randomUUID() },
      404,
    );
    for (const priceAmount of ['-1', '12.5', '50,000', 'abc']) {
      await createService(vendorA, { ...validBody, priceAmount }, 400);
    }
    await createService(
      vendorA,
      { ...validBody, priceAmount: '9999999999999999999' },
      400,
    );
  });

  it('lists only the current approved Vendor records with filters and pagination', async () => {
    const vendorAToken = await token(vendorA);
    const list = await request(app.getHttpServer())
      .get('/api/v1/vendor/services?page=1&limit=1&status=DRAFT&kind=SERVICE')
      .auth(vendorAToken, { type: 'bearer' })
      .expect(200);
    expect(list.body).toMatchObject({ page: 1, limit: 1 });
    expect(list.body.total).toBeGreaterThanOrEqual(2);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      kind: ServiceKind.SERVICE,
      status: ServiceStatus.DRAFT,
      vendor: { id: vendorAId },
    });
    expect(typeof list.body.items[0].priceAmount).toBe('string');

    const vendorBList = await request(app.getHttpServer())
      .get('/api/v1/vendor/services')
      .auth(await token(vendorB), { type: 'bearer' })
      .expect(200);
    expect(vendorBList.body.total).toBe(0);
    await request(app.getHttpServer())
      .get('/api/v1/vendor/services')
      .auth(await token(unapprovedVendor), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/vendor/services?limit=101')
      .auth(vendorAToken, { type: 'bearer' })
      .expect(400);
  });

  it('enforces Prisma-backed ownership for detail and update', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/vendor/services/${serviceId}`)
      .auth(await token(vendorA), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/vendor/services/${serviceId}`)
      .auth(await token(vendorB), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/vendor/services/${serviceId}`)
      .auth(await token(customer), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/vendor/services/${serviceId}`)
      .auth(await token(admin), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/vendor/services/${randomUUID()}`)
      .auth(await token(vendorA), { type: 'bearer' })
      .expect(404);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/vendor/services/${serviceId}`)
      .auth(await token(vendorA), { type: 'bearer' })
      .send({
        title: `Updated Massage ${run}`,
        categoryId: secondServiceCategoryId,
        priceAmount: '275000',
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      title: `Updated Massage ${run}`,
      slug: serviceSlug,
      priceAmount: '275000',
      category: { id: secondServiceCategoryId },
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/vendor/services/${serviceId}`)
      .auth(await token(vendorB), { type: 'bearer' })
      .send({ title: 'Forged update' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/vendor/services/${serviceId}`)
      .auth(await token(vendorA), { type: 'bearer' })
      .send({ vendorId: vendorBId, status: ServiceStatus.PUBLISHED })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/vendor/services/${serviceId}`)
      .auth(await token(vendorA), { type: 'bearer' })
      .send({ categoryId: eventCategoryId })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/vendor/services/${serviceId}`)
      .auth(await token(vendorA), { type: 'bearer' })
      .send({ kind: ServiceKind.EVENT })
      .expect(400);
    for (const field of ['categoryId', 'kind', 'title', 'priceAmount']) {
      await request(app.getHttpServer())
        .patch(`/api/v1/vendor/services/${serviceId}`)
        .auth(await token(vendorA), { type: 'bearer' })
        .send({ [field]: null })
        .expect(400);
    }
  });

  it('blocks Vendor B from every management mutation on Vendor A Service', async () => {
    const vendorBToken = await token(vendorB);
    for (const action of ['publish', 'hide', 'archive']) {
      await request(app.getHttpServer())
        .post(`/api/v1/vendor/services/${serviceId}/${action}`)
        .auth(vendorBToken, { type: 'bearer' })
        .expect(403);
    }
    await request(app.getHttpServer())
      .delete(`/api/v1/vendor/services/${serviceId}`)
      .auth(vendorBToken, { type: 'bearer' })
      .expect(403);
  });

  it('publishes SERVICE/EVENT and exposes only safe public catalog data', async () => {
    const vendorAToken = await token(vendorA);
    const published = await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceId}/publish`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(201);
    expect(published.body).toMatchObject({
      status: ServiceStatus.PUBLISHED,
      priceAmount: '275000',
    });
    expect(published.body.publishedAt).toBeTruthy();
    const firstPublishedAt = published.body.publishedAt as string;
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceId}/publish`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${eventServiceId}/publish`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(201);

    const publicList = await request(app.getHttpServer())
      .get('/api/v1/services?page=1&limit=100')
      .expect(200);
    expect(publicList.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: serviceId, priceAmount: '275000' }),
        expect.objectContaining({
          id: eventServiceId,
          priceAmount: '150000',
        }),
      ]),
    );
    const serialized = JSON.stringify(
      publicList.body.items.find(
        (item: { id: string }) => item.id === serviceId,
      ),
    );
    expect(serialized).not.toMatch(
      /ownerUserId|taxCode|businessRegistration|contactEmail|password|token/i,
    );

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/services/${serviceSlug}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      id: serviceId,
      status: ServiceStatus.PUBLISHED,
      category: { id: secondServiceCategoryId },
      vendor: { id: vendorAId },
    });
    expect(typeof detail.body.priceAmount).toBe('string');
    expect(detail.body.publishedAt).toBe(firstPublishedAt);
  });

  it('supports public kind/category/vendor/search filters and pagination', async () => {
    const byServiceKind = await request(app.getHttpServer())
      .get(`/api/v1/services?kind=SERVICE&vendorId=${vendorAId}`)
      .expect(200);
    expect(
      byServiceKind.body.items.every(
        (item: { kind: string }) => item.kind === ServiceKind.SERVICE,
      ),
    ).toBe(true);
    expect(
      byServiceKind.body.items.some(
        (item: { id: string }) => item.id === serviceId,
      ),
    ).toBe(true);

    const byEventKind = await request(app.getHttpServer())
      .get('/api/v1/services?kind=EVENT')
      .expect(200);
    expect(
      byEventKind.body.items.some(
        (item: { id: string }) => item.id === eventServiceId,
      ),
    ).toBe(true);
    const byCategoryId = await request(app.getHttpServer())
      .get(`/api/v1/services?categoryId=${secondServiceCategoryId}`)
      .expect(200);
    expect(
      byCategoryId.body.items.map((item: { id: string }) => item.id),
    ).toContain(serviceId);
    const byCategorySlug = await request(app.getHttpServer())
      .get(`/api/v1/services?categorySlug=service-second-${run}`)
      .expect(200);
    expect(
      byCategorySlug.body.items.map((item: { id: string }) => item.id),
    ).toContain(serviceId);
    const search = await request(app.getHttpServer())
      .get(`/api/v1/services?search=Updated%20Massage%20${run}`)
      .expect(200);
    expect(search.body.items).toHaveLength(1);
    expect(search.body.items[0].id).toBe(serviceId);

    const page = await request(app.getHttpServer())
      .get('/api/v1/services?page=1&limit=1')
      .expect(200);
    expect(page.body).toMatchObject({ page: 1, limit: 1 });
    expect(page.body.total).toBeGreaterThanOrEqual(2);
    expect(page.body.items).toHaveLength(1);
    await request(app.getHttpServer())
      .get('/api/v1/services?kind=INVALID')
      .expect(400);
  });

  it('follows PUBLISHED -> HIDDEN -> PUBLISHED while preserving first publishedAt', async () => {
    const vendorAToken = await token(vendorA);
    const before = await prisma.service.findUniqueOrThrow({
      where: { id: serviceId },
      select: { publishedAt: true },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceId}/hide`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe(ServiceStatus.HIDDEN));
    await request(app.getHttpServer())
      .get(`/api/v1/services/${serviceSlug}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceId}/hide`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(409);

    const republished = await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceId}/publish`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(201);
    expect(republished.body.publishedAt).toBe(
      before.publishedAt?.toISOString(),
    );
    await request(app.getHttpServer())
      .get(`/api/v1/services/${serviceSlug}`)
      .expect(200);
  });

  it('requires PUBLISHED to be hidden before archive and locks archived records', async () => {
    const vendorAToken = await token(vendorA);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceId}/archive`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceId}/hide`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceId}/archive`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe(ServiceStatus.ARCHIVED));
    await request(app.getHttpServer())
      .patch(`/api/v1/vendor/services/${serviceId}`)
      .auth(vendorAToken, { type: 'bearer' })
      .send({ title: 'Cannot edit archived' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceId}/publish`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/v1/vendor/services/${serviceId}`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(409);
    await request(app.getHttpServer())
      .get(`/api/v1/services/${serviceSlug}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${draftCollisionId}/archive`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${draftCollisionId}/publish`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(409);
    await request(app.getHttpServer())
      .get(`/api/v1/services/${draftCollisionSlug}`)
      .expect(404);
  });

  it('soft-deletes only DRAFT/HIDDEN and keeps physical rows', async () => {
    const vendorAToken = await token(vendorA);
    const draft = await createService(vendorA, {
      categoryId: serviceCategoryId,
      kind: ServiceKind.SERVICE,
      title: `Delete Draft ${run}`,
      priceAmount: '0',
    });
    const draftId = draft.body.id as string;
    await request(app.getHttpServer())
      .delete(`/api/v1/vendor/services/${draftId}`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(204);
    expect(
      await prisma.service.findUnique({
        where: { id: draftId },
        select: { deletedAt: true },
      }),
    ).toEqual({ deletedAt: expect.any(Date) });
    await request(app.getHttpServer())
      .get(`/api/v1/vendor/services/${draftId}`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(404);

    const hidden = await createService(vendorA, {
      categoryId: serviceCategoryId,
      kind: ServiceKind.SERVICE,
      title: `Delete Hidden ${run}`,
      priceAmount: '1000',
    });
    const hiddenId = hidden.body.id as string;
    const hiddenSlug = hidden.body.slug as string;
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${hiddenId}/publish`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/vendor/services/${hiddenId}`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${hiddenId}/hide`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/services/${hiddenSlug}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/vendor/services/${hiddenId}`)
      .auth(vendorAToken, { type: 'bearer' })
      .expect(204);
    expect(
      await prisma.service.findUnique({
        where: { id: hiddenId },
        select: { status: true, deletedAt: true },
      }),
    ).toEqual({
      status: ServiceStatus.HIDDEN,
      deletedAt: expect.any(Date),
    });
  });

  it('hides every non-public Vendor, Category, status, and deleted combination', async () => {
    const marker = `VisibilityBlock${run}`;
    const now = new Date();
    await prisma.service.createMany({
      data: [
        {
          vendorId: unapprovedVendorId,
          categoryId: serviceCategoryId,
          kind: ServiceKind.SERVICE,
          title: `${marker} Unapproved Vendor`,
          slug: `visibility-unapproved-${run}`,
          priceAmount: 1n,
          status: ServiceStatus.PUBLISHED,
          publishedAt: now,
        },
        {
          vendorId: vendorAId,
          categoryId: inactiveCategoryId,
          kind: ServiceKind.SERVICE,
          title: `${marker} Inactive Category`,
          slug: `visibility-inactive-${run}`,
          priceAmount: 1n,
          status: ServiceStatus.PUBLISHED,
          publishedAt: now,
        },
        {
          vendorId: vendorAId,
          categoryId: serviceCategoryId,
          kind: ServiceKind.SERVICE,
          title: `${marker} Draft`,
          slug: `visibility-draft-${run}`,
          priceAmount: 1n,
          status: ServiceStatus.DRAFT,
        },
        {
          vendorId: vendorAId,
          categoryId: serviceCategoryId,
          kind: ServiceKind.SERVICE,
          title: `${marker} Hidden`,
          slug: `visibility-hidden-${run}`,
          priceAmount: 1n,
          status: ServiceStatus.HIDDEN,
          publishedAt: now,
        },
        {
          vendorId: vendorAId,
          categoryId: serviceCategoryId,
          kind: ServiceKind.SERVICE,
          title: `${marker} Archived`,
          slug: `visibility-archived-${run}`,
          priceAmount: 1n,
          status: ServiceStatus.ARCHIVED,
        },
        {
          vendorId: vendorAId,
          categoryId: serviceCategoryId,
          kind: ServiceKind.SERVICE,
          title: `${marker} Deleted`,
          slug: `visibility-deleted-${run}`,
          priceAmount: 1n,
          status: ServiceStatus.PUBLISHED,
          publishedAt: now,
          deletedAt: now,
        },
      ],
    });

    const list = await request(app.getHttpServer())
      .get(`/api/v1/services?search=${marker}`)
      .expect(200);
    expect(list.body.total).toBe(0);
    expect(list.body.items).toEqual([]);
    for (const slug of [
      `visibility-unapproved-${run}`,
      `visibility-inactive-${run}`,
      `visibility-draft-${run}`,
      `visibility-hidden-${run}`,
      `visibility-archived-${run}`,
      `visibility-deleted-${run}`,
      `missing-${run}`,
    ]) {
      await request(app.getHttpServer())
        .get(`/api/v1/services/${slug}`)
        .expect(404);
    }
  });

  it('keeps the published EVENT visible after other lifecycle scenarios', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/services/${eventServiceSlug}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      id: eventServiceId,
      kind: ServiceKind.EVENT,
      status: ServiceStatus.PUBLISHED,
      priceAmount: '150000',
    });
    expect(JSON.stringify(detail.body)).not.toMatch(
      /ownerUserId|legalName|taxCode|contactEmail|password|token/i,
    );
  });
});
