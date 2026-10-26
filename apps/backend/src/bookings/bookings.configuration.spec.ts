import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma/prisma.service.js';
import type { PricingService } from '../pricing/pricing.service.js';
import type { VouchersService } from '../vouchers/vouchers.service.js';
import type { BookingCodeService } from './booking-code.service.js';
import { BookingsService } from './bookings.service.js';
import type { CancellationPolicyProvider } from './cancellation/cancellation-policy.provider.js';
import type { CapacityService } from './capacity.service.js';

describe('Booking configuration at startup', () => {
  function start(rate: string | undefined) {
    const config = new ConfigService();
    vi.spyOn(config, 'get').mockImplementation((key: string) =>
      key === 'PLATFORM_COMMISSION_BPS' ? rate : undefined,
    );
    return new BookingsService(
      {} as PrismaService,
      config,
      {} as CapacityService,
      {} as PricingService,
      {} as BookingCodeService,
      {} as CancellationPolicyProvider,
      {} as VouchersService,
    );
  }

  it.each([undefined, '', 'ten', '-1', '1.5', '10001'])(
    'rejects missing or invalid commission before serving requests (%s)',
    (rate) => {
      expect(() => start(rate)).toThrow('PLATFORM_COMMISSION_BPS');
    },
  );

  it.each(['0', '1000', '10000'])(
    'starts with an explicit supported rate (%s)',
    (rate) => {
      expect(() => start(rate)).not.toThrow();
    },
  );
});
