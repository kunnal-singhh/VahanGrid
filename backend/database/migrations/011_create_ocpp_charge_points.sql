-- 011_create_ocpp_charge_points.sql
-- Creates the ocpp_charge_points table representing physical OCPP charge point devices.
--
-- Design:
--   This table is the device registry layer of the OCPP-VahanGrid mapping architecture.
--   Each row represents one physical charging cabinet that communicates via OCPP 2.0.1.
--
-- Key decisions:
--   - charge_point_id: OCPP device identity from WebSocket URL (/ocpp/<chargePointId>).
--   - location_id: nullable until an operator links this device to a VahanGrid location.
--   - Hardware metadata will be populated from BootNotification in a future phase.
--   - registration_status mirrors OCPP RegistrationStatusEnumType.
--   - status tracks the device connection-level state.
--
-- Does NOT modify evses, connectors, locations, or any other existing table.

CREATE TABLE IF NOT EXISTS ocpp_charge_points (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_point_id     VARCHAR(255) NOT NULL UNIQUE,
  location_id         UUID         REFERENCES locations(id) ON DELETE SET NULL,
  model               VARCHAR(20),
  vendor_name         VARCHAR(50),
  serial_number       VARCHAR(25),
  firmware_version    VARCHAR(50),
  boot_reason         VARCHAR(50),
  registration_status VARCHAR(50)  NOT NULL DEFAULT 'Pending',
  last_boot_at        TIMESTAMPTZ,
  status              VARCHAR(50)  NOT NULL DEFAULT 'online',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_ocp_registration_status CHECK (
    registration_status IN ('Accepted', 'Pending', 'Rejected')
  ),
  CONSTRAINT chk_ocp_status CHECK (
    status IN ('online', 'offline', 'unavailable', 'maintenance')
  )
);

CREATE INDEX IF NOT EXISTS idx_ocpp_charge_points_cp_id    ON ocpp_charge_points(charge_point_id);
CREATE INDEX IF NOT EXISTS idx_ocpp_charge_points_location ON ocpp_charge_points(location_id);
CREATE INDEX IF NOT EXISTS idx_ocpp_charge_points_status   ON ocpp_charge_points(status);