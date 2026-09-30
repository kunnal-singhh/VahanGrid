/**
 * src/ocpp/messageHandler.js
 *
 * OCPP 2.0.1 JSON Message Router & Dispatcher (Phase 3D.3).
 *
 * Message Frame Formats (OCPP-J 2.0.1 Part 4):
 *  CALL:       [2, "<MessageId>", "<Action>", {<Payload>}]
 *  CALLRESULT: [3, "<MessageId>", {<Payload>}]
 *  CALLERROR:  [4, "<MessageId>", "<ErrorCode>", "<ErrorDescription>", {<ErrorDetails>}]
 *
 * Responsibilities:
 *  1. Parses and validates raw incoming WebSocket message frames.
 *  2. Distinguishes valid CALL messages from malformed frames or unsupported actions.
 *  3. Routes "BootNotification" to its dedicated handler.
 *  4. Returns standards-compliant CALLERROR frames for unsupported actions or malformed frames.
 *  5. Maintains socket stability without dropping the connection on application errors.
 */

import { OcppError, ERROR_CODES } from './ocppErrors.js';
import { handleBootNotification } from './handlers/bootNotificationHandler.js';
import { handleStatusNotification } from './handlers/statusNotificationHandler.js';
import { handleHeartbeat } from './handlers/heartbeatHandler.js';
import { handleTransactionEvent } from './handlers/transactionEventHandler.js';
import { handleMeterValues } from './handlers/meterValuesHandler.js';

// OCPP 2.0.1 Message Type Identifiers
export const MESSAGE_TYPE_CALL = 2;
export const MESSAGE_TYPE_CALLRESULT = 3;
export const MESSAGE_TYPE_CALLERROR = 4;

/**
 * Sends an OCPP CALLRESULT frame over the WebSocket.
 *
 * @param {import('ws').WebSocket} ws
 * @param {string} messageId
 * @param {object} payload
 */
export function sendCallResult(ws, messageId, payload) {
  if (!ws || ws.readyState !== 1) return; // 1 = OPEN
  const frame = [MESSAGE_TYPE_CALLRESULT, messageId, payload];
  ws.send(JSON.stringify(frame));
}

/**
 * Sends an OCPP CALLERROR frame over the WebSocket.
 *
 * @param {import('ws').WebSocket} ws
 * @param {string} messageId
 * @param {string} errorCode
 * @param {string} errorDescription
 * @param {object} [errorDetails={}]
 */
export function sendCallError(ws, messageId, errorCode, errorDescription, errorDetails = {}) {
  if (!ws || ws.readyState !== 1) return; // 1 = OPEN
  const frame = [
    MESSAGE_TYPE_CALLERROR,
    messageId || '',
    errorCode,
    errorDescription || '',
    errorDetails || {},
  ];
  ws.send(JSON.stringify(frame));
}

/**
 * Main dispatcher for incoming OCPP WebSocket messages.
 *
 * @param {string|Buffer} rawMessage
 * @param {string} chargePointId
 * @param {import('ws').WebSocket} ws
 */
