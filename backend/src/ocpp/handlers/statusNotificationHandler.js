/**
 * src/ocpp/handlers/statusNotificationHandler.js
 *
 * OCPP 2.0.1 StatusNotification Request Handler (Phase 3D.4A).
 *
 * Responsibilities:
 *  1. Validates the incoming StatusNotification request payload according to the
 *     OCPP 2.0.1 specification schema (timestamp, connectorStatus, evseId, connectorId).
 *  2. Enforces ConnectorStatusEnumType constraint (Available, Occupied, Reserved, Unavailable, Faulted).
 *  3. Verifies EVSE and connector ID constraints (non-negative integers).
 *  4. Maintains transient in-memory connection state via connectionRegistry (DO NOT persist to PostgreSQL).
 *  5. Returns a standard OCPP 2.0.1 StatusNotificationResponse (empty object {}).
 *
 * Note: Database tables are NOT used for this phase. Transient connector status
 * is kept strictly in-memory within the connection registry.
 */

import { OcppError, ERROR_CODES } from '../ocppErrors.js';
import connectionRegistry from '../connectionRegistry.js';

// Valid ConnectorStatusEnumType values defined in OCPP 2.0.1 Part 2
export const VALID_CONNECTOR_STATUSES = new Set([
  'Available',
  'Occupied',
  'Reserved',
  'Unavailable',
  'Faulted',
]);

/**
 * Handles an incoming StatusNotification CALL request.
 *
 * @param {object} payload - The OCPP 2.0.1 StatusNotificationRequest payload
 * @param {string} chargePointId - The charge-point ID from the WebSocket URL path
 * @param {import('ws').WebSocket} ws - Active WebSocket connection
 * @returns {Promise<object>} The OCPP 2.0.1 StatusNotificationResponse payload ({})
 */
export async function handleStatusNotification(payload, chargePointId, ws) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'StatusNotification payload must be a JSON object'
    );
  }

  const { timestamp, connectorStatus, evseId, connectorId, customData } = payload;

  // ── 1. Validate "timestamp" (Required in OCPP 2.0.1) ──────────────────────
  if (!timestamp || typeof timestamp !== 'string' || timestamp.trim().length === 0) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or invalid required field "timestamp" in StatusNotificationRequest'
    );
  }

  const parsedTime = new Date(timestamp);
  if (isNaN(parsedTime.getTime())) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      `Field "timestamp" must be a valid ISO 8601 date-time string: "${timestamp}"`
    );
  }

  // ── 2. Validate "connectorStatus" (Required in OCPP 2.0.1) ────────────────
  if (!connectorStatus || typeof connectorStatus !== 'string' || connectorStatus.trim().length === 0) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or invalid required field "connectorStatus" in StatusNotificationRequest'
    );
  }

  if (!VALID_CONNECTOR_STATUSES.has(connectorStatus.trim())) {
    throw new OcppError(
      ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
      `Invalid connectorStatus "${connectorStatus}". Expected one of: ${Array.from(VALID_CONNECTOR_STATUSES).join(', ')}`
    );
  }

  const cleanConnectorStatus = connectorStatus.trim();

  // ── 3. Validate "evseId" (Required in OCPP 2.0.1) ─────────────────────────
  if (evseId === undefined || evseId === null || typeof evseId !== 'number' || !Number.isInteger(evseId)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or invalid required field "evseId" in StatusNotificationRequest (must be an integer)'
    );
  }

  if (evseId < 0) {
    throw new OcppError(
      ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
      'Field "evseId" must be greater than or equal to 0'
    );
  }

  // ── 4. Validate "connectorId" (Required in OCPP 2.0.1) ──────────────────────
  if (connectorId === undefined || connectorId === null || typeof connectorId !== 'number' || !Number.isInteger(connectorId)) {
    throw new OcppError(
      ERROR_CODES.FORMAT_VIOLATION,
      'Missing or invalid required field "connectorId" in StatusNotificationRequest (must be an integer)'
    );
  }

  if (connectorId < 0) {
    throw new OcppError(
      ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
      'Field "connectorId" must be greater than or equal to 0'
    );
  }

  // ── 5. Validate "customData" (Optional in OCPP 2.0.1) ───────────────────────
  if (customData !== undefined && customData !== null) {
    if (typeof customData !== 'object' || Array.isArray(customData)) {
      throw new OcppError(
        ERROR_CODES.FORMAT_VIOLATION,
        'Field "customData" must be a JSON object if provided'
      );
    }
  }

  // ── 6. Validate Identity Consistency ──────────────────────────────────────
  // The WebSocket path (/ocpp/<chargePointId>) establishes the authoritative
  // identity. If the payload supplies an explicit chargePointId or stationId,
  // it must not contradict the connection path.
  const explicitId = payload.chargePointId || payload.stationId;
  if (explicitId && typeof explicitId === 'string') {
    if (explicitId.trim().toLowerCase() !== chargePointId.trim().toLowerCase()) {
      throw new OcppError(
        ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION,
        `Charge point identity in payload ("${explicitId}") does not match connection path ("${chargePointId}")`
      );
    }
  }

  // ── 7. Associate Transient State with Active Connection ────────────────────
  const statusData = {
    timestamp: parsedTime.toISOString(),
    connectorStatus: cleanConnectorStatus,
    evseId,
    connectorId,
    ...(customData ? { customData } : {}),
  };

  connectionRegistry.updateStatusNotification(chargePointId, statusData);

  console.log(
    `[OCPP] [${chargePointId}] StatusNotification accepted — EVSE: ${evseId}, Connector: ${connectorId}, Status: "${cleanConnectorStatus}"`
  );

  // ── 8. Generate OCPP 2.0.1 Response Payload ───────────────────────────────
  // Per OCPP 2.0.1 specification, StatusNotificationResponse is an empty object {}.
  return {};
}
