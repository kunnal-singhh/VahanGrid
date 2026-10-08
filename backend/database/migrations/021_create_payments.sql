-- 021_create_payments.sql
-- Phase 3E.4: Wallet Top-Up & Payment Gateway Integration
--
-- Creates the payments table to track external payment intents/orders,
-- and links external payments to internal wallet transactions with database-level uniqueness.

-- 1. Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  provider VARCHAR(50) NOT NULL DEFAULT 'razorpay',
  provider_order_id VARCHAR(255) UNIQUE,
  provider_payment_id VARCHAR(255) UNIQUE,
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(20) NOT NULL DEFAULT 'created',
  wallet_transaction_id UUID,
  error_code VARCHAR(100),
  error_description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,

  CONSTRAINT chk_payment_amount CHECK (amount > 0.00),
  CONSTRAINT chk_payment_currency CHECK (length(currency) = 3),
  CONSTRAINT chk_payment_status CHECK (
    status IN ('created', 'pending', 'paid', 'failed', 'cancelled')
  )
);

-- 2. Add payment_id column to wallet_transactions for dual-link auditability
ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT;

-- 3. Link payments.wallet_transaction_id to wallet_transactions(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_wallet_transaction'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT fk_payments_wallet_transaction
      FOREIGN KEY (wallet_transaction_id)
      REFERENCES wallet_transactions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Database-level idempotency: Exactly one wallet transaction can ever reference a given payment
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_txns_payment_id
  ON wallet_transactions(payment_id)
  WHERE payment_id IS NOT NULL;

-- 5. Exactly one payment can ever link to a given wallet transaction
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_wallet_txn_id
  ON payments(wallet_transaction_id)
  WHERE wallet_transaction_id IS NOT NULL;

-- 6. Indexes for performant lookup and state queries
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_wallet_id ON payments(wallet_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_order_id ON payments(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON payments(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_payment_id ON wallet_transactions(payment_id);
