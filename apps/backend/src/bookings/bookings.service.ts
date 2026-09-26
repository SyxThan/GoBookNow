import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  Prisma,
  ReservationStatus,
  ServiceStatus,
  SlotStatus,
  VendorStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { BookingCodeService } from './booking-code.service.js';
import {
  bookingHoldResponseSelect,
  mapBookingHoldResponse,
  type BookingHoldRecord,
} from './booking.mapper.js';
import { CapacityService } from './capacity.service.js';
import type { BookingResponseDto } from './dto/booking-response.dto.js';
import type { CreateBookingHoldDto } from './dto/create-booking-hold.dto.js';

const BOOKING_CODE_MAX_ATTEMPTS = 5;
const HOLD_TTL_MINUTES_MIN = 1;
const HOLD_TTL_MINUTES_MAX = 60;

const holdSlotSelect = {
  id: true,
  serviceId: true,
  startAt: true,
  endAt: true,
  capacity: true,
  priceAmount: true,
  status: true,
  deletedAt: true,
  service: {
    select: {
      id: true,
      vendorId: true,
      title: true,
      priceAmount: true,
      currency: true,
      status: true,
      deletedAt: true,
      vendor: { select: { id: true, status: true, deletedAt: true } },
      category: { select: { isActive: true, deletedAt: true } },
    },
  },
} as const satisfies Prisma.SlotSelect;

type HoldSlotRecord = Prisma.SlotGetPayload<{
  select: typeof holdSlotSelect;
}>;

type NormalizedHoldItem = Readonly<{
  slotId: string;
  quantity: number;
}>;

type BookingHoldResult = Readonly<{
  statusCode: 200 | 201;
  body: BookingResponseDto;
}>;

type DbNowRow = { now: Date };

