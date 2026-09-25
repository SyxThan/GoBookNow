import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type {
  BookingPriceSnapshot,
  EffectivePrice,
} from './pricing.types.js';

type PriceInputs = Readonly<{
  slotPriceAmount: bigint | null;
  servicePriceAmount: bigint;
  currency: string;
}>;

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveSlotPrice(slotId: string): Promise<EffectivePrice> {
    const slot = await this.prisma.slot.findFirst({
      where: {
        id: slotId,
        deletedAt: null,
        service: { deletedAt: null },
      },
      select: {
        priceAmount: true,
        service: { select: { priceAmount: true, currency: true } },
      },
    });
    if (!slot) throw new NotFoundException('Slot not found');

    return this.resolveEffectivePrice({
      slotPriceAmount: slot.priceAmount,
      servicePriceAmount: slot.service.priceAmount,
      currency: slot.service.currency,
    });
  }

  resolveEffectivePrice(inputs: PriceInputs): EffectivePrice {
    const usesSlotPrice = inputs.slotPriceAmount !== null;
    return Object.freeze({
      unitPriceAmount: usesSlotPrice
        ? inputs.slotPriceAmount
        : inputs.servicePriceAmount,
      currency: inputs.currency,
      source: usesSlotPrice ? 'SLOT' : 'SERVICE',
    });
  }

  createSnapshot(
    effectivePrice: EffectivePrice,
    quantity: number,
  ): BookingPriceSnapshot {
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new BadRequestException('quantity must be a positive integer');
    }

    return Object.freeze({
      unitPriceAmount: effectivePrice.unitPriceAmount,
      currency: effectivePrice.currency,
      quantity,
      subtotalAmount: effectivePrice.unitPriceAmount * BigInt(quantity),
      pricingSource: effectivePrice.source,
      capturedAt: new Date(),
    });
  }

  async createSlotSnapshot(
    slotId: string,
    quantity: number,
  ): Promise<BookingPriceSnapshot> {
    return this.createSnapshot(await this.resolveSlotPrice(slotId), quantity);
  }
}
