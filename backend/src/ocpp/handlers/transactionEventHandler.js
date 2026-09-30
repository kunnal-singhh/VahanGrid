/**
 * src/ocpp/handlers/transactionEventHandler.js
 *
 * OCPP 2.0.1 TransactionEvent Request Handler (Phase 3D.6A).
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
 *  7. Returns standard OCPP 2.0.1 CALLRESULT {}.
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

    // 3. Check if an active VahanGrid session exists for this connector
    let linkedSessionId = null;
    const activeSessionRes = await client.query(
      `SELECT id, user_id FROM charging_sessions
       WHERE connector_id = $1 AND status = 'active'
       ORDER BY started_at DESC
       LIMIT 1
       FOR UPDATE`,
      [physicalConnectorUUID]
    );

    if (activeSessionRes.rows.length > 0) {
      linkedSessionId = activeSessionRes.rows[0].id;
      // Link external_session_id on the existing charging_sessions row
      await client.query(
        `UPDATE charging_sessions
         SET external_session_id = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [transactionId, linkedSessionId]
      );
      console.log(
        `[OCPP] [${chargePointId}] Linked OCPP transaction "${transactionId}" to existing VahanGrid session "${linkedSessionId}"`
      );
    } else {
      console.log(
        `[OCPP] [${chargePointId}] No active VahanGrid session found for connector "${physicalConnectorUUID}". Preserving session_id = NULL.`
      );
    }

    // 4. Insert into ocpp_transactions
    await client.query(
      `INSERT INTO ocpp_transactions (
         ocpp_charge_point_id, transaction_id, seq_no,
         ocpp_evse_id, ocpp_connector_id, connector_id,
         session_id, id_token, id_token_type,
         charging_state, trigger_reason, started_at, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')`,
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
      `[OCPP] [${chargePointId}] TransactionEvent(Started) processed — tx: "${transactionId}", connector: ${physicalConnectorUUID}, status: charging`
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
      `SELECT id, seq_no, status, session_id, connector_id FROM ocpp_transactions
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

    // Extract energy if meterValue is present
    let totalEnergyKwh = null;
    if (meterValue && Array.isArray(meterValue) && meterValue.length > 0) {
      for (const mv of meterValue) {
        if (mv.sampledValue && Array.isArray(mv.sampledValue)) {
          for (const sv of mv.sampledValue) {
            const measurand = sv.measurand || 'Energy.Active.Import.Register';
            if (measurand === 'Energy.Active.Import.Register') {
              const val = parseFloat(sv.value);
              if (!isNaN(val)) {
                const unit = sv.unitOfMeasure?.unit || 'Wh';
                totalEnergyKwh = unit.toLowerCase() === 'kwh' ? val : val / 1000.0;
              }
            }
          }
        }
      }
    }

    // Update ocpp_transactions record
    if (totalEnergyKwh !== null) {
      await client.query(
        `UPDATE ocpp_transactions
         SET seq_no = $1,
             trigger_reason = $2,
             charging_state = COALESCE($3, charging_state),
             total_energy_kwh = GREATEST(total_energy_kwh, $4),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [seqNo, triggerReason, chargingState, totalEnergyKwh, currentTx.id]
      );

      // If linked to a VahanGrid session, update energy on charging_sessions if active
      if (currentTx.session_id) {
        await client.query(
          `UPDATE charging_sessions
           SET energy_kwh = GREATEST(energy_kwh, $1),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND status = 'active'`,
          [totalEnergyKwh, currentTx.session_id]
        );
      }
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
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock transaction record by (ocpp_charge_point_id, transaction_id)
    const txRes = await client.query(
      `SELECT id, seq_no, status, session_id, connector_id FROM ocpp_transactions
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

    // 1. Update ocpp_transactions to completed
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

    // 2. If a linked VahanGrid session exists, finalize it without resurrecting stopped sessions
    if (currentTx.session_id) {
      const sessRes = await client.query(
        `SELECT id, status, started_at FROM charging_sessions
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
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [parsedTimestamp, session.id]
          );
          console.log(
            `[OCPP] [${chargePointId}] Linked VahanGrid session "${session.id}" marked "completed"`
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
      `[OCPP] [${chargePointId}] TransactionEvent(Ended) processed — tx: "${transactionId}", status: completed, reason: "${stoppedReason || 'Other'}"`
    );

    return {};
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
