/**
 * backend/src/scripts/test_phase3e2.js
 *
 * Phase 3E.2 - Charge Detail Record (CDR) Test Suite
 *
 * Tests:
 *  A. CDR creation from REST stop (completed/stopped sessions)
 *  B. Energy accuracy
 *  C. Pricing accuracy and tariff snapshot immutability
 *  D. Idempotency (duplicate finalization)
 *  E. Failure cases (failed/cancelled sessions, missing data)
 *  F. REST API (list, get by id, get by session, auth, cross-user)
 *
 * Run: node backend/src/scripts/test_phase3e2.js
 */

import pool, { query } from '../config/database.js';
import { finalizeCdr, getCdrBySessionId, getCdrById, listCdrsByUser } from '../services/cdrService.js';
import { calculatePrice } from '../services/pricingService.js';

let passed = 0;
let failed = 0;
const errors = [];

function assert(label, condition, details) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}${details ? ' -- ' + details : ''}`);
    failed++;
    errors.push(label);
  }
}

function assertClose(label, actual, expected, tolerance) {
  tolerance = tolerance || 0.005;
  const ok = Math.abs(Number(actual) - Number(expected)) <= tolerance;
  assert(label, ok, `expected ${expected}, got ${actual}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  console.log('  ' + title);
  console.log('='.repeat(60));
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function getSeededUser() {
  const r = await query("SELECT id, email FROM users WHERE email = 'priya.sharma@example.com' LIMIT 1");
  if (r.rows.length === 0) throw new Error('Seeded user priya.sharma@example.com not found');
  return r.rows[0];
}

async function getSeededUser2() {
  const r = await query("SELECT id, email FROM users WHERE email = 'rahul.verma@example.com' LIMIT 1");
  if (r.rows.length === 0) throw new Error('Seeded user rahul.verma@example.com not found');
  return r.rows[0];
}

async function getSeededConnector() {
  const r = await query(`
    SELECT cn.id AS connector_id, e.id AS evse_id, l.id AS location_id, l.cpo_id
    FROM connectors cn
    JOIN evses e ON cn.evse_id = e.id
    JOIN locations l ON e.location_id = l.id
    LIMIT 1
  `);
  if (r.rows.length === 0) throw new Error('No connector found');
  return r.rows[0];
}

async function getSeededVehicle(userId) {
  const r = await query("SELECT id FROM vehicles WHERE user_id = $1 LIMIT 1", [userId]);
  return r.rows[0] || null;
}

/**
 * Creates a session directly in the DB at the given terminal status.
 */
