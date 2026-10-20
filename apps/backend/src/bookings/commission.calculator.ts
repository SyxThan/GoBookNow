export type CommissionResult = Readonly<{
  grossAmount: bigint;
  discountAmount: bigint;
  netAmount: bigint;
  commissionBps: number;
  platformFeeAmount: bigint;
  vendorAmount: bigint;
}>;

export type ItemCommission = Readonly<{
  key: string;
  netAmount: bigint;
  platformFeeAmount: bigint;
  vendorAmount: bigint;
}>;

export class CommissionCalculator {
  static parseBps(value: string | undefined): number {
    if (value === undefined || !/^(0|[1-9]\d*)$/.test(value)) {
      throw new Error('PLATFORM_COMMISSION_BPS must be an integer from 0 to 10000');
    }
    const bps = Number(value);
    if (!Number.isSafeInteger(bps) || bps > 10_000) {
      throw new Error('PLATFORM_COMMISSION_BPS must be an integer from 0 to 10000');
    }
    return bps;
  }

  static calculate(input: {
    grossAmount: bigint;
    discountAmount: bigint;
    commissionBps: number;
  }): CommissionResult {
    const { grossAmount, discountAmount, commissionBps } = input;
    if (grossAmount < 0n || discountAmount < 0n || discountAmount > grossAmount) {
      throw new Error('COMMISSION_INVALID_AMOUNT');
    }
    if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10_000) {
      throw new Error('COMMISSION_INVALID_BPS');
    }
    const netAmount = grossAmount - discountAmount;
    const platformFeeAmount = (netAmount * BigInt(commissionBps)) / 10_000n;
    return {
      grossAmount,
      discountAmount,
      netAmount,
      commissionBps,
      platformFeeAmount,
      vendorAmount: netAmount - platformFeeAmount,
    };
  }

  static allocate(items: readonly Readonly<{ key: string; netAmount: bigint }>[], fee: bigint): readonly ItemCommission[] {
    const net = items.reduce((sum, item) => sum + item.netAmount, 0n);
    if (items.length === 0 || fee < 0n || fee > net || items.some((item) => item.netAmount < 0n) || new Set(items.map((item) => item.key)).size !== items.length) {
      throw new Error('COMMISSION_ALLOCATION_MISMATCH');
    }
    if (net === 0n) return items.map((item) => ({ ...item, platformFeeAmount: 0n, vendorAmount: 0n }));
    const shares = items.map((item) => ({ ...item, platformFeeAmount: (item.netAmount * fee) / net, remainder: (item.netAmount * fee) % net }));
    let remaining = fee - shares.reduce((sum, item) => sum + item.platformFeeAmount, 0n);
    for (const item of [...shares].sort((a, b) => a.remainder === b.remainder ? a.key.localeCompare(b.key) : a.remainder > b.remainder ? -1 : 1)) {
      if (remaining === 0n) break;
      if (item.platformFeeAmount < item.netAmount) {
        item.platformFeeAmount += 1n;
        remaining -= 1n;
      }
    }
    if (remaining !== 0n) throw new Error('COMMISSION_ALLOCATION_MISMATCH');
    return shares.map(({ key, netAmount, platformFeeAmount }) => ({ key, netAmount, platformFeeAmount, vendorAmount: netAmount - platformFeeAmount }));
  }

  static retained(paidAmount: bigint, succeededRefundAmount: bigint, commissionBps: number) {
    if (paidAmount < 0n || succeededRefundAmount < 0n || succeededRefundAmount > paidAmount) throw new Error('COMMISSION_INVALID_REFUNDS');
    return this.calculate({ grossAmount: paidAmount - succeededRefundAmount, discountAmount: 0n, commissionBps });
  }
}
