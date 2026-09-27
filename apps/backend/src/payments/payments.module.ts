import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PAYMENT_CHECKOUT_PROVIDER } from './providers/payment-checkout-provider.js';
import { SepayPaymentProvider } from './providers/sepay/sepay-payment.provider.js';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    SepayPaymentProvider,
    {
      provide: PAYMENT_CHECKOUT_PROVIDER,
      useExisting: SepayPaymentProvider,
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
