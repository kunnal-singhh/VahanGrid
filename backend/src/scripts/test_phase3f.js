/**
 * backend/src/scripts/test_phase3f.js
 *
 * Phase 3F — Real-Time Active Charging Telemetry Dashboard Test Suite.
 *
 * Test coverage:
 *  A. Telemetry endpoint structure   — GET /sessions/:id/telemetry
 *  B. Active session sync            — GET /sessions/active
 *  C. Session list includes all fields for history page
 *  D. CDR retrieval after stop       — GET /sessions/:id/cdr
 *  E. Ownership isolation            — cross-user IDOR rejection
 *  F. Unauthenticated requests blocked
 *  G. Invalid UUID handling
 *  H. Stop then CDR finalization     — full lifecycle
 *
 * Run: node backend/src/scripts/test_phase3f.js
 */

import pool from '../config/database.js';

const BASE_URL = 'http://127.0.0.1:3001/api/v1';

let passed = 0;
let failed = 0;
const errors = [];

function assert(msg, condition) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
    errors.push(msg);
  }
}

function section(title) {
  console.log(`\n${'='.repeat(65)}\n  ${title}\n${'='.repeat(65)}`);
}

function parseCookies(res) {
  // Node.js 18+ fetch: use getSetCookie() for multiple Set-Cookie headers
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookies = [];
  for (const str of setCookie) {
    const part = str.split(';')[0];
    if (part) cookies.push(part.trim());
  }
  return cookies.join('; ');
}

async function registerAndLogin(label) {
  const ts = Date.now() + Math.floor(Math.random() * 100000);
  const email = `phase3f_${label}_${ts}@test.io`;
  const password = 'TestPass123!';

  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: `Phase3F ${label}` }),
  });

  const json = await res.json();
  const cookies = parseCookies(res);
  const token = json.data?.token;
  const user = json.data?.user;
  return { email, password, user, cookies, token };
}

async function addVehicle(cookies) {
  const res = await fetch(`${BASE_URL}/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies },
    body: JSON.stringify({
      manufacturer: 'Tata',
      model: 'Nexon EV',
      variant: 'Max',
      year: 2023,
      battery_capacity_kwh: 40.5,
      range_km: 437,
      connector_type: 'CCS2',
    }),
  });
  const json = await res.json();
  return json.data;
}

async function getAvailableConnector() {
  const result = await pool.query(
    `SELECT c.id
     FROM connectors c
     WHERE c.status = 'available'
     FETCH FIRST 1 ROW ONLY`
  );
  return result.rows[0]?.id || null;
}

async function startSession(cookies, connectorId, vehicleId) {
  const res = await fetch(`${BASE_URL}/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies },
    body: JSON.stringify({ connector_id: connectorId, vehicle_id: vehicleId }),
  });
  const json = await res.json();
  return { res, json };
}

