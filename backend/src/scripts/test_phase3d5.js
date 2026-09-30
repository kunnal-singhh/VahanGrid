/**
 * backend/src/scripts/test_phase3d5.js
 *
 * Automated verification test suite for Phase 3D.5:
 * Persistent OCPP Device State, Heartbeat & Live Status Synchronization.
 *
 * Tests:
 *   A. Migration 014 Verification (last_seen_at column, type, index)
 *   B. BootNotification Persistence:
 *      - New charge point registered with registration_status = 'Pending'
 *      - Hardware metadata (model, vendorName, serialNumber, firmwareVersion, bootReason)
 *      - last_boot_at, last_seen_at, status = 'online'
 *      - Existing charge point metadata update with registration_status preservation
 *      - Rejected status preservation
 *   C. Heartbeat Protocol:
 *      - Request [2, msgId, "Heartbeat", {}] -> [3, msgId, { currentTime }]
 *      - Known charge point: updates last_seen_at, status = 'online'
 *      - Connection registry tracking (updateHeartbeat, getLastHeartbeat)
 *      - Unknown/unregistered device handled gracefully without error
 *      - Malformed heartbeat rejection
 *   D. StatusNotification -> Database Synchronization:
 *      - Available   -> 'available'
 *      - Reserved    -> 'reserved'
 *      - Unavailable -> 'unavailable'
 *      - Faulted     -> 'faulted'
 *      - Occupied does NOT become 'charging' (retained in transient state only)
 *      - evseId = 0 charge-point-level update (ocpp_charge_points only, no connector propagation)
 *      - Unmapped EVSE/connector handled gracefully (returns CALLRESULT, socket remains open)
 *   E. REST API Live Verification (No Restart):
 *      - GET /api/v1/stations reflects updated connector status
 *      - GET /api/v1/stations/:id reflects updated connector status
 *   F. Regression:
 *      - Unsupported actions (TransactionEvent, MeterValues) return NotImplemented
 *      - Existing REST endpoints (health, auth, vehicles, sessions, wallet)
 *   G. Cleanup & Data Integrity
 */

import WebSocket from 'ws';
import { query } from '../config/database.js';
import connectionRegistry from '../ocpp/connectionRegistry.js';
import { resolveChargePoint, resolveConnectorMapping } from '../services/ocppMappingService.js';
import { handleStatusNotification } from '../ocpp/handlers/statusNotificationHandler.js';
import { handleHeartbeat } from '../ocpp/handlers/heartbeatHandler.js';

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

async function assertRejects(fn, message) {
  try {
    await fn();
    console.error(`  ❌ FAIL: ${message} (expected rejection but resolved)`);
    failed++;
  } catch (_) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  }
}

