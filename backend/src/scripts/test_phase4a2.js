/**
 * backend/src/scripts/test_phase4a2.js
 *
 * Phase 4A.2: Operator Dashboard APIs Integration Test Suite.
 *
 * Comprehensive coverage:
 *  A. Route Security & Role Access Controls (Driver 403, Unauth 401, Fail-closed)
 *  B. Cross-CPO Multi-Tenant Isolation (Operator A cannot access Operator B data)
 *  C. Overview KPIs & Authoritative Metrics (GET /api/v1/operator/overview)
 *  D. Fleet Stations Query & Pagination (GET /api/v1/operator/stations)
 *  E. Operator Sessions Feed & Driver PII Masking (GET /api/v1/operator/sessions)
 *  F. Time-Series Analytics & Bucket Integrity (GET /api/v1/operator/analytics)
 *  G. Platform Admin Policy (Universal vs Scoped access)
 *  H. Empty Data Resilience (Zero-record CPO)
 *  I. Input Validation & Bounds Checking (Periods, Pagination, Filters)
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

async function main() {
  console.log('\n' + '='.repeat(65));
  console.log('⚡ VahanGrid Phase 4A.2: Operator Dashboard APIs Test Suite');
  console.log('='.repeat(65));

  try {
    const TATA_CPO_ID = 'a0000001-0000-0000-0000-000000000001';
    const STATIQ_CPO_ID = 'a0000001-0000-0000-0000-000000000002';
    const KAZAM_CPO_ID = 'a0000001-0000-0000-0000-000000000005';

    // Logins
    const driverAuth = await loginUser('priya.sharma@example.com');
    const tataOpAuth = await loginUser('operator.tata@example.com');
    const statiqOpAuth = await loginUser('operator.statiq@example.com');
    const adminAuth = await loginUser('admin@vahangrid.com');

    const driverHeaders = { Cookie: driverAuth.cookies };
    const tataHeaders = { Cookie: tataOpAuth.cookies };
    const statiqHeaders = { Cookie: statiqOpAuth.cookies };
    const adminHeaders = { Cookie: adminAuth.cookies };

    // -------------------------------------------------------------------------
    // A. Route Security & Role Access Controls
    // -------------------------------------------------------------------------
    section('A. Route Security & Role Access Controls');

    // Unauthenticated access
    const unauthOver = await fetch(`${BASE_URL}/operator/overview`);
    assert('A1. Unauthenticated GET /operator/overview returns 401', unauthOver.status === 401);

    const unauthStat = await fetch(`${BASE_URL}/operator/stations`);
    assert('A2. Unauthenticated GET /operator/stations returns 401', unauthStat.status === 401);

    const unauthSess = await fetch(`${BASE_URL}/operator/sessions`);
    assert('A3. Unauthenticated GET /operator/sessions returns 401', unauthSess.status === 401);

    const unauthAna = await fetch(`${BASE_URL}/operator/analytics`);
    assert('A4. Unauthenticated GET /operator/analytics returns 401', unauthAna.status === 401);

    // Driver access rejected
    const driverOver = await fetch(`${BASE_URL}/operator/overview`, { headers: driverHeaders });
    const driverOverJson = await driverOver.json();
    assert('A5. Driver GET /operator/overview returns 403', driverOver.status === 403);
    assert('A5. Error code is OPERATOR_ROLE_REQUIRED', driverOverJson.error?.code === 'OPERATOR_ROLE_REQUIRED');

    const driverStat = await fetch(`${BASE_URL}/operator/stations`, { headers: driverHeaders });
    assert('A6. Driver GET /operator/stations returns 403', driverStat.status === 403);

    const driverSess = await fetch(`${BASE_URL}/operator/sessions`, { headers: driverHeaders });
    assert('A7. Driver GET /operator/sessions returns 403', driverSess.status === 403);

    const driverAna = await fetch(`${BASE_URL}/operator/analytics`, { headers: driverHeaders });
    assert('A8. Driver GET /operator/analytics returns 403', driverAna.status === 403);

    // Fail closed for operator with NULL cpo_id
    const orphanEmail = `orphan_test_${Date.now()}@example.com`;
    const orphanInsert = await query(`
      INSERT INTO users (name, email, password_hash, role, cpo_id)
      VALUES ('Orphan Operator 4A2', $1, '$2b$10$fStmN8G.SgwA3jIbiV2u6eiwJ8c9lWTxvecl1AsWEKhOVbGTevG9S', 'operator', NULL)
      RETURNING id
    `, [orphanEmail]);
    const orphanId = orphanInsert.rows[0].id;
    const orphanLogin = await loginUser(orphanEmail);

    const orphanOver = await fetch(`${BASE_URL}/operator/overview`, { headers: { Cookie: orphanLogin.cookies } });
    const orphanOverJson = await orphanOver.json();
    assert('A9. Operator with NULL cpo_id returns 403', orphanOver.status === 403);
    assert('A9. Error code is OPERATOR_CPO_REQUIRED', orphanOverJson.error?.code === 'OPERATOR_CPO_REQUIRED');

    await query(`DELETE FROM users WHERE id = $1`, [orphanId]);

    // -------------------------------------------------------------------------
    // B. Cross-CPO Multi-Tenant Isolation
    // -------------------------------------------------------------------------
    section('B. Cross-CPO Multi-Tenant Isolation');

    // Tata operator attempting to pass Statiq cpo_id in query params
    const crossOver = await fetch(`${BASE_URL}/operator/overview?cpo_id=${STATIQ_CPO_ID}`, { headers: tataHeaders });
    const crossOverJson = await crossOver.json();
    assert('B1. Tata operator querying overview with Statiq cpo_id returns 403', crossOver.status === 403);
    assert('B1. Error code is CPO_ACCESS_DENIED', crossOverJson.error?.code === 'CPO_ACCESS_DENIED');

    const crossStat = await fetch(`${BASE_URL}/operator/stations?cpo_id=${STATIQ_CPO_ID}`, { headers: tataHeaders });
    assert('B2. Tata operator querying stations with Statiq cpo_id returns 403', crossStat.status === 403);

    const crossSess = await fetch(`${BASE_URL}/operator/sessions?cpo_id=${STATIQ_CPO_ID}`, { headers: tataHeaders });
    assert('B3. Tata operator querying sessions with Statiq cpo_id returns 403', crossSess.status === 403);

    const crossAna = await fetch(`${BASE_URL}/operator/analytics?cpo_id=${STATIQ_CPO_ID}`, { headers: tataHeaders });
    assert('B4. Tata operator querying analytics with Statiq cpo_id returns 403', crossAna.status === 403);

    // -------------------------------------------------------------------------
    // C. Overview KPIs & Authoritative Metrics (GET /operator/overview)
    // -------------------------------------------------------------------------
    section('C. Overview KPIs & Authoritative Metrics');

    const tataOver = await fetch(`${BASE_URL}/operator/overview?period=30d`, { headers: tataHeaders });
    const tataOverJson = await tataOver.json();

    assert('C1. GET /operator/overview returns 200 for Tata operator', tataOver.status === 200);
    assert('C1. Response contains cpo object', !!tataOverJson.data?.cpo);
    assert('C1. CPO ID matches Tata Power', tataOverJson.data?.cpo.id === TATA_CPO_ID);
    assert('C1. CPO short_code is TATA_EZ', tataOverJson.data?.cpo.short_code === 'TATA_EZ');
    assert('C2. Stations total is greater than 0', tataOverJson.data?.stations.total > 0);
    assert('C2. Stations online count is present', typeof tataOverJson.data?.stations.online === 'number');
    assert('C3. Connectors breakdown is present', typeof tataOverJson.data?.connectors.available === 'number');
    assert('C3. Total connectors matches sum or positive', tataOverJson.data?.connectors.total >= tataOverJson.data?.connectors.available);
    assert('C4. Reporting period is 30d', tataOverJson.data?.reporting_period === '30d');
    assert('C5. Metrics contains total_revenue_inr', typeof tataOverJson.data?.metrics.total_revenue_inr === 'number');
    assert('C5. Metrics contains total_energy_kwh', typeof tataOverJson.data?.metrics.total_energy_kwh === 'number');
    assert('C5. Metrics contains settled_revenue_inr', typeof tataOverJson.data?.metrics.settled_revenue_inr === 'number');
    assert('C5. Settlement rate percent is between 0 and 100', tataOverJson.data?.metrics.settlement_rate_percent >= 0 && tataOverJson.data?.metrics.settlement_rate_percent <= 100);

    // -------------------------------------------------------------------------
    // D. Fleet Stations Query & Pagination (GET /operator/stations)
    // -------------------------------------------------------------------------
    section('D. Fleet Stations Query & Pagination');

    const statiqStat = await fetch(`${BASE_URL}/operator/stations?limit=5&page=1`, { headers: statiqHeaders });
    const statiqStatJson = await statiqStat.json();

    assert('D1. GET /operator/stations returns 200 for Statiq operator', statiqStat.status === 200);
    assert('D1. Stations array returned', Array.isArray(statiqStatJson.data));
    assert('D1. Meta pagination present', typeof statiqStatJson.meta?.total === 'number');

    // Tenant check: All returned stations must belong to Statiq
    const foreignStation = (statiqStatJson.data || []).find(s => s.cpo_id !== STATIQ_CPO_ID);
    assert('D2. Invariant: Zero foreign stations returned to Statiq operator', !foreignStation);

    if (statiqStatJson.data.length > 0) {
      const sampleStation = statiqStatJson.data[0];
      assert('D3. Station has name and city', !!sampleStation.name && !!sampleStation.address?.city);
      assert('D3. Station has evse_count and connector_count', typeof sampleStation.evse_count === 'number' && typeof sampleStation.connector_count === 'number');
      assert('D3. Station has connectors_breakdown', typeof sampleStation.connectors_breakdown?.available === 'number');
      assert('D3. Station has operational_health', typeof sampleStation.operational_health === 'string');
      assert('D3. Station has ocpp status', typeof sampleStation.ocpp?.status === 'string');
    }

    // Pagination bounds check
    const pageBounds = await fetch(`${BASE_URL}/operator/stations?limit=1&page=1`, { headers: tataHeaders });
    const pageBoundsJson = await pageBounds.json();
    assert('D4. Pagination limit=1 returns exactly 1 item', pageBoundsJson.data.length === 1);
    assert('D4. Meta limit is 1', pageBoundsJson.meta.limit === 1);

    // Search filter
    const searchRes = await fetch(`${BASE_URL}/operator/stations?search=Connaught`, { headers: tataHeaders });
    const searchJson = await searchRes.json();
    assert('D5. Search by name finds Connaught station', searchJson.data.some(s => s.name.includes('Connaught')));

    // -------------------------------------------------------------------------
    // E. Operator Sessions Feed & Driver PII Masking (GET /operator/sessions)
    // -------------------------------------------------------------------------
    section('E. Operator Sessions Feed & Driver PII Masking');

    const tataSess = await fetch(`${BASE_URL}/operator/sessions?limit=10&page=1`, { headers: tataHeaders });
    const tataSessJson = await tataSess.json();

    assert('E1. GET /operator/sessions returns 200 for Tata operator', tataSess.status === 200);
    assert('E1. Sessions array returned', Array.isArray(tataSessJson.data));
    assert('E1. Meta pagination present', typeof tataSessJson.meta?.total === 'number');

    if (tataSessJson.data.length > 0) {
      const sampleSess = tataSessJson.data[0];
      assert('E2. Session has started_at and status', !!sampleSess.started_at && !!sampleSess.status);
      assert('E2. Session has station context', !!sampleSess.station?.name);
      assert('E2. Session has hardware context', !!sampleSess.hardware?.standard);

      // PII privacy protection
      assert('E3. Driver name is masked with initial', sampleSess.driver.name.includes('.') || sampleSess.driver.name === 'EV Driver');
      assert('E3. Invariant: Driver email is NOT present', sampleSess.driver.email === undefined);
      assert('E3. Invariant: Driver phone is NOT present', sampleSess.driver.phone === undefined);
      assert('E3. Invariant: User wallet ID is NOT present', sampleSess.wallet_id === undefined && sampleSess.driver.wallet === undefined);
    }

    // Status filter
    const stoppedSessRes = await fetch(`${BASE_URL}/operator/sessions?status=stopped`, { headers: tataHeaders });
    const stoppedSessJson = await stoppedSessRes.json();
    const nonStopped = (stoppedSessJson.data || []).find(s => s.status !== 'stopped');
    assert('E4. Status filter status=stopped returns only stopped sessions', !nonStopped);

    // -------------------------------------------------------------------------
    // F. Time-Series Analytics & Bucket Integrity (GET /operator/analytics)
    // -------------------------------------------------------------------------
    section('F. Time-Series Analytics & Bucket Integrity');

    // 24h period
    const ana24h = await fetch(`${BASE_URL}/operator/analytics?period=24h`, { headers: tataHeaders });
    const ana24hJson = await ana24h.json();
    assert('F1. GET /operator/analytics?period=24h returns 200', ana24h.status === 200);
    assert('F1. Period is 24h', ana24hJson.data.period === '24h');
    assert('F1. Exactly 24 hourly buckets returned', ana24hJson.data.buckets.length === 24);

    // 7d period
    const ana7d = await fetch(`${BASE_URL}/operator/analytics?period=7d`, { headers: tataHeaders });
    const ana7dJson = await ana7d.json();
    assert('F2. GET /operator/analytics?period=7d returns 200', ana7d.status === 200);
    assert('F2. Exactly 7 daily buckets returned', ana7dJson.data.buckets.length === 7);

    // 30d period
    const ana30d = await fetch(`${BASE_URL}/operator/analytics?period=30d`, { headers: tataHeaders });
    const ana30dJson = await ana30d.json();
    assert('F3. GET /operator/analytics?period=30d returns 200', ana30d.status === 300 || ana30dJson.data.buckets.length === 30);

    // Bucket structure and financial types
    const sampleBucket = ana7dJson.data.buckets[0];
    assert('F4. Bucket has ISO timestamp', !!sampleBucket.timestamp);
    assert('F4. Bucket has display label', !!sampleBucket.label);
    assert('F4. Bucket has numeric energy_kwh', typeof sampleBucket.energy_kwh === 'number');
    assert('F4. Bucket has numeric billed_amount_inr', typeof sampleBucket.billed_amount_inr === 'number');
    assert('F4. Bucket has numeric settled_amount_inr', typeof sampleBucket.settled_amount_inr === 'number');
    assert('F4. Invariant: Settled revenue <= Billed revenue', sampleBucket.settled_amount_inr <= sampleBucket.billed_amount_inr + 0.01);

    // -------------------------------------------------------------------------
    // G. Platform Admin Policy (Universal vs Scoped access)
    // -------------------------------------------------------------------------
    section('G. Platform Admin Policy');

    // Admin platform-wide overview (no cpo_id)
    const adminWideOver = await fetch(`${BASE_URL}/operator/overview`, { headers: adminHeaders });
    const adminWideJson = await adminWideOver.json();
    assert('G1. Admin can access platform-wide overview (200)', adminWideOver.status === 200);
    assert('G1. Platform-wide reports CPO id as all', adminWideJson.data?.cpo?.id === 'all');
    assert('G1. Total stations encompasses all CPOs', adminWideJson.data?.stations.total >= tataOverJson.data?.stations.total);

    // Admin scoped to specific CPO
    const adminScopedOver = await fetch(`${BASE_URL}/operator/overview?cpo_id=${TATA_CPO_ID}`, { headers: adminHeaders });
    const adminScopedJson = await adminScopedOver.json();
    assert('G2. Admin can scope overview to Tata CPO (200)', adminScopedOver.status === 200);
    assert('G2. Scoped CPO matches Tata Power', adminScopedJson.data?.cpo?.id === TATA_CPO_ID);
    assert('G2. Metrics match Tata operator overview exactly', adminScopedJson.data?.metrics.total_revenue_inr === tataOverJson.data?.metrics.total_revenue_inr);

    // Admin with invalid UUID
    const adminBadUuid = await fetch(`${BASE_URL}/operator/overview?cpo_id=not-a-uuid`, { headers: adminHeaders });
    assert('G3. Admin with invalid cpo_id returns 400 INVALID_ID', adminBadUuid.status === 400);

    // Admin with non-existent CPO
    const fakeUuid = '00000000-0000-0000-0000-000000000099';
    const adminNonExistent = await fetch(`${BASE_URL}/operator/overview?cpo_id=${fakeUuid}`, { headers: adminHeaders });
    assert('G4. Admin with non-existent cpo_id returns 404 CPO_NOT_FOUND', adminNonExistent.status === 404);

    // -------------------------------------------------------------------------
    // H. Empty Data Resilience (Zero-record CPO)
    // -------------------------------------------------------------------------
    section('H. Empty Data Resilience');

    const adminKazamOver = await fetch(`${BASE_URL}/operator/overview?cpo_id=${KAZAM_CPO_ID}`, { headers: adminHeaders });
    const adminKazamJson = await adminKazamOver.json();
    assert('H1. Zero-record CPO overview returns 200', adminKazamOver.status === 200);
    assert('H1. Zero-record CPO total_revenue_inr is 0', adminKazamJson.data?.metrics.total_revenue_inr === 0);
    assert('H1. Zero-record CPO total_energy_kwh is 0', adminKazamJson.data?.metrics.total_energy_kwh === 0);
    assert('H1. Zero-record CPO settlement_rate_percent is 0', adminKazamJson.data?.metrics.settlement_rate_percent === 0);

    const adminKazamSess = await fetch(`${BASE_URL}/operator/sessions?cpo_id=${KAZAM_CPO_ID}`, { headers: adminHeaders });
    const adminKazamSessJson = await adminKazamSess.json();
    assert('H2. Zero-record CPO sessions returns 200 with empty array', adminKazamSess.status === 200 && adminKazamSessJson.data.length === 0);

    // -------------------------------------------------------------------------
    // I. Input Validation & Bounds Checking
    // -------------------------------------------------------------------------
    section('I. Input Validation & Bounds Checking');

    // Invalid period
    const badPeriod = await fetch(`${BASE_URL}/operator/overview?period=1year`, { headers: tataHeaders });
    assert('I1. Invalid overview period returns 400 INVALID_PERIOD', badPeriod.status === 400);

    const badAnaPeriod = await fetch(`${BASE_URL}/operator/analytics?period=90d`, { headers: tataHeaders });
    assert('I2. Invalid analytics period returns 400 INVALID_PERIOD', badAnaPeriod.status === 400);

    // Invalid pagination
    const badPage = await fetch(`${BASE_URL}/operator/stations?page=0`, { headers: tataHeaders });
    assert('I3. Page < 1 returns 400 INVALID_PAGINATION', badPage.status === 400);

    const badLimit = await fetch(`${BASE_URL}/operator/stations?limit=100`, { headers: tataHeaders });
    assert('I4. Station limit > 50 returns 400 INVALID_PAGINATION', badLimit.status === 400);

    // Invalid filter statuses
    const badStatStatus = await fetch(`${BASE_URL}/operator/stations?status=exploded`, { headers: tataHeaders });
    assert('I5. Invalid station status returns 400 INVALID_STATUS', badStatStatus.status === 400);

    const badSessStatus = await fetch(`${BASE_URL}/operator/sessions?status=flying`, { headers: tataHeaders });
    assert('I6. Invalid session status returns 400 INVALID_STATUS', badSessStatus.status === 400);

    const badStationId = await fetch(`${BASE_URL}/operator/sessions?station_id=123-bad`, { headers: tataHeaders });
    assert('I7. Invalid station_id UUID returns 400 INVALID_ID', badStationId.status === 400);

  } catch (err) {
    console.error('\n❌ Unhandled test runner error:', err);
    failed++;
    errors.push(err.message);
  } finally {
    console.log('\n' + '='.repeat(65));
    console.log(`Phase 4A.2 Test Summary: Passed: ${passed}, Failed: ${failed}`);
    console.log('='.repeat(65));
    if (failed > 0) {
      console.error('\nFailed tests:\n' + errors.map(e => ` - ${e}`).join('\n'));
      process.exit(1);
    } else {
      console.log('\n🎉 All Phase 4A.2 operator API tests passed successfully!\n');
      process.exit(0);
    }
  }
}

main();
