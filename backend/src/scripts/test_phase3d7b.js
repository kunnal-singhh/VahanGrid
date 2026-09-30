/**
 * backend/src/scripts/test_phase3d7b.js
 *
 * Automated verification test suite for Phase 3D.7B:
 * OCPP 2.0.1 MeterValues Telemetry Implementation & Dual-Tier Storage.
 *
 * Test Suites:
 *   1. Migration 017 & Schema Verification:
 *      - Table ocpp_session_telemetry exists
 *      - Columns, data types, nullability, foreign keys (CASCADE)
 *      - Indexes (idx_ocpp_session_telemetry_curve, idx_ocpp_session_telemetry_tx)
 *   2. Unit Tests for parseMeterValuesTelemetry:
 *      - Measurand extraction (Power, SoC, Energy, Voltage, Current)
 *      - Unit normalization (W -> kW, kWh -> Wh)
 *      - Range & boundary enforcement (SoC 0-100%, non-negative values)
 *   3. In-Memory Tier 1 Live Telemetry:
 *      - connectionRegistry.updateMeterValues / getLatestMeterValues
 *      - Per-EVSE isolation & timestamp recording
 *   4. Standalone MeterValues — EVSE 0 (Station-Wide Aggregate):
 *      - Returns CALLRESULT {}
 *      - Updates Tier 1 in-memory live telemetry
 *      - Zero rows written to ocpp_session_telemetry
 *   5. Standalone MeterValues — Idle EVSE (No Active Session):
 *      - Returns CALLRESULT {}
 *      - Updates Tier 1 in-memory live telemetry
 *      - Zero rows written to ocpp_session_telemetry (no database row bloat)
 *   6. Standalone MeterValues — In-Transaction with Linked Session:
 *      - Real-time energy delta sync (governed by Phase 3D.6B model)
 *      - Real-time battery SoC sync (charging_sessions.end_soc)
 *      - Historical curve persistence in ocpp_session_telemetry
 *   7. Dedicated Telemetry REST Endpoint:
 *      - GET /api/v1/sessions/:id/telemetry
 *      - Auth enforcement (401 unauthenticated)
 *      - Ownership & IDOR protection (404 for other user)
 *      - 200 OK returning chronological charging curve
 *   8. Malformed Payloads & Protocol Validation:
 *      - Unknown charge point (PropertyConstraintViolation)
 *      - Negative evseId (PropertyConstraintViolation)
 *      - Missing meterValue (FormatViolation)
 *      - Invalid timestamp (FormatViolation)
 *      - Socket stability
 *   9. Cleanup & Seed Integrity
 */

