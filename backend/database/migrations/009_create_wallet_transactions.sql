-- 009_create_wallet_transactions.sql
-- Creates the wallet_transactions table acting as the immutable double-entry/signed ledger.
--
-- Notes:
-- - Uses NUMERIC(12, 2) for currency amounts (never FLOAT).
-- - Signed ledger design:
--     Positive (+) amount = Credit (Top-up via UPI/card, refund, promotional cashback)
--     Negative (-) amount = Debit (Charging session payment, penalty fee)
--   This allows calculating the true balance via: SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE wallet_id = $1
-- - Foreign key ON DELETE RESTRICT guarantees financial records can never be accidentally orphaned.

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  type VARCHAR(50) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  reference_type VARCHAR(50),
  reference_id VARCHAR(255),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_wallet_txn_amount CHECK (amount <> 0.00),
  CONSTRAINT chk_wallet_txn_type CHECK (
    type IN ('topup', 'charging_payment', 'refund', 'cashback', 'adjustment')
  ),
  CONSTRAINT chk_wallet_txn_currency CHECK (length(currency) = 3)
);

CREATE INDEX IF NOT EXISTS idx_wallet_txns_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_created_at ON wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_ref ON wallet_transactions(reference_type, reference_id);
