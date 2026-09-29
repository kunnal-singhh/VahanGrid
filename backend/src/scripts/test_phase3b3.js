/**
 * backend/src/scripts/test_phase3b3.js
 *
 * Automated verification suite for Phase 3B.3 — Charging Session Lifecycle API.
 *
 * Tests:
 *  - Unauthenticated requests (401)
 *  - Validation errors & UUID checks (400)
 *  - Vehicle ownership enforcement (403/404)
 *  - Connector availability & status enforcement (409/404)
 *  - Session creation & active session state (201, 200)
 *  - Duplicate active session rejection for user & connector (409)
 *  - Stop session lifecycle & connector release (200, 409)
 *  - Cross-user isolation (IDOR protection on read & stop)
 *  - Concurrent race condition prevention (Promise.all simultaneous starts)
 *  - Regression checks (health, stations, vehicles)
 */

const BASE_URL = 'http://127.0.0.1:3001/api/v1';

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

async function run() {
  console.log('====================================================');
  console.log('🧪 Starting Phase 3B.3 Charging Session Verification');
  console.log('====================================================\n');

  // ── Setup: Create 2 Test Users ───────────────────────────────────────────
  const timestamp = Date.now();
  const user1Email = `user1_${timestamp}@example.com`;
  const user2Email = `user2_${timestamp}@example.com`;
  const password = 'Password@123';

  console.log('--- Registering Test Users ---');
  const reg1Res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Session User 1', email: user1Email, password }),
  });
  const reg1Cookie = reg1Res.headers.get('set-cookie');
  const reg1Data = await reg1Res.json();
  const user1Id = reg1Data.data?.user?.id;
  assert(reg1Res.status === 201 && user1Id, 'User 1 registered successfully');

  const reg2Res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Session User 2', email: user2Email, password }),
  });
  const reg2Cookie = reg2Res.headers.get('set-cookie');
  const reg2Data = await reg2Res.json();
  const user2Id = reg2Data.data?.user?.id;
  assert(reg2Res.status === 201 && user2Id, 'User 2 registered successfully');

  // Helper fetch with cookies
  const u1Fetch = (url, opts = {}) => {
    return fetch(`${BASE_URL}${url}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Cookie: reg1Cookie ? reg1Cookie.split(';')[0] : '',
        ...(opts.headers || {}),
      },
    });
  };

  const u2Fetch = (url, opts = {}) => {
    return fetch(`${BASE_URL}${url}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Cookie: reg2Cookie ? reg2Cookie.split(';')[0] : '',
        ...(opts.headers || {}),
      },
    });
  };

  // ── Setup: Create Vehicles for User 1 and User 2 ─────────────────────────
  console.log('\n--- Creating Vehicles for Users ---');
  const v1Res = await u1Fetch('/vehicles', {
    method: 'POST',
    body: JSON.stringify({
      manufacturer: 'Tata',
      model: 'Nexon EV User 1',
      battery_capacity_kwh: 40.5,
      connector_type: 'CCS2',
    }),
  });
  const v1Data = await v1Res.json();
  const u1VehicleId = v1Data.data?.id;
  assert(v1Res.status === 201 && u1VehicleId, 'Vehicle created for User 1');

  const v2Res = await u2Fetch('/vehicles', {
    method: 'POST',
    body: JSON.stringify({
      manufacturer: 'MG',
      model: 'ZS EV User 2',
      battery_capacity_kwh: 50.3,
      connector_type: 'CCS2',
    }),
  });
  const v2Data = await v2Res.json();
  const u2VehicleId = v2Data.data?.id;
  assert(v2Res.status === 201 && u2VehicleId, 'Vehicle created for User 2');

  // Fetch available connectors from stations API
  const stationsRes = await fetch(`${BASE_URL}/stations`);
  const stationsData = await stationsRes.json();
  const allConnectors = [];
  stationsData.data.forEach((s) => {
    s.evses.forEach((e) => {
      e.connectors.forEach((c) => {
        allConnectors.push(c);
      });
    });
  });

  const availableConnectors = allConnectors.filter((c) => c.status === 'available');
  assert(availableConnectors.length >= 2, `Found ${availableConnectors.length} available connectors in seed data`);
  const testConnector1 = availableConnectors[0];
  const testConnector2 = availableConnectors[1];

  // ── 1. AUTH TESTS ────────────────────────────────────────────────────────
  console.log('\n--- 1. Authentication Enforcement Tests ---');
  const unauthStart = await fetch(`${BASE_URL}/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connector_id: testConnector1.id, vehicle_id: u1VehicleId }),
  });
  assert(unauthStart.status === 401, '1. POST /sessions/start without auth returns 401');

  const unauthActive = await fetch(`${BASE_URL}/sessions/active`);
  assert(unauthActive.status === 401, '2. GET /sessions/active without auth returns 401');

  const unauthList = await fetch(`${BASE_URL}/sessions`);
  assert(unauthList.status === 401, '3. GET /sessions without auth returns 401');

  // ── 2. VALIDATION & START CHECKS ─────────────────────────────────────────
  console.log('\n--- 2. Validation & Edge Cases on Session Start ---');

  // 8. Invalid UUID
  const invalidUuidRes = await u1Fetch('/sessions/start', {
    method: 'POST',
    body: JSON.stringify({ connector_id: 'not-a-uuid', vehicle_id: u1VehicleId }),
  });
  const invalidUuidData = await invalidUuidRes.json();
  assert(invalidUuidRes.status === 400 && invalidUuidData.error.code === 'INVALID_UUID', '8. Invalid UUID returns 400 with INVALID_UUID');

  // Missing fields
  const missingBodyRes = await u1Fetch('/sessions/start', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert(missingBodyRes.status === 400, 'Missing fields return 400');

  // 6. Nonexistent vehicle
  const fakeUuid = '00000000-0000-0000-0000-000000000000';
  const nonExistVehRes = await u1Fetch('/sessions/start', {
    method: 'POST',
    body: JSON.stringify({ connector_id: testConnector1.id, vehicle_id: fakeUuid }),
  });
  const nonExistVehData = await nonExistVehRes.json();
  assert(nonExistVehRes.status === 404 && nonExistVehData.error.code === 'VEHICLE_NOT_FOUND', '6. Nonexistent vehicle returns 404 VEHICLE_NOT_FOUND');

  // 5. Vehicle belonging to another user
  const otherVehRes = await u1Fetch('/sessions/start', {
    method: 'POST',
    body: JSON.stringify({ connector_id: testConnector1.id, vehicle_id: u2VehicleId }),
  });
  const otherVehData = await otherVehRes.json();
  assert(otherVehRes.status === 403 && otherVehData.error.code === 'VEHICLE_NOT_OWNED', '5. Vehicle belonging to another user returns 403 VEHICLE_NOT_OWNED');

  // 7. Nonexistent connector
  const nonExistConnRes = await u1Fetch('/sessions/start', {
    method: 'POST',
    body: JSON.stringify({ connector_id: fakeUuid, vehicle_id: u1VehicleId }),
  });
  const nonExistConnData = await nonExistConnRes.json();
  assert(nonExistConnRes.status === 404 && nonExistConnData.error.code === 'CONNECTOR_NOT_FOUND', '7. Nonexistent connector returns 404 CONNECTOR_NOT_FOUND');

  // 9. Unavailable connector (seeded connector c1000001-...06 has status 'charging')
  const unavailConn = allConnectors.find((c) => c.status !== 'available');
  if (unavailConn) {
    const unavailConnRes = await u1Fetch('/sessions/start', {
      method: 'POST',
      body: JSON.stringify({ connector_id: unavailConn.id, vehicle_id: u1VehicleId }),
    });
    const unavailConnData = await unavailConnRes.json();
    assert(unavailConnRes.status === 409 && unavailConnData.error.code === 'CONNECTOR_UNAVAILABLE', '9. Unavailable connector returns 409 CONNECTOR_UNAVAILABLE');
  }

  // ── 3. START SESSION & LIFECYCLE ────────────────────────────────────────
  console.log('\n--- 3. Session Start & Active State ---');

  // Initially active session is null
  const initActiveRes = await u1Fetch('/sessions/active');
  const initActiveData = await initActiveRes.json();
  assert(initActiveRes.status === 200 && initActiveData.data === null, 'Active session is initially null');

  // 4. Valid start session -> 201
  const startRes = await u1Fetch('/sessions/start', {
    method: 'POST',
    body: JSON.stringify({ connector_id: testConnector1.id, vehicle_id: u1VehicleId }),
  });
  const startData = await startRes.json();
  const session1 = startData.data;
  assert(startRes.status === 201 && session1?.id && session1?.status === 'active', '4. Valid vehicle + available connector returns 201 with active session');
  assert(session1.location?.name && session1.connector?.standard, 'Returned session contains nested station and connector information');

  // 10. Second active session for same user -> 409
  const secondUserStartRes = await u1Fetch('/sessions/start', {
    method: 'POST',
    body: JSON.stringify({ connector_id: testConnector2.id, vehicle_id: u1VehicleId }),
  });
  const secondUserData = await secondUserStartRes.json();
  assert(secondUserStartRes.status === 409 && secondUserData.error.code === 'SESSION_ALREADY_ACTIVE', '10. Second active session for same user rejected with 409 SESSION_ALREADY_ACTIVE');

  // 11. Second active session for same connector (by User 2) -> 409
  const secondConnStartRes = await u2Fetch('/sessions/start', {
    method: 'POST',
    body: JSON.stringify({ connector_id: testConnector1.id, vehicle_id: u2VehicleId }),
  });
  const secondConnData = await secondConnStartRes.json();
  assert(secondConnStartRes.status === 409, '11. Second active session for occupied connector rejected with 409');

  // ── 4. READ ENDPOINTS ───────────────────────────────────────────────────
  console.log('\n--- 4. Session Read & Ownership Enforcement ---');

  // 12. Active session
  const activeRes = await u1Fetch('/sessions/active');
  const activeData = await activeRes.json();
  assert(activeRes.status === 200 && activeData.data?.id === session1.id, '12. GET /sessions/active returns the correct session');

  // 13. Session list
  const listRes = await u1Fetch('/sessions');
  const listData = await listRes.json();
  assert(listRes.status === 200 && Array.isArray(listData.data) && listData.data.some((s) => s.id === session1.id), '13. GET /sessions returns authenticated user sessions');

  // User 2's session list should not see User 1's session
  const u2ListRes = await u2Fetch('/sessions');
  const u2ListData = await u2ListRes.json();
  assert(u2ListRes.status === 200 && !u2ListData.data.some((s) => s.id === session1.id), 'User 2 session list does not contain User 1 session');

  // 14. Single session
  const singleRes = await u1Fetch(`/sessions/${session1.id}`);
  const singleData = await singleRes.json();
  assert(singleRes.status === 200 && singleData.data?.id === session1.id, '14. GET /sessions/:id returns the single session');

  // 15. User 2 cannot access User 1 session
  const crossUserGetRes = await u2Fetch(`/sessions/${session1.id}`);
  const crossUserGetData = await crossUserGetRes.json();
  assert(crossUserGetRes.status === 404 && crossUserGetData.error.code === 'SESSION_NOT_FOUND', '15. User 2 cannot access User 1 session (404 SESSION_NOT_FOUND)');

  // ── 5. STOP SESSION ──────────────────────────────────────────────────────
  console.log('\n--- 5. Stop Session Lifecycle ---');

  // 17. User 2 cannot stop User 1 session
  const crossStopRes = await u2Fetch(`/sessions/${session1.id}/stop`, { method: 'POST' });
  const crossStopData = await crossStopRes.json();
  assert(crossStopRes.status === 404 && crossStopData.error.code === 'SESSION_NOT_FOUND', '17. User 2 cannot stop User 1 session (404 SESSION_NOT_FOUND)');

  // 16. Owner can stop active session
  const stopRes = await u1Fetch(`/sessions/${session1.id}/stop`, { method: 'POST' });
  const stopData = await stopRes.json();
  assert(stopRes.status === 200 && stopData.data?.status === 'stopped', '16. Owner can stop active session (200 with status stopped)');
  assert(stopData.data.ended_at !== null && stopData.data.duration_seconds !== null, 'Stopped session records ended_at and duration_seconds');

  // 18. Stopping already stopped session -> 409
  const reStopRes = await u1Fetch(`/sessions/${session1.id}/stop`, { method: 'POST' });
  const reStopData = await reStopRes.json();
  assert(reStopRes.status === 409 && reStopData.error.code === 'SESSION_ALREADY_STOPPED', '18. Stopping already stopped session returns 409 SESSION_ALREADY_STOPPED');

  // 19. Active session disappears from /sessions/active
  const postStopActiveRes = await u1Fetch('/sessions/active');
  const postStopActiveData = await postStopActiveRes.json();
  assert(postStopActiveRes.status === 200 && postStopActiveData.data === null, '19. Active session disappears from /sessions/active after stop (returns null)');

  // ── 6. CONCURRENCY TEST ─────────────────────────────────────────────────
  console.log('\n--- 6. Concurrency & Race Condition Prevention ---');

  // Register two fresh users for concurrency test
  const cUser1Res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Race User A', email: `race_a_${timestamp}@example.com`, password }),
  });
  const cUser1Cookie = cUser1Res.headers.get('set-cookie');
  const cUser1Data = await cUser1Res.json();

  const cUser2Res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Race User B', email: `race_b_${timestamp}@example.com`, password }),
  });
  const cUser2Cookie = cUser2Res.headers.get('set-cookie');
  const cUser2Data = await cUser2Res.json();

  // Create vehicles for both race users
  const cV1 = await (await fetch(`${BASE_URL}/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cUser1Cookie.split(';')[0] },
    body: JSON.stringify({ manufacturer: 'Hyundai', model: 'Ioniq 5', battery_capacity_kwh: 72.6, connector_type: 'CCS2' }),
  })).json();

  const cV2 = await (await fetch(`${BASE_URL}/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cUser2Cookie.split(';')[0] },
    body: JSON.stringify({ manufacturer: 'Kia', model: 'EV6', battery_capacity_kwh: 77.4, connector_type: 'CCS2' }),
  })).json();

  console.log(`Firing 2 simultaneous startSession requests on connector ${testConnector2.id}...`);

  const [raceResult1, raceResult2] = await Promise.all([
    fetch(`${BASE_URL}/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cUser1Cookie.split(';')[0] },
      body: JSON.stringify({ connector_id: testConnector2.id, vehicle_id: cV1.data.id }),
    }),
    fetch(`${BASE_URL}/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cUser2Cookie.split(';')[0] },
      body: JSON.stringify({ connector_id: testConnector2.id, vehicle_id: cV2.data.id }),
    }),
  ]);

  const statuses = [raceResult1.status, raceResult2.status].sort();
  console.log(`Concurrent results: User A HTTP ${raceResult1.status}, User B HTTP ${raceResult2.status}`);

  assert(
    statuses[0] === 201 && (statuses[1] === 409 || statuses[1] === 400),
    '20. Concurrent race: Exactly one session succeeded (201) and the second was rejected (409 conflict)'
  );

  // Clean up the created race session
  let createdRaceSessionId;
  let winnerCookie;
  if (raceResult1.status === 201) {
    const d = await raceResult1.json();
    createdRaceSessionId = d.data.id;
    winnerCookie = cUser1Cookie;
  } else if (raceResult2.status === 201) {
    const d = await raceResult2.json();
    createdRaceSessionId = d.data.id;
    winnerCookie = cUser2Cookie;
  }

  if (createdRaceSessionId) {
    await fetch(`${BASE_URL}/sessions/${createdRaceSessionId}/stop`, {
      method: 'POST',
      headers: { Cookie: winnerCookie.split(';')[0] },
    });
    console.log('Cleaned up race test session.');
  }

  // ── 7. REGRESSION TESTS ─────────────────────────────────────────────────
  console.log('\n--- 7. Regression Tests ---');

  // 21. Health endpoint still works
  const healthRes = await fetch(`${BASE_URL}/health`);
  const healthData = await healthRes.json();
  assert(healthRes.status === 200 && healthData.status === 'healthy', '21. GET /health returns 200 healthy');

  // 22. Station APIs still work
  const stationsListRes = await fetch(`${BASE_URL}/stations`);
  assert(stationsListRes.status === 200, '22a. GET /stations returns 200');

  const nearbyRes = await fetch(`${BASE_URL}/stations/nearby?lat=28.6139&lng=77.2090&radius_km=10`);
  assert(nearbyRes.status === 200, '22b. GET /stations/nearby returns 200');

  // 23. Vehicle APIs still work
  const vehicleListRes = await u1Fetch('/vehicles');
  assert(vehicleListRes.status === 200, '23. GET /vehicles returns 200');

  // ── SUMMARY ─────────────────────────────────────────────────────────────
  console.log('\n====================================================');
  console.log(`📊 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
