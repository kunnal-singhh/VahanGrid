/**
 * backend/src/scripts/test_phase3d9.js
 *
 * Verification test suite for Phase 3D.9:
 * OCPP Remote Operations: Reset, UnlockConnector & TriggerMessage.
 */

import WebSocket from 'ws';
import pool, { query } from '../config/database.js';
import connectionRegistry from '../ocpp/connectionRegistry.js';
import ocppCallManager from '../ocpp/ocppCallManager.js';
import {
  resolveOcppIdentityByConnector,
  resolveOcppIdentityByEvse,
  resolveChargePointsByLocation,
} from '../services/ocppMappingService.js';

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3001';
const WS_URL = process.env.TEST_WS_URL || 'ws://localhost:3001';

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

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      reject(new Error(`WS connection timeout: ${url}`));
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

function parseCookies(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return '';
  return setCookie.split(',').map((c) => c.split(';')[0].trim()).join('; ');
}

async function runTests() {
  console.log('========================================================');
  console.log('🧪 Phase 3D.9 — OCPP Remote Operations (Reset, Unlock, Trigger)');
  console.log('========================================================\n');

  let cpUUID, evseMapUUID, seedConnUUID, seedEvseUUID, seedLocationUUID;
  let cp2UUID;
  let testUserCookies;
  let wsLive;

  try {
    // ── 0. Setup Test Data ──────────────────────────────────────────────────
    console.log('--- 0. Test Setup & Clean Initial State ---');

    // Clean up any stale test records from previous runs
    await query(`
      DELETE FROM ocpp_connector_mappings WHERE connector_id IN (
        SELECT id FROM connectors WHERE connector_id LIKE 'TEST-3D9-%'
      )
    `);
    await query(`DELETE FROM connectors WHERE connector_id LIKE 'TEST-3D9-%'`);
    await query(`
      DELETE FROM ocpp_connector_mappings WHERE ocpp_evse_mapping_id IN (
        SELECT id FROM ocpp_evse_mappings WHERE charge_point_id IN (
          SELECT id FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D9-%'
        )
      )
    `);
    await query(`
      DELETE FROM ocpp_evse_mappings WHERE charge_point_id IN (
        SELECT id FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D9-%'
      )
    `);
    await query(`DELETE FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D9-%'`);

    // Fetch seed station, EVSE, and connector
    const seedEvseRes = await query(`SELECT id, location_id FROM evses ORDER BY created_at ASC LIMIT 1`);
    seedEvseUUID = seedEvseRes.rows[0].id;
    seedLocationUUID = seedEvseRes.rows[0].location_id;

    const seedConnRes = await query(`SELECT id FROM connectors WHERE evse_id = $1 LIMIT 1`, [seedEvseUUID]);
    seedConnUUID = seedConnRes.rows[0].id;

    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);

    // Create test charge point and mappings
    const cpTestId = `CP-3D9-${Date.now()}`;
    const cpRes = await query(
      `INSERT INTO ocpp_charge_points (charge_point_id, location_id, model, vendor_name, registration_status, status)
       VALUES ($1, $2, 'HyperRemote-400', 'Delta Systems', 'Accepted', 'online') RETURNING id`,
      [cpTestId, seedLocationUUID]
    );
    cpUUID = cpRes.rows[0].id;

    const evseMapRes = await query(
      `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id)
       VALUES ($1, 1, $2) RETURNING id`,
      [cpUUID, seedEvseUUID]
    );
    evseMapUUID = evseMapRes.rows[0].id;

    await query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ($1, 1, $2)`,
      [evseMapUUID, seedConnUUID]
    );

    // Register operator/test user
    const ts = Date.now();
    const userEmail = `remote_ops_${ts}@vahan.test`;
    const regRes = await fetch(`${SERVER_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, password: 'SecurePassword@123', name: 'Remote Ops Tester' }),
    });
    testUserCookies = parseCookies(regRes);
    assert(regRes.status === 201 && testUserCookies, '0. Operator/test user registered with JWT cookie');

    // ── 1. Authentication & Common REST Validation ──────────────────────────
    console.log('\n--- 1. Authentication & Common REST Validation ---');

    // 1.1 Auth enforcement
    const resetNoAuth = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Immediate' }),
    });
    assert(resetNoAuth.status === 401, '1. POST /reset without auth returns 401');

    const unlockNoAuth = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/unlock-connector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connector_id: seedConnUUID }),
    });
    assert(unlockNoAuth.status === 401, '2. POST /unlock-connector without auth returns 401');

    const trigNoAuth = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/trigger-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedMessage: 'Heartbeat' }),
    });
    assert(trigNoAuth.status === 401, '3. POST /trigger-message without auth returns 401');

    // 1.2 Invalid station UUID format
    const badIdReset = await fetch(`${SERVER_URL}/api/v1/stations/not-a-valid-uuid/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ type: 'Immediate' }),
    });
    assert(badIdReset.status === 400, '4. POST /reset with invalid station ID returns 400 INVALID_ID');

    // 1.3 Non-existent station UUID
    const nonExistReset = await fetch(`${SERVER_URL}/api/v1/stations/00000000-0000-0000-0000-000000000000/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ type: 'Immediate' }),
    });
    assert(nonExistReset.status === 404, '5. POST /reset with non-existent station ID returns 404 STATION_NOT_FOUND');

    // ── 2. Reset Operation Validation & Control Flow ─────────────────────────
    console.log('\n--- 2. Reset Operation Validation & Control Flow ---');

    // 2.1 Invalid reset type
    const badTypeReset = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ type: 'Reboot' }),
    });
    assert(badTypeReset.status === 400, '6. Invalid reset type returns 400 INVALID_RESET_TYPE');

    // 2.2 Malformed evse_id
    const badEvseReset = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ evse_id: 'bad-uuid' }),
    });
    assert(badEvseReset.status === 400, '7. Malformed evse_id returns 400 INVALID_EVSE_ID');

    // 2.3 Non-existent evse_id
    const nonExistEvseReset = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ evse_id: '00000000-0000-0000-0000-000000000000' }),
    });
    assert(nonExistEvseReset.status === 404, '8. Non-existent evse_id returns 404 EVSE_NOT_FOUND');

    // 2.4 Offline station check
    const offlineReset = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ type: 'Immediate' }),
    });
    assert(offlineReset.status === 503, '9. Reset on offline station returns 503 STATION_OFFLINE');

    // Connect mock live WebSocket client
    const receivedFrames = [];
    wsLive = await connectWs(`${WS_URL}/ocpp/${cpTestId}`);
    wsLive.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString());
        if (frame[0] === 2) {
          const [type, msgId, action, payload] = frame;
          receivedFrames.push({ msgId, action, payload });

          // Reset handler
          if (action === 'Reset') {
            if (payload.evseId === 99) {
              wsLive.send(JSON.stringify([3, msgId, { status: 'Rejected', statusInfo: { reasonCode: 'Busy' } }]));
            } else if (payload.evseId === 88) {
              // Ignore for timeout
            } else if (payload.type === 'OnIdle') {
              wsLive.send(JSON.stringify([3, msgId, { status: 'Scheduled' }]));
            } else {
              wsLive.send(JSON.stringify([3, msgId, { status: 'Accepted' }]));
            }
          }

          // UnlockConnector handler
          if (action === 'UnlockConnector') {
            if (payload.connectorId === 99) {
              wsLive.send(JSON.stringify([3, msgId, { status: 'OngoingAuthorizedTransaction' }]));
            } else if (payload.connectorId === 88) {
              wsLive.send(JSON.stringify([3, msgId, { status: 'UnlockFailed' }]));
            } else if (payload.connectorId === 77) {
              wsLive.send(JSON.stringify([3, msgId, { status: 'Rejected' }]));
            } else if (payload.connectorId === 66) {
              // Ignore for timeout
            } else {
              wsLive.send(JSON.stringify([3, msgId, { status: 'Unlocked' }]));
            }
          }

          // TriggerMessage handler
          if (action === 'TriggerMessage') {
            if (payload.requestedMessage === 'TransactionEvent' && payload.evse?.connectorId === 99) {
              wsLive.send(JSON.stringify([3, msgId, { status: 'Rejected', statusInfo: { reasonCode: 'NotReady' } }]));
            } else if (payload.requestedMessage === 'TransactionEvent' && payload.evse?.connectorId === 88) {
              wsLive.send(JSON.stringify([3, msgId, { status: 'NotImplemented' }]));
            } else if (payload.requestedMessage === 'TransactionEvent' && payload.evse?.connectorId === 66) {
              // Ignore for timeout
            } else {
              wsLive.send(JSON.stringify([3, msgId, { status: 'Accepted' }]));
            }
          }
        }
      } catch (e) {}
    });

    // 2.5 Station-level Immediate Reset Accepted
    const stationResetRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ type: 'Immediate' }),
    });
    assert(stationResetRes.status === 200, '10. Station-level Reset returns 200 OK');
    const stationResetJson = await stationResetRes.json();
    assert(stationResetJson.data?.type === 'Immediate', '11. Reset type is Immediate');
    assert(stationResetJson.data?.scope === 'station', '12. Scope is station');
    assert(stationResetJson.data?.result?.status === 'Accepted', '13. Result status is Accepted');

    const lastResetFrame = receivedFrames[receivedFrames.length - 1];
    assert(lastResetFrame?.action === 'Reset', '14. Station received Reset action frame');
    assert(lastResetFrame?.payload?.type === 'Immediate', '15. Frame payload type is Immediate');
    assert(lastResetFrame?.payload?.evseId === undefined, '16. Station-level frame omits evseId');

    // 2.6 EVSE-level Reset Accepted
    const evseResetRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ type: 'Immediate', evse_id: seedEvseUUID }),
    });
    assert(evseResetRes.status === 200, '17. EVSE-level Reset returns 200 OK');
    const evseResetJson = await evseResetRes.json();
    assert(evseResetJson.data?.scope === 'evse', '18. Scope is evse');
    assert(evseResetJson.data?.target?.ocpp_evse_id === 1, '19. Target ocpp_evse_id is 1');

    const lastEvseResetFrame = receivedFrames[receivedFrames.length - 1];
    assert(lastEvseResetFrame?.payload?.evseId === 1, '20. Frame payload contains evseId: 1');

    // 2.7 OnIdle Reset Scheduled
    const onIdleResetRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ type: 'OnIdle' }),
    });
    assert(onIdleResetRes.status === 200, '21. OnIdle Reset returns 200 OK');
    const onIdleResetJson = await onIdleResetRes.json();
    assert(onIdleResetJson.data?.result?.status === 'Scheduled', '22. OnIdle result status is Scheduled');

    // 2.8 State Authority Check for Reset: DB state is unmodified upon Accepted
    const dbConnAfterReset = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConnUUID]);
    assert(dbConnAfterReset.rows[0].status === 'available', '23. STATE AUTHORITY: connectors.status remains available after Reset Accepted');

    // 2.9 Reset Rejection returns 409
    const dummyEvseRes = await query(
      `INSERT INTO evses (location_id, evse_uid, evse_code, status, max_power_kw)
       VALUES ($1, 'TEST-EVSE-REJ', 'EVSE-REJ', 'available', 150) RETURNING id`,
      [seedLocationUUID]
    );
    const rejEvseUUID = dummyEvseRes.rows[0].id;
    await query(
      `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id)
       VALUES ($1, 99, $2)`,
      [cpUUID, rejEvseUUID]
    );

    const rejResetRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ evse_id: rejEvseUUID }),
    });
    assert(rejResetRes.status === 409, '24. Station rejection returns 409 RESET_REJECTED');

    // 2.10 Reset Timeout returns 504
    const timeoutEvseRes = await query(
      `INSERT INTO evses (location_id, evse_uid, evse_code, status, max_power_kw)
       VALUES ($1, 'TEST-EVSE-TIME', 'EVSE-TIME', 'available', 150) RETURNING id`,
      [seedLocationUUID]
    );
    const timeoutEvseUUID = timeoutEvseRes.rows[0].id;
    await query(
      `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id)
       VALUES ($1, 88, $2)`,
      [cpUUID, timeoutEvseUUID]
    );

    const timeoutResetRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ evse_id: timeoutEvseUUID }),
    });
    assert(timeoutResetRes.status === 504, '25. Station timeout returns 504 STATION_TIMEOUT');

    // ── 3. UnlockConnector Validation & Control Flow ─────────────────────────
    console.log('\n--- 3. UnlockConnector Validation & Control Flow ---');

    // 3.1 Missing connector_id
    const missingConnUnlock = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/unlock-connector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({}),
    });
    assert(missingConnUnlock.status === 400, '26. Missing connector_id returns 400 CONNECTOR_ID_REQUIRED');

    // 3.2 Malformed connector_id
    const badConnUnlock = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/unlock-connector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ connector_id: 'bad-uuid' }),
    });
    assert(badConnUnlock.status === 400, '27. Malformed connector_id returns 400 INVALID_CONNECTOR_ID');

    // 3.3 Non-existent connector_id
    const nonExistConnUnlock = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/unlock-connector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ connector_id: '00000000-0000-0000-0000-000000000000' }),
    });
    assert(nonExistConnUnlock.status === 404, '28. Non-existent connector_id returns 404 CONNECTOR_NOT_FOUND');

    // 3.4 Successful UnlockConnector returns 200 Unlocked
    const successUnlockRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/unlock-connector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ connector_id: seedConnUUID }),
    });
    assert(successUnlockRes.status === 200, '29. UnlockConnector returns 200 OK');
    const successUnlockJson = await successUnlockRes.json();
    assert(successUnlockJson.data?.scope === 'connector', '30. Scope is connector');
    assert(successUnlockJson.data?.result?.status === 'Unlocked', '31. Result status is Unlocked');

    const lastUnlockFrame = receivedFrames[receivedFrames.length - 1];
    assert(lastUnlockFrame?.action === 'UnlockConnector', '32. Station received UnlockConnector action frame');
    assert(lastUnlockFrame?.payload?.evseId === 1, '33. Frame payload evseId is 1');
    assert(lastUnlockFrame?.payload?.connectorId === 1, '34. Frame payload connectorId is 1');

    // 3.5 State Authority Check: connectors.status remains unmodified upon Unlocked
    const dbConnAfterUnlock = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConnUUID]);
    assert(dbConnAfterUnlock.rows[0].status === 'available', '35. STATE AUTHORITY: connectors.status remains available after Unlocked');

    // 3.6 Ongoing authorized transaction returns 409
    const dummyConn99 = await query(
      `INSERT INTO connectors (evse_id, connector_id, standard, format, power_type, max_power_kw, status)
       VALUES ($1, $2, 'CCS2', 'cable', 'DC', 150, 'charging') RETURNING id`,
      [seedEvseUUID, `TEST-3D9-REJ-${Date.now()}`]
    );
    const conn99UUID = dummyConn99.rows[0].id;
    await query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ($1, 99, $2)`,
      [evseMapUUID, conn99UUID]
    );

    const ongoingTxUnlock = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/unlock-connector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ connector_id: conn99UUID }),
    });
    assert(ongoingTxUnlock.status === 409, '36. Ongoing authorized transaction returns 409');
    const ongoingTxJson = await ongoingTxUnlock.json();
    assert(ongoingTxJson.error?.code === 'ONGOING_AUTHORIZED_TRANSACTION', '37. Error code is ONGOING_AUTHORIZED_TRANSACTION');

    // 3.7 UnlockFailed returns 409
    const dummyConn88 = await query(
      `INSERT INTO connectors (evse_id, connector_id, standard, format, power_type, max_power_kw, status)
       VALUES ($1, $2, 'CCS2', 'cable', 'DC', 150, 'available') RETURNING id`,
      [seedEvseUUID, `TEST-3D9-FAIL-${Date.now()}`]
    );
    const conn88UUID = dummyConn88.rows[0].id;
    await query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ($1, 88, $2)`,
      [evseMapUUID, conn88UUID]
    );

    const failUnlock = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/unlock-connector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ connector_id: conn88UUID }),
    });
    assert(failUnlock.status === 409, '38. UnlockFailed returns 409');
    const failUnlockJson = await failUnlock.json();
    assert(failUnlockJson.error?.code === 'UNLOCK_FAILED', '39. Error code is UNLOCK_FAILED');

    // 3.8 Station rejection returns 409 UNLOCK_REJECTED
    const dummyConn77 = await query(
      `INSERT INTO connectors (evse_id, connector_id, standard, format, power_type, max_power_kw, status)
       VALUES ($1, $2, 'CCS2', 'cable', 'DC', 150, 'available') RETURNING id`,
      [seedEvseUUID, `TEST-3D9-REJ77-${Date.now()}`]
    );
    const conn77UUID = dummyConn77.rows[0].id;
    await query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ($1, 77, $2)`,
      [evseMapUUID, conn77UUID]
    );

    const rejUnlock = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/unlock-connector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ connector_id: conn77UUID }),
    });
    assert(rejUnlock.status === 409, '40. Station rejection returns 409 UNLOCK_REJECTED');

    // 3.9 Station timeout returns 504 STATION_TIMEOUT
    const dummyConn66 = await query(
      `INSERT INTO connectors (evse_id, connector_id, standard, format, power_type, max_power_kw, status)
       VALUES ($1, $2, 'CCS2', 'cable', 'DC', 150, 'available') RETURNING id`,
      [seedEvseUUID, `TEST-3D9-TIME66-${Date.now()}`]
    );
    const conn66UUID = dummyConn66.rows[0].id;
    await query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ($1, 66, $2)`,
      [evseMapUUID, conn66UUID]
    );

    const timeoutUnlock = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/unlock-connector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ connector_id: conn66UUID }),
    });
    assert(timeoutUnlock.status === 504, '41. Station timeout returns 504 STATION_TIMEOUT');

    // ── 4. TriggerMessage Validation & Control Flow ──────────────────────────
    console.log('\n--- 4. TriggerMessage Validation & Control Flow ---');

    // 4.1 Missing requestedMessage
    const missingTrig = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/trigger-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({}),
    });
    assert(missingTrig.status === 400, '42. Missing requestedMessage returns 400 INVALID_REQUESTED_MESSAGE');

    // 4.2 Invalid requestedMessage
    const invalidTrig = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/trigger-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ requestedMessage: 'InvalidMessage' }),
    });
    assert(invalidTrig.status === 400, '43. Invalid requestedMessage returns 400 INVALID_REQUESTED_MESSAGE');

    // 4.3 Trigger Heartbeat (Station scope)
    const trigHeartbeatRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/trigger-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ requestedMessage: 'Heartbeat' }),
    });
    assert(trigHeartbeatRes.status === 200, '44. Trigger Heartbeat returns 200 OK');
    const trigHeartbeatJson = await trigHeartbeatRes.json();
    assert(trigHeartbeatJson.data?.requestedMessage === 'Heartbeat', '45. requestedMessage is Heartbeat');
    assert(trigHeartbeatJson.data?.scope === 'station', '46. Scope is station');
    assert(trigHeartbeatJson.data?.result?.status === 'Accepted', '47. Result status is Accepted');

    const lastTrigHbFrame = receivedFrames[receivedFrames.length - 1];
    assert(lastTrigHbFrame?.action === 'TriggerMessage', '48. Station received TriggerMessage frame');
    assert(lastTrigHbFrame?.payload?.requestedMessage === 'Heartbeat', '49. Frame requestedMessage is Heartbeat');
    assert(lastTrigHbFrame?.payload?.evse === undefined, '50. Station-level TriggerMessage omits evse field');

    // Follow-up: Simulated charger transmits the triggered Heartbeat frame
    const hbResponsePromise = new Promise((resolve) => {
      const handler = (data) => {
        try {
          const f = JSON.parse(data.toString());
          if (f[0] === 3) { // CALLRESULT for Heartbeat
            wsLive.off('message', handler);
            resolve(f);
          }
        } catch (e) {}
      };
      wsLive.on('message', handler);
    });

    wsLive.send(JSON.stringify([2, `msg-hb-${Date.now()}`, 'Heartbeat', {}]));
    const hbResultFrame = await hbResponsePromise;
    assert(hbResultFrame[2]?.currentTime !== undefined, '51. CSMS acknowledged triggered Heartbeat with currentTime');

    // 4.4 Trigger StatusNotification with connector scope
    const trigSnRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/trigger-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ requestedMessage: 'StatusNotification', connector_id: seedConnUUID }),
    });
    assert(trigSnRes.status === 200, '52. Trigger StatusNotification returns 200 OK');
    const trigSnJson = await trigSnRes.json();
    assert(trigSnJson.data?.scope === 'connector', '53. Scope is connector');
    assert(trigSnJson.data?.target?.ocpp_evse_id === 1, '54. Target ocpp_evse_id is 1');
    assert(trigSnJson.data?.target?.ocpp_connector_id === 1, '55. Target ocpp_connector_id is 1');

    const lastTrigSnFrame = receivedFrames[receivedFrames.length - 1];
    assert(lastTrigSnFrame?.payload?.evse?.id === 1, '56. Frame contains evse.id: 1');
    assert(lastTrigSnFrame?.payload?.evse?.connectorId === 1, '57. Frame contains evse.connectorId: 1');

    // 4.5 Trigger MeterValues with EVSE scope
    const trigMvRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/trigger-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ requestedMessage: 'MeterValues', evse_id: seedEvseUUID }),
    });
    assert(trigMvRes.status === 200, '58. Trigger MeterValues returns 200 OK');
    const trigMvJson = await trigMvRes.json();
    assert(trigMvJson.data?.scope === 'evse', '59. Scope is evse');
    assert(trigMvJson.data?.target?.ocpp_evse_id === 1, '60. Target ocpp_evse_id is 1');

    const lastTrigMvFrame = receivedFrames[receivedFrames.length - 1];
    assert(lastTrigMvFrame?.payload?.evse?.id === 1, '61. Frame contains evse.id: 1');
    assert(lastTrigMvFrame?.payload?.evse?.connectorId === undefined, '62. Frame omits evse.connectorId for EVSE scope');

    // 4.6 Trigger BootNotification
    const trigBootRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/trigger-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ requestedMessage: 'BootNotification' }),
    });
    assert(trigBootRes.status === 200, '63. Trigger BootNotification returns 200 OK');

    // 4.7 Trigger TransactionEvent with Rejection returns 409
    const rejTrigRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/trigger-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ requestedMessage: 'TransactionEvent', connector_id: conn99UUID }),
    });
    assert(rejTrigRes.status === 409, '64. Rejected trigger returns 409 TRIGGER_MESSAGE_REJECTED');

    // 4.8 Trigger TransactionEvent with NotImplemented returns 501
    const notImplTrigRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/trigger-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ requestedMessage: 'TransactionEvent', connector_id: conn88UUID }),
    });
    assert(notImplTrigRes.status === 501, '65. NotImplemented trigger returns 501 NOT_IMPLEMENTED');

    // 4.9 Trigger TransactionEvent with Timeout returns 504
    const timeoutTrigRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/trigger-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ requestedMessage: 'TransactionEvent', connector_id: conn66UUID }),
    });
    assert(timeoutTrigRes.status === 504, '66. Trigger timeout returns 504 STATION_TIMEOUT');

    // ── 5. Multi-Charge-Point Station Fan-Out ─────────────────────────────────
    console.log('\n--- 5. Multi-Charge-Point Station Fan-Out ---');

    // Add second charge point at same location
    const cp2TestId = `CP-3D9-2-${Date.now()}`;
    const cp2Res = await query(
      `INSERT INTO ocpp_charge_points (charge_point_id, location_id, model, vendor_name, registration_status, status)
       VALUES ($1, $2, 'HyperRemote-2', 'Delta Systems', 'Accepted', 'online') RETURNING id`,
      [cp2TestId, seedLocationUUID]
    );
    cp2UUID = cp2Res.rows[0].id;

    const wsLive2 = await connectWs(`${WS_URL}/ocpp/${cp2TestId}`);
    wsLive2.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString());
        if (frame[0] === 2) {
          wsLive2.send(JSON.stringify([3, frame[1], { status: 'Accepted' }]));
        }
      } catch (e) {}
    });

    // Multi-charger Reset
    const multiResetRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ type: 'Immediate' }),
    });
    assert(multiResetRes.status === 200, '67. Multi-charger Reset returns 200 OK');
    const multiResetJson = await multiResetRes.json();
    assert(multiResetJson.data?.results?.length === 2, '68. Multi-charger results array has 2 entries');

    // Multi-charger TriggerMessage
    const multiTrigRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/trigger-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ requestedMessage: 'Heartbeat' }),
    });
    assert(multiTrigRes.status === 200, '69. Multi-charger TriggerMessage returns 200 OK');
    const multiTrigJson = await multiTrigRes.json();
    assert(multiTrigJson.data?.results?.length === 2, '70. Multi-charger trigger results has 2 entries');

    wsLive2.close();

    // ── 6. Backward Compatibility & Regressions ───────────────────────────────
    console.log('\n--- 6. Backward Compatibility & Regressions ---');

    const getStationsRes = await fetch(`${SERVER_URL}/api/v1/stations`);
    assert(getStationsRes.status === 200, '71. GET /api/v1/stations returns 200');

    const getStationRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}`);
    assert(getStationRes.status === 200, '72. GET /api/v1/stations/:id returns 200');

    // ── 7. Cleanup & Teardown ─────────────────────────────────────────────────
    console.log('\n--- 7. Cleanup & Teardown ---');

    if (wsLive && wsLive.readyState === 1) {
      wsLive.close();
    }

    // FK order cleanup
    await query(`
      DELETE FROM ocpp_connector_mappings WHERE connector_id IN ($1, $2, $3, $4)
    `, [conn99UUID, conn88UUID, conn77UUID, conn66UUID]);

    await query(`
      DELETE FROM ocpp_connector_mappings WHERE ocpp_evse_mapping_id IN (
        SELECT id FROM ocpp_evse_mappings WHERE charge_point_id IN ($1, $2)
      )
    `, [cpUUID, cp2UUID]);

    await query(`
      DELETE FROM ocpp_evse_mappings WHERE charge_point_id IN ($1, $2)
    `, [cpUUID, cp2UUID]);

    await query(`DELETE FROM ocpp_charge_points WHERE id IN ($1, $2)`, [cpUUID, cp2UUID]);

    await query(`DELETE FROM connectors WHERE id IN ($1, $2, $3, $4)`, [
      conn99UUID,
      conn88UUID,
      conn77UUID,
      conn66UUID,
    ]);

    await query(`DELETE FROM evses WHERE id IN ($1, $2)`, [rejEvseUUID, timeoutEvseUUID]);

    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);

    assert(true, '73. Cleanup completed successfully');
  } catch (err) {
    console.error('Unhandled error during test run:', err);
    failed++;
  } finally {
    console.log('\n========================================================');
    console.log(`📊 Phase 3D.9 Results: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================\n');
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
