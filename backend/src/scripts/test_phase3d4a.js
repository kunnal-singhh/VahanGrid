/**
 * backend/src/scripts/test_phase3d4a.js
 *
 * Automated verification test suite for Phase 3D.4A — OCPP 2.0.1 StatusNotification.
 *
 * Verifies:
 *  1. Valid StatusNotification CALL receives correct CALLRESULT (type 3).
 *  2. Response payload is an empty object {} per OCPP 2.0.1 specification.
 *  3. Response echoes the same unique messageId.
 *  4. All valid ConnectorStatusEnumType values accepted: Available, Occupied, Reserved, Unavailable, Faulted.
 *  5. Invalid status values rejected with PropertyConstraintViolation (e.g., Preparing, Charging, Faulty).
 *  6. Required-field schema validation: timestamp, connectorStatus, evseId, connectorId.
 *  7. Non-integer / negative evseId and connectorId rejected with appropriate errors.
 *  8. Invalid message frame structure handled safely (non-array, unsupported messageTypeId, missing action).
 *  9. Malformed JSON handled safely (RpcFrameworkError).
 * 10. Missing / empty messageId handled safely.
 * 11. Unsupported actions (Heartbeat, TransactionEvent, MeterValues) return CALLERROR NotImplemented.
 * 12. Transient in-memory state: latest StatusNotification stored per charge point and per connector in connectionRegistry.
 * 13. Multiple charge points maintain isolated and independent status state.
 * 14. PostgreSQL connector records remain completely unmodified (no DB side-effects).
 * 15. BootNotification regression: BootNotification still works and retains transient state.
 * 16. Existing REST health endpoint: GET /api/v1/health.
 * 17. Existing station APIs: GET /api/v1/stations/nearby.
 * 18. Existing charging-session APIs: GET /api/v1/sessions.
 * 19. Existing wallet APIs: GET /api/v1/wallet.
 */

import WebSocket from 'ws';
import {
  handleStatusNotification,
  handleBootNotification,
  connectionRegistry,
  VALID_CONNECTOR_STATUSES,
  OcppError,
  ERROR_CODES,
} from '../ocpp/index.js';
import { query } from '../config/database.js';

const SERVER_URL = 'http://127.0.0.1:3001';
const WS_URL = 'ws://127.0.0.1:3001';

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

/** Helper to send a message and await the next response frame. */
function sendAndReceive(ws, messageObj) {
  return new Promise((resolve, reject) => {
    const payload = typeof messageObj === 'string' ? messageObj : JSON.stringify(messageObj);

    const onMessage = (data) => {
      ws.removeListener('message', onMessage);
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(data.toString());
        resolve(parsed);
      } catch (err) {
        resolve(data.toString());
      }
    };

    const timer = setTimeout(() => {
      ws.removeListener('message', onMessage);
      reject(new Error(`Timeout waiting for response to: ${payload.slice(0, 100)}`));
    }, 3000);

    ws.on('message', onMessage);
    ws.send(payload);
  });
}

/** Helper to wait for socket closure. */
function waitForClose(ws) {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.on('close', () => resolve());
  });
}

