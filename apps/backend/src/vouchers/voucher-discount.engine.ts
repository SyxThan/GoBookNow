import { VoucherType } from '../generated/prisma/client.js';

export type VoucherTerms = Readonly<{
  type: VoucherType;
  fixedAmount: bigint | null;
  percentageBps: number | null;
  minOrderAmount: bigint;
  maxDiscountAmount: bigint | null;
}>;

export type VoucherDiscountResult = Readonly<{
  eligible: boolean;
  reason: 'VALID' | 'VOUCHER_MIN_ORDER_NOT_MET' | 'VOUCHER_NO_DISCOUNT';
  grossSubtotalAmount: bigint;
  discountAmount: bigint;
  netTotalAmount: bigint;
}>;

export type VoucherItemAllocation = Readonly<{
  key: string;
  grossSubtotalAmount: bigint;
  discountAmount: bigint;
  netAmount: bigint;
}>;

export function calculateVoucherDiscount(
  voucher: VoucherTerms,
  grossSubtotalAmount: bigint,
): VoucherDiscountResult {
  if (
    grossSubtotalAmount < 0n ||
    voucher.minOrderAmount < 0n ||
    (voucher.maxDiscountAmount !== null && voucher.maxDiscountAmount <= 0n) ||
    (voucher.type === VoucherType.FIXED &&
      (voucher.fixedAmount === null ||
        voucher.fixedAmount <= 0n ||
        voucher.percentageBps !== null)) ||
    (voucher.type === VoucherType.PERCENTAGE &&
      (voucher.fixedAmount !== null ||
        voucher.percentageBps === null ||
        !Number.isInteger(voucher.percentageBps) ||
        voucher.percentageBps < 1 ||
        voucher.percentageBps > 10_000))
  ) {
    throw new Error('VOUCHER_INVALID_CONFIG');
  }
  if (grossSubtotalAmount < voucher.minOrderAmount) {
    return {
      eligible: false,
      reason: 'VOUCHER_MIN_ORDER_NOT_MET',
      grossSubtotalAmount,
      discountAmount: 0n,
      netTotalAmount: grossSubtotalAmount,
    };
  }

  const rawDiscount =
    voucher.type === VoucherType.FIXED
      ? voucher.fixedAmount!
      : (grossSubtotalAmount * BigInt(voucher.percentageBps!)) / 10_000n;
  const cappedDiscount =
    voucher.maxDiscountAmount === null
      ? rawDiscount
      : min(rawDiscount, voucher.maxDiscountAmount);
  const discountAmount = min(cappedDiscount, grossSubtotalAmount);
  return {
    eligible: discountAmount > 0n,
    reason: discountAmount > 0n ? 'VALID' : 'VOUCHER_NO_DISCOUNT',
    grossSubtotalAmount,
    discountAmount,
    netTotalAmount: grossSubtotalAmount - discountAmount,
  };
}

export function allocateVoucherDiscount(
  items: readonly Readonly<{ key: string; grossSubtotalAmount: bigint }>[],
  discountAmount: bigint,
): readonly VoucherItemAllocation[] {
  if (
    items.length === 0 ||
    discountAmount < 0n ||
    items.some((item) => item.grossSubtotalAmount < 0n) ||
    new Set(items.map((item) => item.key)).size !== items.length
  ) {
    throw new Error('VOUCHER_FINANCIAL_MISMATCH');
  }
  const gross = items.reduce((sum, item) => sum + item.grossSubtotalAmount, 0n);
  if (discountAmount > gross || (gross === 0n && discountAmount !== 0n)) {
    throw new Error('VOUCHER_FINANCIAL_MISMATCH');
  }
  if (gross === 0n) {
    return items.map((item) => ({
      ...item,
      discountAmount: 0n,
      netAmount: 0n,
    }));
  }

  const shares = items.map((item) => {
    const numerator = item.grossSubtotalAmount * discountAmount;
    return {
      ...item,
      discountAmount: numerator / gross,
      remainder: numerator % gross,
    };
  });
  let remaining =
    discountAmount -
    shares.reduce((sum, item) => sum + item.discountAmount, 0n);
  const byRemainder = [...shares].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
  });
  for (const item of byRemainder) {
    if (remaining === 0n) break;
    if (item.discountAmount < item.grossSubtotalAmount) {
      item.discountAmount += 1n;
      remaining -= 1n;
    }
  }
  if (remaining !== 0n) throw new Error('VOUCHER_FINANCIAL_MISMATCH');
  return shares.map((item) => ({
    key: item.key,
    grossSubtotalAmount: item.grossSubtotalAmount,
    discountAmount: item.discountAmount,
    netAmount: item.grossSubtotalAmount - item.discountAmount,
  }));
}

function min(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}
