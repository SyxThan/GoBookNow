import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma/prisma.service.js';
import { MAX_MONEY_AMOUNT, parseMoneyAmount } from './money.utils.js';
import { PricingService } from './pricing.service.js';

describe('PricingService', () => {
  const findFirst = vi.fn();
  const prisma = {
    slot: { findFirst },
  } as unknown as PrismaService;
  const service = new PricingService(prisma);

  beforeEach(() => vi.clearAllMocks());

  it('inherits the Service price only when the Slot override is null', () => {
    expect(
      service.resolveEffectivePrice({
        slotPriceAmount: null,
        servicePriceAmount: 100_000n,
        currency: 'VND',
      }),
    ).toEqual({
      unitPriceAmount: 100_000n,
      currency: 'VND',
      source: 'SERVICE',
    });
    expect(
      service.resolveEffectivePrice({
        slotPriceAmount: 0n,
        servicePriceAmount: 100_000n,
        currency: 'VND',
      }),
    ).toEqual({ unitPriceAmount: 0n, currency: 'VND', source: 'SLOT' });
  });

  it('loads trusted Slot and Service pricing from the database', async () => {
    findFirst.mockResolvedValueOnce({
      priceAmount: 120_000n,
      service: { priceAmount: 100_000n, currency: 'VND' },
    } as never);
    await expect(service.resolveSlotPrice('slot-1')).resolves.toEqual({
      unitPriceAmount: 120_000n,
      currency: 'VND',
      source: 'SLOT',
    });
  });

  it('creates a frozen BigInt-safe snapshot', () => {
    const snapshot = service.createSnapshot(
      {
        unitPriceAmount: 9_007_199_254_740_993n,
        currency: 'VND',
        source: 'SLOT',
      },
      2,
    );
    expect(snapshot).toMatchObject({
      unitPriceAmount: 9_007_199_254_740_993n,
      currency: 'VND',
      quantity: 2,
      subtotalAmount: 18_014_398_509_481_986n,
      pricingSource: 'SLOT',
    });
    expect(snapshot.capturedAt).toBeInstanceOf(Date);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid snapshot quantity %s',
    (quantity) => {
      expect(() =>
        service.createSnapshot(
          { unitPriceAmount: 1n, currency: 'VND', source: 'SERVICE' },
          quantity,
        ),
      ).toThrow(BadRequestException);
    },
  );

  it('validates the canonical non-negative BIGINT money format', () => {
    expect(parseMoneyAmount('0')).toBe(0n);
    expect(parseMoneyAmount(MAX_MONEY_AMOUNT.toString())).toBe(
      MAX_MONEY_AMOUNT,
    );
    for (const invalid of [
      '-1',
      '1.5',
      '1,000',
      'abc',
      '',
      ' ',
      '9223372036854775808',
    ]) {
      expect(() => parseMoneyAmount(invalid)).toThrow(BadRequestException);
    }
  });
});
