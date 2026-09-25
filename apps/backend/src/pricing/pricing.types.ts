export type PricingSource = 'SLOT' | 'SERVICE';

export type EffectivePrice = Readonly<{
  unitPriceAmount: bigint;
  currency: string;
  source: PricingSource;
}>;

export type BookingPriceSnapshot = Readonly<{
  unitPriceAmount: bigint;
  currency: string;
  quantity: number;
  subtotalAmount: bigint;
  pricingSource: PricingSource;
  capturedAt: Date;
}>;
