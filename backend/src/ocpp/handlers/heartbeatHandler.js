/**
 * src/ocpp/handlers/heartbeatHandler.js
 *
 * OCPP 2.0.1 Heartbeat Request Handler (Phase 3D.5).
 *
 * Responsibilities:
 *  1. Validates the incoming Heartbeat request frame according to OCPP 2.0.1 specification.
 *  2. Updates in-memory connection registry state (lastHeartbeatAt, status = 'online').
 *  3. Updates persistent database state for registered charge points:
 *     - last_seen_at = CURRENT_TIMESTAMP
 *     - status = 'online'
 *     - updated_at = CURRENT_TIMESTAMP
 *  4. Preserves graceful handling for unknown or unprovisioned devices without erroring.
 *  5. Returns standard HeartbeatResponse with current server time in ISO 8601 format.
 *
 * Framing:
 *  CALL:       [2, "<messageId>", "Heartbeat", {}]
 *  CALLRESULT: [3, "<messageId>", { "currentTime": "<ISO-8601>" }]
 */

import { OcppError, ERROR_CODES } from '../ocppErrors.js';
import connectionRegistry from '../connectionRegistry.js';
import { query } from '../../config/database.js';

/**
 * Handles an incoming Heartbeat CALL request.
 *
 * @param {object} payload - HeartbeatRequest payload (empty object {} or with customData)
 * @param {string} chargePointId - Charge point ID from the WebSocket URL path
 * @param {import('ws').WebSocket} ws - Active WebSocket connection
 * @returns {Promise<{currentTime: string}>}
 */
export async function handleHeartbeat(payload, chargePointId, ws) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Heartbeat payload must be a JSON object'
    );
  }

  // Validate optional customData if present
  if (payload.customData !== undefined && payload.customData !== null) {
    if (typeof payload.customData !== 'object' || Array.isArray(payload.customData)) {
      throw new OcppError(
        ERROR_CODES.FORMAT_VIOLATION,
        'Field "customData" must be a JSON object if provided'
      );
    }
  }

  // 1. Update in-memory connection registry
  connectionRegistry.updateHeartbeat(chargePointId);

  // 2. Update persistent database state for known charge point
  try {
    const dbRes = await query(
      `UPDATE ocpp_charge_points
       SET last_seen_at = CURRENT_TIMESTAMP,
           status = 'online',
           updated_at = CURRENT_TIMESTAMP
       WHERE charge_point_id = $1
       RETURNING id`,
      [chargePointId]
    );

    if (dbRes.rows.length > 0) {
      console.log(`[OCPP] [${chargePointId}] Heartbeat recorded in DB — device marked online`);
    } else {
      console.log(
        `[OCPP] [${chargePointId}] Heartbeat received from unregistered device (handled gracefully without DB persistence)`
      );
    }
  } catch (err) {
    console.error(
      `[OCPP] [${chargePointId}] Failed to update heartbeat in DB:`,
      err.message
    );
  }

  // 3. Return standards-compliant response with current server time
  return {
    currentTime: new Date().toISOString(),
  };
}
