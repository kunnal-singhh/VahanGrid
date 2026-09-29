-- 004_create_cpos.sql
-- Creates the cpos (Charge Point Operators) table.
--
-- Notes:
-- - Models network operators (Tata Power, Statiq, ChargeZone, Jio-bp, etc.)
-- - short_code serves as a unique standardized identifier for cross-network roaming.

CREATE TABLE IF NOT EXISTS cpos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  short_code VARCHAR(50) NOT NULL UNIQUE,
  website VARCHAR(255),
  support_phone VARCHAR(50),
  support_email VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_cpo_status CHECK (status IN ('active', 'inactive', 'suspended', 'pending'))
);

CREATE INDEX IF NOT EXISTS idx_cpos_short_code ON cpos(short_code);
