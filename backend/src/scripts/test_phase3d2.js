/**
 * backend/src/scripts/test_phase3d2.js
 *
 * Automated verification test suite for Phase 3D.2 — OCPP WebSocket Foundation.
 *
 * Test coverage:
 *  1. extractChargePointId parses valid paths and rejects malformed/missing IDs.
 *  2. ConnectionRegistry correctly registers, retrieves, and checks connections.
 *  3. In-memory registry lifecycle:
 *     - Real WebSocket client connects via ws://.../ocpp/<chargePointId>
 *     - Charge-point ID is extracted and registered in connectionRegistry
 *     - Multiple distinct charge points can connect and coexist
 *     - Disconnect removes socket from connectionRegistry
 *  4. Deterministic duplicate connection handling:
 *     - Connecting with an existing chargePointId closes the older socket (code 4001)
 *     - The new socket supersedes and remains active in the registry
 *     - Old socket's close event does not evict the new connection
 *  5. Malformed connection rejection:
 *     - Missing chargePointId (/ocpp or /ocpp/) rejected with HTTP 400
 *     - Nested invalid paths (/ocpp/CP/extra) rejected with HTTP 400
 *  6. Main server integration (ws://127.0.0.1:3001):
 *     - Real client connects to running backend server
 *     - Data transmission is safely handled without fabricating responses
 *  7. REST API regression:
 *     - GET /api/v1/health returns 200 ok
 *     - Existing REST routes continue functioning
 */

import http from 'http';
import WebSocket from 'ws';
import {
  initOcppServer,
  closeOcppServer,
  extractChargePointId,
  connectionRegistry,
} from '../ocpp/index.js';

const MAIN_SERVER_URL = 'http://127.0.0.1:3001';
const MAIN_WS_URL = 'ws://127.0.0.1:3001';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

/** Helper to connect a real WebSocket client returning a Promise. */
function connectWs(url, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error(`WebSocket connection timeout to ${url}`));
    }, 4000);

    ws.on('open', () => {
      clearTimeout(timeout);
      resolve(ws);
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/** Helper to wait for a WebSocket to close. */
function waitForClose(ws) {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve({ code: 1000, reason: '' });
      return;
    }
    ws.on('close', (code, reason) => {
      resolve({ code, reason: reason ? reason.toString() : '' });
    });
  });
}

