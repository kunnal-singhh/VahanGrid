-- 015_create_ocpp_transactions.sql
-- Creates the ocpp_transactions table representing persistent OCPP 2.0.1 transaction records.
--
-- Design:
--   - Authoritative charge point link uses ocpp_charge_points.id UUID (FK with ON DELETE CASCADE).
--   - Composite uniqueness on (ocpp_charge_point_id, transaction_id) guarantees cross-device safety.
--   - Optional nullable link to charging_sessions.id connects protocol events to customer sessions.
--   - Does NOT modify charging_sessions, connectors, evses, locations, cpos, users, or vehicles.

CREATE TABLE IF NOT EXISTS ocpp_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ocpp_charge_point_id  UUID NOT NULL REFERENCES ocpp_charge_points(id) ON DELETE CASCADE,
  transaction_id        VARCHAR(36) NOT NULL,
  seq_no                INTEGER NOT NULL DEFAULT 0,
  ocpp_evse_id          INTEGER NOT NULL,
  ocpp_connector_id     INTEGER,
  connector_id          UUID REFERENCES connectors(id) ON DELETE SET NULL,
  session_id            UUID REFERENCES charging_sessions(id) ON DELETE SET NULL,
  id_token              VARCHAR(255),
  id_token_type         VARCHAR(50),
  charging_state        VARCHAR(50),
  trigger_reason        VARCHAR(50),
  stopped_reason        VARCHAR(50),
  meter_start_wh        NUMERIC(14, 3) DEFAULT 0.000,
  meter_stop_wh         NUMERIC(14, 3),
  total_energy_kwh      NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
  started_at            TIMESTAMPTZ NOT NULL,
  ended_at              TIMESTAMPTZ,
  status                VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_ocpp_cp_tx_id UNIQUE (ocpp_charge_point_id, transaction_id),
  CONSTRAINT chk_ocpp_tx_status CHECK (
    status IN ('active', 'completed', 'aborted')
  ),
  CONSTRAINT chk_ocpp_tx_evse_positive CHECK (ocpp_evse_id > 0)
);

CREATE INDEX IF NOT EXISTS idx_ocpp_tx_lookup    ON ocpp_transactions(ocpp_charge_point_id, transaction_id);
CREATE INDEX IF NOT EXISTS idx_ocpp_tx_session   ON ocpp_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_ocpp_tx_connector ON ocpp_transactions(connector_id);
CREATE INDEX IF NOT EXISTS idx_ocpp_tx_status    ON ocpp_transactions(status);
