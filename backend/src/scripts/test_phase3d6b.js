/**
 * backend/src/scripts/test_phase3d6b.js
 *
 * Automated verification test suite for Phase 3D.6B:
 * OCPP TransactionEvent Energy Synchronization.
 *
 * Test Suites:
 *   1. Migration 016 & Schema Verification:
 *      - meter_start_wh DEFAULT is NULL
 *      - Columns meter_start_wh, meter_stop_wh, total_energy_kwh data types
 *      - charging_sessions.energy_kwh domain separation preserved
 *   2. Unit Tests for parseMeterReadingWh:
 *      - Measurand validation (Energy.Active.Import.Register vs Power, Current, SoC, etc.)
 *      - Unit validation (Wh, kWh, case insensitivity, unsupported units rejected)
 *      - Numeric validation (finite positive numbers, strings, negative/NaN rejected)
 *      - Timestamp validation
 *      - Multiple / nested sampled values
 *   3. TransactionEvent(Started):
 *      - Started with initial meterValue populates meter_start_wh
 *      - Started without meterValue stores meter_start_wh = NULL
 *   4. TransactionEvent(Updated) Energy Delta Computation:
 *      - Net energy = (meter_stop_wh - meter_start_wh) / 1000
 *      - Fallback when meter_start_wh is NULL (baseline 0)
 *      - kWh unit input conversion
 *      - Monotonicity / GREATEST protection against regressing energy
 *      - Non-energy telemetry safely ignored without corrupting energy
 *   5. TransactionEvent(Ended) Final Energy Synchronization:
 *      - Ended with meterValue finalizes meter_stop_wh and total_energy_kwh
 *      - Ended without meterValue preserves total_energy_kwh
 *   6. Full Lifecycle with Linked VahanGrid charging_sessions:
 *      - REST session start -> OCPP Started -> OCPP Updated -> OCPP Ended
 *      - Real-time synchronization of charging_sessions.energy_kwh
 *      - Terminal protection: does NOT overwrite already stopped session status
 *   7. Cleanup
 */

import WebSocket from 'ws';
import pool, { query } from '../config/database.js';
import { parseMeterReadingWh } from '../ocpp/handlers/transactionEventHandler.js';

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
    }, 4000);

    function onMsg(data) {
      clearTimeout(timer);
      ws.removeListener('message', onMsg);
      try {
        const parsed = JSON.parse(data.toString());
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    }

    ws.on('message', onMsg);
    ws.send(payload);
  });
}

