-- 013_create_ocpp_connector_mappings.sql
-- Maps OCPP (evse_mapping, connectorId) to a VahanGrid connector UUID.
--
-- Cardinality: ocpp_evse_mappings (1) --> (N) ocpp_connector_mappings --> (1) connectors
-- connectorId=0 is EVSE-level; excluded by CHECK (ocpp_connector_id > 0).
-- ON DELETE CASCADE from ocpp_evse_mappings (EVSE mapping deletion removes connector mappings).
-- ON DELETE RESTRICT from connectors (cannot delete a connector while it has an OCPP mapping).
-- Does NOT modify the connectors table.

CREATE TABLE IF NOT EXISTS ocpp_connector_mappings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ocpp_evse_mapping_id UUID        NOT NULL REFERENCES ocpp_evse_mappings(id) ON DELETE CASCADE,
  ocpp_connector_id    INTEGER     NOT NULL,
  connector_id         UUID        NOT NULL REFERENCES connectors(id) ON DELETE RESTRICT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_ocpp_connector_per_evse     UNIQUE (ocpp_evse_mapping_id, ocpp_connector_id),
  CONSTRAINT uq_vahangrid_connector_mapped  UNIQUE (connector_id),
  CONSTRAINT chk_ocpp_connector_id_positive CHECK (ocpp_connector_id > 0)
);

CREATE INDEX IF NOT EXISTS idx_ocpp_conn_mappings_evse_map  ON ocpp_connector_mappings(ocpp_evse_mapping_id);
CREATE INDEX IF NOT EXISTS idx_ocpp_conn_mappings_connector ON ocpp_connector_mappings(connector_id);