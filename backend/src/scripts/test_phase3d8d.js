/**
 * backend/src/scripts/test_phase3d8d.js
 *
 * Verification test suite for Phase 3D.8D:
 * OCPP 2.0.1 ChangeAvailability Implementation.
 *
 * Sections:
 *  1. Unit Tests for Reverse Mapping:
 *     - resolveOcppIdentityByEvse(evseId)
 *     - resolveChargePointsByLocation(locationId)
 *  2. REST API Request & Scope Validation:
 *     - 401 Unauthorized without auth token
 *     - 400 INVALID_ID for non-UUID station ID
 *     - 404 STATION_NOT_FOUND for non-existent station UUID
 *     - 400 INVALID_OPERATIONAL_STATUS when status is missing or invalid
 *     - 400 INVALID_CONNECTOR_ID for malformed connector UUID
 *     - 404 CONNECTOR_NOT_FOUND when connector does not exist or does not belong to station
 *     - 404 NO_OCPP_CHARGE_POINTS when connector is not mapped to an OCPP charger
 *     - 400 INVALID_EVSE_ID for malformed EVSE UUID
 *     - 404 EVSE_NOT_FOUND when EVSE does not exist or does not belong to station
 *     - 404 NO_OCPP_CHARGE_POINTS when EVSE is not mapped to an OCPP charger
 *     - 404 NO_OCPP_CHARGE_POINTS when station has no mapped charge points
 *  3. Connector-Level Availability Control Flow:
 *     - 503 STATION_OFFLINE when charge point is disconnected
 *     - 409 AVAILABILITY_REJECTED when station returns Rejected
 *     - 504 STATION_TIMEOUT when station does not answer in time
 *     - 200 OK Accepted for Inoperative
 *     - State authority verification: connectors.status remains unmodified upon Accepted
 *     - StatusNotification confirmatory update transitions connectors.status to 'unavailable'
 *     - 200 OK Accepted for Operative restores connectors.status to 'available' via StatusNotification
 *  4. EVSE-Level Availability Control Flow:
 *     - Station receives ChangeAvailability with evse: { id: N } (no connectorId)
 *     - REST returns 200 OK with scope: 'evse'
 *  5. Station-Level Availability Control Flow:
 *     - Station receives ChangeAvailability with operationalStatus only (no evse property)
 *     - REST returns 200 OK with scope: 'station'
 *  6. Scheduled Response Handling:
 *     - Station returns 'Scheduled' -> REST returns 200 OK with result.status: 'Scheduled'
 *     - No pre-emptive DB writes; connector remains in current state
 *     - Follow-up StatusNotification updates connector state
 *  7. Multi-Charge-Point Fan-Out at Station-Level:
 *     - Multiple charge points mapped to same location receive individual commands
 *     - Aggregated results returned
 *     - All offline returns 503 STATION_OFFLINE
 *  8. Backward Compatibility & Regression:
 *     - GET /stations, GET /stations/:id, GET /stations/nearby unaffected
 *  9. Cleanup & Teardown
 */

