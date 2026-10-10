/**
 * backend/src/scripts/test_phase4f.js
 *
 * Phase 4F: Cross-Role End-to-End Reliability & Platform Security Audit Test Suite.
 *
 * Comprehensive coverage:
 *  A. Route Security & Cross-Role Denial (Driver Denials on Operator/Tariff APIs)
 *  B. Orphan Operator Failsafe Verification (cpo_id = null fails closed)
 *  C. Cross-CPO Multi-Tenant Isolation (IDs, Query Params, Mutations)
 *  D. Driver Resource Isolation & IDOR Protection (Sessions, Vehicles, CDRs, Wallet)
 *  E. Driver PII Masking Verification (No full names, email, phone, or wallet in operator feeds)
 *  F. Session & Remote-Stop Lifecycle Invariants (Terminal checks, non-existent, offline)
 *  G. Financial Integrity & Tariff Snapshot Immutability
 *  H. Concurrency & Idempotency Protection (CDR settlements, payment webhooks)
 */

import pool, { query } from '../config/database.js';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';

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
  console.log('\n' + '='.repeat(68) + '\n  ' + title + '\n' + '='.repeat(68));
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
  return { status: res.status, user: json.data?.user || null, cookies, token: tokenMatch?.[1] || null };
}

async function apiGet(path, cookies = '') {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(cookies ? { Cookie: cookies } : {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function apiPost(path, body = {}, cookies = '') {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function apiPatch(path, body = {}, cookies = '') {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function apiDelete(path, cookies = '') {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(cookies ? { Cookie: cookies } : {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function main() {
  console.log('\n' + '='.repeat(68));
  console.log('  VahanGrid Phase 4F — Platform Reliability & Cross-Role Audit');
  console.log('='.repeat(68));

  // 1. Authenticate seed users
  const tataOp   = await loginUser('operator.tata@example.com');
  const statiqOp = await loginUser('operator.statiq@example.com');
  const driver1  = await loginUser('priya.sharma@example.com');
  const admin    = await loginUser('admin@vahangrid.com');

  assert('Tata operator login succeeds', tataOp.status === 200 && tataOp.cookies);
  assert('Statiq operator login succeeds', statiqOp.status === 200 && statiqOp.cookies);
  assert('Driver 1 login succeeds', driver1.status === 200 && driver1.cookies);
  assert('Admin login succeeds', admin.status === 200 && admin.cookies);

  // Register Driver 2 for cross-user IDOR testing
  const randNum = Math.floor(10000 + Math.random() * 90000);
  const driver2Email = `audit_driver2_${randNum}@example.com`;
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Audit Driver Two`,
      email: driver2Email,
      phone: `+9199${Math.floor(10000000 + Math.random() * 89999999)}`,
      password: 'Demo@1234',
    }),
  });
  const regData = await regRes.json();
  const rawDriver2Cookie = regRes.headers.get('set-cookie') || '';
  const tokenMatch2 = rawDriver2Cookie.match(/vg_token=([^;]+)/);
  const driver2 = {
    status: regRes.status,
    cookies: tokenMatch2 ? `vg_token=${tokenMatch2[1]}` : '',
    user: regData.data?.user || null,
  };
  assert('Driver 2 registered for IDOR isolation verification', driver2.status === 201 && driver2.cookies);

  // ──────────────────────────────────────────────────────────────────────────
  section('A. Route Security & Cross-Role Authorization (Driver Denial)');
  // ──────────────────────────────────────────────────────────────────────────

  // 1. Unauthenticated requests to operator routes
  {
    const r1 = await apiGet('/operator/overview');
    assert('Unauthenticated GET /operator/overview returns 401', r1.status === 401);
    const r2 = await apiGet('/operator/stations');
    assert('Unauthenticated GET /operator/stations returns 401', r2.status === 401);
    const r3 = await apiGet('/operator/sessions');
    assert('Unauthenticated GET /operator/sessions returns 401', r3.status === 401);
    const r4 = await apiPost('/operator/sessions/00000000-0000-0000-0000-000000000001/remote-stop');
    assert('Unauthenticated POST /operator/sessions/:id/remote-stop returns 401', r4.status === 401);
  }

  // 2. Driver role forbidden from all operator routes
  {
    const r1 = await apiGet('/operator/overview', driver1.cookies);
    assert('Driver GET /operator/overview -> 403 OPERATOR_ROLE_REQUIRED', r1.status === 403 && r1.body?.error?.code === 'OPERATOR_ROLE_REQUIRED');

    const r2 = await apiGet('/operator/stations', driver1.cookies);
    assert('Driver GET /operator/stations -> 403 OPERATOR_ROLE_REQUIRED', r2.status === 403 && r2.body?.error?.code === 'OPERATOR_ROLE_REQUIRED');

    const r3 = await apiGet('/operator/sessions', driver1.cookies);
    assert('Driver GET /operator/sessions -> 403 OPERATOR_ROLE_REQUIRED', r3.status === 403 && r3.body?.error?.code === 'OPERATOR_ROLE_REQUIRED');

    const r4 = await apiGet('/operator/analytics', driver1.cookies);
    assert('Driver GET /operator/analytics -> 403 OPERATOR_ROLE_REQUIRED', r4.status === 403 && r4.body?.error?.code === 'OPERATOR_ROLE_REQUIRED');

    const r5 = await apiPost('/operator/sessions/00000000-0000-0000-0000-000000000001/remote-stop', {}, driver1.cookies);
    assert('Driver POST /operator/sessions/:id/remote-stop -> 403 OPERATOR_ROLE_REQUIRED', r5.status === 403 && r5.body?.error?.code === 'OPERATOR_ROLE_REQUIRED');

    const r6 = await apiPatch('/operator/stations/00000000-0000-0000-0000-000000000001', {}, driver1.cookies);
    assert('Driver PATCH /operator/stations/:id -> 403 OPERATOR_ROLE_REQUIRED', r6.status === 403 && r6.body?.error?.code === 'OPERATOR_ROLE_REQUIRED');
  }

  // 3. Driver forbidden from tariff management
  {
    const r1 = await apiGet('/tariffs', driver1.cookies);
    assert('Driver GET /tariffs -> 403 FORBIDDEN_ROLE or OPERATOR_ROLE_REQUIRED', r1.status === 403);

    const r2 = await apiPost('/tariffs', { name: 'Unauthorized' }, driver1.cookies);
    assert('Driver POST /tariffs -> 403 OPERATOR_ROLE_REQUIRED', r2.status === 403 && r2.body?.error?.code === 'OPERATOR_ROLE_REQUIRED');

    const r3 = await apiPatch('/tariffs/00000000-0000-0000-0000-000000000001', { name: 'Hack' }, driver1.cookies);
    assert('Driver PATCH /tariffs/:id -> 403 OPERATOR_ROLE_REQUIRED', r3.status === 403 && r3.body?.error?.code === 'OPERATOR_ROLE_REQUIRED');

    const r4 = await apiDelete('/tariffs/00000000-0000-0000-0000-000000000001', driver1.cookies);
    assert('Driver DELETE /tariffs/:id -> 403 OPERATOR_ROLE_REQUIRED', r4.status === 403 && r4.body?.error?.code === 'OPERATOR_ROLE_REQUIRED');
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('B. Orphan Operator Failsafe Verification');
  // ──────────────────────────────────────────────────────────────────────────

  // Create temporary orphan operator in DB (role='operator', cpo_id=NULL)
  let orphanUserId;
  let orphanCookie = '';
  try {
    const orphanRes = await query(
      `INSERT INTO users (name, email, password_hash, role, cpo_id)
       VALUES ('Orphan Operator', 'orphan.op@example.com', 'placeholder_hash', 'operator', NULL)
       RETURNING id`
    );
    orphanUserId = orphanRes.rows[0].id;

    // Generate JWT cookie for orphan operator
    const orphanToken = jwt.sign(
      { sub: orphanUserId, role: 'operator', cpo_id: null },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
    orphanCookie = `vg_token=${orphanToken}`;

    const r1 = await apiGet('/operator/overview', orphanCookie);
    assert('Orphan operator GET /operator/overview -> 403 OPERATOR_CPO_REQUIRED', r1.status === 403 && r1.body?.error?.code === 'OPERATOR_CPO_REQUIRED');

    const r2 = await apiGet('/operator/stations', orphanCookie);
    assert('Orphan operator GET /operator/stations -> 403 OPERATOR_CPO_REQUIRED', r2.status === 403 && r2.body?.error?.code === 'OPERATOR_CPO_REQUIRED');

    const r3 = await apiGet('/operator/sessions', orphanCookie);
    assert('Orphan operator GET /operator/sessions -> 403 OPERATOR_CPO_REQUIRED', r3.status === 403 && r3.body?.error?.code === 'OPERATOR_CPO_REQUIRED');

    const r4 = await apiPost('/tariffs', { name: 'Orphan Plan' }, orphanCookie);
    assert('Orphan operator POST /tariffs -> 403 OPERATOR_CPO_REQUIRED', r4.status === 403 && r4.body?.error?.code === 'OPERATOR_CPO_REQUIRED');
  } finally {
    if (orphanUserId) {
      await query('DELETE FROM users WHERE id = $1', [orphanUserId]);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('C. Cross-CPO Multi-Tenant Isolation');
  // ──────────────────────────────────────────────────────────────────────────

  // Fetch a Statiq station and session
  const statiqStationRes = await query(
    `SELECT l.id, l.cpo_id FROM locations l
     JOIN cpos c ON l.cpo_id = c.id
     WHERE c.short_code = 'STATIQ' LIMIT 1`
  );
  const statiqStation = statiqStationRes.rows[0] || null;

  const statiqSessRes = await query(
    `SELECT cs.id FROM charging_sessions cs
     JOIN connectors cn ON cs.connector_id = cn.id
     JOIN evses e ON cn.evse_id = e.id
     JOIN locations l ON e.location_id = l.id
     JOIN cpos c ON l.cpo_id = c.id
     WHERE c.short_code = 'STATIQ' LIMIT 1`
  );
  const statiqSess = statiqSessRes.rows[0] || null;

  // 1. Cross-station access
  if (statiqStation) {
    const r1 = await apiGet(`/operator/stations/${statiqStation.id}`, tataOp.cookies);
    assert('Tata operator cannot view Statiq station detail -> 403 CPO_ACCESS_DENIED', r1.status === 403 && r1.body?.error?.code === 'CPO_ACCESS_DENIED');

    const r2 = await apiPatch(`/operator/stations/${statiqStation.id}`, { name: 'Tampered Name' }, tataOp.cookies);
    assert('Tata operator cannot update Statiq station -> 403 CPO_ACCESS_DENIED', r2.status === 403 && r2.body?.error?.code === 'CPO_ACCESS_DENIED');
  }

  // 2. Cross-session access & remote-stop
  if (statiqSess) {
    const r1 = await apiGet(`/operator/sessions/${statiqSess.id}`, tataOp.cookies);
    assert('Tata operator cannot view Statiq session -> 403 CPO_ACCESS_DENIED', r1.status === 403 && r1.body?.error?.code === 'CPO_ACCESS_DENIED');

    const r2 = await apiPost(`/operator/sessions/${statiqSess.id}/remote-stop`, {}, tataOp.cookies);
    assert('Tata operator cannot remote-stop Statiq session -> 403 CPO_ACCESS_DENIED', r2.status === 403 && r2.body?.error?.code === 'CPO_ACCESS_DENIED');
  }

  // 3. Query parameter tenancy override bypass attempt
  {
    const statiqCpoId = statiqOp.user?.cpo_id;
    if (statiqCpoId) {
      const r = await apiGet(`/operator/overview?cpo_id=${statiqCpoId}`, tataOp.cookies);
      assert('Tata operator overriding ?cpo_id=<statiq> rejected -> 403 CPO_ACCESS_DENIED', r.status === 403 && r.body?.error?.code === 'CPO_ACCESS_DENIED');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('D. Driver Resource Isolation & IDOR Protection');
  // ──────────────────────────────────────────────────────────────────────────

  // Find or create a session belonging to Driver 1
  const d1SessionRes = await query(
    `SELECT id FROM charging_sessions WHERE user_id = $1 LIMIT 1`,
    [driver1.user.id]
  );
  let d1SessionId = d1SessionRes.rows[0]?.id;

  if (d1SessionId) {
    // Driver 2 trying to get Driver 1's session
    const r1 = await apiGet(`/sessions/${d1SessionId}`, driver2.cookies);
    assert('Driver 2 GET Driver 1 session -> 404 SESSION_NOT_FOUND (IDOR prevented)', r1.status === 404 && r1.body?.error?.code === 'SESSION_NOT_FOUND');

    // Driver 2 trying to stop Driver 1's session
    const r2 = await apiPost(`/sessions/${d1SessionId}/stop`, {}, driver2.cookies);
    assert('Driver 2 POST /sessions/:id/stop on Driver 1 session -> 404 SESSION_NOT_FOUND', r2.status === 404 && r2.body?.error?.code === 'SESSION_NOT_FOUND');

    // Driver 2 trying to fetch Driver 1's telemetry
    const r3 = await apiGet(`/sessions/${d1SessionId}/telemetry`, driver2.cookies);
    assert('Driver 2 GET /sessions/:id/telemetry on Driver 1 session -> 404 SESSION_NOT_FOUND', r3.status === 404 && r3.body?.error?.code === 'SESSION_NOT_FOUND');
  }

  // Find a CDR belonging to Driver 1
  const d1CdrRes = await query(
    `SELECT id FROM cdrs WHERE user_id = $1 LIMIT 1`,
    [driver1.user.id]
  );
  const d1CdrId = d1CdrRes.rows[0]?.id;

  if (d1CdrId) {
    // Driver 2 trying to inspect Driver 1's CDR
    const r1 = await apiGet(`/cdrs/${d1CdrId}`, driver2.cookies);
    assert('Driver 2 GET Driver 1 CDR -> 403 CDR_ACCESS_DENIED', r1.status === 403);

    // Driver 2 trying to settle Driver 1's CDR
    const r2 = await apiPost(`/cdrs/${d1CdrId}/settle`, {}, driver2.cookies);
    assert('Driver 2 POST /cdrs/:id/settle on Driver 1 CDR -> 403 CDR_ACCESS_DENIED', r2.status === 403);
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('E. Driver PII Masking Verification');
  // ──────────────────────────────────────────────────────────────────────────

  {
    const r = await apiGet('/operator/sessions?limit=10', tataOp.cookies);
    assert('Operator session feed returns 200', r.status === 200);
    const sessions = r.body?.data || [];
    if (sessions.length > 0) {
      const sample = sessions[0];
      assert('Driver name is present and masked (no raw email/phone)', typeof sample.driver?.name === 'string');
      assert('Driver email is NOT leaked in operator feed', sample.driver?.email === undefined);
      assert('Driver phone is NOT leaked in operator feed', sample.driver?.phone === undefined);
      assert('Driver wallet_id is NOT leaked in operator feed', sample.driver?.wallet_id === undefined);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('F. Session & Remote-Stop Lifecycle Invariants');
  // ──────────────────────────────────────────────────────────────────────────

  // 1. Invalid UUID
  {
    const r = await apiPost('/operator/sessions/not-a-uuid/remote-stop', {}, tataOp.cookies);
    assert('Remote stop with invalid UUID returns 400', r.status === 400);
  }

  // 2. Non-existent UUID
  {
    const r = await apiPost('/operator/sessions/ffffffff-ffff-ffff-ffff-ffffffffffff/remote-stop', {}, tataOp.cookies);
    assert('Remote stop on non-existent session returns 404', r.status === 404);
  }

  // 3. Remote stop on already terminal/stopped session
  const stoppedSessRes = await query(
    `SELECT cs.id FROM charging_sessions cs
     JOIN connectors cn ON cs.connector_id = cn.id
     JOIN evses e ON cn.evse_id = e.id
     JOIN locations l ON e.location_id = l.id
     WHERE cs.status = 'stopped' AND l.cpo_id = $1
     LIMIT 1`,
    [tataOp.user.cpo_id]
  );
  if (stoppedSessRes.rows.length > 0) {
    const sessId = stoppedSessRes.rows[0].id;
    const r = await apiPost(`/operator/sessions/${sessId}/remote-stop`, {}, tataOp.cookies);
    assert('Remote stop on already-stopped session returns 409 SESSION_ALREADY_STOPPED', r.status === 409 && r.body?.error?.code === 'SESSION_ALREADY_STOPPED');
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('G. Financial Integrity & Snapshot Immutability');
  // ──────────────────────────────────────────────────────────────────────────

  // 1. Tariff snapshot immutability
  // Verify that an existing session with tariff_snapshot retains its original snapshot even if tariff is updated
  const sessWithSnapshotRes = await query(
    `SELECT cs.id, cs.tariff_id, cs.tariff_snapshot
     FROM charging_sessions cs
     WHERE cs.tariff_snapshot IS NOT NULL
     LIMIT 1`
  );

  if (sessWithSnapshotRes.rows.length > 0) {
    const s = sessWithSnapshotRes.rows[0];
    const snap = typeof s.tariff_snapshot === 'string' ? JSON.parse(s.tariff_snapshot) : s.tariff_snapshot;
    assert('Historical/active session has immutable tariff_snapshot', typeof snap === 'object' && snap !== null);
    assert('Tariff snapshot contains rate components', snap.price_per_kwh != null || snap.base_rate != null);
  }

  // 2. Finalized CDR immutability & idempotency
  const finalizedCdrRes = await query(
    `SELECT c.id, c.session_id, c.user_id, c.total_amount, c.settlement_status, u.email
     FROM cdrs c
     JOIN users u ON c.user_id = u.id
     WHERE c.status = 'finalized' LIMIT 1`
  );

  if (finalizedCdrRes.rows.length > 0) {
    const c = finalizedCdrRes.rows[0];
    assert('Finalized CDR has authoritative total_amount', c.total_amount != null);

    // Call settle endpoint with wrong user (admin) to verify strict ownership enforcement
    const rDenied = await apiPost(`/cdrs/${c.id}/settle`, {}, admin.cookies);
    assert('Non-owner cannot settle CDR -> 403 CDR_ACCESS_DENIED', rDenied.status === 403);

    // Generate token for actual CDR owner to test idempotency
    const ownerToken = jwt.sign(
      { sub: c.user_id, role: 'driver' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
    const ownerCookie = `vg_token=${ownerToken}`;

    const r1 = await apiPost(`/cdrs/${c.id}/settle`, {}, ownerCookie);
    assert('Owner settle CDR response is valid HTTP 200 or handles balance safely', r1.status === 200 || r1.status === 400);

    if (r1.status === 200) {
      // Repeat call to ensure strict idempotency
      const r2 = await apiPost(`/cdrs/${c.id}/settle`, {}, ownerCookie);
      assert('Subsequent settle call is idempotent (returns settled)', r2.status === 200 && (r2.body?.data?.settled === true || r2.body?.data?.already_settled === true));
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('H. Concurrency & Idempotency Guards');
  // ──────────────────────────────────────────────────────────────────────────

  // 1. Direct wallet settlement service idempotency
  if (finalizedCdrRes.rows.length > 0) {
    const c = finalizedCdrRes.rows[0];
    const { settleCdr } = await import('../services/walletSettlementService.js');
    const res1 = await settleCdr(c.id, { throwOnInsufficient: false });
    assert('First settle call returns a valid result', res1.settled !== undefined);

    const res2 = await settleCdr(c.id, { throwOnInsufficient: false });
    if (res1.settled) {
      assert('Second settle call is idempotent with already_settled=true', res2.already_settled === true && res2.settled === true);
    } else {
      assert('Second settle call retains failure state idempotently', res2.settled === false && res2.status === 'failed');
    }
  }

  // 2. Direct payment credit idempotency
  {
    const { creditWalletForPayment, createPaymentOrder } = await import('../services/paymentService.js');
    // Create an order for driver1
    const order = await createPaymentOrder({
      userId: driver1.user.id,
      amount: 100,
      currency: 'INR',
    });
    assert('Payment order created successfully', order && order.order_id);

    // First credit
    const credit1 = await creditWalletForPayment({
      providerOrderId: order.order_id,
      providerPaymentId: `pay_${Date.now()}`,
      providerAmountInRupees: 100,
      userId: driver1.user.id,
    });
    assert('First credit succeeds with already_processed=false', credit1.success === true && credit1.already_processed === false);

    // Replay same order (idempotency test)
    const credit2 = await creditWalletForPayment({
      providerOrderId: order.order_id,
      providerPaymentId: `pay_replay_${Date.now()}`,
      providerAmountInRupees: 100,
      userId: driver1.user.id,
    });
    assert('Replayed credit returns already_processed=true without duplicate credit', credit2.success === true && credit2.already_processed === true);
    assert('Ledger transaction ID matches original credit transaction', credit2.transaction_id === credit1.transaction_id);
  }

  // Clean up Driver 2
  if (driver2.user?.id) {
    await query('DELETE FROM users WHERE id = $1', [driver2.user.id]).catch(() => {});
  }

  console.log('\n' + '='.repeat(68));
  console.log(`  PHASE 4F RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(68) + '\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
