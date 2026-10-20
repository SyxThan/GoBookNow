import { describe, expect, it, vi } from 'vitest';
import { VoucherType, type Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../database/prisma/prisma.service.js';
import { VouchersService, type VoucherRecord } from './vouchers.service.js';

const NOW = new Date('2026-10-20T10:00:00.000Z');
const base = {
  id: '10000000-0000-4000-8000-000000000001',
  code: 'SALE20',
  type: VoucherType.PERCENTAGE,
  fixedAmount: null,
  percentageBps: 2000,
  minOrderAmount: 300000n,
  maxDiscountAmount: 60000n,
  validFrom: NOW,
  validUntil: new Date(NOW.getTime() + 1),
  usageLimit: 1,
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
} satisfies VoucherRecord;

describe('VouchersService eligibility', () => {
  const service = new VouchersService({} as PrismaService);
  const count = vi.fn().mockResolvedValue(0);
  const client = {
    voucherClaim: { count },
  } as unknown as Pick<Prisma.TransactionClient, 'voucherClaim'>;

  it('accepts inclusive start and rejects exclusive end', async () => {
    expect((await service.evaluate(client, base, 500000n, NOW)).valid).toBe(
      true,
    );
    expect(
      (await service.evaluate(client, base, 500000n, base.validUntil)).reason,
    ).toBe('VOUCHER_EXPIRED');
    expect(
      (
        await service.evaluate(
          client,
          { ...base, validFrom: new Date(NOW.getTime() + 1) },
          500000n,
          NOW,
        )
      ).reason,
    ).toBe('VOUCHER_NOT_STARTED');
  });

  it('rejects inactive, low gross, exhausted, zero-discount, and free-checkout cases', async () => {
    expect(
      (
        await service.evaluate(
          client,
          { ...base, isActive: false },
          500000n,
          NOW,
        )
      ).reason,
    ).toBe('VOUCHER_INACTIVE');
    expect((await service.evaluate(client, base, 250000n, NOW)).reason).toBe(
      'VOUCHER_MIN_ORDER_NOT_MET',
    );
    count.mockResolvedValueOnce(1);
    expect((await service.evaluate(client, base, 500000n, NOW)).reason).toBe(
      'VOUCHER_LIMIT_REACHED',
    );
    expect(
      (
        await service.evaluate(
          client,
          { ...base, minOrderAmount: 0n, percentageBps: 1 },
          1n,
          NOW,
        )
      ).reason,
    ).toBe('VOUCHER_NO_DISCOUNT');
    expect(
      (
        await service.evaluate(
          client,
          {
            ...base,
            type: VoucherType.FIXED,
            fixedAmount: 500000n,
            percentageBps: null,
            maxDiscountAmount: null,
          },
          500000n,
          NOW,
        )
      ).reason,
    ).toBe('FREE_CHECKOUT_UNSUPPORTED');
  });
});
