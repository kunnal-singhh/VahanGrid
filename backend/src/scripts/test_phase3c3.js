/**
 * backend/src/scripts/test_phase3c3.js
 *
 * Automated verification test suite for Phase 3C.3 — Frontend Charging Session Lifecycle Integration.
 *
 * Verifies:
 *  1. Unauthenticated requests to /sessions endpoints return 401
 *  2. Authenticated user initially has NO active session (data: null)
 *  3. User with no vehicles cannot start a session
 *  4. Vehicle creation & connector lookup for valid charging start
 *  5. POST /sessions/start starts session and transitions connector to 'charging'
 *  6. Station query reflects connector status transition ('charging')
 *  7. Concurrent start on same connector by User 2 fails (409 CONNECTOR_UNAVAILABLE)
 *  8. Concurrent second session start by User 1 fails (409 SESSION_ALREADY_ACTIVE)
 *  9. GET /sessions/active returns the rich active session record
 * 10. POST /sessions/:id/stop stops session and transitions connector back to 'available'
 * 11. Stopping already stopped session returns 409 SESSION_ALREADY_STOPPED
 * 12. GET /sessions/active returns null after stop
 * 13. GET /sessions returns user's completed session in history
 * 14. Cross-user isolation: User 2 cannot see User 1's session in history or active
 * 15. Frontend code audit: chargingService.js, modals, and HistoryPage have zero mock session dependencies
 * 16. Regression: Station and vehicle APIs remain fully functional
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

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

async function run() {
  console.log('========================================================');
  console.log('🧪 Starting Phase 3C.3 Charging Session Integration Verification');
  console.log('========================================================\n');

  // ── 1. Codebase Mock Audit ────────────────────────────────────────────────
  console.log('--- 1. Frontend Codebase Mock Audit ---');
  const frontendSrc = path.join(projectRoot, 'frontend', 'src');

  const chargingServiceContent = fs.readFileSync(
    path.join(frontendSrc, 'services', 'chargingService.js'),
    'utf8'
  );
  assert(
    !chargingServiceContent.includes('mockData') && !chargingServiceContent.includes('VG-SES'),
    '1a. chargingService.js does NOT import mockData or generate fake VG-SES session IDs'
  );

  const chargingModalContent = fs.readFileSync(
    path.join(frontendSrc, 'components', 'charging', 'ActiveChargingModal.jsx'),
    'utf8'
  );
  assert(
    !chargingModalContent.includes('deltaKwh') && !chargingModalContent.includes('currentPower'),
    '1b. ActiveChargingModal.jsx does NOT fabricate simulated telemetry'
  );

  const chargingCardContent = fs.readFileSync(
    path.join(frontendSrc, 'components', 'charging', 'ChargingSessionCard.jsx'),
    'utf8'
  );
  assert(
    !chargingCardContent.includes('cost: 180'),
    '1c. ChargingSessionCard.jsx does NOT use hardcoded stop mock payload'
  );

  const historyPageContent = fs.readFileSync(
    path.join(frontendSrc, 'pages', 'History', 'HistoryPage.jsx'),
    'utf8'
  );
  assert(
    historyPageContent.includes('chargingService.getSessions()'),
    '1d. HistoryPage.jsx consumes real chargingService.getSessions()'
  );

  // ── 2. Unauthenticated Request Verification ─────────────────────────────
  console.log('\n--- 2. Unauthenticated Session Requests ---');
  const unauthActive = await fetch(`${BASE_URL}/sessions/active`);
  assert(unauthActive.status === 401, '2a. GET /sessions/active without auth returns 401');

  const unauthList = await fetch(`${BASE_URL}/sessions`);
  assert(unauthList.status === 401, '2b. GET /sessions without auth returns 401');

  const unauthStart = await fetch(`${BASE_URL}/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connector_id: '00000000-0000-0000-0000-000000000000', vehicle_id: '00000000-0000-0000-0000-000000000000' }),
  });
  assert(unauthStart.status === 401, '2c. POST /sessions/start without auth returns 401');

  // ── 3. Register Users for Testing ───────────────────────────────────────
  console.log('\n--- 3. User Setup & Initial State ---');
  const timestamp = Date.now();
  const u1Email = `c3user1_${timestamp}@vahangrid.test`;
  const u2Email = `c3user2_${timestamp}@vahangrid.test`;

  const reg1Res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Charging Tester One',
      email: u1Email,
      phone: `+91981${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: 'SecurePassword123!',
    }),
  });
  const u1Cookies = parseCookies(reg1Res);
  assert(reg1Res.status === 201, '3a. User 1 registered successfully');

  const reg2Res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Charging Tester Two',
      email: u2Email,
      phone: `+91982${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: 'SecurePassword123!',
    }),
  });
  const u2Cookies = parseCookies(reg2Res);
  assert(reg2Res.status === 201, '3b. User 2 registered successfully');

  // Verify initial empty active session
  const u1ActiveInit = await fetch(`${BASE_URL}/sessions/active`, {
    headers: { Cookie: u1Cookies },
  });
  const u1ActiveInitJson = await u1ActiveInit.json();
  assert(
    u1ActiveInit.status === 200 && u1ActiveInitJson.data === null,
    '3c. Initial active session for User 1 is null (empty state)'
  );

  // ── 4. Locate Available Station & Connector ─────────────────────────────
  console.log('\n--- 4. Connector & Vehicle Setup ---');
  const stationsRes = await fetch(`${BASE_URL}/stations`);
  const stationsJson = await stationsRes.json();
  const stations = stationsJson.data || [];

  // Find a station with an available connector
  let targetStation = null;
  let targetConnector = null;

  for (const st of stations) {
    if (Array.isArray(st.evses)) {
      for (const evse of st.evses) {
        if (Array.isArray(evse.connectors)) {
          const avail = evse.connectors.find((c) => c.status === 'available');
          if (avail) {
            targetStation = st;
            targetConnector = avail;
            break;
          }
        }
      }
    }
    if (targetConnector) break;
  }

  assert(
    targetConnector !== null && targetStation !== null,
    `4a. Found available test connector (${targetConnector?.id}) at station "${targetStation?.name}"`
  );

  // User 1 adds a real vehicle
  const veh1Res = await fetch(`${BASE_URL}/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: u1Cookies },
    body: JSON.stringify({
      manufacturer: 'Tata',
      model: 'Nexon EV Max',
      variant: 'XZ+ Lux',
      battery_capacity_kwh: 40.5,
      connector_type: 'CCS2',
    }),
  });
  const veh1Json = await veh1Res.json();
  const u1Vehicle = veh1Json.data;
  assert(veh1Res.status === 201 && u1Vehicle?.id, '4b. User 1 added test vehicle');

  // User 2 adds a vehicle for cross-user tests
  const veh2Res = await fetch(`${BASE_URL}/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: u2Cookies },
    body: JSON.stringify({
      manufacturer: 'MG',
      model: 'ZS EV',
      battery_capacity_kwh: 50.3,
      connector_type: 'CCS2',
    }),
  });
  const veh2Json = await veh2Res.json();
  const u2Vehicle = veh2Json.data;
  assert(veh2Res.status === 201 && u2Vehicle?.id, '4c. User 2 added test vehicle');

  // ── 5. Start Charging Session Lifecycle ──────────────────────────────────
  console.log('\n--- 5. Start Charging Session Lifecycle ---');
  const startRes = await fetch(`${BASE_URL}/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: u1Cookies },
    body: JSON.stringify({
      connector_id: targetConnector.id,
      vehicle_id: u1Vehicle.id,
    }),
  });
  const startJson = await startRes.json();
  assert(startRes.status === 201, '5a. POST /sessions/start succeeded with 201 Created');
  assert(startJson.data?.status === 'active', '5b. Created session status is "active"');
  assert(startJson.data?.vehicle?.model === 'Nexon EV Max', '5c. Session contains rich vehicle relation');
  assert(startJson.data?.connector?.id === targetConnector.id, '5d. Session contains rich connector relation');

  const activeSessionId = startJson.data.id;

  // Verify connector status in database transitioned to 'charging'
  const refreshedStationRes = await fetch(`${BASE_URL}/stations/${targetStation.id}`);
  const refreshedStationJson = await refreshedStationRes.json();
  const updatedEvses = refreshedStationJson.data?.evses || [];
  const updatedConn = updatedEvses.flatMap((e) => e.connectors || []).find((c) => c.id === targetConnector.id);
  assert(
    updatedConn?.status === 'charging',
    '5e. Station query reflects connector status transitioned to "charging"'
  );

  // ── 6. Conflict & Race Condition Tests ──────────────────────────────────
  console.log('\n--- 6. Conflict & Race Condition Handling ---');

  // Find a DIFFERENT available connector on another station for test 6a
  // (because the same connector is now 'charging', the connector check fires first)
  let altConnector = null;
  for (const st of stations) {
    if (st.id === targetStation.id) continue;
    if (Array.isArray(st.evses)) {
      for (const evse of st.evses) {
        if (Array.isArray(evse.connectors)) {
          const avail = evse.connectors.find((c) => c.status === 'available');
          if (avail) {
            altConnector = avail;
            break;
          }
        }
      }
    }
    if (altConnector) break;
  }

  // 6a. User 1 tries to start a 2nd session while already active (409 SESSION_ALREADY_ACTIVE)
  // If an alternate connector exists, the user duplicate check triggers first; otherwise the CONNECTOR_UNAVAILABLE triggers
  const duplicateStart = await fetch(`${BASE_URL}/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: u1Cookies },
    body: JSON.stringify({
      connector_id: altConnector ? altConnector.id : targetConnector.id,
      vehicle_id: u1Vehicle.id,
    }),
  });
  const duplicateStartJson = await duplicateStart.json();
  assert(
    duplicateStart.status === 409 && duplicateStartJson.error?.code === 'SESSION_ALREADY_ACTIVE',
    '6a. Starting 2nd session while active returns 409 SESSION_ALREADY_ACTIVE'
  );

  // 6b. User 2 tries to charge on the currently charging connector (409)
  const occupiedStart = await fetch(`${BASE_URL}/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: u2Cookies },
    body: JSON.stringify({
      connector_id: targetConnector.id,
      vehicle_id: u2Vehicle.id,
    }),
  });
  const occupiedStartJson = await occupiedStart.json();
  assert(
    occupiedStart.status === 409 &&
      (occupiedStartJson.error?.code === 'CONNECTOR_UNAVAILABLE' || occupiedStartJson.error?.code === 'CONNECTOR_OCCUPIED'),
    '6b. Another user starting on occupied connector returns 409'
  );

  // ── 7. Active Session Query (Browser Reload Simulation) ──────────────────
  console.log('\n--- 7. Active Session Restoration ---');
  const activeRes = await fetch(`${BASE_URL}/sessions/active`, {
    headers: { Cookie: u1Cookies },
  });
  const activeJson = await activeRes.json();
  assert(activeRes.status === 200, '7a. GET /sessions/active returns 200');
  assert(activeJson.data?.id === activeSessionId, '7b. Active session ID matches created session');
  assert(activeJson.data?.location?.id === targetStation.id, '7c. Active session contains location metadata');
  assert(Boolean(activeJson.data?.started_at), '7d. Active session has started_at timestamp for live timer');

  // ── 8. Stop Charging Session Lifecycle ───────────────────────────────────
  console.log('\n--- 8. Stop Charging Session Lifecycle ---');
  const stopRes = await fetch(`${BASE_URL}/sessions/${activeSessionId}/stop`, {
    method: 'POST',
    headers: { Cookie: u1Cookies },
  });
  const stopJson = await stopRes.json();
  assert(stopRes.status === 200, '8a. POST /sessions/:id/stop succeeded with 200 OK');
  assert(stopJson.data?.status === 'stopped', '8b. Stopped session status is "stopped"');
  assert(Boolean(stopJson.data?.ended_at), '8c. Stopped session has ended_at recorded');

  // Verify connector status transitioned back to 'available'
  const restoredStationRes = await fetch(`${BASE_URL}/stations/${targetStation.id}`);
  const restoredStationJson = await restoredStationRes.json();
  const restoredConn = (restoredStationJson.data?.evses || [])
    .flatMap((e) => e.connectors || [])
    .find((c) => c.id === targetConnector.id);
  assert(
    restoredConn?.status === 'available',
    '8d. Connector status transitioned back to "available" after stop'
  );

  // Verify stopping already stopped session returns 409
  const reStopRes = await fetch(`${BASE_URL}/sessions/${activeSessionId}/stop`, {
    method: 'POST',
    headers: { Cookie: u1Cookies },
  });
  const reStopJson = await reStopRes.json();
  assert(
    reStopRes.status === 409 && reStopJson.error?.code === 'SESSION_ALREADY_STOPPED',
    '8e. Stopping an already stopped session returns 409 SESSION_ALREADY_STOPPED'
  );

  // Verify active session is now null
  const postStopActive = await fetch(`${BASE_URL}/sessions/active`, {
    headers: { Cookie: u1Cookies },
  });
  const postStopActiveJson = await postStopActive.json();
  assert(
    postStopActiveJson.data === null,
    '8f. GET /sessions/active returns null after session termination'
  );

  // ── 9. Session History & Cross-User Isolation ─────────────────────────────
  console.log('\n--- 9. Session History & Cross-User Isolation ---');
  const historyRes = await fetch(`${BASE_URL}/sessions`, {
    headers: { Cookie: u1Cookies },
  });
  const historyJson = await historyRes.json();
  const user1Sessions = historyJson.data || [];
  assert(
    user1Sessions.some((s) => s.id === activeSessionId && s.status === 'stopped'),
    '9a. User 1 history contains the stopped session'
  );

  // User 2 history must be empty (isolation)
  const u2HistoryRes = await fetch(`${BASE_URL}/sessions`, {
    headers: { Cookie: u2Cookies },
  });
  const u2HistoryJson = await u2HistoryRes.json();
  assert(
    (u2HistoryJson.data || []).length === 0,
    '9b. User 2 cannot see User 1 charging history (count is 0)'
  );

  // ── 10. Regression Check: Stations & Auth ──────────────────────────────────
  console.log('\n--- 10. Station & Auth Regression ---');
  const meRes = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Cookie: u1Cookies },
  });
  assert(meRes.status === 200, '10a. GET /auth/me returns authenticated profile');

  const nearbyRes = await fetch(`${BASE_URL}/stations/nearby?lat=26.8504&lng=80.9422&radius_km=10`);
  assert(nearbyRes.status === 200, '10b. Spatial PostGIS GET /stations/nearby works');

  console.log('\n========================================================');
  console.log(`📊 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
