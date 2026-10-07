/**
 * src/ocpp/handlers/transactionEventHandler.js
 *
 * OCPP 2.0.1 TransactionEvent Request Handler (Phase 3D.6A / 3D.6B).
 *
 * Responsibilities:
 *  1. Validates TransactionEventRequest schema according to OCPP 2.0.1 specification.
 *  2. Dispatches based on eventType ('Started', 'Updated', 'Ended').
 *  3. Maintains the persistent ocpp_transactions table as the authoritative protocol ledger.
 *  4. Manages the lifecycle bridge to VahanGrid charging_sessions:
 *     - If an active VahanGrid session exists on the mapped connector:
 *       links session_id and populates charging_sessions.external_session_id.
 *     - If no session exists: preserves session_id = NULL (never invents a user).
 *  5. Enforces monotonic seqNo ordering and idempotency protection against duplicates.
 *  6. Synchronizes physical connector status (Started -> 'charging', Ended -> 'available').
 *  7. Phase 3D.6B: Safely processes energy information carried in TransactionEvent meterValue[]:
 *     - Focuses strictly on "Energy.Active.Import.Register" (in Wh / kWh).
 *     - Validates measurand, unit, numeric value, timestamp, and structure.
 *     - Distinguishes cumulative meter register reading from session net energy consumed:
 *       Started captures baseline meter_start_wh.
 *       Updated / Ended records meter_stop_wh and computes total_energy_kwh as delta / 1000.
 *     - Synchronizes net energy with linked active charging_sessions without corrupting state.
 *  8. Returns standard OCPP 2.0.1 CALLRESULT {}.
 */

import { OcppError, ERROR_CODES } from '../ocppErrors.js';
import pool from '../../config/database.js';
import {
  resolveChargePoint,
  resolveConnectorMapping,
  resolveEvseMapping,
} from '../../services/ocppMappingService.js';

const VALID_EVENT_TYPES = new Set(['Started', 'Updated', 'Ended']);

/**
 * Parse and validate energy meter reading in Wh from an OCPP 2.0.1 meterValue array or object.
 *
 * Requirements:
 * - Focuses strictly on measurand "Energy.Active.Import.Register".
 * - If measurand is omitted or null/undefined, defaults to "Energy.Active.Import.Register" (per OCPP 2.0.1 spec).
 * - Supported units: Wh (default), kWh (converted to Wh).
 * - Non-energy measurands (Power, Current, SoC, Voltage, etc.) or unsupported units (W, A, V, var, etc.) are safely ignored.
 * - Value must be a valid, finite non-negative number.
 * - If timestamp is provided, it must be a valid ISO 8601 string.
 *
 * @param {Array<object>|object} meterValue - OCPP 2.0.1 meterValue payload
 * @returns {number|null} Cumulative meter reading in Wh, or null if no valid reading found.
 */
export function parseMeterReadingWh(meterValue) {
  if (!meterValue) return null;
  const mvList = Array.isArray(meterValue) ? meterValue : [meterValue];
  if (mvList.length === 0) return null;

  let latestReadingWh = null;

  for (const mv of mvList) {
    if (!mv || typeof mv !== 'object' || Array.isArray(mv)) continue;

    // Validate timestamp if present
    if (mv.timestamp !== undefined && mv.timestamp !== null) {
      if (typeof mv.timestamp !== 'string') continue;
      const d = new Date(mv.timestamp);
      if (isNaN(d.getTime())) continue;
    }

    if (!Array.isArray(mv.sampledValue)) continue;

    for (const sv of mv.sampledValue) {
      if (!sv || typeof sv !== 'object' || Array.isArray(sv)) continue;

      // Measurand: Default in OCPP 2.0.1 is 'Energy.Active.Import.Register'
      let measurand = 'Energy.Active.Import.Register';
      if (sv.measurand !== undefined && sv.measurand !== null) {
        if (typeof sv.measurand !== 'string') continue;
        measurand = sv.measurand.trim();
      }

      if (measurand !== 'Energy.Active.Import.Register') {
        continue;
      }

      // Value validation
      if (sv.value === undefined || sv.value === null || sv.value === '') continue;
      const num = typeof sv.value === 'number' ? sv.value : parseFloat(sv.value);
      if (!Number.isFinite(num) || num < 0) continue;

      // Unit validation
      let rawUnit = 'Wh';
      if (sv.unitOfMeasure !== undefined && sv.unitOfMeasure !== null) {
        if (typeof sv.unitOfMeasure === 'string') {
          rawUnit = sv.unitOfMeasure.trim();
        } else if (typeof sv.unitOfMeasure === 'object' && typeof sv.unitOfMeasure.unit === 'string') {
          rawUnit = sv.unitOfMeasure.unit.trim();
        } else {
          continue;
        }
      }

      const unitLower = rawUnit.toLowerCase();
      let whVal = null;
      if (unitLower === 'wh' || unitLower === 'w.h' || unitLower === 'w·h') {
        whVal = num;
      } else if (unitLower === 'kwh' || unitLower === 'kw.h' || unitLower === 'kw·h') {
        whVal = num * 1000.0;
      } else {
        // Unsupported unit for active energy register (e.g. W, kW, A, V, Percent, Celsius, kvarh)
        continue;
      }

      latestReadingWh = whVal;
    }
  }

  return latestReadingWh;
}

