/**
 * backend/src/services/chargingProfileService.js
 *
 * Smart Charging & Charging Profile Management Service for VahanGrid (Phase 3D.10).
 *
 * Responsibilities:
 *  1. Implements OCPP 2.0.1 outbound Smart Charging commands:
 *     - SetChargingProfile: Configures power/current limit profiles on station, EVSE, or transaction.
 *     - ClearChargingProfile: Clears profiles by ID or criteria.
 *  2. Resolves hierarchical target scopes:
 *     - Transaction/Session-level: session_id -> (chargePointId, ocppEvseId, transactionId)
 *     - Connector-level: connector_id -> (chargePointId, ocppEvseId)
 *     - EVSE-level: evse_id -> (chargePointId, ocppEvseId)
 *     - Station-level: location_id -> evseId 0 (or fan-out across all mapped charge points)
 *  3. Validates payloads against OCPP 2.0.1 specification rules and enums:
 *     - chargingProfilePurpose: 'ChargingStationMaxProfile' | 'TxDefaultProfile' | 'TxProfile'
 *     - chargingProfileKind: 'Absolute' | 'Recurring' | 'Relative'
 *     - chargingRateUnit: 'W' | 'A'
 *     - chargingSchedulePeriod: startPeriod >= 0, limit > 0
 *     - TxProfile requires valid transactionId and evseId > 0
 *     - ChargingStationMaxProfile requires evseId === 0
 *  4. Dispatches outbound CALL via ocppCallManager.sendCall().
 *  5. Preserves strict STATE AUTHORITY:
 *     - Acknowledged profile commands do NOT modify connectors.status, evses.status, or charging_sessions.status!
 *     - Telemetry (MeterValues) and protocol events (TransactionEvent) remain the sole authority for physical state.
 */

import { query } from '../config/database.js';
import ocppCallManager from '../ocpp/ocppCallManager.js';
import {
  resolveOcppIdentityByConnector,
  resolveOcppIdentityByEvse,
  resolveChargePointsByLocation,
  resolveOcppIdentityBySession,
} from './ocppMappingService.js';

// UUID validation regex (8-4-4-4-12 hex format)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(val) {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

// OCPP 2.0.1 Enums for Smart Charging
export const ALLOWED_PROFILE_PURPOSES = new Set([
  'ChargingStationMaxProfile',
  'TxDefaultProfile',
  'TxProfile',
]);

export const ALLOWED_PROFILE_KINDS = new Set([
  'Absolute',
  'Recurring',
  'Relative',
]);

export const ALLOWED_RECURRENCY_KINDS = new Set([
  'Daily',
  'Weekly',
]);

export const ALLOWED_RATE_UNITS = new Set([
  'W',
  'A',
]);

/**
 * Validates and normalizes an OCPP 2.0.1 ChargingProfile object.
 *
 * @param {object} profile - Raw charging profile payload
 * @returns {object} Validated chargingProfile object
 */
