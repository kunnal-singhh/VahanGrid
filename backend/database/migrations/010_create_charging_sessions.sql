-- 010_create_charging_sessions.sql
-- Creates the charging_sessions table representing Charge Detail Records (CDRs).
--
-- Notes:
-- - Tracks the lifecycle of EV charging: initial connection, energy delivered, SoC delta, cost.
-- - external_session_id enables cross-network reconciliation with OCPI/OCPP in future phases.
-- - user_id (RESTRICT) and connector_id (RESTRICT) guarantee session provenance cannot be broken.
-- - vehicle_id (SET NULL) allows users to decommission vehicles while keeping charging audit history.

CREATE TABLE IF NOT EXISTS charging_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,
  start_soc NUMERIC(5, 2),
  end_soc NUMERIC(5, 2),
  energy_kwh NUMERIC(8, 3) NOT NULL DEFAULT 0.000,
  duration_seconds INTEGER DEFAULT 0,
  cost_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  external_session_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_session_soc_range CHECK (
    (start_soc IS NULL OR (start_soc >= 0.00 AND start_soc <= 100.00)) AND
    (end_soc IS NULL OR (end_soc >= 0.00 AND end_soc <= 100.00))
  ),
  CONSTRAINT chk_session_energy CHECK (energy_kwh >= 0.000),
  CONSTRAINT chk_session_duration CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  CONSTRAINT chk_session_cost CHECK (cost_amount >= 0.00),
  CONSTRAINT chk_session_status CHECK (
    status IN ('pending', 'active', 'completed', 'stopped', 'failed', 'cancelled')
  ),
  CONSTRAINT chk_session_timestamps CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT chk_session_currency CHECK (length(currency) = 3)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON charging_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_connector_id ON charging_sessions(connector_id);
CREATE INDEX IF NOT EXISTS idx_sessions_vehicle_id ON charging_sessions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON charging_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON charging_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_external_id ON charging_sessions(external_session_id);
