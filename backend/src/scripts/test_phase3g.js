/**
 * backend/src/scripts/test_phase3g.js
 *
 * Phase 3G: Unified Financial Activity & Wallet Hub Integration Test Suite
 *
 * Comprehensive coverage:
 *  A. Top-Up Order Creation & Validation (bounds, currency, unauth)
 *  B. Payment Checkout Verification & Authoritative Ledger Credit
 *  C. Payment History API & User Isolation (IDOR)
 *  D. Enriched Ledger Transactions Query (running balances, references, metadata)
 *  E. Settlement Failure Recovery Workflow (Insufficient balance -> topup -> retry settle)
 *  F. Session History Settlement Status Enrichment
 *  G. Authorization & Idempotency Guards
 */

import crypto from 'crypto';
import pool, { query } from '../config/database.js';
import config from '../config/env.js';
import { getWallet } from '../services/walletService.js';
import paymentProvider from '../services/paymentProvider.js';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function registerTestUser(label) {
  const ts = Date.now() + Math.floor(Math.random() * 100000);
  const email = `phase3g_${label}_${ts}@example.com`;
  const phone = `+9198${Math.floor(10000000 + Math.random() * 89999999)}`;
  const password = 'Password123!';

  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Phase3G ${label}`,
      email,
      phone,
      password,
    }),
  });

  const rawCookies = res.headers.get('set-cookie') || '';
  const tokenMatch = rawCookies.match(/vg_token=([^;]+)/);
  const cookies = tokenMatch ? `vg_token=${tokenMatch[1]}` : '';

  const json = await res.json();
  return {
    user: json.data?.user || json.data,
    cookies,
    email,
    password,
  };
}

async function getAvailableConnector() {
  const r = await query(`
    SELECT cn.id AS connector_id, e.id AS evse_id, l.id AS location_id, l.cpo_id
    FROM connectors cn
    JOIN evses e ON cn.evse_id = e.id
    JOIN locations l ON e.location_id = l.id
    WHERE cn.status = 'available'
    LIMIT 1
  `);
  if (r.rows.length === 0) {
    // If none marked available, pick any connector
    const anyR = await query(`SELECT id AS connector_id FROM connectors LIMIT 1`);
    return anyR.rows[0];
  }
  return r.rows[0];
}

async function createTestVehicle(userId) {
  const r = await query(
    `INSERT INTO vehicles (user_id, manufacturer, model, battery_capacity_kwh, connector_type)
     VALUES ($1, 'Tata', 'Nexon EV 3G', 40.5, 'CCS2')
     RETURNING id`,
    [userId]
  );
  return r.rows[0].id;
}

function generateValidSignature(orderId, paymentId, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

async function cleanupUser(userId) {
  try {
    await query(`DELETE FROM payments WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = $1)`, [userId]);
    await query(`DELETE FROM cdrs WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM charging_sessions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM vehicles WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM users WHERE id = $1`, [userId]);
  } catch (err) {
    // ignore cleanup errors
  }
}

// ---------------------------------------------------------------------------
// Main Test Runner
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n' + '='.repeat(65));
  console.log('⚡ VahanGrid Phase 3G: Unified Financial Activity & Wallet Hub');
  console.log('='.repeat(65));

  let userA, userB;

  try {
    // -------------------------------------------------------------------------
    // 0. Bootstrap
    // -------------------------------------------------------------------------
    userA = await registerTestUser('userA');
    userB = await registerTestUser('userB');

    assert('Bootstrap: User A registered with session cookie', !!userA.cookies);
    assert('Bootstrap: User B registered with session cookie', !!userB.cookies);

    const initialWalletA = await getWallet(userA.user.id);
    assert('Bootstrap: User A initial derived balance is 0.00', Number(initialWalletA.balance) === 0.00);

    // -------------------------------------------------------------------------
    // A. TOP-UP ORDER CREATION & VALIDATION
    // -------------------------------------------------------------------------
    section('A. Top-Up Order Creation & Validation');

    // A1. Unauthenticated order creation rejected
    const unauthOrderRes = await fetch(`${BASE_URL}/payments/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 500 }),
    });
    assert('A1. Unauthenticated /payments/orders returns 401', unauthOrderRes.status === 401);

    // A2. Valid order creation
    const validOrderRes = await fetch(`${BASE_URL}/payments/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userA.cookies,
      },
      body: JSON.stringify({ amount: 500, currency: 'INR' }),
    });
    const orderData = await validOrderRes.json();
    assert('A2. Order creation returns 201', validOrderRes.status === 201);
    assert('A2. Response contains payment_id', !!orderData.data?.payment_id);
    assert('A2. Response contains provider order_id', orderData.data?.order_id?.startsWith('order_'));
    assert('A2. Response has key_id (public checkout key)', !!orderData.data?.key_id);
    assert('A2. Key secret is NOT exposed in response', !orderData.data?.key_secret);
    assert('A2. Order amount is 500', orderData.data?.amount === 500);

    // A3. Invalid amounts: 0, negative, below minimum (<10), above maximum (>50000), bad currency
    const resZero = await fetch(`${BASE_URL}/payments/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userA.cookies },
      body: JSON.stringify({ amount: 0 }),
    });
    assert('A3. Amount 0 returns 400', resZero.status === 400);

    const resBelowMin = await fetch(`${BASE_URL}/payments/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userA.cookies },
      body: JSON.stringify({ amount: 5 }),
    });
    assert('A3. Amount below min (₹5 < ₹10) returns 400', resBelowMin.status === 400);

    const resAboveMax = await fetch(`${BASE_URL}/payments/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userA.cookies },
      body: JSON.stringify({ amount: 60000 }),
    });
    assert('A3. Amount above max (₹60,000 > ₹50,000) returns 400', resAboveMax.status === 400);

    const resBadCurr = await fetch(`${BASE_URL}/payments/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userA.cookies },
      body: JSON.stringify({ amount: 500, currency: 'USD' }),
    });
    assert('A3. Non-INR currency returns 400', resBadCurr.status === 400);

    // -------------------------------------------------------------------------
    // B. PAYMENT CHECKOUT VERIFICATION & AUTHORITATIVE CREDIT
    // -------------------------------------------------------------------------
    section('B. Payment Checkout Verification & Authoritative Credit');

    const orderId = orderData.data.order_id;
    const testPaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
    const validSig = generateValidSignature(orderId, testPaymentId, config.payment.keySecret);

    // B1. Invalid / forged signature rejected
    const forgedRes = await fetch(`${BASE_URL}/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userA.cookies },
      body: JSON.stringify({
        order_id: orderId,
        payment_id: testPaymentId,
        signature: 'invalid_forged_signature_hex_1234567890',
      }),
    });
    assert('B1. Forged signature returns 400 INVALID_SIGNATURE', forgedRes.status === 400);

    // Unverified payment does NOT credit wallet
    const unverifiedWallet = await getWallet(userA.user.id);
    assert('B1. Wallet balance remains 0.00 after forged signature attempt', Number(unverifiedWallet.balance) === 0.00);

    // B2. Valid checkout completion signature verified
    const verifyRes = await fetch(`${BASE_URL}/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userA.cookies },
      body: JSON.stringify({
        order_id: orderId,
        payment_id: testPaymentId,
        signature: validSig,
      }),
    });
    const verifyData = await verifyRes.json();
    assert('B2. Valid payment verification returns 200', verifyRes.status === 200);
    assert('B2. Verify result confirms payment success', verifyData.data?.status === 'paid');
    assert('B2. Verify result returns linked transaction_id', !!verifyData.data?.transaction_id);

    // B3. Authoritative derived wallet balance updated
    const creditedWallet = await getWallet(userA.user.id);
    assert('B3. Authoritative wallet balance is now exactly 500.00', Number(creditedWallet.balance) === 500.00);

    // B4. Idempotency: Replaying verification returns already_processed, balance unchanged
    const replayRes = await fetch(`${BASE_URL}/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userA.cookies },
      body: JSON.stringify({
        order_id: orderId,
        payment_id: testPaymentId,
        signature: validSig,
      }),
    });
    assert('B4. Replayed payment verification returns 200', replayRes.status === 200);
    const recheckWallet = await getWallet(userA.user.id);
    assert('B4. Invariant: Wallet balance remains exactly 500.00 (no double credit)', Number(recheckWallet.balance) === 500.00);

    // -------------------------------------------------------------------------
    // C. PAYMENT HISTORY API & USER ISOLATION
    // -------------------------------------------------------------------------
    section('C. Payment History API & User Isolation (IDOR)');

    // C1. User A lists payment history
    const listPayRes = await fetch(`${BASE_URL}/payments`, {
      method: 'GET',
      headers: { Cookie: userA.cookies },
    });
    const listPayData = await listPayRes.json();
    assert('C1. GET /payments returns 200', listPayRes.status === 200);
    assert('C1. Payments list is an array', Array.isArray(listPayData.data));
    assert('C1. Payments list contains the paid order', listPayData.data.some((p) => p.provider_order_id === orderId));

    const paymentRecord = listPayData.data.find((p) => p.provider_order_id === orderId);
    assert('C1. Payment record status is paid', paymentRecord?.status === 'paid');
    assert('C1. Payment record has linked wallet_transaction_id', !!paymentRecord?.wallet_transaction_id);

    // C2. IDOR: User B cannot access User A's payment record
    const crossPayRes = await fetch(`${BASE_URL}/payments/${paymentRecord.id}`, {
      method: 'GET',
      headers: { Cookie: userB.cookies },
    });
    assert('C2. Cross-user GET /payments/:id returns 403 PAYMENT_ACCESS_DENIED', crossPayRes.status === 403);

    // -------------------------------------------------------------------------
    // D. ENRICHED LEDGER TRANSACTIONS QUERY
    // -------------------------------------------------------------------------
    section('D. Enriched Ledger Transactions Query');

    const txnsRes = await fetch(`${BASE_URL}/wallet/transactions`, {
      method: 'GET',
      headers: { Cookie: userA.cookies },
    });
    const txnsData = await txnsRes.json();
    assert('D1. GET /wallet/transactions returns 200', txnsRes.status === 200);
    assert('D1. Transactions returned as array', Array.isArray(txnsData.data));

    const topupTx = txnsData.data.find((t) => t.type === 'topup');
    assert('D2. Top-up transaction exists in ledger', !!topupTx);
    assert('D2. Top-up amount is +500.00', topupTx?.amount === 500.00);
    assert('D2. Top-up transaction includes payment_id', !!topupTx?.payment_id);
    assert('D2. Top-up transaction balance_before is 0.00', topupTx?.balance_before === 0.00);
    assert('D2. Top-up transaction balance_after is 500.00', topupTx?.balance_after === 500.00);
    assert('D2. Top-up transaction payment_status is paid', topupTx?.payment_status === 'paid');

    // -------------------------------------------------------------------------
    // E. SETTLEMENT FAILURE RECOVERY WORKFLOW
    // -------------------------------------------------------------------------
    section('E. Settlement Failure Recovery Workflow');

    // Setup: User B has 0.00 wallet balance
    const conn = await getAvailableConnector();
    const vehB = await createTestVehicle(userB.user.id);

    // 1. User B starts and stops a charging session
    const startRes = await fetch(`${BASE_URL}/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userB.cookies },
      body: JSON.stringify({
        connector_id: conn.connector_id,
        vehicle_id: vehB,
      }),
    });
    assert('E1. User B starts session (201)', startRes.status === 201);
    const startData = await startRes.json();
    const sessionId = startData.data.id;

    // Simulate energy delivery: 10 kWh
    await query(
      `UPDATE charging_sessions
       SET energy_kwh = 10.0,
           duration_seconds = 1800,
           cost_amount = 150.00
       WHERE id = $1`,
      [sessionId]
    );

    // Stop session -> finalizes CDR asynchronously
    const stopRes = await fetch(`${BASE_URL}/sessions/${sessionId}/stop`, {
      method: 'POST',
      headers: { Cookie: userB.cookies },
    });
    assert('E2. User B stops session (200)', stopRes.status === 200);

    // Fetch the CDR (allow up to 1s for asynchronous finalizeCdr)
    let cdrRes = null;
    let cdrData = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 100));
      cdrRes = await fetch(`${BASE_URL}/sessions/${sessionId}/cdr`, {
        method: 'GET',
        headers: { Cookie: userB.cookies },
      });
      if (cdrRes.status === 200) {
        cdrData = await cdrRes.json();
        if (cdrData?.data?.id) break;
      }
    }

    assert('E3. CDR retrieved for session (200)', cdrRes?.status === 200 && cdrData?.data?.id != null);
    const cdrId = cdrData?.data?.id;
    const cdrTotal = Number(cdrData?.data?.total_amount);
    assert('E3. CDR has authoritative total_amount > 0', cdrTotal > 0);

    // In background or auto-settlement, User B has 0 balance, so settlement failed
    // Explicitly call settle endpoint to verify HTTP 400 + INSUFFICIENT_FUNDS
    const settleFailRes = await fetch(`${BASE_URL}/cdrs/${cdrId}/settle`, {
      method: 'POST',
      headers: { Cookie: userB.cookies },
    });
    const settleFailData = await settleFailRes.json();
    assert('E4. Settle with insufficient balance returns 400', settleFailRes.status === 400);
    assert('E4. Error code is INSUFFICIENT_FUNDS', settleFailData.error?.code === 'INSUFFICIENT_FUNDS');
    assert('E4. Error details include current_balance (0)', settleFailData.error?.details?.current_balance === 0);
    assert('E4. Error details include required_amount matching CDR total', Number(settleFailData.error?.details?.required_amount) === cdrTotal);

    // Verify CDR in database is marked failed
    const dbCdrFailed = await query(`SELECT settlement_status, settlement_failure_reason FROM cdrs WHERE id = $1`, [cdrId]);
    assert('E5. CDR marked settlement_status = failed in DB', dbCdrFailed.rows[0]?.settlement_status === 'failed');
    assert('E5. CDR settlement_failure_reason = INSUFFICIENT_FUNDS', dbCdrFailed.rows[0]?.settlement_failure_reason === 'INSUFFICIENT_FUNDS');

    // 2. User B tops up wallet with enough funds (cdrTotal + ₹100)
    const fundAmount = Number((cdrTotal + 100).toFixed(2));
    const topupOrderRes = await fetch(`${BASE_URL}/payments/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userB.cookies },
      body: JSON.stringify({ amount: fundAmount, currency: 'INR' }),
    });
    const topupOrderJson = await topupOrderRes.json();
    const bOrderId = topupOrderJson.data.order_id;
    const bPayId = `pay_${crypto.randomBytes(8).toString('hex')}`;
    const bSig = generateValidSignature(bOrderId, bPayId, config.payment.keySecret);

    await fetch(`${BASE_URL}/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userB.cookies },
      body: JSON.stringify({
        order_id: bOrderId,
        payment_id: bPayId,
        signature: bSig,
      }),
    });

    const fundedWalletB = await getWallet(userB.user.id);
    assert('E6. User B wallet funded successfully', Number(fundedWalletB.balance) === fundAmount);

    // 3. User B retries settlement on the failed CDR
    const retryRes = await fetch(`${BASE_URL}/cdrs/${cdrId}/settle`, {
      method: 'POST',
      headers: { Cookie: userB.cookies },
    });
    const retryData = await retryRes.json();
    assert('E7. Retry settlement succeeds with 200', retryRes.status === 200);
    assert('E7. Retry result confirms settled: true', retryData.data?.settled === true);
    assert('E7. Retry result already_settled: false', retryData.data?.already_settled === false);
    assert('E7. Balance after settlement is exactly 100.00', Number(retryData.data?.balance_after) === 100.00);

    // 4. Verify CDR in database is now settled
    const dbCdrSettled = await query(`SELECT settlement_status, settlement_failure_reason, wallet_transaction_id FROM cdrs WHERE id = $1`, [cdrId]);
    assert('E8. CDR updated to settlement_status = settled', dbCdrSettled.rows[0]?.settlement_status === 'settled');
    assert('E8. CDR settlement_failure_reason cleared to NULL', dbCdrSettled.rows[0]?.settlement_failure_reason === null);
    assert('E8. CDR has linked wallet_transaction_id', !!dbCdrSettled.rows[0]?.wallet_transaction_id);

    // 5. Repeated retry on settled CDR is idempotent
    const repeatRes = await fetch(`${BASE_URL}/cdrs/${cdrId}/settle`, {
      method: 'POST',
      headers: { Cookie: userB.cookies },
    });
    const repeatData = await repeatRes.json();
    assert('E9. Repeated settlement retry returns 200', repeatRes.status === 200);
    assert('E9. Repeated settlement reports already_settled: true', repeatData.data?.already_settled === true);

    const finalWalletB = await getWallet(userB.user.id);
    assert('E9. Final User B wallet balance unchanged at 100.00', Number(finalWalletB.balance) === 100.00);

    // -------------------------------------------------------------------------
    // F. ENRICHED SESSION HISTORY WITH SETTLEMENT STATUS
    // -------------------------------------------------------------------------
    section('F. Enriched Session History with Settlement Status');

    const sessionsRes = await fetch(`${BASE_URL}/sessions`, {
      method: 'GET',
      headers: { Cookie: userB.cookies },
    });
    const sessionsData = await sessionsRes.json();
    assert('F1. GET /sessions returns 200', sessionsRes.status === 200);
    assert('F1. Sessions list is an array', Array.isArray(sessionsData.data));

    const settledSession = sessionsData.data.find((s) => s.id === sessionId);
    assert('F2. Listed session includes cdr_id', !!settledSession?.cdr_id);
    assert('F2. Listed session includes settlement_status = settled', settledSession?.settlement_status === 'settled');

    // -------------------------------------------------------------------------
    // G. CROSS-USER AUTHORIZATION (IDOR GUARDS)
    // -------------------------------------------------------------------------
    section('G. Cross-User Authorization (IDOR Guards)');

    // User A cannot settle User B's CDR
    const crossSettleRes = await fetch(`${BASE_URL}/cdrs/${cdrId}/settle`, {
      method: 'POST',
      headers: { Cookie: userA.cookies },
    });
    assert('G1. User A cannot settle User B CDR (403 CDR_ACCESS_DENIED)', crossSettleRes.status === 403);

    // Unauthenticated settlement attempt
    const unauthSettleRes = await fetch(`${BASE_URL}/cdrs/${cdrId}/settle`, {
      method: 'POST',
    });
    assert('G2. Unauthenticated settle returns 401', unauthSettleRes.status === 401);

  } catch (err) {
    console.error('Fatal test runner error:', err);
    failed++;
    errors.push(`Runner error: ${err.message}`);
  } finally {
    if (userA) await cleanupUser(userA.user.id);
    if (userB) await cleanupUser(userB.user.id);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(65));
  console.log(`Phase 3G Test Summary: Passed: ${passed}, Failed: ${failed}`);
  if (errors.length > 0) {
    console.log('Failed assertions:');
    errors.forEach((e) => console.log(` - ${e}`));
  }
  console.log('='.repeat(65));

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Unhandled rejection:', e);
  process.exit(1);
});
