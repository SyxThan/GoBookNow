import type { PaymentProvider } from '../generated/prisma/client.js';

export interface NormalizedPaymentTransaction {
  provider: PaymentProvider;
  merchantReference: string;
  providerTransactionId: string;
  amount: bigint;
  currency: string;
}
