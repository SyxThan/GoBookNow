import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SePayPgClient, type SepayConfig } from 'sepay-pg-node';
import type {
  CreatePaymentCheckoutInput,
  PaymentCheckout,
  PaymentCheckoutProvider,
} from '../payment-checkout-provider.js';

type SepayEnvironment = SepayConfig['env'];

@Injectable()
export class SepayPaymentProvider implements PaymentCheckoutProvider {
  constructor(private readonly config: ConfigService) {}

  async createCheckout(
    input: CreatePaymentCheckoutInput,
  ): Promise<PaymentCheckout> {
    const environment = this.getEnvironment();
    const merchantId = this.getRequiredConfig('SEPAY_MERCHANT_ID');
    const secretKey = this.getRequiredConfig('SEPAY_SECRET_KEY');

    if (input.amount <= 0n || input.amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw this.unavailable();
    }
    if (input.currency !== 'VND') {
      throw this.unavailable();
    }

    try {
      const client = new SePayPgClient({
        env: environment,
        merchant_id: merchantId,
        secret_key: secretKey,
      });
      const fields = client.checkout.initOneTimePaymentFields({
        operation: 'PURCHASE',
        payment_method: 'BANK_TRANSFER',
        order_invoice_number: input.merchantReference,
        order_amount: Number(input.amount),
        currency: input.currency,
        order_description: input.description,
        customer_id: input.customerId,
        ...this.getCallbackFields(),
      });

      return {
        paymentUrl: client.checkout.initCheckoutUrl(),
        method: 'POST',
        formFields: Object.fromEntries(
          Object.entries(fields)
            .filter((entry): entry is [string, string | number] =>
              ['string', 'number'].includes(typeof entry[1]),
            )
            .map(([key, value]) => [key, String(value)]),
        ),
      };
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw this.unavailable();
    }
  }

  private getEnvironment(): SepayEnvironment {
    const environment = (this.config.get<string>('SEPAY_ENV') ?? 'sandbox')
      .trim()
      .toLowerCase();
    if (environment !== 'sandbox' && environment !== 'production') {
      throw this.unavailable();
    }
    return environment;
  }

  private getRequiredConfig(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value) throw this.unavailable();
    return value;
  }

  private getCallbackFields(): Partial<{
    success_url: string;
    error_url: string;
    cancel_url: string;
  }> {
    const callbacks = [
      ['success_url', 'SEPAY_SUCCESS_URL'],
      ['error_url', 'SEPAY_ERROR_URL'],
      ['cancel_url', 'SEPAY_CANCEL_URL'],
    ] as const;

    return Object.fromEntries(
      callbacks.flatMap(([field, configName]) => {
        const value = this.config.get<string>(configName)?.trim();
        return value ? [[field, value]] : [];
      }),
    );
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'SEPAY_UNAVAILABLE',
      message: 'Payment provider is temporarily unavailable.',
    });
  }
}
