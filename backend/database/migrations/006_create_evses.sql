-- 006_create_evses.sql
-- Creates the evses table (Electric Vehicle Supply Equipment).
--
-- Notes:
-- - An EVSE corresponds to an individual charging kiosk/cabinet capable of charging.
-- - evse_uid is unique within the context of a location.
-- - An EVSE can host one or multiple physical connectors (e.g. CCS2 + Type 2).

CREATE TABLE IF NOT EXISTS evses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  evse_uid VARCHAR(100) NOT NULL,
  evse_code VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'available',
  floor_level VARCHAR(20),
  physical_reference VARCHAR(100),
  max_power_kw NUMERIC(6, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_location_evse_uid UNIQUE (location_id, evse_uid),
  CONSTRAINT chk_evse_status CHECK (
    status IN ('available', 'charging', 'reserved', 'faulted', 'offline', 'unavailable')
  ),
  CONSTRAINT chk_evse_max_power CHECK (max_power_kw IS NULL OR max_power_kw > 0)
);

CREATE INDEX IF NOT EXISTS idx_evses_location_id ON evses(location_id);
CREATE INDEX IF NOT EXISTS idx_evses_status ON evses(status);
