/**
 * src/ocpp/handlers/meterValuesHandler.js
 *
 * OCPP 2.0.1 MeterValues Request Handler (Phase 3D.7B).
 *
 * Responsibilities:
 *  1. Validates MeterValuesRequest schema according to OCPP 2.0.1 specification.
 *  2. Resolves charge point identity via ocppMappingService.
 *  3. Parses supported telemetry measurands:
 *     - Energy.Active.Import.Register (Wh / kWh)
 *     - Power.Active.Import (W / kW -> normalized to kW)
 *     - SoC (State of Charge percentage 0-100)
 *     - Voltage (V)
 *     - Current.Import (A)
 *  4. Tier 1 (Live Real-Time Telemetry):
 *     - Updates in-memory connectionRegistry per EVSE for live dashboard polling with zero DB latency.
 *  5. Tier 2 (Session Curve Persistence & Synchronization):
 *     - Correlates telemetry to active ocpp_transactions and charging_sessions by (chargePointUUID, evseId).
 *     - Synchronizes cumulative net energy delta using the verified Phase 3D.6B model (GREATEST guard).
 *     - Synchronizes live battery level to charging_sessions.end_soc.
 *     - Persists normalized time-series rows into ocpp_session_telemetry for active sessions only.
 *     - Idle chargers (no active transaction) or EVSE 0 (station-wide) update Tier 1 only (zero DB row explosion).
 *  6. Returns standard OCPP 2.0.1 CALLRESULT {}.
 */

import { OcppError, ERROR_CODES } from '../ocppErrors.js';
import pool from '../../config/database.js';
import { resolveChargePoint } from '../../services/ocppMappingService.js';
import { connectionRegistry } from '../connectionRegistry.js';

/**
 * Extracts and normalizes supported telemetry values from an OCPP 2.0.1 meterValue array.
 *
 * @param {Array<object>} meterValueArray
 * @returns {{
 *   energyWh: number|null,
 *   powerKw: number|null,
 *   socPercent: number|null,
 *   voltageV: number|null,
 *   currentA: number|null,
 *   timestamp: Date
 * }}
 */
export function parseMeterValuesTelemetry(meterValueArray) {
  if (!Array.isArray(meterValueArray) || meterValueArray.length === 0) {
    return {
      energyWh: null,
      powerKw: null,
      socPercent: null,
      voltageV: null,
      currentA: null,
      timestamp: new Date(),
    };
  }

  let energyWh = null;
  let powerKw = null;
  let socPercent = null;
  let voltageV = null;
  let currentA = null;
  let latestTimestamp = new Date();

  for (const mv of meterValueArray) {
    if (!mv || typeof mv !== 'object') continue;

    if (mv.timestamp) {
      const parsedDate = new Date(mv.timestamp);
      if (!isNaN(parsedDate.getTime())) {
        latestTimestamp = parsedDate;
      }
    }

    if (!Array.isArray(mv.sampledValue)) continue;

    for (const sv of mv.sampledValue) {
      if (!sv || typeof sv !== 'object') continue;

      // Measurand: Default in OCPP 2.0.1 is 'Energy.Active.Import.Register'
      let measurand = 'Energy.Active.Import.Register';
      if (sv.measurand !== undefined && sv.measurand !== null) {
        if (typeof sv.measurand !== 'string') continue;
        measurand = sv.measurand.trim();
      }

      if (sv.value === undefined || sv.value === null || sv.value === '') continue;
      const num = typeof sv.value === 'number' ? sv.value : parseFloat(sv.value);
      if (!Number.isFinite(num)) continue;

      // Extract raw unit string if present
      let rawUnit = '';
      if (sv.unitOfMeasure) {
        if (typeof sv.unitOfMeasure === 'string') {
          rawUnit = sv.unitOfMeasure.trim().toLowerCase();
        } else if (typeof sv.unitOfMeasure === 'object' && typeof sv.unitOfMeasure.unit === 'string') {
          rawUnit = sv.unitOfMeasure.unit.trim().toLowerCase();
        }
      }

      switch (measurand) {
        case 'Energy.Active.Import.Register': {
          if (num < 0) break;
          if (rawUnit === 'kwh' || rawUnit === 'kw.h' || rawUnit === 'kw·h') {
            energyWh = num * 1000.0;
          } else if (rawUnit === '' || rawUnit === 'wh' || rawUnit === 'w.h' || rawUnit === 'w·h') {
            energyWh = num;
          }
          break;
        }

        case 'Power.Active.Import': {
          if (num < 0) break;
          if (rawUnit === 'w' || rawUnit === 'va' || rawUnit === '') {
            powerKw = num / 1000.0;
          } else if (rawUnit === 'kw' || rawUnit === 'kva') {
            powerKw = num;
          }
          break;
        }

        case 'SoC': {
          if (num >= 0 && num <= 100) {
            socPercent = Math.round(num);
          }
          break;
        }

        case 'Voltage': {
          if (num >= 0) {
            voltageV = num;
          }
          break;
        }

        case 'Current.Import': {
          if (num >= 0) {
            currentA = num;
          }
          break;
        }

        default:
          // Unhandled or non-target measurand (e.g. Temperature, Frequency)
          break;
      }
    }
  }

  return {
    energyWh,
    powerKw,
    socPercent,
    voltageV,
    currentA,
    timestamp: latestTimestamp,
  };
}

/**
 * Main handler for OCPP 2.0.1 MeterValues CALL messages.
 *
 * @param {object} payload - MeterValuesRequest payload
 * @param {string} chargePointId - Charge point identifier from WebSocket path
 * @param {import('ws').WebSocket} ws - Active WebSocket connection
 * @returns {Promise<object>} Empty object {} for CALLRESULT
 */