function connectWs(url, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    const timeout = setTimeout(() => {
      ws.terminate();
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

function sendAndReceive(ws, messageObj) {
  return new Promise((resolve, reject) => {
    const payload = typeof messageObj === 'string' ? messageObj : JSON.stringify(messageObj);
    const timer = setTimeout(() => {
      ws.removeListener('message', onMsg);
      reject(new Error(`Timeout waiting for WS response to: ${payload.slice(0, 80)}`));
    }, 3000);

    const onMsg = (data) => {
      ws.removeListener('message', onMsg);
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (_) {
        resolve(data.toString());
      }
    };

    ws.on('message', onMsg);
    ws.send(payload);
  });
}

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
  console.log('🧪 Phase 3D.5 — Persistent State, Heartbeat & Status Sync');
  console.log('========================================================\n');

  // Pre-test cleanup: ensure no stale test artifacts
  await query(`DELETE FROM ocpp_charge_points WHERE charge_point_id LIKE 'TEST-CP%' OR charge_point_id LIKE 'CP-3D5%'`);

  // ── A. Migration 014 Verification ─────────────────────────────────────────
  console.log('--- A. Migration 014 Verification ---');

  const colRes = await query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'ocpp_charge_points' AND column_name = 'last_seen_at'`
  );
  assert(colRes.rows.length === 1, '1. last_seen_at column exists on ocpp_charge_points');
  assert(
    colRes.rows[0].data_type === 'timestamp with time zone',
    '2. last_seen_at column type is timestamp with time zone'
  );

  const idxRes = await query(
    `SELECT indexname FROM pg_indexes
     WHERE tablename = 'ocpp_charge_points' AND indexname = 'idx_ocpp_charge_points_last_seen'`
  );
  assert(idxRes.rows.length === 1, '3. idx_ocpp_charge_points_last_seen index exists');

  // Verify other tables untouched
  const evseCols = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'evses' AND column_name = 'last_seen_at'`
  );
  assert(evseCols.rows.length === 0, '4. evses table has NOT been modified');
  const connCols = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'connectors' AND column_name = 'last_seen_at'`
  );
  assert(connCols.rows.length === 0, '5. connectors table has NOT been modified');

  // ── B. BootNotification Persistence ───────────────────────────────────────
  console.log('\n--- B. BootNotification Persistence ---');

  const cpNewId = `CP-3D5-NEW-${Date.now()}`;
  const wsBoot = await connectWs(`${WS_URL}/ocpp/${cpNewId}`);
  assert(wsBoot.readyState === WebSocket.OPEN, '6. WebSocket connected for new charge point');

  const bootMsgId1 = `msg-boot-1-${Date.now()}`;
  const bootPayload1 = {
    reason: 'PowerUp',
    chargingStation: {
      model: 'FastDC-120',
      vendorName: 'Delta Systems',
      serialNumber: 'SN-DELTA-001',
      firmwareVersion: 'v3.4.1',
    },
  };

  const bootRes1 = await sendAndReceive(wsBoot, [2, bootMsgId1, 'BootNotification', bootPayload1]);
  assert(bootRes1[0] === 3 && bootRes1[1] === bootMsgId1, '7. BootNotification returns CALLRESULT');
  assert(bootRes1[2].status === 'Accepted', '8. BootNotification response status is Accepted');
  assert(bootRes1[2].interval === 300, '9. BootNotification response interval is 300');
  assert(typeof bootRes1[2].currentTime === 'string', '10. BootNotification returns currentTime');

  // Verify database record created
  const dbCp1 = await resolveChargePoint(cpNewId);
  assert(dbCp1 !== null, '11. Charge point record created in ocpp_charge_points');
  assert(dbCp1.registration_status === 'Pending', '12. New charge point default registration_status is "Pending"');
  assert(dbCp1.model === 'FastDC-120', '13. model persisted accurately');
  assert(dbCp1.vendor_name === 'Delta Systems', '14. vendor_name persisted accurately');
  assert(dbCp1.serial_number === 'SN-DELTA-001', '15. serial_number persisted accurately');
  assert(dbCp1.firmware_version === 'v3.4.1', '16. firmware_version persisted accurately');
  assert(dbCp1.boot_reason === 'PowerUp', '17. boot_reason persisted accurately');
  assert(dbCp1.status === 'online', '18. status is marked "online"');
  assert(dbCp1.last_boot_at !== null, '19. last_boot_at timestamp populated');
  assert(dbCp1.last_seen_at !== null, '20. last_seen_at timestamp populated');

  // Test registration_status preservation: Promote to 'Accepted' in DB
  await query(`UPDATE ocpp_charge_points SET registration_status = 'Accepted' WHERE charge_point_id = $1`, [cpNewId]);

  // Send another BootNotification (firmware update)
  const bootMsgId2 = `msg-boot-2-${Date.now()}`;
  const bootPayload2 = {
    reason: 'FirmwareUpdate',
    chargingStation: {
      model: 'FastDC-120',
      vendorName: 'Delta Systems',
      serialNumber: 'SN-DELTA-001',
      firmwareVersion: 'v3.5.0',
    },
  };
  const bootRes2 = await sendAndReceive(wsBoot, [2, bootMsgId2, 'BootNotification', bootPayload2]);
  assert(bootRes2[0] === 3, '21. Second BootNotification returns CALLRESULT');

  const dbCpUpdated = await resolveChargePoint(cpNewId);
  assert(dbCpUpdated.registration_status === 'Accepted', '22. Existing "Accepted" registration_status preserved');
  assert(dbCpUpdated.firmware_version === 'v3.5.0', '23. firmware_version updated in DB');
  assert(dbCpUpdated.boot_reason === 'FirmwareUpdate', '24. boot_reason updated in DB');

  // Test Rejected status preservation
  const cpRejId = `CP-3D5-REJ-${Date.now()}`;
  await query(
    `INSERT INTO ocpp_charge_points (charge_point_id, registration_status, status)
     VALUES ($1, 'Rejected', 'offline')`,
    [cpRejId]
  );
  const wsRej = await connectWs(`${WS_URL}/ocpp/${cpRejId}`);
  await sendAndReceive(wsRej, [
    2,
    `msg-boot-rej-${Date.now()}`,
    'BootNotification',
    { reason: 'ApplicationReset', chargingStation: { model: 'RejModel', vendorName: 'RejVendor' } },
  ]);
  const dbCpRej = await resolveChargePoint(cpRejId);
  assert(dbCpRej.registration_status === 'Rejected', '25. Existing "Rejected" registration_status preserved');
  assert(dbCpRej.model === 'RejModel', '26. Model updated for existing rejected charge point');

  wsBoot.close(1000, 'Boot tests done');
  wsRej.close(1000, 'Rej tests done');
  await waitForClose(wsBoot);
  await waitForClose(wsRej);

  // ── C. Heartbeat Protocol ─────────────────────────────────────────────────
  console.log('\n--- C. Heartbeat Protocol ---');

  const wsHb = await connectWs(`${WS_URL}/ocpp/${cpNewId}`);

  // Record timestamp before Heartbeat
  const beforeHbTime = Date.now();
  const hbMsgId = `msg-hb-${Date.now()}`;

  const hbRes = await sendAndReceive(wsHb, [2, hbMsgId, 'Heartbeat', {}]);
  assert(Array.isArray(hbRes), '27. Heartbeat response is JSON array');
  assert(hbRes[0] === 3, '28. Heartbeat response messageTypeId is 3 (CALLRESULT)');
  assert(hbRes[1] === hbMsgId, '29. Heartbeat echoes messageId');
  assert(typeof hbRes[2] === 'object' && hbRes[2] !== null, '30. Heartbeat payload is an object');
  assert(typeof hbRes[2].currentTime === 'string', '31. Heartbeat payload has currentTime ISO string');

  const serverTimeMs = new Date(hbRes[2].currentTime).getTime();
  assert(!isNaN(serverTimeMs) && Math.abs(serverTimeMs - beforeHbTime) < 5000, '32. currentTime is accurate');

  // Verify DB state updated by Heartbeat
  const dbCpHb = await resolveChargePoint(cpNewId);
  assert(dbCpHb.last_seen_at !== null, '33. last_seen_at updated in DB by Heartbeat');
  assert(dbCpHb.status === 'online', '34. Charge point marked "online" in DB');

  // Verify connection registry state
  const dummyWs = { readyState: 1 };
  connectionRegistry.register('CP-UNIT-HB', dummyWs);
  await handleHeartbeat({}, 'CP-UNIT-HB', dummyWs);
  const lastHb = connectionRegistry.getLastHeartbeat('CP-UNIT-HB');
  assert(lastHb instanceof Date, '35. connectionRegistry tracks lastHeartbeatAt');

  // Unknown/unregistered device Heartbeat (must be handled gracefully)
  const cpUnregId = `CP-3D5-UNREG-${Date.now()}`;
  const wsUnreg = await connectWs(`${WS_URL}/ocpp/${cpUnregId}`);
  const unregHbRes = await sendAndReceive(wsUnreg, [2, `msg-unreg-${Date.now()}`, 'Heartbeat', {}]);
  assert(unregHbRes[0] === 3, '36. Unregistered charge point Heartbeat succeeds with CALLRESULT');
  assert(typeof unregHbRes[2].currentTime === 'string', '37. Unregistered device receives valid currentTime');
  assert(wsUnreg.readyState === WebSocket.OPEN, '38. Unregistered device socket remains OPEN');

  // Malformed Heartbeat: non-object payload
  const malformedHbRes = await sendAndReceive(wsHb, [2, `msg-bad-hb-${Date.now()}`, 'Heartbeat', 'string-payload']);
  assert(malformedHbRes[0] === 4, '39. Non-object Heartbeat payload returns CALLERROR (type 4)');
  assert(malformedHbRes[2] === 'FormatViolation', '40. Error code is FormatViolation');
  assert(wsHb.readyState === WebSocket.OPEN, '41. Socket remains OPEN after malformed Heartbeat');

  wsHb.close(1000, 'Hb tests done');
  wsUnreg.close(1000, 'Hb unreg done');
  await waitForClose(wsHb);
  await waitForClose(wsUnreg);

  // ── D. StatusNotification -> Database Synchronization ─────────────────────
  console.log('\n--- D. StatusNotification -> Database Synchronization ---');

  // Set up test mapping with seed EVSE and connector
  const seedEvse = await query(`SELECT id, location_id FROM evses ORDER BY created_at ASC LIMIT 1`);
  const seedEvseUUID = seedEvse.rows[0].id;
  const seedLocationUUID = seedEvse.rows[0].location_id;

  const seedConn = await query(
    `SELECT id, status FROM connectors WHERE evse_id = $1 ORDER BY connector_id ASC LIMIT 1`,
    [seedEvseUUID]
  );
  const seedConnUUID = seedConn.rows[0].id;

  const cpMappedId = `CP-3D5-MAPPED-${Date.now()}`;
  const cpIns = await query(
    `INSERT INTO ocpp_charge_points (charge_point_id, location_id, model, vendor_name, registration_status, status)
     VALUES ($1, $2, 'DeltaDC', 'Delta', 'Accepted', 'online') RETURNING id`,
    [cpMappedId, seedLocationUUID]
  );
  const cpMappedUUID = cpIns.rows[0].id;

  const evseIns = await query(
    `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id)
     VALUES ($1, 1, $2) RETURNING id`,
    [cpMappedUUID, seedEvseUUID]
  );
  const evseMappingUUID = evseIns.rows[0].id;

  const connIns = await query(
    `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
     VALUES ($1, 1, $2) RETURNING id`,
    [evseMappingUUID, seedConnUUID]
  );
  const connMappingUUID = connIns.rows[0].id;

  const wsSync = await connectWs(`${WS_URL}/ocpp/${cpMappedId}`);
  assert(wsSync.readyState === WebSocket.OPEN, '42. WebSocket connected for mapped charge point');

  // Helper to send StatusNotification and check DB
  async function testStatusSync(ocppStatus, expectedDbStatus, testNum, testDesc) {
    const msgId = `msg-sn-${ocppStatus}-${Date.now()}`;
    const res = await sendAndReceive(wsSync, [
      2,
      msgId,
      'StatusNotification',
      {
        timestamp: new Date().toISOString(),
        connectorStatus: ocppStatus,
        evseId: 1,
        connectorId: 1,
      },
    ]);
    assert(res[0] === 3 && Object.keys(res[2]).length === 0, `${testNum}a. StatusNotification "${ocppStatus}" returns CALLRESULT {}`);

    const dbRes = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConnUUID]);
    assert(dbRes.rows[0].status === expectedDbStatus, `${testNum}b. ${testDesc} (got "${dbRes.rows[0].status}")`);
  }

  // 1. Available -> available
  await testStatusSync('Available', 'available', '43', 'Available maps to "available" in DB');

  // 2. Reserved -> reserved
  await testStatusSync('Reserved', 'reserved', '44', 'Reserved maps to "reserved" in DB');

  // 3. Unavailable -> unavailable
  await testStatusSync('Unavailable', 'unavailable', '45', 'Unavailable maps to "unavailable" in DB');

  // 4. Faulted -> faulted
  await testStatusSync('Faulted', 'faulted', '46', 'Faulted maps to "faulted" in DB');

  // 5. Occupied does NOT map to charging
  // First set connector to 'available'
  await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);
  const resOccupied = await sendAndReceive(wsSync, [
    2,
    `msg-sn-occ-${Date.now()}`,
    'StatusNotification',
    {
      timestamp: new Date().toISOString(),
      connectorStatus: 'Occupied',
      evseId: 1,
      connectorId: 1,
    },
  ]);
  assert(resOccupied[0] === 3, '47. Occupied returns CALLRESULT {}');

  const dbConnAfterOcc = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConnUUID]);
  assert(
    dbConnAfterOcc.rows[0].status === 'available',
    `48. CRITICAL: Occupied does NOT change DB connector status to "charging" (remains "available")`
  );

  // But in-memory transient registry DOES reflect Occupied
  connectionRegistry.register('CP-UNIT-OCC', dummyWs);
  await handleStatusNotification(
    { timestamp: new Date().toISOString(), connectorStatus: 'Occupied', evseId: 1, connectorId: 1 },
    'CP-UNIT-OCC',
    dummyWs
  );
  const transientOcc = connectionRegistry.getStatusNotification('CP-UNIT-OCC', 1, 1);
  assert(transientOcc !== null && transientOcc.connectorStatus === 'Occupied', '49. Occupied is correctly reflected in transient connectionRegistry');

  // 6. evseId = 0 charge-point-level behavior
  const resCpFault = await sendAndReceive(wsSync, [
    2,
    `msg-sn-cp0-${Date.now()}`,
    'StatusNotification',
    {
      timestamp: new Date().toISOString(),
      connectorStatus: 'Faulted',
      evseId: 0,
      connectorId: 0,
    },
  ]);
  assert(resCpFault[0] === 3, '50. evseId = 0 StatusNotification returns CALLRESULT');

  const dbCpAfter0 = await resolveChargePoint(cpMappedId);
  assert(dbCpAfter0.status === 'maintenance', '51. evseId = 0 updates ocpp_charge_points.status to "maintenance"');

  // Verify connectors table NOT modified by evseId = 0
  const dbConnAfter0 = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConnUUID]);
  assert(dbConnAfter0.rows[0].status === 'available', '52. evseId = 0 does NOT propagate to connectors table');

  // Restore evseId = 0 to Available -> online
  await sendAndReceive(wsSync, [
    2,
    `msg-sn-cp0-avail-${Date.now()}`,
    'StatusNotification',
    {
      timestamp: new Date().toISOString(),
      connectorStatus: 'Available',
      evseId: 0,
      connectorId: 0,
    },
  ]);
  const dbCpRestored = await resolveChargePoint(cpMappedId);
  assert(dbCpRestored.status === 'online', '53. evseId = 0 "Available" restores ocpp_charge_points.status to "online"');

  // 7. Unmapped EVSE/connector identity
  const resUnmapped = await sendAndReceive(wsSync, [
    2,
    `msg-sn-unmapped-${Date.now()}`,
    'StatusNotification',
    {
      timestamp: new Date().toISOString(),
      connectorStatus: 'Faulted',
      evseId: 99,
      connectorId: 99,
    },
  ]);
  assert(resUnmapped[0] === 3, '54. Unmapped connector returns normal CALLRESULT {}');
  assert(wsSync.readyState === WebSocket.OPEN, '55. WebSocket connection never crashes on unmapped connector');

  // ── E. REST API Live Verification (No Restart) ────────────────────────────
  console.log('\n--- E. REST API Live Verification (No Restart) ---');

  // Set connector to 'faulted' via OCPP
  await sendAndReceive(wsSync, [
    2,
    `msg-sn-rest-1-${Date.now()}`,
    'StatusNotification',
    {
      timestamp: new Date().toISOString(),
      connectorStatus: 'Faulted',
      evseId: 1,
      connectorId: 1,
    },
  ]);

  // Fetch GET /api/v1/stations
  const stationsRes = await fetch(`${SERVER_URL}/api/v1/stations`);
  assert(stationsRes.status === 200, '56. GET /api/v1/stations returns 200');
  const stationsJson = await stationsRes.json();
  const targetStation = stationsJson.data.find((s) => s.id === seedLocationUUID);
  assert(targetStation !== undefined, '57. Target station found in /stations list');

  const targetEvse = targetStation.evses.find((e) => e.id === seedEvseUUID);
  assert(targetEvse !== undefined, '58. Target EVSE found in station');
  const targetConn = targetEvse.connectors.find((c) => c.id === seedConnUUID);
  assert(targetConn !== undefined, '59. Target connector found in EVSE');
  assert(targetConn.status === 'faulted', '60. GET /api/v1/stations immediately reflects "faulted" status');

  // Fetch GET /api/v1/stations/:id
  const stationDetailRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}`);
  assert(stationDetailRes.status === 200, '61. GET /api/v1/stations/:id returns 200');
  const stationDetailJson = await stationDetailRes.json();
  const detailEvse = stationDetailJson.data.evses.find((e) => e.id === seedEvseUUID);
  const detailConn = detailEvse.connectors.find((c) => c.id === seedConnUUID);
  assert(detailConn.status === 'faulted', '62. GET /api/v1/stations/:id immediately reflects "faulted" status');

  // Switch back to Available via OCPP
  await sendAndReceive(wsSync, [
    2,
    `msg-sn-rest-2-${Date.now()}`,
    'StatusNotification',
    {
      timestamp: new Date().toISOString(),
      connectorStatus: 'Available',
      evseId: 1,
      connectorId: 1,
    },
  ]);

  const stationDetailRes2 = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}`);
  const stationDetailJson2 = await stationDetailRes2.json();
  const detailConn2 = stationDetailJson2.data.evses.find((e) => e.id === seedEvseUUID).connectors.find((c) => c.id === seedConnUUID);
  assert(detailConn2.status === 'available', '63. GET /api/v1/stations/:id immediately reflects restored "available" status');

  wsSync.close(1000, 'Sync tests done');
  await waitForClose(wsSync);

  // ── F. Regression: Unsupported Actions & REST Endpoints ────────────────────
  console.log('\n--- F. Regression: Unsupported Actions & REST Endpoints ---');

  const wsReg = await connectWs(`${WS_URL}/ocpp/${cpNewId}`);

  // TransactionEvent is now implemented in Phase 3D.6A — sends an incomplete payload that should
  // return a CALLERROR (validation error, NOT NotImplemented).
  const txRes = await sendAndReceive(wsReg, [2, `msg-tx-${Date.now()}`, 'TransactionEvent', { eventType: 'Started' }]);
  assert(txRes[0] === 4, '64. TransactionEvent returns CALLERROR (implemented in Phase 3D.6A, validation rejects incomplete payload)');

  // MeterValues is implemented in Phase 3D.7B — sends incomplete payload that returns CALLERROR (validation error)
  const mvRes = await sendAndReceive(wsReg, [2, `msg-mv-${Date.now()}`, 'MeterValues', { evseId: 1 }]);
  assert(mvRes[0] === 4, '65. MeterValues returns CALLERROR (implemented in Phase 3D.7B, validation rejects incomplete payload)');

  // Authorize remains NotImplemented in Phase 3D.5
  const authOcppRes = await sendAndReceive(wsReg, [2, `msg-auth-${Date.now()}`, 'Authorize', { idToken: { idToken: 'TAG-123', type: 'ISO14443' } }]);
  assert(authOcppRes[0] === 4 && authOcppRes[2] === 'NotImplemented', '66. Authorize returns NotImplemented CALLERROR');

  wsReg.close(1000, 'Reg done');
  await waitForClose(wsReg);

  // REST API regression
  const healthRes = await fetch(`${SERVER_URL}/api/v1/health`);
  assert(healthRes.status === 200, '67. GET /api/v1/health returns 200');

  const nearbyRes = await fetch(`${SERVER_URL}/api/v1/stations/nearby?lat=19.0596&lng=72.8295&radius_km=10`);
  assert(nearbyRes.status === 200, '68. GET /api/v1/stations/nearby returns 200');

  const authMeRes = await fetch(`${SERVER_URL}/api/v1/auth/me`);
  assert(authMeRes.status === 401, '69. GET /api/v1/auth/me returns 401');

  const vehiclesRes = await fetch(`${SERVER_URL}/api/v1/vehicles`);
  assert(vehiclesRes.status === 401, '70. GET /api/v1/vehicles returns 401');

  const sessionsRes = await fetch(`${SERVER_URL}/api/v1/sessions`);
  assert(sessionsRes.status === 401, '71. GET /api/v1/sessions returns 401');

  const walletRes = await fetch(`${SERVER_URL}/api/v1/wallet`);
  assert(walletRes.status === 401, '72. GET /api/v1/wallet returns 401');

  // ── G. Cleanup & Integrity ────────────────────────────────────────────────
  console.log('\n--- G. Cleanup & Data Integrity ---');

  // Reset seed connector status to original
  await query(`UPDATE connectors SET status = $1 WHERE id = $2`, [seedConn.rows[0].status, seedConnUUID]);

  // Delete test mappings & charge points
  await query(`DELETE FROM ocpp_connector_mappings WHERE id = $1`, [connMappingUUID]);
  await query(`DELETE FROM ocpp_evse_mappings WHERE id = $1`, [evseMappingUUID]);
  await query(`DELETE FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D5%' OR charge_point_id LIKE 'TEST-CP%'`);

  const evseCount = await query(`SELECT COUNT(*)::int AS cnt FROM evses`);
  assert(evseCount.rows[0].cnt === 9, '73. Seed EVSE count is 9');

  const connCount = await query(`SELECT COUNT(*)::int AS cnt FROM connectors`);
  assert(connCount.rows[0].cnt === 13, '74. Seed connector count is 13');

  const sessCount = await query(`SELECT COUNT(*)::int AS cnt FROM charging_sessions`);
  assert(sessCount.rows[0].cnt === 4, '75. Charging session count unchanged (4 seed sessions)');

  console.log('\n========================================================');
  console.log(`📊 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('❌ Unhandled error in Phase 3D.5 test suite:', err);
  process.exit(1);
});
