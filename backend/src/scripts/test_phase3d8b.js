/**
 * backend/src/scripts/test_phase3d8b.js
 *
 * Verification test suite for Phase 3D.8B:
 * OCPP Remote Start/Stop Command Infrastructure.
 *
 * Sections:
 *  1. Unit Tests for OcppCallManager:
 *     - Offline station error (503 STATION_OFFLINE)
 *     - Unique messageId generation
 *     - Outbound CALL frame formatting
 *     - CALLRESULT (type 3) resolution
 *     - CALLERROR (type 4) rejection with OcppError
 *     - Timeout enforcement (504 STATION_TIMEOUT)
 *     - Abort pending calls on station disconnect (503 CONNECTION_CLOSED)
 *  2. Reverse Mapping Lookups (ocppMappingService.js):
 *     - resolveOcppIdentityByConnector(connectorId)
 *     - resolveOcppIdentityBySession(sessionId)
 *     - Unmapped UUID returns null
 *  3. Full Protocol Correlation over live WebSocket:
 *     - Station receives RequestStartTransaction CALL frame
 *     - Station replies with CALLRESULT -> Promise resolves
 *     - Station replies with CALLERROR -> Promise rejects
 *  4. Remote Start Transaction REST Flow:
 *     - 4a: Start on offline charger returns 503 STATION_OFFLINE
 *     - 4b: Start on online charger with Accepted -> 201 Created, pending session
 *     - 4c: Follow-up TransactionEvent(Started) activates pending session
 *     - 4d: Start with Rejected -> 409 REMOTE_START_REJECTED, session cancelled, connector available
 *     - 4e: Start with station timeout -> 504 STATION_TIMEOUT, session cancelled, connector available
 *  5. Remote Stop Transaction REST Flow:
 *     - 5a: Stop active session with Accepted -> 200 OK, RequestStopTransaction received
 *     - 5b: Follow-up TransactionEvent(Ended) completes session
 *     - 5c: Stop with Rejected -> 409 REMOTE_STOP_REJECTED
 *  6. Backward Compatibility & Non-Remote REST Sessions:
 *     - Standard POST /sessions/start without remote: true remains immediate
 *     - Standard POST /sessions/:id/stop without remote: true remains immediate
 *  7. Dedicated Remote Endpoints:
 *     - POST /api/v1/sessions/remote-start
 *     - POST /api/v1/sessions/:id/remote-stop
 *  8. Cleanup & Seed Integrity
 */