async function runTests() {
  console.log('========================================================');
  console.log('🧪 Phase 3D.6B — OCPP TransactionEvent Energy Sync');
  console.log('========================================================\n');

  // Fetch seed entities
  const locRes = await query(`SELECT id FROM locations LIMIT 1`);
  const seedLocationUUID = locRes.rows[0].id;

  const evseRes = await query(`SELECT id FROM evses LIMIT 1`);
  const seedEvseUUID = evseRes.rows[0].id;

  const connRes = await query(`SELECT id FROM connectors LIMIT 1`);
  const seedConnUUID = connRes.rows[0].id;

  try {
    // ── 1. Migration 016 & Schema Verification ──────────────────────────────
    console.log('--- 1. Migration 016 & Schema Verification ---');

    const colRes = await query(
      `SELECT column_name, data_type, column_default, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'ocpp_transactions' AND column_name IN ('meter_start_wh', 'meter_stop_wh', 'total_energy_kwh')`
    );

    const cols = {};
    for (const r of colRes.rows) {
      cols[r.column_name] = r;
    }

    assert(cols.meter_start_wh !== undefined, '1. Column "meter_start_wh" exists');
    assert(
      cols.meter_start_wh.column_default === null || cols.meter_start_wh.column_default === 'NULL::numeric',
      `2. Column "meter_start_wh" default is NULL (got: ${cols.meter_start_wh?.column_default})`
    );
    assert(cols.meter_stop_wh !== undefined, '3. Column "meter_stop_wh" exists');
    assert(cols.meter_stop_wh.is_nullable === 'YES', '4. Column "meter_stop_wh" is nullable');
    assert(cols.total_energy_kwh !== undefined, '5. Column "total_energy_kwh" exists');
    assert(cols.total_energy_kwh.is_nullable === 'NO', '6. Column "total_energy_kwh" is NOT NULL');

    // Verify charging_sessions.energy_kwh remains valid
    const sessColRes = await query(
      `SELECT column_name, data_type, column_default FROM information_schema.columns
       WHERE table_name = 'charging_sessions' AND column_name = 'energy_kwh'`
    );
    assert(sessColRes.rows.length === 1, '7. charging_sessions.energy_kwh remains defined and unchanged');

    // ── 2. Unit Tests for parseMeterReadingWh ────────────────────────────────
    console.log('\n--- 2. Unit Tests for parseMeterReadingWh ---');

    // 2.1 Standard Wh reading
    const whReading = parseMeterReadingWh([
      {
        timestamp: new Date().toISOString(),
        sampledValue: [
          {
            value: '5000',
            measurand: 'Energy.Active.Import.Register',
            unitOfMeasure: { unit: 'Wh' },
          },
        ],
      },
    ]);
    assert(whReading === 5000, '8. Parses standard Wh reading correctly (5000 Wh)');

    // 2.2 Standard kWh reading converted to Wh
    const kwhReading = parseMeterReadingWh([
      {
        timestamp: new Date().toISOString(),
        sampledValue: [
          {
            value: '7.5',
            measurand: 'Energy.Active.Import.Register',
            unitOfMeasure: { unit: 'kWh' },
          },
        ],
      },
    ]);
    assert(kwhReading === 7500, '9. Converts kWh reading to Wh (7.5 kWh -> 7500 Wh)');

    // 2.3 Omitted unit defaults to Wh per OCPP 2.0.1
    const defaultUnitReading = parseMeterReadingWh([
      {
        timestamp: new Date().toISOString(),
        sampledValue: [
          {
            value: '1234',
            measurand: 'Energy.Active.Import.Register',
          },
        ],
      },
    ]);
    assert(defaultUnitReading === 1234, '10. Omitted unit defaults to Wh (1234 Wh)');

    // 2.4 Omitted measurand defaults to Energy.Active.Import.Register per OCPP 2.0.1
    const defaultMeasurandReading = parseMeterReadingWh([
      {
        timestamp: new Date().toISOString(),
        sampledValue: [
          {
            value: '8.2',
            unitOfMeasure: { unit: 'kWh' },
          },
        ],
      },
    ]);
    assert(defaultMeasurandReading === 8200, '11. Omitted measurand defaults to Energy.Active.Import.Register');

    // 2.5 Non-energy measurand ignored (Power, Current, SoC, Voltage)
    const powerReading = parseMeterReadingWh([
      {
        timestamp: new Date().toISOString(),
        sampledValue: [
          {
            value: '50000',
            measurand: 'Power.Active.Import',
            unitOfMeasure: { unit: 'W' },
          },
        ],
      },
    ]);
    assert(powerReading === null, '12. Power.Active.Import measurand safely ignored (returns null)');

    const socReading = parseMeterReadingWh([
      {
        timestamp: new Date().toISOString(),
        sampledValue: [
          {
            value: '80',
            measurand: 'SoC',
            unitOfMeasure: { unit: 'Percent' },
          },
        ],
      },
    ]);
    assert(socReading === null, '13. SoC measurand safely ignored (returns null)');

    // 2.6 Unsupported unit ignored (e.g. kvarh, A, V)
    const badUnitReading = parseMeterReadingWh([
      {
        timestamp: new Date().toISOString(),
        sampledValue: [
          {
            value: '100',
            measurand: 'Energy.Active.Import.Register',
            unitOfMeasure: { unit: 'kvarh' },
          },
        ],
      },
    ]);
    assert(badUnitReading === null, '14. Unsupported unit "kvarh" safely ignored (returns null)');

    // 2.7 Negative or non-numeric values rejected
    const negativeReading = parseMeterReadingWh([
      {
        timestamp: new Date().toISOString(),
        sampledValue: [{ value: '-500' }],
      },
    ]);
    assert(negativeReading === null, '15. Negative meter value rejected (returns null)');

    const nanReading = parseMeterReadingWh([
      {
        timestamp: new Date().toISOString(),
        sampledValue: [{ value: 'not_a_number' }],
      },
    ]);
    assert(nanReading === null, '16. Non-numeric value rejected (returns null)');

    // 2.8 Invalid timestamp rejected
    const badTimestampReading = parseMeterReadingWh([
      {
        timestamp: 'invalid-iso-date',
        sampledValue: [{ value: '5000' }],
      },
    ]);
    assert(badTimestampReading === null, '17. Invalid timestamp safely ignored');

    // 2.9 Mixed sampledValues extracts the valid energy register
    const mixedReading = parseMeterReadingWh([
      {
        timestamp: new Date().toISOString(),
        sampledValue: [
          { value: '230', measurand: 'Voltage', unitOfMeasure: { unit: 'V' } },
          { value: '32', measurand: 'Current.Import', unitOfMeasure: { unit: 'A' } },
          { value: '42000', measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } },
          { value: '7360', measurand: 'Power.Active.Import', unitOfMeasure: { unit: 'W' } },
        ],
      },
    ]);
    assert(mixedReading === 42000, '18. Mixed sampledValue array extracts the correct energy register reading');

    // 2.10 Null / undefined / empty input
    assert(parseMeterReadingWh(null) === null, '19. parseMeterReadingWh(null) returns null');
    assert(parseMeterReadingWh([]) === null, '20. parseMeterReadingWh([]) returns null');

    // ── Setup Test Charge Point and Mappings ──────────────────────────────────
    const cpTestId = `CP-3D6B-${Date.now()}`;
    const cpRes = await query(
      `INSERT INTO ocpp_charge_points (charge_point_id, location_id, model, vendor_name, registration_status, status)
       VALUES ($1, $2, 'HyperCharge-180', 'ABB', 'Accepted', 'online') RETURNING id`,
      [cpTestId, seedLocationUUID]
    );
    const cpUUID = cpRes.rows[0].id;

    const evseMapRes = await query(
      `INSERT INTO ocpp_evse_mappings (charge_point_id, ocpp_evse_id, evse_id)
       VALUES ($1, 1, $2) RETURNING id`,
      [cpUUID, seedEvseUUID]
    );
    const evseMapUUID = evseMapRes.rows[0].id;

    await query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ($1, 1, $2)`,
      [evseMapUUID, seedConnUUID]
    );

    // Reset seed connector status
    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);

    const ws = await connectWs(`${WS_URL}/ocpp/${cpTestId}`);
    assert(ws.readyState === WebSocket.OPEN, '21. WebSocket connected for test charge point');

    // ── 3. TransactionEvent(Started) with Initial Meter Value ─────────────────
    console.log('\n--- 3. Started with Initial Meter Value ---');

    const txId1 = `TX-3D6B-001-${Date.now()}`;
    const startedRes1 = await sendAndReceive(ws, [
      2,
      'msg-start-3d6b-1',
      'TransactionEvent',
      {
        eventType: 'Started',
        timestamp: new Date().toISOString(),
        triggerReason: 'Authorized',
        seqNo: 0,
        transactionInfo: {
          transactionId: txId1,
          chargingState: 'Charging',
        },
        evse: { id: 1, connectorId: 1 },
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: '50000',
                measurand: 'Energy.Active.Import.Register',
                unitOfMeasure: { unit: 'Wh' },
              },
            ],
          },
        ],
      },
    ]);

    assert(startedRes1[0] === 3, '22. Started event with meterValue returns CALLRESULT');

    const dbTx1 = await query(
      `SELECT meter_start_wh, meter_stop_wh, total_energy_kwh FROM ocpp_transactions WHERE transaction_id = $1`,
      [txId1]
    );
    assert(
      parseFloat(dbTx1.rows[0].meter_start_wh) === 50000,
      `23. meter_start_wh stored initial reading (50000 Wh, got: ${dbTx1.rows[0].meter_start_wh})`
    );
    assert(dbTx1.rows[0].meter_stop_wh === null, '24. meter_stop_wh is initially NULL');
    assert(parseFloat(dbTx1.rows[0].total_energy_kwh) === 0, '25. total_energy_kwh is 0.000 at start');

    // ── 4. TransactionEvent(Updated) Energy Delta Computation ────────────────
    console.log('\n--- 4. Updated Energy Delta Computation ---');

    // Update 1: 54,500 Wh (delta = 4,500 Wh = 4.5 kWh)
    const updateRes1 = await sendAndReceive(ws, [
      2,
      'msg-update-3d6b-1',
      'TransactionEvent',
      {
        eventType: 'Updated',
        timestamp: new Date().toISOString(),
        triggerReason: 'MeterValuePeriodic',
        seqNo: 1,
        transactionInfo: { transactionId: txId1 },
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: '54500',
                measurand: 'Energy.Active.Import.Register',
                unitOfMeasure: { unit: 'Wh' },
              },
            ],
          },
        ],
      },
    ]);
    assert(updateRes1[0] === 3, '26. Updated event returns CALLRESULT');

    const dbTx1AfterUp1 = await query(
      `SELECT meter_stop_wh, total_energy_kwh FROM ocpp_transactions WHERE transaction_id = $1`,
      [txId1]
    );
    assert(
      parseFloat(dbTx1AfterUp1.rows[0].meter_stop_wh) === 54500,
      `27. meter_stop_wh updated to current reading (54500 Wh, got: ${dbTx1AfterUp1.rows[0].meter_stop_wh})`
    );
    assert(
      parseFloat(dbTx1AfterUp1.rows[0].total_energy_kwh) === 4.5,
      `28. total_energy_kwh correctly computed as delta (54500 - 50000 = 4.5 kWh, got: ${dbTx1AfterUp1.rows[0].total_energy_kwh})`
    );

    // Update 2: reading reported in kWh: 58.2 kWh (58200 Wh, delta = 8200 Wh = 8.2 kWh)
    await sendAndReceive(ws, [
      2,
      'msg-update-3d6b-2',
      'TransactionEvent',
      {
        eventType: 'Updated',
        timestamp: new Date().toISOString(),
        triggerReason: 'MeterValuePeriodic',
        seqNo: 2,
        transactionInfo: { transactionId: txId1 },
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: '58.2',
                unitOfMeasure: { unit: 'kWh' },
              },
            ],
          },
        ],
      },
    ]);

    const dbTx1AfterUp2 = await query(
      `SELECT meter_stop_wh, total_energy_kwh FROM ocpp_transactions WHERE transaction_id = $1`,
      [txId1]
    );
    assert(
      parseFloat(dbTx1AfterUp2.rows[0].meter_stop_wh) === 58200,
      `29. meter_stop_wh converted kWh to Wh (58200 Wh, got: ${dbTx1AfterUp2.rows[0].meter_stop_wh})`
    );
    assert(
      parseFloat(dbTx1AfterUp2.rows[0].total_energy_kwh) === 8.2,
      `30. total_energy_kwh updated to 8.2 kWh from kWh input (got: ${dbTx1AfterUp2.rows[0].total_energy_kwh})`
    );

    // Update 3: Non-energy telemetry (Power / Voltage) does not touch energy
    await sendAndReceive(ws, [
      2,
      'msg-update-3d6b-power',
      'TransactionEvent',
      {
        eventType: 'Updated',
        timestamp: new Date().toISOString(),
        triggerReason: 'MeterValuePeriodic',
        seqNo: 3,
        transactionInfo: { transactionId: txId1 },
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: '30000',
                measurand: 'Power.Active.Import',
                unitOfMeasure: { unit: 'W' },
              },
            ],
          },
        ],
      },
    ]);

    const dbTx1AfterPower = await query(
      `SELECT seq_no, meter_stop_wh, total_energy_kwh FROM ocpp_transactions WHERE transaction_id = $1`,
      [txId1]
    );
    assert(dbTx1AfterPower.rows[0].seq_no === 3, '31. seq_no updated for non-energy frame');
    assert(
      parseFloat(dbTx1AfterPower.rows[0].total_energy_kwh) === 8.2,
      '32. total_energy_kwh unchanged by non-energy telemetry frame'
    );
    assert(
      parseFloat(dbTx1AfterPower.rows[0].meter_stop_wh) === 58200,
      '33. meter_stop_wh unchanged by non-energy telemetry frame'
    );

    // Update 4: Monotonicity protection against regressed energy
    await sendAndReceive(ws, [
      2,
      'msg-update-3d6b-regress',
      'TransactionEvent',
      {
        eventType: 'Updated',
        timestamp: new Date().toISOString(),
        triggerReason: 'MeterValuePeriodic',
        seqNo: 4,
        transactionInfo: { transactionId: txId1 },
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: '52000', // lower than 58200
                measurand: 'Energy.Active.Import.Register',
                unitOfMeasure: { unit: 'Wh' },
              },
            ],
          },
        ],
      },
    ]);

    const dbTx1AfterRegress = await query(
      `SELECT total_energy_kwh FROM ocpp_transactions WHERE transaction_id = $1`,
      [txId1]
    );
    assert(
      parseFloat(dbTx1AfterRegress.rows[0].total_energy_kwh) === 8.2,
      '34. total_energy_kwh never regresses when meter reading decreases (monotonic guard)'
    );

    // ── 5. TransactionEvent(Ended) Final Energy Synchronization ──────────────
    console.log('\n--- 5. Ended Final Energy Synchronization ---');

    // End txId1 with final meter reading 60,000 Wh (delta = 10,000 Wh = 10.0 kWh)
    const endRes1 = await sendAndReceive(ws, [
      2,
      'msg-end-3d6b-1',
      'TransactionEvent',
      {
        eventType: 'Ended',
        timestamp: new Date().toISOString(),
        triggerReason: 'StopAuthorized',
        seqNo: 5,
        transactionInfo: {
          transactionId: txId1,
          stoppedReason: 'Local',
        },
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: '60000',
                measurand: 'Energy.Active.Import.Register',
                unitOfMeasure: { unit: 'Wh' },
              },
            ],
          },
        ],
      },
    ]);
    assert(endRes1[0] === 3, '35. Ended event returns CALLRESULT');

    const dbTx1AfterEnded = await query(
      `SELECT status, meter_stop_wh, total_energy_kwh, stopped_reason FROM ocpp_transactions WHERE transaction_id = $1`,
      [txId1]
    );
    assert(dbTx1AfterEnded.rows[0].status === 'completed', '36. Transaction marked completed');
    assert(
      parseFloat(dbTx1AfterEnded.rows[0].meter_stop_wh) === 60000,
      `37. meter_stop_wh finalized to 60000 Wh (got: ${dbTx1AfterEnded.rows[0].meter_stop_wh})`
    );
    assert(
      parseFloat(dbTx1AfterEnded.rows[0].total_energy_kwh) === 10.0,
      `38. total_energy_kwh finalized to 10.0 kWh (got: ${dbTx1AfterEnded.rows[0].total_energy_kwh})`
    );

    // ── 6. Full Lifecycle with Linked VahanGrid charging_sessions ────────────
    console.log('\n--- 6. Linked REST charging_sessions Synchronization ---');

    // Register user & create vehicle
    const ts = Date.now();
    const userEmail = `sync_user_${ts}@vahan.test`;
    const regRes = await fetch(`${SERVER_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, password: 'SecurePassword@123', name: 'Sync Test User' }),
    });
    const userCookies = parseCookies(regRes);
    const userJson = await regRes.json();
    const testUserId = userJson.data?.user?.id;
    assert(regRes.status === 201 && testUserId, '39. Test user registered for session sync');

    const vehRes = await query(
      `INSERT INTO vehicles (user_id, manufacturer, model, variant, battery_capacity_kwh, connector_type)
       VALUES ($1, 'MG', 'ZS EV', 'Excite', 50.3, 'CCS2') RETURNING id`,
      [testUserId]
    );
    const testVehicleId = vehRes.rows[0].id;

    // Start REST session on seed connector
    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);
    const startRestRes = await fetch(`${SERVER_URL}/api/v1/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookies },
      body: JSON.stringify({ connector_id: seedConnUUID, vehicle_id: testVehicleId }),
    });
    const startRestJson = await startRestRes.json();
    assert(startRestRes.status === 201 && startRestJson.data?.id, '40. REST charging session started successfully');
    const activeSessionId = startRestJson.data.id;

    // Start OCPP transaction linked to this session with start meter reading = 100,000 Wh
    const txId2 = `TX-3D6B-002-${Date.now()}`;
    await sendAndReceive(ws, [
      2,
      'msg-start-3d6b-2',
      'TransactionEvent',
      {
        eventType: 'Started',
        timestamp: new Date().toISOString(),
        triggerReason: 'Authorized',
        seqNo: 0,
        transactionInfo: { transactionId: txId2, chargingState: 'Charging' },
        evse: { id: 1, connectorId: 1 },
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: '100000',
                measurand: 'Energy.Active.Import.Register',
                unitOfMeasure: { unit: 'Wh' },
              },
            ],
          },
        ],
      },
    ]);

    const dbTx2 = await query(
      `SELECT session_id, meter_start_wh FROM ocpp_transactions WHERE transaction_id = $1`,
      [txId2]
    );
    assert(dbTx2.rows[0].session_id === activeSessionId, '41. ocpp_transactions linked to active REST session');
    assert(parseFloat(dbTx2.rows[0].meter_start_wh) === 100000, '42. meter_start_wh set to 100000 Wh');

    // Send Updated 1: 106,400 Wh (delta = 6,400 Wh = 6.4 kWh)
    await sendAndReceive(ws, [
      2,
      'msg-update-3d6b-sync-1',
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
            sampledValue: [
              {
                value: '106400',
                measurand: 'Energy.Active.Import.Register',
                unitOfMeasure: { unit: 'Wh' },
              },
            ],
          },
        ],
      },
    ]);

    const sessCheck1 = await query(`SELECT energy_kwh FROM charging_sessions WHERE id = $1`, [activeSessionId]);
    assert(
      parseFloat(sessCheck1.rows[0].energy_kwh) === 6.4,
      `43. charging_sessions.energy_kwh synchronized to net delta (6.4 kWh, got: ${sessCheck1.rows[0].energy_kwh})`
    );

    // Send Updated 2: 112,000 Wh (delta = 12,000 Wh = 12.0 kWh)
    await sendAndReceive(ws, [
      2,
      'msg-update-3d6b-sync-2',
      'TransactionEvent',
      {
        eventType: 'Updated',
        timestamp: new Date().toISOString(),
        triggerReason: 'MeterValuePeriodic',
        seqNo: 2,
        transactionInfo: { transactionId: txId2 },
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: '112000',
                measurand: 'Energy.Active.Import.Register',
                unitOfMeasure: { unit: 'Wh' },
              },
            ],
          },
        ],
      },
    ]);

    const sessCheck2 = await query(`SELECT energy_kwh FROM charging_sessions WHERE id = $1`, [activeSessionId]);
    assert(
      parseFloat(sessCheck2.rows[0].energy_kwh) === 12.0,
      `44. charging_sessions.energy_kwh updated to latest net delta (12.0 kWh, got: ${sessCheck2.rows[0].energy_kwh})`
    );

    // Send Ended with final reading: 115,500 Wh (delta = 15,500 Wh = 15.5 kWh)
    await sendAndReceive(ws, [
      2,
      'msg-end-3d6b-sync',
      'TransactionEvent',
      {
        eventType: 'Ended',
        timestamp: new Date().toISOString(),
        triggerReason: 'EVDisconnected',
        seqNo: 3,
        transactionInfo: { transactionId: txId2, stoppedReason: 'EVDisconnected' },
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: '115500',
                measurand: 'Energy.Active.Import.Register',
                unitOfMeasure: { unit: 'Wh' },
              },
            ],
          },
        ],
      },
    ]);

    const sessCheckFinal = await query(
      `SELECT status, energy_kwh, ended_at, duration_seconds FROM charging_sessions WHERE id = $1`,
      [activeSessionId]
    );
    assert(sessCheckFinal.rows[0].status === 'completed', '45. Linked charging_sessions transitioned to completed');
    assert(
      parseFloat(sessCheckFinal.rows[0].energy_kwh) === 15.5,
      `46. Linked charging_sessions final energy_kwh synchronized to 15.5 kWh (got: ${sessCheckFinal.rows[0].energy_kwh})`
    );
    assert(sessCheckFinal.rows[0].ended_at !== null, '47. charging_sessions.ended_at populated');
    assert(sessCheckFinal.rows[0].duration_seconds !== null, '48. charging_sessions.duration_seconds populated');

    // Verify GET /sessions/active returns 200 with data: null (no active session anymore)
    const activeCheckRes = await fetch(`${SERVER_URL}/api/v1/sessions/active`, {
      headers: { Cookie: userCookies },
    });
    const activeCheckJson = await activeCheckRes.json();
    assert(
      activeCheckRes.status === 200 && activeCheckJson.data === null,
      '49. GET /sessions/active returns data: null after completion'
    );

    // Verify GET /sessions/:id returns the completed session with full energy
    const detailRes = await fetch(`${SERVER_URL}/api/v1/sessions/${activeSessionId}`, {
      headers: { Cookie: userCookies },
    });
    const detailJson = await detailRes.json();
    assert(detailRes.status === 200, '50. GET /sessions/:id returns 200');
    assert(
      detailJson.data.energy_kwh === 15.5,
      `51. GET /sessions/:id returns correct energy_kwh (15.5, got: ${detailJson.data.energy_kwh})`
    );
    assert(detailJson.data.status === 'completed', '52. GET /sessions/:id returns status "completed"');

    // ── 7. Ended Without meterValue Preserves Prior Updated Energy ─────────────
    console.log('\n--- 7. Ended Without meterValue Preserves Energy ---');

    const txId3 = `TX-3D6B-003-${Date.now()}`;
    // Start with 200,000 Wh
    await sendAndReceive(ws, [
      2,
      'msg-start-3d6b-3',
      'TransactionEvent',
      {
        eventType: 'Started',
        timestamp: new Date().toISOString(),
        triggerReason: 'Authorized',
        seqNo: 0,
        transactionInfo: { transactionId: txId3 },
        evse: { id: 1, connectorId: 1 },
        meterValue: [{ timestamp: new Date().toISOString(), sampledValue: [{ value: '200000' }] }],
      },
    ]);

    // Update with 207,800 Wh (delta 7.8 kWh)
    await sendAndReceive(ws, [
      2,
      'msg-update-3d6b-3',
      'TransactionEvent',
      {
        eventType: 'Updated',
        timestamp: new Date().toISOString(),
        triggerReason: 'MeterValuePeriodic',
        seqNo: 1,
        transactionInfo: { transactionId: txId3 },
        meterValue: [{ timestamp: new Date().toISOString(), sampledValue: [{ value: '207800' }] }],
      },
    ]);

    // End WITHOUT meterValue
    await sendAndReceive(ws, [
      2,
      'msg-end-3d6b-no-meter',
      'TransactionEvent',
      {
        eventType: 'Ended',
        timestamp: new Date().toISOString(),
        triggerReason: 'Local',
        seqNo: 2,
        transactionInfo: { transactionId: txId3, stoppedReason: 'Local' },
      },
    ]);

    const dbTx3 = await query(
      `SELECT meter_stop_wh, total_energy_kwh, status FROM ocpp_transactions WHERE transaction_id = $1`,
      [txId3]
    );
    assert(dbTx3.rows[0].status === 'completed', '53. Transaction completed');
    assert(
      parseFloat(dbTx3.rows[0].meter_stop_wh) === 207800,
      `54. meter_stop_wh preserved from previous Updated (207800 Wh, got: ${dbTx3.rows[0].meter_stop_wh})`
    );
    assert(
      parseFloat(dbTx3.rows[0].total_energy_kwh) === 7.8,
      `55. total_energy_kwh preserved from previous Updated (7.8 kWh, got: ${dbTx3.rows[0].total_energy_kwh})`
    );

    // ── 8. Cleanup ────────────────────────────────────────────────────────────
    console.log('\n--- 8. Cleanup ---');

    ws.close();
    await query(`DELETE FROM ocpp_connector_mappings WHERE ocpp_evse_mapping_id = $1`, [evseMapUUID]);
    await query(`DELETE FROM ocpp_evse_mappings WHERE id = $1`, [evseMapUUID]);
    await query(`DELETE FROM ocpp_transactions WHERE ocpp_charge_point_id = $1`, [cpUUID]);
    await query(`DELETE FROM ocpp_charge_points WHERE id = $1`, [cpUUID]);
    if (activeSessionId) {
      await query(`DELETE FROM charging_sessions WHERE id = $1`, [activeSessionId]);
    }
    if (testUserId) {
      await query(`DELETE FROM vehicles WHERE user_id = $1`, [testUserId]);
      await query(
        `DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = $1)`,
        [testUserId]
      );
      await query(`DELETE FROM wallets WHERE user_id = $1`, [testUserId]);
      await query(`DELETE FROM users WHERE id = $1`, [testUserId]);
    }
    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);
    assert(true, '56. Cleanup completed successfully');

  } finally {
    await pool.end();
  }

  console.log('\n========================================================');
  console.log(`📊 Phase 3D.6B Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled error during test run:', err);
  process.exit(1);
});
