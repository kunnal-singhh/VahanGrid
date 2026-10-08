/**
 * backend/src/services/availabilityService.js
 *
 * Availability Management Service for VahanGrid (Phase 3D.8D).
 *
 * Responsibilities:
 *  1. Implements OCPP 2.0.1 ChangeAvailability command orchestration.
 *  2. Resolves hierarchical target scope:
 *     - Connector-level: { operationalStatus, connector_id }
 *     - EVSE-level:      { operationalStatus, evse_id }
 *     - Station-level:   { operationalStatus } (fan-out across charge points at location)
 *  3. Enforces operationalStatus domain: 'Operative' | 'Inoperative'.
 *  4. Reverse-maps VahanGrid UUIDs to OCPP protocol identifiers.
 *  5. Dispatches outbound CALL via ocppCallManager.sendCall().
 *  6. Does NOT update connectors.status or evses.status on Accepted!
 *     State authority remains strictly with incoming StatusNotification via statusNotificationHandler.
 */

import { query } from '../config/database.js';
import ocppCallManager from '../ocpp/ocppCallManager.js';
import {
  resolveOcppIdentityByConnector,
  resolveOcppIdentityByEvse,
  resolveChargePointsByLocation,
} from './ocppMappingService.js';

// UUID validation regex (8-4-4-4-12 hex format)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(val) {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

const ALLOWED_OPERATIONAL_STATUSES = new Set(['Operative', 'Inoperative']);

/**
 * Executes an OCPP 2.0.1 ChangeAvailability operation for a given station location.
 *
 * @param {string} locationId - VahanGrid location UUID (stations.id)
 * @param {object} params - Request parameters
 * @param {string} params.operationalStatus - 'Operative' | 'Inoperative'
 * @param {string} [params.connector_id] - Optional connector UUID
 * @param {string} [params.evse_id] - Optional EVSE UUID
 * @param {object} [options={}] - Options (e.g. timeoutMs)
 * @returns {Promise<object>} Standardized availability result object
 */
