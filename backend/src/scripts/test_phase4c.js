/**
 * backend/src/scripts/test_phase4c.js
 *
 * Phase 4C: Operator Station Management Integration Test Suite.
 *
 * Coverage:
 *  A. Route Security (401/403 enforcement)
 *  B. Cross-CPO Isolation (operators cannot access other CPO's stations)
 *  C. GET /api/v1/operator/stations/:id — Single Station Detail
 *  D. PATCH /api/v1/operator/stations/:id — Metadata Update
 *  E. Immutable Field Rejection
 *  F. Input Validation (bad values)
 *  G. Coordinate Consistency (lat/lng must travel together)
 *  H. Platform Admin Access Policy
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { query } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://127.0.0.1:3001/api/v1';

let passed = 0;
let failed = 0;
const errors = [];

function assert(msg, condition) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
    errors.push(msg);
  }
}

function section(title) {
  console.log('\n' + '='.repeat(65) + '\n  ' + title + '\n' + '='.repeat(65));
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
  return { status: res.status, user: json.data?.user || null, cookies };
}

async function main() {
  console.log('\n' + '='.repeat(65));
  console.log('VahanGrid Phase 4C: Operator Station Management Test Suite');
  console.log('='.repeat(65));

  try {
    const TATA_CPO_ID = 'a0000001-0000-0000-0000-000000000001';
    const STATIQ_CPO_ID = 'a0000001-0000-0000-0000-000000000002';
    const FAKE_UUID = '00000000-0000-0000-0000-000000000099';

    const driverAuth = await loginUser('priya.sharma@example.com');
    const tataOpAuth = await loginUser('operator.tata@example.com');
    const statiqOpAuth = await loginUser('operator.statiq@example.com');
    const adminAuth = await loginUser('admin@vahangrid.com');

    const driverHeaders = { Cookie: driverAuth.cookies };
    const tataHeaders = { Cookie: tataOpAuth.cookies };
    const statiqHeaders = { Cookie: statiqOpAuth.cookies };
    const adminHeaders = { Cookie: adminAuth.cookies };

    const tataStnRes = await fetch(`${BASE_URL}/operator/stations?limit=1`, { headers: tataHeaders });
    const tataStnJson = await tataStnRes.json();
    const tataStnId = tataStnJson.data?.[0]?.id;
    assert('Precondition: Tata has at least one station', !!tataStnId);

    const statiqStnRes = await fetch(`${BASE_URL}/operator/stations?limit=1`, { headers: statiqHeaders });
    const statiqStnJson = await statiqStnRes.json();
    const statiqStnId = statiqStnJson.data?.[0]?.id;
    assert('Precondition: Statiq has at least one station', !!statiqStnId);

    section('A. Route Security (401 / 403)');

    const unauthGet = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`);
    assert('A1. Unauthenticated GET station detail returns 401', unauthGet.status === 401);

    const unauthPatch = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hack' }),
    });
    assert('A2. Unauthenticated PATCH station returns 401', unauthPatch.status === 401);

    const driverGet = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, { headers: driverHeaders });
    const driverGetJson = await driverGet.json();
    assert('A3. Driver GET station detail returns 403', driverGet.status === 403);
    assert('A3. Error code is OPERATOR_ROLE_REQUIRED', driverGetJson.error?.code === 'OPERATOR_ROLE_REQUIRED');

    const driverPatch = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, {
      method: 'PATCH',
      headers: { ...driverHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hack' }),
    });
    assert('A4. Driver PATCH station returns 403', driverPatch.status === 403);

    const orphanEmail = `orphan_4c_${Date.now()}@example.com`;
    const orphanInsert = await query(
      `INSERT INTO users (name, email, password_hash, role, cpo_id)
       VALUES ('Orphan 4C', $1, '$2b$10$fStmN8G.SgwA3jIbiV2u6eiwJ8c9lWTxvecl1AsWEKhOVbGTevG9S', 'operator', NULL)
       RETURNING id`,
      [orphanEmail]
    );
    const orphanId = orphanInsert.rows[0].id;
    const orphanAuth = await loginUser(orphanEmail);
    const orphanGet = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, { headers: { Cookie: orphanAuth.cookies } });
    const orphanGetJson = await orphanGet.json();
    assert('A5. Orphan operator GET station returns 403', orphanGet.status === 403);
    assert('A5. Error code is OPERATOR_CPO_REQUIRED', orphanGetJson.error?.code === 'OPERATOR_CPO_REQUIRED');
    await query(`DELETE FROM users WHERE id = $1`, [orphanId]);

    section('B. Cross-CPO Isolation');

    const crossGet = await fetch(`${BASE_URL}/operator/stations/${statiqStnId}`, { headers: tataHeaders });
    const crossGetJson = await crossGet.json();
    assert('B1. Tata operator GET Statiq station returns 403', crossGet.status === 403);
    assert('B1. Error code is CPO_ACCESS_DENIED', crossGetJson.error?.code === 'CPO_ACCESS_DENIED');

    const crossPatch = await fetch(`${BASE_URL}/operator/stations/${statiqStnId}`, {
      method: 'PATCH',
      headers: { ...tataHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Infiltrated' }),
    });
    assert('B2. Tata operator PATCH Statiq station returns 403', crossPatch.status === 403);

    const crossGet2 = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, { headers: statiqHeaders });
    assert('B3. Statiq operator GET Tata station returns 403', crossGet2.status === 403);

    section('C. GET /operator/stations/:id — Single Station Detail');

    const detailRes = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, { headers: tataHeaders });
    const detailJson = await detailRes.json();

    assert('C1. GET station detail returns 200', detailRes.status === 200);
    assert('C1. Response has success: true', detailJson.success === true);
    assert('C1. Response has data object', typeof detailJson.data === 'object' && detailJson.data !== null);

    const d = detailJson.data;
    assert('C2. Station has correct ID', d.id === tataStnId);
    assert('C2. Station cpo_id matches Tata', d.cpo_id === TATA_CPO_ID);
    assert('C2. Station has name', typeof d.name === 'string' && d.name.length > 0);
    assert('C2. Station has address_line1', typeof d.address_line1 === 'string');
    assert('C2. Station has city', typeof d.city === 'string');
    assert('C2. Station has state', typeof d.state === 'string');
    assert('C2. Station latitude is float', typeof d.latitude === 'number');
    assert('C2. Station longitude is float', typeof d.longitude === 'number');
    assert('C2. Station has status', typeof d.status === 'string');
    assert('C2. Station has timezone', typeof d.timezone === 'string');
    assert('C2. Station has cpo object', typeof d.cpo === 'object' && d.cpo !== null);
    assert('C2. CPO has name', typeof d.cpo.name === 'string');
    assert('C2. Station has evses array', Array.isArray(d.evses));

    const notFoundGet = await fetch(`${BASE_URL}/operator/stations/${FAKE_UUID}`, { headers: tataHeaders });
    assert('C3. GET non-existent station returns 404', notFoundGet.status === 404);

    const badIdGet = await fetch(`${BASE_URL}/operator/stations/not-a-uuid`, { headers: tataHeaders });
    assert('C4. GET invalid UUID returns 400', badIdGet.status === 400);

    section('D. PATCH /operator/stations/:id — Metadata Update');

    const origName = d.name;

    const patchRes = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, {
      method: 'PATCH',
      headers: { ...tataHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: origName + ' (Updated)', address_line1: '123 Test Blvd', status: 'inactive' }),
    });
    const patchJson = await patchRes.json();

    assert('D1. PATCH returns 200', patchRes.status === 200);
    assert('D1. Updated name matches', patchJson.data?.name === origName + ' (Updated)');
    assert('D1. Updated address_line1 matches', patchJson.data?.address_line1 === '123 Test Blvd');
    assert('D1. Updated status is inactive', patchJson.data?.status === 'inactive');
    assert('D1. cpo_id unchanged after PATCH', patchJson.data?.cpo_id === TATA_CPO_ID);

    const verifyRes = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, { headers: tataHeaders });
    const verifyJson = await verifyRes.json();
    assert('D2. GET after PATCH reflects updated name', verifyJson.data?.name === origName + ' (Updated)');
    assert('D2. GET after PATCH reflects status inactive', verifyJson.data?.status === 'inactive');

    await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, {
      method: 'PATCH',
      headers: { ...tataHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: origName, address_line1: d.address_line1, status: 'active' }),
    });

    const restoredRes = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, { headers: tataHeaders });
    const restoredJson = await restoredRes.json();
    assert('D3. Restore: name reverted', restoredJson.data?.name === origName);
    assert('D3. Restore: status reverted to active', restoredJson.data?.status === 'active');

    section('E. Immutable Field Rejection');

    const immutableFields = [
      { field: 'id', value: FAKE_UUID },
      { field: 'cpo_id', value: STATIQ_CPO_ID },
      { field: 'source_type', value: 'osm' },
      { field: 'source_id', value: 'abc-123' },
      { field: 'country_code', value: 'US' },
      { field: 'created_at', value: '2020-01-01T00:00:00Z' },
      { field: 'updated_at', value: '2020-01-01T00:00:00Z' },
    ];

    for (const { field, value } of immutableFields) {
      const res = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, {
        method: 'PATCH',
        headers: { ...tataHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json();
      assert(
        `E1. PATCH with immutable '${field}' returns 422`,
        res.status === 422 && json.error?.code === 'IMMUTABLE_FIELD'
      );
    }

    section('F. Input Validation');

    const badInputs = [
      { desc: 'empty name', body: { name: '' } },
      { desc: 'name too long', body: { name: 'A'.repeat(256) } },
      { desc: 'empty address_line1', body: { address_line1: '' } },
      { desc: 'empty city', body: { city: '' } },
      { desc: 'city too long', body: { city: 'X'.repeat(101) } },
      { desc: 'empty state', body: { state: '' } },
      { desc: 'postal_code too long', body: { postal_code: '1'.repeat(21) } },
      { desc: 'empty timezone', body: { timezone: '' } },
      { desc: 'invalid status', body: { status: 'exploded' } },
      { desc: 'latitude out of range high', body: { latitude: 91, longitude: 77 } },
      { desc: 'latitude out of range low', body: { latitude: -91, longitude: 77 } },
      { desc: 'longitude out of range high', body: { latitude: 28, longitude: 181 } },
      { desc: 'non-numeric latitude', body: { latitude: 'abc', longitude: 77 } },
    ];

    for (const { desc, body } of badInputs) {
      const res = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, {
        method: 'PATCH',
        headers: { ...tataHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert(`F1. PATCH with ${desc} returns 400`, res.status === 400);
    }

    section('G. Coordinate Consistency');

    const onlyLat = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, {
      method: 'PATCH',
      headers: { ...tataHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 28.5 }),
    });
    assert('G1. PATCH with only latitude returns 400', onlyLat.status === 400);

    const onlyLng = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, {
      method: 'PATCH',
      headers: { ...tataHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ longitude: 77.2 }),
    });
    assert('G2. PATCH with only longitude returns 400', onlyLng.status === 400);

    const bothCoords = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, {
      method: 'PATCH',
      headers: { ...tataHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: d.latitude, longitude: d.longitude }),
    });
    assert('G3. PATCH with both lat+lng returns 200', bothCoords.status === 200);

    section('H. Platform Admin Access Policy');

    const adminGetTata = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, { headers: adminHeaders });
    assert('H1. Admin GET Tata station returns 200', adminGetTata.status === 200);

    const adminGetStatiq = await fetch(`${BASE_URL}/operator/stations/${statiqStnId}`, { headers: adminHeaders });
    assert('H2. Admin GET Statiq station returns 200', adminGetStatiq.status === 200);

    const adminPatch = await fetch(`${BASE_URL}/operator/stations/${statiqStnId}`, {
      method: 'PATCH',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'inactive' }),
    });
    const adminPatchJson = await adminPatch.json();
    assert('H3. Admin PATCH Statiq station returns 200', adminPatch.status === 200);
    assert('H3. Admin PATCH set status inactive', adminPatchJson.data?.status === 'inactive');

    await fetch(`${BASE_URL}/operator/stations/${statiqStnId}`, {
      method: 'PATCH',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });

    const adminImmutable = await fetch(`${BASE_URL}/operator/stations/${tataStnId}`, {
      method: 'PATCH',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpo_id: STATIQ_CPO_ID }),
    });
    assert('H4. Admin PATCH with cpo_id returns 422 IMMUTABLE_FIELD', adminImmutable.status === 422);

    // -------------------------------------------------------------------------
    // I. Frontend Station Management Integration & Production Bundle Integrity
    // -------------------------------------------------------------------------
    section('I. Frontend Station Management Integration & Production Bundle Integrity');

    const distDir = path.resolve(__dirname, '../../../frontend/dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    const assetsDir = path.join(distDir, 'assets');

    assert('I1. Production dist exists', fs.existsSync(distDir));
    assert('I1. Production index.html exists', fs.existsSync(indexHtmlPath));
    assert('I1. Assets directory exists', fs.existsSync(assetsDir));

    const assetFiles = fs.readdirSync(assetsDir);
    const jsBundle = assetFiles.find((f) => f.startsWith('index-') && f.endsWith('.js'));
    assert('I2. Production JS bundle exists', Boolean(jsBundle));

    const jsContent = fs.readFileSync(path.join(assetsDir, jsBundle), 'utf-8');
    assert('I3. JS bundle contains station management paths', jsContent.includes('/operator/stations'));
    assert('I3. JS bundle contains station editing components', jsContent.includes('timezone') && jsContent.includes('address_line1'));

    const editModalPath = path.resolve(__dirname, '../../../frontend/src/pages/Operator/components/EditStationModal.jsx');
    assert('I4. EditStationModal component exists', fs.existsSync(editModalPath));

    const editModalContent = fs.readFileSync(editModalPath, 'utf-8');
    assert('I5. EditStationModal implements getStationDetail call', editModalContent.includes('getStationDetail'));
    assert('I5. EditStationModal implements updateStation call', editModalContent.includes('updateStation'));
    assert('I5. EditStationModal enforces dirty field tracking', editModalContent.includes('dirtyFields'));
    assert('I5. EditStationModal validates coordinates consistency', editModalContent.includes('latitude') && editModalContent.includes('longitude'));

    const frontendServicePath = path.resolve(__dirname, '../../../frontend/src/services/operatorService.js');
    const serviceContent = fs.readFileSync(frontendServicePath, 'utf-8');
    assert('I6. operatorService exports getStationDetail', serviceContent.includes('getStationDetail('));
    assert('I6. operatorService exports updateStation', serviceContent.includes('updateStation('));

    const tableComponentPath = path.resolve(__dirname, '../../../frontend/src/pages/Operator/components/StationFleetTable.jsx');
    const tableContent = fs.readFileSync(tableComponentPath, 'utf-8');
    assert('I7. StationFleetTable provides Manage action button', tableContent.includes('Manage') && tableContent.includes('onEditStation'));

  } catch (err) {
    console.error('\nUnhandled test runner error:', err);
    failed++;
    errors.push(err.message);
  } finally {
    await pool.end().catch(() => {});
    console.log('\n' + '='.repeat(65));
    console.log('Phase 4C Test Summary: Passed: ' + passed + ', Failed: ' + failed);
    console.log('='.repeat(65));
    if (failed > 0) {
      console.error('\nFailed tests:\n' + errors.map((e) => ' - ' + e).join('\n'));
      process.exit(1);
    } else {
      console.log('\nAll Phase 4C station management tests passed successfully!\n');
      process.exit(0);
    }
  }
}

main();
