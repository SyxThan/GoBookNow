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
  VendorStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { CreateServiceDto } from './dto/create-service.dto.js';
import type { PublicServiceQueryDto } from './dto/public-service-query.dto.js';
import type { UpdateServiceDto } from './dto/update-service.dto.js';
import type { VendorServiceQueryDto } from './dto/vendor-service-query.dto.js';
import { addServiceSlugSuffix, createServiceSlug } from './service-slug.js';

const MAX_PRICE_AMOUNT = 9_223_372_036_854_775_807n;

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

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    ownerUserId: string,
    dto: CreateServiceDto,
  ): Promise<ServiceResponse> {
    const vendorId = await this.resolveApprovedVendorId(ownerUserId);
    await this.assertCategory(dto.categoryId, dto.kind);
    const priceAmount = this.parsePriceAmount(dto.priceAmount);
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
        : this.parsePriceAmount(dto.priceAmount);

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
    if (service.priceAmount < 0n || service.priceAmount > MAX_PRICE_AMOUNT) {
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

  listPublic(query: PublicServiceQueryDto): Promise<PaginatedServices> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ServiceWhereInput = {
      deletedAt: null,
      status: ServiceStatus.PUBLISHED,
      kind: query.kind,
      categoryId: query.categoryId,
      vendorId: query.vendorId,
      category: {
        slug: query.categorySlug,
        isActive: true,
        deletedAt: null,
      },
      vendor: { status: VendorStatus.APPROVED, deletedAt: null },
      ...this.searchWhere(query.search),
    };
    return this.list(where, page, limit, [
      { publishedAt: 'desc' },
      { id: 'desc' },
    ]);
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

  private parsePriceAmount(value: string): bigint {
    const amount = BigInt(value);
    if (amount < 0n || amount > MAX_PRICE_AMOUNT) {
      throw new BadRequestException(
        'priceAmount is outside the supported range',
      );
    }
    return amount;
  }

  private searchWhere(search?: string): Prisma.ServiceWhereInput {
    if (!search) return {};
    return {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
      ],
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
    return { ...service, priceAmount: service.priceAmount.toString() };
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