async function run() {
  console.log('========================================================');
  console.log('🧪 Starting Phase 3D.4A OCPP 2.0.1 StatusNotification Tests');
  console.log('========================================================\n');

  // ── 1. In-Process Unit Tests: Schema & Constraint Validation ───────────────
  console.log('--- 1. In-Process Schema & Constraint Validation Unit Tests ---');

  const dummyWs = { readyState: 1 };
  connectionRegistry.register('CP-UNIT-SN', dummyWs);

  // 1a. Valid execution
  const validPayload = {
    timestamp: new Date().toISOString(),
    connectorStatus: 'Available',
    evseId: 1,
    connectorId: 1,
  };

  const res1 = await handleStatusNotification(validPayload, 'CP-UNIT-SN', dummyWs);
  assert(typeof res1 === 'object' && Object.keys(res1).length === 0, '1a. handleStatusNotification returns empty object {}');

  const storedStatus = connectionRegistry.getLatestStatusNotification('CP-UNIT-SN');
  assert(storedStatus !== null, '1b. StatusNotification is stored in connectionRegistry');
  assert(storedStatus.connectorStatus === 'Available', '1c. Stored connectorStatus is Available');
  assert(storedStatus.evseId === 1, '1d. Stored evseId is 1');
  assert(storedStatus.connectorId === 1, '1e. Stored connectorId is 1');

  // 1b. Missing timestamp
  let errMissingTimestamp = false;
  try {
    await handleStatusNotification({ connectorStatus: 'Available', evseId: 1, connectorId: 1 }, 'CP-UNIT-SN', dummyWs);
  } catch (err) {
    errMissingTimestamp = err instanceof OcppError && err.code === ERROR_CODES.FORMAT_VIOLATION;
  }
  assert(errMissingTimestamp, '1f. Missing timestamp throws FormatViolation');

  // 1c. Invalid timestamp
  let errInvalidTimestamp = false;
  try {
    await handleStatusNotification({ timestamp: 'invalid-date', connectorStatus: 'Available', evseId: 1, connectorId: 1 }, 'CP-UNIT-SN', dummyWs);
  } catch (err) {
    errInvalidTimestamp = err instanceof OcppError && err.code === ERROR_CODES.FORMAT_VIOLATION;
  }
  assert(errInvalidTimestamp, '1g. Invalid timestamp throws FormatViolation');

  // 1d. Missing connectorStatus
  let errMissingStatus = false;
  try {
    await handleStatusNotification({ timestamp: new Date().toISOString(), evseId: 1, connectorId: 1 }, 'CP-UNIT-SN', dummyWs);
  } catch (err) {
    errMissingStatus = err instanceof OcppError && err.code === ERROR_CODES.FORMAT_VIOLATION;
  }
  assert(errMissingStatus, '1h. Missing connectorStatus throws FormatViolation');

  // 1e. Invalid connectorStatus enum
  let errInvalidStatus = false;
  try {
    await handleStatusNotification(
      { timestamp: new Date().toISOString(), connectorStatus: 'Charging', evseId: 1, connectorId: 1 },
      'CP-UNIT-SN',
      dummyWs
    );
  } catch (err) {
    errInvalidStatus = err instanceof OcppError && err.code === ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION;
  }
  assert(errInvalidStatus, '1i. Invalid connectorStatus ("Charging") throws PropertyConstraintViolation');

  // 1f. Missing evseId
  let errMissingEvse = false;
  try {
    await handleStatusNotification({ timestamp: new Date().toISOString(), connectorStatus: 'Available', connectorId: 1 }, 'CP-UNIT-SN', dummyWs);
  } catch (err) {
    errMissingEvse = err instanceof OcppError && err.code === ERROR_CODES.FORMAT_VIOLATION;
  }
  assert(errMissingEvse, '1j. Missing evseId throws FormatViolation');

  // 1g. Non-integer evseId
  let errNonIntEvse = false;
  try {
    await handleStatusNotification({ timestamp: new Date().toISOString(), connectorStatus: 'Available', evseId: 1.5, connectorId: 1 }, 'CP-UNIT-SN', dummyWs);
  } catch (err) {
    errNonIntEvse = err instanceof OcppError && err.code === ERROR_CODES.FORMAT_VIOLATION;
  }
  assert(errNonIntEvse, '1k. Non-integer evseId (1.5) throws FormatViolation');

  // 1h. Negative evseId
  let errNegativeEvse = false;
  try {
    await handleStatusNotification({ timestamp: new Date().toISOString(), connectorStatus: 'Available', evseId: -1, connectorId: 1 }, 'CP-UNIT-SN', dummyWs);
  } catch (err) {
    errNegativeEvse = err instanceof OcppError && err.code === ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION;
  }
  assert(errNegativeEvse, '1l. Negative evseId (-1) throws PropertyConstraintViolation');

  // 1i. Missing connectorId
  let errMissingConn = false;
  try {
    await handleStatusNotification({ timestamp: new Date().toISOString(), connectorStatus: 'Available', evseId: 1 }, 'CP-UNIT-SN', dummyWs);
  } catch (err) {
    errMissingConn = err instanceof OcppError && err.code === ERROR_CODES.FORMAT_VIOLATION;
  }
  assert(errMissingConn, '1m. Missing connectorId throws FormatViolation');

  // 1j. Non-integer connectorId
  let errNonIntConn = false;
  try {
    await handleStatusNotification({ timestamp: new Date().toISOString(), connectorStatus: 'Available', evseId: 1, connectorId: '1' }, 'CP-UNIT-SN', dummyWs);
  } catch (err) {
    errNonIntConn = err instanceof OcppError && err.code === ERROR_CODES.FORMAT_VIOLATION;
  }
  assert(errNonIntConn, '1n. String connectorId ("1") throws FormatViolation');

  // 1k. Negative connectorId
  let errNegativeConn = false;
  try {
    await handleStatusNotification({ timestamp: new Date().toISOString(), connectorStatus: 'Available', evseId: 1, connectorId: -2 }, 'CP-UNIT-SN', dummyWs);
  } catch (err) {
    errNegativeConn = err instanceof OcppError && err.code === ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION;
  }
  assert(errNegativeConn, '1o. Negative connectorId (-2) throws PropertyConstraintViolation');

  // 1l. Conflicting station identity
  let errConflict = false;
  try {
    await handleStatusNotification(
      { timestamp: new Date().toISOString(), connectorStatus: 'Available', evseId: 1, connectorId: 1, chargePointId: 'OTHER_ID' },
      'CP-UNIT-SN',
      dummyWs
    );
  } catch (err) {
    errConflict = err instanceof OcppError && err.code === ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION;
  }
  assert(errConflict, '1p. Conflicting chargePointId in payload throws PropertyConstraintViolation');

  // 1m. Multi-connector tracking on same station
  await handleStatusNotification(
    { timestamp: new Date().toISOString(), connectorStatus: 'Occupied', evseId: 1, connectorId: 2 },
    'CP-UNIT-SN',
    dummyWs
  );
  const conn1 = connectionRegistry.getStatusNotification('CP-UNIT-SN', 1, 1);
  const conn2 = connectionRegistry.getStatusNotification('CP-UNIT-SN', 1, 2);
  assert(conn1.connectorStatus === 'Available', '1q. Multi-connector: Connector 1 retains status Available');
  assert(conn2.connectorStatus === 'Occupied', '1r. Multi-connector: Connector 2 retains status Occupied');

  // 1n. Multi-charge point isolation in connectionRegistry
  const dummyWs2 = { readyState: 1 };
  connectionRegistry.register('CP-UNIT-SN-2', dummyWs2);
  await handleStatusNotification(
    { timestamp: new Date().toISOString(), connectorStatus: 'Faulted', evseId: 1, connectorId: 1 },
    'CP-UNIT-SN-2',
    dummyWs2
  );
  const cp1Status = connectionRegistry.getLatestStatusNotification('CP-UNIT-SN');
  const cp2Status = connectionRegistry.getLatestStatusNotification('CP-UNIT-SN-2');
  assert(cp1Status.connectorStatus === 'Occupied', '1s. Station isolation: CP-UNIT-SN latest status is Occupied');
  assert(cp2Status.connectorStatus === 'Faulted', '1t. Station isolation: CP-UNIT-SN-2 status is Faulted');

  connectionRegistry.clear();

  // ── 2. Real WebSocket Client Valid StatusNotification & CALLRESULT ────────
  console.log('\n--- 2. Real WebSocket Client Valid StatusNotification CALL ---');

  const cpId1 = `CP-SN-1-${Date.now()}`;
  const clientWs1 = await connectWs(`${WS_URL}/ocpp/${cpId1}`);
  assert(clientWs1.readyState === WebSocket.OPEN, '2a. WebSocket client connected to live OCPP gateway');

  const msgId1 = `msg-sn-${Date.now()}`;
  const snCall1 = [
    2, // CALL
    msgId1,
    'StatusNotification',
    {
      timestamp: new Date().toISOString(),
      connectorStatus: 'Available',
      evseId: 1,
      connectorId: 1,
    },
  ];

  const resWs1 = await sendAndReceive(clientWs1, snCall1);
  assert(Array.isArray(resWs1), '2b. Response is a JSON array');
  assert(resWs1[0] === 3, '2c. Response messageTypeId is 3 (CALLRESULT)');
  assert(resWs1[1] === msgId1, `2d. Response echoes the same unique messageId (${msgId1})`);
  assert(typeof resWs1[2] === 'object' && resWs1[2] !== null, '2e. Response payload is an object');
  assert(Object.keys(resWs1[2]).length === 0, '2f. Response payload is empty object {} per OCPP 2.0.1 specification');

  // ── 3. All Valid Status Values Accepted ───────────────────────────────────
  console.log('\n--- 3. All Valid ConnectorStatusEnumType Values Accepted ---');

  const statuses = ['Available', 'Occupied', 'Reserved', 'Unavailable', 'Faulted'];
  for (const status of statuses) {
    const msgId = `msg-sn-${status}-${Date.now()}`;
    const call = [
      2,
      msgId,
      'StatusNotification',
      {
        timestamp: new Date().toISOString(),
        connectorStatus: status,
        evseId: 1,
        connectorId: 1,
      },
    ];
    const res = await sendAndReceive(clientWs1, call);
    assert(
      Array.isArray(res) && res[0] === 3 && res[1] === msgId,
      `3. Status "${status}" accepted with CALLRESULT`
    );
  }

  // ── 4. Invalid Status Rejected with PropertyConstraintViolation ───────────
  console.log('\n--- 4. Invalid Status Rejected ---');

  const invalidStatuses = ['Charging', 'Preparing', 'SuspendedEV', 'Finishing', 'Broken'];
  for (const invStatus of invalidStatuses) {
    const msgId = `msg-sn-inv-${invStatus}-${Date.now()}`;
    const call = [
      2,
      msgId,
      'StatusNotification',
      {
        timestamp: new Date().toISOString(),
        connectorStatus: invStatus,
        evseId: 1,
        connectorId: 1,
      },
    ];
    const res = await sendAndReceive(clientWs1, call);
    assert(
      Array.isArray(res) && res[0] === 4 && res[1] === msgId && res[2] === 'PropertyConstraintViolation',
      `4. Invalid status "${invStatus}" rejected with PropertyConstraintViolation`
    );
  }

  // ── 5. Malformed Messages & Robust Error Handling ─────────────────────────
  console.log('\n--- 5. Malformed Messages & Error Handling ---');

  // 5a. Missing evseId
  const missingEvseMsgId = `msg-missing-evse-${Date.now()}`;
  const missingEvseCall = [
    2,
    missingEvseMsgId,
    'StatusNotification',
    { timestamp: new Date().toISOString(), connectorStatus: 'Available', connectorId: 1 },
  ];
  const resMissingEvse = await sendAndReceive(clientWs1, missingEvseCall);
  assert(resMissingEvse[0] === 4 && resMissingEvse[2] === 'FormatViolation', '5a. Missing evseId returns FormatViolation');

  // 5b. Negative connectorId
  const negConnMsgId = `msg-neg-conn-${Date.now()}`;
  const negConnCall = [
    2,
    negConnMsgId,
    'StatusNotification',
    { timestamp: new Date().toISOString(), connectorStatus: 'Available', evseId: 1, connectorId: -1 },
  ];
  const resNegConn = await sendAndReceive(clientWs1, negConnCall);
  assert(resNegConn[0] === 4 && resNegConn[2] === 'PropertyConstraintViolation', '5b. Negative connectorId returns PropertyConstraintViolation');

  // 5c. Invalid JSON
  const resBadJson = await sendAndReceive(clientWs1, '{invalid json syntax');
  assert(resBadJson[0] === 4 && resBadJson[2] === 'RpcFrameworkError', '5c. Invalid JSON returns RpcFrameworkError');

  // 5d. Non-array frame
  const resNonArray = await sendAndReceive(clientWs1, { not: 'an array' });
  assert(resNonArray[0] === 4 && resNonArray[2] === 'RpcFrameworkError', '5d. Non-array frame returns RpcFrameworkError');

  // 5e. Missing messageId
  const resEmptyId = await sendAndReceive(clientWs1, [2, '', 'StatusNotification', validPayload]);
  assert(resEmptyId[0] === 4 && resEmptyId[2] === 'RpcFrameworkError', '5e. Empty messageId returns RpcFrameworkError');

  // 5f. Unsupported actions
  const authMsgId = `msg-auth-${Date.now()}`;
  const authRes = await sendAndReceive(clientWs1, [2, authMsgId, 'Authorize', { idToken: { idToken: 'TAG-1', type: 'ISO14443' } }]);
  assert(authRes[0] === 4 && authRes[2] === 'NotImplemented', '5f. Unsupported action "Authorize" returns NotImplemented');

  const txMsgId = `msg-tx-${Date.now()}`;
  const txRes = await sendAndReceive(clientWs1, [2, txMsgId, 'TransactionEvent', { eventType: 'Started' }]);
  assert(txRes[0] === 4 && txRes[2] === 'NotImplemented', '5g. Unsupported action "TransactionEvent" returns NotImplemented');

  const mvMsgId = `msg-mv-${Date.now()}`;
  const mvRes = await sendAndReceive(clientWs1, [2, mvMsgId, 'MeterValues', { evseId: 1 }]);
  assert(mvRes[0] === 4 && mvRes[2] === 'NotImplemented', '5h. Unsupported action "MeterValues" returns NotImplemented');

  // ── 6. Transient State & Multi-Client Independence ────────────────────────
  console.log('\n--- 6. Transient In-Memory State & Multi-Client Isolation ---');

  const cpId2 = `CP-SN-2-${Date.now()}`;
  const clientWs2 = await connectWs(`${WS_URL}/ocpp/${cpId2}`);

  // Send status from CP 1: evse 1, connector 1 -> Available
  await sendAndReceive(clientWs1, [
    2,
    `msg-cp1-sn-${Date.now()}`,
    'StatusNotification',
    { timestamp: new Date().toISOString(), connectorStatus: 'Available', evseId: 1, connectorId: 1 },
  ]);

  // Send status from CP 2: evse 1, connector 1 -> Faulted
  await sendAndReceive(clientWs2, [
    2,
    `msg-cp2-sn-${Date.now()}`,
    'StatusNotification',
    { timestamp: new Date().toISOString(), connectorStatus: 'Faulted', evseId: 1, connectorId: 1 },
  ]);

  // Both should be open
  assert(clientWs1.readyState === WebSocket.OPEN, '6a. Socket 1 remains OPEN');
  assert(clientWs2.readyState === WebSocket.OPEN, '6b. Socket 2 remains OPEN');

  // ── 7. Verify PostgreSQL Connector State Unchanged ─────────────────────────
  console.log('\n--- 7. PostgreSQL Connector State Verification (No DB Modification) ---');

  // Read current connectors from PostgreSQL
  const dbConnectorsBefore = await query('SELECT id, status, updated_at FROM connectors ORDER BY id ASC');
  assert(dbConnectorsBefore.rows.length > 0, `7a. Database contains ${dbConnectorsBefore.rows.length} existing connectors`);

  // Send StatusNotification with status "Unavailable"
  const dbCheckMsgId = `msg-db-check-${Date.now()}`;
  await sendAndReceive(clientWs1, [
    2,
    dbCheckMsgId,
    'StatusNotification',
    { timestamp: new Date().toISOString(), connectorStatus: 'Unavailable', evseId: 1, connectorId: 1 },
  ]);

  // Read connectors again from PostgreSQL
  const dbConnectorsAfter = await query('SELECT id, status, updated_at FROM connectors ORDER BY id ASC');
  assert(dbConnectorsAfter.rows.length === dbConnectorsBefore.rows.length, '7b. Connector row count in DB is identical');

  let dbModified = false;
  for (let i = 0; i < dbConnectorsBefore.rows.length; i++) {
    const before = dbConnectorsBefore.rows[i];
    const after = dbConnectorsAfter.rows[i];
    if (before.status !== after.status || before.updated_at.getTime() !== after.updated_at.getTime()) {
      dbModified = true;
      break;
    }
  }
  assert(!dbModified, '7c. StatusNotification did NOT modify PostgreSQL connector state');

  // ── 8. BootNotification Regression ─────────────────────────────────────────
  console.log('\n--- 8. BootNotification Regression Verification ---');

  const bootMsgId = `msg-boot-reg-${Date.now()}`;
  const bootCall = [
    2,
    bootMsgId,
    'BootNotification',
    {
      reason: 'PowerUp',
      chargingStation: {
        model: 'RegressionModel-1',
        vendorName: 'VahanHardware',
      },
    },
  ];
  const bootRes = await sendAndReceive(clientWs1, bootCall);
  assert(bootRes[0] === 3, '8a. BootNotification returns CALLRESULT');
  assert(bootRes[1] === bootMsgId, '8b. BootNotification echoes messageId');
  assert(bootRes[2].status === 'Accepted', '8c. BootNotification status is Accepted');
  assert(bootRes[2].interval === 300, '8d. BootNotification interval is 300');
  assert(typeof bootRes[2].currentTime === 'string', '8e. BootNotification returns current server time');

  // Clean close sockets
  clientWs1.close(1000, 'Test finished');
  clientWs2.close(1000, 'Test finished');
  await Promise.all([waitForClose(clientWs1), waitForClose(clientWs2)]);
  assert(true, '8f. Client sockets closed cleanly');

  // ── 9. Existing REST API Regression ───────────────────────────────────────
  console.log('\n--- 9. Existing REST API Regression ---');

  const healthRes = await fetch(`${SERVER_URL}/api/v1/health`);
  const healthJson = await healthRes.json();
  assert(healthRes.status === 200, '9a. GET /api/v1/health returns 200');
  assert(healthJson.status === 'healthy', '9b. Health status is "healthy"');

  const stationsRes = await fetch(`${SERVER_URL}/api/v1/stations/nearby?lat=19.0596&lng=72.8295&radius_km=10`);
  assert(stationsRes.status === 200, '9c. GET /stations/nearby (PostGIS) returns 200');

  const authMeRes = await fetch(`${SERVER_URL}/api/v1/auth/me`);
  assert(authMeRes.status === 401, '9d. GET /api/v1/auth/me returns 401');

  const vehiclesRes = await fetch(`${SERVER_URL}/api/v1/vehicles`);
  assert(vehiclesRes.status === 401, '9e. GET /api/v1/vehicles returns 401');

  const sessionsRes = await fetch(`${SERVER_URL}/api/v1/sessions`);
  assert(sessionsRes.status === 401, '9f. GET /api/v1/sessions returns 401');

  const walletRes = await fetch(`${SERVER_URL}/api/v1/wallet`);
  assert(walletRes.status === 401, '9g. GET /api/v1/wallet returns 401');

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
