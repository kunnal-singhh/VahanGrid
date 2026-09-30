/**
 * src/ocpp/connectionRegistry.js
 *
 * In-memory connection registry for active OCPP charge-point WebSocket connections.
 *
 * Requirements (Phase 3D.2):
 *  - register(chargePointId, websocket)
 *  - get(chargePointId)
 *  - remove(chargePointId)
 *  - has(chargePointId)
 *
 * Properties & Rules:
 *  - Transient live state ONLY — never persisted in PostgreSQL.
 *  - chargePointId is the unique identifier of the physical/logical charging station.
 *  - Deterministic duplicate connection handling: If a new connection connects with
 *    the same chargePointId, the previous socket is gracefully closed with code 4001
 *    ('Superseded by new connection') and replaced by the new socket.
 */

class ConnectionRegistry {
  constructor() {
    /** @type {Map<string, { ws: any, chargePointId: string, connectedAt: Date }>} */
    this.connections = new Map();
  }

  /**
   * Registers a live WebSocket connection for a given chargePointId.
   * If an active connection already exists for this chargePointId, the existing
   * connection is superseded and closed with code 4001.
   *
   * @param {string} chargePointId
   * @param {import('ws').WebSocket} websocket
   * @returns {{ ws: import('ws').WebSocket, chargePointId: string, connectedAt: Date, superseded: boolean }}
   */
  register(chargePointId, websocket) {
    if (!chargePointId || typeof chargePointId !== 'string') {
      throw new Error('[ConnectionRegistry] chargePointId must be a non-empty string');
    }
    if (!websocket) {
      throw new Error('[ConnectionRegistry] websocket instance is required');
    }

    let superseded = false;

    // Handle duplicate connection deterministically
    if (this.connections.has(chargePointId)) {
      const existing = this.connections.get(chargePointId);
      if (existing.ws !== websocket) {
        superseded = true;
        try {
          existing.ws.close(4001, 'Superseded by new connection');
        } catch (_) {
          // Socket might already be in closing/closed state
        }
      }
    }

    const connectedAt = new Date();

    // Attach metadata properties directly on the websocket instance
    websocket.chargePointId = chargePointId;
    websocket.connectedAt = connectedAt;
    websocket.ws = websocket; // Self-referential compatibility

    const entry = {
      ws: websocket,
      chargePointId,
      connectedAt,
      superseded,
    };

    this.connections.set(chargePointId, entry);
    return entry;
  }

  /**
   * Retrieves the active WebSocket for a charge point.
   * Returns null if no active connection exists.
   *
   * @param {string} chargePointId
   * @returns {import('ws').WebSocket|null}
   */
  get(chargePointId) {
    if (!chargePointId) return null;
    const entry = this.connections.get(chargePointId);
    return entry ? entry.ws : null;
  }

  /**
   * Retrieves the full entry with metadata for a charge point.
   *
   * @param {string} chargePointId
   * @returns {{ ws: import('ws').WebSocket, chargePointId: string, connectedAt: Date }|null}
   */
  getEntry(chargePointId) {
    if (!chargePointId) return null;
    return this.connections.get(chargePointId) || null;
  }

  /**
   * Updates the in-memory entry for a charge point with BootNotification data.
   *
   * @param {string} chargePointId
   * @param {object} bootData - BootNotification details (reason, chargingStation, status)
   * @returns {object|null} The updated entry, or null if charge point is not registered
   */
  updateBootNotification(chargePointId, bootData) {
    if (!chargePointId) return null;
    const entry = this.connections.get(chargePointId);
    if (!entry) return null;

    entry.bootNotification = bootData;
    entry.registrationStatus = bootData.status || 'Accepted';
    entry.bootstrappedAt = new Date();

    // Attach to websocket instance for direct access
    entry.ws.bootNotification = entry.bootNotification;
    entry.ws.registrationStatus = entry.registrationStatus;
    entry.ws.bootstrappedAt = entry.bootstrappedAt;

    return entry;
  }

  /**
   * Retrieves BootNotification data for a registered charge point.
   *
   * @param {string} chargePointId
   * @returns {object|null}
   */
  getBootNotification(chargePointId) {
    if (!chargePointId) return null;
    const entry = this.connections.get(chargePointId);
    return entry ? entry.bootNotification || null : null;
  }

