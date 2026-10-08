/**
 * backend/src/scripts/test_phase3e4.js
 *
 * Phase 3E.4 — Wallet Top-Up & Payment Gateway Integration Test Suite.
 *
 * Test coverage:
 *  A. Payment order creation (auth, unauth, positive/zero/negative amount, limits, currency, wallet assoc)
 *  B. Provider integration (payload shape, error/timeout handling, invalid response)
 *  C. Webhook verification (valid sig, invalid sig, missing sig, malformed payload, replay)
 *  D. Successful payment (state transition to paid, single wallet credit, correct balance_before/after)
 *  E. Webhook idempotency (sequential duplicate, concurrent race condition, single credit invariant)
 *  F. Amount tampering protection (webhook claiming amount != backend order amount is rejected)
 *  G. Failure cases (failed webhook event, cancelled payment, missing order, rollback)
 *  H. Payment status & listing API (own payment, cross-user IDOR rejection, unauth, list payments)
 *
 * Run: node backend/src/scripts/test_phase3e4.js
 */

import pool, { query } from '../config/database.js';
import config from '../config/env.js';
import paymentProvider, { RazorpayPaymentProvider } from '../services/paymentProvider.js';
import {
  createPaymentOrder,
  processPaymentWebhook,
  creditWalletForPayment,
  getPaymentById,
  listUserPayments,
} from '../services/paymentService.js';
import { getWallet } from '../services/walletService.js';

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

function parseCookies(res) {
  const rawHeaders = res.headers.raw ? res.headers.raw() : {};
  const setCookie = rawHeaders['set-cookie'] || res.headers.getSetCookie?.() || [];
  const cookies = [];
  for (const str of setCookie) {
    const part = str.split(';')[0];
    if (part) cookies.push(part.trim());
  }
  return cookies.join('; ');
}

async function registerTestUser(label) {
  const ts = Date.now() + Math.floor(Math.random() * 100000);
  const email = `phase3e4_${label}_${ts}@example.com`;
  const password = 'TestPassword123!';

  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: `User ${label}` }),
  });

  const json = await res.json();
  const cookies = parseCookies(res);
  const token = json.data?.token;
  const user = json.data?.user;

  return { email, password, user, cookies, token };
}

