/**
 * backend/src/scripts/test_phase3d4b.js
 *
 * Automated verification test suite for Phase 3D.4B — Persistent OCPP Device & EVSE/Connector Mapping.
 *
 * Tests:
 *   A. Schema   — tables, columns, foreign keys, unique/check constraints
 *   B. Inserts  — valid record creation in all 3 new tables
 *   C. Lookups  — ocppMappingService resolveChargePoint / resolveEvseMapping / resolveConnectorMapping
 *   D. Constraints — all UNIQUE, CHECK, and FK violation scenarios
 *   E. Data integrity — existing EVSE/connector/session counts unchanged
 *   F. REST regression — all existing APIs respond correctly
 *   G. OCPP WebSocket regression — BootNotification, StatusNotification, DB not modified
 *   H. Cleanup — test records removed, seed state verified intact
 */

import WebSocket from 'ws';
import { query } from '../config/database.js';
import {
  resolveChargePoint,
  resolveEvseMapping,
  resolveConnectorMapping,
  getFullMapping,
} from '../services/ocppMappingService.js';

const SERVER_URL = 'http://127.0.0.1:3001';
const WS_URL = 'ws://127.0.0.1:3001';

let passed = 0;
let failed = 0;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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
    console.error(`  ❌ FAIL: ${message} (expected rejection, but resolved)`);
    failed++;
  } catch (_) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  }
}

