/**
 * src/ocpp/ocppCallManager.js
 *
 * CSMS Outbound OCPP 2.0.1 CALL Dispatcher & Response Correlator (Phase 3D.8B).
 *
 * Responsibilities:
 *  1. Generates unique OCPP message IDs for CSMS-initiated CALL frames.
 *  2. Dispatches OCPP CALL frames [2, "<messageId>", "<Action>", {<Payload>}]
 *     over the active WebSocket connection to the targeted charging station.
 *  3. Maintains in-memory pendingCalls Map with Deferred Promises and configurable timeouts.
 *  4. Correlates incoming CALLRESULT (type 3) and CALLERROR (type 4) frames by messageId.
 *  5. Resolves or rejects the corresponding Promise upon reply arrival.
 *  6. Cleans up pending state on completion, timeout, or socket disconnection.
 */

import connectionRegistry from './connectionRegistry.js';
import { OcppError, ERROR_CODES } from './ocppErrors.js';

export class OcppCallManager {
  /**
   * @param {number} [defaultTimeoutMs=15000] - Default timeout in milliseconds for outbound calls.
   */
  constructor(defaultTimeoutMs = 15000) {
    this.defaultTimeoutMs = defaultTimeoutMs;
    /**
     * Map of in-flight outbound calls.
     * @type {Map<string, {
     *   resolve: (payload: any) => void,
     *   reject: (err: any) => void,
     *   timer: NodeJS.Timeout,
     *   action: string,
     *   chargePointId: string,
     *   sentAt: number,
     *   timeoutMs: number
     * }>}
     */
    this.pendingCalls = new Map();
  }

