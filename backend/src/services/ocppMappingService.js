/**
 * src/services/ocppMappingService.js
 *
 * Database lookup service for the OCPP-to-VahanGrid identity mapping layer (Phase 3D.4B).
 *
 * Responsibilities:
 *   Translate OCPP protocol identifiers (chargePointId, evseId, connectorId) into
 *   VahanGrid PostgreSQL UUIDs (evses.id, connectors.id).
 *
 * Architecture:
 *   OCPP Charge Point (chargePointId string)
 *     --> ocpp_charge_points row (UUID)
 *       --> ocpp_evse_mappings (charge_point_id, ocpp_evse_id) --> evses.id UUID
 *         --> ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id) --> connectors.id UUID
 *
 * Scope constraints (Phase 3D.4B):
 *   - READ-ONLY lookup only. No rows are inserted or updated automatically.
 *   - StatusNotification does NOT yet use these lookups to update connectors.status in PostgreSQL.
 *   - BootNotification does NOT yet persist to ocpp_charge_points.
 *   - These functions are NOT exposed through any public REST endpoint.
 *
 * Future use:
 *   - resolveConnectorMapping() will be called by StatusNotification handler to write
 *     connector status to PostgreSQL in a future phase (3D.5+).
 *   - TransactionEvent and MeterValues handlers will use resolveConnectorMapping()
 *     to link OCPP transactions to charging_sessions rows.
 */

import { query } from '../config/database.js';

// ---------------------------------------------------------------------------
// Charge Point resolution
// ---------------------------------------------------------------------------

/**
 * Resolves an OCPP chargePointId string to the internal ocpp_charge_points row.
 * Returns null if the charge point is not registered in the mapping table.
 *
 * @param {string} chargePointId - OCPP chargePointId from the WebSocket URL path
 * @returns {Promise<{id: string, charge_point_id: string, location_id: string|null,
 *                    registration_status: string, status: string}|null>}
 */
export async function resolveChargePoint(chargePointId) {
  if (!chargePointId || typeof chargePointId !== 'string') return null;

  const result = await query(
    `SELECT id, charge_point_id, location_id, registration_status, status
     FROM ocpp_charge_points
     WHERE charge_point_id = $1`,
    [chargePointId]
  );
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// EVSE resolution
// ---------------------------------------------------------------------------

/**
 * Resolves an OCPP (chargePointId, evseId) pair to the VahanGrid EVSE UUID.
 *
 * Returns null if:
 *   - The chargePointId is not in ocpp_charge_points.
 *   - No mapping exists for the given ocpp_evse_id under this charge point.
 *   - ocppEvseId is 0 or negative (charge-point-level event; not stored in this table).
 *
 * @param {string} chargePointId - OCPP chargePointId string
 * @param {number} ocppEvseId    - OCPP integer evseId (must be > 0)
 * @returns {Promise<{mappingId: string, evseId: string}|null>}
 *   mappingId: ocpp_evse_mappings.id (for chaining to resolveConnectorMapping)
 *   evseId:    evses.id UUID (the VahanGrid EVSE)
 */
export async function resolveEvseMapping(chargePointId, ocppEvseId) {
  if (!chargePointId || typeof chargePointId !== 'string') return null;
  if (typeof ocppEvseId !== 'number' || !Number.isInteger(ocppEvseId) || ocppEvseId <= 0) return null;

  const result = await query(
    `SELECT oem.id AS mapping_id, oem.evse_id
     FROM ocpp_evse_mappings oem
     JOIN ocpp_charge_points ocp ON oem.charge_point_id = ocp.id
     WHERE ocp.charge_point_id = $1
       AND oem.ocpp_evse_id    = $2`,
    [chargePointId, ocppEvseId]
  );

  if (result.rows.length === 0) return null;
  return {
    mappingId: result.rows[0].mapping_id,
    evseId:    result.rows[0].evse_id,
  };
}

// ---------------------------------------------------------------------------
// Connector resolution
// ---------------------------------------------------------------------------

/**
 * Resolves an OCPP (chargePointId, evseId, connectorId) triplet to the VahanGrid connector UUID.
 *
 * This is the primary lookup function used by OCPP message handlers that reference
 * a specific connector (StatusNotification, TransactionEvent, MeterValues).
 *
 * Returns null if any part of the mapping chain is missing.
 *
 * @param {string} chargePointId   - OCPP chargePointId string
 * @param {number} ocppEvseId      - OCPP integer evseId (must be > 0)
 * @param {number} ocppConnectorId - OCPP integer connectorId (must be > 0)
 * @returns {Promise<{connectorId: string, evseId: string, mappingId: string}|null>}
 *   connectorId: connectors.id UUID (the VahanGrid connector)
 *   evseId:      evses.id UUID (the parent VahanGrid EVSE)
 *   mappingId:   ocpp_evse_mappings.id UUID
 */
export async function resolveConnectorMapping(chargePointId, ocppEvseId, ocppConnectorId) {
  if (!chargePointId || typeof chargePointId !== 'string') return null;
  if (typeof ocppEvseId !== 'number' || !Number.isInteger(ocppEvseId) || ocppEvseId <= 0) return null;
  if (typeof ocppConnectorId !== 'number' || !Number.isInteger(ocppConnectorId) || ocppConnectorId <= 0) return null;

  const result = await query(
    `SELECT ocm.connector_id,
            oem.evse_id,
            oem.id AS mapping_id
     FROM ocpp_connector_mappings ocm
     JOIN ocpp_evse_mappings      oem ON ocm.ocpp_evse_mapping_id = oem.id
     JOIN ocpp_charge_points      ocp ON oem.charge_point_id      = ocp.id
     WHERE ocp.charge_point_id   = $1
       AND oem.ocpp_evse_id      = $2
       AND ocm.ocpp_connector_id = $3`,
    [chargePointId, ocppEvseId, ocppConnectorId]
  );

  if (result.rows.length === 0) return null;
  return {
    connectorId: result.rows[0].connector_id,
    evseId:      result.rows[0].evse_id,
    mappingId:   result.rows[0].mapping_id,
  };
}

// ---------------------------------------------------------------------------
// Full mapping introspection
// ---------------------------------------------------------------------------

/**
 * Returns the full EVSE+connector mapping chain for a given charge point.
 * Used in tests and operator diagnostics.
 *
 * @param {string} chargePointId
 * @returns {Promise<Array<{ocpp_evse_id: number, evse_id: string,
 *                          ocpp_connector_id: number, connector_id: string}>>}
 */
export async function getFullMapping(chargePointId) {
  if (!chargePointId || typeof chargePointId !== 'string') return [];

  const result = await query(
    `SELECT
       oem.ocpp_evse_id,
       oem.evse_id,
       ocm.ocpp_connector_id,
       ocm.connector_id
     FROM ocpp_evse_mappings oem
     JOIN ocpp_charge_points      ocp ON oem.charge_point_id      = ocp.id
     LEFT JOIN ocpp_connector_mappings ocm ON ocm.ocpp_evse_mapping_id = oem.id
     WHERE ocp.charge_point_id = $1
     ORDER BY oem.ocpp_evse_id, ocm.ocpp_connector_id`,
    [chargePointId]
  );
  return result.rows;
}
