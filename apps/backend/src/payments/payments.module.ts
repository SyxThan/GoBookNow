import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentMatchingService } from './payment-matching.service.js';
import { PaymentsService } from './payments.service.js';
import { SepayIpnAuthGuard } from './sepay-ipn-auth.guard.js';
import { SepayIpnController } from './sepay-ipn.controller.js';
import { SepayIpnService } from './sepay-ipn.service.js';
import { PAYMENT_CHECKOUT_PROVIDER } from './providers/payment-checkout-provider.js';
import { SepayPaymentProvider } from './providers/sepay/sepay-payment.provider.js';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController, SepayIpnController],
  providers: [
    PaymentsService,
    PaymentMatchingService,
    SepayIpnAuthGuard,
    SepayIpnService,
    SepayPaymentProvider,
    {
      provide: PAYMENT_CHECKOUT_PROVIDER,
      useExisting: SepayPaymentProvider,
    },
  ],
  exports: [PaymentsService, PaymentMatchingService],
})
export class PaymentsModule {}
