-- 007_create_connectors.sql
-- Creates the connectors table representing the physical plug/socket interface.
--
-- Notes:
-- - An EVSE can have multiple connectors (e.g. Dual-gun CCS2 120kW, or CCS2 + Type 2).
-- - Supports diverse Indian standards: CCS2, Type 2, Bharat DC-001, Bharat AC-001, CHAdeMO.
-- - connector_id is unique per EVSE (typically '1', '2', 'A', 'B').

CREATE TABLE IF NOT EXISTS connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evse_id UUID NOT NULL REFERENCES evses(id) ON DELETE CASCADE,
  connector_id VARCHAR(50) NOT NULL,
  standard VARCHAR(50) NOT NULL,
  format VARCHAR(50) NOT NULL DEFAULT 'cable',
  power_type VARCHAR(50) NOT NULL,
  max_voltage_v NUMERIC(6, 2),
  max_amperage_a NUMERIC(6, 2),
  max_power_kw NUMERIC(6, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_evse_connector_id UNIQUE (evse_id, connector_id),
  CONSTRAINT chk_connector_power CHECK (max_power_kw > 0),
  CONSTRAINT chk_connector_voltage CHECK (max_voltage_v IS NULL OR max_voltage_v > 0),
  CONSTRAINT chk_connector_amperage CHECK (max_amperage_a IS NULL OR max_amperage_a > 0),
  CONSTRAINT chk_connector_status CHECK (
    status IN ('available', 'charging', 'reserved', 'faulted', 'offline', 'unavailable')
  ),
  CONSTRAINT chk_connector_format CHECK (format IN ('cable', 'socket')),
  CONSTRAINT chk_connector_power_type CHECK (power_type IN ('AC_1_PHASE', 'AC_3_PHASE', 'DC'))
);

CREATE INDEX IF NOT EXISTS idx_connectors_evse_id ON connectors(evse_id);
CREATE INDEX IF NOT EXISTS idx_connectors_standard ON connectors(standard);
CREATE INDEX IF NOT EXISTS idx_connectors_status ON connectors(status);
