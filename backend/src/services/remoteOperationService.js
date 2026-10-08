/**
 * backend/src/services/remoteOperationService.js
 *
 * Remote Operations Service for VahanGrid (Phase 3D.9).
 *
 * Responsibilities:
 *  1. Implements OCPP 2.0.1 outbound remote commands:
 *     - Reset (Immediate, OnIdle)
 *     - UnlockConnector
 *     - TriggerMessage (StatusNotification, MeterValues, Heartbeat, BootNotification, TransactionEvent)
 *  2. Resolves hierarchical target scopes:
 *     - Connector-level: connector_id -> (chargePointId, evseId, connectorId)
 *     - EVSE-level: evse_id -> (chargePointId, evseId)
 *     - Station-level: location_id -> fan out across all mapped charge points
 *  3. Validates payloads against OCPP 2.0.1 specification enums.
 *  4. Dispatches outbound CALL via ocppCallManager.sendCall().
 *  5. Preserves STATE AUTHORITY:
 *     - Does NOT fabricate or preemptively modify connector, EVSE, or session state!
 *     - Physical charger events (StatusNotification, BootNotification, TransactionEvent)
 *       remain the sole authoritative state writers.
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

const ALLOWED_RESET_TYPES = new Set(['Immediate', 'OnIdle']);

const ALLOWED_TRIGGER_MESSAGES = new Set([
  'StatusNotification',
  'MeterValues',
  'Heartbeat',
  'BootNotification',
  'TransactionEvent',
]);

// ---------------------------------------------------------------------------
// 1. Reset Operation
// ---------------------------------------------------------------------------

/**
 * Executes an OCPP 2.0.1 Reset command for a given station location.
 *
 * @param {string} locationId - VahanGrid location UUID (locations.id)
 * @param {object} params - Request body
 * @param {string} [params.type='Immediate'] - 'Immediate' | 'OnIdle'
 * @param {string} [params.evse_id] - Optional VahanGrid EVSE UUID
 * @param {object} [options={}] - Options (e.g. timeoutMs)
 * @returns {Promise<object>} Standardized reset result object
 */