export async function changeAvailability(locationId, params = {}, options = {}) {
  // ── 1. Validate locationId (Station) ──────────────────────────────────────
  if (!isValidUUID(locationId)) {
    const err = new Error('The station ID must be a valid UUID.');
    err.statusCode = 400;
    err.code = 'INVALID_ID';
    throw err;
  }

  const stationRes = await query('SELECT id, name FROM locations WHERE id = $1', [locationId]);
  if (stationRes.rows.length === 0) {
    const err = new Error(`Station with ID '${locationId}' was not found.`);
    err.statusCode = 404;
    err.code = 'STATION_NOT_FOUND';
    throw err;
  }

  // ── 2. Validate operationalStatus ─────────────────────────────────────────
  const { operationalStatus, connector_id, evse_id } = params;

  if (!operationalStatus || typeof operationalStatus !== 'string' || !ALLOWED_OPERATIONAL_STATUSES.has(operationalStatus)) {
    const err = new Error("operationalStatus is required and must be either 'Operative' or 'Inoperative'.");
    err.statusCode = 400;
    err.code = 'INVALID_OPERATIONAL_STATUS';
    throw err;
  }

  const timeoutMs = options.timeoutMs || 10000;

  // ── 3. Scope: Connector-level ─────────────────────────────────────────────
  if (connector_id) {
    if (!isValidUUID(connector_id)) {
      const err = new Error("The requested 'connector_id' must be a valid UUID.");
      err.statusCode = 400;
      err.code = 'INVALID_CONNECTOR_ID';
      throw err;
    }

    // Verify connector exists and belongs to this station
    const connCheck = await query(
      `SELECT cn.id, cn.evse_id, e.location_id
       FROM connectors cn
       JOIN evses e ON cn.evse_id = e.id
       WHERE cn.id = $1`,
      [connector_id]
    );

    if (connCheck.rows.length === 0) {
      const err = new Error(`Connector with ID '${connector_id}' was not found.`);
      err.statusCode = 404;
      err.code = 'CONNECTOR_NOT_FOUND';
      throw err;
    }

    if (connCheck.rows[0].location_id !== locationId) {
      const err = new Error(`Connector '${connector_id}' does not belong to station '${locationId}'.`);
      err.statusCode = 404;
      err.code = 'CONNECTOR_NOT_FOUND';
      throw err;
    }

    // Reverse lookup OCPP identity
    const ocppInfo = await resolveOcppIdentityByConnector(connector_id);
    if (!ocppInfo || !ocppInfo.charge_point_id) {
      const err = new Error(`Connector '${connector_id}' is not mapped to an active OCPP charge point.`);
      err.statusCode = 404;
      err.code = 'NO_OCPP_CHARGE_POINTS';
      throw err;
    }

    const ocppPayload = {
      operationalStatus,
      evse: {
        id: ocppInfo.ocpp_evse_id,
        connectorId: ocppInfo.ocpp_connector_id,
      },
    };

    const callResult = await ocppCallManager.sendCall(
      ocppInfo.charge_point_id,
      'ChangeAvailability',
      ocppPayload,
      { timeoutMs }
    );

    if (callResult?.status === 'Rejected') {
      const rejErr = new Error(
        `Charging station rejected availability change: ${callResult?.statusInfo?.reasonCode || 'Rejected'}`
      );
      rejErr.statusCode = 409;
      rejErr.code = 'AVAILABILITY_REJECTED';
      throw rejErr;
    }

    return {
      operationalStatus,
      scope: 'connector',
      target: {
        charge_point_id: ocppInfo.charge_point_id,
        ocpp_evse_id: ocppInfo.ocpp_evse_id,
        ocpp_connector_id: ocppInfo.ocpp_connector_id,
        connector_id,
      },
      result: callResult,
    };
  }

  // ── 4. Scope: EVSE-level ──────────────────────────────────────────────────
  if (evse_id) {
    if (!isValidUUID(evse_id)) {
      const err = new Error("The requested 'evse_id' must be a valid UUID.");
      err.statusCode = 400;
      err.code = 'INVALID_EVSE_ID';
      throw err;
    }

    // Verify EVSE exists and belongs to this station
    const evseCheck = await query(
      `SELECT id, location_id FROM evses WHERE id = $1`,
      [evse_id]
    );

    if (evseCheck.rows.length === 0) {
      const err = new Error(`EVSE with ID '${evse_id}' was not found.`);
      err.statusCode = 404;
      err.code = 'EVSE_NOT_FOUND';
      throw err;
    }

    if (evseCheck.rows[0].location_id !== locationId) {
      const err = new Error(`EVSE '${evse_id}' does not belong to station '${locationId}'.`);
      err.statusCode = 404;
      err.code = 'EVSE_NOT_FOUND';
      throw err;
    }

    // Reverse lookup OCPP identity
    const ocppInfo = await resolveOcppIdentityByEvse(evse_id);
    if (!ocppInfo || !ocppInfo.charge_point_id) {
      const err = new Error(`EVSE '${evse_id}' is not mapped to an active OCPP charge point.`);
      err.statusCode = 404;
      err.code = 'NO_OCPP_CHARGE_POINTS';
      throw err;
    }

    const ocppPayload = {
      operationalStatus,
      evse: {
        id: ocppInfo.ocpp_evse_id,
      },
    };

    const callResult = await ocppCallManager.sendCall(
      ocppInfo.charge_point_id,
      'ChangeAvailability',
      ocppPayload,
      { timeoutMs }
    );

    if (callResult?.status === 'Rejected') {
      const rejErr = new Error(
        `Charging station rejected availability change: ${callResult?.statusInfo?.reasonCode || 'Rejected'}`
      );
      rejErr.statusCode = 409;
      rejErr.code = 'AVAILABILITY_REJECTED';
      throw rejErr;
    }

    return {
      operationalStatus,
      scope: 'evse',
      target: {
        charge_point_id: ocppInfo.charge_point_id,
        ocpp_evse_id: ocppInfo.ocpp_evse_id,
        evse_id,
      },
      result: callResult,
    };
  }

  // ── 5. Scope: Station-level ───────────────────────────────────────────────
  const chargePoints = await resolveChargePointsByLocation(locationId);

  if (chargePoints.length === 0) {
    const err = new Error(`No OCPP charge points are mapped to station '${locationId}'.`);
    err.statusCode = 404;
    err.code = 'NO_OCPP_CHARGE_POINTS';
    throw err;
  }

  // Single charge point (standard case)
  if (chargePoints.length === 1) {
    const cp = chargePoints[0];
    const ocppPayload = { operationalStatus };

    const callResult = await ocppCallManager.sendCall(
      cp.charge_point_id,
      'ChangeAvailability',
      ocppPayload,
      { timeoutMs }
    );

    if (callResult?.status === 'Rejected') {
      const rejErr = new Error(
        `Charging station rejected availability change: ${callResult?.statusInfo?.reasonCode || 'Rejected'}`
      );
      rejErr.statusCode = 409;
      rejErr.code = 'AVAILABILITY_REJECTED';
      throw rejErr;
    }

    return {
      operationalStatus,
      scope: 'station',
      target: {
        location_id: locationId,
        charge_point_id: cp.charge_point_id,
      },
      result: callResult,
      results: [
        {
          charge_point_id: cp.charge_point_id,
          status: callResult.status,
        },
      ],
    };
  }

  // Multi-charge-point fan-out
  const results = await Promise.allSettled(
    chargePoints.map((cp) =>
      ocppCallManager.sendCall(cp.charge_point_id, 'ChangeAvailability', { operationalStatus }, { timeoutMs })
    )
  );

  const aggregated = [];
  let successCount = 0;
  let rejectedCount = 0;
  let offlineCount = 0;
  let timeoutCount = 0;
  let primaryError = null;

  results.forEach((outcome, idx) => {
    const cpId = chargePoints[idx].charge_point_id;
    if (outcome.status === 'fulfilled') {
      const res = outcome.value;
      if (res?.status === 'Rejected') {
        rejectedCount++;
        aggregated.push({ charge_point_id: cpId, status: 'Rejected' });
      } else {
        successCount++;
        aggregated.push({ charge_point_id: cpId, status: res?.status || 'Accepted' });
      }
    } else {
      const err = outcome.reason;
      if (!primaryError) primaryError = err;
      if (err.code === 'STATION_OFFLINE') offlineCount++;
      else if (err.code === 'STATION_TIMEOUT') timeoutCount++;
      aggregated.push({ charge_point_id: cpId, error: err.message, code: err.code || 'ERROR' });
    }
  });

  // If none succeeded
  if (successCount === 0) {
    if (rejectedCount === chargePoints.length) {
      const err = new Error('All charging stations at this location rejected the availability change.');
      err.statusCode = 409;
      err.code = 'AVAILABILITY_REJECTED';
      throw err;
    }
    if (offlineCount === chargePoints.length) {
      const err = new Error('All charging stations at this location are offline or not connected.');
      err.statusCode = 503;
      err.code = 'STATION_OFFLINE';
      throw err;
    }
    if (timeoutCount === chargePoints.length) {
      const err = new Error('All charging stations at this location timed out.');
      err.statusCode = 504;
      err.code = 'STATION_TIMEOUT';
      throw err;
    }
    throw primaryError || new Error('Failed to update availability on stations.');
  }

  // At least some succeeded
  const hasScheduled = aggregated.some((a) => a.status === 'Scheduled');
  const aggregateStatus = hasScheduled ? 'Scheduled' : 'Accepted';

  return {
    operationalStatus,
    scope: 'station',
    target: {
      location_id: locationId,
    },
    result: {
      status: aggregateStatus,
    },
    results: aggregated,
  };
}