export async function handleOcppMessage(rawMessage, chargePointId, ws) {
  const msgStr = typeof rawMessage === 'string' ? rawMessage : rawMessage.toString('utf8');

  // ── 1. Empty message validation ───────────────────────────────────────────
  if (!msgStr || msgStr.trim().length === 0) {
    sendCallError(ws, '', ERROR_CODES.RPC_FRAMEWORK_ERROR, 'Empty message received');
    return;
  }

  // ── 2. JSON parsing ───────────────────────────────────────────────────────
  let parsed;
  try {
    parsed = JSON.parse(msgStr);
  } catch (err) {
    sendCallError(
      ws,
      '',
      ERROR_CODES.RPC_FRAMEWORK_ERROR,
      `Invalid JSON payload: ${err.message}`
    );
    return;
  }

  // ── 3. Array frame validation ─────────────────────────────────────────────
  if (!Array.isArray(parsed)) {
    sendCallError(
      ws,
      '',
      ERROR_CODES.RPC_FRAMEWORK_ERROR,
      'Message frame must be a JSON array'
    );
    return;
  }

  const [messageTypeId, messageId, action, payload] = parsed;

  // ── 4. Message Type ID validation ─────────────────────────────────────────
  if (typeof messageTypeId !== 'number') {
    sendCallError(
      ws,
      '',
      ERROR_CODES.RPC_FRAMEWORK_ERROR,
      'MessageTypeId must be a number'
    );
    return;
  }

  if (messageTypeId !== MESSAGE_TYPE_CALL) {
    // Only CALL (type 2) messages are processed as requests by CSMS
    const fallbackId = typeof messageId === 'string' ? messageId : '';
    sendCallError(
      ws,
      fallbackId,
      ERROR_CODES.MESSAGE_TYPE_NOT_SUPPORTED,
      `Unsupported MessageTypeId ${messageTypeId}; only CALL (2) is accepted by CSMS in this phase`
    );
    return;
  }

  // ── 5. Message ID validation ──────────────────────────────────────────────
  if (typeof messageId !== 'string' || messageId.trim().length === 0) {
    sendCallError(
      ws,
      '',
      ERROR_CODES.RPC_FRAMEWORK_ERROR,
      'MessageId must be a non-empty string'
    );
    return;
  }

  if (messageId.length > 36) {
    sendCallError(
      ws,
      messageId,
      ERROR_CODES.FORMAT_VIOLATION,
      'MessageId exceeds standard length limit of 36 characters'
    );
    return;
  }

  // ── 6. Action validation ──────────────────────────────────────────────────
  if (typeof action !== 'string' || action.trim().length === 0) {
    sendCallError(
      ws,
      messageId,
      ERROR_CODES.RPC_FRAMEWORK_ERROR,
      'Action must be a non-empty string'
    );
    return;
  }

  // ── 7. Payload validation ─────────────────────────────────────────────────
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    sendCallError(
      ws,
      messageId,
      ERROR_CODES.FORMAT_VIOLATION,
      'Payload must be a JSON object'
    );
    return;
  }

  // ── 8. Action routing ─────────────────────────────────────────────────────
  if (action === 'BootNotification') {
    try {
      const responsePayload = await handleBootNotification(payload, chargePointId, ws);
      sendCallResult(ws, messageId, responsePayload);
    } catch (err) {
      if (err instanceof OcppError) {
        sendCallError(ws, messageId, err.code, err.message, err.details);
      } else {
        console.error(`[OCPP] [${chargePointId}] Unexpected error processing BootNotification:`, err);
        sendCallError(
          ws,
          messageId,
          ERROR_CODES.INTERNAL_ERROR,
          'Internal error processing BootNotification',
          {}
        );
      }
    }
    return;
  }

  if (action === 'StatusNotification') {
    try {
      const responsePayload = await handleStatusNotification(payload, chargePointId, ws);
      sendCallResult(ws, messageId, responsePayload);
    } catch (err) {
      if (err instanceof OcppError) {
        sendCallError(ws, messageId, err.code, err.message, err.details);
      } else {
        console.error(`[OCPP] [${chargePointId}] Unexpected error processing StatusNotification:`, err);
        sendCallError(
          ws,
          messageId,
          ERROR_CODES.INTERNAL_ERROR,
          'Internal error processing StatusNotification',
          {}
        );
      }
    }
    return;
  }

  if (action === 'Heartbeat') {
    try {
      const responsePayload = await handleHeartbeat(payload, chargePointId, ws);
      sendCallResult(ws, messageId, responsePayload);
    } catch (err) {
      if (err instanceof OcppError) {
        sendCallError(ws, messageId, err.code, err.message, err.details);
      } else {
        console.error(`[OCPP] [${chargePointId}] Unexpected error processing Heartbeat:`, err);
        sendCallError(
          ws,
          messageId,
          ERROR_CODES.INTERNAL_ERROR,
          'Internal error processing Heartbeat',
          {}
        );
      }
    }
    return;
  }

  if (action === 'TransactionEvent') {
    try {
      const responsePayload = await handleTransactionEvent(payload, chargePointId, ws);
      sendCallResult(ws, messageId, responsePayload);
    } catch (err) {
      if (err instanceof OcppError) {
        sendCallError(ws, messageId, err.code, err.message, err.details);
      } else {
        console.error(`[OCPP] [${chargePointId}] Unexpected error processing TransactionEvent:`, err);
        sendCallError(
          ws,
          messageId,
          ERROR_CODES.INTERNAL_ERROR,
          'Internal error processing TransactionEvent',
          {}
        );
      }
    }
    return;
  }

  if (action === 'MeterValues') {
    try {
      const responsePayload = await handleMeterValues(payload, chargePointId, ws);
      sendCallResult(ws, messageId, responsePayload);
    } catch (err) {
      if (err instanceof OcppError) {
        sendCallError(ws, messageId, err.code, err.message, err.details);
      } else {
        console.error(`[OCPP] [${chargePointId}] Unexpected error processing MeterValues:`, err);
        sendCallError(
          ws,
          messageId,
          ERROR_CODES.INTERNAL_ERROR,
          'Internal error processing MeterValues',
          {}
        );
      }
    }
    return;
  }

  // ── 9. Unsupported action handling ────────────────────────────────────────
  // Per Phase 3D.7B scope, actions other than BootNotification, StatusNotification, Heartbeat, TransactionEvent, and MeterValues
  // must return an appropriate OCPP error (NotImplemented) without fabricating responses.
  console.warn(
    `[OCPP] [${chargePointId}] Received unsupported action "${action}". Returning NotImplemented.`
  );
  sendCallError(
    ws,
    messageId,
    ERROR_CODES.NOT_IMPLEMENTED,
    `Action "${action}" is not implemented yet in Phase 3D.7B`,
    {}
  );
}