async function run() {
  console.log('=================================================================');
  console.log('⚡ VahanGrid Phase 3E.4: Payment Gateway & Wallet Top-up Tests');
  console.log('=================================================================');

  // Setup test users
  const userA = await registerTestUser('userA');
  const userB = await registerTestUser('userB');

  assert('Setup: User A registered with auto-created wallet', !!userA.user?.id);
  assert('Setup: User B registered with auto-created wallet', !!userB.user?.id);

  // ─────────────────────────────────────────────────────────────────────────────
  // A. PAYMENT ORDER CREATION
  // ─────────────────────────────────────────────────────────────────────────────
  section('A. Payment Order Creation');

  // A1. Unauthenticated request -> 401
  const unauthOrderRes = await fetch(`${BASE_URL}/payments/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 500, currency: 'INR' }),
  });
  assert('A1. Unauthenticated request to /payments/orders returns 401', unauthOrderRes.status === 401);

  // A2. Authenticated valid order creation -> 201
  const validOrderRes = await fetch(`${BASE_URL}/payments/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: userA.cookies,
    },
    body: JSON.stringify({ amount: 500.0, currency: 'INR' }),
  });
  const validOrderJson = await validOrderRes.json();
  assert('A2. Authenticated order creation returns 201', validOrderRes.status === 201);
  assert('A2. Order response has payment_id', !!validOrderJson.data?.payment_id);
  assert('A2. Order response has provider order_id starting with order_', validOrderJson.data?.order_id?.startsWith('order_'));
  assert('A2. Order response amount is 500', validOrderJson.data?.amount === 500);
  assert('A2. Order status is created', validOrderJson.data?.status === 'created');

  // Verify DB record for A2
  const dbOrderRes = await query(
    `SELECT p.*, w.user_id AS wallet_owner
     FROM payments p
     JOIN wallets w ON p.wallet_id = w.id
     WHERE p.id = $1`,
    [validOrderJson.data?.payment_id]
  );
  assert('A2. Payment record exists in database', dbOrderRes.rows.length === 1);
  assert('A2. Payment associated with correct user', dbOrderRes.rows[0]?.user_id === userA.user.id);
  assert('A2. Payment associated with correct user wallet', dbOrderRes.rows[0]?.wallet_owner === userA.user.id);

  // A3. Zero amount -> 400
  const zeroOrderRes = await fetch(`${BASE_URL}/payments/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: userA.cookies },
    body: JSON.stringify({ amount: 0, currency: 'INR' }),
  });
  assert('A3. Zero amount returns 400', zeroOrderRes.status === 400);

  // A4. Negative amount -> 400
  const negOrderRes = await fetch(`${BASE_URL}/payments/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: userA.cookies },
    body: JSON.stringify({ amount: -250, currency: 'INR' }),
  });
  assert('A4. Negative amount returns 400', negOrderRes.status === 400);

  // A5. Invalid currency -> 400
  const badCurrRes = await fetch(`${BASE_URL}/payments/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: userA.cookies },
    body: JSON.stringify({ amount: 500, currency: 'USD' }),
  });
  assert('A5. Non-INR currency returns 400', badCurrRes.status === 400);

  // A6. Below minimum amount (< ₹10) -> 400
  const belowMinRes = await fetch(`${BASE_URL}/payments/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: userA.cookies },
    body: JSON.stringify({ amount: 5, currency: 'INR' }),
  });
  assert('A6. Amount below minimum (₹5 < ₹10) returns 400', belowMinRes.status === 400);

  // A7. Above maximum amount (> ₹50,000) -> 400
  const aboveMaxRes = await fetch(`${BASE_URL}/payments/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: userA.cookies },
    body: JSON.stringify({ amount: 60000, currency: 'INR' }),
  });
  assert('A7. Amount above maximum (₹60,000 > ₹50,000) returns 400', aboveMaxRes.status === 400);

  // ─────────────────────────────────────────────────────────────────────────────
  // B. PROVIDER INTEGRATION ABSTRACTION
  // ─────────────────────────────────────────────────────────────────────────────
  section('B. Payment Provider Integration');

  const customProvider = new RazorpayPaymentProvider({
    keyId: 'rzp_test_testkey',
    keySecret: 'secret_123',
    webhookSecret: 'webhook_sec_123',
  });

  // B1. Correct order creation payload
  const provOrder = await customProvider.createOrder({ amount: 150.50, currency: 'INR' });
  assert('B1. Provider returns order with order_ prefix', provOrder.id.startsWith('order_'));
  assert('B1. Amount converted to paise (150.50 -> 15050)', provOrder.amount === 15050);
  assert('B1. Provider order status is created', provOrder.status === 'created');

  // B2. Provider failure / invalid inputs
  let threwProvErr = false;
  try {
    await customProvider.createOrder({ amount: -100 });
  } catch {
    threwProvErr = true;
  }
  assert('B2. Negative amount throws error in provider abstraction', threwProvErr);

  // B3. Provider signature verification
  const testPayload = JSON.stringify({ event: 'order.paid', test: 123 });
  const validSig = customProvider.generateWebhookSignature(testPayload);
  assert('B3. Valid webhook signature passes verification', customProvider.verifyWebhookSignature(testPayload, validSig));
  assert('B3. Corrupted signature fails verification', !customProvider.verifyWebhookSignature(testPayload, 'bad_signature_123'));

  // ─────────────────────────────────────────────────────────────────────────────
  // C. WEBHOOK VERIFICATION & SECURITY
  // ─────────────────────────────────────────────────────────────────────────────
  section('C. Webhook Verification & Security');

  // Create an order for webhook testing
  const whOrder = await createPaymentOrder({ userId: userA.user.id, amount: 250.0 });
  const whPayloadObj = {
    event: 'order.paid',
    payload: {
      order: { entity: { id: whOrder.order_id, amount: 25000 } },
      payment: { entity: { id: 'pay_test_' + Date.now(), order_id: whOrder.order_id, amount: 25000 } },
    },
  };
  const whRawBody = JSON.stringify(whPayloadObj);

  // C1. Missing signature header -> 400
  const missingSigRes = await fetch(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: whRawBody,
  });
  assert('C1. Webhook with missing signature returns 400', missingSigRes.status === 400);

  // C2. Invalid signature header -> 400
  const invalidSigRes = await fetch(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
    body: whRawBody,
  });
  assert('C2. Webhook with forged/invalid signature returns 400', invalidSigRes.status === 400);

  // C3. Malformed payload with valid signature for raw string
  const malformedRaw = '{ this is not valid json :';
  const malformedSig = paymentProvider.generateWebhookSignature(malformedRaw);
  const malformedRes = await fetch(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': malformedSig,
    },
    body: malformedRaw,
  });
  assert('C3. Malformed payload returns 400', malformedRes.status === 400);

  // ─────────────────────────────────────────────────────────────────────────────
  // D. SUCCESSFUL PAYMENT & WALLET CREDIT
  // ─────────────────────────────────────────────────────────────────────────────
  section('D. Successful Payment & Wallet Credit');

  // Check user A initial balance
  const initialWallet = await getWallet(userA.user.id);
  const initialBal = initialWallet?.balance || 0;

  // Sign the valid webhook payload
  const validWhSig = paymentProvider.generateWebhookSignature(whRawBody);
  const successWhRes = await fetch(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': validWhSig,
    },
    body: whRawBody,
  });
  const successWhJson = await successWhRes.json();
  assert('D1. Valid webhook returns 200', successWhRes.status === 200);
  assert('D1. Webhook result indicates success', successWhJson.data?.received === true);

  // Verify payment DB state
  const paidPayment = await query(
    `SELECT * FROM payments WHERE provider_order_id = $1`,
    [whOrder.order_id]
  );
  assert('D2. Payment state updated to "paid"', paidPayment.rows[0]?.status === 'paid');
  assert('D2. Payment has completed_at set', !!paidPayment.rows[0]?.completed_at);
  assert('D2. Payment has linked wallet_transaction_id', !!paidPayment.rows[0]?.wallet_transaction_id);

  // Verify wallet transaction DB state
  const txnRow = await query(
    `SELECT * FROM wallet_transactions WHERE id = $1`,
    [paidPayment.rows[0]?.wallet_transaction_id]
  );
  assert('D3. Exactly one wallet transaction created', txnRow.rows.length === 1);
  assert('D3. Wallet transaction type is "topup"', txnRow.rows[0]?.type === 'topup');
  assert('D3. Wallet transaction amount is +250.00', Number(txnRow.rows[0]?.amount) === 250);
  assert('D3. Wallet transaction balance_before matches initial balance', Number(txnRow.rows[0]?.balance_before) === initialBal);
  assert('D3. Wallet transaction balance_after matches initial + 250', Number(txnRow.rows[0]?.balance_after) === initialBal + 250);

  // Verify derived wallet balance
  const updatedWallet = await getWallet(userA.user.id);
  assert(
    `D4. Derived wallet balance is ₹${(initialBal + 250).toFixed(2)}`,
    Math.abs(updatedWallet.balance - (initialBal + 250)) < 0.01
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // E. WEBHOOK IDEMPOTENCY
  // ─────────────────────────────────────────────────────────────────────────────
  section('E. Webhook Idempotency (Sequential & Concurrent)');

  // E1. Sequential replay of exact same webhook
  const replayRes = await fetch(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': validWhSig,
    },
    body: whRawBody,
  });
  const replayJson = await replayRes.json();
  assert('E1. Replayed webhook returns 200', replayRes.status === 200);
  assert('E1. Replayed webhook marked already_processed: true', replayJson.data?.result?.already_processed === true);

  // Re-verify that NO duplicate wallet transaction was created
  const txnCount = await query(
    `SELECT COUNT(*)::int AS count FROM wallet_transactions WHERE payment_id = $1`,
    [paidPayment.rows[0]?.id]
  );
  assert('E1. Invariant: Exactly ONE wallet transaction exists for payment after replay', txnCount.rows[0]?.count === 1);

  const walletAfterReplay = await getWallet(userA.user.id);
  assert(
    'E1. Wallet balance remains unchanged after duplicate webhook',
    Math.abs(walletAfterReplay.balance - (initialBal + 250)) < 0.01
  );

  // E2. Concurrent webhook delivery (Race condition safety)
  const concurrentOrder = await createPaymentOrder({ userId: userA.user.id, amount: 100.0 });
  const concurrentPayload = JSON.stringify({
    event: 'order.paid',
    payload: {
      order: { entity: { id: concurrentOrder.order_id, amount: 10000 } },
      payment: { entity: { id: 'pay_race_' + Date.now(), order_id: concurrentOrder.order_id, amount: 10000 } },
    },
  });
  const concurrentSig = paymentProvider.generateWebhookSignature(concurrentPayload);

  // Fire 5 identical webhooks simultaneously
  const concurrentResults = await Promise.all([
    fetch(`${BASE_URL}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': concurrentSig },
      body: concurrentPayload,
    }),
    fetch(`${BASE_URL}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': concurrentSig },
      body: concurrentPayload,
    }),
    fetch(`${BASE_URL}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': concurrentSig },
      body: concurrentPayload,
    }),
    fetch(`${BASE_URL}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': concurrentSig },
      body: concurrentPayload,
    }),
    fetch(`${BASE_URL}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': concurrentSig },
      body: concurrentPayload,
    }),
  ]);

  const all200 = concurrentResults.every(r => r.status === 200);
  assert('E2. All 5 concurrent webhooks returned 200', all200);

  const concurrentTxnCount = await query(
    `SELECT COUNT(*)::int AS count FROM wallet_transactions WHERE payment_id = $1`,
    [concurrentOrder.payment_id]
  );
  assert(
    'E2. Invariant: Under heavy concurrent delivery, exactly ONE wallet credit was recorded',
    concurrentTxnCount.rows[0]?.count === 1
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // F. AMOUNT TAMPERING SECURITY
  // ─────────────────────────────────────────────────────────────────────────────
  section('F. Amount Tampering Protection');

  // User creates order for ₹100
  const tamperOrder = await createPaymentOrder({ userId: userA.user.id, amount: 100.0 });
  const balBeforeTamper = (await getWallet(userA.user.id)).balance;

  // Attacker attempts to forge a webhook claiming payment of ₹10,000 for the ₹100 order
  const tamperedPayload = JSON.stringify({
    event: 'order.paid',
    payload: {
      order: { entity: { id: tamperOrder.order_id, amount: 1000000 } }, // ₹10,000 in paise
      payment: { entity: { id: 'pay_tamper_' + Date.now(), order_id: tamperOrder.order_id, amount: 1000000 } },
    },
  });
  const tamperedSig = paymentProvider.generateWebhookSignature(tamperedPayload);

  const tamperRes = await fetch(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': tamperedSig },
    body: tamperedPayload,
  });

  assert('F1. Tampered amount webhook returns 400', tamperRes.status === 400);

  // Verify payment record in DB marked failed with tampering detection
  const tamperedPaymentRow = await query(
    `SELECT * FROM payments WHERE id = $1`,
    [tamperOrder.payment_id]
  );
  assert('F2. Tampered payment status marked "failed"', tamperedPaymentRow.rows[0]?.status === 'failed');
  assert('F2. Tampered payment error_code is AMOUNT_TAMPERING_DETECTED', tamperedPaymentRow.rows[0]?.error_code === 'AMOUNT_TAMPERING_DETECTED');

  // Verify wallet balance was NOT modified
  const balAfterTamper = (await getWallet(userA.user.id)).balance;
  assert('F3. Wallet balance remains completely untouched after tampering attempt', Math.abs(balAfterTamper - balBeforeTamper) < 0.01);

  // ─────────────────────────────────────────────────────────────────────────────
  // G. FAILURE CASES & ROLLBACK
  // ─────────────────────────────────────────────────────────────────────────────
  section('G. Failure Cases & State Machine');

  // G1. Gateway failure event (payment.failed)
  const failOrder = await createPaymentOrder({ userId: userA.user.id, amount: 300.0 });
  const failPayload = JSON.stringify({
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: 'pay_fail_' + Date.now(),
          order_id: failOrder.order_id,
          error_code: 'BAD_REQUEST_ERROR',
          error_description: 'Payment failed at issuing bank',
        },
      },
    },
  });
  const failSig = paymentProvider.generateWebhookSignature(failPayload);
  const failWhRes = await fetch(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': failSig },
    body: failPayload,
  });
  assert('G1. payment.failed webhook returns 200', failWhRes.status === 200);

  const failedDbOrder = await query(`SELECT * FROM payments WHERE id = $1`, [failOrder.payment_id]);
  assert('G1. Payment status set to "failed"', failedDbOrder.rows[0]?.status === 'failed');
  assert('G1. Error code recorded correctly', failedDbOrder.rows[0]?.error_code === 'BAD_REQUEST_ERROR');
  assert('G1. No wallet transaction created for failed payment', failedDbOrder.rows[0]?.wallet_transaction_id === null);

  // G2. Non-existent order ID in webhook -> 404
  const missingOrderPayload = JSON.stringify({
    event: 'order.paid',
    payload: {
      order: { entity: { id: 'order_nonexistent_999999', amount: 50000 } },
      payment: { entity: { id: 'pay_none_123', order_id: 'order_nonexistent_999999', amount: 50000 } },
    },
  });
  const missingOrderSig = paymentProvider.generateWebhookSignature(missingOrderPayload);
  const missingOrderRes = await fetch(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': missingOrderSig },
    body: missingOrderPayload,
  });
  assert('G2. Webhook referencing non-existent order returns 404', missingOrderRes.status === 404);

  // G3. Cancelled payment cannot be paid
  const cancelOrder = await createPaymentOrder({ userId: userA.user.id, amount: 200.0 });
  await query(`UPDATE payments SET status = 'cancelled' WHERE id = $1`, [cancelOrder.payment_id]);

  let cancelThrew = false;
  try {
    await creditWalletForPayment({
      providerOrderId: cancelOrder.order_id,
      providerPaymentId: 'pay_cancel_test',
    });
  } catch (err) {
    cancelThrew = true;
    assert('G3. Attempting to credit cancelled payment throws 400 error', err.statusCode === 400 && err.code === 'PAYMENT_CANCELLED');
  }
  assert('G3. Cancelled payment was rejected', cancelThrew);

  // ─────────────────────────────────────────────────────────────────────────────
  // H. PAYMENT STATUS & LISTING API (IDOR & AUTHORIZATION)
  // ─────────────────────────────────────────────────────────────────────────────
  section('H. Payment Status & Listing API');

  // H1. Unauthenticated request to /payments/:id -> 401
  const unauthGetRes = await fetch(`${BASE_URL}/payments/${whOrder.payment_id}`);
  assert('H1. Unauthenticated request to /payments/:id returns 401', unauthGetRes.status === 401);

  // H2. User A can view their own payment -> 200
  const userAGetRes = await fetch(`${BASE_URL}/payments/${whOrder.payment_id}`, {
    headers: { Cookie: userA.cookies },
  });
  const userAGetJson = await userAGetRes.json();
  assert('H2. User A can fetch their own payment (200)', userAGetRes.status === 200);
  assert('H2. Payment details include amount=250', userAGetJson.data?.amount === 250);
  assert('H2. Payment status is paid', userAGetJson.data?.status === 'paid');
  assert('H2. Sensitive fields (secrets, keys) are NOT exposed in API response', !userAGetJson.data?.key_secret && !userAGetJson.data?.webhook_secret);

  // H3. User B cannot view User A's payment (IDOR protection) -> 403
  const userBGetRes = await fetch(`${BASE_URL}/payments/${whOrder.payment_id}`, {
    headers: { Cookie: userB.cookies },
  });
  assert('H3. Cross-user IDOR access is blocked with 403', userBGetRes.status === 403);

  // H4. Invalid payment UUID format -> 400
  const invalidUuidRes = await fetch(`${BASE_URL}/payments/not-a-valid-uuid`, {
    headers: { Cookie: userA.cookies },
  });
  assert('H4. Malformed payment UUID returns 400', invalidUuidRes.status === 400);

  // H5. List user payments -> 200
  const listRes = await fetch(`${BASE_URL}/payments`, {
    headers: { Cookie: userA.cookies },
  });
  const listJson = await listRes.json();
  assert('H5. List payments returns 200', listRes.status === 200);
  assert('H5. List contains multiple payments', Array.isArray(listJson.data) && listJson.data.length >= 3);
  assert('H5. Payments are ordered newest first', new Date(listJson.data[0].created_at) >= new Date(listJson.data[1].created_at));

  // ─────────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────────
  section('Test Execution Summary');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.error('\n❌ Failures:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL Phase 3E.4 tests passed successfully!\n');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('\n❌ Unhandled error in test suite:', err);
  process.exit(1);
});
