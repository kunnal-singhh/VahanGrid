-- 012_create_ocpp_evse_mappings.sql
-- Maps OCPP (chargePointId, evseId) to a VahanGrid EVSE UUID.
--
-- Cardinality: ocpp_charge_points (1) --> (N) ocpp_evse_mappings --> (1) evses
-- evseId=0 is charge-point-level; excluded by CHECK (ocpp_evse_id > 0).
-- ON DELETE CASCADE from ocpp_charge_points (device deletion removes EVSE mappings).
-- ON DELETE RESTRICT from evses (cannot delete an EVSE while it has an OCPP mapping).
-- Does NOT modify the evses table.

CREATE TABLE IF NOT EXISTS ocpp_evse_mappings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_point_id UUID        NOT NULL REFERENCES ocpp_charge_points(id) ON DELETE CASCADE,
  ocpp_evse_id    INTEGER     NOT NULL,
  evse_id         UUID        NOT NULL REFERENCES evses(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_ocpp_evse_per_device  UNIQUE (charge_point_id, ocpp_evse_id),
  CONSTRAINT uq_vahangrid_evse_mapped UNIQUE (evse_id),
  CONSTRAINT chk_ocpp_evse_id_positive CHECK (ocpp_evse_id > 0)
);

CREATE INDEX IF NOT EXISTS idx_ocpp_evse_mappings_cp   ON ocpp_evse_mappings(charge_point_id);
CREATE INDEX IF NOT EXISTS idx_ocpp_evse_mappings_evse ON ocpp_evse_mappings(evse_id);