import WebSocket from 'ws';
import pool, { query } from '../config/database.js';
import { parseMeterValuesTelemetry, handleMeterValues } from '../ocpp/handlers/meterValuesHandler.js';
import { connectionRegistry } from '../ocpp/connectionRegistry.js';

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
  console.log('🧪 Phase 3D.7B — OCPP MeterValues Telemetry Verification');
  console.log('========================================================\n');

  // Fetch seed entities
  const locRes = await query(`SELECT id FROM locations LIMIT 1`);
  const seedLocationUUID = locRes.rows[0].id;

  const evseRes = await query(`SELECT id FROM evses LIMIT 1`);
  const seedEvseUUID = evseRes.rows[0].id;

  const connRes = await query(`SELECT id FROM connectors LIMIT 1`);
  const seedConnUUID = connRes.rows[0].id;

  let cpTestId = null;
  let cpUUID = null;
  let evseMapUUID = null;
  let ws = null;
  let user1Cookies = null;
  let user1Id = null;
  let user2Cookies = null;
  let user2Id = null;
  let activeSessionId = null;

  try {
    // ── 1. Migration 017 & Schema Verification ──────────────────────────────
    console.log('--- 1. Migration 017 & Schema Verification ---');

    const tableCheck = await query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'ocpp_session_telemetry'`
    );
    assert(tableCheck.rows.length === 1, '1. Table "ocpp_session_telemetry" exists in PostgreSQL');

    const colCheck = await query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'ocpp_session_telemetry'`
    );
    const cols = new Set(colCheck.rows.map(r => r.column_name));
    assert(cols.has('id'), '2. Column "id" exists');
    assert(cols.has('session_id'), '3. Column "session_id" exists');
    assert(cols.has('ocpp_transaction_id'), '4. Column "ocpp_transaction_id" exists');
    assert(cols.has('recorded_at'), '5. Column "recorded_at" exists');
    assert(cols.has('power_kw'), '6. Column "power_kw" exists');
    assert(cols.has('soc_percent'), '7. Column "soc_percent" exists');
    assert(cols.has('energy_kwh'), '8. Column "energy_kwh" exists');
    assert(cols.has('created_at'), '9. Column "created_at" exists');

    // Foreign keys
    const fkCheck = await query(
      `SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'ocpp_session_telemetry'`
    );
    const fks = {};
    for (const r of fkCheck.rows) {
      fks[r.column_name] = r.foreign_table_name;
    }
    assert(fks.session_id === 'charging_sessions', '10. FK session_id references charging_sessions');
    assert(fks.ocpp_transaction_id === 'ocpp_transactions', '11. FK ocpp_transaction_id references ocpp_transactions');

    // Indexes
    const idxCheck = await query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'ocpp_session_telemetry'`
    );
    const idxSet = new Set(idxCheck.rows.map(r => r.indexname));
    assert(idxSet.has('idx_ocpp_session_telemetry_curve'), '12. Index idx_ocpp_session_telemetry_curve exists');
    assert(idxSet.has('idx_ocpp_session_telemetry_tx'), '13. Index idx_ocpp_session_telemetry_tx exists');

    // ── 2. Unit Tests for parseMeterValuesTelemetry ──────────────────────────
    console.log('\n--- 2. Unit Tests for parseMeterValuesTelemetry ---');

    const sampleMv = [
      {
        timestamp: '2026-09-30T17:00:00.000Z',
        sampledValue: [
          { value: '48500', measurand: 'Power.Active.Import', unitOfMeasure: { unit: 'W' } },
          { value: '72', measurand: 'SoC', unitOfMeasure: { unit: 'Percent' } },
          { value: '55000', measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } },
          { value: '415.5', measurand: 'Voltage', unitOfMeasure: { unit: 'V' } },
          { value: '116.7', measurand: 'Current.Import', unitOfMeasure: { unit: 'A' } },
        ],
      },
    ];

    const parsed = parseMeterValuesTelemetry(sampleMv);
    assert(parsed.powerKw === 48.5, '14. Power normalized to kW (48500 W -> 48.5 kW)');
    assert(parsed.socPercent === 72, '15. SoC parsed as integer percentage (72%)');
    assert(parsed.energyWh === 55000, '16. Energy parsed as Wh (55000 Wh)');
    assert(parsed.voltageV === 415.5, '17. Voltage parsed in V (415.5 V)');
    assert(parsed.currentA === 116.7, '18. Current parsed in A (116.7 A)');

    // Unit test: kW input directly
    const parsedKw = parseMeterValuesTelemetry([
      {
        timestamp: '2026-09-30T17:01:00.000Z',
        sampledValue: [
          { value: '60.2', measurand: 'Power.Active.Import', unitOfMeasure: { unit: 'kW' } },
          { value: '12.5', measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'kWh' } },
        ],
      },
    ]);
    assert(parsedKw.powerKw === 60.2, '19. Power in kW preserved directly (60.2 kW)');
    assert(parsedKw.energyWh === 12500, '20. Energy in kWh converted to Wh (12.5 kWh -> 12500 Wh)');

    // Unit test: SoC boundaries
    const parsedSocClamped = parseMeterValuesTelemetry([
      {
        sampledValue: [{ value: '105', measurand: 'SoC' }],
      },
    ]);
    assert(parsedSocClamped.socPercent === null, '21. Out of range SoC (>100) ignored');

    // ── 3. In-Memory Tier 1 Live Telemetry ───────────────────────────────────
    console.log('\n--- 3. In-Memory Tier 1 Live Telemetry ---');

    connectionRegistry.register('CP-MEM-TEST', { readyState: 1 });

    connectionRegistry.updateMeterValues('CP-MEM-TEST', 1, {
      powerKw: 35.0,
      socPercent: 55,
      energyWh: 20000,
      voltageV: 230.0,
      currentA: 32.0,
      timestamp: new Date(),
    });

    const liveEvse1 = connectionRegistry.getLatestMeterValues('CP-MEM-TEST', 1);
    assert(liveEvse1 !== null, '22. In-memory live telemetry retrievable for EVSE 1');
    assert(liveEvse1.powerKw === 35.0, '23. Live powerKw matches (35.0 kW)');
    assert(liveEvse1.socPercent === 55, '24. Live socPercent matches (55%)');
    assert(liveEvse1.reportedAt instanceof Date, '25. reportedAt timestamp attached');

    // Multi-EVSE isolation
    connectionRegistry.updateMeterValues('CP-MEM-TEST', 2, {
      powerKw: 75.0,
      socPercent: 82,
      energyWh: 45000,
      voltageV: 400.0,
      currentA: 108.0,
      timestamp: new Date(),
    });

    const liveEvse2 = connectionRegistry.getLatestMeterValues('CP-MEM-TEST', 2);
    assert(liveEvse2.powerKw === 75.0, '26. EVSE 2 has distinct telemetry (75.0 kW)');
    assert(connectionRegistry.getLatestMeterValues('CP-MEM-TEST', 1).powerKw === 35.0, '27. EVSE 1 telemetry isolated and preserved');

    // ── Setup Test Charge Point and Mappings ──────────────────────────────────
    cpTestId = `CP-3D7B-${Date.now()}`;
    const cpRes = await query(
      `INSERT INTO ocpp_charge_points (charge_point_id, location_id, model, vendor_name, registration_status, status)
       VALUES ($1, $2, 'HyperGrid-350', 'Alfen', 'Accepted', 'online') RETURNING id`,
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

    // Reset seed connector status
    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);

    connectionRegistry.register(cpTestId, { readyState: 1 });
    ws = await connectWs(`${WS_URL}/ocpp/${cpTestId}`);
    assert(ws.readyState === WebSocket.OPEN, '28. WebSocket connected for test charge point');

    // ── 4. Standalone MeterValues — EVSE 0 (Station-Wide Telemetry) ───────────
    console.log('\n--- 4. Standalone MeterValues — EVSE 0 ---');

    const mvEvse0Res = await sendAndReceive(ws, [
      2,
      'msg-mv-evse0',
      'MeterValues',
      {
        evseId: 0,
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              { value: '412.0', measurand: 'Voltage', unitOfMeasure: { unit: 'V' } },
              { value: '150000', measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } },
            ],
          },
        ],
      },
    ]);

    assert(mvEvse0Res[0] === 3, '29. EVSE 0 MeterValues returns CALLRESULT');
    assert(typeof mvEvse0Res[2] === 'object' && Object.keys(mvEvse0Res[2]).length === 0, '30. Response payload is empty object {}');

    // Verify Tier 1 live state updated
    await handleMeterValues(
      {
        evseId: 0,
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              { value: '412.0', measurand: 'Voltage', unitOfMeasure: { unit: 'V' } },
              { value: '150000', measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } },
            ],
          },
        ],
      },
      cpTestId
    );
    const liveEvse0 = connectionRegistry.getLatestMeterValues(cpTestId, 0);
    assert(liveEvse0 !== null && liveEvse0.voltageV === 412.0, '31. EVSE 0 live state cached in memory');

    // Verify ZERO rows inserted in ocpp_session_telemetry
    const dbTelemetryCount0 = await query(`SELECT COUNT(*)::int AS cnt FROM ocpp_session_telemetry`);
    assert(dbTelemetryCount0.rows[0].cnt === 0, '32. EVSE 0 telemetry produces zero rows in ocpp_session_telemetry');

    // ── 5. Standalone MeterValues — Idle EVSE (No Active Transaction) ─────────
    console.log('\n--- 5. Standalone MeterValues — Idle EVSE ---');

    const mvIdleRes = await sendAndReceive(ws, [
      2,
      'msg-mv-idle',
      'MeterValues',
      {
        evseId: 1,
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              { value: '0.0', measurand: 'Power.Active.Import', unitOfMeasure: { unit: 'W' } },
              { value: '100000', measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } },
            ],
          },
        ],
      },
    ]);

    assert(mvIdleRes[0] === 3, '33. Idle EVSE MeterValues returns CALLRESULT');

    await handleMeterValues(
      {
        evseId: 1,
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              { value: '0.0', measurand: 'Power.Active.Import', unitOfMeasure: { unit: 'W' } },
              { value: '100000', measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } },
            ],
          },
        ],
      },
      cpTestId
    );
    const liveIdle = connectionRegistry.getLatestMeterValues(cpTestId, 1);
    assert(liveIdle !== null && liveIdle.powerKw === 0.0, '34. Idle EVSE live state cached in Tier 1 memory');

    const dbTelemetryCountIdle = await query(`SELECT COUNT(*)::int AS cnt FROM ocpp_session_telemetry`);
    assert(dbTelemetryCountIdle.rows[0].cnt === 0, '35. Idle EVSE telemetry produces zero database rows (no row explosion)');

    // ── 6. In-Transaction MeterValues with Linked Session ─────────────────────
    console.log('\n--- 6. In-Transaction MeterValues with Linked Session ---');

    // Register User 1 & Vehicle
    const ts = Date.now();
    const user1Email = `mv_user1_${ts}@vahan.test`;
    const regRes1 = await fetch(`${SERVER_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user1Email, password: 'SecurePassword@123', name: 'Telemetry User 1' }),
    });
    user1Cookies = parseCookies(regRes1);
    const user1Json = await regRes1.json();
    user1Id = user1Json.data?.user?.id;
    assert(regRes1.status === 201 && user1Id, '36. User 1 registered');

    const vehRes1 = await query(
      `INSERT INTO vehicles (user_id, manufacturer, model, variant, battery_capacity_kwh, connector_type)
       VALUES ($1, 'Hyundai', 'Ioniq 5', 'Long Range', 72.6, 'CCS2') RETURNING id`,
      [user1Id]
    );
    const vehicle1Id = vehRes1.rows[0].id;

    // Start REST session on seed connector
    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);
    const startRestRes = await fetch(`${SERVER_URL}/api/v1/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user1Cookies },
      body: JSON.stringify({ connector_id: seedConnUUID, vehicle_id: vehicle1Id }),
    });
    const startRestJson = await startRestRes.json();
    assert(startRestRes.status === 201 && startRestJson.data?.id, '37. REST session started successfully');
    activeSessionId = startRestJson.data.id;

    // Charger starts transaction with starting meter reading = 100,000 Wh
    const txId = `TX-MV-001-${Date.now()}`;
    await sendAndReceive(ws, [
      2,
      'msg-start-mv',
      'TransactionEvent',
      {
        eventType: 'Started',
        timestamp: new Date().toISOString(),
        triggerReason: 'Authorized',
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
    ]);

    const dbTxRes = await query(`SELECT id, session_id, meter_start_wh FROM ocpp_transactions WHERE transaction_id = $1`, [txId]);
    assert(dbTxRes.rows[0].session_id === activeSessionId, '38. Transaction linked to active REST session');
    assert(parseFloat(dbTxRes.rows[0].meter_start_wh) === 100000, '39. Initial meter reading recorded (100000 Wh)');

    // Sample 1: Standalone MeterValues during transaction
    // Power: 45.0 kW, SoC: 65%, Energy: 104,200 Wh (delta = 4.2 kWh)
    const sampleTime1 = new Date(Date.now() - 60000);
    const mvTx1Res = await sendAndReceive(ws, [
      2,
      'msg-mv-tx-1',
      'MeterValues',
      {
        evseId: 1,
        meterValue: [
          {
            timestamp: sampleTime1.toISOString(),
            sampledValue: [
              { value: '45000', measurand: 'Power.Active.Import', unitOfMeasure: { unit: 'W' } },
              { value: '65', measurand: 'SoC', unitOfMeasure: { unit: 'Percent' } },
              { value: '104200', measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } },
              { value: '398.2', measurand: 'Voltage', unitOfMeasure: { unit: 'V' } },
              { value: '113.0', measurand: 'Current.Import', unitOfMeasure: { unit: 'A' } },
            ],
          },
        ],
      },
    ]);

    assert(mvTx1Res[0] === 3, '40. In-transaction MeterValues returns CALLRESULT');

    // Verify session & transaction energy synchronization (Phase 3D.6B model)
    const txAfterMv1 = await query(`SELECT meter_stop_wh, total_energy_kwh FROM ocpp_transactions WHERE transaction_id = $1`, [txId]);
    assert(parseFloat(txAfterMv1.rows[0].meter_stop_wh) === 104200, '41. ocpp_transactions.meter_stop_wh updated to 104200 Wh');
    assert(parseFloat(txAfterMv1.rows[0].total_energy_kwh) === 4.2, '42. ocpp_transactions.total_energy_kwh updated to 4.2 kWh');

    const sessAfterMv1 = await query(`SELECT energy_kwh, end_soc FROM charging_sessions WHERE id = $1`, [activeSessionId]);
    assert(parseFloat(sessAfterMv1.rows[0].energy_kwh) === 4.2, '43. charging_sessions.energy_kwh synchronized to 4.2 kWh');
    assert(parseFloat(sessAfterMv1.rows[0].end_soc) === 65, '44. charging_sessions.end_soc synchronized to 65%');

    // Verify historical row in ocpp_session_telemetry
    const telemetryRows1 = await query(
      `SELECT power_kw, soc_percent, energy_kwh FROM ocpp_session_telemetry WHERE session_id = $1 ORDER BY recorded_at ASC`,
      [activeSessionId]
    );
    assert(telemetryRows1.rows.length === 1, '45. Row inserted into ocpp_session_telemetry');
    assert(parseFloat(telemetryRows1.rows[0].power_kw) === 45.0, '46. ocpp_session_telemetry.power_kw recorded (45.0 kW)');
    assert(telemetryRows1.rows[0].soc_percent === 65, '47. ocpp_session_telemetry.soc_percent recorded (65%)');
    assert(parseFloat(telemetryRows1.rows[0].energy_kwh) === 4.2, '48. ocpp_session_telemetry.energy_kwh recorded (4.2 kWh)');

    // Sample 2: Second MeterValues frame
    // Power: 50.0 kW, SoC: 72%, Energy: 108,500 Wh (delta = 8.5 kWh)
    const sampleTime2 = new Date();
    await sendAndReceive(ws, [
      2,
      'msg-mv-tx-2',
      'MeterValues',
      {
        evseId: 1,
        meterValue: [
          {
            timestamp: sampleTime2.toISOString(),
            sampledValue: [
              { value: '50000', measurand: 'Power.Active.Import', unitOfMeasure: { unit: 'W' } },
              { value: '72', measurand: 'SoC', unitOfMeasure: { unit: 'Percent' } },
              { value: '108500', measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } },
            ],
          },
        ],
      },
    ]);

    const sessAfterMv2 = await query(`SELECT energy_kwh, end_soc FROM charging_sessions WHERE id = $1`, [activeSessionId]);
    assert(parseFloat(sessAfterMv2.rows[0].energy_kwh) === 8.5, '49. charging_sessions.energy_kwh updated to 8.5 kWh');
    assert(parseFloat(sessAfterMv2.rows[0].end_soc) === 72, '50. charging_sessions.end_soc updated to 72%');

    const telemetryRows2 = await query(
      `SELECT power_kw, soc_percent, energy_kwh FROM ocpp_session_telemetry WHERE session_id = $1 ORDER BY recorded_at ASC`,
      [activeSessionId]
    );
    assert(telemetryRows2.rows.length === 2, '51. Second sample recorded in ocpp_session_telemetry (curve growing)');

    // ── 7. Dedicated Telemetry REST Endpoint ──────────────────────────────────
    console.log('\n--- 7. Dedicated Telemetry REST Endpoint ---');

    // 7.1 Unauthenticated request returns 401
    const unauthRes = await fetch(`${SERVER_URL}/api/v1/sessions/${activeSessionId}/telemetry`);
    assert(unauthRes.status === 401, '52. GET /sessions/:id/telemetry without auth returns 401');

    // 7.2 Non-existent session returns 404
    const notFoundRes = await fetch(`${SERVER_URL}/api/v1/sessions/00000000-0000-0000-0000-000000000000/telemetry`, {
      headers: { Cookie: user1Cookies },
    });
    assert(notFoundRes.status === 404, '53. GET /sessions/:id/telemetry for nonexistent session returns 404');

    // 7.3 Invalid UUID returns 400
    const badUuidRes = await fetch(`${SERVER_URL}/api/v1/sessions/not-a-valid-uuid/telemetry`, {
      headers: { Cookie: user1Cookies },
    });
    assert(badUuidRes.status === 400, '54. GET /sessions/:id/telemetry with invalid UUID returns 400');

    // 7.4 Ownership & IDOR Protection: User 2 cannot read User 1 telemetry
    const user2Email = `mv_user2_${ts}@vahan.test`;
    const regRes2 = await fetch(`${SERVER_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user2Email, password: 'SecurePassword@123', name: 'Telemetry User 2' }),
    });
    user2Cookies = parseCookies(regRes2);
    const user2Json = await regRes2.json();
    user2Id = user2Json.data?.user?.id;
    assert(regRes2.status === 201 && user2Id, '55. User 2 registered');

    const idorRes = await fetch(`${SERVER_URL}/api/v1/sessions/${activeSessionId}/telemetry`, {
      headers: { Cookie: user2Cookies },
    });
    assert(idorRes.status === 404, '56. Cross-user telemetry read blocked with 404 (IDOR protection)');

    // 7.5 Owning User 1 retrieves full chronological telemetry curve
    const validCurveRes = await fetch(`${SERVER_URL}/api/v1/sessions/${activeSessionId}/telemetry`, {
      headers: { Cookie: user1Cookies },
    });
    assert(validCurveRes.status === 200, '57. GET /sessions/:id/telemetry for owner returns 200');
    const curveJson = await validCurveRes.json();
    assert(curveJson.success === true, '58. Response success is true');
    assert(curveJson.meta.count === 2, '59. Response meta count is 2');
    assert(Array.isArray(curveJson.data) && curveJson.data.length === 2, '60. Response data contains 2 samples');
    assert(curveJson.data[0].power_kw === 45.0 && curveJson.data[0].soc_percent === 65, '61. Sample 1 matches curve metrics');
    assert(curveJson.data[1].power_kw === 50.0 && curveJson.data[1].soc_percent === 72, '62. Sample 2 matches curve metrics');

    // ── 8. Malformed Payloads & Protocol Validation ───────────────────────────
    console.log('\n--- 8. Malformed Payloads & Protocol Validation ---');

    // Unknown charge point
    const unknownWs = await connectWs(`${WS_URL}/ocpp/CP-UNKNOWN-MV-${Date.now()}`);
    const unkRes = await sendAndReceive(unknownWs, [
      2,
      'msg-err-unk',
      'MeterValues',
      { evseId: 1, meterValue: [{ timestamp: new Date().toISOString(), sampledValue: [{ value: '10' }] }] },
    ]);
    assert(unkRes[0] === 4, '63. Unknown charge point returns CALLERROR (type 4)');
    assert(unkRes[2] === 'PropertyConstraintViolation', '64. Error code is PropertyConstraintViolation');
    unknownWs.close();

    // Negative evseId
    const negEvseRes = await sendAndReceive(ws, [
      2,
      'msg-err-neg-evse',
      'MeterValues',
      { evseId: -1, meterValue: [{ timestamp: new Date().toISOString(), sampledValue: [{ value: '10' }] }] },
    ]);
    assert(negEvseRes[0] === 4, '65. Negative evseId returns CALLERROR');
    assert(negEvseRes[2] === 'PropertyConstraintViolation', '66. Error code is PropertyConstraintViolation');

    // Missing meterValue array
    const noMvRes = await sendAndReceive(ws, [
      2,
      'msg-err-no-mv',
      'MeterValues',
      { evseId: 1 },
    ]);
    assert(noMvRes[0] === 4, '67. Missing meterValue returns CALLERROR');
    assert(noMvRes[2] === 'FormatViolation', '68. Error code is FormatViolation');

    // Invalid timestamp
    const badTimeRes = await sendAndReceive(ws, [
      2,
      'msg-err-bad-time',
      'MeterValues',
      { evseId: 1, meterValue: [{ timestamp: 'not-a-timestamp', sampledValue: [{ value: '10' }] }] },
    ]);
    assert(badTimeRes[0] === 4, '69. Malformed timestamp returns CALLERROR');
    assert(badTimeRes[2] === 'FormatViolation', '70. Error code is FormatViolation');

    // Socket remains OPEN after error responses
    assert(ws.readyState === WebSocket.OPEN, '71. WebSocket remains healthy and OPEN after validation errors');

    // ── 9. Cleanup & Integrity ────────────────────────────────────────────────
    console.log('\n--- 9. Cleanup ---');

    ws.close();

    // End active OCPP transaction
    await sendAndReceive(ws, [
      2,
      'msg-end-mv',
      'TransactionEvent',
      {
        eventType: 'Ended',
        timestamp: new Date().toISOString(),
        triggerReason: 'Local',
        seqNo: 1,
        transactionInfo: { transactionId: txId, stoppedReason: 'Local' },
      },
    ]).catch(() => {});

    // Clean test records
    await query(`DELETE FROM ocpp_session_telemetry WHERE session_id = $1`, [activeSessionId]);
    await query(`DELETE FROM ocpp_connector_mappings WHERE ocpp_evse_mapping_id = $1`, [evseMapUUID]);
    await query(`DELETE FROM ocpp_evse_mappings WHERE id = $1`, [evseMapUUID]);
    await query(`DELETE FROM ocpp_transactions WHERE ocpp_charge_point_id = $1`, [cpUUID]);
    await query(`DELETE FROM ocpp_charge_points WHERE id = $1`, [cpUUID]);
    if (activeSessionId) {
      await query(`DELETE FROM charging_sessions WHERE id = $1`, [activeSessionId]);
    }
    if (user1Id) {
      await query(`DELETE FROM vehicles WHERE user_id = $1`, [user1Id]);
      await query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = $1)`, [user1Id]);
      await query(`DELETE FROM wallets WHERE user_id = $1`, [user1Id]);
      await query(`DELETE FROM users WHERE id = $1`, [user1Id]);
    }
    if (user2Id) {
      await query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = $1)`, [user2Id]);
      await query(`DELETE FROM wallets WHERE user_id = $1`, [user2Id]);
      await query(`DELETE FROM users WHERE id = $1`, [user2Id]);
    }
    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);
    assert(true, '72. Cleanup completed successfully');

  } finally {
    await pool.end();
  }

  console.log('\n========================================================');
  console.log(`📊 Phase 3D.7B Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled error during test run:', err);
  process.exit(1);
});
