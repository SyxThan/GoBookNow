import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  CategoryScope,
  ServiceKind,
  ServiceStatus,
  SlotStatus,
  UserStatus,
  VendorStatus,
} from '../src/generated/prisma/client.js';
import { ServicesModule } from '../src/services/services.module.js';

describe('Public service search (e2e, PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const vendorIds: string[] = [];
  const categoryIds: string[] = [];
  const serviceIds: string[] = [];
  const base = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  let vendorId: string;
  let unapprovedVendorId: string;
  let deletedVendorId: string;
  let serviceCategoryId: string;
  let serviceCategorySlug: string;
  let eventCategoryId: string;
  let inactiveCategoryId: string;
  let deletedCategoryId: string;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
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

    vendorId = await createVendor(VendorStatus.APPROVED, 'Hà Nội Wellness', {
      province: 'Hà Nội',
      district: 'Ba Đình',
      ward: 'Điện Biên',
    });
    unapprovedVendorId = await createVendor(
      VendorStatus.PENDING,
      'Pending Vendor',
    );
    deletedVendorId = await createVendor(
      VendorStatus.APPROVED,
      'Deleted Vendor',
      {},
      new Date(),
    );
    ({ id: serviceCategoryId, slug: serviceCategorySlug } =
      await createCategory('Spa & Beauty', CategoryScope.SERVICE));
    ({ id: eventCategoryId } = await createCategory(
      'Workshop',
      CategoryScope.EVENT,
    ));
    ({ id: inactiveCategoryId } = await createCategory(
      'Inactive',
      CategoryScope.SERVICE,
      false,
    ));
    ({ id: deletedCategoryId } = await createCategory(
      'Deleted',
      CategoryScope.SERVICE,
      true,
      new Date(),
    ));
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.slot.deleteMany({ where: { serviceId: { in: serviceIds } } });
      await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
      await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  async function createVendor(
    status: VendorStatus,
    name: string,
    location: { province?: string; district?: string; ward?: string } = {},
    deletedAt?: Date,
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `search-${run}-${randomUUID()}@example.com`,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId: user.id,
        displayName: `${name} ${run}`,
        slug: `search-${run}-${randomUUID()}`,
        status,
        deletedAt,
        ...location,
      },
      select: { id: true },
    });
    vendorIds.push(vendor.id);
    return vendor.id;
  }

  async function createCategory(
    name: string,
    scope: CategoryScope,
    isActive = true,
    deletedAt?: Date,
  ): Promise<{ id: string; slug: string }> {
    const category = await prisma.category.create({
      data: {
        code: `S_${run}_${randomUUID().slice(0, 12)}`,
        name: `${name} ${run}`,
        slug: `search-${run}-${randomUUID()}`,
        scope,
        isActive,
        deletedAt,
      },
      select: { id: true, slug: true },
    });
    categoryIds.push(category.id);
    return category;
  }

  async function createService(options: {
    title: string;
    summary?: string;
    kind?: ServiceKind;
    status?: ServiceStatus;
    vendorId?: string;
    categoryId?: string;
    priceAmount?: bigint;
    publishedAt?: Date;
    deletedAt?: Date;
    thumbnailUrl?: string;
  }): Promise<string> {
    const service = await prisma.service.create({
      data: {
        vendorId: options.vendorId ?? vendorId,
        categoryId: options.categoryId ?? serviceCategoryId,
        kind: options.kind ?? ServiceKind.SERVICE,
        title: `${options.title} ${run}`,
        slug: `search-${run}-${randomUUID()}`,
        summary: options.summary,
        priceAmount: options.priceAmount ?? 200_000n,
        currency: 'VND',
        status: options.status ?? ServiceStatus.PUBLISHED,
        publishedAt: options.publishedAt ?? new Date(),
        deletedAt: options.deletedAt,
        thumbnailUrl: options.thumbnailUrl,
      },
      select: { id: true },
    });
    serviceIds.push(service.id);
    return service.id;
  }

  async function createSlot(
    serviceId: string,
    startDay: number,
    startHour: number,
    durationHours: number,
    options: {
      status?: SlotStatus;
      priceAmount?: bigint | null;
      deletedAt?: Date;
      past?: boolean;
    } = {},
  ) {
    const startAt = options.past
      ? new Date('2020-01-01T00:00:00.000Z')
      : at(startDay, startHour);
    const endAt = new Date(startAt.getTime() + durationHours * 3_600_000);
    return prisma.slot.create({
      data: {
        serviceId,
        startAt,
        endAt,
        capacity: 10,
        status: options.status ?? SlotStatus.OPEN,
        priceAmount: options.priceAmount,
        deletedAt: options.deletedAt,
      },
    });
  }

  function at(day: number, hour = 0): Date {
    const value = new Date(base);
    value.setUTCDate(value.getUTCDate() + day);
    value.setUTCHours(hour, 0, 0, 0);
    return value;
  }

  function ids(response: request.Response): string[] {
    return (response.body.items as Array<{ id: string }>).map(({ id }) => id);
  }

  it('enforces public visibility and returns card-safe pricing data', async () => {
    const visible = await createService({
      title: 'Visible massage',
      priceAmount: 250_000n,
      thumbnailUrl: 'https://example.com/fallback.jpg',
    });
    const next = await createSlot(visible, 1, 9, 1, { priceAmount: null });
    await createSlot(visible, 2, 9, 1, { priceAmount: 150_000n });
    await prisma.serviceImage.create({
      data: {
        serviceId: visible,
        provider: 'test',
        storageKey: `search/${run}/${randomUUID()}`,
        url: 'https://example.com/primary.jpg',
        mimeType: 'image/jpeg',
        fileSize: 10,
        isPrimary: true,
      },
    });

    const hiddenIds = await Promise.all([
      createService({ title: 'Draft only', status: ServiceStatus.DRAFT }),
      createService({ title: 'Hidden only', status: ServiceStatus.HIDDEN }),
      createService({ title: 'Archived only', status: ServiceStatus.ARCHIVED }),
      createService({ title: 'Soft deleted', deletedAt: new Date() }),
      createService({ title: 'Pending vendor', vendorId: unapprovedVendorId }),
      createService({ title: 'Deleted vendor', vendorId: deletedVendorId }),
      createService({ title: 'Inactive category', categoryId: inactiveCategoryId }),
      createService({ title: 'Deleted category', categoryId: deletedCategoryId }),
    ]);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/services?q=Visible%20massage%20${run}`)
      .expect(200);
    expect(ids(response)).toEqual([visible]);
    expect(response.body).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(response.body.items[0]).toMatchObject({
      thumbnail: { url: 'https://example.com/primary.jpg' },
      startingPrice: { amount: '150000', currency: 'VND' },
      nextAvailableSlot: { id: next.id },
      vendor: {
        province: 'Hà Nội',
        district: 'Ba Đình',
        ward: 'Điện Biên',
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /ownerUserId|taxCode|contactEmail|addressLine/i,
    );

    const catalog = await request(app.getHttpServer())
      .get(`/api/v1/services?q=${run}&limit=100`)
      .expect(200);
    for (const hiddenId of hiddenIds) expect(ids(catalog)).not.toContain(hiddenId);
  });

  it('searches trimmed title, summary, and Vendor name case-insensitively', async () => {
    const title = await createService({ title: 'Deep Tissue Discovery' });
    const summary = await createService({
      title: 'Body care',
      summary: `Aromatherapy signature ${run}`,
    });
    expect(
      ids(
        await request(app.getHttpServer())
          .get(`/api/v1/services?q=%20%20deep%20TISSUE%20discovery%20${run}%20`)
          .expect(200),
      ),
    ).toEqual([title]);
    expect(
      ids(
        await request(app.getHttpServer())
          .get(`/api/v1/services?q=AROMATHERAPY%20signature%20${run}`)
          .expect(200),
      ),
    ).toEqual([summary]);
    const vendorSearch = await request(app.getHttpServer())
      .get(`/api/v1/services?q=h%C3%A0%20n%E1%BB%99i%20wellness%20${run}&limit=100`)
      .expect(200);
    expect(ids(vendorSearch)).toEqual(expect.arrayContaining([title, summary]));
    await request(app.getHttpServer())
      .get('/api/v1/services?q=definitely-unrelated-search-value')
      .expect(200)
      .expect(({ body }) => expect(body.total).toBe(0));
    await request(app.getHttpServer())
      .get('/api/v1/services?q=x&search=x')
      .expect(400);
  });

  it('filters by category and kind and rejects ambiguous categories', async () => {
    const service = await createService({ title: 'Category service' });
    const event = await createService({
      title: 'Category event',
      kind: ServiceKind.EVENT,
      categoryId: eventCategoryId,
    });
    expect(
      ids(
        await request(app.getHttpServer())
          .get(`/api/v1/services?categoryId=${serviceCategoryId}&kind=SERVICE&q=Category`)
          .expect(200),
      ),
    ).toContain(service);
    expect(
      ids(
        await request(app.getHttpServer())
          .get(`/api/v1/services?kind=EVENT&q=Category%20event%20${run}`)
          .expect(200),
      ),
    ).toEqual([event]);
    await request(app.getHttpServer())
      .get(
        `/api/v1/services?categoryId=${serviceCategoryId}&categorySlug=${serviceCategorySlug}`,
      )
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/services?kind=INVALID')
      .expect(400);
  });

  it('uses OPEN future Slot interval intersection for date filtering', async () => {
    const overlap = await createService({ title: 'Overlap date target' });
    await createSlot(overlap, 4, 20, 8);
    const closed = await createService({ title: 'Closed date target' });
    await createSlot(closed, 5, 1, 1, { status: SlotStatus.CLOSED });
    const cancelled = await createService({ title: 'Cancelled date target' });
    await createSlot(cancelled, 5, 1, 1, { status: SlotStatus.CANCELLED });
    const deleted = await createService({ title: 'Deleted slot date target' });
    await createSlot(deleted, 5, 1, 1, { deletedAt: new Date() });
    const past = await createService({ title: 'Past date target' });
    await createSlot(past, 0, 0, 1, { past: true });
    const from = at(5, 0).toISOString();
    const to = at(5, 2).toISOString();
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/services?q=date%20target%20${run}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`,
      )
      .expect(200);
    expect(ids(response)).toEqual([overlap]);

    const fromOnly = await request(app.getHttpServer())
      .get(
        `/api/v1/services?q=Overlap%20date%20target%20${run}&from=${encodeURIComponent(at(5, 2).toISOString())}`,
      )
      .expect(200);
    expect(ids(fromOnly)).toEqual([overlap]);
    const toOnly = await request(app.getHttpServer())
      .get(
        `/api/v1/services?q=Overlap%20date%20target%20${run}&to=${encodeURIComponent(at(4, 21).toISOString())}`,
      )
      .expect(200);
    expect(ids(toOnly)).toEqual([overlap]);

    const boundary = await request(app.getHttpServer())
      .get(
        `/api/v1/services?q=Overlap%20date%20target%20${run}&from=${encodeURIComponent(at(5, 4).toISOString())}&to=${encodeURIComponent(at(5, 6).toISOString())}`,
      )
      .expect(200);
    expect(boundary.body.total).toBe(0);
    await request(app.getHttpServer())
      .get('/api/v1/services?from=not-a-date')
      .expect(400);
    await request(app.getHttpServer())
      .get(
        `/api/v1/services?from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`,
      )
      .expect(400);
  });

  it('filters inherited, overridden, and zero effective Slot prices', async () => {
    const inherited = await createService({
      title: 'Inherited pricing target',
      priceAmount: 180_000n,
    });
    await createSlot(inherited, 8, 8, 1, { priceAmount: null });
    const overridden = await createService({
      title: 'Override pricing target',
      priceAmount: 900_000n,
    });
    await createSlot(overridden, 8, 9, 1, { priceAmount: 220_000n });
    const free = await createService({
      title: 'Free pricing target',
      priceAmount: 500_000n,
    });
    await createSlot(free, 8, 10, 1, { priceAmount: 0n });

    const exact = await request(app.getHttpServer())
      .get(
        `/api/v1/services?q=pricing%20target%20${run}&minPrice=180000&maxPrice=180000&limit=100`,
      )
      .expect(200);
    expect(ids(exact)).toEqual([inherited]);
    const range = await request(app.getHttpServer())
      .get(
        `/api/v1/services?q=pricing%20target%20${run}&minPrice=200000&maxPrice=250000&limit=100`,
      )
      .expect(200);
    expect(ids(range)).toEqual([overridden]);
    const zero = await request(app.getHttpServer())
      .get(
        `/api/v1/services?q=Free%20pricing%20target%20${run}&minPrice=0&maxPrice=0`,
      )
      .expect(200);
    expect(ids(zero)).toEqual([free]);
    expect(zero.body.items[0].startingPrice).toEqual({
      amount: '0',
      currency: 'VND',
    });
    for (const query of [
      'minPrice=-1',
      'minPrice=1.5',
      'maxPrice=100,000',
      'minPrice=300&maxPrice=200',
      'maxPrice=99999999999999999999',
    ]) {
      await request(app.getHttpServer())
        .get(`/api/v1/services?${query}`)
        .expect(400);
    }
  });

  it('binds price to the same Slot that matches the requested date', async () => {
    const service = await createService({
      title: 'Date price combined target',
      priceAmount: 50_000n,
    });
    await createSlot(service, 10, 9, 1, { priceAmount: 100_000n });
    await createSlot(service, 14, 9, 1, { priceAmount: 300_000n });

    const query = (day: number) =>
      `/api/v1/services?q=Date%20price%20combined%20target%20${run}` +
      `&categorySlug=${serviceCategorySlug}&kind=SERVICE` +
      '&province=h%C3%A0%20n%E1%BB%99i&district=BA%20%C4%90%C3%8CNH' +
      `&from=${encodeURIComponent(at(day, 8).toISOString())}` +
      `&to=${encodeURIComponent(at(day, 11).toISOString())}` +
      '&minPrice=250000&maxPrice=350000';
    expect(ids(await request(app.getHttpServer()).get(query(14)).expect(200))).toEqual([
      service,
    ]);
    await request(app.getHttpServer())
      .get(query(10))
      .expect(200)
      .expect(({ body }) => expect(body.total).toBe(0));
  });

  it('filters Vendor province, district, and ward without case sensitivity', async () => {
    const service = await createService({ title: 'Location target' });
    expect(
      ids(
        await request(app.getHttpServer())
          .get(
            `/api/v1/services?q=Location%20target%20${run}&province=h%C3%A0%20n%E1%BB%99i&district=BA%20%C4%90%C3%8CNH&ward=%C4%91i%E1%BB%87n%20bi%C3%AAn`,
          )
          .expect(200),
      ),
    ).toEqual([service]);
    await request(app.getHttpServer())
      .get(`/api/v1/services?q=Location%20target%20${run}&province=%C4%90%C3%A0%20N%E1%BA%B5ng`)
      .expect(200)
      .expect(({ body }) => expect(body.total).toBe(0));
  });

  it('paginates distinct Services with stable ordering despite multiple Slots', async () => {
    const published = [3, 2, 1].map(
      (minutes) => new Date(Date.now() + minutes * 60_000),
    );
    const created: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const service = await createService({
        title: `Pagination target ${index}`,
        publishedAt: published[index],
      });
      created.push(service);
      await createSlot(service, 20 + index, 8, 1);
      await createSlot(service, 20 + index, 10, 1);
    }
    const first = await request(app.getHttpServer())
      .get(`/api/v1/services?q=Pagination%20target&limit=2&page=1`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(`/api/v1/services?q=Pagination%20target&limit=2&page=2`)
      .expect(200);
    expect(first.body).toMatchObject({ total: 3, totalPages: 2, page: 1, limit: 2 });
    expect(ids(first)).toEqual(created.slice(0, 2));
    expect(ids(second)).toEqual(created.slice(2));
    expect(new Set([...ids(first), ...ids(second)]).size).toBe(3);
    const repeated = await request(app.getHttpServer())
      .get(`/api/v1/services?q=Pagination%20target&limit=2&page=1`)
      .expect(200);
    expect(ids(repeated)).toEqual(ids(first));
    await request(app.getHttpServer()).get('/api/v1/services?limit=101').expect(400);
  });
});
