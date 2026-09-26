import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CategoryScope,
  Prisma,
  ServiceKind,
  ServiceStatus,
  SlotStatus,
  VendorStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import {
  MAX_MONEY_AMOUNT,
  parseMoneyAmount,
  serializeMoneyAmount,
} from '../pricing/money.utils.js';
import type { CreateServiceDto } from './dto/create-service.dto.js';
import type { PublicServiceQueryDto } from './dto/public-service-query.dto.js';
import type { UpdateServiceDto } from './dto/update-service.dto.js';
import type { VendorServiceQueryDto } from './dto/vendor-service-query.dto.js';
import { addServiceSlugSuffix, createServiceSlug } from './service-slug.js';

const categorySelect = {
  id: true,
  code: true,
  name: true,
  slug: true,
} as const satisfies Prisma.CategorySelect;

const publicVendorSelect = {
  id: true,
  displayName: true,
  slug: true,
  province: true,
  district: true,
  ward: true,
} as const satisfies Prisma.VendorSelect;

const publicImageSelect = {
  id: true,
  url: true,
  width: true,
  height: true,
  sortOrder: true,
  isPrimary: true,
} as const satisfies Prisma.ServiceImageSelect;

const serviceResponseSelect = {
  id: true,
  kind: true,
  title: true,
  slug: true,
  summary: true,
  description: true,
  thumbnailUrl: true,
  priceAmount: true,
  currency: true,
  durationMinutes: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: categorySelect },
  vendor: { select: publicVendorSelect },
  images: {
    select: publicImageSelect,
    orderBy: [
      { isPrimary: 'desc' },
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  },
} as const satisfies Prisma.ServiceSelect;

type ServiceRecord = Prisma.ServiceGetPayload<{
  select: typeof serviceResponseSelect;
}>;

export type ServiceResponse = Omit<ServiceRecord, 'priceAmount'> & {
  priceAmount: string;
};