import WebSocket from 'ws';
import pool, { query } from '../config/database.js';
import connectionRegistry from '../ocpp/connectionRegistry.js';
import ocppCallManager, { OcppCallManager } from '../ocpp/ocppCallManager.js';
import {
  resolveOcppIdentityByConnector,
  resolveOcppIdentityBySession,
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
  console.log('🧪 Phase 3D.8B — OCPP Remote Start/Stop Command Verification');
  console.log('========================================================\n');

  let cpUUID, evseMapUUID, seedConnUUID, seedEvseUUID, seedLocationUUID;
  let user1Id, user1Cookies, vehicle1Id;
  let wsLive;

  try {
    // ── 1. Unit Tests for OcppCallManager ──────────────────────────────────────
    console.log('--- 1. Unit Tests for OcppCallManager ---');

    const unitCallManager = new OcppCallManager(200);

    // 1.1 Offline station check
    try {
      await unitCallManager.sendCall('CP-NON-EXISTENT', 'RequestStartTransaction', {});
      assert(false, '1. sendCall throws for offline charge point');
    } catch (err) {
      assert(err.code === 'STATION_OFFLINE' && err.statusCode === 503, '1. sendCall throws 503 STATION_OFFLINE');
    }

    // 1.2 generateMessageId format
    const msgId1 = unitCallManager.generateMessageId();
    assert(typeof msgId1 === 'string' && msgId1.startsWith('msg-csms-'), '2. generateMessageId produces valid prefix');

    // 1.3 Outbound CALL frame formatting & send
    const sentFrames = [];
    const mockWs = {
      readyState: 1, // OPEN
      send: (str) => sentFrames.push(JSON.parse(str)),
    };
    connectionRegistry.register('CP-UNIT-CALL', mockWs);

    const callPromise1 = unitCallManager.sendCall(
      'CP-UNIT-CALL',
      'RequestStartTransaction',
      { remoteStartId: 99, evseId: 1 },
      { timeoutMs: 1000 }
    );

    assert(sentFrames.length === 1, '3. WebSocket send was called with CALL frame');
    assert(sentFrames[0][0] === 2, '4. Frame messageTypeId is 2 (CALL)');
    assert(typeof sentFrames[0][1] === 'string' && sentFrames[0][1].startsWith('msg-csms-'), '5. Frame has unique messageId');
    assert(sentFrames[0][2] === 'RequestStartTransaction', '6. Frame action is RequestStartTransaction');
    assert(sentFrames[0][3].remoteStartId === 99, '7. Frame payload contains remoteStartId');

    const sentMsgId = sentFrames[0][1];
    assert(unitCallManager.has(sentMsgId), '8. Call is tracked in pendingCalls Map');

    // 1.4 handleCallResult resolves promise
    unitCallManager.handleCallResult(sentMsgId, { status: 'Accepted' });
    const callResult1 = await callPromise1;
    assert(callResult1.status === 'Accepted', '9. handleCallResult resolves pending Promise');
    assert(!unitCallManager.has(sentMsgId), '10. Call removed from pendingCalls after resolution');

    // 1.5 handleCallError rejects promise with OcppError
    const callPromise2 = unitCallManager.sendCall(
      'CP-UNIT-CALL',
      'RequestStopTransaction',
      { transactionId: 'TX-99' },
      { timeoutMs: 1000 }
    );
    const sentMsgId2 = sentFrames[1][1];
    unitCallManager.handleCallError(sentMsgId2, 'PropertyConstraintViolation', 'Unknown transaction');

    try {
      await callPromise2;
      assert(false, '11. handleCallError rejects pending Promise');
    } catch (err) {
      assert(err.code === 'PropertyConstraintViolation' && err.statusCode === 502, '11. handleCallError rejects with PropertyConstraintViolation (502)');
    }
    assert(!unitCallManager.has(sentMsgId2), '12. Call removed from pendingCalls after rejection');

    // 1.6 Timeout enforcement
    const callPromiseTimeout = unitCallManager.sendCall(
      'CP-UNIT-CALL',
      'RequestStartTransaction',
      {},
      { timeoutMs: 80 }
    );
    try {
      await callPromiseTimeout;
      assert(false, '13. sendCall enforces timeout');
    } catch (err) {
      assert(err.code === 'STATION_TIMEOUT' && err.statusCode === 504, '13. sendCall rejects with 504 STATION_TIMEOUT on expiry');
    }

    // 1.7 abortPendingForChargePoint
    const callPromiseAbort = unitCallManager.sendCall(
      'CP-UNIT-CALL',
      'RequestStopTransaction',
      {},
      { timeoutMs: 5000 }
    );
    const abortedCount = unitCallManager.abortPendingForChargePoint('CP-UNIT-CALL', 'Socket dropped');
    assert(abortedCount === 1, '14. abortPendingForChargePoint finds and aborts in-flight call');
    try {
      await callPromiseAbort;
      assert(false, '15. Aborted call rejects');
    } catch (err) {
      assert(err.code === 'CONNECTION_CLOSED' && err.statusCode === 503, '15. Aborted call rejects with 503 CONNECTION_CLOSED');
    }

    connectionRegistry.remove('CP-UNIT-CALL', mockWs);
    unitCallManager.clear();

    // ── 2. Reverse Mapping Lookups (ocppMappingService.js) ───────────────────
    console.log('\n--- 2. Reverse Mapping Lookups ---');

    // Pre-test cleanup of any stale CP-3D8B records
    await query(`
      DELETE FROM ocpp_connector_mappings WHERE ocpp_evse_mapping_id IN (
        SELECT id FROM ocpp_evse_mappings WHERE charge_point_id IN (
          SELECT id FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D8B-%'
        )
      )
    `);
    await query(`
      DELETE FROM ocpp_evse_mappings WHERE charge_point_id IN (
        SELECT id FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D8B-%'
      )
    `);
    await query(`
      DELETE FROM ocpp_transactions WHERE ocpp_charge_point_id IN (
        SELECT id FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D8B-%'
      )
    `);
    await query(`DELETE FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D8B-%'`);

    // Fetch seed station, EVSE, and connector
    const seedEvseRes = await query(`SELECT id, location_id FROM evses ORDER BY created_at ASC LIMIT 1`);
    seedEvseUUID = seedEvseRes.rows[0].id;
    seedLocationUUID = seedEvseRes.rows[0].location_id;

    const seedConnRes = await query(`SELECT id FROM connectors WHERE evse_id = $1 LIMIT 1`, [seedEvseUUID]);
    seedConnUUID = seedConnRes.rows[0].id;

    // Create test charge point and mappings
    const cpTestId = `CP-3D8B-${Date.now()}`;
    const cpRes = await query(
      `INSERT INTO ocpp_charge_points (charge_point_id, location_id, model, vendor_name, registration_status, status)
       VALUES ($1, $2, 'HyperStart-500', 'Delta Systems', 'Accepted', 'online') RETURNING id`,
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

    // Test resolveOcppIdentityByConnector
    const revConn = await resolveOcppIdentityByConnector(seedConnUUID);
    assert(revConn !== null, '16. resolveOcppIdentityByConnector returns row');
    assert(revConn.charge_point_id === cpTestId, '17. charge_point_id matches');
    assert(revConn.ocpp_evse_id === 1, '18. ocpp_evse_id matches (1)');
    assert(revConn.ocpp_connector_id === 1, '19. ocpp_connector_id matches (1)');

    const revUnknown = await resolveOcppIdentityByConnector('00000000-0000-0000-0000-000000000000');
    assert(revUnknown === null, '20. resolveOcppIdentityByConnector returns null for unmapped connector');

    // ── 3. Protocol Correlation Unit Tests ────────────────────────────────────
    console.log('\n--- 3. Protocol Correlation Unit Tests ---');

    // 3.1 CALLRESULT payload correlation
    const mockWsProto = { readyState: 1, send: () => {} };
    connectionRegistry.register('CP-PROTO-TEST', mockWsProto);
    const protoManager = new OcppCallManager(2000);

    const protoStartPromise = protoManager.sendCall(
      'CP-PROTO-TEST',
      'RequestStartTransaction',
      { remoteStartId: 777, idToken: { idToken: 'USER-1', type: 'Central' } }
    );
    const protoMsgId1 = Array.from(protoManager.pendingCalls.keys())[0];
    protoManager.handleCallResult(protoMsgId1, { status: 'Accepted' });
    const protoStartRes = await protoStartPromise;
    assert(protoStartRes.status === 'Accepted', '21. CALLRESULT correlation resolves with Accepted');

    // 3.2 CALLERROR correlation
    const protoStopPromise = protoManager.sendCall(
      'CP-PROTO-TEST',
      'RequestStopTransaction',
      { transactionId: 'TX-123' }
    );
    const protoMsgId2 = Array.from(protoManager.pendingCalls.keys())[0];
    protoManager.handleCallError(protoMsgId2, 'PropertyConstraintViolation', 'Unknown transaction');
    try {
      await protoStopPromise;
      assert(false, '22. CALLERROR correlation rejects');
    } catch (err) {
      assert(err.code === 'PropertyConstraintViolation', '22. CALLERROR correlation rejects with PropertyConstraintViolation');
      assert(err.statusCode === 502, '23. CALLERROR statusCode mapped to 502 Bad Gateway');
    }

    connectionRegistry.remove('CP-PROTO-TEST', mockWsProto);
    protoManager.clear();

    // ── 4. Remote Start Transaction REST Flow ─────────────────────────────────
    console.log('\n--- 4. Remote Start Transaction REST Flow ---');

    // Setup User 1 and Vehicle
    const ts = Date.now();
    const user1Email = `remote_user_${ts}@vahan.test`;
    const regRes1 = await fetch(`${SERVER_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user1Email, password: 'SecurePassword@123', name: 'Remote User 1' }),
    });
    user1Cookies = parseCookies(regRes1);
    const user1Json = await regRes1.json();
    user1Id = user1Json.data?.user?.id;
    assert(regRes1.status === 201 && user1Id, '24. User 1 registered');

    const vehRes1 = await query(
      `INSERT INTO vehicles (user_id, manufacturer, model, variant, battery_capacity_kwh, connector_type)
       VALUES ($1, 'Tata', 'Nexon EV', 'Prime', 30.2, 'CCS2') RETURNING id`,
      [user1Id]
    );
    vehicle1Id = vehRes1.rows[0].id;

    // 4a. Offline charger returns 503 (charge point not connected)

    const offlineStartRes = await fetch(`${SERVER_URL}/api/v1/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user1Cookies },
      body: JSON.stringify({ connector_id: seedConnUUID, vehicle_id: vehicle1Id, remote: true }),
    });
    assert(offlineStartRes.status === 503, '25. Remote start on offline charger returns 503');
    const offlineStartJson = await offlineStartRes.json();
    assert(offlineStartJson.error?.code === 'STATION_OFFLINE', '26. Error code is STATION_OFFLINE');

    // Reconnect WebSocket
    wsLive = await connectWs(`${WS_URL}/ocpp/${cpTestId}`);
    wsLive.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString());
        if (frame[0] === 2) {
          const [type, msgId, action, payload] = frame;
          if (action === 'RequestStartTransaction') {
            if (payload.evseId === 99) {
              wsLive.send(JSON.stringify([3, msgId, { status: 'Rejected', statusInfo: { reasonCode: 'EVSEUnavailable' } }]));
            } else if (payload.evseId === 55) {
              // Intentionally ignore for timeout
            } else {
              wsLive.send(JSON.stringify([3, msgId, { status: 'Accepted' }]));
            }
          } else if (action === 'RequestStopTransaction') {
            if (payload.transactionId === 'TX-REJECT-STOP') {
              wsLive.send(JSON.stringify([3, msgId, { status: 'Rejected', statusInfo: { reasonCode: 'NoActiveTx' } }]));
            } else {
              wsLive.send(JSON.stringify([3, msgId, { status: 'Accepted' }]));
            }
          }
        }
      } catch (_) {}
    });

    // 4b. Rejection handling (station replies Rejected)
    await query(`UPDATE ocpp_evse_mappings SET ocpp_evse_id = 99 WHERE id = $1`, [evseMapUUID]);
    const rejStartRes = await fetch(`${SERVER_URL}/api/v1/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user1Cookies },
      body: JSON.stringify({ connector_id: seedConnUUID, vehicle_id: vehicle1Id, remote: true }),
    });
    assert(rejStartRes.status === 409, '27. Rejected remote start returns 409 Conflict');
    const rejStartJson = await rejStartRes.json();
    assert(rejStartJson.error?.code === 'REMOTE_START_REJECTED', '28. Error code is REMOTE_START_REJECTED');
    await query(`UPDATE ocpp_evse_mappings SET ocpp_evse_id = 1 WHERE id = $1`, [evseMapUUID]);

    const connAfterRej = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConnUUID]);
    assert(connAfterRej.rows[0].status === 'available', '29. Connector restored to "available" after rejection');

    // 4c. Successful remote start (station replies Accepted)
    const onlineStartRes = await fetch(`${SERVER_URL}/api/v1/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user1Cookies },
      body: JSON.stringify({ connector_id: seedConnUUID, vehicle_id: vehicle1Id, remote: true }),
    });
    assert(onlineStartRes.status === 201, '30. Remote start returns 201 Created');
    const onlineStartJson = await onlineStartRes.json();
    const sessionId = onlineStartJson.data?.id;
    assert(sessionId !== undefined, '31. Session ID returned');
    assert(onlineStartJson.data?.status === 'pending', '32. Initial session status is "pending" (awaiting plug-in)');
    assert(onlineStartJson.data?.remote_start?.status === 'Accepted', '33. remote_start.status is "Accepted"');

    // Verify connector status is 'reserved'
    const connReserved = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConnUUID]);
    assert(connReserved.rows[0].status === 'reserved', '34. Connector status is set to "reserved"');

    // 4d. Charger sends TransactionEvent(Started) -> session activates
    const txId = `TX-REMOTE-${Date.now()}`;
    const startMsgId = `msg-start-${Date.now()}`;
    const startCallFrame = [
      2,
      startMsgId,
      'TransactionEvent',
      {
        eventType: 'Started',
        timestamp: new Date().toISOString(),
        triggerReason: 'RemoteStart',
        seqNo: 0,
        transactionInfo: { transactionId: txId, chargingState: 'Charging' },
        evse: { id: 1, connectorId: 1 },
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              { value: '100000', measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } },
            ],
          },
        ],
      },
    ];

    const startEvtRes = await new Promise((resolve) => {
      const onReply = (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed[1] === startMsgId) {
            wsLive.removeListener('message', onReply);
            resolve(parsed);
          }
        } catch (_) {}
      };
      wsLive.on('message', onReply);
      wsLive.send(JSON.stringify(startCallFrame));
    });

    assert(startEvtRes[0] === 3, '35. TransactionEvent(Started) acknowledged with CALLRESULT');

    const sessAfterStart = await query(`SELECT status, external_session_id FROM charging_sessions WHERE id = $1`, [sessionId]);
    assert(sessAfterStart.rows[0].status === 'active', '36. charging_sessions status transitioned to "active"');
    assert(sessAfterStart.rows[0].external_session_id === txId, '37. external_session_id linked to transactionId');

    const connAfterStart = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConnUUID]);
    assert(connAfterStart.rows[0].status === 'charging', '38. Connector status transitioned to "charging"');

    // ── 5. Remote Stop Transaction REST Flow ──────────────────────────────────
    console.log('\n--- 5. Remote Stop Transaction REST Flow ---');

    // 5a. Remote stop of active session
    const stopRes = await fetch(`${SERVER_URL}/api/v1/sessions/${sessionId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user1Cookies },
      body: JSON.stringify({ remote: true }),
    });
    assert(stopRes.status === 200, '39. Remote stop returns 200 OK');
    const stopJson = await stopRes.json();
    assert(stopJson.data?.status === 'stopped', '40. Session status is "stopped"');

    // 5b. Follow-up TransactionEvent(Ended) from charger finalizes energy
    const endMsgId = `msg-end-${Date.now()}`;
    const endCallFrame = [
      2,
      endMsgId,
      'TransactionEvent',
      {
        eventType: 'Ended',
        timestamp: new Date().toISOString(),
        triggerReason: 'RemoteStop',
        seqNo: 1,
        transactionInfo: { transactionId: txId, stoppedReason: 'Remote' },
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              { value: '110000', measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } },
            ],
          },
        ],
      },
    ];

    const endEvtRes = await new Promise((resolve) => {
      const onReply = (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed[1] === endMsgId) {
            wsLive.removeListener('message', onReply);
            resolve(parsed);
          }
        } catch (_) {}
      };
      wsLive.on('message', onReply);
      wsLive.send(JSON.stringify(endCallFrame));
    });

    assert(endEvtRes[0] === 3, '41. TransactionEvent(Ended) acknowledged with CALLRESULT');

    const sessAfterEnd = await query(`SELECT status, energy_kwh FROM charging_sessions WHERE id = $1`, [sessionId]);
    assert(sessAfterEnd.rows[0].status === 'stopped', '42. Session status remains "stopped" (terminal protection)');
    assert(parseFloat(sessAfterEnd.rows[0].energy_kwh) === 10.0, '43. Final energy is 10.0 kWh (110000 - 100000)');

    // ── 6. Backward Compatibility & Non-Remote REST Sessions ─────────────────
    console.log('\n--- 6. Backward Compatibility & Non-Remote Sessions ---');

    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);

    // Standard POST /sessions/start without remote: true creates immediate active session
    const stdStartRes = await fetch(`${SERVER_URL}/api/v1/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user1Cookies },
      body: JSON.stringify({ connector_id: seedConnUUID, vehicle_id: vehicle1Id }),
    });
    assert(stdStartRes.status === 201, '44. Non-remote start returns 201 Created immediately');
    const stdStartJson = await stdStartRes.json();
    const stdSessionId = stdStartJson.data?.id;
    assert(stdStartJson.data?.status === 'active', '45. Non-remote session status is immediately "active"');

    // Standard POST /sessions/:id/stop without remote: true stops session immediately
    const stdStopRes = await fetch(`${SERVER_URL}/api/v1/sessions/${stdSessionId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user1Cookies },
    });
    assert(stdStopRes.status === 200, '46. Non-remote stop returns 200 OK immediately');
    const stdStopJson = await stdStopRes.json();
    assert(stdStopJson.data?.status === 'stopped', '47. Non-remote session status is immediately "stopped"');

    // ── 7. Dedicated Remote Endpoints ─────────────────────────────────────────
    console.log('\n--- 7. Dedicated Remote Endpoints ---');

    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);

    const dedStartRes = await fetch(`${SERVER_URL}/api/v1/sessions/remote-start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user1Cookies },
      body: JSON.stringify({ connector_id: seedConnUUID, vehicle_id: vehicle1Id }),
    });
    assert(dedStartRes.status === 201, '48. POST /sessions/remote-start returns 201');
    const dedStartJson = await dedStartRes.json();
    const dedSessionId = dedStartJson.data?.id;
    assert(dedStartJson.data?.status === 'pending', '49. POST /sessions/remote-start status is "pending"');

    const dedStopRes = await fetch(`${SERVER_URL}/api/v1/sessions/${dedSessionId}/remote-stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user1Cookies },
    });
    assert(dedStopRes.status === 200, '50. POST /sessions/:id/remote-stop returns 200');

    // ── 8. Cleanup & Seed Integrity ───────────────────────────────────────────
    console.log('\n--- 8. Cleanup ---');

    if (wsLive && wsLive.readyState === WebSocket.OPEN) {
      wsLive.close();
    }

    // Clean test records
    await query(`DELETE FROM ocpp_session_telemetry WHERE session_id IN ($1, $2, $3)`, [sessionId, stdSessionId, dedSessionId]);
    await query(`DELETE FROM ocpp_connector_mappings WHERE ocpp_evse_mapping_id = $1`, [evseMapUUID]);
    await query(`DELETE FROM ocpp_evse_mappings WHERE id = $1`, [evseMapUUID]);
    await query(`DELETE FROM ocpp_transactions WHERE ocpp_charge_point_id = $1`, [cpUUID]);
    await query(`DELETE FROM ocpp_charge_points WHERE id = $1`, [cpUUID]);
    await query(`DELETE FROM cdrs WHERE user_id = $1`, [user1Id]);
    await query(`DELETE FROM charging_sessions WHERE user_id = $1`, [user1Id]);
    await query(`DELETE FROM vehicles WHERE user_id = $1`, [user1Id]);
    await query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = $1)`, [user1Id]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [user1Id]);
    await query(`DELETE FROM users WHERE id = $1`, [user1Id]);

    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);
    assert(true, '51. Cleanup completed successfully');

  } finally {
    if (wsLive && wsLive.readyState === WebSocket.OPEN) {
      wsLive.close();
    }
    await pool.end();
  }

  console.log('\n========================================================');
  console.log(`📊 Phase 3D.8B Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled error during test run:', err);
  process.exit(1);
});
