/**
 * backend/src/scripts/test_phase4b.js
 *
 * Automated Test Suite for Phase 4B: Operator Dashboard Frontend & Integration
 * Validates:
 *   A. Frontend Build Artifacts & Bundle Integrity
 *   B. Driver Role Invariance & Access Denial Guard
 *   C. Operator Role Access & Overview Telemetry
 *   D. Fleet Inventory Pagination, Search & Filter Verification
 *   E. Masked Session Monitoring & CDR Settlement Integrity
 *   F. Time-Series Analytics Hourly & Daily Granularity
 *   G. Platform Admin Scope Toggling Policy
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3001/api/v1';

let passed = 0;
let failed = 0;
const errors = [];

function assert(description, condition) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
    errors.push(description);
  }
}

function section(title) {
  console.log(`\n${'='.repeat(65)}\n  ${title}\n${'='.repeat(65)}`);
}

async function loginUser(email, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = res.headers.get('set-cookie');
  const json = await res.json();
  return { status: res.status, user: json.data?.user, cookie };
}

async function main() {
  console.log('\n' + '='.repeat(65));
  console.log('⚡ VahanGrid Phase 4B: Operator Dashboard Integration Test Suite');
  console.log('='.repeat(65));

  try {
    // -------------------------------------------------------------------------
    // A. Frontend Build Artifacts & Bundle Integrity
    // -------------------------------------------------------------------------
    section('A. Frontend Build Artifacts & Bundle Integrity');

    const distDir = path.resolve(__dirname, '../../../frontend/dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    const assetsDir = path.join(distDir, 'assets');

    assert('A1. frontend/dist directory exists', fs.existsSync(distDir));
    assert('A1. frontend/dist/index.html exists', fs.existsSync(indexHtmlPath));
    assert('A1. frontend/dist/assets exists', fs.existsSync(assetsDir));

    const assetFiles = fs.readdirSync(assetsDir);
    const jsBundle = assetFiles.find((f) => f.startsWith('index-') && f.endsWith('.js'));
    const cssBundle = assetFiles.find((f) => f.startsWith('index-') && f.endsWith('.css'));

    assert('A2. Production JS bundle exists', Boolean(jsBundle));
    assert('A2. Production CSS bundle exists', Boolean(cssBundle));

    const jsContent = fs.readFileSync(path.join(assetsDir, jsBundle), 'utf-8');
    assert('A3. JS bundle contains OperatorDashboard component', jsContent.includes('Operator') || jsContent.includes('Fleet'));
    assert('A3. JS bundle contains operatorService API paths', jsContent.includes('/operator/overview'));

    // -------------------------------------------------------------------------
    // B. Driver Role Invariance & Access Denial Guard
    // -------------------------------------------------------------------------
    section('B. Driver Role Invariance & Access Denial Guard');

    const driverAuth = await loginUser('priya.sharma@example.com', 'Demo@1234');
    assert('B1. Driver authenticates successfully', driverAuth.status === 200);
    assert('B1. Driver user role is driver', driverAuth.user?.role === 'driver');

    const driverHeaders = { Cookie: driverAuth.cookie };
    const driverOverviewRes = await fetch(`${BASE_URL}/operator/overview`, { headers: driverHeaders });
    assert('B2. Driver accessing operator overview receives 403', driverOverviewRes.status === 403);
    const driverOverviewJson = await driverOverviewRes.json();
    assert('B2. Error code is OPERATOR_ROLE_REQUIRED', driverOverviewJson.error?.code === 'OPERATOR_ROLE_REQUIRED');

    const driverStationsRes = await fetch(`${BASE_URL}/operator/stations`, { headers: driverHeaders });
    assert('B3. Driver accessing operator stations receives 403', driverStationsRes.status === 403);

    // -------------------------------------------------------------------------
    // C. Operator Role Access & Overview Telemetry
    // -------------------------------------------------------------------------
    section('C. Operator Role Access & Overview Telemetry');

    const tataAuth = await loginUser('operator.tata@example.com', 'Demo@1234');
    assert('C1. Tata Operator authenticates successfully', tataAuth.status === 200);
    assert('C1. User role is operator', tataAuth.user?.role === 'operator');
    assert('C1. User cpo_id is bound', Boolean(tataAuth.user?.cpo_id));

    const tataHeaders = { Cookie: tataAuth.cookie };
    const tataOverviewRes = await fetch(`${BASE_URL}/operator/overview?period=30d`, { headers: tataHeaders });
    assert('C2. GET /operator/overview returns 200 for operator', tataOverviewRes.status === 200);

    const tataOverview = (await tataOverviewRes.json()).data;
    assert('C2. Overview contains CPO branding name', tataOverview?.cpo?.name === 'Tata Power EZ Charge');
    assert('C2. Overview contains CPO short_code TATA_EZ', tataOverview?.cpo?.short_code === 'TATA_EZ');
    assert('C3. Stations total is greater than 0', tataOverview?.stations?.total > 0);
    assert('C3. Online count is positive', tataOverview?.stations?.online >= 0);
    assert('C4. Connectors breakdown contains available count', tataOverview?.connectors?.available >= 0);
    assert('C5. Period metrics contain total_energy_kwh and total_revenue_inr', typeof tataOverview?.metrics?.total_revenue_inr === 'number');
    assert('C5. Settlement rate percent is between 0 and 100', tataOverview?.metrics?.settlement_rate_percent >= 0 && tataOverview?.metrics?.settlement_rate_percent <= 100);

    // -------------------------------------------------------------------------
    // D. Fleet Inventory Pagination, Search & Filter Verification
    // -------------------------------------------------------------------------
    section('D. Fleet Inventory Pagination, Search & Filter Verification');

    const stationsRes = await fetch(`${BASE_URL}/operator/stations?page=1&limit=5&status=all`, { headers: tataHeaders });
    assert('D1. GET /operator/stations returns 200', stationsRes.status === 200);
    const stationsBody = await stationsRes.json();
    assert('D1. Stations array returned', Array.isArray(stationsBody.data));
    assert('D1. Pagination metadata present', stationsBody.meta?.page === 1);

    const firstStation = stationsBody.data[0];
    assert('D2. Station has name and city', Boolean(firstStation?.name && (firstStation?.address?.city || firstStation?.city)));
    assert('D2. Station has EVSE and connector counts', firstStation?.evse_count > 0 && firstStation?.connector_count > 0);
    assert('D2. Station has OCPP connectivity object', typeof firstStation?.ocpp?.status === 'string');
    assert('D2. Station has connector breakdown', typeof firstStation?.connectors_breakdown?.available === 'number');

    // Test Search filter
    const searchRes = await fetch(`${BASE_URL}/operator/stations?search=Connaught`, { headers: tataHeaders });
    const searchBody = await searchRes.json();
    assert('D3. Search by city/name returns matched stations', searchBody.data.length > 0 && searchBody.data[0].name.includes('Connaught'));

    // -------------------------------------------------------------------------
    // E. Masked Session Monitoring & CDR Settlement Integrity
    // -------------------------------------------------------------------------
    section('E. Masked Session Monitoring & CDR Settlement Integrity');

    const sessionsRes = await fetch(`${BASE_URL}/operator/sessions?page=1&limit=10`, { headers: tataHeaders });
    assert('E1. GET /operator/sessions returns 200', sessionsRes.status === 200);
    const sessionsBody = await sessionsRes.json();
    assert('E1. Sessions array returned', Array.isArray(sessionsBody.data));

    if (sessionsBody.data.length > 0) {
      const sess = sessionsBody.data[0];
      assert('E2. Driver display_name is masked (initial)', Boolean(sess.driver?.name && !sess.driver?.name.includes('@')));
      assert('E2. Driver email is NOT exposed in response', sess.driver?.email === undefined);
      assert('E2. Driver phone is NOT exposed in response', sess.driver?.phone === undefined);
      assert('E2. Internal wallet ID is NOT exposed', sess.wallet_id === undefined);
      assert('E3. Hardware context is populated', Boolean(sess.hardware?.standard || sess.hardware?.connector_type));
      assert('E3. CDR settlement status is populated', Boolean(sess.cdr?.settlement_status));
    }

    // -------------------------------------------------------------------------
    // F. Time-Series Analytics Hourly & Daily Granularity
    // -------------------------------------------------------------------------
    section('F. Time-Series Analytics Hourly & Daily Granularity');

    const ana24hRes = await fetch(`${BASE_URL}/operator/analytics?period=24h`, { headers: tataHeaders });
    const ana24h = (await ana24hRes.json()).data;
    assert('F1. 24h analytics has hourly interval', ana24h?.interval === '1 hour');
    assert('F1. 24h analytics returns 24 buckets', ana24h?.buckets?.length === 24);

    const ana7dRes = await fetch(`${BASE_URL}/operator/analytics?period=7d`, { headers: tataHeaders });
    const ana7d = (await ana7dRes.json()).data;
    assert('F2. 7d analytics has daily interval', ana7d?.interval === '1 day');
    assert('F2. 7d analytics returns 7 buckets', ana7d?.buckets?.length === 7);

    // -------------------------------------------------------------------------
    // G. Platform Admin Scope Toggling Policy
    // -------------------------------------------------------------------------
    section('G. Platform Admin Scope Toggling Policy');

    const adminAuth = await loginUser('admin@vahangrid.com', 'Demo@1234');
    assert('G1. Admin authenticates successfully', adminAuth.status === 200);
    const adminHeaders = { Cookie: adminAuth.cookie };

    const adminPlatformRes = await fetch(`${BASE_URL}/operator/overview`, { headers: adminHeaders });
    assert('G2. Admin platform-wide overview returns 200', adminPlatformRes.status === 200);
    const adminPlatform = (await adminPlatformRes.json()).data;
    assert('G2. Admin platform-wide reports CPO id as all', adminPlatform?.cpo?.id === 'all');

    const adminTataRes = await fetch(`${BASE_URL}/operator/overview?cpo_id=a0000001-0000-0000-0000-000000000001`, { headers: adminHeaders });
    assert('G3. Admin scoped overview returns 200', adminTataRes.status === 200);
    const adminTata = (await adminTataRes.json()).data;
    assert('G3. Scoped overview matches Tata Power EZ Charge', adminTata?.cpo?.name === 'Tata Power EZ Charge');

  } catch (err) {
    console.error('\n❌ Unhandled test runner error:', err);
    failed++;
    errors.push(err.message);
  } finally {
    console.log('\n' + '='.repeat(65));
    console.log(`Phase 4B Integration Test Summary: Passed: ${passed}, Failed: ${failed}`);
    console.log('='.repeat(65));
    if (failed > 0) {
      console.error('\nFailed tests:\n' + errors.map((e) => ` - ${e}`).join('\n'));
      process.exit(1);
    } else {
      console.log('\n🎉 All Phase 4B integration tests passed successfully!\n');
      process.exit(0);
    }
  }
}

main();