  /**
   * Generates a unique, collision-resistant OCPP message ID.
   * Format: msg-csms-<timestamp>-<randomHex>
   *
   * @returns {string}
   */
  generateMessageId() {
    return `msg-csms-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Dispatches an OCPP CALL message to a connected charging station and awaits its reply.
   *
   * @param {string} chargePointId - Target charge point identifier
   * @param {string} action - OCPP 2.0.1 action name (e.g. 'RequestStartTransaction', 'RequestStopTransaction')
   * @param {object} [payload={}] - Action request payload
   * @param {object} [options={}] - Optional parameters
   * @param {number} [options.timeoutMs] - Custom timeout override for this call
   * @param {string} [options.messageId] - Custom messageId override (useful in unit tests)
   * @returns {Promise<object>} Resolves with CALLRESULT payload object
   * @throws {OcppError|Error} If station is offline, times out, or returns CALLERROR
   */
  async sendCall(chargePointId, action, payload = {}, options = {}) {
    if (!chargePointId || typeof chargePointId !== 'string') {
      const err = new Error('chargePointId must be a non-empty string');
      err.statusCode = 400;
      err.code = 'INVALID_CHARGE_POINT_ID';
      throw err;
    }

    if (!action || typeof action !== 'string') {
      const err = new Error('action must be a non-empty string');
      err.statusCode = 400;
      err.code = 'INVALID_ACTION';
      throw err;
    }

    // Check if charge point is registered and WebSocket is OPEN
    const ws = connectionRegistry.get(chargePointId);
    if (!ws || ws.readyState !== 1) { // 1 = WebSocket.OPEN
      const err = new Error(`Charging station "${chargePointId}" is not connected or offline.`);
      err.statusCode = 503;
      err.code = 'STATION_OFFLINE';
      throw err;
    }

    const messageId = options.messageId || this.generateMessageId();
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;

    return new Promise((resolve, reject) => {
      // Set up timeout timer
      const timer = setTimeout(() => {
        const pending = this.pendingCalls.get(messageId);
        if (pending) {
          this.pendingCalls.delete(messageId);
          const err = new Error(
            `Charging station "${chargePointId}" timed out after ${timeoutMs}ms waiting for ${action}.`
          );
          err.statusCode = 504;
          err.code = 'STATION_TIMEOUT';
          pending.reject(err);
        }
      }, timeoutMs);

      // Register in-flight call entry
      this.pendingCalls.set(messageId, {
        resolve,
        reject,
        timer,
        action,
        chargePointId,
        sentAt: Date.now(),
        timeoutMs,
      });

      // Send standard OCPP CALL frame: [2, "<messageId>", "<Action>", {<Payload>}]
      const frame = [2, messageId, action, payload || {}];
      try {
        ws.send(JSON.stringify(frame));
      } catch (sendErr) {
        clearTimeout(timer);
        this.pendingCalls.delete(messageId);
        const err = new Error(`Failed to send ${action} frame to "${chargePointId}": ${sendErr.message}`);
        err.statusCode = 503;
        err.code = 'SOCKET_SEND_FAILED';
        reject(err);
      }
    });
  }

  /**
   * Correlates an incoming CALLRESULT (type 3) frame to a pending outbound CALL.
   *
   * @param {string} messageId - Message ID echoed from station
   * @param {object} payload - Response payload
   * @returns {boolean} True if matching pending call was found and resolved; false otherwise
   */
  handleCallResult(messageId, payload = {}) {
    if (!messageId || typeof messageId !== 'string') return false;

    const pending = this.pendingCalls.get(messageId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pendingCalls.delete(messageId);

    const safePayload = payload && typeof payload === 'object' ? payload : {};
    pending.resolve(safePayload);
    return true;
  }

  /**
   * Correlates an incoming CALLERROR (type 4) frame to a pending outbound CALL.
   *
   * @param {string} messageId - Message ID echoed from station
   * @param {string} errorCode - OCPP ErrorCode (e.g. 'FormatViolation', 'PropertyConstraintViolation')
   * @param {string} [errorDescription=''] - Human-readable error description
   * @param {object} [errorDetails={}] - Additional vendor or protocol details
   * @returns {boolean} True if matching pending call was found and rejected; false otherwise
   */
  handleCallError(messageId, errorCode, errorDescription = '', errorDetails = {}) {
    if (!messageId || typeof messageId !== 'string') return false;

    const pending = this.pendingCalls.get(messageId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pendingCalls.delete(messageId);

    const err = new OcppError(
      errorCode || ERROR_CODES.INTERNAL_ERROR,
      errorDescription || `Station returned error code ${errorCode}`,
      errorDetails || {}
    );
    err.statusCode = 502;
    pending.reject(err);
    return true;
  }

  /**
   * Aborts all pending calls for a disconnecting charge point.
   *
   * @param {string} chargePointId
   * @param {string} [reason='Connection closed']
   * @returns {number} Number of aborted calls
   */
  abortPendingForChargePoint(chargePointId, reason = 'Connection closed') {
    if (!chargePointId) return 0;

    let abortedCount = 0;
    for (const [msgId, pending] of this.pendingCalls.entries()) {
      if (pending.chargePointId === chargePointId) {
        clearTimeout(pending.timer);
        this.pendingCalls.delete(msgId);

        const err = new Error(
          `Connection to charging station "${chargePointId}" closed while waiting for ${pending.action}: ${reason}`
        );
        err.statusCode = 503;
        err.code = 'CONNECTION_CLOSED';
        pending.reject(err);
        abortedCount++;
      }
    }

    return abortedCount;
  }

  /**
   * Returns whether a call with the given messageId is currently pending.
   *
   * @param {string} messageId
   * @returns {boolean}
   */
  has(messageId) {
    return this.pendingCalls.has(messageId);
  }

  /**
   * Returns current count of pending outbound calls.
   *
   * @returns {number}
   */
  size() {
    return this.pendingCalls.size;
  }

  /**
   * Clears all pending calls and timers (useful for test resets and graceful server shutdowns).
   */
  clear() {
    for (const pending of this.pendingCalls.values()) {
      clearTimeout(pending.timer);
      const err = new Error('Call manager cleared');
      err.code = 'MANAGER_CLEARED';
      pending.reject(err);
    }
    this.pendingCalls.clear();
  }
}

// Export singleton instance for production usage
export const ocppCallManager = new OcppCallManager();
export default ocppCallManager;
