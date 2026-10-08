-- 018_create_tariffs.sql
-- Creates the tariffs table and links tariffs to charging_sessions (Phase 3E.1).
--
-- Notes:
-- - Models pricing rules for EV charging in India (Base price per kWh, session fee, time fee, idle fee, and 18% GST).
-- - Flexible hierarchy: Can attach to CPO, Station (Location), EVSE, or specific Connector.
-- - Session snapshotting: charging_sessions stores tariff_id, tariff_snapshot, and pricing_breakdown
--   guaranteeing historical charging records never retroactively mutate when tariffs change.

CREATE TABLE IF NOT EXISTS tariffs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(255) NOT NULL,
  description           TEXT,
  cpo_id                UUID REFERENCES cpos(id) ON DELETE CASCADE,
  location_id           UUID REFERENCES locations(id) ON DELETE CASCADE,
  evse_id               UUID REFERENCES evses(id) ON DELETE CASCADE,
  connector_id          UUID REFERENCES connectors(id) ON DELETE CASCADE,
  currency              VARCHAR(3) NOT NULL DEFAULT 'INR',
  price_per_kwh         NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  session_fee           NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  price_per_minute      NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  idle_fee_per_minute   NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  grace_period_minutes  INTEGER NOT NULL DEFAULT 0,
  tax_rate              NUMERIC(5, 4) NOT NULL DEFAULT 0.1800,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  valid_from            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid_to              TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_tariff_currency CHECK (length(currency) = 3),
  CONSTRAINT chk_tariff_price_kwh CHECK (price_per_kwh >= 0),
  CONSTRAINT chk_tariff_session_fee CHECK (session_fee >= 0),
  CONSTRAINT chk_tariff_price_minute CHECK (price_per_minute >= 0),
  CONSTRAINT chk_tariff_idle_fee CHECK (idle_fee_per_minute >= 0),
  CONSTRAINT chk_tariff_grace_period CHECK (grace_period_minutes >= 0),
  CONSTRAINT chk_tariff_tax_rate CHECK (tax_rate >= 0.0000 AND tax_rate <= 1.0000),
  CONSTRAINT chk_tariff_valid_range CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_tariffs_location_id  ON tariffs(location_id);
CREATE INDEX IF NOT EXISTS idx_tariffs_cpo_id       ON tariffs(cpo_id);
CREATE INDEX IF NOT EXISTS idx_tariffs_evse_id      ON tariffs(evse_id);
CREATE INDEX IF NOT EXISTS idx_tariffs_connector_id ON tariffs(connector_id);
CREATE INDEX IF NOT EXISTS idx_tariffs_is_active    ON tariffs(is_active);
CREATE INDEX IF NOT EXISTS idx_tariffs_validity     ON tariffs(valid_from, valid_to);

-- Add snapshot and breakdown columns to charging_sessions
ALTER TABLE charging_sessions
  ADD COLUMN IF NOT EXISTS tariff_id UUID REFERENCES tariffs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tariff_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS pricing_breakdown JSONB;

CREATE INDEX IF NOT EXISTS idx_sessions_tariff_id ON charging_sessions(tariff_id);
