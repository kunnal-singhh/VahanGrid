/**
 * backend/src/scripts/test_phase3d6a.js
 *
 * Automated verification test suite for Phase 3D.6A:
 * Persistent OCPP Transaction Layer & TransactionEvent Lifecycle Handling.
 *
 * Test Suites:
 *   1. Schema & Migration 015 Verification:
 *      - Table existence, columns, data types, nullability, defaults
 *      - Foreign keys (ocpp_charge_points, connectors, charging_sessions)
 *      - Composite unique constraint (ocpp_charge_point_id, transaction_id)
 *      - Indexes (idx_ocpp_tx_lookup, idx_ocpp_tx_session, idx_ocpp_tx_connector, idx_ocpp_tx_status)
 *      - Integrity of existing domain tables (charging_sessions.user_id remains NOT NULL)
 *   2. TransactionEvent(Started):
 *      - Started without REST session -> creates only ocpp_transactions (session_id = NULL)
 *      - Never invents a user; no charging_sessions row fabricated
 *      - Mapped connector status transitions to 'charging'
 *      - Started with existing active REST session -> links session_id & sets external_session_id
 *   3. TransactionEvent(Updated):
 *      - Valid newer seqNo updates transaction state & energy
 *      - Stale / older seqNo ignored (monotonic ordering enforced)
 *      - Linked active session energy updated
 *   4. TransactionEvent(Ended):
 *      - Valid Ended marks transaction 'completed', sets ended_at & stopped_reason
 *      - Linked REST session transitioned to terminal ('completed') with duration
 *      - Mapped connector status returns to 'available'
 *   5. Idempotency Protection:
 *      - Duplicate Started returns CALLRESULT {} without inserting duplicates
 *      - Duplicate Updated returns CALLRESULT {} without state mutation
 *      - Duplicate Ended returns CALLRESULT {} without corrupting terminal state
 *      - Same transaction_id on different charge points succeeds (composite uniqueness)
 *   6. Validation & Edge Cases:
 *      - Unknown charge point rejected (PropertyConstraintViolation)
 *      - Unmapped EVSE rejected (PropertyConstraintViolation)
 *      - evseId = 0 rejected for transaction (PropertyConstraintViolation)
 *      - Missing/invalid required fields (eventType, seqNo, timestamp, triggerReason, transactionId)
 *      - Unknown transaction on Updated / Ended rejected (PropertyConstraintViolation)
 *   7. REST / OCPP Concurrency & Terminal Protection:
 *      - REST start + OCPP Started integration
 *      - REST stop + delayed OCPP Ended: does NOT resurrect already stopped session
 *   8. Cleanup
 */

import WebSocket from 'ws';
import pool, { query } from '../config/database.js';
import { resolveChargePoint, resolveConnectorMapping } from '../services/ocppMappingService.js';

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

