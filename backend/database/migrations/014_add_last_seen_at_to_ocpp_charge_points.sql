-- 014_add_last_seen_at_to_ocpp_charge_points.sql
-- Adds last_seen_at timestamp to ocpp_charge_points for heartbeat and telemetry freshness tracking.
--
-- Design:
--   - Tracks the latest time the charge point interacted with the CSMS (BootNotification, Heartbeat, StatusNotification).
--   - Nullable until the first message is received or set at boot time.
--   - Does NOT modify locations, cpos, evses, connectors, or charging_sessions.

ALTER TABLE ocpp_charge_points
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ocpp_charge_points_last_seen ON ocpp_charge_points(last_seen_at);