export function validateChargingProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    const err = new Error("The 'chargingProfile' object is required.");
    err.statusCode = 400;
    err.code = 'INVALID_CHARGING_PROFILE';
    throw err;
  }

  const {
    id,
    stackLevel,
    chargingProfilePurpose,
    chargingProfileKind,
    recurrencyKind,
    validFrom,
    validTo,
    transactionId,
    chargingSchedule,
  } = profile;

  // 1. Profile ID
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    const err = new Error("chargingProfile 'id' must be a positive integer.");
    err.statusCode = 400;
    err.code = 'INVALID_PROFILE_ID';
    throw err;
  }

  // 2. Stack Level
  if (typeof stackLevel !== 'number' || !Number.isInteger(stackLevel) || stackLevel < 0) {
    const err = new Error("chargingProfile 'stackLevel' must be a non-negative integer.");
    err.statusCode = 400;
    err.code = 'INVALID_STACK_LEVEL';
    throw err;
  }

  // 3. Charging Profile Purpose
  if (!chargingProfilePurpose || !ALLOWED_PROFILE_PURPOSES.has(chargingProfilePurpose)) {
    const err = new Error(
      `chargingProfilePurpose must be one of: ${Array.from(ALLOWED_PROFILE_PURPOSES).join(', ')}.`
    );
    err.statusCode = 400;
    err.code = 'INVALID_PROFILE_PURPOSE';
    throw err;
  }

  // 4. Charging Profile Kind
  if (!chargingProfileKind || !ALLOWED_PROFILE_KINDS.has(chargingProfileKind)) {
    const err = new Error(
      `chargingProfileKind must be one of: ${Array.from(ALLOWED_PROFILE_KINDS).join(', ')}.`
    );
    err.statusCode = 400;
    err.code = 'INVALID_PROFILE_KIND';
    throw err;
  }

  // 5. Recurrency Kind (optional)
  if (recurrencyKind !== undefined && recurrencyKind !== null) {
    if (!ALLOWED_RECURRENCY_KINDS.has(recurrencyKind)) {
      const err = new Error(
        `recurrencyKind must be one of: ${Array.from(ALLOWED_RECURRENCY_KINDS).join(', ')}.`
      );
      err.statusCode = 400;
      err.code = 'INVALID_RECURRENCY_KIND';
      throw err;
    }
  }

  // 6. Timestamps (validFrom, validTo)
  let parsedValidFrom = null;
  let parsedValidTo = null;

  if (validFrom !== undefined && validFrom !== null) {
    if (typeof validFrom !== 'string') {
      const err = new Error("validFrom must be an ISO 8601 date string.");
      err.statusCode = 400;
      err.code = 'INVALID_DATE';
      throw err;
    }
    parsedValidFrom = new Date(validFrom);
    if (isNaN(parsedValidFrom.getTime())) {
      const err = new Error("validFrom must be a valid ISO 8601 date.");
      err.statusCode = 400;
      err.code = 'INVALID_DATE';
      throw err;
    }
  }

  if (validTo !== undefined && validTo !== null) {
    if (typeof validTo !== 'string') {
      const err = new Error("validTo must be an ISO 8601 date string.");
      err.statusCode = 400;
      err.code = 'INVALID_DATE';
      throw err;
    }
    parsedValidTo = new Date(validTo);
    if (isNaN(parsedValidTo.getTime())) {
      const err = new Error("validTo must be a valid ISO 8601 date.");
      err.statusCode = 400;
      err.code = 'INVALID_DATE';
      throw err;
    }
  }

  if (parsedValidFrom && parsedValidTo && parsedValidTo < parsedValidFrom) {
    const err = new Error("validTo cannot be earlier than validFrom.");
    err.statusCode = 400;
    err.code = 'INVALID_DATE_RANGE';
    throw err;
  }

  // 7. Transaction ID (if purpose is TxProfile, must be string <= 36 chars if present)
  if (transactionId !== undefined && transactionId !== null) {
    if (typeof transactionId !== 'string' || transactionId.trim().length === 0 || transactionId.length > 36) {
      const err = new Error("transactionId must be a non-empty string with maximum 36 characters.");
      err.statusCode = 400;
      err.code = 'INVALID_TRANSACTION_ID';
      throw err;
    }
  }

  // 8. Charging Schedule
  if (!chargingSchedule || typeof chargingSchedule !== 'object' || Array.isArray(chargingSchedule)) {
    const err = new Error("chargingProfile 'chargingSchedule' is required.");
    err.statusCode = 400;
    err.code = 'INVALID_CHARGING_SCHEDULE';
    throw err;
  }

  const {
    id: schedId,
    startSchedule,
    duration,
    chargingRateUnit,
    minChargingRate,
    chargingSchedulePeriod,
  } = chargingSchedule;

  if (typeof schedId !== 'number' || !Number.isInteger(schedId) || schedId <= 0) {
    const err = new Error("chargingSchedule 'id' must be a positive integer.");
    err.statusCode = 400;
    err.code = 'INVALID_SCHEDULE_ID';
    throw err;
  }

  if (startSchedule !== undefined && startSchedule !== null) {
    if (typeof startSchedule !== 'string' || isNaN(new Date(startSchedule).getTime())) {
      const err = new Error("chargingSchedule 'startSchedule' must be a valid ISO 8601 date.");
      err.statusCode = 400;
      err.code = 'INVALID_DATE';
      throw err;
    }
  }

  if (duration !== undefined && duration !== null) {
    if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 0) {
      const err = new Error("chargingSchedule 'duration' must be a non-negative integer in seconds.");
      err.statusCode = 400;
      err.code = 'INVALID_DURATION';
      throw err;
    }
  }

  if (!chargingRateUnit || !ALLOWED_RATE_UNITS.has(chargingRateUnit)) {
    const err = new Error(
      `chargingRateUnit must be either 'W' (Watts) or 'A' (Amperes).`
    );
    err.statusCode = 400;
    err.code = 'INVALID_RATE_UNIT';
    throw err;
  }

  if (minChargingRate !== undefined && minChargingRate !== null) {
    if (typeof minChargingRate !== 'number' || !Number.isFinite(minChargingRate) || minChargingRate < 0) {
      const err = new Error("minChargingRate must be a non-negative number.");
      err.statusCode = 400;
      err.code = 'INVALID_MIN_CHARGING_RATE';
      throw err;
    }
  }

  // 9. Charging Schedule Period
  if (!Array.isArray(chargingSchedulePeriod) || chargingSchedulePeriod.length === 0) {
    const err = new Error("chargingSchedule 'chargingSchedulePeriod' must be a non-empty array.");
    err.statusCode = 400;
    err.code = 'INVALID_SCHEDULE_PERIOD';
    throw err;
  }

  const sanitizedPeriods = [];
  for (let i = 0; i < chargingSchedulePeriod.length; i++) {
    const p = chargingSchedulePeriod[i];
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      const err = new Error(`chargingSchedulePeriod[${i}] must be an object.`);
      err.statusCode = 400;
      err.code = 'INVALID_SCHEDULE_PERIOD';
      throw err;
    }

    if (typeof p.startPeriod !== 'number' || !Number.isInteger(p.startPeriod) || p.startPeriod < 0) {
      const err = new Error(`chargingSchedulePeriod[${i}].startPeriod must be a non-negative integer.`);
      err.statusCode = 400;
      err.code = 'INVALID_START_PERIOD';
      throw err;
    }

    if (typeof p.limit !== 'number' || !Number.isFinite(p.limit) || p.limit <= 0) {
      const err = new Error(`chargingSchedulePeriod[${i}].limit must be a positive number.`);
      err.statusCode = 400;
      err.code = 'INVALID_LIMIT';
      throw err;
    }

    const sanitizedPeriod = {
      startPeriod: p.startPeriod,
      limit: p.limit,
    };

    if (p.numberPhases !== undefined && p.numberPhases !== null) {
      if (![1, 2, 3].includes(p.numberPhases)) {
        const err = new Error(`chargingSchedulePeriod[${i}].numberPhases must be 1, 2, or 3.`);
        err.statusCode = 400;
        err.code = 'INVALID_NUMBER_PHASES';
        throw err;
      }
      sanitizedPeriod.numberPhases = p.numberPhases;
    }

    if (p.phaseToUse !== undefined && p.phaseToUse !== null) {
      if (![1, 2, 3].includes(p.phaseToUse)) {
        const err = new Error(`chargingSchedulePeriod[${i}].phaseToUse must be 1, 2, or 3.`);
        err.statusCode = 400;
        err.code = 'INVALID_PHASE_TO_USE';
        throw err;
      }
      sanitizedPeriod.phaseToUse = p.phaseToUse;
    }

    sanitizedPeriods.push(sanitizedPeriod);
  }

  // Construct canonical profile
  const canonical = {
    id,
    stackLevel,
    chargingProfilePurpose,
    chargingProfileKind,
    chargingSchedule: {
      id: schedId,
      chargingRateUnit,
      chargingSchedulePeriod: sanitizedPeriods,
    },
  };

  if (recurrencyKind) canonical.recurrencyKind = recurrencyKind;
  if (validFrom) canonical.validFrom = validFrom;
  if (validTo) canonical.validTo = validTo;
  if (transactionId) canonical.transactionId = transactionId;
  if (startSchedule) canonical.chargingSchedule.startSchedule = startSchedule;
  if (duration !== undefined && duration !== null) canonical.chargingSchedule.duration = duration;
  if (minChargingRate !== undefined && minChargingRate !== null) canonical.chargingSchedule.minChargingRate = minChargingRate;

  return canonical;
}