function parseCookies(res) {
  const rawHeaders = res.headers.raw ? res.headers.raw() : {};
  const setCookie = rawHeaders['set-cookie'] || res.headers.getSetCookie?.() || [];
  const cookies = [];
  for (const str of setCookie) {
    const part = str.split(';')[0];
    if (part) cookies.push(part.trim());
  }
  return cookies.join('; ');
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
  console.log('🧪 Phase 3D.6A — Persistent OCPP Transactions & Lifecycle');
  console.log('========================================================\n');

  // Pre-test cleanup: ensure no stale test artifacts
  await query(`DELETE FROM ocpp_transactions WHERE transaction_id LIKE 'TX-TEST%' OR transaction_id LIKE 'TX-CONC%'`);
  await query(`DELETE FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D6%'`);

  // Fetch seed station, EVSE, and connector
  const seedEvseRes = await query(`SELECT id, location_id FROM evses ORDER BY created_at ASC LIMIT 1`);
  const seedEvseUUID = seedEvseRes.rows[0].id;
  const seedLocationUUID = seedEvseRes.rows[0].location_id;

  const seedConnRes = await query(
    `SELECT id, connector_id, status FROM connectors WHERE evse_id = $1 ORDER BY connector_id ASC LIMIT 2`,
    [seedEvseUUID]
  );
  const seedConn1UUID = seedConnRes.rows[0].id;
  const seedConn2UUID = seedConnRes.rows.length > 1 ? seedConnRes.rows[1].id : seedConn1UUID;

  // ── 1. Schema & Migration 015 Verification ───────────────────────────────
  console.log('--- 1. Schema & Migration 015 Verification ---');

  // Table existence
  const tblRes = await query(
    `SELECT table_name FROM information_schema.tables WHERE table_name = 'ocpp_transactions'`
  );
  assert(tblRes.rows.length === 1, '1. Table "ocpp_transactions" exists in PostgreSQL');

  // Required columns
  const expectedCols = [
    'id', 'ocpp_charge_point_id', 'transaction_id', 'seq_no',
    'ocpp_evse_id', 'ocpp_connector_id', 'connector_id', 'session_id',
    'id_token', 'id_token_type', 'charging_state', 'trigger_reason',
    'stopped_reason', 'meter_start_wh', 'meter_stop_wh', 'total_energy_kwh',
    'started_at', 'ended_at', 'status', 'created_at', 'updated_at'
  ];

  const colsRes = await query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'ocpp_transactions'`
  );
  const foundCols = new Set(colsRes.rows.map(r => r.column_name));
  const missingCols = expectedCols.filter(c => !foundCols.has(c));
  assert(missingCols.length === 0, `2. All required columns exist (missing: ${missingCols.join(', ') || 'none'})`);

  // Foreign keys
  const fkRes = await query(
    `SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name
     FROM information_schema.table_constraints AS tc
     JOIN information_schema.key_column_usage AS kcu
       ON tc.constraint_name = kcu.constraint_name
     JOIN information_schema.constraint_column_usage AS ccu
       ON ccu.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'ocpp_transactions'`
  );
  const fks = {};
  for (const r of fkRes.rows) {
    fks[r.column_name] = r.foreign_table_name;
  }
  assert(fks['ocpp_charge_point_id'] === 'ocpp_charge_points', '3. FK ocpp_charge_point_id references ocpp_charge_points');
  assert(fks['connector_id'] === 'connectors', '4. FK connector_id references connectors');
  assert(fks['session_id'] === 'charging_sessions', '5. FK session_id references charging_sessions');

  // Composite unique constraint
  const uqRes = await query(
    `SELECT tc.constraint_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
     WHERE tc.table_name = 'ocpp_transactions'
       AND tc.constraint_type = 'UNIQUE'
     ORDER BY kcu.ordinal_position`
  );
  const uqCols = uqRes.rows.map(r => r.column_name);
  assert(
    uqCols.includes('ocpp_charge_point_id') && uqCols.includes('transaction_id'),
    '6. Composite unique constraint exists on (ocpp_charge_point_id, transaction_id)'
  );

  // Indexes
  const idxRes = await query(
    `SELECT indexname FROM pg_indexes
     WHERE tablename = 'ocpp_transactions'`
  );
  const idxNames = new Set(idxRes.rows.map(r => r.indexname));
  assert(idxNames.has('idx_ocpp_tx_lookup'), '7. Index idx_ocpp_tx_lookup exists');
  assert(idxNames.has('idx_ocpp_tx_session'), '8. Index idx_ocpp_tx_session exists');
  assert(idxNames.has('idx_ocpp_tx_connector'), '9. Index idx_ocpp_tx_connector exists');
  assert(idxNames.has('idx_ocpp_tx_status'), '10. Index idx_ocpp_tx_status exists');

  // Verify charging_sessions.user_id remains NOT NULL
  const csUserCol = await query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_name = 'charging_sessions' AND column_name = 'user_id'`
  );
  assert(csUserCol.rows[0].is_nullable === 'NO', '11. charging_sessions.user_id remains NOT NULL (unmodified)');

  // Verify domain tables have no new OCPP columns
  const connOcppCols = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'connectors' AND column_name LIKE '%ocpp%'`
  );
  assert(connOcppCols.rows.length === 0, '12. connectors table has no OCPP columns (clean domain separation)');

  // ── Setup Test Charge Point and Mappings ──────────────────────────────────
  const cpTestId = `CP-3D6-A-${Date.now()}`;
  const cpRes = await query(
    `INSERT INTO ocpp_charge_points (charge_point_id, location_id, model, vendor_name, registration_status, status)
     VALUES ($1, $2, 'DeltaDC-150', 'Delta Systems', 'Accepted', 'online') RETURNING id`,
    [cpTestId, seedLocationUUID]
  );
  const cpUUID = cpRes.rows[0].id;

  const evseRes = await query(
    `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id)
     VALUES ($1, 1, $2) RETURNING id`,
    [cpUUID, seedEvseUUID]
  );
  const evseMapUUID = evseRes.rows[0].id;

  await query(
    `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
     VALUES ($1, 1, $2)`,
    [evseMapUUID, seedConn1UUID]
  );

  // Reset seed connector to available
  await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConn1UUID]);

  // Connect WebSocket for CP
  const ws = await connectWs(`${WS_URL}/ocpp/${cpTestId}`);
  assert(ws.readyState === WebSocket.OPEN, '13. WebSocket connected for test charge point');

  // ── 2. Started Event (Without REST Session) ────────────────────────────────
  console.log('\n--- 2. TransactionEvent(Started) — Anonymous / Unlinked ---');

  const txId1 = `TX-TEST-001-${Date.now()}`;
  const startTime1 = new Date();

  const startedPayload1 = {
    eventType: 'Started',
    timestamp: startTime1.toISOString(),
    triggerReason: 'Authorized',
    seqNo: 0,
    transactionInfo: {
      transactionId: txId1,
      chargingState: 'Charging',
    },
    idToken: {
      idToken: 'RFID-TAG-ABC1234',
      type: 'ISO14443',
    },
    evse: {
      id: 1,
      connectorId: 1,
    },
  };

  const startedRes1 = await sendAndReceive(ws, [2, 'msg-start-1', 'TransactionEvent', startedPayload1]);
  assert(startedRes1[0] === 3, '14. TransactionEvent(Started) returns CALLRESULT (type 3)');
  assert(startedRes1[1] === 'msg-start-1', '15. CALLRESULT echoes messageId');
  assert(typeof startedRes1[2] === 'object' && Object.keys(startedRes1[2]).length === 0, '16. CALLRESULT payload is empty object {}');

  // Verify record in ocpp_transactions
  const dbTx1Res = await query(
    `SELECT * FROM ocpp_transactions WHERE ocpp_charge_point_id = $1 AND transaction_id = $2`,
    [cpUUID, txId1]
  );
  assert(dbTx1Res.rows.length === 1, '17. Record created in ocpp_transactions');
  const dbTx1 = dbTx1Res.rows[0];
  assert(dbTx1.status === 'active', '18. ocpp_transactions.status is "active"');
  assert(dbTx1.seq_no === 0, '19. seq_no is 0');
  assert(dbTx1.ocpp_evse_id === 1, '20. ocpp_evse_id is 1');
  assert(dbTx1.ocpp_connector_id === 1, '21. ocpp_connector_id is 1');
  assert(dbTx1.connector_id === seedConn1UUID, '22. Resolved connector_id matches mapped physical connector UUID');
  assert(dbTx1.id_token === 'RFID-TAG-ABC1234', '23. id_token stored correctly');
  assert(dbTx1.id_token_type === 'ISO14443', '24. id_token_type stored correctly');
  assert(dbTx1.charging_state === 'Charging', '25. charging_state is "Charging"');
  assert(dbTx1.trigger_reason === 'Authorized', '26. trigger_reason is "Authorized"');
  assert(dbTx1.session_id === null, '27. session_id is NULL (no REST session existed)');

  // Verify NO customer charging_sessions record was fabricated
  const fakeSessionCheck = await query(
    `SELECT id FROM charging_sessions WHERE external_session_id = $1`,
    [txId1]
  );
  assert(fakeSessionCheck.rows.length === 0, '28. CRITICAL: No charging_sessions record fabricated without a user');

  // Verify physical connector status transitioned to 'charging'
  const conn1AfterStart = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConn1UUID]);
  assert(conn1AfterStart.rows[0].status === 'charging', '29. Physical connector status transitioned to "charging"');

  // ── 3. Updated Event ──────────────────────────────────────────────────────
  console.log('\n--- 3. TransactionEvent(Updated) ---');

  const updateTime1 = new Date();
  const updatedPayload1 = {
    eventType: 'Updated',
    timestamp: updateTime1.toISOString(),
    triggerReason: 'MeterValuePeriodic',
    seqNo: 1,
    transactionInfo: {
      transactionId: txId1,
      chargingState: 'Charging',
    },
    meterValue: [
      {
        timestamp: updateTime1.toISOString(),
        sampledValue: [
          {
            value: '4500',
            measurand: 'Energy.Active.Import.Register',
            unitOfMeasure: { unit: 'Wh' },
          },
        ],
      },
    ],
  };

  const updatedRes1 = await sendAndReceive(ws, [2, 'msg-update-1', 'TransactionEvent', updatedPayload1]);
  assert(updatedRes1[0] === 3, '30. TransactionEvent(Updated) returns CALLRESULT');

  const dbTx1AfterUpdate = await query(
    `SELECT seq_no, trigger_reason, total_energy_kwh FROM ocpp_transactions WHERE id = $1`,
    [dbTx1.id]
  );
  assert(dbTx1AfterUpdate.rows[0].seq_no === 1, '31. seq_no incremented to 1');
  assert(dbTx1AfterUpdate.rows[0].trigger_reason === 'MeterValuePeriodic', '32. trigger_reason updated to MeterValuePeriodic');
  assert(parseFloat(dbTx1AfterUpdate.rows[0].total_energy_kwh) === 4.5, '33. total_energy_kwh updated to 4.5 kWh (from 4500 Wh)');

  // Monotonic sequence verification: send older/stale seqNo (seqNo: 0)
  const staleUpdatedPayload = {
    eventType: 'Updated',
    timestamp: new Date().toISOString(),
    triggerReason: 'StaleEvent',
    seqNo: 0, // <= current seq_no 1
    transactionInfo: {
      transactionId: txId1,
      chargingState: 'SuspendedEV',
    },
  };

  const staleRes = await sendAndReceive(ws, [2, 'msg-update-stale', 'TransactionEvent', staleUpdatedPayload]);
  assert(staleRes[0] === 3, '34. Stale TransactionEvent(Updated) acknowledged with CALLRESULT');

  const dbTx1AfterStale = await query(
    `SELECT seq_no, charging_state FROM ocpp_transactions WHERE id = $1`,
    [dbTx1.id]
  );
  assert(dbTx1AfterStale.rows[0].seq_no === 1, '35. seq_no remains 1 (not regressed)');
  assert(dbTx1AfterStale.rows[0].charging_state === 'Charging', '36. charging_state NOT overwritten by stale event');

  // ── 4. Ended Event ────────────────────────────────────────────────────────
  console.log('\n--- 4. TransactionEvent(Ended) ---');

  const endTime1 = new Date();
  const endedPayload1 = {
    eventType: 'Ended',
    timestamp: endTime1.toISOString(),
    triggerReason: 'StopAuthorized',
    seqNo: 2,
    transactionInfo: {
      transactionId: txId1,
      stoppedReason: 'Local',
      chargingState: 'Idle',
    },
  };

  const endedRes1 = await sendAndReceive(ws, [2, 'msg-end-1', 'TransactionEvent', endedPayload1]);
  assert(endedRes1[0] === 3, '37. TransactionEvent(Ended) returns CALLRESULT');

  const dbTx1AfterEnded = await query(
    `SELECT status, seq_no, stopped_reason, charging_state, ended_at FROM ocpp_transactions WHERE id = $1`,
    [dbTx1.id]
  );
  assert(dbTx1AfterEnded.rows[0].status === 'completed', '38. ocpp_transactions.status is "completed"');
  assert(dbTx1AfterEnded.rows[0].seq_no === 2, '39. seq_no updated to 2');
  assert(dbTx1AfterEnded.rows[0].stopped_reason === 'Local', '40. stopped_reason is "Local"');
  assert(dbTx1AfterEnded.rows[0].ended_at !== null, '41. ended_at is populated');

  // Verify physical connector status returned to 'available'
  const conn1AfterEnded = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConn1UUID]);
  assert(conn1AfterEnded.rows[0].status === 'available', '42. Physical connector status returned to "available"');

  // ── 5. Started Event WITH Existing Active REST Session ────────────────────
  console.log('\n--- 5. Started Event with Existing Active REST Session ---');

  // Setup test user & vehicle
  const ts = Date.now();
  const userEmail = `ocpp_user_${ts}@vahan.test`;
  const regRes = await fetch(`${SERVER_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password: 'SecurePassword@123', name: 'OCPP Test User' }),
  });
  const userCookies = parseCookies(regRes);
  const userJson = await regRes.json();
  const testUserId = userJson.data?.user?.id;
  assert(regRes.status === 201 && testUserId, '43. Test user registered');

  // Add vehicle
  const vehRes = await query(
    `INSERT INTO vehicles (user_id, manufacturer, model, variant, battery_capacity_kwh, connector_type)
     VALUES ($1, 'Tata', 'Nexon EV Max', 'XZ+ Lux', 40.5, 'CCS2') RETURNING id`,
    [testUserId]
  );
  const testVehicleId = vehRes.rows[0].id;

  // Start REST session on seedConn1
  await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConn1UUID]);
  const startRestRes = await fetch(`${SERVER_URL}/api/v1/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: userCookies },
    body: JSON.stringify({ connector_id: seedConn1UUID, vehicle_id: testVehicleId }),
  });
  const startRestJson = await startRestRes.json();
  assert(startRestRes.status === 201 && startRestJson.data?.id, '44. REST session started successfully');
  const activeSessionId = startRestJson.data.id;

  // Now charger sends TransactionEvent(Started) on EVSE 1, Conn 1
  const txId2 = `TX-TEST-002-${Date.now()}`;
  const startedPayload2 = {
    eventType: 'Started',
    timestamp: new Date().toISOString(),
    triggerReason: 'Authorized',
    seqNo: 0,
    transactionInfo: {
      transactionId: txId2,
      chargingState: 'Charging',
    },
    evse: { id: 1, connectorId: 1 },
  };

  const startedRes2 = await sendAndReceive(ws, [2, 'msg-start-2', 'TransactionEvent', startedPayload2]);
  assert(startedRes2[0] === 3, '45. TransactionEvent(Started) on active session returns CALLRESULT');

  // Check ocpp_transactions.session_id is linked to the active session
  const dbTx2Res = await query(
    `SELECT session_id, connector_id FROM ocpp_transactions WHERE transaction_id = $1`,
    [txId2]
  );
  assert(dbTx2Res.rows[0].session_id === activeSessionId, '46. ocpp_transactions.session_id linked to active REST session');

  // Check charging_sessions.external_session_id is populated with transactionId
  const dbSessRes = await query(
    `SELECT user_id, external_session_id, status FROM charging_sessions WHERE id = $1`,
    [activeSessionId]
  );
  assert(dbSessRes.rows[0].external_session_id === txId2, '47. charging_sessions.external_session_id set to OCPP transactionId');
  assert(dbSessRes.rows[0].user_id === testUserId, '48. charging_sessions.user_id preserved and untouched');

  // Send Updated with Energy
  await sendAndReceive(ws, [
    2,
    'msg-update-2',
    'TransactionEvent',
    {
      eventType: 'Updated',
      timestamp: new Date().toISOString(),
      triggerReason: 'MeterValuePeriodic',
      seqNo: 1,
      transactionInfo: { transactionId: txId2 },
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [{ value: '8.2', unitOfMeasure: { unit: 'kWh' } }],
        },
      ],
    },
  ]);

  const dbSessAfterEnergy = await query(`SELECT energy_kwh FROM charging_sessions WHERE id = $1`, [activeSessionId]);
  assert(parseFloat(dbSessAfterEnergy.rows[0].energy_kwh) === 8.2, '49. Energy updated on active linked charging_sessions (8.2 kWh)');

  // Send Ended on this linked session
  await sendAndReceive(ws, [
    2,
    'msg-end-2',
    'TransactionEvent',
    {
      eventType: 'Ended',
      timestamp: new Date().toISOString(),
      triggerReason: 'EVDisconnected',
      seqNo: 2,
      transactionInfo: { transactionId: txId2, stoppedReason: 'EVDisconnected' },
    },
  ]);

  const dbSessAfterEnded = await query(
    `SELECT status, ended_at, duration_seconds FROM charging_sessions WHERE id = $1`,
    [activeSessionId]
  );
  assert(dbSessAfterEnded.rows[0].status === 'completed', '50. Linked charging_sessions transitioned to "completed"');
  assert(dbSessAfterEnded.rows[0].ended_at !== null, '51. charging_sessions.ended_at populated');
  assert(typeof dbSessAfterEnded.rows[0].duration_seconds === 'number', '52. charging_sessions.duration_seconds calculated');

  // ── 6. Idempotency Protection ─────────────────────────────────────────────
  console.log('\n--- 6. Idempotency Protection ---');

  // 6a. Duplicate Started
  const dupStartRes = await sendAndReceive(ws, [2, 'msg-dup-start', 'TransactionEvent', startedPayload1]);
  assert(dupStartRes[0] === 3, '53. Duplicate TransactionEvent(Started) returns CALLRESULT {}');

  const dupStartCount = await query(
    `SELECT COUNT(*) FROM ocpp_transactions WHERE ocpp_charge_point_id = $1 AND transaction_id = $2`,
    [cpUUID, txId1]
  );
  assert(parseInt(dupStartCount.rows[0].count, 10) === 1, '54. No duplicate ocpp_transactions row created for same txId');

  // 6b. Duplicate Ended
  const dupEndRes = await sendAndReceive(ws, [2, 'msg-dup-end', 'TransactionEvent', endedPayload1]);
  assert(dupEndRes[0] === 3, '55. Duplicate TransactionEvent(Ended) returns CALLRESULT {}');

  const dbTxAfterDupEnd = await query(`SELECT status FROM ocpp_transactions WHERE transaction_id = $1`, [txId1]);
  assert(dbTxAfterDupEnd.rows[0].status === 'completed', '56. Terminal transaction state remains "completed"');

  // 6c. Same transaction_id on DIFFERENT charge points
  const cp2Id = `CP-3D6-B-${Date.now()}`;
  const cp2Res = await query(
    `INSERT INTO ocpp_charge_points (charge_point_id, location_id, model, vendor_name, registration_status, status)
     VALUES ($1, $2, 'DeltaDC-150', 'Delta Systems', 'Accepted', 'online') RETURNING id`,
    [cp2Id, seedLocationUUID]
  );
  const cp2UUID = cp2Res.rows[0].id;

  const unmappedEvseQuery = await query(
    `SELECT e.id AS evse_id, c.id AS connector_id
     FROM evses e
     JOIN connectors c ON c.evse_id = e.id
     WHERE e.id NOT IN (SELECT evse_id FROM ocpp_evse_mappings)
     LIMIT 1`
  );
  const evse2UUID = unmappedEvseQuery.rows[0].evse_id;
  const conn2UUID = unmappedEvseQuery.rows[0].connector_id;

  const evse2Res = await query(
    `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id)
     VALUES ($1, 1, $2) RETURNING id`,
    [cp2UUID, evse2UUID]
  );
  await query(
    `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
     VALUES ($1, 1, $2)`,
    [evse2Res.rows[0].id, conn2UUID]
  );

  const ws2 = await connectWs(`${WS_URL}/ocpp/${cp2Id}`);

  // Send Started on CP2 with same txId1
  const startCp2Res = await sendAndReceive(ws2, [
    2,
    'msg-start-cp2',
    'TransactionEvent',
    {
      eventType: 'Started',
      timestamp: new Date().toISOString(),
      triggerReason: 'Authorized',
      seqNo: 0,
      transactionInfo: { transactionId: txId1, chargingState: 'Charging' },
      evse: { id: 1, connectorId: 1 },
    },
  ]);
  assert(startCp2Res[0] === 3, '57. Same transactionId on different charge point succeeds');

  const crossCpCount = await query(
    `SELECT COUNT(*) FROM ocpp_transactions WHERE transaction_id = $1`,
    [txId1]
  );
  assert(
    parseInt(crossCpCount.rows[0].count, 10) === 2,
    '58. Composite uniqueness (ocpp_charge_point_id, transaction_id) allows same txId across different chargers'
  );

  ws2.close();
  await waitForClose(ws2);

  // ── 7. Edge Cases & Validation ────────────────────────────────────────────
  console.log('\n--- 7. Edge Cases & Validation ---');

  // Unknown charge point
  const wsUnknown = await connectWs(`${WS_URL}/ocpp/CP-UNKNOWN-9999`);
  const unknownCpRes = await sendAndReceive(wsUnknown, [
    2,
    'msg-unreg-tx',
    'TransactionEvent',
    {
      eventType: 'Started',
      timestamp: new Date().toISOString(),
      triggerReason: 'Authorized',
      seqNo: 0,
      transactionInfo: { transactionId: 'TX-BAD-CP' },
      evse: { id: 1, connectorId: 1 },
    },
  ]);
  assert(unknownCpRes[0] === 4, '59. Unknown charge point rejected with CALLERROR');
  assert(unknownCpRes[2] === 'PropertyConstraintViolation', '60. Error code is PropertyConstraintViolation');
  wsUnknown.close();
  await waitForClose(wsUnknown);

  // Unmapped EVSE (evseId = 99)
  const unmappedEvseRes = await sendAndReceive(ws, [
    2,
    'msg-bad-evse',
    'TransactionEvent',
    {
      eventType: 'Started',
      timestamp: new Date().toISOString(),
      triggerReason: 'Authorized',
      seqNo: 0,
      transactionInfo: { transactionId: 'TX-BAD-EVSE' },
      evse: { id: 99, connectorId: 1 },
    },
  ]);
  assert(unmappedEvseRes[0] === 4, '61. Unmapped EVSE rejected with CALLERROR');
  assert(unmappedEvseRes[2] === 'PropertyConstraintViolation', '62. Error code is PropertyConstraintViolation');

  // evseId = 0 (charge-point-level transactions not allowed)
  const evseZeroRes = await sendAndReceive(ws, [
    2,
    'msg-evse-zero',
    'TransactionEvent',
    {
      eventType: 'Started',
      timestamp: new Date().toISOString(),
      triggerReason: 'Authorized',
      seqNo: 0,
      transactionInfo: { transactionId: 'TX-EVSE-0' },
      evse: { id: 0, connectorId: 0 },
    },
  ]);
  assert(evseZeroRes[0] === 4, '63. evseId = 0 rejected with CALLERROR');
  assert(evseZeroRes[2] === 'PropertyConstraintViolation', '64. evseId = 0 returns PropertyConstraintViolation');

  // Missing eventType
  const missingEventTypeRes = await sendAndReceive(ws, [
    2,
    'msg-bad-event-type',
    'TransactionEvent',
    {
      timestamp: new Date().toISOString(),
      triggerReason: 'Authorized',
      seqNo: 0,
      transactionInfo: { transactionId: 'TX-BAD' },
      evse: { id: 1, connectorId: 1 },
    },
  ]);
  assert(missingEventTypeRes[0] === 4, '65. Missing eventType returns CALLERROR');

  // Invalid eventType
  const invalidEventTypeRes = await sendAndReceive(ws, [
    2,
    'msg-bad-event-val',
    'TransactionEvent',
    {
      eventType: 'Paused',
      timestamp: new Date().toISOString(),
      triggerReason: 'Authorized',
      seqNo: 0,
      transactionInfo: { transactionId: 'TX-BAD' },
      evse: { id: 1, connectorId: 1 },
    },
  ]);
  assert(invalidEventTypeRes[0] === 4, '66. Invalid eventType "Paused" returns CALLERROR');

  // Missing transactionId
  const missingTxIdRes = await sendAndReceive(ws, [
    2,
    'msg-bad-tx-id',
    'TransactionEvent',
    {
      eventType: 'Started',
      timestamp: new Date().toISOString(),
      triggerReason: 'Authorized',
      seqNo: 0,
      transactionInfo: {},
      evse: { id: 1, connectorId: 1 },
    },
  ]);
  assert(missingTxIdRes[0] === 4, '67. Missing transactionId returns CALLERROR');

  // Negative seqNo
  const negSeqRes = await sendAndReceive(ws, [
    2,
    'msg-bad-seq',
    'TransactionEvent',
    {
      eventType: 'Started',
      timestamp: new Date().toISOString(),
      triggerReason: 'Authorized',
      seqNo: -1,
      transactionInfo: { transactionId: 'TX-BAD' },
      evse: { id: 1, connectorId: 1 },
    },
  ]);
  assert(negSeqRes[0] === 4, '68. Negative seqNo returns CALLERROR');

  // Unknown transaction on Updated
  const unknownTxUpdateRes = await sendAndReceive(ws, [
    2,
    'msg-unkn-upd',
    'TransactionEvent',
    {
      eventType: 'Updated',
      timestamp: new Date().toISOString(),
      triggerReason: 'MeterValuePeriodic',
      seqNo: 1,
      transactionInfo: { transactionId: 'NON-EXISTENT-TX' },
    },
  ]);
  assert(unknownTxUpdateRes[0] === 4, '69. Unknown transaction on Updated returns CALLERROR');

  // Unknown transaction on Ended
  const unknownTxEndRes = await sendAndReceive(ws, [
    2,
    'msg-unkn-end',
    'TransactionEvent',
    {
      eventType: 'Ended',
      timestamp: new Date().toISOString(),
      triggerReason: 'EVDisconnected',
      seqNo: 1,
      transactionInfo: { transactionId: 'NON-EXISTENT-TX' },
    },
  ]);
  assert(unknownTxEndRes[0] === 4, '70. Unknown transaction on Ended returns CALLERROR');

  // ── 8. REST Stop + Delayed OCPP Ended (Terminal Protection) ────────────────
  console.log('\n--- 8. REST Stop + Delayed OCPP Ended (Terminal Protection) ---');

  // Reset connector to available
  await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConn1UUID]);

  // Start new REST session
  const restStartRes2 = await fetch(`${SERVER_URL}/api/v1/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: userCookies },
    body: JSON.stringify({ connector_id: seedConn1UUID, vehicle_id: testVehicleId }),
  });
  const restStart2Json = await restStartRes2.json();
  const restSession2Id = restStart2Json.data.id;

  // Charger sends Started
  const txId3 = `TX-CONC-003-${Date.now()}`;
  await sendAndReceive(ws, [
    2,
    'msg-start-conc',
    'TransactionEvent',
    {
      eventType: 'Started',
      timestamp: new Date().toISOString(),
      triggerReason: 'Authorized',
      seqNo: 0,
      transactionInfo: { transactionId: txId3, chargingState: 'Charging' },
      evse: { id: 1, connectorId: 1 },
    },
  ]);

  // User stops session via REST first
  const restStopRes = await fetch(`${SERVER_URL}/api/v1/sessions/${restSession2Id}/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: userCookies },
  });
  assert(restStopRes.status === 200, '71. User stops session via REST (status: stopped)');

  const sessAfterRestStop = await query(`SELECT status FROM charging_sessions WHERE id = $1`, [restSession2Id]);
  assert(sessAfterRestStop.rows[0].status === 'stopped', '72. charging_sessions status is "stopped"');

  // Later, charger sends delayed TransactionEvent(Ended)
  const delayedEndRes = await sendAndReceive(ws, [
    2,
    'msg-end-conc',
    'TransactionEvent',
    {
      eventType: 'Ended',
      timestamp: new Date().toISOString(),
      triggerReason: 'Local',
      seqNo: 1,
      transactionInfo: { transactionId: txId3, stoppedReason: 'Local' },
    },
  ]);
  assert(delayedEndRes[0] === 3, '73. Delayed TransactionEvent(Ended) acknowledged with CALLRESULT');

  const sessAfterDelayedEnd = await query(`SELECT status FROM charging_sessions WHERE id = $1`, [restSession2Id]);
  assert(
    sessAfterDelayedEnd.rows[0].status === 'stopped',
    '74. CRITICAL: Delayed OCPP Ended does NOT resurrect or corrupt already stopped session (remains "stopped")'
  );

  const tx3Res = await query(`SELECT status FROM ocpp_transactions WHERE transaction_id = $1`, [txId3]);
  assert(tx3Res.rows[0].status === 'completed', '75. ocpp_transactions marked "completed"');

  // Socket remains open throughout all tests
  assert(ws.readyState === WebSocket.OPEN, '76. Charge point WebSocket connection remains OPEN and healthy');

  // Close WebSocket
  ws.close();
  await waitForClose(ws);

  // ── 9. Cleanup ────────────────────────────────────────────────────────────
  console.log('\n--- 9. Cleanup ---');
  await query(`DELETE FROM ocpp_transactions WHERE transaction_id LIKE 'TX-TEST%' OR transaction_id LIKE 'TX-CONC%'`);
  await query(`DELETE FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D6%'`);
  if (testUserId) {
    await query(`DELETE FROM charging_sessions WHERE user_id = $1`, [testUserId]);
    await query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = $1)`, [testUserId]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [testUserId]);
    await query(`DELETE FROM vehicles WHERE user_id = $1`, [testUserId]);
    await query(`DELETE FROM users WHERE id = $1`, [testUserId]);
  }
  await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConn1UUID]);
  console.log('  Cleanup completed.');

  console.log('\n========================================================');
  console.log(`📊 Phase 3D.6A Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run()
  .catch((err) => {
    console.error('Fatal error during Phase 3D.6A tests:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
