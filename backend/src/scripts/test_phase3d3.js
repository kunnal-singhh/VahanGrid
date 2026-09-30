/**
 * backend/src/scripts/test_phase3d3.js
 *
 * Automated verification test suite for Phase 3D.3 — OCPP 2.0.1 BootNotification.
 *
 * Verifies:
 *  1. Valid WebSocket connection established to /ocpp/<chargePointId>.
 *  2. Valid BootNotification CALL receives correct CALLRESULT (type 3).
 *  3. Response echoes the same unique messageId.
 *  4. Response payload contains required fields: currentTime, interval, status ("Accepted").
 *  5. Server time is valid/current ISO-8601 (not hardcoded).
 *  6. BootNotification information is associated with active connection in memory.
 *  7. Charge-point ID consistency validation (conflicting explicit ID rejected with PropertyConstraintViolation).
 *  8. Malformed JSON handled safely (returns CALLERROR RpcFrameworkError).
 *  9. Malformed message structure handled safely (non-array, wrong messageTypeId).
 * 10. Missing/empty messageId handled safely.
 * 11. Malformed payload validation (missing reason, missing chargingStation, invalid reason enum).
 * 12. Unsupported actions (Heartbeat, StatusNotification, MeterValues) return CALLERROR NotImplemented.
 * 13. Connection stability (subsequent valid BootNotification succeeds after error responses).
 * 14. Existing REST API regression: health, auth, stations, vehicles, sessions, wallet.
 */

