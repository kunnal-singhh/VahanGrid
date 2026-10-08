/**
 * backend/src/scripts/test_phase3d10.js
 *
 * Verification test suite for Phase 3D.10:
 * OCPP 2.0.1 Smart Charging / Charging Profiles (SetChargingProfile & ClearChargingProfile).
 */

import WebSocket from 'ws';
import pool, { query } from '../config/database.js';
import connectionRegistry from '../ocpp/connectionRegistry.js';
import ocppCallManager from '../ocpp/ocppCallManager.js';
import {
  resolveOcppIdentityByConnector,
  resolveOcppIdentityByEvse,
  resolveChargePointsByLocation,
  resolveOcppIdentityBySession,
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
  console.log('🧪 Phase 3D.10 — OCPP 2.0.1 Smart Charging / Charging Profiles');
  console.log('========================================================\n');

  let cpUUID, evseMapUUID, seedConnUUID, seedEvseUUID, seedLocationUUID;
  let cp2UUID;
  let testUserCookies, otherUserCookies, testUserId, otherUserId;
  let wsLive, wsLive2;
  let activeSessionUUID, activeTxUUID;

  try {
    // ── 0. Setup Test Data ──────────────────────────────────────────────────
    console.log('--- 0. Test Setup & Clean Initial State ---');

    // Clean up any stale test records from previous runs
    await query(`
      DELETE FROM ocpp_connector_mappings WHERE connector_id IN (
        SELECT id FROM connectors WHERE connector_id LIKE 'TEST-3D10-%'
      )
    `);
    await query(`DELETE FROM connectors WHERE connector_id LIKE 'TEST-3D10-%'`);
    await query(`
      DELETE FROM ocpp_connector_mappings WHERE ocpp_evse_mapping_id IN (
        SELECT id FROM ocpp_evse_mappings WHERE charge_point_id IN (
          SELECT id FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D10-%'
        )
      )
    `);
    await query(`
      DELETE FROM ocpp_evse_mappings WHERE charge_point_id IN (
        SELECT id FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D10-%'
      )
    `);
    await query(`DELETE FROM ocpp_transactions WHERE transaction_id LIKE 'TX-3D10-%'`);
    await query(`DELETE FROM charging_sessions WHERE external_session_id LIKE 'TX-3D10-%'`);
    await query(`DELETE FROM ocpp_charge_points WHERE charge_point_id LIKE 'CP-3D10-%'`);

    // Fetch seed station, EVSE, and connector
    const seedEvseRes = await query(`SELECT id, location_id FROM evses ORDER BY created_at ASC LIMIT 1`);
    seedEvseUUID = seedEvseRes.rows[0].id;
    seedLocationUUID = seedEvseRes.rows[0].location_id;

    const seedConnRes = await query(`SELECT id FROM connectors WHERE evse_id = $1 LIMIT 1`, [seedEvseUUID]);
    seedConnUUID = seedConnRes.rows[0].id;

    await query(`UPDATE connectors SET status = 'available' WHERE id = $1`, [seedConnUUID]);

    // Create primary test charge point and mappings
    const cpTestId = `CP-3D10-${Date.now()}`;
    const cpRes = await query(
      `INSERT INTO ocpp_charge_points (charge_point_id, location_id, model, vendor_name, registration_status, status)
       VALUES ($1, $2, 'HyperSmart-300', 'Delta Systems', 'Accepted', 'online') RETURNING id`,
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

    // Register operator / test user
    const ts = Date.now();
    const userEmail = `smart_charge_${ts}@vahan.test`;
    const regRes = await fetch(`${SERVER_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, password: 'SecurePassword@123', name: 'Smart Charge Tester' }),
    });
    const regData = await regRes.json();
    testUserId = regData?.data?.user?.id;
    testUserCookies = parseCookies(regRes);
    assert(regRes.status === 201 && testUserCookies, '0. Primary test user registered with JWT cookie');

    // Register second test user for cross-user permission checks
    const otherEmail = `smart_other_${ts}@vahan.test`;
    const otherRegRes = await fetch(`${SERVER_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otherEmail, password: 'SecurePassword@123', name: 'Other User' }),
    });
    const otherData = await otherRegRes.json();
    otherUserId = otherData?.data?.user?.id;
    otherUserCookies = parseCookies(otherRegRes);
    assert(otherRegRes.status === 201 && otherUserCookies, '0b. Second test user registered for authorization checks');

    // Create an active charging session linked to this connector and testUser
    const sessionRes = await query(
      `INSERT INTO charging_sessions (user_id, connector_id, status, started_at, energy_kwh, cost_amount, currency, external_session_id)
       VALUES ($1, $2, 'active', NOW(), 5.2, 52.00, 'INR', $3) RETURNING id`,
      [testUserId, seedConnUUID, `TX-3D10-ACTIVE-${ts}`]
    );
    activeSessionUUID = sessionRes.rows[0].id;

    // Create linked ocpp_transaction
    const txRes = await query(
      `INSERT INTO ocpp_transactions (
         ocpp_charge_point_id, transaction_id, seq_no, ocpp_evse_id, ocpp_connector_id,
         connector_id, session_id, started_at, status, total_energy_kwh
       ) VALUES ($1, $2, 1, 1, 1, $3, $4, NOW(), 'active', 5.2) RETURNING id`,
      [cpUUID, `TX-3D10-ACTIVE-${ts}`, seedConnUUID, activeSessionUUID]
    );
    activeTxUUID = txRes.rows[0].id;

    // Sample valid charging profile template
    const validProfile = {
      id: 101,
      stackLevel: 1,
      chargingProfilePurpose: 'TxDefaultProfile',
      chargingProfileKind: 'Absolute',
      validFrom: '2026-10-08T12:00:00Z',
      validTo: '2026-10-08T20:00:00Z',
      chargingSchedule: {
        id: 201,
        chargingRateUnit: 'A',
        chargingSchedulePeriod: [
          { startPeriod: 0, limit: 16.0, numberPhases: 3 },
          { startPeriod: 1800, limit: 32.0, numberPhases: 3 },
        ],
      },
    };

    // ── 1. Authentication & Common REST Validation ──────────────────────────
    console.log('\n--- 1. Authentication & Common REST Validation ---');

    // 1.1 Missing JWT
    const setNoAuth = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chargingProfile: validProfile }),
    });
    assert(setNoAuth.status === 401, '1. POST /charging-profiles without auth returns 401');

    const clearNoAuthPost = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/clear-charging-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chargingProfileId: 101 }),
    });
    assert(clearNoAuthPost.status === 401, '2. POST /clear-charging-profile without auth returns 401');

    const clearNoAuthDelete = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles?chargingProfileId=101`, {
      method: 'DELETE',
    });
    assert(clearNoAuthDelete.status === 401, '3. DELETE /charging-profiles without auth returns 401');

    // 1.2 Invalid station UUID
    const badIdSet = await fetch(`${SERVER_URL}/api/v1/stations/not-a-valid-uuid/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ chargingProfile: validProfile }),
    });
    assert(badIdSet.status === 400, '4. POST /charging-profiles with malformed station UUID returns 400 INVALID_ID');

    // 1.3 Non-existent station UUID
    const nonExistStation = await fetch(`${SERVER_URL}/api/v1/stations/00000000-0000-0000-0000-000000000000/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ chargingProfile: validProfile }),
    });
    assert(nonExistStation.status === 404, '5. POST /charging-profiles with non-existent station returns 404 STATION_NOT_FOUND');

    // ── 2. Payload & Schema Validation for SetChargingProfile ───────────────
    console.log('\n--- 2. Payload & Schema Validation for SetChargingProfile ---');

    // 2.1 Missing chargingProfile object
    const missingProfile = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({}),
    });
    assert(missingProfile.status === 400, '6. Missing chargingProfile returns 400 INVALID_CHARGING_PROFILE');

    // 2.2 Invalid profile id (string or <= 0)
    const badProfileId = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: { ...validProfile, id: -5 },
      }),
    });
    assert(badProfileId.status === 400, '7. Negative profile id returns 400 INVALID_PROFILE_ID');

    // 2.3 Invalid stackLevel (< 0)
    const badStackLevel = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: { ...validProfile, stackLevel: -1 },
      }),
    });
    assert(badStackLevel.status === 400, '8. Negative stackLevel returns 400 INVALID_STACK_LEVEL');

    // 2.4 Invalid chargingProfilePurpose
    const badPurpose = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: { ...validProfile, chargingProfilePurpose: 'SuperFastCharging' },
      }),
    });
    assert(badPurpose.status === 400, '9. Unknown chargingProfilePurpose returns 400 INVALID_PROFILE_PURPOSE');

    // 2.5 Invalid chargingProfileKind
    const badKind = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: { ...validProfile, chargingProfileKind: 'Random' },
      }),
    });
    assert(badKind.status === 400, '10. Unknown chargingProfileKind returns 400 INVALID_PROFILE_KIND');

    // 2.6 Invalid date range (validTo < validFrom)
    const badDateRange = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: {
          ...validProfile,
          validFrom: '2026-10-08T20:00:00Z',
          validTo: '2026-10-08T12:00:00Z',
        },
      }),
    });
    assert(badDateRange.status === 400, '11. validTo earlier than validFrom returns 400 INVALID_DATE_RANGE');

    // 2.7 Invalid chargingRateUnit (not W or A)
    const badRateUnit = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: {
          ...validProfile,
          chargingSchedule: {
            ...validProfile.chargingSchedule,
            chargingRateUnit: 'kW', // Invalid: spec requires W or A
          },
        },
      }),
    });
    assert(badRateUnit.status === 400, '12. Unsupported chargingRateUnit returns 400 INVALID_RATE_UNIT');

    // 2.8 Empty schedule period array
    const emptyPeriods = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: {
          ...validProfile,
          chargingSchedule: {
            ...validProfile.chargingSchedule,
            chargingSchedulePeriod: [],
          },
        },
      }),
    });
    assert(emptyPeriods.status === 400, '13. Empty chargingSchedulePeriod returns 400 INVALID_SCHEDULE_PERIOD');

    // 2.9 Invalid limit (<= 0)
    const badLimit = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: {
          ...validProfile,
          chargingSchedule: {
            ...validProfile.chargingSchedule,
            chargingSchedulePeriod: [{ startPeriod: 0, limit: 0 }],
          },
        },
      }),
    });
    assert(badLimit.status === 400, '14. Zero or negative limit returns 400 INVALID_LIMIT');

    // 2.10 Negative startPeriod
    const badStartPeriod = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: {
          ...validProfile,
          chargingSchedule: {
            ...validProfile.chargingSchedule,
            chargingSchedulePeriod: [{ startPeriod: -10, limit: 16.0 }],
          },
        },
      }),
    });
    assert(badStartPeriod.status === 400, '15. Negative startPeriod returns 400 INVALID_START_PERIOD');

    // 2.11 Invalid numberPhases (e.g. 4)
    const badPhases = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: {
          ...validProfile,
          chargingSchedule: {
            ...validProfile.chargingSchedule,
            chargingSchedulePeriod: [{ startPeriod: 0, limit: 16.0, numberPhases: 4 }],
          },
        },
      }),
    });
    assert(badPhases.status === 400, '16. Invalid numberPhases (4) returns 400 INVALID_NUMBER_PHASES');

    // ── 3. Scope & Target Constraint Validation ─────────────────────────────
    console.log('\n--- 3. Scope & Target Constraint Validation ---');

    // 3.1 ChargingStationMaxProfile targeting a specific connector
    const maxProfileConn = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        connector_id: seedConnUUID,
        chargingProfile: { ...validProfile, chargingProfilePurpose: 'ChargingStationMaxProfile' },
      }),
    });
    assert(maxProfileConn.status === 400, '17. ChargingStationMaxProfile targeting connector returns 400 INVALID_PROFILE_SCOPE');

    // 3.2 ChargingStationMaxProfile targeting a specific EVSE
    const maxProfileEvse = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        evse_id: seedEvseUUID,
        chargingProfile: { ...validProfile, chargingProfilePurpose: 'ChargingStationMaxProfile' },
      }),
    });
    assert(maxProfileEvse.status === 400, '18. ChargingStationMaxProfile targeting EVSE returns 400 INVALID_PROFILE_SCOPE');

    // 3.3 TxProfile at station-level without transaction or EVSE
    const txProfileStation = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: { ...validProfile, chargingProfilePurpose: 'TxProfile' },
      }),
    });
    assert(txProfileStation.status === 400, '19. TxProfile at station-level returns 400 INVALID_PROFILE_SCOPE');

    // 3.4 Malformed EVSE UUID
    const badEvseId = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        evse_id: 'bad-uuid-format',
        chargingProfile: validProfile,
      }),
    });
    assert(badEvseId.status === 400, '20. Malformed evse_id returns 400 INVALID_EVSE_ID');

    // 3.5 Malformed Connector UUID
    const badConnId = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        connector_id: 'bad-uuid-format',
        chargingProfile: validProfile,
      }),
    });
    assert(badConnId.status === 400, '21. Malformed connector_id returns 400 INVALID_CONNECTOR_ID');

    // 3.6 Malformed Session UUID
    const badSessionId = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        session_id: 'bad-uuid-format',
        chargingProfile: validProfile,
      }),
    });
    assert(badSessionId.status === 400, '22. Malformed session_id returns 400 INVALID_SESSION_ID');

    // 3.7 Non-existent EVSE UUID
    const nonExistEvse = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        evse_id: '00000000-0000-0000-0000-000000000000',
        chargingProfile: validProfile,
      }),
    });
    assert(nonExistEvse.status === 404, '23. Non-existent EVSE returns 404 EVSE_NOT_FOUND');

    // 3.8 Non-existent Connector UUID
    const nonExistConn = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        connector_id: '00000000-0000-0000-0000-000000000000',
        chargingProfile: validProfile,
      }),
    });
    assert(nonExistConn.status === 404, '24. Non-existent Connector returns 404 CONNECTOR_NOT_FOUND');

    // 3.9 Non-existent Session UUID
    const nonExistSession = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        session_id: '00000000-0000-0000-0000-000000000000',
        chargingProfile: validProfile,
      }),
    });
    assert(nonExistSession.status === 404, '25. Non-existent Session returns 404 SESSION_NOT_FOUND');

    // 3.10 Cross-user session security: other user cannot set profile for activeSessionUUID
    const crossUserSession = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: otherUserCookies },
      body: JSON.stringify({
        session_id: activeSessionUUID,
        chargingProfile: { ...validProfile, chargingProfilePurpose: 'TxProfile' },
      }),
    });
    assert(crossUserSession.status === 403, '26. Non-owner user cannot set profile on another user session (403 FORBIDDEN)');

    // ── 4. Offline / Disconnected Charger Behavior (503) ────────────────────
    console.log('\n--- 4. Offline / Disconnected Charger Behavior (503) ---');

    // Station is mapped to cpTestId, but no WebSocket is connected yet!
    const offlineSet = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        evse_id: seedEvseUUID,
        chargingProfile: validProfile,
      }),
    });
    assert(offlineSet.status === 503, '27. Disconnected charger returns 503 STATION_OFFLINE on SetChargingProfile');

    const offlineClear = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/clear-charging-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfileId: 101,
      }),
    });
    assert(offlineClear.status === 503, '28. Disconnected charger returns 503 STATION_OFFLINE on ClearChargingProfile');

    // ── 5. Live WebSocket Integration & SetChargingProfile Execution ─────────
    console.log('\n--- 5. Live WebSocket Integration & SetChargingProfile Execution ---');

    // Connect mock charger via WebSocket
    wsLive = await connectWs(`${WS_URL}/ocpp/${cpTestId}`);
    assert(wsLive.readyState === 1, '29. Mock charger WebSocket connected to CSMS');

    // Register message handler on mock charger
    let receivedCalls = [];
    let shouldRejectNext = false;
    let shouldTimeoutNext = false;
    let shouldSendCallErrorNext = false;

    wsLive.on('message', (raw) => {
      try {
        const frame = JSON.parse(raw.toString());
        if (Array.isArray(frame) && frame[0] === 2) {
          const [msgType, msgId, action, payload] = frame;
          receivedCalls.push({ msgId, action, payload });

          if (shouldTimeoutNext) {
            // Intentionally don't respond to cause timeout
            return;
          }

          if (shouldSendCallErrorNext) {
            const errFrame = [4, msgId, 'FormatViolation', 'Simulated payload error', {}];
            wsLive.send(JSON.stringify(errFrame));
            return;
          }

          if (action === 'SetChargingProfile') {
            if (shouldRejectNext) {
              const resFrame = [
                3,
                msgId,
                { status: 'Rejected', statusInfo: { reasonCode: 'TooHighPower' } },
              ];
              wsLive.send(JSON.stringify(resFrame));
            } else {
              const resFrame = [3, msgId, { status: 'Accepted' }];
              wsLive.send(JSON.stringify(resFrame));
            }
          } else if (action === 'ClearChargingProfile') {
            if (shouldRejectNext) {
              const resFrame = [3, msgId, { status: 'Unknown' }];
              wsLive.send(JSON.stringify(resFrame));
            } else {
              const resFrame = [3, msgId, { status: 'Accepted' }];
              wsLive.send(JSON.stringify(resFrame));
            }
          }
        }
      } catch (e) {
        console.error('Error in mock WS handler:', e);
      }
    });

    // 5.1 Successful SetChargingProfile on EVSE
    receivedCalls = [];
    shouldRejectNext = false;
    const evseSetRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        evse_id: seedEvseUUID,
        chargingProfile: validProfile,
      }),
    });
    const evseSetData = await evseSetRes.json();
    assert(evseSetRes.status === 200, '30. SetChargingProfile for EVSE returns 200 OK');
    assert(evseSetData?.data?.status === 'Accepted', '31. Response data status is Accepted');
    assert(evseSetData?.data?.scope === 'evse', '32. Scope reported as evse');
    assert(receivedCalls.length === 1, '33. Exactly 1 OCPP CALL received by charger');
    assert(receivedCalls[0].action === 'SetChargingProfile', '34. Action is SetChargingProfile');
    assert(receivedCalls[0].payload?.evseId === 1, '35. Payload evseId is 1 (mapped EVSE)');
    assert(receivedCalls[0].payload?.chargingProfile?.id === 101, '36. Payload profile id preserved');

    // 5.2 Successful SetChargingProfile on Connector
    receivedCalls = [];
    const connSetRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        connector_id: seedConnUUID,
        chargingProfile: {
          ...validProfile,
          id: 102,
          chargingSchedule: {
            ...validProfile.chargingSchedule,
            chargingRateUnit: 'W',
            chargingSchedulePeriod: [{ startPeriod: 0, limit: 11000.0 }],
          },
        },
      }),
    });
    const connSetData = await connSetRes.json();
    assert(connSetRes.status === 200, '37. SetChargingProfile for Connector returns 200 OK');
    assert(connSetData?.data?.scope === 'connector', '38. Scope reported as connector');
    assert(receivedCalls[0].payload?.chargingProfile?.chargingSchedule?.chargingRateUnit === 'W', '39. Rate unit W preserved');

    // 5.3 Successful SetChargingProfile on Session (TxProfile with auto-resolved transactionId)
    receivedCalls = [];
    const sessSetRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        session_id: activeSessionUUID,
        chargingProfile: {
          ...validProfile,
          id: 103,
          chargingProfilePurpose: 'TxProfile',
          chargingProfileKind: 'Relative',
        },
      }),
    });
    const sessSetData = await sessSetRes.json();
    assert(sessSetRes.status === 200, '40. SetChargingProfile for Session returns 200 OK');
    assert(sessSetData?.data?.scope === 'transaction', '41. Scope reported as transaction');
    assert(
      receivedCalls[0].payload?.chargingProfile?.transactionId === `TX-3D10-ACTIVE-${ts}`,
      '42. Session transactionId automatically populated in chargingProfile'
    );
    assert(receivedCalls[0].payload?.evseId === 1, '43. EVSE ID correctly bound to session EVSE');

    // 5.4 Successful SetChargingProfile at Station-Level (evseId 0)
    receivedCalls = [];
    const stationSetRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: {
          ...validProfile,
          id: 104,
          chargingProfilePurpose: 'ChargingStationMaxProfile',
        },
      }),
    });
    const stationSetData = await stationSetRes.json();
    assert(stationSetRes.status === 200, '44. SetChargingProfile at Station level returns 200 OK');
    assert(stationSetData?.data?.scope === 'station', '45. Scope reported as station');
    assert(receivedCalls[0].payload?.evseId === 0, '46. Station-level SetChargingProfile uses evseId 0');

    // 5.5 Charger Rejection (409 Conflict)
    receivedCalls = [];
    shouldRejectNext = true;
    const rejRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        evse_id: seedEvseUUID,
        chargingProfile: validProfile,
      }),
    });
    const rejData = await rejRes.json();
    assert(rejRes.status === 409, '47. Charger Rejected status returns 409 CHARGING_PROFILE_REJECTED');
    assert(rejData?.error?.code === 'CHARGING_PROFILE_REJECTED', '48. Error code is CHARGING_PROFILE_REJECTED');
    shouldRejectNext = false;

    // 5.6 Charger Protocol CALLERROR
    receivedCalls = [];
    shouldSendCallErrorNext = true;
    const errRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        evse_id: seedEvseUUID,
        chargingProfile: validProfile,
      }),
    });
    assert(errRes.status >= 400 && errRes.status <= 502, '49. Charger CALLERROR handled cleanly with error status');
    shouldSendCallErrorNext = false;

    // 5.7 Charger Timeout (504)
    receivedCalls = [];
    shouldTimeoutNext = true;
    const timeoutRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        evse_id: seedEvseUUID,
        chargingProfile: validProfile,
        timeoutMs: 500,
      }),
    });
    const timeoutData = await timeoutRes.json();
    assert(timeoutRes.status === 504, '50. SetChargingProfile timeout yields 504 STATION_TIMEOUT');
    assert(timeoutData?.error?.code === 'STATION_TIMEOUT', '50b. Error code is STATION_TIMEOUT');
    shouldTimeoutNext = false;

    // ── 6. ClearChargingProfile Validation & Execution ───────────────────────
    console.log('\n--- 6. ClearChargingProfile Validation & Execution ---');

    // 6.1 Missing clear criteria returns 400
    const emptyClear = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/clear-charging-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({}),
    });
    assert(emptyClear.status === 400, '51. ClearChargingProfile without filters returns 400 MISSING_CLEAR_CRITERIA');

    // 6.2 Invalid profileId (<= 0)
    const badClearProfileId = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/clear-charging-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ chargingProfileId: -1 }),
    });
    assert(badClearProfileId.status === 400, '52. Invalid chargingProfileId returns 400 INVALID_PROFILE_ID');

    // 6.3 Invalid chargingProfilePurpose in criteria
    const badClearPurpose = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/clear-charging-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ chargingProfilePurpose: 'NonExistent' }),
    });
    assert(badClearPurpose.status === 400, '53. Invalid chargingProfilePurpose in criteria returns 400 INVALID_PROFILE_PURPOSE');

    // 6.4 Successful ClearChargingProfile by profileId via POST
    receivedCalls = [];
    shouldRejectNext = false;
    const clearPostRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/clear-charging-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ chargingProfileId: 101 }),
    });
    const clearPostData = await clearPostRes.json();
    assert(clearPostRes.status === 200, '54. POST /clear-charging-profile returns 200 OK');
    assert(clearPostData?.data?.cleared === true, '55. Cleared is true');
    assert(receivedCalls[0].action === 'ClearChargingProfile', '56. Action is ClearChargingProfile');
    assert(receivedCalls[0].payload?.chargingProfileId === 101, '57. Payload chargingProfileId is 101');

    // 6.5 Successful ClearChargingProfile via DELETE /charging-profiles
    receivedCalls = [];
    const clearDelRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles?chargingProfileId=102`, {
      method: 'DELETE',
      headers: { Cookie: testUserCookies },
    });
    const clearDelData = await clearDelRes.json();
    assert(clearDelRes.status === 200, '58. DELETE /charging-profiles returns 200 OK');
    assert(clearDelData?.data?.cleared === true, '59. Cleared is true on DELETE');
    assert(receivedCalls[0].payload?.chargingProfileId === 102, '60. chargingProfileId 102 parsed from query');

    // 6.6 ClearChargingProfile with EVSE filter
    receivedCalls = [];
    const clearEvseRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/clear-charging-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        evse_id: seedEvseUUID,
        chargingProfilePurpose: 'TxDefaultProfile',
      }),
    });
    const clearEvseData = await clearEvseRes.json();
    assert(clearEvseRes.status === 200, '61. ClearChargingProfile by EVSE returns 200 OK');
    assert(clearEvseData?.data?.scope === 'evse', '62. Scope reported as evse');
    assert(receivedCalls[0].payload?.chargingProfileCriteria?.evseId === 1, '63. Criteria evseId is 1');
    assert(receivedCalls[0].payload?.chargingProfileCriteria?.chargingProfilePurpose === 'TxDefaultProfile', '64. Purpose filter preserved');

    // 6.7 ClearChargingProfile when charger returns 'Unknown' (no profile found)
    receivedCalls = [];
    shouldRejectNext = true; // Returns 'Unknown'
    const unknownClearRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/clear-charging-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({ chargingProfileId: 999 }),
    });
    const unknownClearData = await unknownClearRes.json();
    assert(unknownClearRes.status === 200, '65. Unknown status returns 200 OK with cleared: false');
    assert(unknownClearData?.data?.cleared === false, '66. cleared is false');
    assert(unknownClearData?.data?.status === 'Unknown', '67. status is Unknown');
    shouldRejectNext = false;

    // ── 7. Strict State Authority Verification ──────────────────────────────
    console.log('\n--- 7. Strict State Authority Verification ---');

    // Verify connector, EVSE, and session statuses were NOT modified
    const connCheck = await query(`SELECT status FROM connectors WHERE id = $1`, [seedConnUUID]);
    assert(connCheck.rows[0].status === 'available', '68. STATE AUTHORITY: connector.status remains available');

    const sessionCheck = await query(`SELECT status, energy_kwh FROM charging_sessions WHERE id = $1`, [activeSessionUUID]);
    assert(sessionCheck.rows[0].status === 'active', '69. STATE AUTHORITY: session.status remains active');
    assert(Number(sessionCheck.rows[0].energy_kwh) === 5.2, '70. STATE AUTHORITY: session.energy_kwh untouched');

    // ── 8. Multi-Charge-Point Station Behavior ──────────────────────────────
    console.log('\n--- 8. Multi-Charge-Point Station Behavior ---');

    // Map a second charge point to the same station
    const cp2TestId = `CP-3D10-2-${Date.now()}`;
    const cp2Res = await query(
      `INSERT INTO ocpp_charge_points (charge_point_id, location_id, model, vendor_name, registration_status, status)
       VALUES ($1, $2, 'DualSmart-150', 'Delta Systems', 'Accepted', 'online') RETURNING id`,
      [cp2TestId, seedLocationUUID]
    );
    cp2UUID = cp2Res.rows[0].id;

    // Connect second mock charger
    wsLive2 = await connectWs(`${WS_URL}/ocpp/${cp2TestId}`);
    assert(wsLive2.readyState === 1, '71. Second mock charger WebSocket connected');

    wsLive2.on('message', (raw) => {
      try {
        const frame = JSON.parse(raw.toString());
        if (Array.isArray(frame) && frame[0] === 2) {
          const [msgType, msgId, action] = frame;
          const resFrame = [3, msgId, { status: 'Accepted' }];
          wsLive2.send(JSON.stringify(resFrame));
        }
      } catch (e) {}
    });

    // 8.1 Station-level SetChargingProfile fans out to both chargers (all success)
    receivedCalls = [];
    const multiSetRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: {
          ...validProfile,
          id: 105,
          chargingProfilePurpose: 'ChargingStationMaxProfile',
        },
      }),
    });
    const multiSetData = await multiSetRes.json();
    assert(multiSetRes.status === 200, '72. Multi-CP station fan-out returns 200 OK');
    assert(multiSetData?.data?.results?.length === 2, '73. Results contain entries for both charge points');
    assert(
      multiSetData?.data?.results?.every((r) => r.status === 'Accepted'),
      '74. Both charge points accepted the station profile'
    );

    // 8.2 Partial success (1 charger online, 1 charger offline)
    wsLive2.close();
    await new Promise((r) => setTimeout(r, 200));

    const partialSetRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: {
          ...validProfile,
          id: 106,
          chargingProfilePurpose: 'ChargingStationMaxProfile',
        },
      }),
    });
    const partialSetData = await partialSetRes.json();
    assert(partialSetRes.status === 200, '75. Partial fan-out returns 200 OK');
    assert(partialSetData?.data?.status === 'PartiallyAccepted', '76. Status is PartiallyAccepted');
    assert(
      partialSetData?.data?.results?.some((r) => r.status === 'Accepted') &&
        partialSetData?.data?.results?.some((r) => r.code === 'STATION_OFFLINE'),
      '77. Results accurately reflect one Accepted and one offline charge point'
    );

    // 8.3 All offline on station fan-out
    wsLive.close();
    await new Promise((r) => setTimeout(r, 200));

    const allOfflineRes = await fetch(`${SERVER_URL}/api/v1/stations/${seedLocationUUID}/charging-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: testUserCookies },
      body: JSON.stringify({
        chargingProfile: {
          ...validProfile,
          id: 107,
          chargingProfilePurpose: 'ChargingStationMaxProfile',
        },
      }),
    });
    assert(allOfflineRes.status === 503, '78. All offline on multi-CP station fan-out returns 503 STATION_OFFLINE');

  } catch (err) {
    console.error('Unexpected test suite error:', err);
    failed++;
  } finally {
    // ── 9. Cleanup ──────────────────────────────────────────────────────────
    console.log('\n--- 9. Cleanup Test Data ---');
    if (wsLive && wsLive.readyState === 1) wsLive.close();
    if (wsLive2 && wsLive2.readyState === 1) wsLive2.close();

    try {
      if (activeSessionUUID) {
        await query(`DELETE FROM ocpp_transactions WHERE session_id = $1`, [activeSessionUUID]);
        await query(`DELETE FROM charging_sessions WHERE id = $1`, [activeSessionUUID]);
      }
      if (testUserId) {
        await query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = $1)`, [testUserId]);
        await query(`DELETE FROM wallets WHERE user_id = $1`, [testUserId]);
        await query(`DELETE FROM users WHERE id = $1`, [testUserId]);
      }
      if (otherUserId) {
        await query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = $1)`, [otherUserId]);
        await query(`DELETE FROM wallets WHERE user_id = $1`, [otherUserId]);
        await query(`DELETE FROM users WHERE id = $1`, [otherUserId]);
      }
      if (cp2UUID) {
        await query(`DELETE FROM ocpp_charge_points WHERE id = $1`, [cp2UUID]);
      }
      if (cpUUID) {
        await query(`DELETE FROM ocpp_connector_mappings WHERE ocpp_evse_mapping_id = $1`, [evseMapUUID]);
        await query(`DELETE FROM ocpp_evse_mappings WHERE id = $1`, [evseMapUUID]);
        await query(`DELETE FROM ocpp_charge_points WHERE id = $1`, [cpUUID]);
      }
      console.log('✅ Test data cleaned up successfully.');
    } catch (cleanErr) {
      console.error('Error during cleanup:', cleanErr.message);
    }

    console.log('\n========================================================');
    console.log(`Phase 3D.10 Test Summary: Passed: ${passed}, Failed: ${failed}`);
    console.log('========================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