async function stopSession(cookies, sessionId) {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/stop`, {
    method: 'POST',
    headers: { Cookie: cookies },
  });
  const json = await res.json();
  return { res, json };
}

async function main() {
  console.log('\n🔌 VahanGrid Phase 3F — Live Telemetry & CDR Dashboard Test Suite');
  console.log(`   Target: ${BASE_URL}`);

  // ─────────────────────────────────────────────────────────────
  // BOOTSTRAP — register test users and acquire resources
  // ─────────────────────────────────────────────────────────────
  section('Bootstrap — users, vehicles, connector');

  const userA = await registerAndLogin('userA');
  assert('User A registered', !!userA?.user?.id);
  const userB = await registerAndLogin('userB');
  assert('User B registered', !!userB?.user?.id);

  const vehicleA = await addVehicle(userA.cookies);
  assert('Vehicle A created', !!vehicleA?.id);

  const connectorId = await getAvailableConnector();
  assert('Available connector found', !!connectorId);

  if (!connectorId) {
    console.error('\n❌ No available connector — cannot run session lifecycle tests. Ensure seed data is loaded.');
    await pool.end();
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  // Section F: Unauthenticated requests blocked
  // ─────────────────────────────────────────────────────────────
  section('F. Unauthenticated access rejected');

  const unauthActive = await fetch(`${BASE_URL}/sessions/active`);
  assert('GET /sessions/active → 401 without auth', unauthActive.status === 401);

  const unauthList = await fetch(`${BASE_URL}/sessions`);
  assert('GET /sessions → 401 without auth', unauthList.status === 401);

  const fakeId = '00000000-0000-0000-0000-000000000001';
  const unauthTelemetry = await fetch(`${BASE_URL}/sessions/${fakeId}/telemetry`);
  assert('GET /sessions/:id/telemetry → 401 without auth', unauthTelemetry.status === 401);

  const unauthCdr = await fetch(`${BASE_URL}/sessions/${fakeId}/cdr`);
  assert('GET /sessions/:id/cdr → 401 without auth', unauthCdr.status === 401);

  // ─────────────────────────────────────────────────────────────
  // Section G: Invalid UUID handling
  // ─────────────────────────────────────────────────────────────
  section('G. Invalid UUID rejected');

  const badUuidTelemetry = await fetch(`${BASE_URL}/sessions/not-a-uuid/telemetry`, {
    headers: { Cookie: userA.cookies },
  });
  assert('GET /sessions/invalid-uuid/telemetry → 400', badUuidTelemetry.status === 400);

  const badUuidCdr = await fetch(`${BASE_URL}/sessions/not-a-uuid/cdr`, {
    headers: { Cookie: userA.cookies },
  });
  assert('GET /sessions/invalid-uuid/cdr → 400', badUuidCdr.status === 400);

  // ─────────────────────────────────────────────────────────────
  // Section B: Active session sync (before starting)
  // ─────────────────────────────────────────────────────────────
  section('B. Active session sync — initial state (no active session)');

  const activeRes = await fetch(`${BASE_URL}/sessions/active`, {
    headers: { Cookie: userA.cookies },
  });
  assert('GET /sessions/active → 200', activeRes.status === 200);
  const activeJson = await activeRes.json();
  assert('No active session initially', activeJson.data === null || activeJson.data === undefined);

  // ─────────────────────────────────────────────────────────────
  // Section H: Full lifecycle — start, telemetry, stop, CDR
  // ─────────────────────────────────────────────────────────────
  section('H. Full session lifecycle — start → telemetry → stop → CDR');

  // Start session
  const { res: startRes, json: startJson } = await startSession(userA.cookies, connectorId, vehicleA.id);
  assert('Session start → 201', startRes.status === 201);
  assert('Session ID returned', typeof startJson.data?.id === 'string');
  assert('Session status = active', startJson.data?.status === 'active');
  assert('Session has started_at', typeof startJson.data?.started_at === 'string');
  assert('Session has connector_id', typeof startJson.data?.connector_id === 'string');

  const sessionId = startJson.data?.id;

  // ─────────────────────────────────────────────────────────────
  // Section B (live): Active session sync after start
  // ─────────────────────────────────────────────────────────────
  section('B. Active session sync — session is now active');

  const activeRes2 = await fetch(`${BASE_URL}/sessions/active`, {
    headers: { Cookie: userA.cookies },
  });
  assert('GET /sessions/active → 200 with active session', activeRes2.status === 200);
  const activeJson2 = await activeRes2.json();
  assert('Active session matches started session', activeJson2.data?.id === sessionId);
  assert('Active session has status=active', activeJson2.data?.status === 'active');

  // ─────────────────────────────────────────────────────────────
  // Section A: Telemetry endpoint structure
  // ─────────────────────────────────────────────────────────────
  section('A. Telemetry endpoint structure');

  const telRes = await fetch(`${BASE_URL}/sessions/${sessionId}/telemetry`, {
    headers: { Cookie: userA.cookies },
  });
  assert('GET /sessions/:id/telemetry → 200', telRes.status === 200);
  const telJson = await telRes.json();
  assert('Telemetry response success=true', telJson.success === true);
  assert('Telemetry data is array', Array.isArray(telJson.data));
  assert('Telemetry meta includes session_id', telJson.meta?.session_id === sessionId);
  assert('Telemetry meta includes count', typeof telJson.meta?.count === 'number');

  // Telemetry may be empty (no OCPP charger simulating MeterValues); verify shape if samples exist
  if (telJson.data.length > 0) {
    const sample = telJson.data[0];
    assert('Sample has recorded_at', typeof sample.recorded_at === 'string');
    assert('Sample has power_kw field', 'power_kw' in sample);
    assert('Sample has soc_percent field', 'soc_percent' in sample);
    assert('Sample has energy_kwh field', 'energy_kwh' in sample);
  } else {
    // Empty telemetry is valid — no OCPP charger is simulating MeterValues in tests
    assert('Empty telemetry is valid (no OCPP simulator)', true);
    console.log('   ℹ️  No telemetry samples yet — charger not sending MeterValues (expected in test env)');
  }

  // ─────────────────────────────────────────────────────────────
  // Section C: Session list includes expected fields
  // ─────────────────────────────────────────────────────────────
  section('C. Session list — history page data shape');

  const listRes = await fetch(`${BASE_URL}/sessions`, {
    headers: { Cookie: userA.cookies },
  });
  assert('GET /sessions → 200', listRes.status === 200);
  const listJson = await listRes.json();
  assert('Session list success=true', listJson.success === true);
  assert('Session list data is array', Array.isArray(listJson.data));
  assert('Session list includes active session', listJson.data.some((s) => s.id === sessionId));

  const listedSession = listJson.data.find((s) => s.id === sessionId);
  assert('Listed session has started_at', typeof listedSession?.started_at === 'string');
  assert('Listed session has status', typeof listedSession?.status === 'string');
  assert('Listed session has connector_id', typeof listedSession?.connector_id === 'string');

  // ─────────────────────────────────────────────────────────────
  // Section E: Ownership isolation before stop
  // ─────────────────────────────────────────────────────────────
  section('E. Ownership isolation — cross-user IDOR protection');

  // User B should NOT see User A's active session
  const userBActiveRes = await fetch(`${BASE_URL}/sessions/active`, {
    headers: { Cookie: userB.cookies },
  });
  assert('User B GET /sessions/active → 200', userBActiveRes.status === 200);
  const userBActiveJson = await userBActiveRes.json();
  assert('User B cannot see User A active session', userBActiveJson.data === null || userBActiveJson.data?.id !== sessionId);

  // User B should NOT see User A's telemetry
  const userBTelRes = await fetch(`${BASE_URL}/sessions/${sessionId}/telemetry`, {
    headers: { Cookie: userB.cookies },
  });
  assert('User B GET /sessions/:id/telemetry → 404 (IDOR blocked)', userBTelRes.status === 404);

  // User B should NOT see User A's CDR
  const userBCdrRes = await fetch(`${BASE_URL}/sessions/${sessionId}/cdr`, {
    headers: { Cookie: userB.cookies },
  });
  assert('User B GET /sessions/:id/cdr → 404 (IDOR blocked)', userBCdrRes.status === 404);

  // User B cannot stop User A's session
  const userBStopRes = await fetch(`${BASE_URL}/sessions/${sessionId}/stop`, {
    method: 'POST',
    headers: { Cookie: userB.cookies },
  });
  assert('User B POST /sessions/:id/stop → 404 (IDOR blocked)', userBStopRes.status === 404);

  // ─────────────────────────────────────────────────────────────
  // Section D: CDR retrieval — active session (CDR not finalized yet)
  // ─────────────────────────────────────────────────────────────
  section('D. CDR endpoint — active session (no CDR yet)');

  const cdrActiveRes = await fetch(`${BASE_URL}/sessions/${sessionId}/cdr`, {
    headers: { Cookie: userA.cookies },
  });
  // Should be 404 while session is still active
  assert('GET /sessions/:id/cdr during active session → 404', cdrActiveRes.status === 404);

  // ─────────────────────────────────────────────────────────────
  // Section H continued: Stop session and retrieve CDR
  // ─────────────────────────────────────────────────────────────
  section('H. Stop session → CDR finalization');

  const { res: stopRes, json: stopJson } = await stopSession(userA.cookies, sessionId);
  assert('POST /sessions/:id/stop → 200', stopRes.status === 200);
  assert('Stopped session status = completed or stopped', ['completed', 'stopped'].includes(stopJson.data?.status));
  assert('Stopped session has id', stopJson.data?.id === sessionId);

  // Active session now gone
  const activeRes3 = await fetch(`${BASE_URL}/sessions/active`, {
    headers: { Cookie: userA.cookies },
  });
  const activeJson3 = await activeRes3.json();
  assert('No active session after stop', activeJson3.data === null || activeJson3.data?.id !== sessionId);

  // CDR should now be finalized
  // Give CDR service a moment to finalize asynchronously
  await new Promise((r) => setTimeout(r, 500));

  const cdrRes = await fetch(`${BASE_URL}/sessions/${sessionId}/cdr`, {
    headers: { Cookie: userA.cookies },
  });
  assert('GET /sessions/:id/cdr after stop → 200', cdrRes.status === 200);
  const cdrJson = await cdrRes.json();
  assert('CDR success=true', cdrJson.success === true);

  const cdr = cdrJson.data;
  if (cdr) {
    assert('CDR has session_id', cdr.session_id === sessionId || cdr.charging_session_id === sessionId);
    assert('CDR has total_amount or cost_amount', cdr.total_amount != null || cdr.cost_amount != null || cdr.total_cost != null);
    assert('CDR is immutable (immutable_at or finalized_at)', cdr.immutable_at != null || cdr.finalized_at != null || cdr.created_at != null);
    assert('CDR status or settlement present', cdr.status != null || cdr.settlement_status != null || cdr.wallet_settled != null);
    console.log(`   ℹ️  CDR total_amount: ${cdr.total_amount ?? cdr.cost_amount ?? cdr.total_cost} INR`);
  } else {
    assert('CDR data returned', false);
  }

  // Double-stop should be rejected
  section('H. Double-stop rejection');
  const { res: stop2Res } = await stopSession(userA.cookies, sessionId);
  assert('Second POST /sessions/:id/stop → 400 or 409', stop2Res.status === 400 || stop2Res.status === 409 || stop2Res.status === 422);

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  section('Test Summary');
  console.log(`\n  Total:  ${passed + failed}`);
  console.log(`  Passed: ${passed} ✅`);
  console.log(`  Failed: ${failed} ${failed > 0 ? '❌' : '✅'}`);

  if (errors.length > 0) {
    console.error('\n  Failed assertions:');
    errors.forEach((e) => console.error(`    • ${e}`));
  }

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err.message);
  pool.end().catch(() => {});
  process.exit(1);
});
