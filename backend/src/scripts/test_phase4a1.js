/**
 * backend/src/scripts/test_phase4a1.js
 *
 * Phase 4A.1: Operator Identity and Authorization Foundation Integration Test Suite.
 *
 * Test Coverage:
 *  A. Role & Registration Security (safe defaults, role injection prevention)
 *  B. Unauthenticated & Driver Route Protection (401 & 403 OPERATOR_ROLE_REQUIRED)
 *  C. Cross-CPO Multi-Tenant Isolation & IDOR Rejection (403 CPO_ACCESS_DENIED)
 *  D. Fail-Closed Behavior for Invalid / Missing CPO Association (403 OPERATOR_CPO_REQUIRED)
 *  E. Authorized Operator & Admin Management Workflows
 *  F. Driver Permitted Workflows Regression Invariance (discovery, pricing, wallet)
 */

import pool, { query } from '../config/database.js';

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

async function loginUser(email, password = 'Demo@1234') {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const rawCookies = res.headers.get('set-cookie') || '';
  const tokenMatch = rawCookies.match(/vg_token=([^;]+)/);
  const cookies = tokenMatch ? `vg_token=${tokenMatch[1]}` : '';
  const json = await res.json();

  return {
    status: res.status,
    user: json.data?.user || null,
    cookies,
  };
}