function connectWs(url, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    const timeout = setTimeout(() => { ws.terminate(); reject(new Error(`WS timeout: ${url}`)); }, 4000);
    ws.on('open', () => { clearTimeout(timeout); resolve(ws); });
    ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

function sendAndReceive(ws, messageObj) {
  return new Promise((resolve, reject) => {
    const payload = typeof messageObj === 'string' ? messageObj : JSON.stringify(messageObj);
    const timer = setTimeout(() => {
      ws.removeListener('message', onMsg);
      reject(new Error('Timeout waiting for WS response'));
    }, 3000);
    const onMsg = (data) => {
      ws.removeListener('message', onMsg);
      clearTimeout(timer);
      try { resolve(JSON.parse(data.toString())); } catch (_) { resolve(data.toString()); }
    };
    ws.on('message', onMsg);
    ws.send(payload);
  });
}

function waitForClose(ws) {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
    ws.on('close', () => resolve());
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  console.log('========================================================');
  console.log('🧪 Phase 3D.4B — OCPP Device & EVSE/Connector Mapping Tests');
  console.log('========================================================\n');

  // ── A. Schema verification ───────────────────────────────────────────────
  console.log('--- A. Schema Verification ---');

  // 1. ocpp_charge_points table and columns
  const ocpCols = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'ocpp_charge_points' ORDER BY ordinal_position`
  );
  assert(ocpCols.rows.length > 0, '1. ocpp_charge_points table exists');
  const ocpSet = new Set(ocpCols.rows.map(r => r.column_name));
  assert(
    ['id','charge_point_id','location_id','model','vendor_name','serial_number',
     'firmware_version','boot_reason','registration_status','last_boot_at',
     'status','created_at','updated_at'].every(c => ocpSet.has(c)),
    '2. ocpp_charge_points has all required columns'
  );

  // 2. ocpp_evse_mappings table and columns
  const oemCols = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'ocpp_evse_mappings' ORDER BY ordinal_position`
  );
  assert(oemCols.rows.length > 0, '3. ocpp_evse_mappings table exists');
  const oemSet = new Set(oemCols.rows.map(r => r.column_name));
  assert(
    ['id','charge_point_id','ocpp_evse_id','evse_id','created_at','updated_at'].every(c => oemSet.has(c)),
    '4. ocpp_evse_mappings has all required columns'
  );

  // 3. ocpp_connector_mappings table and columns
  const ocmCols = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'ocpp_connector_mappings' ORDER BY ordinal_position`
  );
  assert(ocmCols.rows.length > 0, '5. ocpp_connector_mappings table exists');
  const ocmSet = new Set(ocmCols.rows.map(r => r.column_name));
  assert(
    ['id','ocpp_evse_mapping_id','ocpp_connector_id','connector_id','created_at','updated_at'].every(c => ocmSet.has(c)),
    '6. ocpp_connector_mappings has all required columns'
  );

  // 4. Foreign keys
  const fks = await query(
    `SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
     JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_name IN ('ocpp_charge_points','ocpp_evse_mappings','ocpp_connector_mappings')`
  );
  const fkPairs = fks.rows.map(r => `${r.table_name}.${r.column_name}->${r.foreign_table}`);
  assert(fkPairs.some(p => p.startsWith('ocpp_charge_points.location_id->locations')),
    '7. ocpp_charge_points.location_id FK to locations');
  assert(fkPairs.some(p => p.startsWith('ocpp_evse_mappings.charge_point_id->ocpp_charge_points')),
    '8. ocpp_evse_mappings.charge_point_id FK to ocpp_charge_points');
  assert(fkPairs.some(p => p.startsWith('ocpp_evse_mappings.evse_id->evses')),
    '9. ocpp_evse_mappings.evse_id FK to evses');
  assert(fkPairs.some(p => p.startsWith('ocpp_connector_mappings.ocpp_evse_mapping_id->ocpp_evse_mappings')),
    '10. ocpp_connector_mappings.ocpp_evse_mapping_id FK to ocpp_evse_mappings');
  assert(fkPairs.some(p => p.startsWith('ocpp_connector_mappings.connector_id->connectors')),
    '11. ocpp_connector_mappings.connector_id FK to connectors');

  // 5. Unique constraints
  const uqs = await query(
    `SELECT tc.table_name, string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS cols
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
     WHERE tc.constraint_type = 'UNIQUE'
       AND tc.table_name IN ('ocpp_charge_points','ocpp_evse_mappings','ocpp_connector_mappings')
     GROUP BY tc.table_name, tc.constraint_name`
  );
  const uqSet = uqs.rows.map(r => `${r.table_name}:${r.cols}`);
  assert(uqSet.some(u => u.startsWith('ocpp_charge_points:charge_point_id')),
    '12. UNIQUE(charge_point_id) on ocpp_charge_points');
  assert(uqSet.some(u => u.startsWith('ocpp_evse_mappings:evse_id')),
    '13. UNIQUE(evse_id) on ocpp_evse_mappings');
  assert(uqSet.some(u => u.startsWith('ocpp_connector_mappings:connector_id')),
    '14. UNIQUE(connector_id) on ocpp_connector_mappings');

  // ── B. Valid record insertion ─────────────────────────────────────────────
  console.log('\n--- B. Valid Record Insertion ---');

  // Clean up any stale test records from previous runs
  await query(`DELETE FROM ocpp_charge_points WHERE charge_point_id LIKE 'TEST-CP%' OR charge_point_id LIKE 'CP-REG%'`);

  const testCpId = `TEST-CP-3D4B-${Date.now()}`;
  let testCpUUID, testEvseMappingUUID, testConnMappingUUID;

  // Grab seed EVSE #1 and its first connector
  const seedEvse = await query(`SELECT id FROM evses ORDER BY created_at ASC LIMIT 1`);
  assert(seedEvse.rows.length > 0, '15. Seed EVSE exists for test mapping');
  const seedEvseUUID = seedEvse.rows[0].id;

  const seedConn = await query(
    `SELECT id FROM connectors WHERE evse_id = $1 ORDER BY connector_id ASC LIMIT 1`,
    [seedEvseUUID]
  );
  assert(seedConn.rows.length > 0, '16. Seed connector exists for test mapping');
  const seedConnUUID = seedConn.rows[0].id;

  // Insert charge point
  const cpIns = await query(
    `INSERT INTO ocpp_charge_points (charge_point_id, model, vendor_name, registration_status, status)
     VALUES ($1, 'TestModel', 'TestVendor', 'Pending', 'online') RETURNING id`,
    [testCpId]
  );
  testCpUUID = cpIns.rows[0].id;
  assert(typeof testCpUUID === 'string' && testCpUUID.length > 10, '17. ocpp_charge_points INSERT succeeded');

  // Insert EVSE mapping
  const evseIns = await query(
    `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id)
     VALUES ($1, 1, $2) RETURNING id`,
    [testCpUUID, seedEvseUUID]
  );
  testEvseMappingUUID = evseIns.rows[0].id;
  assert(typeof testEvseMappingUUID === 'string' && testEvseMappingUUID.length > 10, '18. ocpp_evse_mappings INSERT succeeded');

  // Insert connector mapping
  const connIns = await query(
    `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
     VALUES ($1, 1, $2) RETURNING id`,
    [testEvseMappingUUID, seedConnUUID]
  );
  testConnMappingUUID = connIns.rows[0].id;
  assert(typeof testConnMappingUUID === 'string' && testConnMappingUUID.length > 10, '19. ocpp_connector_mappings INSERT succeeded');

  // ── C. Service lookup tests ───────────────────────────────────────────────
  console.log('\n--- C. Mapping Service Lookups ---');

  // resolveChargePoint
  const cpResult = await resolveChargePoint(testCpId);
  assert(cpResult !== null, '20. resolveChargePoint() returns a row');
  assert(cpResult.charge_point_id === testCpId, '21. resolveChargePoint() returns correct charge_point_id');
  assert(cpResult.registration_status === 'Pending', '22. resolveChargePoint() returns correct registration_status');
  assert(cpResult.id === testCpUUID, '23. resolveChargePoint() returns correct UUID');

  // resolveEvseMapping
  const evseResult = await resolveEvseMapping(testCpId, 1);
  assert(evseResult !== null, '24. resolveEvseMapping() finds mapping');
  assert(evseResult.evseId === seedEvseUUID, '25. resolveEvseMapping() returns correct VahanGrid evse UUID');
  assert(evseResult.mappingId === testEvseMappingUUID, '26. resolveEvseMapping() returns correct mappingId');

  // resolveConnectorMapping
  const connResult = await resolveConnectorMapping(testCpId, 1, 1);
  assert(connResult !== null, '27. resolveConnectorMapping() finds mapping');
  assert(connResult.connectorId === seedConnUUID, '28. resolveConnectorMapping() returns correct VahanGrid connector UUID');
  assert(connResult.evseId === seedEvseUUID, '29. resolveConnectorMapping() returns parent evseId in result');
  assert(connResult.mappingId === testEvseMappingUUID, '30. resolveConnectorMapping() returns correct mappingId');

  // null cases
  const nullCp = await resolveEvseMapping('UNKNOWN-CP-NOTEXIST', 1);
  assert(nullCp === null, '31. resolveEvseMapping() returns null for unknown chargePointId');

  const nullConn = await resolveConnectorMapping(testCpId, 1, 99);
  assert(nullConn === null, '32. resolveConnectorMapping() returns null for unmapped connectorId');

  const evse0 = await resolveEvseMapping(testCpId, 0);
  assert(evse0 === null, '33. resolveEvseMapping() returns null for evseId=0 (charge-point-level, not in table)');

  const evseNeg = await resolveEvseMapping(testCpId, -1);
  assert(evseNeg === null, '34. resolveEvseMapping() returns null for negative evseId');

  // getFullMapping
  const full = await getFullMapping(testCpId);
  assert(Array.isArray(full) && full.length === 1, '35. getFullMapping() returns 1 entry');
  assert(full[0].ocpp_evse_id === 1, '36. getFullMapping() entry has correct ocpp_evse_id');
  assert(full[0].evse_id === seedEvseUUID, '37. getFullMapping() entry has correct evse_id');
  assert(full[0].ocpp_connector_id === 1, '38. getFullMapping() entry has correct ocpp_connector_id');
  assert(full[0].connector_id === seedConnUUID, '39. getFullMapping() entry has correct connector_id');

  // ── D. Constraint tests ───────────────────────────────────────────────────
  console.log('\n--- D. Constraint Tests ---');

  // Duplicate charge_point_id
  await assertRejects(
    () => query(`INSERT INTO ocpp_charge_points (charge_point_id) VALUES ($1)`, [testCpId]),
    '40. Duplicate charge_point_id rejected (UNIQUE violation)'
  );

  // Duplicate (charge_point_id, ocpp_evse_id)
  await assertRejects(
    () => query(
      `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id) VALUES ($1, 1, $2)`,
      [testCpUUID, seedEvseUUID]
    ),
    '41. Duplicate (charge_point_id, ocpp_evse_id) rejected (UNIQUE violation)'
  );

  // Duplicate evse_id — another charge point trying to claim the same EVSE
  const cp2Ins = await query(
    `INSERT INTO ocpp_charge_points (charge_point_id) VALUES ($1) RETURNING id`,
    [`TEST-CP2-3D4B-${Date.now()}`]
  );
  const cp2UUID = cp2Ins.rows[0].id;
  await assertRejects(
    () => query(
      `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id) VALUES ($1, 1, $2)`,
      [cp2UUID, seedEvseUUID]
    ),
    '42. Duplicate evse_id across charge points rejected (UNIQUE uq_vahangrid_evse_mapped)'
  );
  await query(`DELETE FROM ocpp_charge_points WHERE id = $1`, [cp2UUID]);

  // Duplicate (ocpp_evse_mapping_id, ocpp_connector_id)
  await assertRejects(
    () => query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ($1, 1, $2)`,
      [testEvseMappingUUID, seedConnUUID]
    ),
    '43. Duplicate (ocpp_evse_mapping_id, ocpp_connector_id) rejected (UNIQUE violation)'
  );

  // Duplicate connector_id — different EVSE mapping claiming same connector
  const evse2 = await query(`SELECT id FROM evses WHERE id != $1 LIMIT 1`, [seedEvseUUID]);
  if (evse2.rows.length > 0) {
    const evse2UUID = evse2.rows[0].id;
    const em2Ins = await query(
      `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id) VALUES ($1, 2, $2) RETURNING id`,
      [testCpUUID, evse2UUID]
    );
    const em2UUID = em2Ins.rows[0].id;
    await assertRejects(
      () => query(
        `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
         VALUES ($1, 1, $2)`,
        [em2UUID, seedConnUUID]
      ),
      '44. Duplicate connector_id across EVSE mappings rejected (UNIQUE uq_vahangrid_connector_mapped)'
    );
    await query(`DELETE FROM ocpp_evse_mappings WHERE id = $1`, [em2UUID]);
  } else {
    assert(true, '44. Skipped (only one EVSE in DB)');
  }

  // evseId = 0 rejected
  await assertRejects(
    () => query(
      `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id) VALUES ($1, 0, $2)`,
      [testCpUUID, seedEvseUUID]
    ),
    '45. ocpp_evse_id = 0 rejected (CHECK > 0)'
  );

  // evseId = -1 rejected
  await assertRejects(
    () => query(
      `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id) VALUES ($1, -1, $2)`,
      [testCpUUID, seedEvseUUID]
    ),
    '46. ocpp_evse_id = -1 rejected (CHECK > 0)'
  );

  // connectorId = 0 rejected
  await assertRejects(
    () => query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ($1, 0, $2)`,
      [testEvseMappingUUID, seedConnUUID]
    ),
    '47. ocpp_connector_id = 0 rejected (CHECK > 0)'
  );

  // connectorId = -1 rejected
  await assertRejects(
    () => query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ($1, -1, $2)`,
      [testEvseMappingUUID, seedConnUUID]
    ),
    '48. ocpp_connector_id = -1 rejected (CHECK > 0)'
  );

  // Invalid FK: bad charge_point_id in evse_mappings
  await assertRejects(
    () => query(
      `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id)
       VALUES ('00000000-0000-0000-0000-000000000000', 5, $1)`,
      [seedEvseUUID]
    ),
    '49. Invalid charge_point_id FK in ocpp_evse_mappings rejected'
  );

  // Invalid FK: bad evse_id in evse_mappings
  await assertRejects(
    () => query(
      `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id)
       VALUES ($1, 5, '00000000-0000-0000-0000-000000000000')`,
      [testCpUUID]
    ),
    '50. Invalid evse_id FK in ocpp_evse_mappings rejected'
  );

  // Invalid FK: bad ocpp_evse_mapping_id in connector_mappings
  await assertRejects(
    () => query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ('00000000-0000-0000-0000-000000000000', 5, $1)`,
      [seedConnUUID]
    ),
    '51. Invalid ocpp_evse_mapping_id FK in ocpp_connector_mappings rejected'
  );

  // Invalid FK: bad connector_id in connector_mappings
  await assertRejects(
    () => query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ($1, 5, '00000000-0000-0000-0000-000000000000')`,
      [testEvseMappingUUID]
    ),
    '52. Invalid connector_id FK in ocpp_connector_mappings rejected'
  );

  // Invalid registration_status CHECK
  await assertRejects(
    () => query(
      `INSERT INTO ocpp_charge_points (charge_point_id, registration_status)
       VALUES ('CP-BAD-REG', 'Approved')`,
      []
    ),
    '53. Invalid registration_status "Approved" rejected (CHECK constraint)'
  );

  // Invalid status CHECK
  await assertRejects(
    () => query(
      `INSERT INTO ocpp_charge_points (charge_point_id, status)
       VALUES ('CP-BAD-STATUS', 'active')`,
      []
    ),
    '54. Invalid status "active" rejected (CHECK constraint)'
  );

  // ── E. Existing data integrity ─────────────────────────────────────────────
  console.log('\n--- E. Existing Data Integrity ---');

  const evseCount = await query(`SELECT COUNT(*)::int AS cnt FROM evses`);
  assert(evseCount.rows[0].cnt === 9, `55. EVSE count unchanged (expected 9, got ${evseCount.rows[0].cnt})`);

  const connCount = await query(`SELECT COUNT(*)::int AS cnt FROM connectors`);
  assert(connCount.rows[0].cnt === 13, `56. Connector count unchanged (expected 13, got ${connCount.rows[0].cnt})`);

  const sessCount = await query(`SELECT COUNT(*)::int AS cnt FROM charging_sessions`);
  assert(sessCount.rows[0].cnt === 4, `57. Charging session count unchanged (expected 4, got ${sessCount.rows[0].cnt})`);

  // ── F. REST API regression ────────────────────────────────────────────────
  console.log('\n--- F. REST API Regression ---');

  const healthRes = await fetch(`${SERVER_URL}/api/v1/health`);
  const healthJson = await healthRes.json();
  assert(healthRes.status === 200, '58. GET /api/v1/health returns 200');
  assert(healthJson.status === 'healthy', '59. Health response status is "healthy"');

  const stationsRes = await fetch(`${SERVER_URL}/api/v1/stations`);
  assert(stationsRes.status === 200, '60. GET /api/v1/stations returns 200');

  const nearbyRes = await fetch(`${SERVER_URL}/api/v1/stations/nearby?lat=19.0596&lng=72.8295&radius_km=10`);
  assert(nearbyRes.status === 200, '61. GET /api/v1/stations/nearby returns 200');

  const authRes = await fetch(`${SERVER_URL}/api/v1/auth/me`);
  assert(authRes.status === 401, '62. GET /api/v1/auth/me returns 401 (unauthenticated)');

  const vehiclesRes = await fetch(`${SERVER_URL}/api/v1/vehicles`);
  assert(vehiclesRes.status === 401, '63. GET /api/v1/vehicles returns 401 (unauthenticated)');

  const sessionsRes = await fetch(`${SERVER_URL}/api/v1/sessions`);
  assert(sessionsRes.status === 401, '64. GET /api/v1/sessions returns 401 (unauthenticated)');

  const walletRes = await fetch(`${SERVER_URL}/api/v1/wallet`);
  assert(walletRes.status === 401, '65. GET /api/v1/wallet returns 401 (unauthenticated)');

  // ── G. OCPP WebSocket regression ──────────────────────────────────────────
  console.log('\n--- G. OCPP WebSocket Regression ---');

  const wsId = `CP-REG-3D4B-${Date.now()}`;
  const ws = await connectWs(`${WS_URL}/ocpp/${wsId}`);
  assert(ws.readyState === WebSocket.OPEN, '66. WebSocket connects to /ocpp/<id>');

  // BootNotification
  const bootRes = await sendAndReceive(ws, [
    2, `msg-boot-${Date.now()}`, 'BootNotification',
    { reason: 'PowerUp', chargingStation: { model: 'TestModel', vendorName: 'TestVendor' } },
  ]);
  assert(bootRes[0] === 3, '67. BootNotification returns CALLRESULT (type 3)');
  assert(bootRes[2].status === 'Accepted', '68. BootNotification response status is Accepted');
  assert(bootRes[2].interval === 300, '69. BootNotification interval is 300');
  assert(typeof bootRes[2].currentTime === 'string', '70. BootNotification returns currentTime');

  // StatusNotification
  const snRes = await sendAndReceive(ws, [
    2, `msg-sn-${Date.now()}`, 'StatusNotification',
    { timestamp: new Date().toISOString(), connectorStatus: 'Available', evseId: 1, connectorId: 1 },
  ]);
  assert(snRes[0] === 3, '71. StatusNotification returns CALLRESULT (type 3)');
  assert(
    typeof snRes[2] === 'object' && Object.keys(snRes[2]).length === 0,
    '72. StatusNotification response payload is empty object {}'
  );

  // StatusNotification does NOT modify connector state in PostgreSQL
  const connsBefore = await query('SELECT id, status, updated_at FROM connectors ORDER BY id');
  await sendAndReceive(ws, [
    2, `msg-sn-db-${Date.now()}`, 'StatusNotification',
    { timestamp: new Date().toISOString(), connectorStatus: 'Faulted', evseId: 1, connectorId: 1 },
  ]);
  const connsAfter = await query('SELECT id, status, updated_at FROM connectors ORDER BY id');
  let dbModified = false;
  for (let i = 0; i < connsBefore.rows.length; i++) {
    if (connsBefore.rows[i].status !== connsAfter.rows[i].status ||
        connsBefore.rows[i].updated_at.getTime() !== connsAfter.rows[i].updated_at.getTime()) {
      dbModified = true; break;
    }
  }
  assert(!dbModified, '73. StatusNotification still does NOT modify PostgreSQL connector state');

  // Unsupported action (Authorize is not implemented in Phase 3D.4B/3D.5)
  const unsupRes = await sendAndReceive(ws, [
    2, `msg-unsup-${Date.now()}`, 'Authorize', { idToken: { idToken: 'TAG-1', type: 'ISO14443' } },
  ]);
  assert(unsupRes[0] === 4, '74. Unsupported action returns CALLERROR (type 4)');
  assert(unsupRes[2] === 'NotImplemented', '75. CALLERROR code is NotImplemented');

  ws.close(1000, 'Regression complete');
  await waitForClose(ws);
  assert(true, '76. WebSocket closed cleanly');

  // ── H. Cleanup ──────────────────────────────────────────────────────────
  console.log('\n--- H. Cleanup ---');

  const delConn = await query(
    `DELETE FROM ocpp_connector_mappings WHERE id = $1 RETURNING id`, [testConnMappingUUID]
  );
  assert(delConn.rows.length === 1, '77. Test connector mapping deleted');

  const delEvse = await query(
    `DELETE FROM ocpp_evse_mappings WHERE id = $1 RETURNING id`, [testEvseMappingUUID]
  );
  assert(delEvse.rows.length === 1, '78. Test EVSE mapping deleted');

  const delCp = await query(
    `DELETE FROM ocpp_charge_points WHERE id = $1 RETURNING id`, [testCpUUID]
  );
  assert(delCp.rows.length === 1, '79. Test charge point deleted');

  // Post-cleanup: lookup returns null
  const postCp = await resolveChargePoint(testCpId);
  assert(postCp === null, '80. resolveChargePoint() returns null after cleanup');

  // Seed data still intact
  const evsePost = await query(`SELECT COUNT(*)::int AS cnt FROM evses`);
  assert(evsePost.rows[0].cnt === 9, `81. Seed EVSE count still 9 after cleanup`);
  const connPost = await query(`SELECT COUNT(*)::int AS cnt FROM connectors`);
  assert(connPost.rows[0].cnt === 13, `82. Seed connector count still 13 after cleanup`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n========================================================');
  console.log(`📊 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('❌ Unhandled error in test suite:', err);
  process.exit(1);
});
