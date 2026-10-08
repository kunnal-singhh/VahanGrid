-- 019_create_cdrs.sql
-- Creates the charge_detail_records (cdrs) table for VahanGrid (Phase 3E.2).
--
-- Design:
--   - A CDR is a finalized, immutable billing record generated when a charging session
--     reaches a terminal billable state ('completed' or 'stopped').
--   - UNIQUE (session_id) enforces DB-level idempotency: one CDR per session, ever.
--   - Foreign keys on identity fields (user_id, connector_id, etc.) preserve referential
--     integrity without denying historical lookups if entities are later decommissioned.
--   - Location/connector name snapshots are stored separately from FK references because
--     entity names can change over time but CDR records must be immutable.
--   - All monetary values use NUMERIC — never FLOAT — to prevent rounding drift.
--   - meter_start_wh / meter_stop_wh are nullable: present for OCPP sessions, NULL for
--     manually-stopped sessions without authoritative meter readings.
--   - ocpp_transaction_id is the raw OCPP transactionId string (not the UUID PK of
--     ocpp_transactions) for direct protocol-level auditability.

CREATE TABLE IF NOT EXISTS cdrs (
  -- Identity
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES charging_sessions(id) ON DELETE RESTRICT,
  ocpp_transaction_id   VARCHAR(36),

  -- User & vehicle at time of session
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  vehicle_id            UUID REFERENCES vehicles(id) ON DELETE SET NULL,

  -- Physical location references (FK for joins)
  connector_id          UUID NOT NULL REFERENCES connectors(id) ON DELETE RESTRICT,
  evse_id               UUID NOT NULL REFERENCES evses(id) ON DELETE RESTRICT,
  location_id           UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  cpo_id                UUID NOT NULL REFERENCES cpos(id) ON DELETE RESTRICT,

  -- Immutable name/identity snapshots (survive future entity renames)
  cpo_name              VARCHAR(255) NOT NULL,
  location_name         VARCHAR(255) NOT NULL,
  location_city         VARCHAR(100) NOT NULL,
  location_address      VARCHAR(500),
  connector_standard    VARCHAR(50),

  -- Time
  started_at            TIMESTAMPTZ NOT NULL,
  ended_at              TIMESTAMPTZ NOT NULL,
  duration_seconds      INTEGER NOT NULL DEFAULT 0,

  -- Energy (authoritative from charging_sessions.energy_kwh)
  energy_kwh            NUMERIC(8, 3) NOT NULL DEFAULT 0.000,
  meter_start_wh        NUMERIC(14, 3),
  meter_stop_wh         NUMERIC(14, 3),

  -- Tariff snapshot (immutable copy locked at session start)
  tariff_id             UUID,
  tariff_snapshot       JSONB,

  -- Pricing breakdown (deterministic, computed at finalization)
  pricing_breakdown     JSONB,
  currency              VARCHAR(3) NOT NULL DEFAULT 'INR',
  energy_cost           NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  session_fee           NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  time_cost             NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  idle_cost             NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  subtotal              NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  tax_rate              NUMERIC(5, 4)  NOT NULL DEFAULT 0.1800,
  tax_amount            NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_amount          NUMERIC(10, 2) NOT NULL DEFAULT 0.00,

  -- Status (CDR lifecycle)
  status                VARCHAR(20) NOT NULL DEFAULT 'finalized',

  -- Session terminal status snapshot (completed | stopped)
  session_status        VARCHAR(50) NOT NULL,

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- DB-enforced idempotency: one CDR per session, ever
  CONSTRAINT uq_cdr_session_id UNIQUE (session_id),

  -- Constraints
  CONSTRAINT chk_cdr_status         CHECK (status IN ('finalized', 'voided')),
  CONSTRAINT chk_cdr_session_status CHECK (session_status IN ('completed', 'stopped')),
  CONSTRAINT chk_cdr_energy         CHECK (energy_kwh >= 0.000),
  CONSTRAINT chk_cdr_duration       CHECK (duration_seconds >= 0),
  CONSTRAINT chk_cdr_currency       CHECK (length(currency) = 3),
  CONSTRAINT chk_cdr_total          CHECK (total_amount >= 0.00),
  CONSTRAINT chk_cdr_timestamps     CHECK (ended_at >= started_at)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_cdrs_session_id    ON cdrs(session_id);
CREATE INDEX IF NOT EXISTS idx_cdrs_user_id       ON cdrs(user_id);
CREATE INDEX IF NOT EXISTS idx_cdrs_connector_id  ON cdrs(connector_id);
CREATE INDEX IF NOT EXISTS idx_cdrs_location_id   ON cdrs(location_id);
CREATE INDEX IF NOT EXISTS idx_cdrs_cpo_id        ON cdrs(cpo_id);
CREATE INDEX IF NOT EXISTS idx_cdrs_status        ON cdrs(status);
CREATE INDEX IF NOT EXISTS idx_cdrs_started_at    ON cdrs(started_at);
CREATE INDEX IF NOT EXISTS idx_cdrs_ocpp_tx_id    ON cdrs(ocpp_transaction_id);