type PaginatedServices = {
  items: ServiceResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const searchSlotSelect = {
  id: true,
  serviceId: true,
  startAt: true,
  endAt: true,
  priceAmount: true,
} as const satisfies Prisma.SlotSelect;

type SearchSlotRecord = Prisma.SlotGetPayload<{
  select: typeof searchSlotSelect;
}>;

export type PublicServiceSearchItem = ServiceResponse & {
  thumbnail: { url: string } | null;
  startingPrice: { amount: string; currency: string };
  nextAvailableSlot: {
    id: string;
    startAt: Date;
    endAt: Date;
  } | null;
};

type PaginatedPublicServices = Omit<PaginatedServices, 'items'> & {
  items: PublicServiceSearchItem[];
};

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    ownerUserId: string,
    dto: CreateServiceDto,
  ): Promise<ServiceResponse> {
    const vendorId = await this.resolveApprovedVendorId(ownerUserId);
    await this.assertCategory(dto.categoryId, dto.kind);
    const priceAmount = parseMoneyAmount(dto.priceAmount);
    const baseSlug = createServiceSlug(dto.title);
    let slug = await this.findAvailableSlug(baseSlug);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const service = await this.prisma.service.create({
          data: {
            vendorId,
            categoryId: dto.categoryId,
            kind: dto.kind,
            title: dto.title,
            slug,
            summary: dto.summary,
            description: dto.description,
            thumbnailUrl: dto.thumbnailUrl,
            priceAmount,
            currency: 'VND',
            durationMinutes: dto.durationMinutes,
            status: ServiceStatus.DRAFT,
          },
          select: serviceResponseSelect,
        });
        return this.serialize(service);
      } catch (error: unknown) {
        if (!this.isUniqueConstraintError(error)) throw error;
        slug = addServiceSlugSuffix(baseSlug, randomUUID().slice(0, 8));
      }
    }

    throw new ConflictException('Could not generate a unique Service slug');
  }

  async listForVendor(
    ownerUserId: string,
    query: VendorServiceQueryDto,
  ): Promise<PaginatedServices> {
    const vendorId = await this.resolveApprovedVendorId(ownerUserId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ServiceWhereInput = {
      vendorId,
      deletedAt: null,
      status: query.status,
      kind: query.kind,
      categoryId: query.categoryId,
      ...this.searchWhere(query.search),
    };
    return this.list(where, page, limit, [
      { updatedAt: 'desc' },
      { id: 'desc' },
    ]);
  }

  async findForVendor(serviceId: string): Promise<ServiceResponse> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, deletedAt: null },
      select: serviceResponseSelect,
    });
    if (!service) throw new NotFoundException('Service not found');
    return this.serialize(service);
  }

  async update(
    serviceId: string,
    dto: UpdateServiceDto,
  ): Promise<ServiceResponse> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, deletedAt: null },
      select: { status: true, kind: true, categoryId: true },
    });
    if (!service) throw new NotFoundException('Service not found');
    if (service.status === ServiceStatus.ARCHIVED) {
      throw new ConflictException('Archived Service cannot be updated');
    }

    const kind = dto.kind ?? service.kind;
    const categoryId = dto.categoryId ?? service.categoryId;
    await this.assertCategory(categoryId, kind);
    const priceAmount =
      dto.priceAmount === undefined
        ? undefined
        : parseMoneyAmount(dto.priceAmount);

    await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        categoryId: dto.categoryId,
        kind: dto.kind,
        title: dto.title,
        summary: dto.summary,
        description: dto.description,
        thumbnailUrl: dto.thumbnailUrl,
        priceAmount,
        durationMinutes: dto.durationMinutes,
      },
    });
    return this.findForVendor(serviceId);
  }

  async publish(serviceId: string): Promise<ServiceResponse> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, deletedAt: null },
      select: {
        status: true,
        kind: true,
        title: true,
        categoryId: true,
        priceAmount: true,
        publishedAt: true,
        vendor: { select: { status: true, deletedAt: true } },
      },
    });
    if (!service) throw new NotFoundException('Service not found');
    if (
      service.status !== ServiceStatus.DRAFT &&
      service.status !== ServiceStatus.HIDDEN
    ) {
      throw new ConflictException(
        `Service in ${service.status} status cannot be published`,
      );
    }
    if (
      service.vendor.status !== VendorStatus.APPROVED ||
      service.vendor.deletedAt
    ) {
      throw new ForbiddenException('Approved Vendor is required');
    }
    if (service.title.trim().length < 3 || service.title.length > 160) {
      throw new BadRequestException('Service title is invalid');
    }
    if (service.priceAmount < 0n || service.priceAmount > MAX_MONEY_AMOUNT) {
      throw new BadRequestException('Service priceAmount is invalid');
    }
    await this.assertCategory(service.categoryId, service.kind);

    await this.transition(
      serviceId,
      service.status,
      ServiceStatus.PUBLISHED,
      service.publishedAt ? {} : { publishedAt: new Date() },
    );
    return this.findForVendor(serviceId);
  }

  async hide(serviceId: string): Promise<ServiceResponse> {
    await this.transitionFromAllowed(
      serviceId,
      [ServiceStatus.PUBLISHED],
      ServiceStatus.HIDDEN,
    );
    return this.findForVendor(serviceId);
  }

  async archive(serviceId: string): Promise<ServiceResponse> {
    await this.transitionFromAllowed(
      serviceId,
      [ServiceStatus.DRAFT, ServiceStatus.HIDDEN],
      ServiceStatus.ARCHIVED,
    );
    return this.findForVendor(serviceId);
  }

  async softDelete(serviceId: string): Promise<void> {
    const result = await this.prisma.service.updateMany({
      where: {
        id: serviceId,
        deletedAt: null,
        status: { in: [ServiceStatus.DRAFT, ServiceStatus.HIDDEN] },
      },
      data: { deletedAt: new Date() },
    });
    if (result.count === 1) return;

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, deletedAt: null },
      select: { status: true },
    });
    if (!service) throw new NotFoundException('Service not found');
    throw new ConflictException(
      `Service in ${service.status} status cannot be deleted`,
    );
  }

  async listPublic(
    query: PublicServiceQueryDto,
  ): Promise<PaginatedPublicServices> {
    if (query.categoryId && query.categorySlug) {
      throw new BadRequestException(
        'categoryId and categorySlug cannot be used together',
      );
    }
    if (query.q && query.search) {
      throw new BadRequestException('q and search cannot be used together');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const now = new Date();
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from >= to) {
      throw new BadRequestException('from must be before to');
    }

    const minPrice = this.parseSearchPrice(query.minPrice, 'minPrice');
    const maxPrice = this.parseSearchPrice(query.maxPrice, 'maxPrice');
    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      throw new BadRequestException('minPrice must not exceed maxPrice');
    }

    const slotWhere = this.searchSlotWhere(
      now,
      from,
      to,
      minPrice,
      maxPrice,
    );
    const filtersBySlot =
      from !== undefined ||
      to !== undefined ||
      minPrice !== undefined ||
      maxPrice !== undefined;
    const where: Prisma.ServiceWhereInput = {
      deletedAt: null,
      status: ServiceStatus.PUBLISHED,
      kind: query.kind,
      categoryId: query.categoryId,
      vendorId: query.vendorId,
      category: {
        slug: query.categorySlug || undefined,
        isActive: true,
        deletedAt: null,
      },
      vendor: {
        status: VendorStatus.APPROVED,
        deletedAt: null,
        province: query.province
          ? { contains: query.province, mode: 'insensitive' }
          : undefined,
        district: query.district
          ? { contains: query.district, mode: 'insensitive' }
          : undefined,
        ward: query.ward
          ? { contains: query.ward, mode: 'insensitive' }
          : undefined,
      },
      slots: filtersBySlot ? { some: slotWhere } : undefined,
      ...this.searchWhere(query.q || query.search),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.service.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: serviceResponseSelect,
      }),
      this.prisma.service.count({ where }),
    ]);

    const slots = rows.length
      ? await this.prisma.slot.findMany({
          where: {
            serviceId: { in: rows.map(({ id }) => id) },
            ...this.searchSlotWhere(now, from, to, minPrice, maxPrice),
          },
          select: searchSlotSelect,
          orderBy: [
            { serviceId: 'asc' },
            { startAt: 'asc' },
            { id: 'asc' },
          ],
        })
      : [];
    const slotsByService = this.groupSearchSlots(slots);

    return {
      items: rows.map((service) =>
        this.serializePublicSearchItem(
          service,
          slotsByService.get(service.id) ?? [],
        ),
      ),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findPublicBySlug(slug: string): Promise<ServiceResponse> {
    const service = await this.prisma.service.findFirst({
      where: {
        slug,
        status: ServiceStatus.PUBLISHED,
        deletedAt: null,
        vendor: { status: VendorStatus.APPROVED, deletedAt: null },
        category: { isActive: true, deletedAt: null },
      },
      select: serviceResponseSelect,
    });
    if (!service) throw new NotFoundException('Service not found');
    return this.serialize(service);
  }

  private async list(
    where: Prisma.ServiceWhereInput,
    page: number,
    limit: number,
    orderBy: Prisma.ServiceOrderByWithRelationInput[],
  ): Promise<PaginatedServices> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.service.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: serviceResponseSelect,
      }),
      this.prisma.service.count({ where }),
    ]);
    return {
      items: rows.map((service) => this.serialize(service)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async transitionFromAllowed(
    serviceId: string,
    allowed: ServiceStatus[],
    toStatus: ServiceStatus,
  ): Promise<void> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, deletedAt: null },
      select: { status: true },
    });
    if (!service) throw new NotFoundException('Service not found');
    if (!allowed.includes(service.status)) {
      throw new ConflictException(
        `Service in ${service.status} status cannot transition to ${toStatus}`,
      );
    }
    await this.transition(serviceId, service.status, toStatus);
  }

  private async transition(
    serviceId: string,
    fromStatus: ServiceStatus,
    toStatus: ServiceStatus,
    extra: Prisma.ServiceUpdateManyMutationInput = {},
  ): Promise<void> {
    const result = await this.prisma.service.updateMany({
      where: { id: serviceId, status: fromStatus, deletedAt: null },
      data: { status: toStatus, ...extra },
    });
    if (result.count !== 1) {
      throw new ConflictException('Service status changed concurrently');
    }
  }

  private async resolveApprovedVendorId(ownerUserId: string): Promise<string> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { ownerUserId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (
      !vendor ||
      vendor.status !== VendorStatus.APPROVED ||
      vendor.deletedAt
    ) {
      throw new ForbiddenException('Approved Vendor is required');
    }
    return vendor.id;
  }

  private async assertCategory(
    categoryId: string,
    kind: ServiceKind,
  ): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, isActive: true, deletedAt: null },
      select: { scope: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    const expectedScope =
      kind === ServiceKind.SERVICE
        ? CategoryScope.SERVICE
        : CategoryScope.EVENT;
    if (category.scope !== expectedScope) {
      throw new BadRequestException(
        `Category scope ${category.scope} is incompatible with Service kind ${kind}`,
      );
    }
  }

  private searchWhere(search?: string): Prisma.ServiceWhereInput {
    if (!search) return {};
    return {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
        {
          vendor: {
            displayName: { contains: search, mode: 'insensitive' },
          },
        },
      ],
    };
  }

  private searchSlotWhere(
    now: Date,
    from?: Date,
    to?: Date,
    minPrice?: bigint,
    maxPrice?: bigint,
  ): Prisma.SlotWhereInput {
    const endAfter = from && from > now ? from : now;
    const priceBounds: Prisma.BigIntFilter = {
      gte: minPrice,
      lte: maxPrice,
    };
    const hasPrice = minPrice !== undefined || maxPrice !== undefined;

    return {
      status: SlotStatus.OPEN,
      deletedAt: null,
      endAt: { gt: endAfter },
      startAt: to ? { lt: to } : undefined,
      OR: hasPrice
        ? [
            {
              priceAmount: {
                not: null,
                gte: minPrice,
                lte: maxPrice,
              },
            },
            {
              priceAmount: null,
              service: { priceAmount: priceBounds },
            },
          ]
        : undefined,
    };
  }

  private parseSearchPrice(
    value: string | undefined,
    field: 'minPrice' | 'maxPrice',
  ): bigint | undefined {
    if (value === undefined) return undefined;
    const amount = BigInt(value);
    if (amount > MAX_MONEY_AMOUNT) {
      throw new BadRequestException(`${field} is outside the supported range`);
    }
    return amount;
  }

  private groupSearchSlots(
    slots: SearchSlotRecord[],
  ): Map<string, SearchSlotRecord[]> {
    const grouped = new Map<string, SearchSlotRecord[]>();
    for (const slot of slots) {
      const serviceSlots = grouped.get(slot.serviceId);
      if (serviceSlots) serviceSlots.push(slot);
      else grouped.set(slot.serviceId, [slot]);
    }
    return grouped;
  }

  private serializePublicSearchItem(
    service: ServiceRecord,
    slots: SearchSlotRecord[],
  ): PublicServiceSearchItem {
    let startingPrice = service.priceAmount;
    if (slots.length > 0) {
      startingPrice = slots.reduce((minimum, slot) => {
        const effectivePrice = slot.priceAmount ?? service.priceAmount;
        return effectivePrice < minimum ? effectivePrice : minimum;
      }, slots[0].priceAmount ?? service.priceAmount);
    }
    const imageUrl = service.images[0]?.url ?? service.thumbnailUrl;
    const nextSlot = slots[0];

    return {
      ...this.serialize(service),
      thumbnail: imageUrl ? { url: imageUrl } : null,
      startingPrice: {
        amount: serializeMoneyAmount(startingPrice),
        currency: service.currency,
      },
      nextAvailableSlot: nextSlot
        ? {
            id: nextSlot.id,
            startAt: nextSlot.startAt,
            endAt: nextSlot.endAt,
          }
        : null,
    };
  }

  private async findAvailableSlug(baseSlug: string): Promise<string> {
    const existing = await this.prisma.service.findUnique({
      where: { slug: baseSlug },
      select: { id: true },
    });
    return existing
      ? addServiceSlugSuffix(baseSlug, randomUUID().slice(0, 8))
      : baseSlug;
  }

  private serialize(service: ServiceRecord): ServiceResponse {
    return {
      ...service,
      priceAmount: serializeMoneyAmount(service.priceAmount),
    };
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