async function createTestSession(userId, connectorId, status, opts) {
  opts = opts || {};
  const tariffSnapshot = opts.tariffSnapshot || {
    tariff_id: 'e0000001-0000-0000-0000-000000000001',
    name: 'Test Tariff',
    currency: 'INR',
    price_per_kwh: 18.5,
    session_fee: 10.0,
    price_per_minute: 0,
    idle_fee_per_minute: 1.0,
    grace_period_minutes: 15,
    tax_rate: 0.18,
    snapshotted_at: new Date().toISOString(),
  };

  const energyKwh  = opts.energy_kwh  !== undefined ? opts.energy_kwh  : 15.5;
  const durationS  = opts.duration    !== undefined ? opts.duration    : 3600;
  const startedAt  = opts.started_at  || new Date(Date.now() - durationS * 1000);
  const endedAt    = opts.ended_at    || (status !== 'active' && status !== 'pending' ? new Date() : null);
  const tariffId   = opts.tariff_id   || null;
  const noTariff   = opts.no_tariff   || false;

  // Compute cost if pricing applies
  let costAmount = 0;
  let pricingBreakdown = null;
  if (!noTariff && tariffSnapshot && endedAt && (status === 'stopped' || status === 'completed')) {
    const bd = calculatePrice(tariffSnapshot, {
      energy_kwh: energyKwh,
      duration_seconds: durationS,
      idle_seconds: 0,
    });
    costAmount = bd.total_cost;
    pricingBreakdown = bd;
  }

  const r = await query(
    `INSERT INTO charging_sessions
       (user_id, vehicle_id, connector_id, status, started_at, ended_at,
        duration_seconds, energy_kwh, cost_amount, tariff_id, tariff_snapshot, pricing_breakdown)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      userId,
      opts.vehicle_id || null,
      connectorId,
      status,
      startedAt,
      endedAt,
      durationS,
      energyKwh,
      costAmount,
      noTariff ? null : (tariffId || 'e0000001-0000-0000-0000-000000000001'),
      noTariff ? null : JSON.stringify(tariffSnapshot),
      pricingBreakdown ? JSON.stringify(pricingBreakdown) : null,
    ]
  );
  return r.rows[0].id;
}

async function cleanupSession(sessionId) {
  await query('DELETE FROM cdrs WHERE session_id = $1', [sessionId]);
  await query('DELETE FROM charging_sessions WHERE id = $1', [sessionId]);
}

// ---------------------------------------------------------------------------
// A. CDR Creation
// ---------------------------------------------------------------------------

async function testCdrCreation() {
  section('A. CDR Creation');

  const user1 = await getSeededUser();
  const conn  = await getSeededConnector();

  // A1: completed session creates CDR
  const sessId1 = await createTestSession(user1.id, conn.connector_id, 'completed');
  const cdr1 = await finalizeCdr(sessId1);
  assert('A1: completed session -> CDR created', !!cdr1 && !!cdr1.id);
  assert('A1: CDR.session_id matches', cdr1 && cdr1.session_id === sessId1);
  assert('A1: CDR.user_id matches', cdr1 && cdr1.user_id === user1.id);
  assert('A1: CDR.status = finalized', cdr1 && cdr1.status === 'finalized');
  assert('A1: CDR.session_status = completed', cdr1 && cdr1.session_status === 'completed');
  assert('A1: CDR.connector_id set', cdr1 && cdr1.connector_id === conn.connector_id);
  assert('A1: CDR.location_id set', cdr1 && !!cdr1.location_id);
  assert('A1: CDR.cpo_id set', cdr1 && !!cdr1.cpo_id);
  assert('A1: CDR.location_name set', cdr1 && typeof cdr1.location_name === 'string' && cdr1.location_name.length > 0);
  assert('A1: CDR.cpo_name set', cdr1 && typeof cdr1.cpo_name === 'string' && cdr1.cpo_name.length > 0);

  // A2: stopped session creates CDR
  const sessId2 = await createTestSession(user1.id, conn.connector_id, 'stopped');
  const cdr2 = await finalizeCdr(sessId2);
  assert('A2: stopped session -> CDR created', !!cdr2 && !!cdr2.id);
  assert('A2: CDR.session_status = stopped', cdr2 && cdr2.session_status === 'stopped');

  // A3: started_at / ended_at timestamps correct
  assert('A3: CDR.started_at set', cdr1 && !!cdr1.started_at);
  assert('A3: CDR.ended_at set', cdr1 && !!cdr1.ended_at);
  assert('A3: ended_at >= started_at', cdr1 && new Date(cdr1.ended_at) >= new Date(cdr1.started_at));

  // Cleanup
  await cleanupSession(sessId1);
  await cleanupSession(sessId2);
}

// ---------------------------------------------------------------------------
// B. Energy
// ---------------------------------------------------------------------------

async function testEnergy() {
  section('B. Energy Accuracy');

  const user1 = await getSeededUser();
  const conn  = await getSeededConnector();

  // B1: Specific energy value preserved
  const sessId = await createTestSession(user1.id, conn.connector_id, 'completed', { energy_kwh: 23.750, duration: 7200 });
  const cdr = await finalizeCdr(sessId);
  assertClose('B1: energy_kwh = 23.750', cdr && cdr.energy_kwh, 23.750);

  // B2: Zero-energy session still creates CDR
  const sessId0 = await createTestSession(user1.id, conn.connector_id, 'completed', { energy_kwh: 0, duration: 60 });
  const cdr0 = await finalizeCdr(sessId0);
  assert('B2: zero-energy CDR created', !!cdr0 && !!cdr0.id);
  assertClose('B2: zero-energy CDR energy_kwh = 0', cdr0 && cdr0.energy_kwh, 0);

  // B3: duration_seconds preserved
  assert('B3: duration_seconds = 7200', cdr && Number(cdr.duration_seconds) === 7200);

  await cleanupSession(sessId);
  await cleanupSession(sessId0);
}

// ---------------------------------------------------------------------------
// C. Pricing and Snapshot Immutability
// ---------------------------------------------------------------------------

async function testPricingAndImmutability() {
  section('C. Pricing & Tariff Snapshot Immutability');

  const user1 = await getSeededUser();
  const conn  = await getSeededConnector();

  // Known tariff values
  const snap = {
    tariff_id: 'e0000001-0000-0000-0000-000000000001',
    name: 'Test Immutability Tariff',
    currency: 'INR',
    price_per_kwh: 18.5,
    session_fee: 10.0,
    price_per_minute: 0,
    idle_fee_per_minute: 0,
    grace_period_minutes: 0,
    tax_rate: 0.18,
  };

  // energy: 20 kWh x 18.5 = 370 + session_fee 10 = 380 subtotal
  // tax: 380 x 0.18 = 68.40 → total: 448.40
  const sessId = await createTestSession(user1.id, conn.connector_id, 'stopped', {
    tariffSnapshot: snap,
    energy_kwh: 20,
    duration: 0,
  });
  const cdr = await finalizeCdr(sessId);

  assert('C1: CDR created with pricing', !!cdr && !!cdr.id);
  assertClose('C2: energy_cost = 370.00', cdr && cdr.energy_cost, 370.00);
  assertClose('C3: session_fee = 10.00', cdr && cdr.session_fee, 10.00);
  assertClose('C4: subtotal = 380.00', cdr && cdr.subtotal, 380.00);
  assertClose('C5: tax_amount = 68.40', cdr && cdr.tax_amount, 68.40);
  assertClose('C6: total_amount = 448.40', cdr && cdr.total_amount, 448.40);
  assert('C7: currency = INR', cdr && cdr.currency === 'INR');
  assert('C8: tariff_snapshot stored', cdr && !!cdr.tariff_snapshot);

  // C9: Immutability — update tariff in DB, verify CDR does not change
  await query(
    "UPDATE tariffs SET price_per_kwh = 999.00 WHERE id = 'e0000001-0000-0000-0000-000000000001'"
  );
  const cdrAfter = await getCdrBySessionId(sessId);
  assertClose('C9: CDR total_amount unchanged after tariff edit', cdrAfter && cdrAfter.total_amount, 448.40);
  assert('C10: CDR tariff_snapshot.price_per_kwh unchanged', 
    cdrAfter && cdrAfter.tariff_snapshot && Number(cdrAfter.tariff_snapshot.price_per_kwh) === 18.5
  );

  // Restore tariff
  await query("UPDATE tariffs SET price_per_kwh = 18.5000 WHERE id = 'e0000001-0000-0000-0000-000000000001'");

  await cleanupSession(sessId);
}

// ---------------------------------------------------------------------------
// D. Idempotency
// ---------------------------------------------------------------------------

async function testIdempotency() {
  section('D. Idempotency');

  const user1 = await getSeededUser();
  const conn  = await getSeededConnector();

  const sessId = await createTestSession(user1.id, conn.connector_id, 'completed');

  // D1: First finalization
  const cdr1 = await finalizeCdr(sessId);
  assert('D1: first finalizeCdr creates CDR', !!cdr1 && !!cdr1.id);

  // D2: Second finalization returns same CDR (no duplicate)
  const cdr2 = await finalizeCdr(sessId);
  assert('D2: second finalizeCdr returns same CDR', !!cdr2 && cdr2.id === cdr1.id);

  // D3: Third concurrent call also returns same CDR
  const [cdr3a, cdr3b] = await Promise.all([finalizeCdr(sessId), finalizeCdr(sessId)]);
  assert('D3: concurrent calls both return same CDR id', 
    cdr3a && cdr3b && cdr3a.id === cdr1.id && cdr3b.id === cdr1.id
  );

  // D4: Exactly one CDR in DB
  const dbCount = await query('SELECT COUNT(*) FROM cdrs WHERE session_id = $1', [sessId]);
  assert('D4: exactly 1 CDR in DB after multiple finalize calls', Number(dbCount.rows[0].count) === 1);

  await cleanupSession(sessId);
}

// ---------------------------------------------------------------------------
// E. Failure Cases
// ---------------------------------------------------------------------------

async function testFailureCases() {
  section('E. Failure Cases');

  const user1 = await getSeededUser();
  const conn  = await getSeededConnector();

  // E1: Failed session -> no CDR
  const failedId = await createTestSession(user1.id, conn.connector_id, 'failed');
  const cdrFailed = await finalizeCdr(failedId);
  assert('E1: failed session -> no CDR (returns null)', cdrFailed === null);
  await cleanupSession(failedId);

  // E2: Cancelled session -> no CDR
  const cancelledId = await createTestSession(user1.id, conn.connector_id, 'cancelled');
  const cdrCancelled = await finalizeCdr(cancelledId);
  assert('E2: cancelled session -> no CDR (returns null)', cdrCancelled === null);
  await cleanupSession(cancelledId);

  // E3: Active session -> no CDR
  const activeId = await createTestSession(user1.id, conn.connector_id, 'active');
  const cdrActive = await finalizeCdr(activeId);
  assert('E3: active session -> no CDR (returns null)', cdrActive === null);
  await cleanupSession(activeId);

  // E4: Non-existent session ID -> null
  const cdrNone = await finalizeCdr('00000000-0000-0000-0000-000000000000');
  assert('E4: non-existent session -> null', cdrNone === null);

  // E5: Invalid UUID -> null
  const cdrBad = await finalizeCdr('not-a-valid-uuid');
  assert('E5: invalid UUID -> null', cdrBad === null);

  // E6: No tariff snapshot -> CDR created with zero pricing
  const noTariffId = await createTestSession(user1.id, conn.connector_id, 'completed', {
    no_tariff: true,
    energy_kwh: 5,
  });
  const cdrNoTariff = await finalizeCdr(noTariffId);
  assert('E6: no tariff -> CDR created (zero pricing)', !!cdrNoTariff && !!cdrNoTariff.id);
  assertClose('E6: no tariff -> total_amount = 0', cdrNoTariff && cdrNoTariff.total_amount, 0);
  await cleanupSession(noTariffId);

  // E7: Session with no ended_at -> no CDR
  const noEndId = await query(
    `INSERT INTO charging_sessions (user_id, connector_id, status, tariff_snapshot)
     VALUES ($1, $2, 'completed', NULL) RETURNING id`,
    [user1.id, conn.connector_id]
  );
  const noEndSessionId = noEndId.rows[0].id;
  const cdrNoEnd = await finalizeCdr(noEndSessionId);
  assert('E7: no ended_at -> no CDR (returns null)', cdrNoEnd === null);
  await query('DELETE FROM charging_sessions WHERE id = $1', [noEndSessionId]);
}

// ---------------------------------------------------------------------------
// F. Service Read Functions
// ---------------------------------------------------------------------------

async function testServiceReads() {
  section('F. Service Read Functions');

  const user1 = await getSeededUser();
  const user2 = await getSeededUser2();
  const conn  = await getSeededConnector();

  // Create a CDR for user1
  const sessId = await createTestSession(user1.id, conn.connector_id, 'completed');
  const cdr = await finalizeCdr(sessId);
  assert('F0: CDR created for read tests', !!cdr && !!cdr.id);

  // F1: getCdrBySessionId — own session, no userId
  const bySession = await getCdrBySessionId(sessId);
  assert('F1: getCdrBySessionId returns CDR', !!bySession && bySession.session_id === sessId);

  // F2: getCdrBySessionId — own session, with matching userId
  const bySessionOwn = await getCdrBySessionId(sessId, user1.id);
  assert('F2: getCdrBySessionId with own userId returns CDR', !!bySessionOwn);

  // F3: getCdrBySessionId — cross-user access throws 403
  let crossErr = null;
  try { await getCdrBySessionId(sessId, user2.id); } catch(e) { crossErr = e; }
  assert('F3: getCdrBySessionId cross-user throws 403', crossErr && crossErr.statusCode === 403);

  // F4: getCdrById — valid
  const byId = await getCdrById(cdr.id);
  assert('F4: getCdrById returns CDR', !!byId && byId.id === cdr.id);

  // F5: getCdrById — wrong user throws 403
  let idErr = null;
  try { await getCdrById(cdr.id, user2.id); } catch(e) { idErr = e; }
  assert('F5: getCdrById cross-user throws 403', idErr && idErr.statusCode === 403);

  // F6: getCdrById — non-existent returns null
  const none = await getCdrById('00000000-0000-0000-0000-000000000000');
  assert('F6: getCdrById non-existent returns null', none === null);

  // F7: getCdrById — invalid UUID throws 400
  let badIdErr = null;
  try { await getCdrById('not-a-uuid'); } catch(e) { badIdErr = e; }
  assert('F7: getCdrById invalid UUID throws 400', badIdErr && badIdErr.statusCode === 400);

  // F8: listCdrsByUser — returns array with CDR
  const list = await listCdrsByUser(user1.id);
  assert('F8: listCdrsByUser returns array', Array.isArray(list));
  assert('F8: listCdrsByUser includes created CDR', list.some(c => c.session_id === sessId));

  await cleanupSession(sessId);
}

// ---------------------------------------------------------------------------
// G. REST API
// ---------------------------------------------------------------------------

async function testRestApi() {
  section('G. REST API Endpoints');

  const BASE = 'http://localhost:3001/api/v1';
  const conn = await getSeededConnector();

  class HttpClient {
    constructor() {
      this.cookies = {};
    }
    setCookiesFromResponse(res) {
      const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
      for (const c of raw) {
        if (!c) continue;
        const [nameVal] = c.split(';');
        const eq = nameVal.indexOf('=');
        if (eq !== -1) {
          this.cookies[nameVal.slice(0, eq).trim()] = nameVal.slice(eq + 1).trim();
        }
      }
    }
    get cookieHeader() {
      return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    }
    async request(path, opts = {}) {
      const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
      const c = this.cookieHeader;
      if (c) headers['Cookie'] = c;
      const res = await fetch(`${BASE}${path}`, { ...opts, headers });
      this.setCookiesFromResponse(res);
      return res;
    }
  }

  const client1 = new HttpClient();
  const client2 = new HttpClient();

  const ts = Date.now();
  const u1Email = `cdr_user1_${ts}@test.com`;
  const u2Email = `cdr_user2_${ts}@test.com`;
  const password = 'StrongPassword@123';

  // Register user 1
  await client1.request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'CDR User 1', email: u1Email, phone: `+9191000${Math.floor(10000 + Math.random() * 90000)}`, password }),
  });
  // Register user 2
  await client2.request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'CDR User 2', email: u2Email, phone: `+9192000${Math.floor(10000 + Math.random() * 90000)}`, password }),
  });

  // Get user1 ID via /auth/me
  const meRes = await client1.request('/auth/me');
  assert('G0: User1 profile /auth/me returns 200', meRes.status === 200);
  const meData = await meRes.json();
  const user1Id = meData.data?.user?.id;
  assert('G0: User1 id resolved', Boolean(user1Id));

  // Create a completed session for user1 and finalize CDR
  const sessId = await createTestSession(user1Id, conn.connector_id, 'completed');
  const cdr = await finalizeCdr(sessId);
  assert('G0: CDR finalized for test session', Boolean(cdr));

  // G1: GET /cdrs — authenticated, returns list
  const listRes = await client1.request('/cdrs');
  assert('G1: GET /cdrs returns 200', listRes.status === 200);
  const listData = await listRes.json();
  assert('G1: GET /cdrs data is array', Array.isArray(listData && listData.data));
  assert('G1: GET /cdrs includes created CDR', listData.data && listData.data.some(c => c.session_id === sessId));

  // G2: GET /cdrs without auth -> 401
  const unauthClient = new HttpClient();
  const listUnauth = await unauthClient.request('/cdrs');
  assert('G2: GET /cdrs unauthenticated -> 401', listUnauth.status === 401);

  // G3: GET /cdrs/:id — own CDR
  const getRes = await client1.request(`/cdrs/${cdr.id}`);
  assert('G3: GET /cdrs/:id returns 200', getRes.status === 200);
  const getData = await getRes.json();
  assert('G3: GET /cdrs/:id returns correct CDR', getData.data && getData.data.id === cdr.id);

  // G4: GET /cdrs/:id — cross-user access -> 403
  const crossRes = await client2.request(`/cdrs/${cdr.id}`);
  assert('G4: GET /cdrs/:id cross-user -> 403', crossRes.status === 403);

  // G5: GET /cdrs/:id — invalid UUID -> 400
  const badUuid = await client1.request('/cdrs/not-a-uuid');
  assert('G5: GET /cdrs/invalid-uuid -> 400', badUuid.status === 400);

  // G6: GET /cdrs/:id — non-existent -> 404
  const notFound = await client1.request('/cdrs/00000000-0000-0000-0000-000000000000');
  assert('G6: GET /cdrs/non-existent -> 404', notFound.status === 404);

  // G7: GET /sessions/:id/cdr — own session CDR
  const sessRes = await client1.request(`/sessions/${sessId}/cdr`);
  assert('G7: GET /sessions/:id/cdr returns 200', sessRes.status === 200);
  const sessData = await sessRes.json();
  assert('G7: GET /sessions/:id/cdr returns correct CDR', sessData.data && sessData.data.session_id === sessId);

  // G8: GET /sessions/:id/cdr — cross-user -> 403
  const sessCross = await client2.request(`/sessions/${sessId}/cdr`);
  assert('G8: GET /sessions/:id/cdr cross-user -> 403', sessCross.status === 403);

  // G9: GET /sessions/:id/cdr — active session (no CDR) -> 404
  const activeId = await createTestSession(user1Id, conn.connector_id, 'active');
  const sessActive = await client1.request(`/sessions/${activeId}/cdr`);
  assert('G9: GET /sessions/active-id/cdr -> 404', sessActive.status === 404);
  await cleanupSession(activeId);

  await cleanupSession(sessId);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  VahanGrid - Phase 3E.2 CDR Test Suite');
  console.log('='.repeat(60));

  try { await testCdrCreation(); } catch(e) { console.error('testCdrCreation threw:', e.message); failed++; errors.push('testCdrCreation'); }
  try { await testEnergy(); } catch(e) { console.error('testEnergy threw:', e.message); failed++; errors.push('testEnergy'); }
  try { await testPricingAndImmutability(); } catch(e) { console.error('testPricingAndImmutability threw:', e.message); failed++; errors.push('testPricingAndImmutability'); }
  try { await testIdempotency(); } catch(e) { console.error('testIdempotency threw:', e.message); failed++; errors.push('testIdempotency'); }
  try { await testFailureCases(); } catch(e) { console.error('testFailureCases threw:', e.message); failed++; errors.push('testFailureCases'); }
  try { await testServiceReads(); } catch(e) { console.error('testServiceReads threw:', e.message); failed++; errors.push('testServiceReads'); }
  try { await testRestApi(); } catch(e) { console.error('testRestApi threw:', e.message); failed++; errors.push('testRestApi'); }

  console.log('\n' + '='.repeat(60));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) console.log(`  Failed: ${errors.join(', ')}`);
  console.log('='.repeat(60));

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