async function registerTestUser(name, email, extraBody = {}) {
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      email,
      password: 'Demo@1234',
      phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}`,
      ...extraBody,
    }),
  });

  const rawCookies = res.headers.get('set-cookie') || '';
  const tokenMatch = rawCookies.match(/vg_token=([^;]+)/);
  const cookies = tokenMatch ? `vg_token=${tokenMatch[1]}` : '';
  const json = await res.json();

  return {
    status: res.status,
    user: json.data?.user || null,
    cookies,
    json,
  };
}

async function main() {
  console.log('\n' + '='.repeat(65));
  console.log('⚡ VahanGrid Phase 4A.1: Operator Identity & Authorization Test Suite');
  console.log('='.repeat(65));

  try {
    // Known seeded IDs
    const TATA_CPO_ID = 'a0000001-0000-0000-0000-000000000001';
    const STATIQ_CPO_ID = 'a0000001-0000-0000-0000-000000000002';
    const TATA_STATION_ID = 'f0000001-0000-0000-0000-000000000001'; // Connaught Place
    const STATIQ_STATION_ID = 'f0000001-0000-0000-0000-000000000002'; // BKC Mobility

    // Logins
    const driverAuth = await loginUser('priya.sharma@example.com');
    const tataOpAuth = await loginUser('operator.tata@example.com');
    const statiqOpAuth = await loginUser('operator.statiq@example.com');
    const adminAuth = await loginUser('admin@vahangrid.com');

    assert('Bootstrap: Driver authenticated', driverAuth.status === 200 && driverAuth.user.role === 'driver');
    assert('Bootstrap: Tata Operator authenticated with CPO', tataOpAuth.status === 200 && tataOpAuth.user.role === 'operator' && tataOpAuth.user.cpo_id === TATA_CPO_ID);
    assert('Bootstrap: Statiq Operator authenticated with CPO', statiqOpAuth.status === 200 && statiqOpAuth.user.role === 'operator' && statiqOpAuth.user.cpo_id === STATIQ_CPO_ID);
    assert('Bootstrap: Admin authenticated with role admin', adminAuth.status === 200 && adminAuth.user.role === 'admin');

    // -------------------------------------------------------------------------
    // A. Role & Registration Security
    // -------------------------------------------------------------------------
    section('A. Role & Registration Security');

    const injectionEmail = `exploit_role_${Date.now()}@example.com`;
    const regRes = await registerTestUser('Role Injection Attacker', injectionEmail, {
      role: 'admin',
      cpo_id: TATA_CPO_ID,
    });
    assert('A1. Public registration ignores client-supplied role:admin', regRes.user.role === 'driver');
    assert('A1. Public registration ignores client-supplied cpo_id', regRes.user.cpo_id === null);

    // Profile PATCH cannot change role
    const patchRes = await fetch(`${BASE_URL}/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: regRes.cookies,
      },
      body: JSON.stringify({
        name: 'Updated Driver Name',
        role: 'operator',
        cpo_id: TATA_CPO_ID,
      }),
    });
    const patchJson = await patchRes.json();
    assert('A2. PATCH /users/me succeeds for name change', patchRes.status === 200 && patchJson.data.user.name === 'Updated Driver Name');
    assert('A2. PATCH /users/me does NOT update role', patchJson.data.user.role === 'driver');
    assert('A2. PATCH /users/me does NOT update cpo_id', patchJson.data.user.cpo_id === null);

    // GET /users/me returns role and cpo_id
    const meRes = await fetch(`${BASE_URL}/users/me`, {
      headers: { Cookie: tataOpAuth.cookies },
    });
    const meJson = await meRes.json();
    assert('A3. GET /users/me exposes role for operator', meJson.data.user.role === 'operator');
    assert('A3. GET /users/me exposes cpo_id for operator', meJson.data.user.cpo_id === TATA_CPO_ID);

    // DB Check constraint rejects invalid role
    let dbConstraintPassed = false;
    try {
      await query(`INSERT INTO users (name, email, password_hash, role) VALUES ('Hacker', 'invalid_role@test.com', 'hash', 'superadmin')`);
    } catch (err) {
      if (err.code === '23514' || (err.message && err.message.includes('chk_user_role'))) {
        dbConstraintPassed = true;
      }
    }
    assert('A4. Database check constraint rejects invalid role (chk_user_role)', dbConstraintPassed);

    // Clean up registration test user
    await query(`DELETE FROM wallets WHERE user_id = $1`, [regRes.user.id]);
    await query(`DELETE FROM users WHERE id = $1`, [regRes.user.id]);

    // -------------------------------------------------------------------------
    // B. Unauthenticated & Driver Route Protection
    // -------------------------------------------------------------------------
    section('B. Unauthenticated & Driver Route Protection');

    // B1-B4 Unauthenticated calls
    const unauthReset = await fetch(`${BASE_URL}/stations/${TATA_STATION_ID}/reset`, { method: 'POST' });
    assert('B1. Unauthenticated POST /stations/:id/reset returns 401', unauthReset.status === 401);

    const unauthAvail = await fetch(`${BASE_URL}/stations/${TATA_STATION_ID}/availability`, { method: 'POST' });
    assert('B2. Unauthenticated POST /stations/:id/availability returns 401', unauthAvail.status === 401);

    const unauthTariffPost = await fetch(`${BASE_URL}/tariffs`, { method: 'POST', body: '{}' });
    assert('B3. Unauthenticated POST /tariffs returns 401', unauthTariffPost.status === 401);

    const unauthTariffGet = await fetch(`${BASE_URL}/tariffs`);
    assert('B4. Unauthenticated GET /tariffs returns 401', unauthTariffGet.status === 401);

    // B5-B10 Driver account calling operator-only operations
    const driverHeaders = {
      'Content-Type': 'application/json',
      Cookie: driverAuth.cookies,
    };

    const driverReset = await fetch(`${BASE_URL}/stations/${TATA_STATION_ID}/reset`, {
      method: 'POST',
      headers: driverHeaders,
      body: JSON.stringify({ type: 'OnIdle' }),
    });
    const driverResetJson = await driverReset.json();
    assert('B5. Driver POST /stations/:id/reset returns 403', driverReset.status === 403);
    assert('B5. Driver POST /stations/:id/reset error code is OPERATOR_ROLE_REQUIRED', driverResetJson.error?.code === 'OPERATOR_ROLE_REQUIRED');

    const driverAvail = await fetch(`${BASE_URL}/stations/${TATA_STATION_ID}/availability`, {
      method: 'POST',
      headers: driverHeaders,
      body: JSON.stringify({ operational_status: 'Inoperative' }),
    });
    const driverAvailJson = await driverAvail.json();
    assert('B6. Driver POST /stations/:id/availability returns 403', driverAvail.status === 403);
    assert('B6. Driver POST /stations/:id/availability error code is OPERATOR_ROLE_REQUIRED', driverAvailJson.error?.code === 'OPERATOR_ROLE_REQUIRED');

    const driverUnlock = await fetch(`${BASE_URL}/stations/${TATA_STATION_ID}/unlock-connector`, {
      method: 'POST',
      headers: driverHeaders,
      body: JSON.stringify({ connector_id: '1' }),
    });
    assert('B7. Driver POST /stations/:id/unlock-connector returns 403', driverUnlock.status === 403);

    const driverProfile = await fetch(`${BASE_URL}/stations/${TATA_STATION_ID}/charging-profiles`, {
      method: 'POST',
      headers: driverHeaders,
      body: JSON.stringify({ charging_profile_id: 1 }),
    });
    assert('B8. Driver POST /stations/:id/charging-profiles returns 403', driverProfile.status === 403);

    const driverTariffCreate = await fetch(`${BASE_URL}/tariffs`, {
      method: 'POST',
      headers: driverHeaders,
      body: JSON.stringify({ name: 'Rogue Tariff', price_per_kwh: 10 }),
    });
    const driverTariffJson = await driverTariffCreate.json();
    assert('B9. Driver POST /tariffs returns 403', driverTariffCreate.status === 403);
    assert('B9. Driver POST /tariffs error code is OPERATOR_ROLE_REQUIRED', driverTariffJson.error?.code === 'OPERATOR_ROLE_REQUIRED');

    const driverTariffList = await fetch(`${BASE_URL}/tariffs`, {
      headers: driverHeaders,
    });
    assert('B10. Driver GET /tariffs returns 403 OPERATOR_ROLE_REQUIRED', driverTariffList.status === 403);

    // -------------------------------------------------------------------------
    // C. Cross-CPO Multi-Tenant Isolation & IDOR Rejection
    // -------------------------------------------------------------------------
    section('C. Cross-CPO Multi-Tenant Isolation & IDOR Rejection');

    const tataHeaders = {
      'Content-Type': 'application/json',
      Cookie: tataOpAuth.cookies,
    };

    // Tata Operator tries to reset Statiq Station
    const crossReset = await fetch(`${BASE_URL}/stations/${STATIQ_STATION_ID}/reset`, {
      method: 'POST',
      headers: tataHeaders,
      body: JSON.stringify({ type: 'OnIdle' }),
    });
    const crossResetJson = await crossReset.json();
    assert('C1. Tata operator resetting Statiq station returns 403', crossReset.status === 403);
    assert('C1. Error code is CPO_ACCESS_DENIED', crossResetJson.error?.code === 'CPO_ACCESS_DENIED');

    // Tata Operator tries to change availability of Statiq Station
    const crossAvail = await fetch(`${BASE_URL}/stations/${STATIQ_STATION_ID}/availability`, {
      method: 'POST',
      headers: tataHeaders,
      body: JSON.stringify({ operational_status: 'Inoperative' }),
    });
    const crossAvailJson = await crossAvail.json();
    assert('C2. Tata operator changing Statiq availability returns 403', crossAvail.status === 403);
    assert('C2. Error code is CPO_ACCESS_DENIED', crossAvailJson.error?.code === 'CPO_ACCESS_DENIED');

    // Tata Operator tries to create tariff explicitly for Statiq CPO
    const crossTariffCreate = await fetch(`${BASE_URL}/tariffs`, {
      method: 'POST',
      headers: tataHeaders,
      body: JSON.stringify({
        name: 'Unauthorized Tariff',
        cpo_id: STATIQ_CPO_ID,
        price_per_kwh: 12.5,
      }),
    });
    const crossTariffJson = await crossTariffCreate.json();
    assert('C3. Tata operator creating tariff for Statiq CPO returns 403', crossTariffCreate.status === 403);
    assert('C3. Error code is CPO_ACCESS_DENIED', crossTariffJson.error?.code === 'CPO_ACCESS_DENIED');

    // Tata Operator tries to attach tariff to Statiq Station
    const crossStationTariff = await fetch(`${BASE_URL}/tariffs`, {
      method: 'POST',
      headers: tataHeaders,
      body: JSON.stringify({
        name: 'Unauthorized Station Tariff',
        location_id: STATIQ_STATION_ID,
        price_per_kwh: 15.0,
      }),
    });
    assert('C4. Tata operator attaching tariff to Statiq station returns 403 CPO_ACCESS_DENIED', crossStationTariff.status === 403);

    // Query an existing Statiq tariff
    const statiqTariffRow = await query(`SELECT id FROM tariffs WHERE cpo_id = $1 LIMIT 1`, [STATIQ_CPO_ID]);
    if (statiqTariffRow.rows.length > 0) {
      const statiqTariffId = statiqTariffRow.rows[0].id;

      // Tata operator attempts to PATCH Statiq tariff
      const crossPatchTariff = await fetch(`${BASE_URL}/tariffs/${statiqTariffId}`, {
        method: 'PATCH',
        headers: tataHeaders,
        body: JSON.stringify({ price_per_kwh: 99.9 }),
      });
      assert('C5. Tata operator updating Statiq tariff returns 403 CPO_ACCESS_DENIED', crossPatchTariff.status === 403);

      // Tata operator attempts to DELETE Statiq tariff
      const crossDelTariff = await fetch(`${BASE_URL}/tariffs/${statiqTariffId}`, {
        method: 'DELETE',
        headers: tataHeaders,
      });
      assert('C5. Tata operator deleting Statiq tariff returns 403 CPO_ACCESS_DENIED', crossDelTariff.status === 403);
    } else {
      console.log('  ⚠️  Note: No Statiq tariff in DB, skipping direct tariff patch IDOR check');
    }

    // Tata Operator listing tariffs with Statiq query param gets ONLY Tata tariffs
    const listCrossTariffs = await fetch(`${BASE_URL}/tariffs?cpo_id=${STATIQ_CPO_ID}`, {
      headers: tataHeaders,
    });
    const listCrossJson = await listCrossTariffs.json();
    assert('C6. GET /tariffs succeeds for Tata operator', listCrossTariffs.status === 200);
    const nonTataTariffs = (listCrossJson.data || []).filter(t => t.cpo_id !== TATA_CPO_ID);
    assert('C6. Filter enforced: Zero non-Tata tariffs returned to Tata operator', nonTataTariffs.length === 0);

    // -------------------------------------------------------------------------
    // D. Fail-Closed Behavior for Invalid / Missing CPO Association
    // -------------------------------------------------------------------------
    section('D. Fail-Closed Behavior for Invalid / Missing CPO Association');

    const orphanEmail = `orphan_op_${Date.now()}@example.com`;
    const orphanInsert = await query(`
      INSERT INTO users (name, email, password_hash, role, cpo_id)
      VALUES ('Orphan Operator', $1, '$2b$10$fStmN8G.SgwA3jIbiV2u6eiwJ8c9lWTxvecl1AsWEKhOVbGTevG9S', 'operator', NULL)
      RETURNING id
    `, [orphanEmail]);
    const orphanId = orphanInsert.rows[0].id;

    const orphanLogin = await loginUser(orphanEmail);
    assert('D1. Orphan operator logged in with cpo_id = null', orphanLogin.status === 200 && orphanLogin.user.cpo_id === null);

    const orphanHeaders = {
      'Content-Type': 'application/json',
      Cookie: orphanLogin.cookies,
    };

    const orphanStationOp = await fetch(`${BASE_URL}/stations/${TATA_STATION_ID}/reset`, {
      method: 'POST',
      headers: orphanHeaders,
      body: JSON.stringify({ type: 'OnIdle' }),
    });
    const orphanStationJson = await orphanStationOp.json();
    assert('D2. Orphan operator rejected from station management (403)', orphanStationOp.status === 403);
    assert('D2. Error code is OPERATOR_CPO_REQUIRED', orphanStationJson.error?.code === 'OPERATOR_CPO_REQUIRED');

    const orphanTariffOp = await fetch(`${BASE_URL}/tariffs`, {
      method: 'POST',
      headers: orphanHeaders,
      body: JSON.stringify({ name: 'Orphan Tariff', price_per_kwh: 10 }),
    });
    const orphanTariffJson = await orphanTariffOp.json();
    assert('D3. Orphan operator rejected from tariff management (403)', orphanTariffOp.status === 403);
    assert('D3. Error code is OPERATOR_CPO_REQUIRED', orphanTariffJson.error?.code === 'OPERATOR_CPO_REQUIRED');

    // Cleanup orphan user
    await query(`DELETE FROM users WHERE id = $1`, [orphanId]);

    // -------------------------------------------------------------------------
    // E. Authorized Operator & Admin Management Workflows
    // -------------------------------------------------------------------------
    section('E. Authorized Operator & Admin Workflows');

    // Tata operator managing Tata station passes authorization
    // Note: since simulated device is not currently connected to WS, downstream returns 503 DEVICE_OFFLINE or 200,
    // but the critical invariant is that it PASSES authorization (NOT 403 or 401).
    const authReset = await fetch(`${BASE_URL}/stations/${TATA_STATION_ID}/reset`, {
      method: 'POST',
      headers: tataHeaders,
      body: JSON.stringify({ type: 'OnIdle' }),
    });
    assert('E1. Tata operator passes auth for Tata station reset (status is NOT 401 or 403)', authReset.status !== 401 && authReset.status !== 403);

    // Tata operator creating a tariff for Tata Power
    const createTariffRes = await fetch(`${BASE_URL}/tariffs`, {
      method: 'POST',
      headers: tataHeaders,
      body: JSON.stringify({
        name: 'Tata Off-Peak Night Saver',
        price_per_kwh: 11.50,
        session_fee: 25.00,
        tax_rate: 0.18,
      }),
    });
    const createTariffJson = await createTariffRes.json();
    assert('E2. Tata operator successfully creates Tata tariff (201)', createTariffRes.status === 201);
    const createdTariffId = createTariffJson.data?.id;
    assert('E2. Created tariff cpo_id is automatically set to Tata CPO', createTariffJson.data?.cpo_id === TATA_CPO_ID);

    // Tata operator updates their own tariff
    const updateTariffRes = await fetch(`${BASE_URL}/tariffs/${createdTariffId}`, {
      method: 'PATCH',
      headers: tataHeaders,
      body: JSON.stringify({
        price_per_kwh: 12.00,
      }),
    });
    const updateTariffJson = await updateTariffRes.json();
    assert('E3. Tata operator updates own tariff (200)', updateTariffRes.status === 200 && Number(updateTariffJson.data.price_per_kwh) === 12.00);

    // Admin headers
    const adminHeaders = {
      'Content-Type': 'application/json',
      Cookie: adminAuth.cookies,
    };

    // Platform Super Admin managing Statiq station passes authorization
    const adminReset = await fetch(`${BASE_URL}/stations/${STATIQ_STATION_ID}/reset`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ type: 'OnIdle' }),
    });
    assert('E4. Admin passes auth for Statiq station reset (status is NOT 401 or 403)', adminReset.status !== 401 && adminReset.status !== 403);

    // Admin updates the Tata tariff
    const adminPatchTariff = await fetch(`${BASE_URL}/tariffs/${createdTariffId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ description: 'Admin approved special rate' }),
    });
    assert('E5. Admin passes auth for tariff update across CPO (200)', adminPatchTariff.status === 200);

    // Clean up created tariff
    await query(`DELETE FROM tariffs WHERE id = $1`, [createdTariffId]);

    // -------------------------------------------------------------------------
    // F. Driver Permitted Workflows Regression Invariance
    // -------------------------------------------------------------------------
    section('F. Driver Permitted Workflows Regression Invariance');

    // Discovery
    const stationsRes = await fetch(`${BASE_URL}/stations`);
    assert('F1. Driver can discover stations (200)', stationsRes.status === 200);

    const stationDetailRes = await fetch(`${BASE_URL}/stations/${TATA_STATION_ID}`);
    assert('F1. Driver can view station detail (200)', stationDetailRes.status === 200);

    // Station Tariff Resolution
    const stationTariffRes = await fetch(`${BASE_URL}/stations/${TATA_STATION_ID}/tariff`);
    assert('F2. Driver can resolve station tariff (200)', stationTariffRes.status === 200);

    // Tariff Pricing Calculation
    const calcRes = await fetch(`${BASE_URL}/tariffs/calculate`, {
      method: 'POST',
      headers: driverHeaders,
      body: JSON.stringify({
        tariff: {
          price_per_kwh: 15.0,
          session_fee: 20.0,
          price_per_minute: 0,
          idle_fee_per_minute: 0,
          tax_rate: 0.18,
        },
        metrics: {
          energy_kwh: 20.0,
          duration_minutes: 30,
        },
      }),
    });
    assert('F3. Driver can calculate pricing via /tariffs/calculate (200)', calcRes.status === 200);

    // Resolve Tariff
    const resolveRes = await fetch(`${BASE_URL}/tariffs/resolve?location_id=${TATA_STATION_ID}`, {
      headers: driverHeaders,
    });
    assert('F4. Driver can resolve applicable tariff via /tariffs/resolve (200)', resolveRes.status === 200);

    // Session History
    const sessionsRes = await fetch(`${BASE_URL}/sessions`, {
      headers: driverHeaders,
    });
    assert('F5. Driver can view session history (200)', sessionsRes.status === 200);

    // Wallet Balance
    const walletRes = await fetch(`${BASE_URL}/wallet`, {
      headers: driverHeaders,
    });
    assert('F6. Driver can access wallet balance (200)', walletRes.status === 200);

  } catch (err) {
    console.error('\n❌ Unhandled test runner error:', err);
    failed++;
    errors.push(err.message);
  } finally {
    console.log('\n' + '='.repeat(65));
    console.log(`Phase 4A.1 Test Summary: Passed: ${passed}, Failed: ${failed}`);
    console.log('='.repeat(65));
    if (failed > 0) {
      console.error('\nFailed tests:\n' + errors.map(e => ` - ${e}`).join('\n'));
      process.exit(1);
    } else {
      console.log('\n🎉 All Phase 4A.1 authorization tests passed successfully!\n');
      process.exit(0);
    }
  }
}

main();
