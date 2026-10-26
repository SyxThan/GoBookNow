export type Voucher = {
  id: string;
  code: string;
  type: "FIXED" | "PERCENTAGE";
  fixedAmount: string | null;
  percentageBps: number | null;
  minOrderAmount: string;
  maxDiscountAmount: string | null;
  validFrom: string;
  validUntil: string;
  usageLimit: number;
  effectiveUsage: number;
  isActive: boolean;
};
