-- 008_create_wallets.sql
-- Creates the wallets table for the unified VahanPass wallet system.
--
-- Notes:
-- - A 1:1 relationship with users: each user has one primary roaming wallet.
-- - No mutable 'balance' column is stored here!
--   The wallet balance is strictly derived from the ledger in wallet_transactions (SUM(amount)).
-- - ON DELETE RESTRICT prevents users with active wallets from being deleted silently.

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_wallet_status CHECK (status IN ('active', 'suspended', 'closed')),
  CONSTRAINT chk_wallet_currency CHECK (length(currency) = 3)
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
