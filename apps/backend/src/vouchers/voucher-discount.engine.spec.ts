import { describe, expect, it } from 'vitest';
import { VoucherType } from '../generated/prisma/client.js';
import {
  allocateVoucherDiscount,
  calculateVoucherDiscount,
} from './voucher-discount.engine.js';

const fixed = {
  type: VoucherType.FIXED,
  fixedAmount: 60000n,
  percentageBps: null,
  minOrderAmount: 0n,
  maxDiscountAmount: null,
};
const percentage = {
  type: VoucherType.PERCENTAGE,
  fixedAmount: null,
  percentageBps: 2000,
  minOrderAmount: 0n,
  maxDiscountAmount: 60000n,
};

describe('voucher financial engine', () => {
  it('computes fixed and capped percentage discounts using integers', () => {
    expect(calculateVoucherDiscount(fixed, 500000n).discountAmount).toBe(
      60000n,
    );
    expect(calculateVoucherDiscount(percentage, 500000n)).toMatchObject({
      discountAmount: 60000n,
      netTotalAmount: 440000n,
    });
  });

  it('uses gross minimum and never discounts beyond gross', () => {
    expect(
      calculateVoucherDiscount({ ...fixed, minOrderAmount: 300000n }, 250000n)
        .reason,
    ).toBe('VOUCHER_MIN_ORDER_NOT_MET');
    expect(
      calculateVoucherDiscount({ ...fixed, fixedAmount: 100000n }, 10000n)
        .netTotalAmount,
    ).toBe(0n);
  });

  it('rounds percentages down with BigInt and detects zero discount', () => {
    expect(
      calculateVoucherDiscount(
        { ...percentage, percentageBps: 3333, maxDiscountAmount: null },
        7n,
      ).discountAmount,
    ).toBe(2n);
    expect(calculateVoucherDiscount(percentage, 1n).reason).toBe(
      'VOUCHER_NO_DISCOUNT',
    );
  });

  it('rejects mixed or invalid configuration and negative amounts', () => {
    expect(() =>
      calculateVoucherDiscount({ ...percentage, percentageBps: 10001 }, 100n),
    ).toThrow('VOUCHER_INVALID_CONFIG');
    expect(() =>
      calculateVoucherDiscount({ ...fixed, percentageBps: 10 }, 100n),
    ).toThrow('VOUCHER_INVALID_CONFIG');
    expect(() => calculateVoucherDiscount(fixed, -1n)).toThrow(
      'VOUCHER_INVALID_CONFIG',
    );
  });

  it('allocates multiple items exactly, independent of input order', () => {
    const items = [
      { key: 'b', grossSubtotalAmount: 200000n },
      { key: 'a', grossSubtotalAmount: 300000n },
    ];
    const allocation = allocateVoucherDiscount(items, 60000n);
    expect(allocation).toEqual([
      {
        key: 'b',
        grossSubtotalAmount: 200000n,
        discountAmount: 24000n,
        netAmount: 176000n,
      },
      {
        key: 'a',
        grossSubtotalAmount: 300000n,
        discountAmount: 36000n,
        netAmount: 264000n,
      },
    ]);
    expect(allocation.reduce((sum, item) => sum + item.netAmount, 0n)).toBe(
      440000n,
    );
  });

  it('breaks equal remainders by stable key', () => {
    const items = [
      { key: 'z', grossSubtotalAmount: 1n },
      { key: 'a', grossSubtotalAmount: 1n },
    ];
    expect(
      allocateVoucherDiscount(items, 1n).map((item) => item.discountAmount),
    ).toEqual([0n, 1n]);
  });
});