export async function handleMeterValues(payload, chargePointId, ws) {
  // ── 1. Top-level payload validation ───────────────────────────────────────
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'MeterValues payload must be a JSON object'
    );
  }

  const { evseId, meterValue } = payload;

  // Validate evseId (integer >= 0)
  if (evseId === undefined || evseId === null || typeof evseId !== 'number' || !Number.isInteger(evseId)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or invalid required field "evseId" in MeterValuesRequest (must be an integer)'
    );
  }

  if (evseId < 0) {
    throw new OcppError(
      ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
      'Field "evseId" must be greater than or equal to 0'
    );
  }

  // Validate meterValue array
  if (!meterValue || !Array.isArray(meterValue) || meterValue.length === 0) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Field "meterValue" must be a non-empty array of MeterValue objects'
    );
  }

  // Validate individual meterValue objects
  for (let i = 0; i < meterValue.length; i++) {
    const mv = meterValue[i];
    if (!mv || typeof mv !== 'object' || Array.isArray(mv)) {
      throw new OcppError(
        ERROR_CODES.FORMAT_VIOLATION,
        `meterValue[${i}] must be an object`
      );
    }

    if (!mv.timestamp || typeof mv.timestamp !== 'string') {
      throw new OcppError(
        ERROR_CODES.FORMAT_VIOLATION,
        `meterValue[${i}].timestamp is required and must be a string`
      );
    }

    const d = new Date(mv.timestamp);
    if (isNaN(d.getTime())) {
      throw new OcppError(
        ERROR_CODES.FORMAT_VIOLATION,
        `meterValue[${i}].timestamp must be a valid ISO 8601 date-time string: "${mv.timestamp}"`
      );
    }

    if (!Array.isArray(mv.sampledValue)) {
      throw new OcppError(
        ERROR_CODES.FORMAT_VIOLATION,
        `meterValue[${i}].sampledValue must be an array`
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

  // ── 3. Parse Telemetry Values ─────────────────────────────────────────────
  const telemetry = parseMeterValuesTelemetry(meterValue);

  // ── 4. Tier 1: In-Memory Live Telemetry Update ────────────────────────────
  connectionRegistry.updateMeterValues(chargePointId, evseId, telemetry);

  // ── 5. Tier 2: Active Session Correlated Telemetry & Persistence ───────────
  // If evseId === 0: Station-wide aggregate telemetry (transient Tier 1 only, no session association).
  if (evseId > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Look up active transaction for (ocppChargePointUUID, evseId)
      const activeTxRes = await client.query(
        `SELECT id, session_id, connector_id, meter_start_wh, total_energy_kwh
         FROM ocpp_transactions
         WHERE ocpp_charge_point_id = $1 AND ocpp_evse_id = $2 AND status = 'active'
         ORDER BY started_at DESC
         LIMIT 1
         FOR UPDATE`,
        [ocppChargePointUUID, evseId]
      );

      if (activeTxRes.rows.length > 0) {
        const activeTx = activeTxRes.rows[0];
        let netEnergyKwh = parseFloat(activeTx.total_energy_kwh) || 0;

        // 5a. Energy synchronization (governed by Phase 3D.6B delta model)
        if (telemetry.energyWh !== null) {
          const startWh = activeTx.meter_start_wh !== null ? parseFloat(activeTx.meter_start_wh) : 0;
          const deltaWh = Math.max(0, telemetry.energyWh - startWh);
          netEnergyKwh = deltaWh / 1000.0;

          await client.query(
            `UPDATE ocpp_transactions
             SET meter_stop_wh = $1,
                 total_energy_kwh = GREATEST(total_energy_kwh, $2),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [telemetry.energyWh, netEnergyKwh, activeTx.id]
          );

          if (activeTx.session_id) {
            await client.query(
              `UPDATE charging_sessions
               SET energy_kwh = GREATEST(energy_kwh, $1),
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2 AND status = 'active'`,
              [netEnergyKwh, activeTx.session_id]
            );
          }
        }

        // 5b. SoC synchronization to linked active session
        if (telemetry.socPercent !== null && activeTx.session_id) {
          await client.query(
            `UPDATE charging_sessions
             SET end_soc = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND status = 'active'`,
            [telemetry.socPercent, activeTx.session_id]
          );
        }

        // 5c. Historical Telemetry Persistence (Tier 2)
        // Store sample only if linked to a session and contains meaningful curve metrics (Power, SoC, or Energy)
        if (
          activeTx.session_id &&
          (telemetry.powerKw !== null || telemetry.socPercent !== null || telemetry.energyWh !== null)
        ) {
          await client.query(
            `INSERT INTO ocpp_session_telemetry (
               session_id, ocpp_transaction_id, recorded_at, power_kw, soc_percent, energy_kwh
             ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              activeTx.session_id,
              activeTx.id,
              telemetry.timestamp,
              telemetry.powerKw,
              telemetry.socPercent,
              netEnergyKwh,
            ]
          );
        }

        console.log(
          `[OCPP] [${chargePointId}] MeterValues synced for EVSE ${evseId} (tx: ${activeTx.id}) — Power: ${telemetry.powerKw !== null ? telemetry.powerKw + ' kW' : 'n/a'}, SoC: ${telemetry.socPercent !== null ? telemetry.socPercent + '%' : 'n/a'}, Energy: ${netEnergyKwh} kWh`
        );
      } else {
        // Charger is idle / no active transaction on this EVSE
        // Tier 1 in-memory state already updated; zero DB writes to prevent row bloat.
        console.log(
          `[OCPP] [${chargePointId}] MeterValues received for idle EVSE ${evseId} — live state cached in memory.`
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return {};
}
