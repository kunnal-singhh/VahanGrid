/**
 * backend/src/scripts/test_phase3e1.js
 *
 * Phase 3E.1 - Tariff and Pricing Architecture Test Suite
 */

import { query } from '../config/database.js';
import { roundToPaisa, buildTariffSnapshot, calculatePrice } from '../services/pricingService.js';
import {
  createTariff,
  getTariffById,
  listTariffs,
  updateTariff,
  deactivateTariff,
  deleteTariff,
  resolveApplicableTariff,
} from '../services/tariffService.js';

let passed = 0;
let failed = 0;
const errors = [];

function assert(label, condition, details) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}${details ? ' -- ' + details : ''}`);
    failed++;
    errors.push(label);
  }
}

function assertClose(label, actual, expected, tolerance = 0.001) {
  const ok = Math.abs(actual - expected) <= tolerance;
  assert(label, ok, `expected ${expected}, got ${actual}`);
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

// 1. roundToPaisa
section('1. roundToPaisa Precision');
assertClose('18.5 x 10 = 185.00', roundToPaisa(18.5 * 10), 185.00);
assertClose('0.1 + 0.2 = 0.30', roundToPaisa(0.1 + 0.2), 0.30);
assertClose('1.005 rounds to 1.01', roundToPaisa(1.005), 1.01);
assertClose('1.004 rounds to 1.00', roundToPaisa(1.004), 1.00);
assertClose('0 stays 0', roundToPaisa(0), 0.00);
assert('NaN returns 0', roundToPaisa(NaN) === 0.00);
assert('Infinity returns 0', roundToPaisa(Infinity) === 0.00);

// 2. calculatePrice energy-only
section('2. calculatePrice - Energy-only session');
const t1 = { currency: 'INR', price_per_kwh: 18.50, session_fee: 0, price_per_minute: 0, idle_fee_per_minute: 0, grace_period_minutes: 0, tax_rate: 0.18 };
const r1 = calculatePrice(t1, { energy_kwh: 20, duration_seconds: 1800, idle_seconds: 0 });
assertClose('energy_cost = 370.00', r1.energy_cost, 370.00);
assertClose('time_cost = 0.00', r1.time_cost, 0.00);
assertClose('subtotal = 370.00', r1.subtotal, 370.00);
assertClose('tax_amount = 66.60', r1.tax_amount, 66.60);
assertClose('total_cost = 436.60', r1.total_cost, 436.60);
assert('currency = INR', r1.currency === 'INR');
assert('duration_minutes = 30', r1.duration_minutes === 30);

// 3. calculatePrice all fees
section('3. calculatePrice - All fee types');
const t2 = { currency: 'INR', price_per_kwh: 16.00, session_fee: 10.00, price_per_minute: 0.20, idle_fee_per_minute: 1.50, grace_period_minutes: 10, tax_rate: 0.18 };
const r2 = calculatePrice(t2, { energy_kwh: 15, duration_seconds: 3600, idle_seconds: 1500 });
assertClose('energy_cost = 240.00', r2.energy_cost, 240.00);
assertClose('session_fee = 10.00', r2.session_fee, 10.00);
assertClose('time_cost = 12.00', r2.time_cost, 12.00);
assertClose('idle_cost = 22.50', r2.idle_cost, 22.50);
assert('idle_minutes = 25', r2.idle_minutes === 25);
assert('billable_idle_minutes = 15', r2.billable_idle_minutes === 15);
assertClose('subtotal = 284.50', r2.subtotal, 284.50);
assertClose('tax_amount = 51.21', r2.tax_amount, 51.21);
assertClose('total_cost = 335.71', r2.total_cost, 335.71);

// 4. Idle within grace
section('4. calculatePrice - Idle within grace period');
const t3 = { currency: 'INR', price_per_kwh: 18.50, session_fee: 0, price_per_minute: 0, idle_fee_per_minute: 2.00, grace_period_minutes: 15, tax_rate: 0.18 };
const r3 = calculatePrice(t3, { energy_kwh: 10, duration_seconds: 600, idle_seconds: 600 });
assertClose('idle_cost = 0 (within grace)', r3.idle_cost, 0.00);
assert('billable_idle_minutes = 0', r3.billable_idle_minutes === 0);

// 5. Session fee only
section('5. calculatePrice - Session fee only');
const t4 = { currency: 'INR', price_per_kwh: 18.50, session_fee: 25.00, price_per_minute: 0, idle_fee_per_minute: 0, grace_period_minutes: 0, tax_rate: 0.18 };
const r4 = calculatePrice(t4, { energy_kwh: 0, duration_seconds: 0, idle_seconds: 0 });
assertClose('session_fee = 25.00', r4.session_fee, 25.00);
assertClose('subtotal = 25.00', r4.subtotal, 25.00);
assertClose('tax_amount = 4.50', r4.tax_amount, 4.50);
assertClose('total_cost = 29.50', r4.total_cost, 29.50);

// 6. Snapshot
section('6. buildTariffSnapshot');
const snap = buildTariffSnapshot({ id: 'e0000001-0000-0000-0000-000000000001', name: 'Tata Power Standard Tariff', currency: 'INR', price_per_kwh: 18.5, session_fee: 10, price_per_minute: 0, idle_fee_per_minute: 1.0, grace_period_minutes: 15, tax_rate: 0.18 });
assert('snapshot has tariff_id', snap.tariff_id === 'e0000001-0000-0000-0000-000000000001');
assert('snapshot has name', snap.name === 'Tata Power Standard Tariff');
assertClose('snapshot price_per_kwh = 18.5', snap.price_per_kwh, 18.5);
assert('snapshot has snapshotted_at', typeof snap.snapshotted_at === 'string');
assert('null tariff returns null', buildTariffSnapshot(null) === null);

// 7-8. Async DB tests
async function runAsyncTests() {
  section('7. Tariff Resolution Hierarchy');
  
  const res_loc = await resolveApplicableTariff({ location_id: 'f0000001-0000-0000-0000-000000000001', cpo_id: 'a0000001-0000-0000-0000-000000000001' });
  assert('Aerocity Hub -> location-scoped tariff returned', res_loc !== null, 'got null');
  assert('Aerocity Hub -> Aerocity Hub Special Tariff', res_loc && res_loc.name === 'Aerocity Hub Special Tariff', `got: ${res_loc && res_loc.name}`);

  const res_cpo = await resolveApplicableTariff({ location_id: 'f0000001-0000-0000-0000-000000000002', cpo_id: 'a0000001-0000-0000-0000-000000000001' });
  assert('Cyber Hub -> falls back to CPO tariff', res_cpo !== null, 'got null');
  assert('Cyber Hub -> Tata Power Standard Tariff', res_cpo && res_cpo.name === 'Tata Power Standard Tariff', `got: ${res_cpo && res_cpo.name}`);

  const res_statiq = await resolveApplicableTariff({ cpo_id: 'a0000001-0000-0000-0000-000000000002' });
  assert('Statiq CPO -> Statiq City Standard Tariff', res_statiq && res_statiq.name === 'Statiq City Standard Tariff', `got: ${res_statiq && res_statiq.name}`);

  const res_none = await resolveApplicableTariff({ cpo_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' });
  assert('Unknown CPO -> null', res_none === null);

  section('8. Tariff CRUD');

  const created = await createTariff({ name: 'Test Tariff Phase3E1', cpo_id: 'a0000001-0000-0000-0000-000000000001', currency: 'INR', price_per_kwh: 20.00, session_fee: 15.00, price_per_minute: 0.50, idle_fee_per_minute: 2.00, grace_period_minutes: 10, tax_rate: 0.18, is_active: true });
  assert('createTariff returns row with id', !!created && !!created.id);
  assert('created name matches', created && created.name === 'Test Tariff Phase3E1');

  const fetched = await getTariffById(created.id);
  assert('getTariffById returns correct row', fetched && fetched.id === created.id);

  const updated = await updateTariff(created.id, { price_per_kwh: 22.50 });
  assertClose('updateTariff updates price_per_kwh', Number(updated && updated.price_per_kwh), 22.50);

  let validErr = null;
  try { await createTariff({ name: 'Bad', tax_rate: 1.5 }); } catch(e) { validErr = e; }
  assert('Rejects tax_rate > 1.0', validErr && validErr.code === 'INVALID_TAX_RATE');

  const deact = await deactivateTariff(created.id);
  assert('deactivateTariff sets is_active=false', deact && deact.is_active === false);

  const del = await deleteTariff(created.id);
  assert('deleteTariff hard-deletes unreferenced tariff', del && del.deleted === true);

  const gone = await getTariffById(created.id);
  assert('getTariffById returns null after delete', gone === null);

  const all = await listTariffs();
  assert('listTariffs returns array', Array.isArray(all));
  assert('listTariffs has seeded tariffs', all.length >= 3);

  section('9. REST API Endpoints');

  const BASE = 'http://localhost:3000/api/v1';
  
  try {
    const loginRes = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@vahangrid.com', password: 'Admin@1234' }) });
    if (!loginRes.ok) { console.log('  SKIP: Could not authenticate, skipping REST tests.'); return; }
    const loginData = await loginRes.json();
    const token = loginData.data && loginData.data.accessToken || loginData.token;
    if (!token) { console.log('  SKIP: No token in login response.'); return; }

    const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const listRes = await fetch(`${BASE}/tariffs`, { headers: H });
    assert('GET /tariffs returns 200', listRes.status === 200);
    const listData = await listRes.json();
    assert('GET /tariffs data is array', Array.isArray(listData && listData.data));
    assert('GET /tariffs includes seeded tariffs', listData && listData.data && listData.data.length >= 3);

    const createRes = await fetch(`${BASE}/tariffs`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'REST Test Tariff', cpo_id: 'a0000001-0000-0000-0000-000000000001', currency: 'INR', price_per_kwh: 17.00, session_fee: 5.00, tax_rate: 0.18 }) });
    assert('POST /tariffs returns 201', createRes.status === 201);
    const createData = await createRes.json();
    const tariffId = createData && createData.data && createData.data.id;
    assert('POST /tariffs returns tariff id', !!tariffId);

    if (tariffId) {
      const getRes = await fetch(`${BASE}/tariffs/${tariffId}`, { headers: H });
      assert('GET /tariffs/:id returns 200', getRes.status === 200);

      const patchRes = await fetch(`${BASE}/tariffs/${tariffId}`, { method: 'PATCH', headers: H, body: JSON.stringify({ price_per_kwh: 19.00 }) });
      assert('PATCH /tariffs/:id returns 200', patchRes.status === 200);
      const patchData = await patchRes.json();
      assertClose('PATCH updates price_per_kwh', Number(patchData && patchData.data && patchData.data.price_per_kwh), 19.00);

      const delRes = await fetch(`${BASE}/tariffs/${tariffId}`, { method: 'DELETE', headers: H });
      assert('DELETE /tariffs/:id returns 200', delRes.status === 200);
    }

    const stRes = await fetch(`${BASE}/stations/f0000001-0000-0000-0000-000000000001/tariff`, { headers: H });
    assert('GET /stations/:id/tariff returns 200', stRes.status === 200);
    const stData = await stRes.json();
    assert('GET /stations/:id/tariff returns tariff object', !!(stData && stData.data));
    if (stData && stData.data) console.log(`  INFO: Aerocity resolved tariff: "${stData.data.name}"`);

  } catch(e) {
    console.log(`  WARN: REST API test error (server may not be on :3000): ${e.message}`);
  }
}

runAsyncTests().then(() => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) console.log(`  Failed: ${errors.join(', ')}`);
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}).catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