/**
 * Main handler for OCPP 2.0.1 TransactionEvent CALL messages.
 *
 * @param {object} payload - TransactionEventRequest payload
 * @param {string} chargePointId - Charge point identifier from WebSocket path
 * @param {import('ws').WebSocket} ws - Active WebSocket connection
 * @returns {Promise<object>} Empty object {} for CALLRESULT
 */
export async function handleTransactionEvent(payload, chargePointId, ws) {
  // ── 1. Top-level payload validation ───────────────────────────────────────
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'TransactionEvent payload must be a JSON object'
    );
  }

  const {
    eventType,
    timestamp,
    triggerReason,
    seqNo,
    transactionInfo,
    evse,
    idToken,
    meterValue,
  } = payload;

  // Validate eventType
  if (!eventType || typeof eventType !== 'string' || !VALID_EVENT_TYPES.has(eventType)) {
    throw new OcppError(
      ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
      `Invalid or missing eventType "${eventType}". Expected one of: Started, Updated, Ended`
    );
  }

  // Validate timestamp
  if (!timestamp || typeof timestamp !== 'string' || timestamp.trim().length === 0) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or invalid required field "timestamp" in TransactionEventRequest'
    );
  }

  const parsedTimestamp = new Date(timestamp);
  if (isNaN(parsedTimestamp.getTime())) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      `Field "timestamp" must be a valid ISO 8601 date-time string: "${timestamp}"`
    );
  }

  // Validate triggerReason
  if (!triggerReason || typeof triggerReason !== 'string' || triggerReason.trim().length === 0) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or invalid required field "triggerReason" in TransactionEventRequest'
    );
  }

  // Validate seqNo
  if (seqNo === undefined || seqNo === null || typeof seqNo !== 'number' || !Number.isInteger(seqNo)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or invalid required field "seqNo" in TransactionEventRequest (must be an integer)'
    );
  }

  if (seqNo < 0) {
    throw new OcppError(
      ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
      'Field "seqNo" must be greater than or equal to 0'
    );
  }

  // Validate transactionInfo
  if (!transactionInfo || typeof transactionInfo !== 'object' || Array.isArray(transactionInfo)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or invalid required object "transactionInfo" in TransactionEventRequest'
    );
  }

  const { transactionId, chargingState, stoppedReason } = transactionInfo;

  if (!transactionId || typeof transactionId !== 'string' || transactionId.trim().length === 0) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or empty required field "transactionInfo.transactionId"'
    );
  }

  if (transactionId.length > 36) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Field "transactionInfo.transactionId" exceeds maximum length of 36 characters'
    );
  }

  const cleanTransactionId = transactionId.trim();

  // Validate optional idToken if present
  if (idToken !== undefined && idToken !== null) {
    if (typeof idToken !== 'object' || Array.isArray(idToken) || !idToken.idToken) {
      throw new OcppError(
        ERROR_CODES.FORMAT_VIOLATION,
        'Field "idToken" must be an object with an "idToken" string property'
      );
    }
  }

  // ── 2. Resolve Charge Point ───────────────────────────────────────────────
  const cpRecord = await resolveChargePoint(chargePointId);
  if (!cpRecord) {
    throw new OcppError(
      ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
      `Charge point "${chargePointId}" is not registered in CSMS`
    );
  }

  const ocppChargePointUUID = cpRecord.id;

  // ── 3. Dispatch by eventType ──────────────────────────────────────────────
  if (eventType === 'Started') {
    return await handleStartedEvent({
      ocppChargePointUUID,
      chargePointId,
      transactionId: cleanTransactionId,
      seqNo,
      parsedTimestamp,
      triggerReason: triggerReason.trim(),
      chargingState: chargingState ? chargingState.trim() : null,
      idToken,
      evse,
      meterValue,
    });
  } else if (eventType === 'Updated') {
    return await handleUpdatedEvent({
      ocppChargePointUUID,
      chargePointId,
      transactionId: cleanTransactionId,
      seqNo,
      parsedTimestamp,
      triggerReason: triggerReason.trim(),
      chargingState: chargingState ? chargingState.trim() : null,
      meterValue,
    });
  } else if (eventType === 'Ended') {
    return await handleEndedEvent({
      ocppChargePointUUID,
      chargePointId,
      transactionId: cleanTransactionId,
      seqNo,
      parsedTimestamp,
      triggerReason: triggerReason.trim(),
      stoppedReason: stoppedReason ? stoppedReason.trim() : null,
      chargingState: chargingState ? chargingState.trim() : null,
      meterValue,
    });
  }

  return {};
}

