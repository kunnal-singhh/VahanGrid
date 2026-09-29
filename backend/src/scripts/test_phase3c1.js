/**
 * backend/src/scripts/test_phase3c1.js
 *
 * Automated verification suite for Phase 3C.1 — Frontend Authentication Integration.
 *
 * Simulates browser client interactions with credentials: 'include',
 * cookie storage, session restoration across refresh, registration, login,
 * error handling, and logout.
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
  console.log('🧪 Starting Phase 3C.1 Frontend Auth Verification Suite');
  console.log('========================================================\n');

  const client = new BrowserClient();
  const timestamp = Date.now();
  const testEmail = `driver_ui_${timestamp}@vahangrid.in`;
  const testPhone = `+9198765${Math.floor(10000 + Math.random() * 90000)}`;
  const password = 'StrongPassword@123';

  // 1 & 2: Initial unauthenticated check
  console.log('--- 1. Initial State / Unauthenticated Check ---');
  const initialMeRes = await client.fetch('/auth/me');
  assert(initialMeRes.status === 401, '1 & 2. Initial /auth/me returns 401 (guest state)');
  assert(!client.cookieJar['vg_token'], 'No auth cookie present in clean browser session');

  // 6. Registration invalid input
  console.log('\n--- 2. Registration Input Validation ---');
  const shortPassRes = await client.fetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Vikram', email: 'test@vahangrid.in', password: 'short' }),
  });
  assert(shortPassRes.status === 400, '6a. Password < 8 characters rejected with 400');

  const invalidEmailRes = await client.fetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Vikram', email: 'not-an-email', password }),
  });
  assert(invalidEmailRes.status === 400, '6b. Invalid email format rejected with 400');

  // 3. Registration success
  console.log('\n--- 3. Registration Success ---');
  const regRes = await client.fetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Aarav Sharma',
      email: testEmail,
      phone: testPhone,
      password,
    }),
  });
  const regData = await regRes.json();
  assert(regRes.status === 201 && regData.data?.user?.id, '3. Registration succeeds with 201 and safe user profile');
  assert(regData.data?.user?.name === 'Aarav Sharma', 'Registered user has correct name');
  assert(regData.data?.user?.email === testEmail, 'Registered user has correct email');
  assert(!regData.data?.user?.password_hash, 'Security: password_hash is NOT exposed');
  assert(Boolean(client.cookieJar['vg_token']), 'Security: HTTP-only cookie vg_token received and stored by client');

  // 4. Duplicate email
  console.log('\n--- 4. Conflict Handling ---');
  const dupEmailRes = await client.fetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Another User',
      email: testEmail,
      phone: `+9198765${Math.floor(10000 + Math.random() * 90000)}`,
      password,
    }),
  });
  const dupEmailData = await dupEmailRes.json();
  assert(
    dupEmailRes.status === 409 &&
      (dupEmailData.error?.code === 'USER_EXISTS' || dupEmailData.error?.code === 'DUPLICATE_EMAIL'),
    '4. Duplicate email registration rejected with 409'
  );

  // 5. Duplicate phone
  const dupPhoneRes = await client.fetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Another User 2',
      email: `other_${timestamp}@vahangrid.in`,
      phone: testPhone,
      password,
    }),
  });
  const dupPhoneData = await dupPhoneRes.json();
  assert(
    dupPhoneRes.status === 409 &&
      (dupPhoneData.error?.code === 'PHONE_EXISTS' || dupPhoneData.error?.code === 'DUPLICATE_PHONE'),
    '5. Duplicate phone registration rejected with 409'
  );

  // 12. Logout
  console.log('\n--- 5. Logout Flow ---');
  const logoutRes = await client.fetch('/auth/logout', { method: 'POST' });
  assert(logoutRes.status === 200, '12a. POST /auth/logout returns 200');
  assert(!client.cookieJar['vg_token'], '12b. HTTP-only cookie vg_token cleared after logout');

  // 13. Protected UI inaccessible after logout
  const postLogoutMe = await client.fetch('/auth/me');
  assert(postLogoutMe.status === 401, '13. GET /auth/me returns 401 after logout (protected UI inaccessible)');

  // 8. Login wrong password
  console.log('\n--- 6. Login Validation & Execution ---');
  const wrongPassRes = await client.fetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testEmail, password: 'WrongPassword999!' }),
  });
  const wrongPassData = await wrongPassRes.json();
  assert(
    wrongPassRes.status === 401 && wrongPassData.error?.code === 'INVALID_CREDENTIALS',
    '8. Login with wrong password rejected with 401 INVALID_CREDENTIALS'
  );

  // 7. Login success
  const loginRes = await client.fetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testEmail, password }),
  });
  const loginData = await loginRes.json();
  assert(loginRes.status === 200 && loginData.data?.user?.email === testEmail, '7. Login success returns 200 and safe user object');
  assert(Boolean(client.cookieJar['vg_token']), '9. HTTP-only cookie set on successful login');

  // 10 & 11. Refresh browser test (calling /auth/me with existing cookie)
  console.log('\n--- 7. Session Persistence (Browser Refresh Simulation) ---');
  const refreshMeRes = await client.fetch('/auth/me');
  const refreshMeData = await refreshMeRes.json();
  assert(refreshMeRes.status === 200, '10. /auth/me succeeds using preserved HTTP-only cookie');
  assert(refreshMeData.data?.user?.id === regData.data.user.id, '11. User identity restored accurately after simulated browser reload');

  // 14. Second client login
  console.log('\n--- 8. Multi-Session / Re-login Verification ---');
  const client2 = new BrowserClient();
  const login2Res = await client2.fetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testEmail, password }),
  });
  assert(login2Res.status === 200, '14. Re-login works smoothly in fresh browser instance');

  // 15 & 16. Station and Nearby APIs Regression Check
  console.log('\n--- 9. Station & Map Regression Verification ---');
  const stationsRes = await client.fetch('/stations');
  const stationsData = await stationsRes.json();
  assert(stationsRes.status === 200 && Array.isArray(stationsData.data) && stationsData.data.length > 0, '15. Station list API operates without regression');

  const nearbyRes = await client.fetch('/stations/nearby?lat=28.6315&lng=77.2167&radius_km=50');
  const nearbyData = await nearbyRes.json();
  assert(nearbyRes.status === 200 && Array.isArray(nearbyData.data), '16. Station spatial nearby API operates without regression');

  console.log('\n========================================================');
  console.log(`📊 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