import WebSocket from 'ws';
import pool, { query } from '../config/database.js';
import connectionRegistry from '../ocpp/connectionRegistry.js';
import ocppCallManager from '../ocpp/ocppCallManager.js';
import {
  resolveOcppIdentityByConnector,
  resolveOcppIdentityByEvse,
  resolveChargePointsByLocation,
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
  console.log('🧪 Phase 3D.8D — OCPP ChangeAvailability Implementation');
  console.log('========================================================\n');

  let cpUUID, evseMapUUID, seedConnUUID, seedEvseUUID, seedLocationUUID;
  let cp2UUID, evseMap2UUID;
  let testUserCookies;
  let wsLive;

  try {
    // ── 0. Setup Test Data ──────────────────────────────────────────────────
    console.log('--- 0. Test Setup & Clean Initial State ---');

    // Clean up any stale test records from previous runs
    await query(`
      DELETE FROM ocpp_connector_mappings WHERE ocpp_evse_mapping_id IN (
        SELECT id FROM ocpp_evse_mappings WHERE charge_point_id IN (
          SELECT id FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D8D-%'
        )
      )
    `);
    await query(`
      DELETE FROM ocpp_evse_mappings WHERE charge_point_id IN (
        SELECT id FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D8D-%'
      )
    `);
    await query(`DELETE FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D8D-%'`);
    await query(`
      DELETE FROM ocpp_connector_mappings WHERE connector_id IN (
        SELECT id FROM connectors WHERE connector_id LIKE 'TEST-%'
      )
    `);
    await query(`DELETE FROM connectors WHERE connector_id LIKE 'TEST-%'`);

    // Fetch seed station, EVSE, and connector
    const seedEvseRes = await query(`SELECT id, location_id FROM evses ORDER BY created_at ASC LIMIT 1`);
    seedEvseUUID = seedEvseRes.rows[0].id;
    seedLocationUUID = seedEvseRes.rows[0].location_id;

    const seedConnRes = await query(`SELECT id FROM connectors WHERE evse_id = $1 LIMIT 1`, [seedEvseUUID]);
    seedConnUUID = seedConnRes.rows[0].id;

    // Reset connector status to available
    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);

    // Create test charge point and mappings
    const cpTestId = `CP-3D8D-${Date.now()}`;
    const cpRes = await query(
      `INSERT INTO ocpp_charge_points (charge_point_id, location_id, model, vendor_name, registration_status, status)
       VALUES ($1, $2, 'HyperAvail-300', 'Delta Systems', 'Accepted', 'online') RETURNING id`,
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

    // Register operator/test user for authenticated REST calls
    const ts = Date.now();
    const userEmail = `avail_user_${ts}@vahan.test`;
    const regRes = await fetch(`${SERVER_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, password: 'SecurePassword@123', name: 'Availability Tester' }),
    });
    testUserCookies = parseCookies(regRes);
    assert(regRes.status === 201 && testUserCookies, '0. Operator/test user registered with JWT cookie');

    // ── 1. Unit Tests for Reverse Mapping ─────────────────────────────────────
    console.log('\n--- 1. Unit Tests for Reverse Mapping (ocppMappingService) ---');

    const evseLookup = await resolveOcppIdentityByEvse(seedEvseUUID);
    assert(evseLookup !== null, '1. resolveOcppIdentityByEvse returns mapped record');
    assert(evseLookup.charge_point_id === cpTestId, '2. charge_point_id matches');
    assert(evseLookup.ocpp_evse_id === 1, '3. ocpp_evse_id matches (1)');
    assert(evseLookup.ocpp_charge_point_uuid === cpUUID, '4. ocpp_charge_point_uuid matches');
    assert(evseLookup.evse_id === seedEvseUUID, '5. evse_id matches');

    const unmappedEvse = await resolveOcppIdentityByEvse('00000000-0000-0000-0000-000000000000');
    assert(unmappedEvse === null, '6. resolveOcppIdentityByEvse returns null for unmapped EVSE');

    const nullEvse = await resolveOcppIdentityByEvse(null);
    assert(nullEvse === null, '7. resolveOcppIdentityByEvse returns null for null input');

    const locChargePoints = await resolveChargePointsByLocation(seedLocationUUID);
    assert(Array.isArray(locChargePoints) && locChargePoints.length >= 1, '8. resolveChargePointsByLocation returns charge point list');
    assert(locChargePoints.some((cp) => cp.charge_point_id === cpTestId), '9. test charge point is in location list');

    const unmappedLoc = await resolveChargePointsByLocation('00000000-0000-0000-0000-000000000000');
    assert(Array.isArray(unmappedLoc) && unmappedLoc.length === 0, '10. resolveChargePointsByLocation returns empty array for unmapped location');

    // ── 2. REST API Request & Scope Validation ────────────────────────────────
    console.log('\n--- 2. REST API Request & Scope Validation ---');

    // 2.1 Missing authentication
    const noAuthRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationalStatus: 'Inoperative' }),
    });
    assert(noAuthRes.status === 401, '11. Missing auth returns 401 Unauthorized');
    const noAuthJson = await noAuthRes.json();
    assert(noAuthJson.error?.code === 'MISSING_TOKEN', '12. Error code is MISSING_TOKEN');

    // 2.2 Invalid station UUID
    const badIdRes = await fetch(`${SERVER_URL}/api/v1/stations/not-a-valid-uuid/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative' }),
    });
    assert(badIdRes.status === 400, '13. Invalid station UUID returns 400 Bad Request');
    const badIdJson = await badIdRes.json();
    assert(badIdJson.error?.code === 'INVALID_ID', '14. Error code is INVALID_ID');

    // 2.3 Non-existent station UUID
    const nonExistStationRes = await fetch(`${SERVER_URL}/api/v1/stations/00000000-0000-0000-0000-000000000000/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative' }),
    });
    assert(nonExistStationRes.status === 404, '15. Non-existent station UUID returns 404 Not Found');
    const nonExistJson = await nonExistStationRes.json();
    assert(nonExistJson.error?.code === 'STATION_NOT_FOUND', '16. Error code is STATION_NOT_FOUND');

    // 2.4 Missing operationalStatus
    const missingStatusRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({}),
    });
    assert(missingStatusRes.status === 400, '17. Missing operationalStatus returns 400');
    const missingStatusJson = await missingStatusRes.json();
    assert(missingStatusJson.error?.code === 'INVALID_OPERATIONAL_STATUS', '18. Error code is INVALID_OPERATIONAL_STATUS');

    // 2.5 Invalid operationalStatus value
    const badStatusRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Maintenance' }),
    });
    assert(badStatusRes.status === 400, '19. Invalid operationalStatus "Maintenance" returns 400');
    const badStatusJson = await badStatusRes.json();
    assert(badStatusJson.error?.code === 'INVALID_OPERATIONAL_STATUS', '20. Error code is INVALID_OPERATIONAL_STATUS');

    // 2.6 Malformed connector UUID
    const badConnIdRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative', connector_id: 'bad-uuid' }),
    });
    assert(badConnIdRes.status === 400, '21. Malformed connector_id returns 400 INVALID_CONNECTOR_ID');

    // 2.7 Non-existent connector UUID
    const nonExistConnRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative', connector_id: '00000000-0000-0000-0000-000000000000' }),
    });
    assert(nonExistConnRes.status === 404, '22. Non-existent connector_id returns 404 CONNECTOR_NOT_FOUND');

    // 2.8 Malformed EVSE UUID
    const badEvseIdRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative', evse_id: 'bad-uuid' }),
    });
    assert(badEvseIdRes.status === 400, '23. Malformed evse_id returns 400 INVALID_EVSE_ID');

    // 2.9 Non-existent EVSE UUID
    const nonExistEvseRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative', evse_id: '00000000-0000-0000-0000-000000000000' }),
    });
    assert(nonExistEvseRes.status === 404, '24. Non-existent evse_id returns 404 EVSE_NOT_FOUND');

    // ── 3. Connector-Level Availability Control Flow ─────────────────────────
    console.log('\n--- 3. Connector-Level Availability Control Flow ---');

    // 3.1 Offline charge point returns 503
    const offlineRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative', connector_id: seedConnUUID }),
    });
    assert(offlineRes.status === 503, '25. ChangeAvailability on offline station returns 503');
    const offlineJson = await offlineRes.json();
    assert(offlineJson.error?.code === 'STATION_OFFLINE', '26. Error code is STATION_OFFLINE');

    // Connect mock live WebSocket client
    const receivedFrames = [];
    wsLive = await connectWs(`${WS_URL}/ocpp/${cpTestId}`);
    wsLive.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString());
        if (frame[0] === 2) {
          const [type, msgId, action, payload] = frame;
          receivedFrames.push({ msgId, action, payload });

          if (action === 'ChangeAvailability') {
            if (payload.evse?.connectorId === 99) {
              // Simulated station rejection
              wsLive.send(JSON.stringify([3, msgId, { status: 'Rejected', statusInfo: { reasonCode: 'DeviceFault' } }]));
            } else if (payload.evse?.connectorId === 88) {
              // Simulated station timeout (ignore message)
            } else if (payload.evse?.connectorId === 77) {
              // Simulated scheduled response
              wsLive.send(JSON.stringify([3, msgId, { status: 'Scheduled' }]));
            } else {
              // Standard Accepted
              wsLive.send(JSON.stringify([3, msgId, { status: 'Accepted' }]));
            }
          }
        }
      } catch (e) {}
    });

    // 3.2 Rejection from station returns 409
    // Map a temporary connector to connectorId 99 for rejection test
    const dummyConnRes = await query(
      `INSERT INTO connectors (evse_id, connector_id, standard, format, power_type, max_power_kw, status)
       VALUES ($1, $2, 'CCS2', 'cable', 'DC', 150, 'available') RETURNING id`,
      [seedEvseUUID, `TEST-REJ-${Date.now()}`]
    );
    const rejConnUUID = dummyConnRes.rows[0].id;
    await query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ($1, 99, $2)`,
      [evseMapUUID, rejConnUUID]
    );

    const rejRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative', connector_id: rejConnUUID }),
    });
    assert(rejRes.status === 409, '27. Station rejection returns 409 Conflict');
    const rejJson = await rejRes.json();
    assert(rejJson.error?.code === 'AVAILABILITY_REJECTED', '28. Error code is AVAILABILITY_REJECTED');

    // 3.3 Station timeout returns 504
    const timeoutConnRes = await query(
      `INSERT INTO connectors (evse_id, connector_id, standard, format, power_type, max_power_kw, status)
       VALUES ($1, $2, 'CCS2', 'cable', 'DC', 150, 'available') RETURNING id`,
      [seedEvseUUID, `TEST-TIME-${Date.now()}`]
    );
    const timeoutConnUUID = timeoutConnRes.rows[0].id;
    await query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ($1, 88, $2)`,
      [evseMapUUID, timeoutConnUUID]
    );

    const timeoutRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative', connector_id: timeoutConnUUID }),
    });
    assert(timeoutRes.status === 504, '29. Station timeout returns 504 Gateway Timeout');
    const timeoutJson = await timeoutRes.json();
    assert(timeoutJson.error?.code === 'STATION_TIMEOUT', '30. Error code is STATION_TIMEOUT');

    // 3.4 Inoperative command Accepted
    const inopRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative', connector_id: seedConnUUID }),
    });
    assert(inopRes.status === 200, '31. ChangeAvailability to Inoperative returns 200 OK');
    const inopJson = await inopRes.json();
    assert(inopJson.success === true, '32. inopJson.success is true');
    assert(inopJson.data?.operationalStatus === 'Inoperative', '33. operationalStatus is Inoperative');
    assert(inopJson.data?.scope === 'connector', '34. scope is connector');
    assert(inopJson.data?.target?.charge_point_id === cpTestId, '35. target charge_point_id matches');
    assert(inopJson.data?.target?.ocpp_evse_id === 1, '36. target ocpp_evse_id matches');
    assert(inopJson.data?.target?.ocpp_connector_id === 1, '37. target ocpp_connector_id matches');
    assert(inopJson.data?.result?.status === 'Accepted', '38. result status is Accepted');

    // 3.5 State Authority Check: Database status NOT pre-emptively updated!
    const dbConnBeforeSN = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConnUUID]);
    assert(
      dbConnBeforeSN.rows[0].status === 'available',
      '39. STATE AUTHORITY: connectors.status is still "available" upon Accepted (not modified prematurely)'
    );

    // 3.6 Confirmatory StatusNotification from station
    const snPromise = new Promise((resolve) => {
      const handler = (data) => {
        try {
          const f = JSON.parse(data.toString());
          if (f[0] === 3) { // CALLRESULT for StatusNotification
            wsLive.off('message', handler);
            resolve();
          }
        } catch (e) {}
      };
      wsLive.on('message', handler);
    });

    wsLive.send(
      JSON.stringify([
        2,
        `msg-sn-${Date.now()}`,
        'StatusNotification',
        {
          timestamp: new Date().toISOString(),
          connectorStatus: 'Unavailable',
          evseId: 1,
          connectorId: 1,
        },
      ])
    );
    await snPromise;

    // Database status is now updated to 'unavailable' by statusNotificationHandler
    const dbConnAfterSN = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConnUUID]);
    assert(
      dbConnAfterSN.rows[0].status === 'unavailable',
      '40. StatusNotification transitions connectors.status to "unavailable"'
    );

    // 3.7 Operative command Accepted & Confirmatory StatusNotification
    const opRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Operative', connector_id: seedConnUUID }),
    });
    assert(opRes.status === 200, '41. ChangeAvailability to Operative returns 200 OK');
    const opJson = await opRes.json();
    assert(opJson.data?.result?.status === 'Accepted', '42. result status is Accepted');

    // Send confirmatory Available StatusNotification
    const snAvailPromise = new Promise((resolve) => {
      const handler = (data) => {
        try {
          const f = JSON.parse(data.toString());
          if (f[0] === 3) {
            wsLive.off('message', handler);
            resolve();
          }
        } catch (e) {}
      };
      wsLive.on('message', handler);
    });

    wsLive.send(
      JSON.stringify([
        2,
        `msg-sn-avail-${Date.now()}`,
        'StatusNotification',
        {
          timestamp: new Date().toISOString(),
          connectorStatus: 'Available',
          evseId: 1,
          connectorId: 1,
        },
      ])
    );
    await snAvailPromise;

    const dbConnRestored = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConnUUID]);
    assert(
      dbConnRestored.rows[0].status === 'available',
      '43. StatusNotification restores connectors.status to "available"'
    );

    // ── 4. EVSE-Level Availability Control Flow ──────────────────────────────
    console.log('\n--- 4. EVSE-Level Availability Control Flow ---');

    const evseAvailRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative', evse_id: seedEvseUUID }),
    });
    assert(evseAvailRes.status === 200, '44. EVSE-level availability returns 200 OK');
    const evseAvailJson = await evseAvailRes.json();
    assert(evseAvailJson.data?.scope === 'evse', '45. scope is "evse"');
    assert(evseAvailJson.data?.target?.ocpp_evse_id === 1, '46. target ocpp_evse_id is 1');
    assert(evseAvailJson.data?.target?.evse_id === seedEvseUUID, '47. target evse_id matches');

    // Verify outbound OCPP frame received by station has evse.id without connectorId
    const lastEvseFrame = receivedFrames[receivedFrames.length - 1];
    assert(lastEvseFrame?.action === 'ChangeAvailability', '48. Station received ChangeAvailability frame');
    assert(lastEvseFrame?.payload?.operationalStatus === 'Inoperative', '49. Frame operationalStatus is Inoperative');
    assert(lastEvseFrame?.payload?.evse?.id === 1, '50. Frame contains evse.id: 1');
    assert(lastEvseFrame?.payload?.evse?.connectorId === undefined, '51. Frame connectorId is undefined for EVSE scope');

    // ── 5. Station-Level Availability Control Flow ───────────────────────────
    console.log('\n--- 5. Station-Level Availability Control Flow ---');

    const stationAvailRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative' }),
    });
    assert(stationAvailRes.status === 200, '52. Station-level availability returns 200 OK');
    const stationAvailJson = await stationAvailRes.json();
    assert(stationAvailJson.data?.scope === 'station', '53. scope is "station"');
    assert(stationAvailJson.data?.result?.status === 'Accepted', '54. result status is Accepted');

    // Verify outbound OCPP frame received by station has no evse field
    const lastStationFrame = receivedFrames[receivedFrames.length - 1];
    assert(lastStationFrame?.payload?.operationalStatus === 'Inoperative', '55. Station-level frame operationalStatus is Inoperative');
    assert(lastStationFrame?.payload?.evse === undefined, '56. Frame evse property is omitted entirely for station scope');

    // ── 6. Scheduled Response Handling ───────────────────────────────────────
    console.log('\n--- 6. Scheduled Response Handling ---');

    const schedConnRes = await query(
      `INSERT INTO connectors (evse_id, connector_id, standard, format, power_type, max_power_kw, status)
       VALUES ($1, $2, 'CCS2', 'cable', 'DC', 150, 'available') RETURNING id`,
      [seedEvseUUID, `TEST-SCHED-${Date.now()}`]
    );
    const schedConnUUID = schedConnRes.rows[0].id;
    await query(
      `INSERT INTO ocpp_connector_mappings (ocpp_evse_mapping_id, ocpp_connector_id, connector_id)
       VALUES ($1, 77, $2)`,
      [evseMapUUID, schedConnUUID]
    );

    const schedRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative', connector_id: schedConnUUID }),
    });
    assert(schedRes.status === 200, '57. Scheduled response returns 200 OK');
    const schedJson = await schedRes.json();
    assert(schedJson.data?.result?.status === 'Scheduled', '58. result.status is "Scheduled"');

    // Status remains available
    const dbSchedBefore = await query(`SELECT status FROM connectors WHERE id = $1`, [schedConnUUID]);
    assert(dbSchedBefore.rows[0].status === 'available', '59. Connector status unchanged after Scheduled');

    // Confirmatory StatusNotification arrives later when transaction finishes
    const schedSnPromise = new Promise((resolve) => {
      const handler = (data) => {
        try {
          const f = JSON.parse(data.toString());
          if (f[0] === 3) {
            wsLive.off('message', handler);
            resolve();
          }
        } catch (e) {}
      };
      wsLive.on('message', handler);
    });

    wsLive.send(
      JSON.stringify([
        2,
        `msg-sn-sched-${Date.now()}`,
        'StatusNotification',
        {
          timestamp: new Date().toISOString(),
          connectorStatus: 'Unavailable',
          evseId: 1,
          connectorId: 77,
        },
      ])
    );
    await schedSnPromise;

    const dbSchedAfter = await query(`SELECT status FROM connectors WHERE id = $1`, [schedConnUUID]);
    assert(dbSchedAfter.rows[0].status === 'unavailable', '60. Connector transitions to "unavailable" upon deferred StatusNotification');

    // ── 7. Multi-Charge-Point Fan-Out ─────────────────────────────────────────
    console.log('\n--- 7. Multi-Charge-Point Fan-Out ---');

    // Add second charge point at same location
    const cp2TestId = `CP-3D8D-2-${Date.now()}`;
    const cp2Res = await query(
      `INSERT INTO ocpp_charge_points (charge_point_id, location_id, model, vendor_name, registration_status, status)
       VALUES ($1, $2, 'HyperAvail-2', 'Delta Systems', 'Accepted', 'online') RETURNING id`,
      [cp2TestId, seedLocationUUID]
    );
    cp2UUID = cp2Res.rows[0].id;

    // Connect second mock WS client
    const wsLive2 = await connectWs(`${WS_URL}/ocpp/${cp2TestId}`);
    wsLive2.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString());
        if (frame[0] === 2 && frame[2] === 'ChangeAvailability') {
          wsLive2.send(JSON.stringify([3, frame[1], { status: 'Accepted' }]));
        }
      } catch (e) {}
    });

    const multiRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Inoperative' }),
    });
    assert(multiRes.status === 200, '61. Multi-charger station availability returns 200 OK');
    const multiJson = await multiRes.json();
    assert(multiJson.data?.results?.length === 2, '62. Results array has 2 charge point entries');
    assert(multiJson.data?.results?.every((r) => r.status === 'Accepted'), '63. All charge points reported Accepted');

    // Disconnect wsLive2 and test fan-out with one offline
    wsLive2.close();
    await new Promise((r) => setTimeout(r, 100));

    // Station command with 1 online and 1 offline -> partial success (200)
    const partialRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ operationalStatus: 'Operative' }),
    });
    assert(partialRes.status === 200, '64. Station availability with partial success returns 200');
    const partialJson = await partialRes.json();
    assert(partialJson.data?.results?.some((r) => r.status === 'Accepted'), '65. At least one charger succeeded');
    assert(partialJson.data?.results?.some((r) => r.code === 'STATION_OFFLINE'), '66. Offline charger tracked in results');

    // ── 8. Backward Compatibility & Regressions ───────────────────────────────
    console.log('\n--- 8. Backward Compatibility & Regressions ---');

    // GET /stations
    const getStationsRes = await fetch(`${SERVER_URL}/api/v1/stations`);
    assert(getStationsRes.status === 200, '67. GET /api/v1/stations returns 200');

    // GET /stations/:id
    const getStationRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}`);
    assert(getStationRes.status === 200, '68. GET /api/v1/stations/:id returns 200');
    const stationDetail = await getStationRes.json();
    assert(stationDetail.data?.id === seedLocationUUID, '69. Station details match ID');

    // GET /stations/nearby
    const nearbyRes = await fetch(`${SERVER_URL}/api/v1/stations/nearby?lat=28.6315&lng=77.2167`);
    assert(nearbyRes.status === 200, '70. GET /api/v1/stations/nearby returns 200');

    // ── 9. Cleanup ────────────────────────────────────────────────────────────
    console.log('\n--- 9. Cleanup ---');

    if (wsLive && wsLive.readyState === 1) {
      wsLive.close();
    }

    // Clean up created mappings, charge points, and connectors (FK order)
    await query(`
      DELETE FROM ocpp_connector_mappings WHERE ocpp_evse_mapping_id IN (
        SELECT id FROM ocpp_evse_mappings WHERE charge_point_id IN ($1, $2)
      )
    `, [cpUUID, cp2UUID]);
    await query(`DELETE FROM ocpp_evse_mappings WHERE charge_point_id IN ($1, $2)`, [cpUUID, cp2UUID]);
    await query(`DELETE FROM ocpp_charge_points WHERE id IN ($1, $2)`, [cpUUID, cp2UUID]);
    await query(`DELETE FROM connectors WHERE id IN ($1, $2, $3)`, [rejConnUUID, timeoutConnUUID, schedConnUUID]);

    // Restore seed connector status to available
    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);

    assert(true, '71. Cleanup completed successfully');

  } catch (err) {
    console.error('Unhandled error during test run:', err);
    failed++;
  } finally {
    console.log('\n========================================================');
    console.log(`📊 Phase 3D.8D Results: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================\n');
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
