-- 016_ocpp_energy_meter_semantics.sql
--
-- Phase 3D.6B: Fix meter_start_wh column semantics.
--
-- The column meter_start_wh was created in migration 015 with DEFAULT 0.000.
-- The value 0.000 is ambiguous: it could mean "meter truly started at zero"
-- or "no starting reading was provided by the charger".
--
-- NULL unambiguously means "the charger did not provide a meter reading at
-- transaction start, so net energy consumed cannot be computed as a delta".
--
-- This migration:
--   1. Changes the DEFAULT to NULL.
--   2. Resets existing rows where meter_start_wh = 0.000 AND meter_stop_wh IS NULL
--      (those rows got the default — no actual reading was stored by Phase 3D.6A
--       because meter_start_wh was never populated in the INSERT).
--
-- Does NOT touch: charging_sessions, connectors, evses, locations, cpos, users,
--                 vehicles, ocpp_charge_points, ocpp_evse_mappings,
--                 ocpp_connector_mappings.

ALTER TABLE ocpp_transactions
  ALTER COLUMN meter_start_wh SET DEFAULT NULL;

-- Reset rows that received the old default (0.000) rather than a real reading.
-- Phase 3D.6A never included meter_start_wh in its INSERT, so every existing row
-- has the column at its DEFAULT (0.000) and meter_stop_wh IS NULL.
UPDATE ocpp_transactions
SET    meter_start_wh = NULL
WHERE  meter_start_wh = 0.000
  AND  meter_stop_wh  IS NULL;