  /**
   * Updates the in-memory entry for a charge point with StatusNotification data.
   *
   * @param {string} chargePointId
   * @param {object} statusData - StatusNotification details (timestamp, connectorStatus, evseId, connectorId)
   * @returns {object|null} The updated entry, or null if charge point is not registered
   */
  updateStatusNotification(chargePointId, statusData) {
    if (!chargePointId) return null;
    const entry = this.connections.get(chargePointId);
    if (!entry) return null;

    const reportedAt = new Date();
    entry.latestStatusNotification = {
      ...statusData,
      reportedAt,
    };
    entry.lastStatusReportedAt = reportedAt;

    if (!entry.statusNotifications) {
      entry.statusNotifications = new Map();
    }
    const key = `${statusData.evseId}:${statusData.connectorId}`;
    entry.statusNotifications.set(key, {
      ...statusData,
      reportedAt,
    });

    // Attach to websocket instance for direct access
    entry.ws.latestStatusNotification = entry.latestStatusNotification;
    entry.ws.lastStatusReportedAt = entry.lastStatusReportedAt;

    return entry;
  }

  /**
   * Retrieves latest StatusNotification data for a registered charge point.
   *
   * @param {string} chargePointId
   * @returns {object|null}
   */
  getLatestStatusNotification(chargePointId) {
    if (!chargePointId) return null;
    const entry = this.connections.get(chargePointId);
    return entry ? entry.latestStatusNotification || null : null;
  }

  /**
   * Retrieves StatusNotification data for a specific EVSE/connector or latest.
   *
   * @param {string} chargePointId
   * @param {number} [evseId]
   * @param {number} [connectorId]
   * @returns {object|null}
   */
  getStatusNotification(chargePointId, evseId, connectorId) {
    if (!chargePointId) return null;
    const entry = this.connections.get(chargePointId);
    if (!entry) return null;

    if (evseId !== undefined && connectorId !== undefined) {
      const key = `${evseId}:${connectorId}`;
      return entry.statusNotifications?.get(key) || null;
    }

    return entry.latestStatusNotification || null;
  }

  /**
   * Checks if an active connection exists for the chargePointId.
   *
   * @param {string} chargePointId
   * @returns {boolean}
   */
  has(chargePointId) {
    if (!chargePointId) return false;
    const entry = this.connections.get(chargePointId);
    if (!entry) return false;
    // Check readyState (0 = CONNECTING, 1 = OPEN)
    return entry.ws.readyState === 0 || entry.ws.readyState === 1;
  }

  /**
   * Removes a connection from the registry.
   * If a specific websocket instance is provided, it only removes the entry
   * if it matches that instance (preventing race conditions where a superseded
   * socket's close event removes the newly registered connection).
   *
   * @param {string} chargePointId
   * @param {import('ws').WebSocket} [websocket]
   * @returns {boolean} True if removed, false otherwise
   */
  remove(chargePointId, websocket) {
    if (!chargePointId || !this.connections.has(chargePointId)) {
      return false;
    }

    if (websocket) {
      const current = this.connections.get(chargePointId);
      if (current && current.ws !== websocket) {
        // Current registered connection is a newer socket; do not remove
        return false;
      }
    }

    return this.connections.delete(chargePointId);
  }

  /**
   * Returns the count of registered connections.
   * @returns {number}
   */
  size() {
    return this.connections.size;
  }

  /**
   * Returns all currently registered charge-point IDs.
   * @returns {string[]}
   */
  getAllIds() {
    return Array.from(this.connections.keys());
  }

  /**
   * Clears all connections from the registry, closing sockets if requested.
   * @param {boolean} [closeSockets=false]
   */
  clear(closeSockets = false) {
    if (closeSockets) {
      for (const entry of this.connections.values()) {
        try {
          entry.ws.close(1001, 'Server shutting down');
        } catch (_) {}
      }
    }
    this.connections.clear();
  }
}

// Export singleton instance as default and named export
export const connectionRegistry = new ConnectionRegistry();
export { ConnectionRegistry };
export default connectionRegistry;
