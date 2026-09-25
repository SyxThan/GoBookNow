import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { vi } from 'vitest';
import { AuditAction, AuditEntityType } from '../src/audit/audit.constants.js';
import { AuditService } from '../src/audit/audit.service.js';
import { AuthModule } from '../src/auth/auth.module.js';
import {
  RoleCode,
  type RoleCode as Role,
} from '../src/auth/constants/role.constants.js';
import type { JwtPayload } from '../src/auth/types/jwt-payload.type.js';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  UserStatus,
  VendorApplicationStatus,
  VendorStatus,
} from '../src/generated/prisma/client.js';
import { VendorApplicationsModule } from '../src/vendor-applications/vendor-applications.module.js';
import { VendorsModule } from '../src/vendors/vendors.module.js';

type Identity = { id: string; roles: Role[] };

describe('Vendor onboarding (e2e, PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let auditService: AuditService;
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const vendorIds: string[] = [];
  const uploadRoot = resolve(
    process.cwd(),
    'apps/backend/uploads/vendor-applications',
    `e2e-${run}`,
  );

  let owner: Identity;
  let other: Identity;
  let admin: Identity;
  let vendorRoleUser: Identity;
  let vendorId: string;
  let applicationId: string;

  beforeAll(async () => {
    process.env.VENDOR_APPLICATION_UPLOAD_DIR = uploadRoot;
    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        VendorsModule,
        VendorApplicationsModule,
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
    auditService = fixture.get(AuditService);

    await Promise.all(
      Object.values(RoleCode).map((code) =>
        prisma.role.upsert({
          where: { code },
          update: {},
          create: { code, name: code, isSystem: true },
        }),
      ),
    );
    owner = await createIdentity([RoleCode.CUSTOMER]);
    other = await createIdentity([RoleCode.CUSTOMER]);
    admin = await createIdentity([RoleCode.ADMIN]);
    vendorRoleUser = await createIdentity([RoleCode.VENDOR]);
    vendorId = await createVendor(
      owner,
      VendorStatus.DRAFT,
      'Primary onboarding',
    );
  });

  afterAll(async () => {
    if (prisma) {
      const applications = await prisma.vendorApplication.findMany({
        where: { vendorId: { in: vendorIds } },
        select: { id: true },
      });
      const applicationIds = applications.map(({ id }) => id);
      await prisma.auditLog.deleteMany({
        where: {
          entityType: AuditEntityType.VENDOR_APPLICATION,
          entityId: { in: applicationIds },
        },
      });
      await prisma.vendorApplicationHistory.deleteMany({
        where: { applicationId: { in: applicationIds } },
      });
      await prisma.vendorApplicationDocument.deleteMany({
        where: { applicationId: { in: applicationIds } },
      });
      await prisma.vendorApplication.deleteMany({
        where: { id: { in: applicationIds } },
      });
      await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
    await rm(uploadRoot, { recursive: true, force: true });
    delete process.env.VENDOR_APPLICATION_UPLOAD_DIR;
  });

  async function createIdentity(roles: Role[]): Promise<Identity> {
    const rows = await prisma.role.findMany({
      where: { code: { in: roles } },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        email: `application-${run}-${randomUUID()}@example.com`,
        status: UserStatus.ACTIVE,
        userRoles: { create: rows.map(({ id }) => ({ roleId: id })) },
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
        displayName: name,
        slug: `${name.toLowerCase().replaceAll(' ', '-')}-${run}-${randomUUID().slice(0, 6)}`,
        status,
      },
      select: { id: true },
    });
    vendorIds.push(vendor.id);
    return vendor.id;
  }

  async function token(identity: Identity): Promise<string> {
    const payload: JwtPayload = {
      sub: identity.id,
      roles: identity.roles,
      type: 'access',
    };
    return jwt.signAsync(payload);
  }

  async function submit(identity: Identity, id: string, status = 201) {
    return request(app.getHttpServer())
      .post(`/api/v1/vendors/${id}/applications`)
      .auth(await token(identity), { type: 'bearer' })
      .expect(status);
  }

  async function approve(identity: Identity, id: string, status = 201) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/vendor-applications/${id}/approve`)
      .auth(await token(identity), { type: 'bearer' })
      .set('user-agent', 'GoBookNow e2e admin')
      .send({ note: 'Verified for marketplace access' })
      .expect(status);
  }

  async function reject(
    identity: Identity,
    id: string,
    reason: string,
    status = 201,
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/vendor-applications/${id}/reject`)
      .auth(await token(identity), { type: 'bearer' })
      .set('user-agent', 'GoBookNow e2e admin')
      .send({ reason })
      .expect(status);
  }

  it('submits a DRAFT Vendor atomically as PENDING with initial history', async () => {
    const response = await submit(owner, vendorId);
    applicationId = response.body.id as string;
    expect(response.body).toMatchObject({
      vendorId,
      status: VendorApplicationStatus.PENDING,
      reviewedAt: null,
      history: [
        {
          fromStatus: null,
          toStatus: VendorApplicationStatus.PENDING,
        },
      ],
    });
    expect(
      await prisma.vendor.findUnique({
        where: { id: vendorId },
        select: { status: true },
      }),
    ).toEqual({ status: VendorStatus.PENDING });
  });

  it('enforces ownership and one active application', async () => {
    await submit(other, vendorId, 403);
    await submit(owner, vendorId, 409);
    const pendingCount = await prisma.vendorApplication.count({
      where: { vendorId, status: VendorApplicationStatus.PENDING },
    });
    expect(pendingCount).toBe(1);
  });

  it('uploads PDF/JPEG/PNG safely and exposes protected content', async () => {
    const ownerToken = await token(owner);
    const pdf = Buffer.from('%PDF-1.7 demo document');
    const upload = await request(app.getHttpServer())
      .post(`/api/v1/vendor-applications/${applicationId}/documents`)
      .auth(ownerToken, { type: 'bearer' })
      .field('documentType', 'BUSINESS_REGISTRATION')
      .attach('file', pdf, {
        filename: '../../registration.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/vendor-applications/${applicationId}/documents`)
      .auth(ownerToken, { type: 'bearer' })
      .field('documentType', 'REPRESENTATIVE_ID')
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]), {
        filename: 'identity.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/vendor-applications/${applicationId}/documents`)
      .auth(ownerToken, { type: 'bearer' })
      .field('documentType', 'TAX_DOCUMENT')
      .attach(
        'file',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
        { filename: 'tax.png', contentType: 'image/png' },
      )
      .expect(201);

    expect(upload.body).not.toHaveProperty('storedName');
    expect(upload.body.fileUrl).toContain('/content');
    const row = await prisma.vendorApplicationDocument.findUnique({
      where: { id: upload.body.id as string },
    });
    expect(row?.storedName).toMatch(/^[0-9a-f-]+\.pdf$/);
    expect(row?.storedName).not.toContain('registration');
    expect(row?.fileSize).toBe(pdf.length);

    const download = await request(app.getHttpServer())
      .get(upload.body.fileUrl as string)
      .auth(ownerToken, { type: 'bearer' })
      .expect(200);
    expect(download.headers['content-type']).toContain('application/pdf');
    await request(app.getHttpServer())
      .get(upload.body.fileUrl as string)
      .auth(await token(admin), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(upload.body.fileUrl as string)
      .auth(await token(other), { type: 'bearer' })
      .expect(403);
  });

  it('rejects invalid, spoofed, oversized, unauthorized, and excess documents', async () => {
    const path = `/api/v1/vendor-applications/${applicationId}/documents`;
    const ownerToken = await token(owner);
    await request(app.getHttpServer())
      .post(path)
      .auth(ownerToken, { type: 'bearer' })
      .field('documentType', 'OTHER')
      .attach('file', Buffer.from('MZ'), {
        filename: 'malware.exe',
        contentType: 'application/x-msdownload',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .auth(ownerToken, { type: 'bearer' })
      .field('documentType', 'OTHER')
      .attach('file', Buffer.from('MZ executable'), {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .auth(ownerToken, { type: 'bearer' })
      .field('documentType', 'OTHER')
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1, 1), {
        filename: 'large.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);
    await request(app.getHttpServer())
      .post(path)
      .auth(await token(other), { type: 'bearer' })
      .field('documentType', 'OTHER')
      .attach('file', Buffer.from('%PDF-1.7'), {
        filename: 'other.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);

    for (let index = 0; index < 2; index += 1) {
      await request(app.getHttpServer())
        .post(path)
        .auth(ownerToken, { type: 'bearer' })
        .field('documentType', 'OTHER')
        .attach('file', Buffer.from(`%PDF-1.7 extra ${index}`), {
          filename: `extra-${index}.pdf`,
          contentType: 'application/pdf',
        })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post(path)
      .auth(ownerToken, { type: 'bearer' })
      .field('documentType', 'OTHER')
      .attach('file', Buffer.from('%PDF-1.7 sixth'), {
        filename: 'sixth.pdf',
        contentType: 'application/pdf',
      })
      .expect(409);
    expect(
      await prisma.vendorApplicationDocument.count({
        where: { applicationId },
      }),
    ).toBe(5);
  });

  it('returns latest application, documents, and append-only history to owner/admin', async () => {
    const ownerToken = await token(owner);
    const latest = await request(app.getHttpServer())
      .get(`/api/v1/vendors/${vendorId}/applications/latest`)
      .auth(ownerToken, { type: 'bearer' })
      .expect(200);
    expect(latest.body.documents).toHaveLength(5);
    expect(latest.body.history).toHaveLength(1);
    await request(app.getHttpServer())
      .get(`/api/v1/vendors/${vendorId}/applications/latest`)
      .auth(await token(admin), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/vendor-applications/${applicationId}/history`)
      .auth(await token(other), { type: 'bearer' })
      .expect(403);
  });

  it('restricts admin review endpoints to ADMIN and requires rejection reason', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/vendor-applications')
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/vendor-applications/${applicationId}`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/vendor-applications/${applicationId}/approve`)
      .send({})
      .expect(401);
    await approve(owner, applicationId, 403);
    await approve(vendorRoleUser, applicationId, 403);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/vendor-applications/${applicationId}/reject`)
      .auth(await token(admin), { type: 'bearer' })
      .send({ reason: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/admin/vendor-applications')
      .auth(await token(owner), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/admin/vendor-applications')
      .auth(await token(vendorRoleUser), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/vendor-applications/${applicationId}`)
      .auth(await token(owner), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/vendor-applications/${applicationId}`)
      .auth(await token(vendorRoleUser), { type: 'bearer' })
      .expect(403);
  });

  it('approves atomically, preserves CUSTOMER, assigns VENDOR once, and records history', async () => {
    const response = await approve(admin, applicationId);
    expect(response.body.status).toBe(VendorApplicationStatus.APPROVED);
    expect(response.body.vendor.status).toBe(VendorStatus.APPROVED);
    expect(response.body.reviewedAt).toBeTruthy();
    expect(response.body.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromStatus: VendorApplicationStatus.PENDING,
          toStatus: VendorApplicationStatus.APPROVED,
        }),
      ]),
    );
    const reviewedApplication = await prisma.vendorApplication.findUnique({
      where: { id: applicationId },
      select: { reviewedByUserId: true, reviewedAt: true },
    });
    expect(reviewedApplication?.reviewedByUserId).toBe(admin.id);
    expect(reviewedApplication?.reviewedAt).toBeInstanceOf(Date);

    const roles = await prisma.userRole.findMany({
      where: { userId: owner.id },
      select: { role: { select: { code: true } } },
    });
    expect(
      roles.map(({ role }) => role.code).sort((a, b) => a.localeCompare(b)),
    ).toEqual([RoleCode.CUSTOMER, RoleCode.VENDOR]);
    expect(new Set(roles.map(({ role }) => role.code)).size).toBe(2);

    const audit = await prisma.auditLog.findMany({
      where: {
        entityType: AuditEntityType.VENDOR_APPLICATION,
        entityId: applicationId,
      },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorUserId: admin.id,
      action: AuditAction.VENDOR_APPLICATION_APPROVED,
      entityType: AuditEntityType.VENDOR_APPLICATION,
      entityId: applicationId,
      targetUserId: owner.id,
      userAgent: 'GoBookNow e2e admin',
      metadata: {
        vendorId,
        applicationId,
        fromStatus: VendorApplicationStatus.PENDING,
        toStatus: VendorApplicationStatus.APPROVED,
        reviewNote: 'Verified for marketplace access',
      },
    });
    expect(audit[0]?.ipAddress).toBeTruthy();
    expect(JSON.stringify(audit[0]?.metadata)).not.toMatch(/password|token/i);
    await approve(admin, applicationId, 409);
    await reject(admin, applicationId, 'Cannot reverse approval', 409);
    await submit(owner, vendorId, 409);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor-applications/${applicationId}/documents`)
      .auth(await token(owner), { type: 'bearer' })
      .field('documentType', 'OTHER')
      .attach('file', Buffer.from('%PDF-1.7'), {
        filename: 'late.pdf',
        contentType: 'application/pdf',
      })
      .expect(409);
  });

  it('rejects with a reason, grants no role, and resubmits as a new application', async () => {
    const rejectedOwner = await createIdentity([RoleCode.CUSTOMER]);
    const rejectedVendor = await createVendor(
      rejectedOwner,
      VendorStatus.DRAFT,
      'Rejected onboarding',
    );
    const first = await submit(rejectedOwner, rejectedVendor);
    const firstId = first.body.id as string;
    const rejected = await reject(admin, firstId, 'Tax document is unclear');
    expect(rejected.body).toMatchObject({
      id: firstId,
      status: VendorApplicationStatus.REJECTED,
      reviewNote: 'Tax document is unclear',
      vendor: { status: VendorStatus.REJECTED },
    });
    await reject(admin, firstId, 'Again', 409);

    const roleCodes = await prisma.userRole.findMany({
      where: { userId: rejectedOwner.id },
      select: { role: { select: { code: true } } },
    });
    expect(roleCodes.map(({ role }) => role.code)).toEqual([RoleCode.CUSTOMER]);

    await request(app.getHttpServer())
      .patch(`/api/v1/vendors/${rejectedVendor}`)
      .auth(await token(rejectedOwner), { type: 'bearer' })
      .send({ description: 'Corrected legal profile' })
      .expect(200);
    const second = await submit(rejectedOwner, rejectedVendor);
    expect(second.body.id).not.toBe(firstId);
    expect(second.body.status).toBe(VendorApplicationStatus.PENDING);

    const oldHistory = await prisma.vendorApplicationHistory.findMany({
      where: { applicationId: firstId },
      orderBy: { createdAt: 'asc' },
    });
    expect(oldHistory.map(({ toStatus }) => toStatus)).toEqual([
      VendorApplicationStatus.PENDING,
      VendorApplicationStatus.REJECTED,
    ]);
    expect(oldHistory[1]?.note).toBe('Tax document is unclear');

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        entityType: AuditEntityType.VENDOR_APPLICATION,
        entityId: firstId,
      },
    });
    expect(audit).toMatchObject({
      actorUserId: admin.id,
      action: AuditAction.VENDOR_APPLICATION_REJECTED,
      targetUserId: rejectedOwner.id,
      metadata: {
        vendorId: rejectedVendor,
        applicationId: firstId,
        fromStatus: VendorApplicationStatus.PENDING,
        toStatus: VendorApplicationStatus.REJECTED,
        reason: 'Tax document is unclear',
      },
    });
  });

  it('blocks SUSPENDED Vendors from submission', async () => {
    const suspendedOwner = await createIdentity([RoleCode.CUSTOMER]);
    const suspendedVendor = await createVendor(
      suspendedOwner,
      VendorStatus.SUSPENDED,
      'Suspended onboarding',
    );
    await submit(suspendedOwner, suspendedVendor, 409);
  });

  it('allows exactly one concurrent admin transition and keeps states consistent', async () => {
    const raceOwner = await createIdentity([RoleCode.CUSTOMER]);
    const raceVendor = await createVendor(
      raceOwner,
      VendorStatus.DRAFT,
      'Race onboarding',
    );
    const submitted = await submit(raceOwner, raceVendor);
    const raceApplication = submitted.body.id as string;
    const adminToken = await token(admin);

    const [approveResponse, rejectResponse] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/admin/vendor-applications/${raceApplication}/approve`)
        .auth(adminToken, { type: 'bearer' })
        .send({}),
      request(app.getHttpServer())
        .post(`/api/v1/admin/vendor-applications/${raceApplication}/reject`)
        .auth(adminToken, { type: 'bearer' })
        .send({ reason: 'Concurrent rejection' }),
    ]);
    expect(
      [approveResponse.status, rejectResponse.status].sort((a, b) => a - b),
    ).toEqual([201, 409]);

    const final = await prisma.vendorApplication.findUnique({
      where: { id: raceApplication },
      select: { status: true, vendor: { select: { status: true } } },
    });
    expect(final?.vendor.status).toBe(final?.status);
    const transitions = await prisma.vendorApplicationHistory.count({
      where: { applicationId: raceApplication },
    });
    expect(transitions).toBe(2);
    const raceAudit = await prisma.auditLog.findMany({
      where: {
        entityType: AuditEntityType.VENDOR_APPLICATION,
        entityId: raceApplication,
      },
      select: { action: true, metadata: true },
    });
    expect(raceAudit).toHaveLength(1);
    expect(raceAudit[0]?.action).toBe(
      final?.status === VendorApplicationStatus.APPROVED
        ? AuditAction.VENDOR_APPLICATION_APPROVED
        : AuditAction.VENDOR_APPLICATION_REJECTED,
    );
    expect(raceAudit[0]?.metadata).toMatchObject({
      toStatus: final?.status,
    });
    expect(
      await prisma.vendorApplicationHistory.findFirst({
        where: {
          applicationId: raceApplication,
          fromStatus: VendorApplicationStatus.PENDING,
        },
        select: { toStatus: true },
      }),
    ).toEqual({ toStatus: final?.status });
  });

  it('allows exactly one of two concurrent approvals', async () => {
    const raceOwner = await createIdentity([RoleCode.CUSTOMER]);
    const raceVendor = await createVendor(
      raceOwner,
      VendorStatus.DRAFT,
      'Double approval race',
    );
    const submitted = await submit(raceOwner, raceVendor);
    const raceApplication = submitted.body.id as string;
    const adminToken = await token(admin);
    const approveRequest = () =>
      request(app.getHttpServer())
        .post(`/api/v1/admin/vendor-applications/${raceApplication}/approve`)
        .auth(adminToken, { type: 'bearer' })
        .send({});

    const responses = await Promise.all([approveRequest(), approveRequest()]);
    expect(responses.map(({ status }) => status).sort((a, b) => a - b)).toEqual(
      [201, 409],
    );
    expect(
      await prisma.vendorApplicationHistory.count({
        where: { applicationId: raceApplication },
      }),
    ).toBe(2);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: AuditEntityType.VENDOR_APPLICATION,
          entityId: raceApplication,
        },
      }),
    ).toBe(1);
  });

  it('rolls back the entire approval when audit persistence fails', async () => {
    const rollbackOwner = await createIdentity([RoleCode.CUSTOMER]);
    const rollbackVendor = await createVendor(
      rollbackOwner,
      VendorStatus.DRAFT,
      'Audit rollback',
    );
    const submitted = await submit(rollbackOwner, rollbackVendor);
    const rollbackApplication = submitted.body.id as string;
    const createAudit = vi
      .spyOn(auditService, 'create')
      .mockRejectedValueOnce(new Error('forced audit failure'));

    await approve(admin, rollbackApplication, 500);
    createAudit.mockRestore();

    expect(
      await prisma.vendorApplication.findUnique({
        where: { id: rollbackApplication },
        select: { status: true, reviewedAt: true, reviewedByUserId: true },
      }),
    ).toEqual({
      status: VendorApplicationStatus.PENDING,
      reviewedAt: null,
      reviewedByUserId: null,
    });
    expect(
      await prisma.vendor.findUnique({
        where: { id: rollbackVendor },
        select: { status: true },
      }),
    ).toEqual({ status: VendorStatus.PENDING });
    expect(
      await prisma.vendorApplicationHistory.count({
        where: { applicationId: rollbackApplication },
      }),
    ).toBe(1);
    expect(
      await prisma.userRole.count({
        where: {
          userId: rollbackOwner.id,
          role: { code: RoleCode.VENDOR },
        },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: AuditEntityType.VENDOR_APPLICATION,
          entityId: rollbackApplication,
        },
      }),
    ).toBe(0);
  });

  it('supports bounded admin list filtering and safe detail', async () => {
    const adminToken = await token(admin);
    const pending = await request(app.getHttpServer())
      .get('/api/v1/admin/vendor-applications?page=1&limit=1')
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(pending.body).toMatchObject({ page: 1, limit: 1 });
    expect(pending.body.items).toHaveLength(1);
    expect(pending.body.items[0].status).toBe('PENDING');
    expect(pending.body.items[0]).toHaveProperty('applicationId');
    expect(pending.body.items[0].vendor.owner).not.toHaveProperty(
      'passwordHash',
    );

    const approved = await request(app.getHttpServer())
      .get('/api/v1/admin/vendor-applications?status=APPROVED&page=1&limit=100')
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(
      approved.body.items.every(
        (item: { status: string }) => item.status === 'APPROVED',
      ),
    ).toBe(true);
    expect(
      approved.body.items.some(
        (item: { applicationId: string }) =>
          item.applicationId === applicationId,
      ),
    ).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/vendor-applications/${applicationId}`)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(detail.body.vendor).not.toHaveProperty('ownerUserId');
    expect(JSON.stringify(detail.body)).not.toContain('passwordHash');
    expect(JSON.stringify(detail.body)).not.toContain('tokenHash');
    await request(app.getHttpServer())
      .get(`/api/v1/admin/vendor-applications/${randomUUID()}`)
      .auth(adminToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/admin/vendor-applications?status=INVALID')
      .auth(adminToken, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/admin/vendor-applications?limit=101')
      .auth(adminToken, { type: 'bearer' })
      .expect(400);
  });

  it('exposes filtered, paginated, read-only audit logs only to ADMIN', async () => {
    const adminToken = await token(admin);
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .auth(await token(owner), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .auth(await token(vendorRoleUser), { type: 'bearer' })
      .expect(403);

    const result = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/audit-logs?action=${AuditAction.VENDOR_APPLICATION_APPROVED}&entityType=${AuditEntityType.VENDOR_APPLICATION}&actorUserId=${admin.id}&page=1&limit=2`,
      )
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(result.body).toMatchObject({ page: 1, limit: 2 });
    expect(result.body.total).toBeGreaterThanOrEqual(2);
    expect(result.body.items.length).toBeLessThanOrEqual(2);
    expect(
      result.body.items.every(
        (entry: { action: string; entityType: string }) =>
          entry.action === AuditAction.VENDOR_APPLICATION_APPROVED &&
          entry.entityType === AuditEntityType.VENDOR_APPLICATION,
      ),
    ).toBe(true);
    expect(JSON.stringify(result.body)).not.toContain('passwordHash');
    expect(JSON.stringify(result.body)).not.toContain('tokenHash');
    const timestamps = result.body.items.map((entry: { createdAt: string }) =>
      new Date(entry.createdAt).getTime(),
    );
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));

    await request(app.getHttpServer())
      .get(
        '/api/v1/admin/audit-logs?from=2026-09-25T10:00:00.000Z&to=2026-09-24T10:00:00.000Z',
      )
      .auth(adminToken, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/audit-logs/${randomUUID()}`)
      .auth(adminToken, { type: 'bearer' })
      .send({ action: 'TAMPERED' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/audit-logs/${randomUUID()}`)
      .auth(adminToken, { type: 'bearer' })
      .expect(404);
  });
});
