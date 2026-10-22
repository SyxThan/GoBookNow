-- Preserve received-money exceptions independently of Booking entitlement.
CREATE TABLE "payment_reconciliations" (
  "id" UUID NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "provider_transaction_id" VARCHAR(128) NOT NULL,
  "merchant_reference" VARCHAR(64) NOT NULL,
  "received_amount" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "reason" VARCHAR(64) NOT NULL,
  "payment_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(3),
  CONSTRAINT "payment_reconciliations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_reconciliations_amount_positive" CHECK ("received_amount" > 0),
  CONSTRAINT "payment_reconciliations_currency_valid" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "payment_reconciliations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payment_reconciliation_event_key" ON "payment_reconciliations" ("provider", "provider_transaction_id", "merchant_reference", "received_amount", "currency");
CREATE INDEX "payment_reconciliations_resolved_at_created_at_idx" ON "payment_reconciliations" ("resolved_at", "created_at");
CREATE INDEX "payment_reconciliations_payment_id_idx" ON "payment_reconciliations" ("payment_id");
