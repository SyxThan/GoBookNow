import { describe, expect, it } from 'vitest';
import { CommissionCalculator as Commission } from './commission.calculator.js';

describe('CommissionCalculator', () => {
  it('uses net after a voucher and reconciles the booking', () => {
    expect(Commission.calculate({ grossAmount: 500_000n, discountAmount: 60_000n, commissionBps: 1000 })).toEqual({
      grossAmount: 500_000n, discountAmount: 60_000n, netAmount: 440_000n,
      commissionBps: 1000, platformFeeAmount: 44_000n, vendorAmount: 396_000n,
    });
  });

  it.each([
    [0n, 0n, 0, 0n],
    [500_000n, 0n, 1000, 50_000n],
    [500_000n, 60_000n, 0, 0n],
    [500_000n, 60_000n, 10_000, 440_000n],
    [9_007_199_254_740_993n, 0n, 1500, 1_351_079_888_211_148n],
  ])('calculates exact BigInt fee', (grossAmount, discountAmount, commissionBps, expected) => {
    expect(Commission.calculate({ grossAmount, discountAmount, commissionBps }).platformFeeAmount).toBe(expected);
  });

  it('rejects invalid amounts, rate, and missing configuration', () => {
    expect(() => Commission.calculate({ grossAmount: -1n, discountAmount: 0n, commissionBps: 1000 })).toThrow();
    expect(() => Commission.calculate({ grossAmount: 10n, discountAmount: 11n, commissionBps: 1000 })).toThrow();
    expect(() => Commission.calculate({ grossAmount: 10n, discountAmount: 0n, commissionBps: 10_001 })).toThrow();
    expect(() => Commission.parseBps(undefined)).toThrow();
    expect(() => Commission.parseBps('1.5')).toThrow();
    expect(Commission.parseBps('0')).toBe(0);
    expect(Commission.parseBps('10000')).toBe(10_000);
  });

  it('allocates a booking fee deterministically across multiple items', () => {
    expect(Commission.allocate([
      { key: 'a', netAmount: 264_000n }, { key: 'b', netAmount: 176_000n },
    ], 44_000n)).toEqual([
      { key: 'a', netAmount: 264_000n, platformFeeAmount: 26_400n, vendorAmount: 237_600n },
      { key: 'b', netAmount: 176_000n, platformFeeAmount: 17_600n, vendorAmount: 158_400n },
    ]);
    expect(Commission.allocate([{ key: 'b', netAmount: 1n }, { key: 'a', netAmount: 1n }], 1n)).toEqual([
      { key: 'b', netAmount: 1n, platformFeeAmount: 0n, vendorAmount: 1n },
      { key: 'a', netAmount: 1n, platformFeeAmount: 1n, vendorAmount: 0n },
    ]);
  });

  it('derives retained values using the original rate', () => {
    expect(Commission.retained(440_000n, 352_000n, 1000)).toMatchObject({
      netAmount: 88_000n, platformFeeAmount: 8_800n, vendorAmount: 79_200n,
    });
    expect(() => Commission.retained(10n, 11n, 1000)).toThrow();
  });
});