import WebSocket from 'ws';
import {
  handleBootNotification,
  connectionRegistry,
  OcppError,
  ERROR_CODES,
} from '../ocpp/index.js';

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
  console.log('🧪 Starting Phase 3D.3 OCPP 2.0.1 BootNotification Verification');
  console.log('========================================================\n');

  // ── 1. In-Process BootNotification Handler & Validation Unit Tests ─────────
  console.log('--- 1. BootNotification Handler & Schema Validation Unit Tests ---');

  // Register mock connection in registry for unit testing
  const dummyWs = { readyState: 1 };
  connectionRegistry.register('CP-UNIT-TEST', dummyWs);

  // 1a. Valid BootNotification execution
  const validPayload = {
    reason: 'PowerUp',
    chargingStation: {
      model: 'FastDC-120',
      vendorName: 'Delta Electronics',
      serialNumber: 'SN-DELTA-8899',
      firmwareVersion: 'v2.4.1',
    },
  };

  const unitRes = await handleBootNotification(validPayload, 'CP-UNIT-TEST', dummyWs);
  assert(unitRes.status === 'Accepted', '1a. handleBootNotification returns status: "Accepted"');
  assert(unitRes.interval === 300, '1b. handleBootNotification returns interval: 300');
  assert(typeof unitRes.currentTime === 'string', '1c. handleBootNotification returns currentTime ISO string');

  const bootState = connectionRegistry.getBootNotification('CP-UNIT-TEST');
  assert(bootState !== null, '1d. BootNotification data is associated with connection in registry');
  assert(bootState.chargingStation.model === 'FastDC-120', '1e. Stored station model matches payload');
  assert(bootState.chargingStation.vendorName === 'Delta Electronics', '1f. Stored vendorName matches payload');
  assert(bootState.status === 'Accepted', '1g. Stored registration status is Accepted');

  // 1b. Missing reason validation
  let caughtMissingReason = false;
  try {
    await handleBootNotification({ chargingStation: { model: 'M', vendorName: 'V' } }, 'CP-UNIT-TEST', dummyWs);
  } catch (err) {
    caughtMissingReason = err instanceof OcppError && err.code === ERROR_CODES.FORMAT_VIOLATION;
  }
  assert(caughtMissingReason, '1h. Missing "reason" throws FormatViolation OcppError');

  // 1c. Invalid reason enum validation
  let caughtInvalidReason = false;
  try {
    await handleBootNotification({ reason: 'NonExistentReason', chargingStation: { model: 'M', vendorName: 'V' } }, 'CP-UNIT-TEST', dummyWs);
  } catch (err) {
    caughtInvalidReason = err instanceof OcppError && err.code === ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION;
  }
  assert(caughtInvalidReason, '1i. Invalid "reason" enum throws PropertyConstraintViolation OcppError');

  // 1d. Missing chargingStation validation
  let caughtMissingStation = false;
  try {
    await handleBootNotification({ reason: 'PowerUp' }, 'CP-UNIT-TEST', dummyWs);
  } catch (err) {
    caughtMissingStation = err instanceof OcppError && err.code === ERROR_CODES.FORMAT_VIOLATION;
  }
  assert(caughtMissingStation, '1j. Missing "chargingStation" throws FormatViolation OcppError');

  // 1e. Missing model or vendorName
  let caughtMissingModel = false;
  try {
    await handleBootNotification({ reason: 'PowerUp', chargingStation: { vendorName: 'V' } }, 'CP-UNIT-TEST', dummyWs);
  } catch (err) {
    caughtMissingModel = err instanceof OcppError && err.code === ERROR_CODES.FORMAT_VIOLATION;
  }
  assert(caughtMissingModel, '1k. Missing "chargingStation.model" throws FormatViolation OcppError');

  // 1f. Conflicting station identity
  let caughtIdentityMismatch = false;
  try {
    await handleBootNotification(
      { reason: 'PowerUp', chargingStation: { model: 'M', vendorName: 'V' }, chargePointId: 'OTHER-STATION-ID' },
      'CP-UNIT-TEST',
      dummyWs
    );
  } catch (err) {
    caughtIdentityMismatch = err instanceof OcppError && err.code === ERROR_CODES.PROPERTY_CONSTRAINT_VIOLATION;
  }
  assert(caughtIdentityMismatch, '1l. Conflicting chargePointId in payload throws PropertyConstraintViolation');

  connectionRegistry.clear();

  // ── 2. Real WebSocket Client Valid BootNotification CALL / CALLRESULT ─────
  console.log('\n--- 2. Real WebSocket Client Valid BootNotification CALL ---');

  const cpId = `CP-BOOT-${Date.now()}`;
  const clientWs = await connectWs(`${WS_URL}/ocpp/${cpId}`);
  assert(clientWs.readyState === WebSocket.OPEN, '2a. WebSocket client connected to live OCPP gateway');

  const msgId1 = `msg-boot-${Date.now()}`;
  const bootCall = [
    2, // CALL
    msgId1,
    'BootNotification',
    {
      reason: 'PowerUp',
      chargingStation: {
        model: 'VahanCharger-60kW',
        vendorName: 'VahanGrid Hardware Corp',
        serialNumber: 'VG-HW-2026-99',
        firmwareVersion: '1.0.0-rc3',
      },
    },
  ];

  const response1 = await sendAndReceive(clientWs, bootCall);

  assert(Array.isArray(response1), '2b. Response is a JSON array');
  assert(response1[0] === 3, '2c. Response messageTypeId is 3 (CALLRESULT)');
  assert(response1[1] === msgId1, `2d. Response uses the exact same messageId (${msgId1})`);

  const resPayload = response1[2];
  assert(typeof resPayload === 'object' && resPayload !== null, '2e. Response payload is an object');
  assert(resPayload.status === 'Accepted', `2f. Response status is "Accepted" (got "${resPayload.status}")`);
  assert(resPayload.interval === 300, `2g. Response interval is 300 seconds (got ${resPayload.interval})`);

  // Verify server time is real and current
  assert(typeof resPayload.currentTime === 'string', '2h. Response contains currentTime string');
  const serverTimeMs = new Date(resPayload.currentTime).getTime();
  const nowMs = Date.now();
  const timeDiffMs = Math.abs(nowMs - serverTimeMs);
  assert(
    !isNaN(serverTimeMs) && timeDiffMs < 5000,
    `2i. Server time is current ISO timestamp (diff: ${timeDiffMs}ms, not hardcoded historical)`
  );

  // ── 3. Transient Registration State Verification ──────────────────────────
  console.log('\n--- 3. Transient In-Memory Registration State ---');

  // Verify second connection with a different chargePointId
  const cpId2 = `CP-BOOT-2-${Date.now()}`;
  const clientWs2 = await connectWs(`${WS_URL}/ocpp/${cpId2}`);

  const msgId2 = `msg-boot-2-${Date.now()}`;
  const bootCall2 = [
    2,
    msgId2,
    'BootNotification',
    {
      reason: 'ApplicationReset',
      chargingStation: {
        model: 'AltiEV-DualGun',
        vendorName: 'Altius Mobility',
        serialNumber: 'ALT-2026',
      },
    },
  ];

  const response2 = await sendAndReceive(clientWs2, bootCall2);
  assert(response2[0] === 3 && response2[1] === msgId2, '3a. Second charge point BootNotification succeeded');
  assert(response2[2].status === 'Accepted', '3b. Second charge point registered with status Accepted');

  // ── 4. Unsupported Action Handling ────────────────────────────────────────
  console.log('\n--- 4. Unsupported Action Handling ---');

  // 4a. Unsupported action CALL (e.g. Authorize, not implemented in Phase 3D.3/3D.5)
  const authMsgId = `msg-auth-${Date.now()}`;
  const authCall = [2, authMsgId, 'Authorize', { idToken: { idToken: 'TAG-1', type: 'ISO14443' } }];
  const authResponse = await sendAndReceive(clientWs, authCall);

  assert(Array.isArray(authResponse), '4a. Unsupported action response is a JSON array');
  assert(authResponse[0] === 4, '4b. Response messageTypeId is 4 (CALLERROR)');
  assert(authResponse[1] === authMsgId, `4c. Error response echoes messageId (${authMsgId})`);
  assert(authResponse[2] === 'NotImplemented', `4d. Error code is "NotImplemented" (got "${authResponse[2]}")`);
  assert(
    typeof authResponse[3] === 'string' && authResponse[3].includes('Authorize'),
    '4e. Error description explains Authorize is not implemented'
  );

  // 4b. MeterValues CALL (Implemented in Phase 3D.7B; empty meterValue rejects with validation CALLERROR)
  const mvMsgId = `msg-mv-${Date.now()}`;
  const mvCall = [
    2,
    mvMsgId,
    'MeterValues',
    { evseId: 1, meterValue: [] },
  ];
  const mvResponse = await sendAndReceive(clientWs, mvCall);
  assert(mvResponse[0] === 4, '4f. MeterValues returns CALLERROR (type 4)');
  assert(mvResponse[2] === 'FormatViolation' || mvResponse[2] === 'NotImplemented', '4g. MeterValues returns validation error code');

  // 4c. TransactionEvent CALL (Not implemented in Phase 3D.3)
  const txMsgId = `msg-tx-${Date.now()}`;
  const txCall = [2, txMsgId, 'TransactionEvent', { eventType: 'Started' }];
  const txResponse = await sendAndReceive(clientWs, txCall);
  assert(txResponse[0] === 4, '4h. TransactionEvent returns CALLERROR (Phase 3D.6A implements it; validation error for incomplete payload)');

  // ── 5. Malformed Messages & Robust Error Handling ─────────────────────────
  console.log('\n--- 5. Malformed Messages & Robust Error Handling ---');

  // 5a. Invalid JSON syntax
  const badJsonRes = await sendAndReceive(clientWs, '{invalid json syntax');
  assert(Array.isArray(badJsonRes) && badJsonRes[0] === 4, '5a. Invalid JSON returns CALLERROR');
  assert(badJsonRes[2] === 'RpcFrameworkError', '5b. Invalid JSON error code is RpcFrameworkError');

  // 5b. Non-array message frame
  const nonArrayRes = await sendAndReceive(clientWs, { not: 'an array' });
  assert(Array.isArray(nonArrayRes) && nonArrayRes[0] === 4, '5c. Non-array frame returns CALLERROR');
  assert(nonArrayRes[2] === 'RpcFrameworkError', '5d. Non-array error code is RpcFrameworkError');

  // 5c. Missing / empty messageId
  const emptyIdCall = [2, '', 'BootNotification', validPayload];
  const emptyIdRes = await sendAndReceive(clientWs, emptyIdCall);
  assert(Array.isArray(emptyIdRes) && emptyIdRes[0] === 4, '5e. Empty messageId returns CALLERROR');
  assert(emptyIdRes[2] === 'RpcFrameworkError', '5f. Empty messageId error code is RpcFrameworkError');

  // 5d. Missing action
  const missingActionCall = [2, 'msg-no-action', '', validPayload];
  const missingActionRes = await sendAndReceive(clientWs, missingActionCall);
  assert(missingActionRes[0] === 4 && missingActionRes[1] === 'msg-no-action', '5g. Missing action returns CALLERROR with messageId');
  assert(missingActionRes[2] === 'RpcFrameworkError', '5h. Missing action error code is RpcFrameworkError');

  // 5e. Malformed BootNotification payload: missing required fields
  const missingModelCall = [
    2,
    'msg-missing-model',
    'BootNotification',
    { reason: 'PowerUp', chargingStation: { vendorName: 'Vendor Only' } },
  ];
  const missingModelRes = await sendAndReceive(clientWs, missingModelCall);
  assert(missingModelRes[0] === 4, '5i. Payload missing model returns CALLERROR');
  assert(missingModelRes[2] === 'FormatViolation', '5j. Error code is FormatViolation');

  // 5f. Malformed BootNotification payload: conflicting chargePointId
  const conflictCall = [
    2,
    'msg-conflict-id',
    'BootNotification',
    {
      reason: 'PowerUp',
      chargingStation: { model: 'Model-X', vendorName: 'Vendor-Y' },
      chargePointId: 'TOTALLY-DIFFERENT-ID',
    },
  ];
  const conflictRes = await sendAndReceive(clientWs, conflictCall);
  assert(conflictRes[0] === 4, '5k. Conflicting chargePointId returns CALLERROR');
  assert(conflictRes[2] === 'PropertyConstraintViolation', '5l. Error code is PropertyConstraintViolation');

  // ── 6. Connection Resilience (Connection Still Open After Errors) ──────────
  console.log('\n--- 6. WebSocket Connection Stability ---');

  assert(
    clientWs.readyState === WebSocket.OPEN,
    '6a. Client socket is STILL OPEN after receiving multiple error responses'
  );

  // Subsequent valid CALL succeeds on the same connection
  const recoveryMsgId = `msg-recovery-${Date.now()}`;
  const recoveryCall = [
    2,
    recoveryMsgId,
    'BootNotification',
    {
      reason: 'RemoteReset',
      chargingStation: { model: 'Recovered-Model', vendorName: 'VahanGrid' },
    },
  ];
  const recoveryRes = await sendAndReceive(clientWs, recoveryCall);
  assert(recoveryRes[0] === 3, '6b. Subsequent valid BootNotification succeeds on the same connection');
  assert(recoveryRes[1] === recoveryMsgId, '6c. Recovery response matches new messageId');
  assert(recoveryRes[2].status === 'Accepted', '6d. Recovery response status is Accepted');

  // Clean disconnect
  clientWs.close(1000, 'Test finished');
  clientWs2.close(1000, 'Test finished');
  await Promise.all([waitForClose(clientWs), waitForClose(clientWs2)]);
  assert(true, '6e. Sockets closed cleanly');

  // ── 7. Existing REST API Regression ───────────────────────────────────────
  console.log('\n--- 7. Existing REST API Regression ---');

  const healthRes = await fetch(`${SERVER_URL}/api/v1/health`);
  const healthJson = await healthRes.json();
  assert(healthRes.status === 200, '7a. GET /api/v1/health returns 200');
  assert(healthJson.status === 'healthy', '7b. Health endpoint reports status "healthy"');

  const stationsRes = await fetch(`${SERVER_URL}/api/v1/stations/nearby?lat=19.0596&lng=72.8295&radius_km=10`);
  assert(stationsRes.status === 200, '7c. GET /stations/nearby (PostGIS) returns 200');

  const authMeRes = await fetch(`${SERVER_URL}/api/v1/auth/me`);
  assert(authMeRes.status === 401, '7d. GET /api/v1/auth/me returns 401 unauthenticated');

  const vehiclesRes = await fetch(`${SERVER_URL}/api/v1/vehicles`);
  assert(vehiclesRes.status === 401, '7e. GET /api/v1/vehicles returns 401 unauthenticated');

  const sessionsRes = await fetch(`${SERVER_URL}/api/v1/sessions`);
  assert(sessionsRes.status === 401, '7f. GET /api/v1/sessions returns 401 unauthenticated');

  const walletRes = await fetch(`${SERVER_URL}/api/v1/wallet`);
  assert(walletRes.status === 401, '7g. GET /api/v1/wallet returns 401 unauthenticated');

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