// ---------------------------------------------------------------------------
// Started Event Handler
// ---------------------------------------------------------------------------

async function handleStartedEvent({
  ocppChargePointUUID,
  chargePointId,
  transactionId,
  seqNo,
  parsedTimestamp,
  triggerReason,
  chargingState,
  idToken,
  evse,
  meterValue,
}) {
  // Validate EVSE object for Started event
  if (!evse || typeof evse !== 'object' || Array.isArray(evse)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'TransactionEvent(Started) requires an "evse" object'
    );
  }

  if (evse.id === undefined || evse.id === null || typeof evse.id !== 'number' || !Number.isInteger(evse.id)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Field "evse.id" must be an integer'
    );
  }

  if (evse.id <= 0) {
    throw new OcppError(
      ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
      `Invalid evseId "${evse.id}". Transactions cannot start on evseId <= 0`
    );
  }

  const ocppEvseId = evse.id;
  const ocppConnectorId =
    evse.connectorId !== undefined && evse.connectorId !== null && Number.isInteger(evse.connectorId)
      ? evse.connectorId
      : 1;

  // Resolve physical mapping via ocppMappingService
  let mapping = await resolveConnectorMapping(chargePointId, ocppEvseId, ocppConnectorId);

  // Fallback: If connectorId not explicitly mapped or omitted, resolve EVSE mapping
  if (!mapping) {
    const evseMapping = await resolveEvseMapping(chargePointId, ocppEvseId);
    if (!evseMapping) {
      throw new OcppError(
        ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
        `Unmapped EVSE identity: chargePointId="${chargePointId}", evseId=${ocppEvseId}`
      );
    }

    // Check if there is a default connector mapped under this EVSE
    const client = await pool.connect();
    try {
      const connRes = await client.query(
        `SELECT connector_id FROM ocpp_connector_mappings
         WHERE ocpp_evse_mapping_id = $1
         ORDER BY ocpp_connector_id ASC LIMIT 1`,
        [evseMapping.mappingId]
      );
      if (connRes.rows.length > 0) {
        mapping = {
          connectorId: connRes.rows[0].connector_id,
          evseId: evseMapping.evseId,
          mappingId: evseMapping.mappingId,
        };
      }
    } finally {
      client.release();
    }
  }

  if (!mapping || !mapping.connectorId) {
    throw new OcppError(
      ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
      `Unmapped connector identity: chargePointId="${chargePointId}", evseId=${ocppEvseId}, connectorId=${ocppConnectorId}`
    );
  }

  const physicalConnectorUUID = mapping.connectorId;

  // Extract starting meter reading if present (Phase 3D.6B)
  const startMeterWh = parseMeterReadingWh(meterValue);

  // Start database transaction with row locking
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock existing transaction row for (ocpp_charge_point_id, transaction_id) if it exists
    const existingTx = await client.query(
      `SELECT id, status, seq_no FROM ocpp_transactions
       WHERE ocpp_charge_point_id = $1 AND transaction_id = $2
       FOR UPDATE`,
      [ocppChargePointUUID, transactionId]
    );

    // 2. Duplicate Started check (idempotency)
    if (existingTx.rows.length > 0) {
      console.log(
        `[OCPP] [${chargePointId}] Duplicate TransactionEvent(Started) received for transaction "${transactionId}". Acknowledging without state mutation.`
      );
      await client.query('COMMIT');
      return {};
    }

    // 3. Check if an active or pending VahanGrid session exists for this connector
    let linkedSessionId = null;
    const activeSessionRes = await client.query(
      `SELECT id, user_id, status FROM charging_sessions
       WHERE connector_id = $1 AND status IN ('active', 'pending')
       ORDER BY started_at DESC
       LIMIT 1
       FOR UPDATE`,
      [physicalConnectorUUID]
    );

    if (activeSessionRes.rows.length > 0) {
      linkedSessionId = activeSessionRes.rows[0].id;
      // Link external_session_id and ensure session is transitioned to 'active'
      await client.query(
        `UPDATE charging_sessions
         SET external_session_id = $1,
             status = 'active',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [transactionId, linkedSessionId]
      );
      // Ensure physical connector is set to 'charging'
      await client.query(
        `UPDATE connectors
         SET status = 'charging',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [physicalConnectorUUID]
      );
      console.log(
        `[OCPP] [${chargePointId}] Linked OCPP transaction "${transactionId}" to existing VahanGrid session "${linkedSessionId}" (status: active)`
      );
    } else {
      console.log(
        `[OCPP] [${chargePointId}] No active or pending VahanGrid session found for connector "${physicalConnectorUUID}". Preserving session_id = NULL.`
      );
    }

    // 4. Insert into ocpp_transactions (with meter_start_wh populated)
    await client.query(
      `INSERT INTO ocpp_transactions (
         ocpp_charge_point_id, transaction_id, seq_no,
         ocpp_evse_id, ocpp_connector_id, connector_id,
         session_id, id_token, id_token_type,
         charging_state, trigger_reason, started_at, status,
         meter_start_wh
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active', $13)`,
      [
        ocppChargePointUUID,
        transactionId,
        seqNo,
        ocppEvseId,
        ocppConnectorId,
        physicalConnectorUUID,
        linkedSessionId,
        idToken ? idToken.idToken : null,
        idToken ? idToken.type || null : null,
        chargingState || 'Charging',
        triggerReason,
        parsedTimestamp,
        startMeterWh,
      ]
    );

    // 5. Update physical connector status to 'charging'
    await client.query(
      `UPDATE connectors
       SET status = 'charging',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [physicalConnectorUUID]
    );

    await client.query('COMMIT');

    console.log(
      `[OCPP] [${chargePointId}] TransactionEvent(Started) processed — tx: "${transactionId}", connector: ${physicalConnectorUUID}, startMeter: ${startMeterWh !== null ? startMeterWh + ' Wh' : 'null'}, status: charging`
    );

    return {};
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Updated Event Handler
// ---------------------------------------------------------------------------

async function handleUpdatedEvent({
  ocppChargePointUUID,
  chargePointId,
  transactionId,
  seqNo,
  parsedTimestamp,
  triggerReason,
  chargingState,
  meterValue,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock transaction record by (ocpp_charge_point_id, transaction_id)
    const txRes = await client.query(
      `SELECT id, seq_no, status, session_id, connector_id, meter_start_wh, total_energy_kwh FROM ocpp_transactions
       WHERE ocpp_charge_point_id = $1 AND transaction_id = $2
       FOR UPDATE`,
      [ocppChargePointUUID, transactionId]
    );

    if (txRes.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new OcppError(
        ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
        `Transaction "${transactionId}" not found on charge point for Updated event`
      );
    }

    const currentTx = txRes.rows[0];

    // Monotonic sequence verification: if incoming seqNo <= stored seq_no, ignore as duplicate/stale
    if (seqNo <= currentTx.seq_no) {
      console.log(
        `[OCPP] [${chargePointId}] Stale or duplicate TransactionEvent(Updated) (seqNo: ${seqNo} <= current: ${currentTx.seq_no}) for tx "${transactionId}". Acknowledging without mutation.`
      );
      await client.query('COMMIT');
      return {};
    }

    // Extract energy if valid Energy.Active.Import.Register meterValue is present (Phase 3D.6B)
    const currentMeterWh = parseMeterReadingWh(meterValue);

    if (currentMeterWh !== null) {
      // Distinguish cumulative meter reading from session net energy consumed
      const startWh = currentTx.meter_start_wh !== null ? parseFloat(currentTx.meter_start_wh) : 0;
      const consumedWh = Math.max(0, currentMeterWh - startWh);
      const consumedKwh = consumedWh / 1000.0;

      await client.query(
        `UPDATE ocpp_transactions
         SET seq_no = $1,
             trigger_reason = $2,
             charging_state = COALESCE($3, charging_state),
             meter_stop_wh = $4,
             total_energy_kwh = GREATEST(total_energy_kwh, $5),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [seqNo, triggerReason, chargingState, currentMeterWh, consumedKwh, currentTx.id]
      );

      // If linked to a VahanGrid session, synchronize energy on charging_sessions if active
      if (currentTx.session_id) {
        await client.query(
          `UPDATE charging_sessions
           SET energy_kwh = GREATEST(energy_kwh, $1),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND status = 'active'`,
          [consumedKwh, currentTx.session_id]
        );
      }

      console.log(
        `[OCPP] [${chargePointId}] TransactionEvent(Updated) energy synced — tx: "${transactionId}", meter: ${currentMeterWh} Wh, net: ${consumedKwh} kWh`
      );
    } else {
      await client.query(
        `UPDATE ocpp_transactions
         SET seq_no = $1,
             trigger_reason = $2,
             charging_state = COALESCE($3, charging_state),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [seqNo, triggerReason, chargingState, currentTx.id]
      );
    }

    await client.query('COMMIT');

    console.log(
      `[OCPP] [${chargePointId}] TransactionEvent(Updated) processed — tx: "${transactionId}", seq: ${seqNo}, state: ${chargingState || 'unchanged'}`
    );

    return {};
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Ended Event Handler
// ---------------------------------------------------------------------------

async function handleEndedEvent({
  ocppChargePointUUID,
  chargePointId,
  transactionId,
  seqNo,
  parsedTimestamp,
  triggerReason,
  stoppedReason,
  chargingState,
  meterValue,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock transaction record by (ocpp_charge_point_id, transaction_id)
    const txRes = await client.query(
      `SELECT id, seq_no, status, session_id, connector_id, meter_start_wh, meter_stop_wh, total_energy_kwh FROM ocpp_transactions
       WHERE ocpp_charge_point_id = $1 AND transaction_id = $2
       FOR UPDATE`,
      [ocppChargePointUUID, transactionId]
    );

    if (txRes.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new OcppError(
        ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
        `Transaction "${transactionId}" not found on charge point for Ended event`
      );
    }

    const currentTx = txRes.rows[0];

    // Idempotent duplicate Ended check
    if (currentTx.status === 'completed' || currentTx.status === 'aborted') {
      console.log(
        `[OCPP] [${chargePointId}] Transaction "${transactionId}" already terminal (${currentTx.status}). Acknowledging duplicate Ended without mutation.`
      );
      await client.query('COMMIT');
      return {};
    }

    // Monotonic sequence verification: only accept newer seqNo (or equal if same frame)
    if (seqNo < currentTx.seq_no) {
      console.log(
        `[OCPP] [${chargePointId}] Stale TransactionEvent(Ended) (seqNo: ${seqNo} < current: ${currentTx.seq_no}) for tx "${transactionId}". Acknowledging without state regression.`
      );
      await client.query('COMMIT');
      return {};
    }

    // Extract final energy reading if present (Phase 3D.6B)
    const finalMeterWh = parseMeterReadingWh(meterValue);
    let finalKwh = parseFloat(currentTx.total_energy_kwh) || 0;

    if (finalMeterWh !== null) {
      const startWh = currentTx.meter_start_wh !== null ? parseFloat(currentTx.meter_start_wh) : 0;
      const consumedWh = Math.max(0, finalMeterWh - startWh);
      const computedKwh = consumedWh / 1000.0;
      finalKwh = Math.max(finalKwh, computedKwh);

      await client.query(
        `UPDATE ocpp_transactions
         SET seq_no = $1,
             stopped_reason = $2,
             charging_state = COALESCE($3, charging_state),
             meter_stop_wh = $4,
             total_energy_kwh = GREATEST(total_energy_kwh, $5),
             ended_at = $6,
             status = 'completed',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [seqNo, stoppedReason || 'Other', chargingState, finalMeterWh, computedKwh, parsedTimestamp, currentTx.id]
      );
    } else {
      await client.query(
        `UPDATE ocpp_transactions
         SET seq_no = $1,
             stopped_reason = $2,
             charging_state = COALESCE($3, charging_state),
             ended_at = $4,
             status = 'completed',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [seqNo, stoppedReason || 'Other', chargingState, parsedTimestamp, currentTx.id]
      );
    }

    // 2. If a linked VahanGrid session exists, finalize it without resurrecting stopped sessions
    if (currentTx.session_id) {
      const sessRes = await client.query(
        `SELECT id, status, started_at, energy_kwh FROM charging_sessions
         WHERE id = $1
         FOR UPDATE`,
        [currentTx.session_id]
      );

      if (sessRes.rows.length > 0) {
        const session = sessRes.rows[0];
        // Only transition to completed if currently active or pending
        if (session.status === 'active' || session.status === 'pending') {
          await client.query(
            `UPDATE charging_sessions
             SET status = 'completed',
                 ended_at = $1,
                 duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM ($1 - started_at))::integer),
                 energy_kwh = GREATEST(energy_kwh, $2),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [parsedTimestamp, finalKwh, session.id]
          );
          console.log(
            `[OCPP] [${chargePointId}] Linked VahanGrid session "${session.id}" marked "completed" with energy ${finalKwh} kWh`
          );
        } else if (session.status === 'stopped') {
          // If session was already stopped via REST, preserve terminal status "stopped" but synchronize final energy
          await client.query(
            `UPDATE charging_sessions
             SET energy_kwh = GREATEST(energy_kwh, $1),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [finalKwh, session.id]
          );
          console.log(
            `[OCPP] [${chargePointId}] Linked VahanGrid session "${session.id}" preserved terminal "stopped" status; energy finalized to ${finalKwh} kWh`
          );
        } else {
          console.log(
            `[OCPP] [${chargePointId}] Linked VahanGrid session "${session.id}" is already in terminal state ("${session.status}"). Preserving state.`
          );
        }
      }
    }

    // 3. Reset mapped connector to 'available' if no other active transactions exist on it
    if (currentTx.connector_id) {
      const activeTxOnConnector = await client.query(
        `SELECT id FROM ocpp_transactions
         WHERE connector_id = $1 AND status = 'active' AND id != $2
         LIMIT 1`,
        [currentTx.connector_id, currentTx.id]
      );

      if (activeTxOnConnector.rows.length === 0) {
        await client.query(
          `UPDATE connectors
           SET status = 'available',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [currentTx.connector_id]
        );
        console.log(
          `[OCPP] [${chargePointId}] Mapped connector ${currentTx.connector_id} reset to status "available"`
        );
      } else {
        console.log(
          `[OCPP] [${chargePointId}] Connector ${currentTx.connector_id} still has another active transaction; retaining current status.`
        );
      }
    }

    await client.query('COMMIT');

    console.log(
      `[OCPP] [${chargePointId}] TransactionEvent(Ended) processed — tx: "${transactionId}", status: completed, reason: "${stoppedReason || 'Other'}", finalEnergy: ${finalKwh} kWh`
    );

    return {};
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
