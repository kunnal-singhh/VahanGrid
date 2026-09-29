-- 003_create_vehicles.sql
-- Creates the vehicles table representing registered EV models in VahanGrid.
--
-- Notes:
-- - Uses NUMERIC for physical units (kWh, kW) rather than floating point or strings.
-- - user_id links to users(id) with ON DELETE CASCADE.
-- - Enforces non-negative physical capacities and valid charging power limits.

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manufacturer VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  variant VARCHAR(100),
  battery_capacity_kwh NUMERIC(6, 2) NOT NULL,
  usable_battery_capacity_kwh NUMERIC(6, 2),
  connector_type VARCHAR(50) NOT NULL,
  max_ac_power_kw NUMERIC(6, 2),
  max_dc_power_kw NUMERIC(6, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_vehicle_battery_capacity CHECK (battery_capacity_kwh > 0),
  CONSTRAINT chk_vehicle_usable_battery CHECK (
    usable_battery_capacity_kwh IS NULL OR 
    (usable_battery_capacity_kwh > 0 AND usable_battery_capacity_kwh <= battery_capacity_kwh)
  ),
  CONSTRAINT chk_vehicle_max_ac_power CHECK (max_ac_power_kw IS NULL OR max_ac_power_kw >= 0),
  CONSTRAINT chk_vehicle_max_dc_power CHECK (max_dc_power_kw IS NULL OR max_dc_power_kw >= 0)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);
