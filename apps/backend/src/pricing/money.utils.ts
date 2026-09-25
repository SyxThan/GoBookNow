import { BadRequestException } from '@nestjs/common';

export const MONEY_AMOUNT_PATTERN = /^\d+$/;
export const MAX_MONEY_AMOUNT = 9_223_372_036_854_775_807n;

export function parseMoneyAmount(value: string): bigint {
  if (!MONEY_AMOUNT_PATTERN.test(value)) {
    throw new BadRequestException(
      'priceAmount must be a non-negative integer string',
    );
  }

  const amount = BigInt(value);
  if (amount > MAX_MONEY_AMOUNT) {
    throw new BadRequestException('priceAmount is outside the supported range');
  }
  return amount;
}

export function serializeMoneyAmount(value: bigint): string {
  return value.toString();
}
