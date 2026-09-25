import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ServiceKind,
  ServiceStatus,
  SlotStatus,
  VendorStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import {
  parseMoneyAmount,
  serializeMoneyAmount,
} from '../pricing/money.utils.js';
import { PricingService } from '../pricing/pricing.service.js';
import type { PricingSource } from '../pricing/pricing.types.js';
import type { CreateSlotDto } from './dto/create-slot.dto.js';
import type { PublicSlotQueryDto } from './dto/public-slot-query.dto.js';
import type { UpdateSlotDto } from './dto/update-slot.dto.js';
import type { VendorSlotQueryDto } from './dto/vendor-slot-query.dto.js';

const vendorSlotSelect = {
  id: true,
  serviceId: true,
  startAt: true,
  endAt: true,
  capacity: true,
  priceAmount: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  service: { select: { priceAmount: true, currency: true } },
} as const satisfies Prisma.SlotSelect;

const publicSlotSelect = {
  id: true,
  startAt: true,
  endAt: true,
  capacity: true,
  priceAmount: true,
  status: true,
  service: { select: { priceAmount: true, currency: true } },
} as const satisfies Prisma.SlotSelect;

type VendorSlotRecord = Prisma.SlotGetPayload<{
  select: typeof vendorSlotSelect;
}>;

type PublicSlotRecord = Prisma.SlotGetPayload<{
  select: typeof publicSlotSelect;
}>;

type EffectivePriceResponse = {
  amount: string;
  currency: string;
  source: PricingSource;
};

export type SlotResponse = Omit<VendorSlotRecord, 'priceAmount' | 'service'> & {
  priceAmount: string | null;
  effectivePrice: EffectivePriceResponse;
};

type PublicSlotResponse = Omit<PublicSlotRecord, 'priceAmount' | 'service'> & {
  price: EffectivePriceResponse;
};

type SlotClient = Pick<Prisma.TransactionClient, 'service' | 'slot'>;