@Injectable()
export class BookingsService {
  private readonly holdTtlMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly capacity: CapacityService,
    private readonly pricing: PricingService,
    private readonly bookingCodes: BookingCodeService,
  ) {
    this.holdTtlMinutes = this.parseHoldTtlMinutes(
      this.config.get<string>('BOOKING_HOLD_TTL_MINUTES') ?? '10',
    );
  }

  async hold(
    customerId: string,
    idempotencyKey: string,
    dto: CreateBookingHoldDto,
  ): Promise<BookingHoldResult> {
    const items = this.normalizeItems(dto);

    const existing = await this.findIdempotentBooking(
      this.prisma,
      customerId,
      idempotencyKey,
    );
    if (existing) {
      return this.resolveExistingIdempotentBooking(existing, items);
    }

    for (let attempt = 0; attempt < BOOKING_CODE_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) =>
          this.createHoldInTransaction(
            transaction,
            customerId,
            idempotencyKey,
            items,
          ),
        );
      } catch (error: unknown) {
        if (!this.isUniqueConstraintError(error)) throw error;

        const existingAfterConflict = await this.findIdempotentBooking(
          this.prisma,
          customerId,
          idempotencyKey,
        );
        if (existingAfterConflict) {
          return this.resolveExistingIdempotentBooking(
            existingAfterConflict,
            items,
          );
        }

        if (attempt === BOOKING_CODE_MAX_ATTEMPTS - 1) {
          throw new ConflictException({
            code: 'BOOKING_HOLD_FAILED',
            message: 'Could not generate a unique booking code.',
          });
        }
      }
    }

    throw new ConflictException({
      code: 'BOOKING_HOLD_FAILED',
      message: 'Could not create booking hold.',
    });
  }

  private async createHoldInTransaction(
    transaction: Prisma.TransactionClient,
    customerId: string,
    idempotencyKey: string,
    items: readonly NormalizedHoldItem[],
  ): Promise<BookingHoldResult> {
    const now = await this.getDatabaseNow(transaction);
    const expiresAt = new Date(now.getTime() + this.holdTtlMinutes * 60 * 1000);
    const slotIds = items.map(({ slotId }) => slotId);

    await this.capacity.lockSlots(transaction, slotIds);

    const existingAfterSlotLock = await this.findIdempotentBooking(
      transaction,
      customerId,
      idempotencyKey,
    );
    if (existingAfterSlotLock) {
      return this.resolveExistingIdempotentBooking(
        existingAfterSlotLock,
        items,
      );
    }

    const slotServiceIds = await transaction.slot.findMany({
      where: { id: { in: slotIds } },
      select: { id: true, serviceId: true },
      orderBy: { id: 'asc' },
    });
    if (slotServiceIds.length !== slotIds.length) {
      throw new NotFoundException('Slot not found');
    }

    const serviceIds = [
      ...new Set(slotServiceIds.map(({ serviceId }) => serviceId)),
    ].sort();
    await this.capacity.lockServices(transaction, serviceIds);

    const slots = await transaction.slot.findMany({
      where: { id: { in: slotIds } },
      select: holdSlotSelect,
    });
    const slotById = new Map(slots.map((slot) => [slot.id, slot]));

    const orderedSlots = items.map(({ slotId }) => {
      const slot = slotById.get(slotId);
      if (!slot) throw new NotFoundException('Slot not found');
      this.assertBookableSlot(slot, now);
      return slot;
    });

    this.assertSingleVendor(orderedSlots);
    const currency = this.resolveSingleCurrency(orderedSlots);

    const consumedBySlot = await this.capacity.calculateConsumedCapacity(
      transaction,
      slotIds,
      now,
    );
    this.assertCapacity(items, orderedSlots, consumedBySlot);

    const itemSnapshots = items.map((item, index) => {
      const slot = orderedSlots[index]!;
      const effectivePrice = this.pricing.resolveEffectivePrice({
        slotPriceAmount: slot.priceAmount,
        servicePriceAmount: slot.service.priceAmount,
        currency: slot.service.currency,
      });
      const snapshot = this.pricing.createSnapshot(
        effectivePrice,
        item.quantity,
      );
      return { slot, snapshot };
    });
    const subtotalAmount = itemSnapshots.reduce(
      (sum, { snapshot }) => sum + snapshot.subtotalAmount,
      0n,
    );

    const booking = await transaction.booking.create({
      data: {
        bookingCode: this.bookingCodes.generate(now),
        customerId,
        vendorId: orderedSlots[0]!.service.vendorId,
        status: BookingStatus.PENDING_PAYMENT,
        currency,
        subtotalAmount,
        totalAmount: subtotalAmount,
        expiresAt,
        idempotencyKey,
        items: {
          create: itemSnapshots.map(({ slot, snapshot }) => ({
            serviceId: slot.serviceId,
            slotId: slot.id,
            quantity: snapshot.quantity,
            unitPriceAmount: snapshot.unitPriceAmount,
            subtotalAmount: snapshot.subtotalAmount,
            currency: snapshot.currency,
            pricingSource: snapshot.pricingSource,
            serviceTitleSnapshot: slot.service.title,
            slotStartAtSnapshot: slot.startAt,
            slotEndAtSnapshot: slot.endAt,
            reservation: {
              create: {
                slotId: slot.id,
                quantity: snapshot.quantity,
                status: ReservationStatus.HELD,
                expiresAt,
              },
            },
          })),
        },
      },
      select: bookingHoldResponseSelect,
    });

    return { statusCode: 201, body: mapBookingHoldResponse(booking) };
  }

  private normalizeItems(
    dto: CreateBookingHoldDto,
  ): readonly NormalizedHoldItem[] {
    const items = dto.items
      .map((item) => ({ slotId: item.slotId, quantity: item.quantity }))
      .sort((left, right) => left.slotId.localeCompare(right.slotId));

    for (let index = 1; index < items.length; index += 1) {
      if (items[index - 1]!.slotId === items[index]!.slotId) {
        throw new BadRequestException(
          'Duplicate slotId entries are not allowed',
        );
      }
    }
    return items;
  }

  private async findIdempotentBooking(
    client: Pick<Prisma.TransactionClient, 'booking'>,
    customerId: string,
    idempotencyKey: string,
  ): Promise<BookingHoldRecord | null> {
    return client.booking.findFirst({
      where: { customerId, idempotencyKey },
      select: bookingHoldResponseSelect,
    });
  }

  private resolveExistingIdempotentBooking(
    booking: BookingHoldRecord,
    requestedItems: readonly NormalizedHoldItem[],
  ): BookingHoldResult {
    const storedItems = booking.items
      .map((item) => ({ slotId: item.slotId, quantity: item.quantity }))
      .sort((left, right) => left.slotId.localeCompare(right.slotId));

    if (!this.sameNormalizedItems(storedItems, requestedItems)) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message:
          'Idempotency-Key was already used for a different booking hold request.',
      });
    }

    return { statusCode: 200, body: mapBookingHoldResponse(booking) };
  }

  private sameNormalizedItems(
    left: readonly NormalizedHoldItem[],
    right: readonly NormalizedHoldItem[],
  ): boolean {
    return (
      left.length === right.length &&
      left.every(
        (item, index) =>
          item.slotId === right[index]?.slotId &&
          item.quantity === right[index]?.quantity,
      )
    );
  }

  private async getDatabaseNow(
    transaction: Pick<Prisma.TransactionClient, '$queryRaw'>,
  ): Promise<Date> {
    const [row] = await transaction.$queryRaw<DbNowRow[]>`
      SELECT NOW() AS "now"
    `;
    if (!row) throw new Error('Failed to read database time');
    return row.now;
  }

  private assertBookableSlot(slot: HoldSlotRecord, now: Date): void {
    if (
      slot.deletedAt !== null ||
      slot.status !== SlotStatus.OPEN ||
      slot.startAt <= now ||
      slot.service.deletedAt !== null ||
      slot.service.status !== ServiceStatus.PUBLISHED ||
      slot.service.vendor.deletedAt !== null ||
      slot.service.vendor.status !== VendorStatus.APPROVED ||
      slot.service.category.deletedAt !== null ||
      !slot.service.category.isActive
    ) {
      throw new ConflictException({
        code: 'BOOKING_SLOT_UNAVAILABLE',
        message: 'Slot is not available for booking.',
        slotId: slot.id,
      });
    }
  }

  private assertSingleVendor(slots: readonly HoldSlotRecord[]): void {
    const vendorIds = new Set(slots.map((slot) => slot.service.vendorId));
    if (vendorIds.size > 1) {
      throw new BadRequestException({
        code: 'MULTI_VENDOR_BOOKING_NOT_ALLOWED',
        message: 'All booking items must belong to the same Vendor.',
      });
    }
  }

  private resolveSingleCurrency(slots: readonly HoldSlotRecord[]): string {
    const currencies = new Set(slots.map((slot) => slot.service.currency));
    if (currencies.size !== 1) {
      throw new BadRequestException('All booking items must use one currency.');
    }
    return slots[0]!.service.currency;
  }

  private assertCapacity(
    items: readonly NormalizedHoldItem[],
    slots: readonly HoldSlotRecord[],
    consumedBySlot: ReadonlyMap<string, number>,
  ): void {
    items.forEach((item, index) => {
      const slot = slots[index]!;
      const consumed = consumedBySlot.get(slot.id) ?? 0;
      const available = slot.capacity - consumed;
      if (item.quantity > available) {
        throw new ConflictException({
          code: 'INSUFFICIENT_CAPACITY',
          message: 'Not enough capacity is available for this slot.',
          slotId: slot.id,
        });
      }
    });
  }

  private parseHoldTtlMinutes(value: string): number {
    const ttl = Number(value);
    if (
      !Number.isInteger(ttl) ||
      ttl < HOLD_TTL_MINUTES_MIN ||
      ttl > HOLD_TTL_MINUTES_MAX
    ) {
      throw new Error(
        'BOOKING_HOLD_TTL_MINUTES must be an integer from 1 to 60',
      );
    }
    return ttl;
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