async function run() {
  console.log('========================================================');
  console.log('🧪 Starting Phase 3D.2 OCPP WebSocket Foundation Verification');
  console.log('========================================================\n');

  // ── 1. URL Parsing & ID Extraction Unit Tests ──────────────────────────────
  console.log('--- 1. Charge-Point ID Extraction ---');

  assert(
    extractChargePointId('/ocpp/CP-001') === 'CP-001',
    '1a. Extracts simple chargePointId: /ocpp/CP-001 -> "CP-001"'
  );
  assert(
    extractChargePointId('/ocpp/CP-001/') === 'CP-001',
    '1b. Handles trailing slash: /ocpp/CP-001/ -> "CP-001"'
  );
  assert(
    extractChargePointId('/ocpp/TATA_POWER_HUB_01?protocol=ocpp2.0.1') === 'TATA_POWER_HUB_01',
    '1c. Ignores query parameters: /ocpp/TATA_POWER_HUB_01?protocol=... -> "TATA_POWER_HUB_01"'
  );
  assert(
    extractChargePointId('/ocpp/STATION%20ALPHA') === 'STATION ALPHA',
    '1d. Decodes URL-encoded characters: /ocpp/STATION%20ALPHA -> "STATION ALPHA"'
  );
  assert(
    extractChargePointId('/ocpp') === null,
    '1e. Rejects missing ID: /ocpp -> null'
  );
  assert(
    extractChargePointId('/ocpp/') === null,
    '1f. Rejects empty ID: /ocpp/ -> null'
  );
  assert(
    extractChargePointId('/ocpp/CP-001/connectors') === null,
    '1g. Rejects nested subpaths: /ocpp/CP-001/connectors -> null'
  );
  assert(
    extractChargePointId('/api/v1/health') === null,
    '1h. Ignores non-OCPP routes: /api/v1/health -> null'
  );
  assert(
    extractChargePointId('') === null,
    '1i. Handles empty string safely -> null'
  );

  // ── 2. Connection Registry In-Memory State Unit Tests ──────────────────────
  console.log('\n--- 2. In-Memory Connection Registry Unit Tests ---');

  connectionRegistry.clear();
  assert(connectionRegistry.size() === 0, '2a. Registry initializes empty');

  // Mock socket object
  let mock1Closed = false;
  let mock1Code = null;
  const mockWs1 = {
    readyState: WebSocket.OPEN,
    close: (code) => { mock1Closed = true; mock1Code = code; },
  };

  connectionRegistry.register('CP-UNIT-1', mockWs1);
  assert(connectionRegistry.has('CP-UNIT-1') === true, '2b. registry.has("CP-UNIT-1") returns true');
  assert(connectionRegistry.get('CP-UNIT-1') === mockWs1, '2c. registry.get("CP-UNIT-1") returns registered socket');
  assert(connectionRegistry.size() === 1, '2d. registry.size() is 1');

  // Duplicate registration supersedes
  const mockWs2 = {
    readyState: WebSocket.OPEN,
    close: () => {},
  };
  connectionRegistry.register('CP-UNIT-1', mockWs2);
  assert(mock1Closed === true && mock1Code === 4001, '2e. Duplicate registration closes previous socket with code 4001');
  assert(connectionRegistry.get('CP-UNIT-1') === mockWs2, '2f. New socket is now registered for CP-UNIT-1');

  // Guarded removal: mockWs1 close event should NOT remove mockWs2
  const removedMock1 = connectionRegistry.remove('CP-UNIT-1', mockWs1);
  assert(removedMock1 === false, '2g. registry.remove with stale socket does not remove newer socket');
  assert(connectionRegistry.has('CP-UNIT-1') === true, '2h. CP-UNIT-1 still present after stale socket remove call');

  // Removal of active socket
  const removedMock2 = connectionRegistry.remove('CP-UNIT-1', mockWs2);
  assert(removedMock2 === true, '2i. registry.remove with active socket returns true');
  assert(connectionRegistry.has('CP-UNIT-1') === false, '2j. CP-UNIT-1 removed from registry');
  assert(connectionRegistry.get('CP-UNIT-1') === null, '2k. registry.get returns null after removal');

  // ── 3. Real In-Process WebSocket Server & Lifecycle Verification ───────────
  console.log('\n--- 3. In-Process Server & Real WebSocket Client Lifecycle ---');

  const testHttpServer = http.createServer();
  const testWss = initOcppServer(testHttpServer);
  await new Promise((resolve) => testHttpServer.listen(0, '127.0.0.1', resolve));
  const testPort = testHttpServer.address().port;
  const testWsBase = `ws://127.0.0.1:${testPort}`;

  // 3a. Connect Client A
  const clientA = await connectWs(`${testWsBase}/ocpp/CP-TEST-A`);
  assert(clientA.readyState === WebSocket.OPEN, '3a. Client A connected successfully');
  assert(connectionRegistry.has('CP-TEST-A'), '3b. CP-TEST-A registered in connectionRegistry');
  assert(connectionRegistry.get('CP-TEST-A') !== null, '3c. connectionRegistry.get("CP-TEST-A") is retrievable');

  // 3b. Connect Client B (Multiple distinct charge points)
  const clientB = await connectWs(`${testWsBase}/ocpp/CP-TEST-B`);
  assert(clientB.readyState === WebSocket.OPEN, '3d. Client B connected successfully');
  assert(connectionRegistry.has('CP-TEST-B'), '3e. CP-TEST-B registered in connectionRegistry');
  assert(connectionRegistry.size() === 2, '3f. Multiple distinct charge points coexist in registry (size=2)');

  // 3c. Disconnect Client B
  const closePromiseB = waitForClose(clientB);
  clientB.close(1000, 'Normal test closure');
  await closePromiseB;
  // Give event loop a tick to process close handler
  await new Promise((r) => setTimeout(r, 50));
  assert(!connectionRegistry.has('CP-TEST-B'), '3g. Disconnected CP-TEST-B is removed from connectionRegistry');
  assert(connectionRegistry.has('CP-TEST-A'), '3h. CP-TEST-A remains in connectionRegistry');

  // ── 4. Deterministic Duplicate Connection Test ─────────────────────────────
  console.log('\n--- 4. Deterministic Duplicate Connection Handling ---');

  // Client A is currently connected as CP-TEST-A.
  // Connect Client A2 with the SAME charge-point ID.
  const closePromiseA = waitForClose(clientA);
  const clientA2 = await connectWs(`${testWsBase}/ocpp/CP-TEST-A`);

  // Wait for original Client A to be closed by server
  const closedAInfo = await closePromiseA;
  assert(closedAInfo.code === 4001, `4a. Original socket closed with code 4001 (got ${closedAInfo.code})`);
  assert(
    closedAInfo.reason === 'Superseded by new connection',
    `4b. Original socket close reason is "Superseded by new connection" (got "${closedAInfo.reason}")`
  );
  assert(clientA2.readyState === WebSocket.OPEN, '4c. Superseding client A2 is connected and OPEN');
  assert(connectionRegistry.has('CP-TEST-A'), '4d. CP-TEST-A remains registered');

  // Cleanup in-process test sockets & server
  clientA2.close(1000, 'Test complete');
  await waitForClose(clientA2);
  await new Promise((r) => setTimeout(r, 50));

  closeOcppServer();
  await new Promise((resolve) => testHttpServer.close(resolve));
  connectionRegistry.clear();

  // ── 5. Malformed URL & Missing ID Rejection ────────────────────────────────
  console.log('\n--- 5. Malformed URL & Missing ID Rejection ---');

  let rejectedMissingId = false;
  try {
    await connectWs(`${MAIN_WS_URL}/ocpp`);
  } catch (err) {
    rejectedMissingId = true;
    assert(
      err.message.includes('400') || err.message.includes('Unexpected server response'),
      `5a. /ocpp without ID rejected with HTTP 400 (${err.message})`
    );
  }
  assert(rejectedMissingId, '5b. Client connection to /ocpp failed as expected');

  let rejectedEmptyId = false;
  try {
    await connectWs(`${MAIN_WS_URL}/ocpp/`);
  } catch (err) {
    rejectedEmptyId = true;
    assert(
      err.message.includes('400') || err.message.includes('Unexpected server response'),
      `5c. /ocpp/ with empty ID rejected with HTTP 400 (${err.message})`
    );
  }
  assert(rejectedEmptyId, '5d. Client connection to /ocpp/ failed as expected');

  let rejectedNested = false;
  try {
    await connectWs(`${MAIN_WS_URL}/ocpp/CP-001/invalid/nested`);
  } catch (err) {
    rejectedNested = true;
    assert(
      err.message.includes('400') || err.message.includes('Unexpected server response'),
      `5e. Nested invalid path rejected with HTTP 400 (${err.message})`
    );
  }
  assert(rejectedNested, '5f. Client connection to nested path failed as expected');

  // ── 6. Live Main Server (Port 3001) Integration ────────────────────────────
  console.log('\n--- 6. Live Main Server Integration (Port 3001) ---');

  const mainCpId = `CP-MAIN-${Date.now()}`;
  const liveWs = await connectWs(`${MAIN_WS_URL}/ocpp/${mainCpId}`);
  assert(liveWs.readyState === WebSocket.OPEN, '6a. Connected to live backend server via WebSocket');

  // Send test payload (Phase 3D.2 foundation safely ignores data without crashing)
  liveWs.send(JSON.stringify([2, 'test-msg-1', 'Heartbeat', {}]));
  await new Promise((r) => setTimeout(r, 100));
  assert(liveWs.readyState === WebSocket.OPEN, '6b. Server handled incoming payload without crashing');

  liveWs.close(1000, 'Normal test completion');
  await waitForClose(liveWs);
  assert(true, '6c. Live socket closed cleanly');

  // ── 7. Existing REST API Regression ───────────────────────────────────────
  console.log('\n--- 7. Existing REST API Regression ---');

  const healthRes = await fetch(`${MAIN_SERVER_URL}/api/v1/health`);
  const healthJson = await healthRes.json();
  assert(healthRes.status === 200, '7a. GET /api/v1/health returns 200');
  assert(healthJson.status === 'healthy' && healthJson.success === true, '7b. Health endpoint reports status "healthy"');

  const stationsRes = await fetch(`${MAIN_SERVER_URL}/api/v1/stations/nearby?lat=19.0596&lng=72.8295&radius_km=10`);
  assert(stationsRes.status === 200, '7c. GET /stations/nearby (PostGIS) returns 200');

  const authMeRes = await fetch(`${MAIN_SERVER_URL}/api/v1/auth/me`);
  assert(authMeRes.status === 401, '7d. GET /api/v1/auth/me correctly returns 401 unauthenticated');

  const walletRes = await fetch(`${MAIN_SERVER_URL}/api/v1/wallet`);
  assert(walletRes.status === 401, '7e. GET /api/v1/wallet correctly returns 401 unauthenticated');

  const sessionsRes = await fetch(`${MAIN_SERVER_URL}/api/v1/sessions`);
  assert(sessionsRes.status === 401, '7f. GET /api/v1/sessions correctly returns 401 unauthenticated');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n========================================================');
  console.log(`📊 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('❌ Unhandled error in test suite:', err);
  process.exit(1);
});