type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async create(
    serviceId: string,
    ownerUserId: string,
    dto: CreateSlotDto,
  ): Promise<SlotResponse> {
    const startAt = this.parseTimestamp(dto.startAt, 'startAt');
    const endAt = this.parseTimestamp(dto.endAt, 'endAt');
    const priceAmount =
      dto.priceAmount == null ? null : parseMoneyAmount(dto.priceAmount);

    return this.prisma.$transaction(async (transaction) => {
      await this.lockService(transaction, serviceId);
      const service = await this.assertManageableService(
        transaction,
        serviceId,
        ownerUserId,
        true,
      );
      this.validateTimeRange(startAt, endAt, true);
      this.validateDuration(service, startAt, endAt);
      await this.assertNoOverlap(transaction, serviceId, startAt, endAt);

      const slot = await transaction.slot.create({
        data: {
          serviceId,
          startAt,
          endAt,
          capacity: dto.capacity,
          priceAmount,
          status: SlotStatus.OPEN,
        },
        select: vendorSlotSelect,
      });
      return this.serializeVendorSlot(slot);
    });
  }

  async listForVendor(
    serviceId: string,
    ownerUserId: string,
    query: VendorSlotQueryDto,
  ): Promise<Paginated<SlotResponse>> {
    await this.assertManageableService(
      this.prisma,
      serviceId,
      ownerUserId,
      false,
    );
    const { from, to } = this.parseRange(query.from, query.to);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SlotWhereInput = {
      serviceId,
      deletedAt: null,
      status: query.status,
      ...this.rangeWhere(from, to),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.slot.findMany({
        where,
        select: vendorSlotSelect,
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.slot.count({ where }),
    ]);
    return this.paginate(
      items.map((slot) => this.serializeVendorSlot(slot)),
      page,
      limit,
      total,
    );
  }

  async findForVendor(
    serviceId: string,
    slotId: string,
    ownerUserId: string,
  ): Promise<SlotResponse> {
    await this.assertManageableService(
      this.prisma,
      serviceId,
      ownerUserId,
      false,
    );
    return this.serializeVendorSlot(
      await this.findSlot(this.prisma, serviceId, slotId),
    );
  }

  async update(
    serviceId: string,
    slotId: string,
    ownerUserId: string,
    dto: UpdateSlotDto,
  ): Promise<SlotResponse> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockService(transaction, serviceId);
      const service = await this.assertManageableService(
        transaction,
        serviceId,
        ownerUserId,
        true,
      );
      const slot = await this.findSlot(transaction, serviceId, slotId);
      if (slot.status === SlotStatus.CANCELLED) {
        throw new ConflictException('Cancelled Slot cannot be updated');
      }

      const hasChanges =
        dto.startAt !== undefined ||
        dto.endAt !== undefined ||
        dto.capacity !== undefined ||
        dto.priceAmount !== undefined;
      const now = new Date();
      if (hasChanges && now >= slot.startAt) {
        throw new ConflictException('Started Slot cannot be updated');
      }
      if (!hasChanges) return this.serializeVendorSlot(slot);

      const startAt =
        dto.startAt === undefined
          ? slot.startAt
          : this.parseTimestamp(dto.startAt, 'startAt');
      const endAt =
        dto.endAt === undefined
          ? slot.endAt
          : this.parseTimestamp(dto.endAt, 'endAt');
      const timeChanged = dto.startAt !== undefined || dto.endAt !== undefined;
      if (timeChanged) {
        this.validateTimeRange(startAt, endAt, true);
        this.validateDuration(service, startAt, endAt);
        await this.assertNoOverlap(
          transaction,
          serviceId,
          startAt,
          endAt,
          slotId,
        );
      }

      const updated = await transaction.slot.update({
        where: { id: slotId },
        data: {
          startAt: dto.startAt === undefined ? undefined : startAt,
          endAt: dto.endAt === undefined ? undefined : endAt,
          capacity: dto.capacity,
          priceAmount:
            dto.priceAmount === undefined
              ? undefined
              : dto.priceAmount === null
                ? null
                : parseMoneyAmount(dto.priceAmount),
        },
        select: vendorSlotSelect,
      });
      return this.serializeVendorSlot(updated);
    });
  }

  close(
    serviceId: string,
    slotId: string,
    ownerUserId: string,
  ): Promise<SlotResponse> {
    return this.transition(
      serviceId,
      slotId,
      ownerUserId,
      [SlotStatus.OPEN],
      SlotStatus.CLOSED,
      false,
      false,
    );
  }

  open(
    serviceId: string,
    slotId: string,
    ownerUserId: string,
  ): Promise<SlotResponse> {
    return this.transition(
      serviceId,
      slotId,
      ownerUserId,
      [SlotStatus.CLOSED],
      SlotStatus.OPEN,
      true,
      true,
    );
  }

  cancel(
    serviceId: string,
    slotId: string,
    ownerUserId: string,
  ): Promise<SlotResponse> {
    return this.transition(
      serviceId,
      slotId,
      ownerUserId,
      [SlotStatus.OPEN, SlotStatus.CLOSED],
      SlotStatus.CANCELLED,
      false,
      false,
    );
  }

  async softDelete(
    serviceId: string,
    slotId: string,
    ownerUserId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await this.lockService(transaction, serviceId);
      await this.assertManageableService(
        transaction,
        serviceId,
        ownerUserId,
        false,
      );
      const slot = await this.findSlot(transaction, serviceId, slotId);
      if (slot.startAt <= new Date()) {
        throw new ConflictException('Started Slot cannot be deleted');
      }
      const result = await transaction.slot.updateMany({
        where: { id: slotId, serviceId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (result.count !== 1) {
        throw new ConflictException('Slot changed concurrently');
      }
    });
  }

  async listPublic(
    serviceId: string,
    query: PublicSlotQueryDto,
  ): Promise<Paginated<PublicSlotResponse>> {
    await this.assertPublicService(serviceId);
    const { from, to } = this.parseRange(query.from, query.to);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SlotWhereInput = {
      serviceId,
      status: SlotStatus.OPEN,
      deletedAt: null,
      AND: [
        { endAt: { gt: new Date() } },
        ...(from ? [{ endAt: { gt: from } }] : []),
        ...(to ? [{ startAt: { lt: to } }] : []),
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.slot.findMany({
        where,
        select: publicSlotSelect,
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.slot.count({ where }),
    ]);
    return this.paginate(
      items.map((slot) => this.serializePublicSlot(slot)),
      page,
      limit,
      total,
    );
  }

  private async transition(
    serviceId: string,
    slotId: string,
    ownerUserId: string,
    allowed: SlotStatus[],
    target: SlotStatus,
    requireFuture: boolean,
    requireActiveService: boolean,
  ): Promise<SlotResponse> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockService(transaction, serviceId);
      await this.assertManageableService(
        transaction,
        serviceId,
        ownerUserId,
        requireActiveService,
      );
      const slot = await this.findSlot(transaction, serviceId, slotId);
      if (!allowed.includes(slot.status)) {
        throw new ConflictException(
          `Slot in ${slot.status} status cannot transition to ${target}`,
        );
      }
      if (requireFuture && slot.startAt <= new Date()) {
        throw new ConflictException('Started Slot cannot be reopened');
      }
      const result = await transaction.slot.updateMany({
        where: {
          id: slotId,
          serviceId,
          status: slot.status,
          deletedAt: null,
        },
        data: { status: target },
      });
      if (result.count !== 1) {
        throw new ConflictException('Slot status changed concurrently');
      }
      return this.serializeVendorSlot(
        await this.findSlot(transaction, serviceId, slotId),
      );
    });
  }

  private async assertManageableService(
    client: SlotClient,
    serviceId: string,
    ownerUserId: string,
    rejectArchived: boolean,
  ) {
    const service = await client.service.findFirst({
      where: { id: serviceId, deletedAt: null },
      select: {
        kind: true,
        durationMinutes: true,
        status: true,
        vendor: {
          select: { ownerUserId: true, status: true, deletedAt: true },
        },
      },
    });
    if (!service) throw new NotFoundException('Service not found');
    if (
      service.vendor.ownerUserId !== ownerUserId ||
      service.vendor.status !== VendorStatus.APPROVED ||
      service.vendor.deletedAt
    ) {
      throw new ForbiddenException('Approved owning Vendor is required');
    }
    if (rejectArchived && service.status === ServiceStatus.ARCHIVED) {
      throw new ConflictException('Archived Service cannot manage Slot data');
    }
    return service;
  }

  private async assertPublicService(serviceId: string): Promise<void> {
    const service = await this.prisma.service.findFirst({
      where: {
        id: serviceId,
        status: ServiceStatus.PUBLISHED,
        deletedAt: null,
        vendor: { status: VendorStatus.APPROVED, deletedAt: null },
      },
      select: { id: true },
    });
    if (!service) throw new NotFoundException('Service not found');
  }

  private async findSlot(
    client: SlotClient,
    serviceId: string,
    slotId: string,
  ): Promise<VendorSlotRecord> {
    const slot = await client.slot.findFirst({
      where: { id: slotId, serviceId, deletedAt: null },
      select: vendorSlotSelect,
    });
    if (!slot) throw new NotFoundException('Slot not found');
    return slot;
  }

  private serializeVendorSlot(slot: VendorSlotRecord): SlotResponse {
    const { service, priceAmount, ...rest } = slot;
    const effective = this.pricing.resolveEffectivePrice({
      slotPriceAmount: priceAmount,
      servicePriceAmount: service.priceAmount,
      currency: service.currency,
    });
    return {
      ...rest,
      priceAmount:
        priceAmount === null ? null : serializeMoneyAmount(priceAmount),
      effectivePrice: {
        amount: serializeMoneyAmount(effective.unitPriceAmount),
        currency: effective.currency,
        source: effective.source,
      },
    };
  }

  private serializePublicSlot(slot: PublicSlotRecord): PublicSlotResponse {
    const { service, priceAmount, ...rest } = slot;
    const effective = this.pricing.resolveEffectivePrice({
      slotPriceAmount: priceAmount,
      servicePriceAmount: service.priceAmount,
      currency: service.currency,
    });
    return {
      ...rest,
      price: {
        amount: serializeMoneyAmount(effective.unitPriceAmount),
        currency: effective.currency,
        source: effective.source,
      },
    };
  }

  private validateTimeRange(
    startAt: Date,
    endAt: Date,
    requireFuture: boolean,
  ): void {
    if (startAt >= endAt) {
      throw new BadRequestException('startAt must be before endAt');
    }
    if (requireFuture && startAt <= new Date()) {
      throw new BadRequestException('startAt must be in the future');
    }
  }

  private validateDuration(
    service: { kind: ServiceKind; durationMinutes: number | null },
    startAt: Date,
    endAt: Date,
  ): void {
    if (
      service.kind === ServiceKind.SERVICE &&
      service.durationMinutes !== null &&
      endAt.getTime() - startAt.getTime() !== service.durationMinutes * 60_000
    ) {
      throw new BadRequestException(
        `Slot duration must equal ${service.durationMinutes} minutes`,
      );
    }
  }

  private async assertNoOverlap(
    client: SlotClient,
    serviceId: string,
    startAt: Date,
    endAt: Date,
    excludeSlotId?: string,
  ): Promise<void> {
    const overlap = await client.slot.findFirst({
      where: {
        serviceId,
        id: excludeSlotId ? { not: excludeSlotId } : undefined,
        deletedAt: null,
        status: { not: SlotStatus.CANCELLED },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (overlap) {
      throw new ConflictException('Slot overlaps an existing active Slot');
    }
  }

  private parseTimestamp(value: string, field: string): Date {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO timestamp`);
    }
    return timestamp;
  }

  private parseRange(from?: string, to?: string): { from?: Date; to?: Date } {
    const parsedFrom = from ? this.parseTimestamp(from, 'from') : undefined;
    const parsedTo = to ? this.parseTimestamp(to, 'to') : undefined;
    if (parsedFrom && parsedTo && parsedFrom >= parsedTo) {
      throw new BadRequestException('from must be before to');
    }
    return { from: parsedFrom, to: parsedTo };
  }

  private rangeWhere(from?: Date, to?: Date): Prisma.SlotWhereInput {
    return {
      AND: [
        ...(from ? [{ endAt: { gt: from } }] : []),
        ...(to ? [{ startAt: { lt: to } }] : []),
      ],
    };
  }

  private paginate<T>(
    items: T[],
    page: number,
    limit: number,
    total: number,
  ): Paginated<T> {
    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async lockService(
    transaction: Prisma.TransactionClient,
    serviceId: string,
  ): Promise<void> {
    const service = await transaction.service.findUnique({
      where: { id: serviceId },
      select: { updatedAt: true },
    });
    if (!service) throw new NotFoundException('Service not found');
    await transaction.service.update({
      where: { id: serviceId },
      data: { updatedAt: service.updatedAt },
      select: { id: true },
    });
  }
}