export async function reset(locationId, params = {}, options = {}) {
  // Validate location UUID
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

  // Validate reset type (default: 'Immediate')
  const type = params.type || 'Immediate';
  if (!ALLOWED_RESET_TYPES.has(type)) {
    const err = new Error("Reset 'type' must be either 'Immediate' or 'OnIdle'.");
    err.statusCode = 400;
    err.code = 'INVALID_RESET_TYPE';
    throw err;
  }

  const timeoutMs = options.timeoutMs || 10000;
  const { evse_id } = params;

  // ── Case A: EVSE-level Reset ──────────────────────────────────────────────
  if (evse_id) {
    if (!isValidUUID(evse_id)) {
      const err = new Error("The requested 'evse_id' must be a valid UUID.");
      err.statusCode = 400;
      err.code = 'INVALID_EVSE_ID';
      throw err;
    }

    const evseCheck = await query('SELECT id, location_id FROM evses WHERE id = $1', [evse_id]);
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

    const ocppInfo = await resolveOcppIdentityByEvse(evse_id);
    if (!ocppInfo || !ocppInfo.charge_point_id) {
      const err = new Error(`EVSE '${evse_id}' is not mapped to an active OCPP charge point.`);
      err.statusCode = 404;
      err.code = 'NO_OCPP_CHARGE_POINTS';
      throw err;
    }

    const ocppPayload = {
      type,
      evseId: ocppInfo.ocpp_evse_id,
    };

    const callResult = await ocppCallManager.sendCall(
      ocppInfo.charge_point_id,
      'Reset',
      ocppPayload,
      { timeoutMs }
    );

    if (callResult?.status === 'Rejected') {
      const rejErr = new Error(
        `Charging station rejected reset request: ${callResult?.statusInfo?.reasonCode || 'Rejected'}`
      );
      rejErr.statusCode = 409;
      rejErr.code = 'RESET_REJECTED';
      throw rejErr;
    }

    return {
      type,
      scope: 'evse',
      target: {
        charge_point_id: ocppInfo.charge_point_id,
        ocpp_evse_id: ocppInfo.ocpp_evse_id,
        evse_id,
      },
      result: callResult,
    };
  }

  // ── Case B: Station-level Reset ───────────────────────────────────────────
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
    const ocppPayload = { type };

    const callResult = await ocppCallManager.sendCall(
      cp.charge_point_id,
      'Reset',
      ocppPayload,
      { timeoutMs }
    );

    if (callResult?.status === 'Rejected') {
      const rejErr = new Error(
        `Charging station rejected reset request: ${callResult?.statusInfo?.reasonCode || 'Rejected'}`
      );
      rejErr.statusCode = 409;
      rejErr.code = 'RESET_REJECTED';
      throw rejErr;
    }

    return {
      type,
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
      ocppCallManager.sendCall(cp.charge_point_id, 'Reset', { type }, { timeoutMs })
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

  if (successCount === 0) {
    if (rejectedCount === chargePoints.length) {
      const err = new Error('All charging stations at this location rejected the reset request.');
      err.statusCode = 409;
      err.code = 'RESET_REJECTED';
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
    throw primaryError || new Error('Failed to reset stations.');
  }

  const hasScheduled = aggregated.some((a) => a.status === 'Scheduled');
  const aggregateStatus = hasScheduled ? 'Scheduled' : 'Accepted';

  return {
    type,
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

// ---------------------------------------------------------------------------
// 2. UnlockConnector Operation
// ---------------------------------------------------------------------------

/**
 * Executes an OCPP 2.0.1 UnlockConnector command for a specific connector.
 *
 * @param {string} locationId - VahanGrid location UUID (locations.id)
 * @param {object} params - Request body
 * @param {string} params.connector_id - VahanGrid connector UUID
 * @param {object} [options={}] - Options (e.g. timeoutMs)
 * @returns {Promise<object>} Standardized unlock result object
 */
export async function unlockConnector(locationId, params = {}, options = {}) {
  // Validate location UUID
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

  const { connector_id } = params;
  if (!connector_id) {
    const err = new Error("'connector_id' is required.");
    err.statusCode = 400;
    err.code = 'CONNECTOR_ID_REQUIRED';
    throw err;
  }

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

  // Reverse map to OCPP identity
  const ocppInfo = await resolveOcppIdentityByConnector(connector_id);
  if (!ocppInfo || !ocppInfo.charge_point_id) {
    const err = new Error(`Connector '${connector_id}' is not mapped to an active OCPP charge point.`);
    err.statusCode = 404;
    err.code = 'NO_OCPP_CHARGE_POINTS';
    throw err;
  }

  const timeoutMs = options.timeoutMs || 10000;
  const ocppPayload = {
    evseId: ocppInfo.ocpp_evse_id,
    connectorId: ocppInfo.ocpp_connector_id,
  };

  const callResult = await ocppCallManager.sendCall(
    ocppInfo.charge_point_id,
    'UnlockConnector',
    ocppPayload,
    { timeoutMs }
  );

  // Handle OCPP 2.0.1 UnlockStatusEnumType responses:
  // 'Unlocked' -> Success
  // 'UnlockFailed' -> 409 UNLOCK_FAILED
  // 'OngoingAuthorizedTransaction' -> 409 ONGOING_AUTHORIZED_TRANSACTION
  // 'UnknownConnector' -> 404 CONNECTOR_NOT_FOUND
  const status = callResult?.status;

  if (status === 'OngoingAuthorizedTransaction') {
    const err = new Error(
      `Cannot unlock connector while an authorized charging transaction is ongoing: ${callResult?.statusInfo?.reasonCode || 'OngoingAuthorizedTransaction'}`
    );
    err.statusCode = 409;
    err.code = 'ONGOING_AUTHORIZED_TRANSACTION';
    throw err;
  }

  if (status === 'UnlockFailed') {
    const err = new Error(
      `Charging station failed to unlock connector: ${callResult?.statusInfo?.reasonCode || 'UnlockFailed'}`
    );
    err.statusCode = 409;
    err.code = 'UNLOCK_FAILED';
    throw err;
  }

  if (status === 'UnknownConnector') {
    const err = new Error('Charging station reported connector is unknown.');
    err.statusCode = 404;
    err.code = 'CONNECTOR_NOT_FOUND';
    throw err;
  }

  if (status === 'Rejected') {
    const err = new Error(
      `Charging station rejected unlock request: ${callResult?.statusInfo?.reasonCode || 'Rejected'}`
    );
    err.statusCode = 409;
    err.code = 'UNLOCK_REJECTED';
    throw err;
  }

  // 'Unlocked' or 'Accepted'
  return {
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

// ---------------------------------------------------------------------------
// 3. TriggerMessage Operation
// ---------------------------------------------------------------------------

/**
 * Executes an OCPP 2.0.1 TriggerMessage diagnostic command.
 *
 * @param {string} locationId - VahanGrid location UUID (locations.id)
 * @param {object} params - Request body
 * @param {string} params.requestedMessage - MessageTriggerEnumType value
 * @param {string} [params.connector_id] - Optional connector UUID
 * @param {string} [params.evse_id] - Optional EVSE UUID
 * @param {object} [options={}] - Options (e.g. timeoutMs)
 * @returns {Promise<object>} Standardized trigger result object
 */
export async function triggerMessage(locationId, params = {}, options = {}) {
  // Validate location UUID
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

  const { requestedMessage, connector_id, evse_id } = params;

  if (!requestedMessage || typeof requestedMessage !== 'string' || !ALLOWED_TRIGGER_MESSAGES.has(requestedMessage)) {
    const err = new Error(
      `'requestedMessage' is required and must be one of: ${Array.from(ALLOWED_TRIGGER_MESSAGES).join(', ')}.`
    );
    err.statusCode = 400;
    err.code = 'INVALID_REQUESTED_MESSAGE';
    throw err;
  }

  const timeoutMs = options.timeoutMs || 10000;

  // ── Case A: Connector-level Trigger ───────────────────────────────────────
  if (connector_id) {
    if (!isValidUUID(connector_id)) {
      const err = new Error("The requested 'connector_id' must be a valid UUID.");
      err.statusCode = 400;
      err.code = 'INVALID_CONNECTOR_ID';
      throw err;
    }

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

    const ocppInfo = await resolveOcppIdentityByConnector(connector_id);
    if (!ocppInfo || !ocppInfo.charge_point_id) {
      const err = new Error(`Connector '${connector_id}' is not mapped to an active OCPP charge point.`);
      err.statusCode = 404;
      err.code = 'NO_OCPP_CHARGE_POINTS';
      throw err;
    }

    const ocppPayload = {
      requestedMessage,
      evse: {
        id: ocppInfo.ocpp_evse_id,
        connectorId: ocppInfo.ocpp_connector_id,
      },
    };

    const callResult = await ocppCallManager.sendCall(
      ocppInfo.charge_point_id,
      'TriggerMessage',
      ocppPayload,
      { timeoutMs }
    );

    if (callResult?.status === 'NotImplemented') {
      const err = new Error(`Charging station does not support triggering '${requestedMessage}'.`);
      err.statusCode = 501;
      err.code = 'NOT_IMPLEMENTED';
      throw err;
    }

    if (callResult?.status === 'Rejected') {
      const err = new Error(
        `Charging station rejected message trigger: ${callResult?.statusInfo?.reasonCode || 'Rejected'}`
      );
      err.statusCode = 409;
      err.code = 'TRIGGER_MESSAGE_REJECTED';
      throw err;
    }

    return {
      requestedMessage,
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

  // ── Case B: EVSE-level Trigger ────────────────────────────────────────────
  if (evse_id) {
    if (!isValidUUID(evse_id)) {
      const err = new Error("The requested 'evse_id' must be a valid UUID.");
      err.statusCode = 400;
      err.code = 'INVALID_EVSE_ID';
      throw err;
    }

    const evseCheck = await query('SELECT id, location_id FROM evses WHERE id = $1', [evse_id]);
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

    const ocppInfo = await resolveOcppIdentityByEvse(evse_id);
    if (!ocppInfo || !ocppInfo.charge_point_id) {
      const err = new Error(`EVSE '${evse_id}' is not mapped to an active OCPP charge point.`);
      err.statusCode = 404;
      err.code = 'NO_OCPP_CHARGE_POINTS';
      throw err;
    }

    const ocppPayload = {
      requestedMessage,
      evse: {
        id: ocppInfo.ocpp_evse_id,
      },
    };

    const callResult = await ocppCallManager.sendCall(
      ocppInfo.charge_point_id,
      'TriggerMessage',
      ocppPayload,
      { timeoutMs }
    );

    if (callResult?.status === 'NotImplemented') {
      const err = new Error(`Charging station does not support triggering '${requestedMessage}'.`);
      err.statusCode = 501;
      err.code = 'NOT_IMPLEMENTED';
      throw err;
    }

    if (callResult?.status === 'Rejected') {
      const err = new Error(
        `Charging station rejected message trigger: ${callResult?.statusInfo?.reasonCode || 'Rejected'}`
      );
      err.statusCode = 409;
      err.code = 'TRIGGER_MESSAGE_REJECTED';
      throw err;
    }

    return {
      requestedMessage,
      scope: 'evse',
      target: {
        charge_point_id: ocppInfo.charge_point_id,
        ocpp_evse_id: ocppInfo.ocpp_evse_id,
        evse_id,
      },
      result: callResult,
    };
  }

  // ── Case C: Station-level Trigger ─────────────────────────────────────────
  const chargePoints = await resolveChargePointsByLocation(locationId);
  if (chargePoints.length === 0) {
    const err = new Error(`No OCPP charge points are mapped to station '${locationId}'.`);
    err.statusCode = 404;
    err.code = 'NO_OCPP_CHARGE_POINTS';
    throw err;
  }

  if (chargePoints.length === 1) {
    const cp = chargePoints[0];
    const ocppPayload = { requestedMessage };

    const callResult = await ocppCallManager.sendCall(
      cp.charge_point_id,
      'TriggerMessage',
      ocppPayload,
      { timeoutMs }
    );

    if (callResult?.status === 'NotImplemented') {
      const err = new Error(`Charging station does not support triggering '${requestedMessage}'.`);
      err.statusCode = 501;
      err.code = 'NOT_IMPLEMENTED';
      throw err;
    }

    if (callResult?.status === 'Rejected') {
      const err = new Error(
        `Charging station rejected message trigger: ${callResult?.statusInfo?.reasonCode || 'Rejected'}`
      );
      err.statusCode = 409;
      err.code = 'TRIGGER_MESSAGE_REJECTED';
      throw err;
    }

    return {
      requestedMessage,
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
      ocppCallManager.sendCall(cp.charge_point_id, 'TriggerMessage', { requestedMessage }, { timeoutMs })
    )
  );

  const aggregated = [];
  let successCount = 0;
  let rejectedCount = 0;
  let notImplCount = 0;
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
      } else if (res?.status === 'NotImplemented') {
        notImplCount++;
        aggregated.push({ charge_point_id: cpId, status: 'NotImplemented' });
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

  if (successCount === 0) {
    if (notImplCount === chargePoints.length) {
      const err = new Error(`Charging stations do not implement triggering '${requestedMessage}'.`);
      err.statusCode = 501;
      err.code = 'NOT_IMPLEMENTED';
      throw err;
    }
    if (rejectedCount === chargePoints.length) {
      const err = new Error('All charging stations at this location rejected the message trigger.');
      err.statusCode = 409;
      err.code = 'TRIGGER_MESSAGE_REJECTED';
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
    throw primaryError || new Error('Failed to trigger message on stations.');
  }

  return {
    requestedMessage,
    scope: 'station',
    target: {
      location_id: locationId,
    },
    result: {
      status: 'Accepted',
    },
    results: aggregated,
  };
}
