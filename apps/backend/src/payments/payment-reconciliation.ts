import type { Prisma } from '../generated/prisma/client.js';
import type { NormalizedPaymentTransaction } from './normalized-payment-transaction.js';

/** No raw payload, secrets or card/customer data. Original assertions never overwrite one another. */
export async function recordPaymentReconciliation(
  client: Pick<Prisma.TransactionClient, 'paymentReconciliation'>,
  input: NormalizedPaymentTransaction,
  reason: string,
  paymentId?: string,
): Promise<void> {
  await client.paymentReconciliation.createMany({
    data: {
      provider: input.provider,
      providerTransactionId: input.providerTransactionId,
      merchantReference: input.merchantReference,
      receivedAmount: input.amount,
      currency: input.currency,
      reason,
      paymentId,
    },
    // Native ON CONFLICT keeps concurrent duplicate exception deliveries idempotent.
    skipDuplicates: true,
  });
}