// ---------------------------------------------------------------------------
// 1. Set Charging Profile Operation
// ---------------------------------------------------------------------------

/**
 * Executes an OCPP 2.0.1 SetChargingProfile operation for a station, EVSE, connector, or session.
 *
 * @param {string} locationId - VahanGrid location UUID (locations.id)
 * @param {object} params - Request parameters
 * @param {object} params.chargingProfile - Charging profile definition
 * @param {string} [params.evse_id] - Optional VahanGrid EVSE UUID
 * @param {string} [params.connector_id] - Optional VahanGrid connector UUID
 * @param {string} [params.session_id] - Optional VahanGrid charging session UUID
 * @param {object} [options={}] - Options (e.g. timeoutMs, user)
 * @returns {Promise<object>} Standardized result object
 */
export async function setChargingProfile(locationId, params = {}, options = {}) {
  // ── 1. Validate Station (Location) ─────────────────────────────────────────
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

  // ── 2. Validate Profile Payload ───────────────────────────────────────────
  const profile = validateChargingProfile(params.chargingProfile);
  const { evse_id, connector_id, session_id } = params;
  const timeoutMs = options.timeoutMs || (params.timeoutMs ? Number(params.timeoutMs) : 10000);

  // ── 3. Scope Resolution ───────────────────────────────────────────────────

  // Case A: Transaction / Session-targeted Profile
  if (session_id) {
    if (!isValidUUID(session_id)) {
      const err = new Error("The requested 'session_id' must be a valid UUID.");
      err.statusCode = 400;
      err.code = 'INVALID_SESSION_ID';
      throw err;
    }

    const ocppSessionInfo = await resolveOcppIdentityBySession(session_id);
    if (!ocppSessionInfo) {
      const err = new Error(`Charging session '${session_id}' was not found.`);
      err.statusCode = 404;
      err.code = 'SESSION_NOT_FOUND';
      throw err;
    }

    // Verify session belongs to this station
    const sessionStationCheck = await query(
      `SELECT cs.id, cs.user_id, cs.status, e.location_id
       FROM charging_sessions cs
       JOIN connectors cn ON cs.connector_id = cn.id
       JOIN evses e ON cn.evse_id = e.id
       WHERE cs.id = $1`,
      [session_id]
    );

    if (sessionStationCheck.rows.length === 0 || sessionStationCheck.rows[0].location_id !== locationId) {
      const err = new Error(`Session '${session_id}' does not belong to station '${locationId}'.`);
      err.statusCode = 404;
      err.code = 'SESSION_NOT_FOUND';
      throw err;
    }

    // Session authorization check: if user is not admin/operator, ensure they own the session
    if (options.user && options.user.role !== 'admin' && options.user.role !== 'operator') {
      if (sessionStationCheck.rows[0].user_id !== options.user.id) {
        const err = new Error('You are not authorized to modify charging profiles for this session.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    if (!ocppSessionInfo.transaction_id) {
      const err = new Error(`Session '${session_id}' does not have an active OCPP transaction.`);
      err.statusCode = 400;
      err.code = 'NO_ACTIVE_TRANSACTION';
      throw err;
    }

    // If purpose is TxProfile, transactionId must match
    if (profile.chargingProfilePurpose === 'TxProfile') {
      profile.transactionId = ocppSessionInfo.transaction_id;
    }

    const ocppEvseId = ocppSessionInfo.ocpp_evse_id || 1;
    const targetChargePointId = ocppSessionInfo.charge_point_id;

    if (!targetChargePointId) {
      const err = new Error(`Session '${session_id}' is not mapped to an active OCPP charge point.`);
      err.statusCode = 404;
      err.code = 'NO_OCPP_CHARGE_POINTS';
      throw err;
    }

    const ocppPayload = {
      evseId: ocppEvseId,
      chargingProfile: profile,
    };

    const callResult = await ocppCallManager.sendCall(
      targetChargePointId,
      'SetChargingProfile',
      ocppPayload,
      { timeoutMs }
    );

    if (callResult?.status === 'Rejected') {
      const rejErr = new Error(
        `Charging station rejected charging profile: ${callResult?.statusInfo?.reasonCode || 'Rejected'}`
      );
      rejErr.statusCode = 409;
      rejErr.code = 'CHARGING_PROFILE_REJECTED';
      throw rejErr;
    }

    return {
      status: callResult?.status || 'Accepted',
      scope: 'transaction',
      target: {
        location_id: locationId,
        session_id,
        transaction_id: ocppSessionInfo.transaction_id,
        charge_point_id: targetChargePointId,
        ocpp_evse_id: ocppEvseId,
      },
      chargingProfile: profile,
      result: callResult,
    };
  }

  // Case B: Connector-level Profile
  if (connector_id) {
    if (!isValidUUID(connector_id)) {
      const err = new Error("The requested 'connector_id' must be a valid UUID.");
      err.statusCode = 400;
      err.code = 'INVALID_CONNECTOR_ID';
      throw err;
    }

    if (profile.chargingProfilePurpose === 'ChargingStationMaxProfile') {
      const err = new Error(
        "chargingProfilePurpose 'ChargingStationMaxProfile' applies to the entire station (evseId 0) and cannot target a specific connector."
      );
      err.statusCode = 400;
      err.code = 'INVALID_PROFILE_SCOPE';
      throw err;
    }

    const connCheck = await query(
      `SELECT cn.id, cn.evse_id, e.location_id
       FROM connectors cn
       JOIN evses e ON cn.evse_id = e.id
       WHERE cn.id = $1`,
      [connector_id]
    );

    if (connCheck.rows.length === 0 || connCheck.rows[0].location_id !== locationId) {
      const err = new Error(`Connector with ID '${connector_id}' was not found at this station.`);
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

    if (profile.chargingProfilePurpose === 'TxProfile' && !profile.transactionId) {
      const err = new Error("chargingProfilePurpose 'TxProfile' requires an active 'transactionId' or 'session_id'.");
      err.statusCode = 400;
      err.code = 'TRANSACTION_ID_REQUIRED';
      throw err;
    }

    const ocppPayload = {
      evseId: ocppInfo.ocpp_evse_id,
      chargingProfile: profile,
    };

    const callResult = await ocppCallManager.sendCall(
      ocppInfo.charge_point_id,
      'SetChargingProfile',
      ocppPayload,
      { timeoutMs }
    );

    if (callResult?.status === 'Rejected') {
      const rejErr = new Error(
        `Charging station rejected charging profile: ${callResult?.statusInfo?.reasonCode || 'Rejected'}`
      );
      rejErr.statusCode = 409;
      rejErr.code = 'CHARGING_PROFILE_REJECTED';
      throw rejErr;
    }

    return {
      status: callResult?.status || 'Accepted',
      scope: 'connector',
      target: {
        location_id: locationId,
        connector_id,
        charge_point_id: ocppInfo.charge_point_id,
        ocpp_evse_id: ocppInfo.ocpp_evse_id,
      },
      chargingProfile: profile,
      result: callResult,
    };
  }

  // Case C: EVSE-level Profile
  if (evse_id) {
    if (!isValidUUID(evse_id)) {
      const err = new Error("The requested 'evse_id' must be a valid UUID.");
      err.statusCode = 400;
      err.code = 'INVALID_EVSE_ID';
      throw err;
    }

    if (profile.chargingProfilePurpose === 'ChargingStationMaxProfile') {
      const err = new Error(
        "chargingProfilePurpose 'ChargingStationMaxProfile' applies to the entire station (evseId 0) and cannot target a specific EVSE."
      );
      err.statusCode = 400;
      err.code = 'INVALID_PROFILE_SCOPE';
      throw err;
    }

    const evseCheck = await query('SELECT id, location_id FROM evses WHERE id = $1', [evse_id]);
    if (evseCheck.rows.length === 0 || evseCheck.rows[0].location_id !== locationId) {
      const err = new Error(`EVSE with ID '${evse_id}' was not found at this station.`);
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

    if (profile.chargingProfilePurpose === 'TxProfile' && !profile.transactionId) {
      const err = new Error("chargingProfilePurpose 'TxProfile' requires an active 'transactionId' or 'session_id'.");
      err.statusCode = 400;
      err.code = 'TRANSACTION_ID_REQUIRED';
      throw err;
    }

    const ocppPayload = {
      evseId: ocppInfo.ocpp_evse_id,
      chargingProfile: profile,
    };

    const callResult = await ocppCallManager.sendCall(
      ocppInfo.charge_point_id,
      'SetChargingProfile',
      ocppPayload,
      { timeoutMs }
    );

    if (callResult?.status === 'Rejected') {
      const rejErr = new Error(
        `Charging station rejected charging profile: ${callResult?.statusInfo?.reasonCode || 'Rejected'}`
      );
      rejErr.statusCode = 409;
      rejErr.code = 'CHARGING_PROFILE_REJECTED';
      throw rejErr;
    }

    return {
      status: callResult?.status || 'Accepted',
      scope: 'evse',
      target: {
        location_id: locationId,
        evse_id,
        charge_point_id: ocppInfo.charge_point_id,
        ocpp_evse_id: ocppInfo.ocpp_evse_id,
      },
      chargingProfile: profile,
      result: callResult,
    };
  }

  // Case D: Station-level Profile (evseId = 0)
  if (profile.chargingProfilePurpose === 'TxProfile') {
    const err = new Error("chargingProfilePurpose 'TxProfile' cannot be set at station-level without an EVSE or transaction.");
    err.statusCode = 400;
    err.code = 'INVALID_PROFILE_SCOPE';
    throw err;
  }

  const chargePoints = await resolveChargePointsByLocation(locationId);
  if (chargePoints.length === 0) {
    const err = new Error(`No OCPP charge points are mapped to station '${locationId}'.`);
    err.statusCode = 404;
    err.code = 'NO_OCPP_CHARGE_POINTS';
    throw err;
  }

  const ocppPayload = {
    evseId: 0,
    chargingProfile: profile,
  };

  // Single charge point station
  if (chargePoints.length === 1) {
    const cp = chargePoints[0];
    const callResult = await ocppCallManager.sendCall(
      cp.charge_point_id,
      'SetChargingProfile',
      ocppPayload,
      { timeoutMs }
    );

    if (callResult?.status === 'Rejected') {
      const rejErr = new Error(
        `Charging station rejected charging profile: ${callResult?.statusInfo?.reasonCode || 'Rejected'}`
      );
      rejErr.statusCode = 409;
      rejErr.code = 'CHARGING_PROFILE_REJECTED';
      throw rejErr;
    }

    return {
      status: callResult?.status || 'Accepted',
      scope: 'station',
      target: {
        location_id: locationId,
        charge_point_id: cp.charge_point_id,
        evseId: 0,
      },
      chargingProfile: profile,
      result: callResult,
      results: [
        {
          charge_point_id: cp.charge_point_id,
          status: callResult?.status || 'Accepted',
        },
      ],
    };
  }

  // Multi-charge-point station fan-out
  const results = await Promise.allSettled(
    chargePoints.map((cp) =>
      ocppCallManager.sendCall(cp.charge_point_id, 'SetChargingProfile', ocppPayload, { timeoutMs })
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
      const err = new Error('All charging stations at this location rejected the charging profile.');
      err.statusCode = 409;
      err.code = 'CHARGING_PROFILE_REJECTED';
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
    const err = primaryError || new Error('Failed to set charging profile across stations at this location.');
    err.statusCode = err.statusCode || 500;
    throw err;
  }

  return {
    status: successCount === chargePoints.length ? 'Accepted' : 'PartiallyAccepted',
    scope: 'station',
    target: {
      location_id: locationId,
      evseId: 0,
    },
    chargingProfile: profile,
    results: aggregated,
  };
}

// ---------------------------------------------------------------------------
// 2. Clear Charging Profile Operation
// ---------------------------------------------------------------------------

/**
 * Executes an OCPP 2.0.1 ClearChargingProfile operation for a station or specific EVSE/profile.
 *
 * @param {string} locationId - VahanGrid location UUID (locations.id)
 * @param {object} params - Request parameters / query filters
 * @param {number} [params.chargingProfileId] - Optional profile ID to clear
 * @param {object} [params.chargingProfileCriteria] - Optional criteria object
 * @param {string} [params.evse_id] - Optional VahanGrid EVSE UUID
 * @param {string} [params.connector_id] - Optional VahanGrid connector UUID
 * @param {string} [params.chargingProfilePurpose] - Optional purpose filter
 * @param {number} [params.stackLevel] - Optional stackLevel filter
 * @param {object} [options={}] - Options (e.g. timeoutMs)
 * @returns {Promise<object>} Standardized result object
 */
export async function clearChargingProfile(locationId, params = {}, options = {}) {
  // ── 1. Validate Station (Location) ─────────────────────────────────────────
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

  const timeoutMs = options.timeoutMs || (params.timeoutMs ? Number(params.timeoutMs) : 10000);

  // Extract parameters
  let {
    chargingProfileId,
    chargingProfileCriteria,
    evse_id,
    connector_id,
    chargingProfilePurpose,
    stackLevel,
  } = params;

  // Ensure chargingProfileId is number if provided
  if (chargingProfileId !== undefined && chargingProfileId !== null) {
    if (typeof chargingProfileId === 'string') chargingProfileId = parseInt(chargingProfileId, 10);
    if (typeof chargingProfileId !== 'number' || !Number.isInteger(chargingProfileId) || chargingProfileId <= 0) {
      const err = new Error("chargingProfileId must be a positive integer.");
      err.statusCode = 400;
      err.code = 'INVALID_PROFILE_ID';
      throw err;
    }
  }

  // Handle criteria mapping
  let criteria = null;
  if (chargingProfileCriteria && typeof chargingProfileCriteria === 'object') {
    criteria = { ...chargingProfileCriteria };
  } else if (chargingProfilePurpose || stackLevel !== undefined) {
    criteria = {};
    if (chargingProfilePurpose) criteria.chargingProfilePurpose = chargingProfilePurpose;
    if (stackLevel !== undefined) criteria.stackLevel = stackLevel;
  }

  if (criteria) {
    if (criteria.chargingProfilePurpose && !ALLOWED_PROFILE_PURPOSES.has(criteria.chargingProfilePurpose)) {
      const err = new Error(
        `chargingProfilePurpose in criteria must be one of: ${Array.from(ALLOWED_PROFILE_PURPOSES).join(', ')}.`
      );
      err.statusCode = 400;
      err.code = 'INVALID_PROFILE_PURPOSE';
      throw err;
    }
    if (criteria.stackLevel !== undefined && criteria.stackLevel !== null) {
      if (typeof criteria.stackLevel === 'string') criteria.stackLevel = parseInt(criteria.stackLevel, 10);
      if (typeof criteria.stackLevel !== 'number' || !Number.isInteger(criteria.stackLevel) || criteria.stackLevel < 0) {
        const err = new Error("stackLevel in criteria must be a non-negative integer.");
        err.statusCode = 400;
        err.code = 'INVALID_STACK_LEVEL';
        throw err;
      }
    }
  }

  // Check that at least one filter criterion is provided
  if (!chargingProfileId && !criteria && !evse_id && !connector_id) {
    const err = new Error(
      "At least one filter criterion (chargingProfileId, chargingProfileCriteria, evse_id, or connector_id) must be specified."
    );
    err.statusCode = 400;
    err.code = 'MISSING_CLEAR_CRITERIA';
    throw err;
  }

  // ── 2. Scope & Target Resolution ──────────────────────────────────────────

  // Case A: Specific Connector
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

    if (connCheck.rows.length === 0 || connCheck.rows[0].location_id !== locationId) {
      const err = new Error(`Connector with ID '${connector_id}' was not found at this station.`);
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

    if (!criteria) criteria = {};
    criteria.evseId = ocppInfo.ocpp_evse_id;

    const ocppPayload = {};
    if (chargingProfileId) ocppPayload.chargingProfileId = chargingProfileId;
    if (criteria && Object.keys(criteria).length > 0) ocppPayload.chargingProfileCriteria = criteria;

    const callResult = await ocppCallManager.sendCall(
      ocppInfo.charge_point_id,
      'ClearChargingProfile',
      ocppPayload,
      { timeoutMs }
    );

    return {
      status: callResult?.status || 'Accepted',
      cleared: callResult?.status === 'Accepted',
      scope: 'connector',
      target: {
        location_id: locationId,
        connector_id,
        charge_point_id: ocppInfo.charge_point_id,
        ocpp_evse_id: ocppInfo.ocpp_evse_id,
      },
      filters: ocppPayload,
      result: callResult,
    };
  }

  // Case B: Specific EVSE
  if (evse_id) {
    if (!isValidUUID(evse_id)) {
      const err = new Error("The requested 'evse_id' must be a valid UUID.");
      err.statusCode = 400;
      err.code = 'INVALID_EVSE_ID';
      throw err;
    }

    const evseCheck = await query('SELECT id, location_id FROM evses WHERE id = $1', [evse_id]);
    if (evseCheck.rows.length === 0 || evseCheck.rows[0].location_id !== locationId) {
      const err = new Error(`EVSE with ID '${evse_id}' was not found at this station.`);
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

    if (!criteria) criteria = {};
    criteria.evseId = ocppInfo.ocpp_evse_id;

    const ocppPayload = {};
    if (chargingProfileId) ocppPayload.chargingProfileId = chargingProfileId;
    if (criteria && Object.keys(criteria).length > 0) ocppPayload.chargingProfileCriteria = criteria;

    const callResult = await ocppCallManager.sendCall(
      ocppInfo.charge_point_id,
      'ClearChargingProfile',
      ocppPayload,
      { timeoutMs }
    );

    return {
      status: callResult?.status || 'Accepted',
      cleared: callResult?.status === 'Accepted',
      scope: 'evse',
      target: {
        location_id: locationId,
        evse_id,
        charge_point_id: ocppInfo.charge_point_id,
        ocpp_evse_id: ocppInfo.ocpp_evse_id,
      },
      filters: ocppPayload,
      result: callResult,
    };
  }

  // Case C: Station-level Clear
  const chargePoints = await resolveChargePointsByLocation(locationId);
  if (chargePoints.length === 0) {
    const err = new Error(`No OCPP charge points are mapped to station '${locationId}'.`);
    err.statusCode = 404;
    err.code = 'NO_OCPP_CHARGE_POINTS';
    throw err;
  }

  const ocppPayload = {};
  if (chargingProfileId) ocppPayload.chargingProfileId = chargingProfileId;
  if (criteria && Object.keys(criteria).length > 0) ocppPayload.chargingProfileCriteria = criteria;

  if (chargePoints.length === 1) {
    const cp = chargePoints[0];
    const callResult = await ocppCallManager.sendCall(
      cp.charge_point_id,
      'ClearChargingProfile',
      ocppPayload,
      { timeoutMs }
    );

    return {
      status: callResult?.status || 'Accepted',
      cleared: callResult?.status === 'Accepted',
      scope: 'station',
      target: {
        location_id: locationId,
        charge_point_id: cp.charge_point_id,
      },
      filters: ocppPayload,
      result: callResult,
      results: [
        {
          charge_point_id: cp.charge_point_id,
          status: callResult?.status || 'Accepted',
        },
      ],
    };
  }

  // Multi-charge-point station fan-out
  const results = await Promise.allSettled(
    chargePoints.map((cp) =>
      ocppCallManager.sendCall(cp.charge_point_id, 'ClearChargingProfile', ocppPayload, { timeoutMs })
    )
  );

  const aggregated = [];
  let acceptedCount = 0;
  let unknownCount = 0;
  let offlineCount = 0;
  let timeoutCount = 0;
  let primaryError = null;

  results.forEach((outcome, idx) => {
    const cpId = chargePoints[idx].charge_point_id;
    if (outcome.status === 'fulfilled') {
      const res = outcome.value;
      if (res?.status === 'Accepted') {
        acceptedCount++;
        aggregated.push({ charge_point_id: cpId, status: 'Accepted' });
      } else {
        unknownCount++;
        aggregated.push({ charge_point_id: cpId, status: res?.status || 'Unknown' });
      }
    } else {
      const err = outcome.reason;
      if (!primaryError) primaryError = err;
      if (err.code === 'STATION_OFFLINE') offlineCount++;
      else if (err.code === 'STATION_TIMEOUT') timeoutCount++;
      aggregated.push({ charge_point_id: cpId, error: err.message, code: err.code || 'ERROR' });
    }
  });

  if (acceptedCount === 0 && unknownCount === 0) {
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
    const err = primaryError || new Error('Failed to clear charging profile across stations at this location.');
    err.statusCode = err.statusCode || 500;
    throw err;
  }

  return {
    status: acceptedCount > 0 ? 'Accepted' : 'Unknown',
    cleared: acceptedCount > 0,
    scope: 'station',
    target: {
      location_id: locationId,
    },
    filters: ocppPayload,
    results: aggregated,
  };
}
