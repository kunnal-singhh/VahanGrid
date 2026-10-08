-- 020_add_cdr_wallet_settlement.sql
-- Phase 3E.3: Wallet Settlement & CDR Integration
--
-- Adds settlement tracking columns to cdrs and links wallet_transactions to cdrs
-- with database-level uniqueness to enforce idempotency and auditability.

-- 1. Add settlement state columns to cdrs
ALTER TABLE cdrs
  ADD COLUMN IF NOT EXISTS settlement_status VARCHAR(20) NOT NULL DEFAULT 'unsettled',
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settlement_failure_reason VARCHAR(100),
  ADD COLUMN IF NOT EXISTS wallet_transaction_id UUID;

-- Check constraint for settlement status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cdr_settlement_status'
  ) THEN
    ALTER TABLE cdrs
      ADD CONSTRAINT chk_cdr_settlement_status
      CHECK (settlement_status IN ('unsettled', 'settled', 'failed'));
  END IF;
END $$;

-- 2. Add audit and foreign key columns to wallet_transactions
ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS cdr_id UUID REFERENCES cdrs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS balance_before NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS balance_after NUMERIC(12, 2);

-- 3. Link cdrs.wallet_transaction_id to wallet_transactions(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cdrs_wallet_transaction'
  ) THEN
    ALTER TABLE cdrs
      ADD CONSTRAINT fk_cdrs_wallet_transaction
      FOREIGN KEY (wallet_transaction_id)
      REFERENCES wallet_transactions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Database-level idempotency: Exactly one wallet transaction can ever reference a given CDR
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_txns_cdr_id
  ON wallet_transactions(cdr_id)
  WHERE cdr_id IS NOT NULL;

-- 5. Indexes for fast lookup of settlement status and linked transactions
CREATE INDEX IF NOT EXISTS idx_cdrs_settlement_status ON cdrs(settlement_status);
CREATE INDEX IF NOT EXISTS idx_cdrs_wallet_txn_id ON cdrs(wallet_transaction_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_cdr_id ON wallet_transactions(cdr_id);
