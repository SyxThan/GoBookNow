export const PAYMENT_CHECKOUT_PROVIDER = Symbol('PAYMENT_CHECKOUT_PROVIDER');

export type CreatePaymentCheckoutInput = Readonly<{
  merchantReference: string;
  amount: bigint;
  currency: string;
  description: string;
  customerId: string;
}>;

export type PaymentCheckout = Readonly<{
  paymentUrl: string;
  method: 'POST';
  formFields: Record<string, string>;
}>;

export interface PaymentCheckoutProvider {
  createCheckout(input: CreatePaymentCheckoutInput): Promise<PaymentCheckout>;
}
