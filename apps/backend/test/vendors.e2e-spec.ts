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
import { UserStatus, VendorStatus } from '../src/generated/prisma/client.js';
import { VendorsModule } from '../src/vendors/vendors.module.js';

type Identity = {
  id: string;
  roles: Role[];
};

describe('Vendor Profile (e2e, PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  const userIds: string[] = [];
  const testRun = randomUUID().slice(0, 8);

  let owner: Identity;
  let otherCustomer: Identity;
  let admin: Identity;
  let managedVendorId: string;
  let managedVendorSlug: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        VendorsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    jwtService = moduleFixture.get(JwtService);

    await Promise.all(
      Object.values(RoleCode).map((code) =>
        prisma.role.upsert({
          where: { code },
          update: {},
          create: {
            code,
            name: code,
            description: `E2E ${code}`,
            isSystem: true,
          },
        }),
      ),
    );

    owner = await createIdentity([RoleCode.CUSTOMER]);
    otherCustomer = await createIdentity([RoleCode.CUSTOMER]);
    admin = await createIdentity([RoleCode.ADMIN]);

    const managedVendor = await prisma.vendor.create({
      data: {
        ownerUserId: owner.id,
        displayName: 'Managed Vendor',
        slug: `managed-vendor-${testRun}`,
        status: VendorStatus.DRAFT,
      },
    });
    managedVendorId = managedVendor.id;
    managedVendorSlug = managedVendor.slug;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.vendor.deleteMany({
        where: { ownerUserId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  async function createIdentity(roles: Role[]): Promise<Identity> {
    const roleRows = await prisma.role.findMany({
      where: { code: { in: roles } },
      select: { id: true, code: true },
    });
    const user = await prisma.user.create({
      data: {
        email: `vendor-e2e-${testRun}-${randomUUID()}@example.com`,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: roleRows.map((role) => ({ roleId: role.id })),
        },
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return { id: user.id, roles };
  }

  async function tokenFor(identity: Identity): Promise<string> {
    const payload: JwtPayload = {
      sub: identity.id,
      roles: identity.roles,
      type: 'access',
    };
    return jwtService.signAsync(payload);
  }

  async function createVendor(
    identity: Identity,
    body: Record<string, unknown>,
    expectedStatus: number,
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/vendors')
      .auth(await tokenFor(identity), { type: 'bearer' })
      .send(body)
      .expect(expectedStatus);
  }

  it('allows CUSTOMER and VENDOR identities to create DRAFT Vendors', async () => {
    const customer = await createIdentity([RoleCode.CUSTOMER]);
    const vendorRoleUser = await createIdentity([RoleCode.VENDOR]);

    const customerResponse = await createVendor(
      customer,
      {
        displayName: 'Công ty GoBook Việt Nam',
        contactEmail: 'contact@gobook.example',
        countryCode: 'vn',
      },
      201,
    );
    expect(customerResponse.body).toMatchObject({
      displayName: 'Công ty GoBook Việt Nam',
      slug: 'cong-ty-gobook-viet-nam',
      status: VendorStatus.DRAFT,
      countryCode: 'VN',
    });
    expect(customerResponse.body).not.toHaveProperty('ownerUserId');
    expect(customerResponse.body).not.toHaveProperty('deletedAt');

    await createVendor(
      vendorRoleUser,
      {
        displayName: 'Vendor Role Business',
      },
      201,
    );
  });

  it('rejects unauthenticated and ADMIN create requests', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/vendors')
      .send({ displayName: 'No Auth' })
      .expect(401);
    await createVendor(admin, { displayName: 'Admin Vendor' }, 403);
  });

  it('validates DTOs and rejects client-controlled owner/status fields', async () => {
    const invalidUser = await createIdentity([RoleCode.CUSTOMER]);
    await createVendor(invalidUser, { displayName: 'x' }, 400);
    await createVendor(
      invalidUser,
      {
        displayName: 'Forged Vendor',
        ownerUserId: otherCustomer.id,
        status: VendorStatus.APPROVED,
      },
      400,
    );

    expect(
      await prisma.vendor.findUnique({
        where: { ownerUserId: invalidUser.id },
      }),
    ).toBeNull();
  });

  it('prevents a second Vendor for the same owner', async () => {
    const identity = await createIdentity([RoleCode.CUSTOMER]);
    await createVendor(identity, { displayName: 'First Vendor' }, 201);
    await createVendor(identity, { displayName: 'Second Vendor' }, 409);
  });

  it('generates a unique server-side suffix for a slug collision', async () => {
    const first = await createIdentity([RoleCode.CUSTOMER]);
    const second = await createIdentity([RoleCode.CUSTOMER]);
    const firstResponse = await createVendor(
      first,
      {
        displayName: 'Collision Business',
      },
      201,
    );
    const secondResponse = await createVendor(
      second,
      {
        displayName: 'Collision Business',
      },
      201,
    );

    expect(firstResponse.body.slug).toBe('collision-business');
    expect(secondResponse.body.slug).toMatch(
      /^collision-business-[a-z0-9]{8}$/,
    );
  });

  it('maps duplicate legal identifiers to 409 without exposing Prisma errors', async () => {
    const original = await createIdentity([RoleCode.CUSTOMER]);
    const duplicateTax = await createIdentity([RoleCode.CUSTOMER]);
    const duplicateRegistration = await createIdentity([RoleCode.CUSTOMER]);
    await createVendor(
      original,
      {
        displayName: 'Legal Source',
        taxCode: `TAX-${testRun}`,
        businessRegistrationNumber: `REG-${testRun}`,
      },
      201,
    );

    const taxResponse = await createVendor(
      duplicateTax,
      {
        displayName: 'Duplicate Tax',
        taxCode: `TAX-${testRun}`,
      },
      409,
    );
    expect(taxResponse.body.message).toBe('Tax code is already in use');

    const registrationResponse = await createVendor(
      duplicateRegistration,
      {
        displayName: 'Duplicate Registration',
        businessRegistrationNumber: `REG-${testRun}`,
      },
      409,
    );
    expect(registrationResponse.body.message).toBe(
      'Business registration number is already in use',
    );
  });

  it('returns the current Vendor and 404 when the identity has none', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/vendors/me')
      .auth(await tokenFor(owner), { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(managedVendorId));

    await request(app.getHttpServer())
      .get('/api/v1/vendors/me')
      .auth(await tokenFor(otherCustomer), { type: 'bearer' })
      .expect(404);
  });

  it('uses the Prisma ownership resolver for owner, other user, ADMIN, and missing rows', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/vendors/${managedVendorId}`)
      .auth(await tokenFor(owner), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/vendors/${managedVendorId}`)
      .auth(await tokenFor(otherCustomer), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/vendors/${managedVendorId}`)
      .auth(await tokenFor(admin), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/vendors/${randomUUID()}`)
      .auth(await tokenFor(owner), { type: 'bearer' })
      .expect(404);
  });

  it('allows only the owner to update and keeps slug/status/owner immutable', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/vendors/${managedVendorId}`)
      .auth(await tokenFor(otherCustomer), { type: 'bearer' })
      .send({ displayName: 'Forbidden Update' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/vendors/${managedVendorId}`)
      .auth(await tokenFor(admin), { type: 'bearer' })
      .send({ displayName: 'Admin Update' })
      .expect(403);

    const update = await request(app.getHttpServer())
      .patch(`/api/v1/vendors/${managedVendorId}`)
      .auth(await tokenFor(owner), { type: 'bearer' })
      .send({
        displayName: 'Updated Managed Vendor',
        contactEmail: 'updated@example.com',
      })
      .expect(200);
    expect(update.body).toMatchObject({
      displayName: 'Updated Managed Vendor',
      slug: managedVendorSlug,
      status: VendorStatus.DRAFT,
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/vendors/${managedVendorId}`)
      .auth(await tokenFor(owner), { type: 'bearer' })
      .send({ contactEmail: null })
      .expect(200)
      .expect(({ body }) => expect(body.contactEmail).toBeNull());

    await request(app.getHttpServer())
      .patch(`/api/v1/vendors/${managedVendorId}`)
      .auth(await tokenFor(owner), { type: 'bearer' })
      .send({ slug: 'forged', status: VendorStatus.APPROVED })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/vendors/${managedVendorId}`)
      .auth(await tokenFor(owner), { type: 'bearer' })
      .send({ ownerUserId: otherCustomer.id })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/vendors/${managedVendorId}`)
      .auth(await tokenFor(owner), { type: 'bearer' })
      .send({ contactEmail: 'not-an-email' })
      .expect(400);
  });

  it('soft-deletes an owned DRAFT row and hides it from all normal queries', async () => {
    const deleteOwner = await createIdentity([RoleCode.CUSTOMER]);
    const created = await createVendor(
      deleteOwner,
      {
        displayName: 'Delete Me',
      },
      201,
    );
    const vendorId = created.body.id as string;

    await request(app.getHttpServer())
      .delete(`/api/v1/vendors/${vendorId}`)
      .auth(await tokenFor(otherCustomer), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/vendors/${vendorId}`)
      .auth(await tokenFor(deleteOwner), { type: 'bearer' })
      .expect(204);

    const row = await prisma.vendor.findUnique({ where: { id: vendorId } });
    expect(row?.deletedAt).toBeInstanceOf(Date);
    await request(app.getHttpServer())
      .get(`/api/v1/vendors/${vendorId}`)
      .auth(await tokenFor(deleteOwner), { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/vendors/me')
      .auth(await tokenFor(deleteOwner), { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/vendors/${vendorId}`)
      .auth(await tokenFor(deleteOwner), { type: 'bearer' })
      .expect(404);
  });

  it('rejects self-deletion outside DRAFT or REJECTED status', async () => {
    const approvedOwner = await createIdentity([RoleCode.CUSTOMER]);
    const approved = await prisma.vendor.create({
      data: {
        ownerUserId: approvedOwner.id,
        displayName: 'Approved Vendor',
        slug: `approved-vendor-${testRun}`,
        status: VendorStatus.APPROVED,
      },
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/vendors/${approved.id}`)
      .auth(await tokenFor(approvedOwner), { type: 'bearer' })
      .expect(409);
  });
});
