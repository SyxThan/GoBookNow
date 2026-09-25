import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
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
import { MAX_SERVICE_IMAGE_SIZE } from '../src/services/images/service-image-file.js';
import { ServicesModule } from '../src/services/services.module.js';
import { FILE_STORAGE_PROVIDER } from '../src/storage/storage.constants.js';
import type {
  FileStorageProvider,
  StoredImage,
  UploadImageInput,
} from '../src/storage/storage.types.js';

type Identity = { id: string; roles: Role[] };

class FakeImageStorage implements FileStorageProvider {
  readonly uploads: Array<UploadImageInput & { storageKey: string }> = [];
  readonly deletes: string[] = [];
  readonly failingDeletes = new Set<string>();

  async uploadImage(input: UploadImageInput): Promise<StoredImage> {
    const storageKey = `fake/services/${this.uploads.length + 1}`;
    this.uploads.push({ ...input, storageKey });
    return {
      provider: 'fake',
      storageKey,
      url: `https://images.example/${this.uploads.length}.jpg`,
      width: 1200,
      height: 800,
      bytes: input.buffer.length,
    };
  }

  async deleteImage(storageKey: string): Promise<void> {
    this.deletes.push(storageKey);
    if (this.failingDeletes.has(storageKey)) {
      throw new BadGatewayException('Image storage deletion failed');
    }
  }
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = Buffer.from('RIFF0000WEBP', 'ascii');

describe('Service images (e2e, PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  const storage = new FakeImageStorage();
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const vendorIds: string[] = [];
  const serviceIds: string[] = [];
  let categoryId: string;
  let vendorA: Identity;
  let vendorB: Identity;
  let customer: Identity;
  let unapprovedVendor: Identity;
  let vendorAId: string;
  let unapprovedVendorId: string;
  let serviceAId: string;
  let serviceASlug: string;
  let serviceBId: string;
  let archivedServiceId: string;
  let draftServiceId: string;
  let draftServiceSlug: string;
  let maxServiceId: string;
  let unapprovedServiceId: string;
  let firstImageId: string;
  let secondImageId: string;
  let thirdImageId: string;
  let otherServiceImageId: string;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        ServicesModule,
      ],
    })
      .overrideProvider(FILE_STORAGE_PROVIDER)
      .useValue(storage)
      .compile();
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
    customer = await createIdentity([RoleCode.CUSTOMER]);
    unapprovedVendor = await createIdentity([RoleCode.VENDOR]);
    vendorAId = await createVendor(vendorA, VendorStatus.APPROVED, 'Image A');
    await createVendor(vendorB, VendorStatus.APPROVED, 'Image B');
    unapprovedVendorId = await createVendor(
      unapprovedVendor,
      VendorStatus.DRAFT,
      'Image Pending',
    );
    const category = await prisma.category.create({
      data: {
        code: `IMAGE_${run.toUpperCase()}`,
        name: `Image Category ${run}`,
        slug: `image-category-${run}`,
        scope: CategoryScope.SERVICE,
      },
      select: { id: true },
    });
    categoryId = category.id;
    ({ id: serviceAId, slug: serviceASlug } = await createService(
      vendorAId,
      ServiceStatus.PUBLISHED,
      'published-a',
    ));
    ({ id: serviceBId } = await createService(
      vendorAId,
      ServiceStatus.PUBLISHED,
      'published-b',
    ));
    ({ id: archivedServiceId } = await createService(
      vendorAId,
      ServiceStatus.ARCHIVED,
      'archived',
    ));
    ({ id: draftServiceId, slug: draftServiceSlug } = await createService(
      vendorAId,
      ServiceStatus.DRAFT,
      'draft',
    ));
    ({ id: maxServiceId } = await createService(
      vendorAId,
      ServiceStatus.DRAFT,
      'maximum',
    ));
    ({ id: unapprovedServiceId } = await createService(
      unapprovedVendorId,
      ServiceStatus.DRAFT,
      'unapproved',
    ));
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
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
        email: `service-image-${run}-${randomUUID()}@example.com`,
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
    name: string,
  ): Promise<string> {
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId: identity.id,
        displayName: `${name} ${run}`,
        slug: `${name.toLowerCase().replaceAll(' ', '-')}-${run}`,
        status,
      },
      select: { id: true },
    });
    vendorIds.push(vendor.id);
    return vendor.id;
  }

  async function createService(
    vendorId: string,
    status: ServiceStatus,
    suffix: string,
  ): Promise<{ id: string; slug: string }> {
    const service = await prisma.service.create({
      data: {
        vendorId,
        categoryId,
        kind: ServiceKind.SERVICE,
        title: `Image Service ${suffix} ${run}`,
        slug: `image-service-${suffix}-${run}`,
        priceAmount: 1000n,
        status,
        publishedAt:
          status === ServiceStatus.PUBLISHED ? new Date() : undefined,
      },
      select: { id: true, slug: true },
    });
    serviceIds.push(service.id);
    return service;
  }

  async function token(identity: Identity): Promise<string> {
    const payload: JwtPayload = {
      sub: identity.id,
      roles: identity.roles,
      type: 'access',
    };
    return jwt.signAsync(payload);
  }

  async function upload(
    identity: Identity,
    serviceId: string,
    buffer: Buffer,
    mimeType: string,
    filename: string,
    expectedStatus = 201,
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceId}/images`)
      .auth(await token(identity), { type: 'bearer' })
      .attach('image', buffer, { filename, contentType: mimeType })
      .expect(expectedStatus);
  }

  it('enforces authentication, role, ownership, and approved Vendor status', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/services/${serviceAId}/images`)
      .attach('image', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(401);
    await upload(customer, serviceAId, JPEG, 'image/jpeg', 'a.jpg', 403);
    await upload(vendorB, serviceAId, JPEG, 'image/jpeg', 'a.jpg', 403);
    await upload(
      unapprovedVendor,
      unapprovedServiceId,
      JPEG,
      'image/jpeg',
      'a.jpg',
      403,
    );
  });

  it('accepts JPEG, PNG, and WebP through the injected external provider', async () => {
    const first = await upload(
      vendorA,
      serviceAId,
      JPEG,
      'image/jpeg',
      '../unsafe.jpg',
    );
    firstImageId = first.body.id as string;
    expect(first.body).toMatchObject({
      url: expect.stringMatching(/^https:\/\//),
      originalName: 'unsafe.jpg',
      mimeType: 'image/jpeg',
      fileSize: JPEG.length,
      width: 1200,
      height: 800,
      sortOrder: 0,
      isPrimary: true,
    });
    expect(first.body).not.toHaveProperty('storageKey');

    const second = await upload(
      vendorA,
      serviceAId,
      PNG,
      'image/png',
      'second.png',
    );
    secondImageId = second.body.id as string;
    expect(second.body).toMatchObject({ sortOrder: 1, isPrimary: false });

    const third = await upload(
      vendorA,
      serviceAId,
      WEBP,
      'image/webp',
      'third.webp',
    );
    thirdImageId = third.body.id as string;
    expect(third.body).toMatchObject({ sortOrder: 2, isPrimary: false });
    expect(storage.uploads.at(-1)?.folder).toBe(serviceAId);
  });

  it('rejects invalid content, oversized files, and archived Services', async () => {
    await upload(
      vendorA,
      serviceAId,
      Buffer.from('plain text'),
      'text/plain',
      'bad.txt',
      400,
    );
    await upload(
      vendorA,
      serviceAId,
      Buffer.from('not a jpeg'),
      'image/jpeg',
      'spoofed.jpg',
      400,
    );
    const oversized = Buffer.alloc(MAX_SERVICE_IMAGE_SIZE + 1);
    JPEG.copy(oversized);
    await upload(
      vendorA,
      serviceAId,
      oversized,
      'image/jpeg',
      'large.jpg',
      413,
    );
    await upload(
      vendorA,
      archivedServiceId,
      JPEG,
      'image/jpeg',
      'archived.jpg',
      409,
    );
  });

  it('sets one primary and rejects an image from another Service', async () => {
    const other = await upload(
      vendorA,
      serviceBId,
      JPEG,
      'image/jpeg',
      'other.jpg',
    );
    otherServiceImageId = other.body.id as string;

    await request(app.getHttpServer())
      .patch(
        `/api/v1/vendor/services/${serviceAId}/images/${secondImageId}/primary`,
      )
      .auth(await token(vendorA), { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => expect(body.isPrimary).toBe(true));
    const list = await request(app.getHttpServer())
      .get(`/api/v1/vendor/services/${serviceAId}/images`)
      .auth(await token(vendorA), { type: 'bearer' })
      .expect(200);
    expect(list.body[0].id).toBe(secondImageId);
    expect(
      list.body.filter((image: { isPrimary: boolean }) => image.isPrimary),
    ).toHaveLength(1);

    await request(app.getHttpServer())
      .patch(
        `/api/v1/vendor/services/${serviceAId}/images/${otherServiceImageId}/primary`,
      )
      .auth(await token(vendorA), { type: 'bearer' })
      .expect(404);
  });

  it('exposes ordered safe image data in the public catalog', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/services/${serviceASlug}`)
      .expect(200);
    expect(detail.body.images).toHaveLength(3);
    expect(detail.body.images[0]).toMatchObject({
      id: secondImageId,
      isPrimary: true,
    });
    for (const image of detail.body.images as Array<Record<string, unknown>>) {
      expect(image).not.toHaveProperty('storageKey');
      expect(image).not.toHaveProperty('provider');
      expect(image).not.toHaveProperty('originalName');
      expect(image).not.toHaveProperty('mimeType');
    }

    const list = await request(app.getHttpServer())
      .get(`/api/v1/services?vendorId=${vendorAId}`)
      .expect(200);
    const service = list.body.items.find(
      (item: { id: string }) => item.id === serviceAId,
    );
    expect(service.images[0].id).toBe(secondImageId);
  });

  it('deletes remotely first, removes metadata, and promotes the next image', async () => {
    const row = await prisma.serviceImage.findUniqueOrThrow({
      where: { id: secondImageId },
      select: { storageKey: true },
    });
    await request(app.getHttpServer())
      .delete(`/api/v1/vendor/services/${serviceAId}/images/${secondImageId}`)
      .auth(await token(vendorB), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(
        `/api/v1/vendor/services/${serviceAId}/images/${otherServiceImageId}`,
      )
      .auth(await token(vendorA), { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/vendor/services/${serviceAId}/images/${secondImageId}`)
      .auth(await token(vendorA), { type: 'bearer' })
      .expect(204);

    expect(storage.deletes).toContain(row.storageKey);
    expect(
      await prisma.serviceImage.findUnique({ where: { id: secondImageId } }),
    ).toBeNull();
    const promoted = await prisma.serviceImage.findUniqueOrThrow({
      where: { id: firstImageId },
      select: { isPrimary: true },
    });
    expect(promoted.isPrimary).toBe(true);
  });

  it('keeps metadata when external deletion fails, then removes it successfully', async () => {
    const row = await prisma.serviceImage.findUniqueOrThrow({
      where: { id: thirdImageId },
      select: { storageKey: true },
    });
    storage.failingDeletes.add(row.storageKey);
    await request(app.getHttpServer())
      .delete(`/api/v1/vendor/services/${serviceAId}/images/${thirdImageId}`)
      .auth(await token(vendorA), { type: 'bearer' })
      .expect(502);
    expect(
      await prisma.serviceImage.findUnique({ where: { id: thirdImageId } }),
    ).not.toBeNull();

    storage.failingDeletes.delete(row.storageKey);
    await request(app.getHttpServer())
      .delete(`/api/v1/vendor/services/${serviceAId}/images/${thirdImageId}`)
      .auth(await token(vendorA), { type: 'bearer' })
      .expect(204);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/services/${serviceASlug}`)
      .expect(200);
    expect(
      detail.body.images.some(
        (image: { id: string }) => image.id === thirdImageId,
      ),
    ).toBe(false);
  });

  it('enforces the atomic eight-image limit', async () => {
    for (let index = 0; index < 7; index += 1) {
      await upload(
        vendorA,
        maxServiceId,
        JPEG,
        'image/jpeg',
        `maximum-${index}.jpg`,
      );
    }
    const vendorToken = await token(vendorA);
    const concurrent = await Promise.all(
      ['maximum-8a.jpg', 'maximum-8b.jpg'].map((filename) =>
        request(app.getHttpServer())
          .post(`/api/v1/vendor/services/${maxServiceId}/images`)
          .auth(vendorToken, { type: 'bearer' })
          .attach('image', JPEG, { filename, contentType: 'image/jpeg' }),
      ),
    );
    expect(
      concurrent.map(({ status }) => status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    expect(
      await prisma.serviceImage.count({ where: { serviceId: maxServiceId } }),
    ).toBe(8);
    const uploadsAtLimit = storage.uploads.length;
    await upload(
      vendorA,
      maxServiceId,
      JPEG,
      'image/jpeg',
      'maximum-9.jpg',
      409,
    );
    expect(storage.uploads).toHaveLength(uploadsAtLimit);
  });

  it('allows draft image management without changing public visibility', async () => {
    await upload(vendorA, draftServiceId, JPEG, 'image/jpeg', 'draft.jpg');
    await request(app.getHttpServer())
      .get(`/api/v1/services/${draftServiceSlug}`)
      .expect(404);
  });
});
