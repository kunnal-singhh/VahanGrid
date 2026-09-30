/**
 * src/ocpp/handlers/bootNotificationHandler.js
 *
 * OCPP 2.0.1 BootNotification Request Handler (Phase 3D.3).
 *
 * Responsibilities:
 *  1. Validates the incoming BootNotification request payload according to OCPP 2.0.1 schema.
 *  2. Verifies identity consistency between the URL path (/ocpp/<chargePointId>) and any
 *     explicit station identifier supplied in the payload.
 *  3. Stores the validated BootNotification state in the live connection registry.
 *  4. Generates a standards-compliant OCPP 2.0.1 BootNotificationResponse.
 *
 * Note: Database tables are NOT used for this phase. Transient registration state
 * is kept strictly in-memory within the connection registry.
 */

import { OcppError, ERROR_CODES } from '../ocppErrors.js';
import connectionRegistry from '../connectionRegistry.js';
import { query } from '../../config/database.js';

// Valid BootReasonEnumType values defined in OCPP 2.0.1 Part 2
const VALID_BOOT_REASONS = new Set([
  'ApplicationReset',
  'FirmwareUpdate',
  'LocalReset',
  'PowerUp',
  'RemoteReset',
  'ScheduledReset',
  'Triggered',
  'Unknown',
  'Watchdog',
]);

/**
 * Handles an incoming BootNotification CALL request.
 *
 * @param {object} payload - The OCPP 2.0.1 BootNotificationRequest payload
 * @param {string} chargePointId - The charge-point ID from the WebSocket URL path
 * @param {import('ws').WebSocket} ws - Active WebSocket connection
 * @returns {Promise<object>} The OCPP 2.0.1 BootNotificationResponse payload
 */
export async function handleBootNotification(payload, chargePointId, ws) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'BootNotification payload must be a JSON object'
    );
  }

  const { reason, chargingStation } = payload;

  // ── 1. Validate "reason" (Required in OCPP 2.0.1) ──────────────────────────
  if (!reason || typeof reason !== 'string') {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or invalid required field "reason" in BootNotificationRequest'
    );
  }

  if (!VALID_BOOT_REASONS.has(reason)) {
    throw new OcppError(
      ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
      `Invalid reason "${reason}". Expected one of: ${Array.from(VALID_BOOT_REASONS).join(', ')}`
    );
  }

  // ── 2. Validate "chargingStation" (Required in OCPP 2.0.1) ─────────────────
  if (!chargingStation || typeof chargingStation !== 'object' || Array.isArray(chargingStation)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or invalid required object "chargingStation" in BootNotificationRequest'
    );
  }

  const { model, vendorName, serialNumber, firmwareVersion } = chargingStation;

  if (!model || typeof model !== 'string' || model.trim().length === 0) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or empty required field "chargingStation.model"'
    );
  }

  if (model.length > 20) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Field "chargingStation.model" exceeds maximum length of 20 characters'
    );
  }

  if (!vendorName || typeof vendorName !== 'string' || vendorName.trim().length === 0) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or empty required field "chargingStation.vendorName"'
    );
  }

  if (vendorName.length > 50) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Field "chargingStation.vendorName" exceeds maximum length of 50 characters'
    );
  }

  // Optional string constraints
  if (serialNumber && (typeof serialNumber !== 'string' || serialNumber.length > 25)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Field "chargingStation.serialNumber" must be a string up to 25 characters'
    );
  }

  if (firmwareVersion && (typeof firmwareVersion !== 'string' || firmwareVersion.length > 50)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Field "chargingStation.firmwareVersion" must be a string up to 50 characters'
    );
  }

  // ── 3. Validate Identity Consistency ──────────────────────────────────────
  // The WebSocket path (/ocpp/<chargePointId>) establishes the authoritative
  // identity. If the payload supplies an explicit chargePointId or chargingStation.id,
  // it must not contradict the connection path.
  const explicitId =
    payload.chargePointId ||
    payload.stationId ||
    chargingStation.id;

  if (explicitId && typeof explicitId === 'string') {
    if (explicitId.trim().toLowerCase() !== chargePointId.trim().toLowerCase()) {
      throw new OcppError(
        ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
        `Charge point identity in payload ("${explicitId}") does not match connection path ("${chargePointId}")`
      );
    }
  }

  // ── 4. Associate State with Active Connection ─────────────────────────────
  const bootData = {
    reason,
    chargingStation: {
      model: model.trim(),
      vendorName: vendorName.trim(),
      ...(serialNumber ? { serialNumber: serialNumber.trim() } : {}),
      ...(firmwareVersion ? { firmwareVersion: firmwareVersion.trim() } : {}),
      ...(chargingStation.modem ? { modem: chargingStation.modem } : {}),
    },
    status: 'Accepted',
  };

  connectionRegistry.updateBootNotification(chargePointId, bootData);

  console.log(
    `[OCPP] [${chargePointId}] BootNotification accepted — Model: "${model.trim()}", Vendor: "${vendorName.trim()}", Reason: "${reason}"`
  );

  // ── 5. Persist to Database (Phase 3D.5) ────────────────────────────────────
  try {
    const existing = await query(
      `SELECT id, registration_status FROM ocpp_charge_points WHERE charge_point_id = $1`,
      [chargePointId]
    );

    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO ocpp_charge_points (
           charge_point_id, model, vendor_name, serial_number, firmware_version,
           boot_reason, registration_status, last_boot_at, last_seen_at, status, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'online', CURRENT_TIMESTAMP)`,
        [
          chargePointId,
          model.trim(),
          vendorName.trim(),
          serialNumber ? serialNumber.trim() : null,
          firmwareVersion ? firmwareVersion.trim() : null,
          reason,
        ]
      );
      console.log(`[OCPP] [${chargePointId}] New charge point registered in DB with status "Pending"`);
    } else {
      // Preserve existing registration_status — do not overwrite with 'Accepted' or 'Pending'
      await query(
        `UPDATE ocpp_charge_points
         SET model = $2,
             vendor_name = $3,
             serial_number = COALESCE($4, serial_number),
             firmware_version = COALESCE($5, firmware_version),
             boot_reason = $6,
             last_boot_at = CURRENT_TIMESTAMP,
             last_seen_at = CURRENT_TIMESTAMP,
             status = 'online',
             updated_at = CURRENT_TIMESTAMP
         WHERE charge_point_id = $1`,
        [
          chargePointId,
          model.trim(),
          vendorName.trim(),
          serialNumber ? serialNumber.trim() : null,
          firmwareVersion ? firmwareVersion.trim() : null,
          reason,
        ]
      );
      console.log(
        `[OCPP] [${chargePointId}] Existing charge point updated in DB (registration_status "${existing.rows[0].registration_status}" preserved)`
      );
    }
  } catch (dbErr) {
    console.error(`[OCPP] [${chargePointId}] Failed to persist BootNotification to DB:`, dbErr.message);
  }

  // ── 6. Generate OCPP 2.0.1 Response Payload ───────────────────────────────
  // Note: currentTime must reflect real current server time (ISO 8601), not hardcoded.
  return {
    currentTime: new Date().toISOString(),
    interval: 300, // 300 seconds (5 minutes heartbeat interval)
    status: 'Accepted',
  };
}
