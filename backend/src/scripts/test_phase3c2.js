/**
 * backend/src/scripts/test_phase3c2.js
 *
 * Automated verification suite for Phase 3C.2 — Frontend Vehicle Integration.
 *
 * Verifies:
 *  - Vehicle endpoints require authentication (401 without cookie)
 *  - Authenticated user initially has 0 vehicles (empty state verification)
 *  - Vehicle creation via POST with real DB validation (400 on invalid input, 201 on valid input)
 *  - Created vehicle persists and is fetched via GET /vehicles
 *  - Vehicle update via PATCH /vehicles/:id persists
 *  - Vehicle deletion via DELETE /vehicles/:id removes the vehicle
 *  - Cross-user vehicle isolation (User 2 cannot read, edit, or delete User 1's vehicle)
 *  - No imports of mock VEHICLES in frontend source code
 *  - Stations API regression test
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

// Client simulator with standard browser cookie jar semantics
class BrowserClient {
  constructor() {
    this.cookieJar = {};
  }

  getCookieHeader() {
    return Object.entries(this.cookieJar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  saveCookies(res) {
    const cookies = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);

    for (const cookieStr of cookies) {
      const parts = cookieStr.split(';');
      const [nameVal, ...attrs] = parts;
      const eqIdx = nameVal.indexOf('=');
      if (eqIdx !== -1) {
        const name = nameVal.slice(0, eqIdx).trim();
        const val = nameVal.slice(eqIdx + 1).trim();
        const isExpired = attrs.some((a) => {
          const lower = a.toLowerCase();
          return lower.includes('expires=thu, 01 jan 1970') || lower.includes('max-age=0');
        });

        if (!val || isExpired) {
          delete this.cookieJar[name];
        } else {
          this.cookieJar[name] = val;
        }
      }
    }
  }

  async fetch(url, opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    };
    const cookie = this.getCookieHeader();
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const res = await fetch(`${BASE_URL}${url}`, {
      ...opts,
      headers,
    });
    this.saveCookies(res);
    return res;
  }
}

async function run() {
  console.log('========================================================');
  console.log('🧪 Starting Phase 3C.2 Vehicle Integration Verification');
  console.log('========================================================\n');

  // ── Codebase Mock Check ──────────────────────────────────────────────────
  console.log('--- 1. Mock Data Removal Verification ---');
  const frontendSrc = path.join(projectRoot, 'frontend', 'src');
  const mockDataPath = path.join(frontendSrc, 'data', 'mockData.js');
  const mockDataContent = fs.readFileSync(mockDataPath, 'utf8');

  assert(
    !mockDataContent.includes('export const VEHICLES = ['),
    '10. export const VEHICLES array removed from mockData.js'
  );

  const vehicleServicePath = path.join(frontendSrc, 'services', 'vehicleService.js');
  const vehicleServiceContent = fs.readFileSync(vehicleServicePath, 'utf8');
  assert(
    !vehicleServiceContent.includes('VEHICLES'),
    '11. vehicleService.js does NOT import or reference mock VEHICLES'
  );

  const profilePagePath = path.join(frontendSrc, 'pages', 'Profile', 'ProfilePage.jsx');
  const profilePageContent = fs.readFileSync(profilePagePath, 'utf8');
  assert(
    !profilePageContent.includes('VEHICLES'),
    'ProfilePage.jsx does NOT import or reference mock VEHICLES'
  );

  // ── Authentication Check ────────────────────────────────────────────────
  console.log('\n--- 2. Unauthenticated Vehicle Requests ---');
  const unauthClient = new BrowserClient();
  const unauthGet = await unauthClient.fetch('/vehicles');
  assert(unauthGet.status === 401, '9. GET /vehicles without authentication returns 401');

  const unauthPost = await unauthClient.fetch('/vehicles', {
    method: 'POST',
    body: JSON.stringify({ manufacturer: 'Tata', model: 'Nexon', battery_capacity_kwh: 40 }),
  });
  assert(unauthPost.status === 401, 'POST /vehicles without authentication returns 401');

  // ── Register New Test User ──────────────────────────────────────────────
  console.log('\n--- 3. Authenticated Empty State ---');
  const timestamp = Date.now();
  const userClient = new BrowserClient();
  const userEmail = `driver_veh_${timestamp}@vahangrid.in`;
  const password = 'StrongPassword@123';

  const regRes = await userClient.fetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Rohan Mehra',
      email: userEmail,
      phone: `+9198765${Math.floor(10000 + Math.random() * 90000)}`,
      password,
    }),
  });
  assert(regRes.status === 201, 'User registered successfully');

  // 1 & 3: Fresh user should have 0 vehicles
  const initVehiclesRes = await userClient.fetch('/vehicles');
  const initVehiclesData = await initVehiclesRes.json();
  assert(
    initVehiclesRes.status === 200 && Array.isArray(initVehiclesData.data) && initVehiclesData.data.length === 0,
    '1 & 3. Authenticated profile starts with empty vehicle collection (data: [])'
  );

  // ── Validation Errors (POST) ────────────────────────────────────────────
  console.log('\n--- 4. Vehicle Input Validation ---');
  // 8. Missing required fields
  const missingFieldRes = await userClient.fetch('/vehicles', {
    method: 'POST',
    body: JSON.stringify({ manufacturer: 'Tata' }),
  });
  assert(missingFieldRes.status === 400, '8a. Missing required fields returns 400');

  // 8. Invalid battery capacity (<= 0)
  const invalidBatteryRes = await userClient.fetch('/vehicles', {
    method: 'POST',
    body: JSON.stringify({
      manufacturer: 'Tata',
      model: 'Nexon EV',
      battery_capacity_kwh: -5,
      connector_type: 'CCS2',
    }),
  });
  assert(invalidBatteryRes.status === 400, '8b. Negative battery capacity returns 400');

  // 8. Invalid connector type
  const invalidConnectorRes = await userClient.fetch('/vehicles', {
    method: 'POST',
    body: JSON.stringify({
      manufacturer: 'Tata',
      model: 'Nexon EV',
      battery_capacity_kwh: 40.5,
      connector_type: 'UnknownConnector123',
    }),
  });
  assert(invalidConnectorRes.status === 400, '8c. Invalid connector type returns 400');

  // ── Add Vehicle (POST) ──────────────────────────────────────────────────
  console.log('\n--- 5. Create Vehicle (POST) & Persistence ---');
  const createRes = await userClient.fetch('/vehicles', {
    method: 'POST',
    body: JSON.stringify({
      manufacturer: 'Tata',
      model: 'Nexon EV Max',
      variant: 'XZ+ Lux',
      battery_capacity_kwh: 40.5,
      connector_type: 'CCS2',
      max_dc_power_kw: 50.0,
      max_ac_power_kw: 7.2,
    }),
  });
  const createData = await createRes.json();
  const createdVehicle = createData.data;
  assert(createRes.status === 201 && createdVehicle?.id, '4. Real vehicle created successfully with 201');
  assert(createdVehicle.manufacturer === 'Tata' && createdVehicle.model === 'Nexon EV Max', 'Created vehicle has correct manufacturer and model');
  assert(createdVehicle.connector_type === 'CCS2', 'Created vehicle has correct connector standard');

  // 5. Verify persistence on subsequent GET (simulating page reload)
  const listAfterPost = await userClient.fetch('/vehicles');
  const listDataAfterPost = await listAfterPost.json();
  assert(
    listAfterPost.status === 200 &&
      listDataAfterPost.data.length === 1 &&
      listDataAfterPost.data[0].id === createdVehicle.id,
    '5. Created vehicle persists in PostgreSQL and is returned on reload'
  );

  // ── Edit Vehicle (PATCH) ────────────────────────────────────────────────
  console.log('\n--- 6. Edit Vehicle (PATCH) & Persistence ---');
  const updateRes = await userClient.fetch(`/vehicles/${createdVehicle.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      variant: 'XZ+ Dark Edition',
      battery_capacity_kwh: 45.0,
    }),
  });
  const updateData = await updateRes.json();
  assert(updateRes.status === 200 && updateData.data.variant === 'XZ+ Dark Edition', '6a. PATCH /vehicles/:id updates vehicle variant');
  assert(updateData.data.battery_capacity_kwh === 45.0, '6b. PATCH /vehicles/:id updates battery capacity');

  // Verify persistence on GET /vehicles/:id
  const getSingleRes = await userClient.fetch(`/vehicles/${createdVehicle.id}`);
  const getSingleData = await getSingleRes.json();
  assert(
    getSingleRes.status === 200 &&
      getSingleData.data.variant === 'XZ+ Dark Edition' &&
      getSingleData.data.battery_capacity_kwh === 45.0,
    '6c. Updated vehicle values persist in database'
  );

  // ── Cross-User Isolation (IDOR Check) ───────────────────────────────────
  console.log('\n--- 7. Cross-User Authorization (IDOR Protection) ---');
  const user2Client = new BrowserClient();
  await user2Client.fetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'User Two',
      email: `driver_veh2_${timestamp}@vahangrid.in`,
      phone: `+9198765${Math.floor(10000 + Math.random() * 90000)}`,
      password,
    }),
  });

  const u2GetU1Veh = await user2Client.fetch(`/vehicles/${createdVehicle.id}`);
  assert(u2GetU1Veh.status === 404, 'User 2 cannot read User 1 vehicle (404)');

  const u2PatchU1Veh = await user2Client.fetch(`/vehicles/${createdVehicle.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ variant: 'Hacked Trim' }),
  });
  assert(u2PatchU1Veh.status === 404, 'User 2 cannot edit User 1 vehicle (404)');

  const u2DeleteU1Veh = await user2Client.fetch(`/vehicles/${createdVehicle.id}`, {
    method: 'DELETE',
  });
  assert(u2DeleteU1Veh.status === 404, 'User 2 cannot delete User 1 vehicle (404)');

  // ── Delete Vehicle (DELETE) ─────────────────────────────────────────────
  console.log('\n--- 8. Delete Vehicle (DELETE) & Persistence ---');
  const deleteRes = await userClient.fetch(`/vehicles/${createdVehicle.id}`, {
    method: 'DELETE',
  });
  assert(deleteRes.status === 200, '7a. DELETE /vehicles/:id returns 200');

  // Verify vehicle is completely gone from DB
  const listAfterDelete = await userClient.fetch('/vehicles');
  const listDataAfterDelete = await listAfterDelete.json();
  assert(
    listAfterDelete.status === 200 && listDataAfterDelete.data.length === 0,
    '7b. Vehicle deleted from PostgreSQL — returns to empty state (0 vehicles)'
  );

  const getDeletedRes = await userClient.fetch(`/vehicles/${createdVehicle.id}`);
  assert(getDeletedRes.status === 404, '7c. GET deleted vehicle returns 404');

  // ── Stations Regression ─────────────────────────────────────────────────
  console.log('\n--- 9. Station API Regression Verification ---');
  const stationsRes = await userClient.fetch('/stations');
  const stationsData = await stationsRes.json();
  assert(
    stationsRes.status === 200 && Array.isArray(stationsData.data) && stationsData.data.length > 0,
    '12. Existing station functionality intact'
  );

  console.log('\n========================================================');
  console.log(`📊 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
