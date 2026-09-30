/**
 * src/ocpp/ocppServer.js
 *
 * OCPP WebSocket Server Foundation (Phase 3D.2).
 *
 * Architecture:
 *  - Integrates with the existing Node.js HTTP server (shares port, no second port).
 *  - Listens for HTTP Upgrade requests on path: /ocpp/:chargePointId
 *  - Extracts and validates the charge-point ID from the WebSocket URL path.
 *  - Manages the connection lifecycle (connect, register, disconnect, error).
 *  - Deterministic duplicate connection handling via connectionRegistry.
 *  - Phase 3D.2 scope: WebSocket connectivity foundation ONLY. Incoming messages
 *    are logged/ignored safely; NO OCPP business messages or responses are fabricated.
 */

import { WebSocketServer } from 'ws';
import connectionRegistry from './connectionRegistry.js';
import { handleOcppMessage } from './messageHandler.js';

let wssInstance = null;

/**
 * Extracts and validates the chargePointId from an HTTP request URL.
 * Expected path format: /ocpp/<chargePointId>
 * Examples:
 *   /ocpp/CP-001       -> 'CP-001'
 *   /ocpp/STATION_A    -> 'STATION_A'
 *
 * Returns null if the URL is not an OCPP path, or if chargePointId is missing or empty.
 *
 * @param {string} requestUrl
 * @returns {string|null}
 */
export function extractChargePointId(requestUrl) {
  if (!requestUrl || typeof requestUrl !== 'string') return null;

  try {
    const url = new URL(requestUrl, 'http://localhost');
    const pathname = url.pathname;

    // Must be an /ocpp route
    if (!pathname.startsWith('/ocpp')) {
      return null;
    }

    // Match exactly /ocpp/<chargePointId> or /ocpp/<chargePointId>/
    // Rejects nested sub-paths (/ocpp/a/b) or empty IDs (/ocpp or /ocpp/)
    const match = pathname.match(/^\/ocpp\/([^/?#]+)\/?$/);
    if (!match) {
      return null;
    }

    const rawId = match[1];
    const decoded = decodeURIComponent(rawId).trim();
    return decoded.length > 0 ? decoded : null;
  } catch (_) {
    return null;
  }
}

/**
 * Initializes the OCPP WebSocket gateway attached to the provided HTTP server.
 *
 * @param {import('http').Server} httpServer
 * @param {object} [options]
 * @returns {import('ws').WebSocketServer}
 */
export function initOcppServer(httpServer, options = {}) {
  if (!httpServer) {
    throw new Error('[OCPP Server] An active HTTP server instance is required');
  }

  // Create WebSocketServer with noServer: true to share the HTTP server
  const wss = new WebSocketServer({
    noServer: true,
    // Accept standard OCPP subprotocols (e.g. ocpp2.0.1, ocpp1.6) or plain WebSocket
    handleProtocols: (protocols) => {
      if (protocols.has('ocpp2.0.1')) return 'ocpp2.0.1';
      if (protocols.has('ocpp1.6')) return 'ocpp1.6';
      // If client provides other or no subprotocol, accept first or false
      const first = Array.from(protocols)[0];
      return first || false;
    },
    ...options,
  });

  wssInstance = wss;

  // Intercept HTTP upgrade events on the shared HTTP server
  httpServer.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try {
      const parsed = new URL(request.url || '', 'http://localhost');
      pathname = parsed.pathname;
    } catch (_) {
      pathname = request.url || '';
    }

    // Only process paths starting with /ocpp
    if (!pathname.startsWith('/ocpp')) {
      return;
    }

    const chargePointId = extractChargePointId(request.url);

    // If charge-point ID is missing or invalid, reject upgrade with HTTP 400 Bad Request
    if (!chargePointId) {
      console.warn(`[OCPP Server] Rejected WebSocket upgrade: missing or invalid charge-point ID in "${request.url}"`);
      socket.write(
        'HTTP/1.1 400 Bad Request\r\n' +
        'Connection: close\r\n' +
        'Content-Type: text/plain\r\n' +
        '\r\n' +
        'Missing or invalid charge-point ID in path. Expected format: /ocpp/<charge-point-id>\r\n'
      );
      socket.destroy();
      return;
    }

    // Complete WebSocket handshake
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, chargePointId);
    });
  });

  // Handle incoming WebSocket connections
  wss.on('connection', (ws, request, chargePointId) => {
    const cpId = chargePointId || extractChargePointId(request.url);

    if (!cpId) {
      console.warn('[OCPP Server] Socket connected without chargePointId; terminating.');
      ws.close(1008, 'Missing chargePointId');
      return;
    }

    console.log(`[OCPP] Charge Point connected: "${cpId}" (remote: ${request.socket?.remoteAddress || 'unknown'})`);

    // Register in live in-memory registry (supersedes any duplicate previous connection)
    connectionRegistry.register(cpId, ws);

    // Message handler: dispatch to OCPP router (Phase 3D.3 BootNotification)
    ws.on('message', async (message) => {
      try {
        await handleOcppMessage(message, cpId, ws);
      } catch (err) {
        console.error(`[OCPP] [${cpId}] Unhandled message error:`, err);
      }
    });

    // Handle socket errors cleanly without crashing Express
    ws.on('error', (err) => {
      console.error(`[OCPP] [${cpId}] Socket error:`, err.message);
    });

    // Handle connection closure
    ws.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : 'none';
      console.log(`[OCPP] Charge Point disconnected: "${cpId}" (code: ${code}, reason: ${reasonStr})`);

      // Guarded removal: only removes if the registered connection is this exact socket
      connectionRegistry.remove(cpId, ws);
    });
  });

  return wss;
}

/**
 * Returns the current WebSocketServer instance.
 * @returns {import('ws').WebSocketServer|null}
 */
export function getOcppServer() {
  return wssInstance;
}

/**
 * Gracefully shuts down the OCPP WebSocket server and clears active connections.
 */
export function closeOcppServer() {
  if (wssInstance) {
    connectionRegistry.clear(true);
    wssInstance.close();
    wssInstance = null;
  }
}
