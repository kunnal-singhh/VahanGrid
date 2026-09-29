/**
 * backend/src/scripts/test_phase3c4a.js
 *
 * Automated verification test suite for Phase 3C.4A — Wallet Read & Transaction History API.
 *
 * Test coverage:
 *  1. Unauthenticated requests to wallet endpoints return 401
 *  2. Fresh wallet (auto-created on register) returns 200 with balance=0
 *  3. Authenticated user with seeded transactions can retrieve their wallet + correct balance
 *  4. Transactions returned correctly, ordered newest-first (created_at DESC)
 *  5. Transaction field shapes are correct (wallet_id, amount as number, type, currency, description)
 *  6. User with no transactions returns empty array (not null/error)
 *  7. Cross-user isolation: User B sees own wallet (balance=0), cannot see User A's transactions
 *  8. Regression: Auth, vehicles, stations, and session APIs still work
 *
 * Prerequisites:
 *  - Backend server running on http://127.0.0.1:3001
 *  - Connected to the vahangrid PostgreSQL database
 *
 * Run: node backend/src/scripts/test_phase3c4a.js
 *
 * NOTE: authService atomically creates a wallet for every new user on registration.
 *       A user "with no wallet" is not a normal production state.
 *       The test verifies the fresh/empty wallet state (balance=0, 0 transactions) instead.
 */

import { query } from '../config/database.js';

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

/**
 * Seed test transactions into the user's wallet (already exists from registration).
 * Returns walletId and expected balance.
 */
async function seedTransactions(userId) {
  const walletRes = await query(
    `SELECT id FROM wallets WHERE user_id = $1`,
    [userId]
  );
  const walletId = walletRes.rows[0].id;

  // Two credits and one debit — net = 650
  // Explicit created_at offsets guarantee distinct timestamps in PostgreSQL
  await query(
    `INSERT INTO wallet_transactions (wallet_id, type, amount, currency, description, created_at)
     VALUES
       ($1, 'topup',            500.00, 'INR', 'Initial top-up',             NOW() - INTERVAL '2 minutes'),
       ($1, 'topup',            200.00, 'INR', 'Second top-up',            NOW() - INTERVAL '1 minute'),
       ($1, 'charging_payment', -50.00, 'INR', 'Charging session deduction', NOW())`,
    [walletId]
  );

  return { walletId, expectedBalance: 650.0 };
}

/** Remove test transactions only (wallet row stays — owned by authService). */
async function cleanupTransactions(userId) {
  await query(
    `DELETE FROM wallet_transactions
     WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = $1)`,
    [userId]
  );
}

async function run() {
  console.log('========================================================');
  console.log('🧪 Starting Phase 3C.4A Wallet Read & Transaction History API Verification');
  console.log('========================================================\n');

  // ── Setup: Register two test users ────────────────────────────────────────
  const ts = Date.now();
  const u1Email = `wallet_u1_${ts}@vahan.test`;
  const u2Email = `wallet_u2_${ts}@vahan.test`;
  const PASSWORD = 'Wallet@TestPass1!';

  const u1Reg = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u1Email, password: PASSWORD, name: 'Wallet User One' }),
  });
  const u1RegJson = await u1Reg.json();
  const u1Cookies = parseCookies(u1Reg);
  const u1Id = u1RegJson.data?.user?.id;

  const u2Reg = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u2Email, password: PASSWORD, name: 'Wallet User Two' }),
  });
  const u2RegJson = await u2Reg.json();
  const u2Cookies = parseCookies(u2Reg);
  const u2Id = u2RegJson.data?.user?.id;

  assert(u1Reg.status === 201 && u1Id, 'Setup: User 1 registered');
  assert(u2Reg.status === 201 && u2Id, 'Setup: User 2 registered');

  // ── 1. Unauthenticated requests ───────────────────────────────────────────
  console.log('\n--- 1. Unauthenticated Wallet Requests ---');

  const unauth1 = await fetch(`${BASE_URL}/wallet`);
  assert(unauth1.status === 401, '1a. GET /wallet without auth returns 401');

  const unauth2 = await fetch(`${BASE_URL}/wallet/transactions`);
  assert(unauth2.status === 401, '1b. GET /wallet/transactions without auth returns 401');

  // ── 2. Fresh wallet (auto-created on registration) ────────────────────────
  // authService atomically creates a wallet for every new user.
  // Fresh wallet has: balance=0, status=active, 0 transactions.
  console.log('\n--- 2. Fresh Wallet (Auto-Created on Registration) ---');

  const freshWalletRes = await fetch(`${BASE_URL}/wallet`, {
    headers: { Cookie: u1Cookies },
  });
  const freshWalletJson = await freshWalletRes.json();
  assert(freshWalletRes.status === 200, '2a. GET /wallet returns 200 for freshly registered user');
  assert(freshWalletJson.data?.user_id === u1Id, '2b. Fresh wallet user_id matches authenticated user');
  assert(
    Math.abs((freshWalletJson.data?.balance ?? -1) - 0) < 0.01,
    `2c. Fresh wallet balance is 0 (no transactions yet) — got ${freshWalletJson.data?.balance}`
  );
  assert(freshWalletJson.data?.status === 'active', '2d. Fresh wallet status is active');
  assert(freshWalletJson.data?.currency === 'INR', '2e. Fresh wallet currency is INR');

  const freshTxnRes = await fetch(`${BASE_URL}/wallet/transactions`, {
    headers: { Cookie: u1Cookies },
  });
  const freshTxnJson = await freshTxnRes.json();
  assert(freshTxnRes.status === 200, '2f. GET /wallet/transactions for fresh user returns 200');
  assert(
    Array.isArray(freshTxnJson.data) && freshTxnJson.data.length === 0,
    '2g. Fresh user transactions is empty array (not null/error)'
  );

  // ── 3. Wallet with transactions — read + balance ──────────────────────────
  console.log('\n--- 3. Wallet Read With Transactions ---');

  const { walletId, expectedBalance } = await seedTransactions(u1Id);

  const walletRes = await fetch(`${BASE_URL}/wallet`, {
    headers: { Cookie: u1Cookies },
  });
  const walletJson = await walletRes.json();
  assert(walletRes.status === 200, '3a. GET /wallet returns 200 after seeding transactions');

  const w = walletJson.data;
  assert(w?.id === walletId, '3b. Wallet ID matches the user wallet');
  assert(w?.user_id === u1Id, '3c. Wallet user_id matches authenticated user');
  assert(w?.currency === 'INR', '3d. Currency is INR');
  assert(w?.status === 'active', '3e. Wallet status is active');
  assert(typeof w?.balance === 'number', '3f. Balance field is a number');
  assert(
    Math.abs(w?.balance - expectedBalance) < 0.01,
    `3g. Derived balance is ${expectedBalance} (got ${w?.balance}) — correctly computes 500+200-50`
  );
  assert(!('password_hash' in (w || {})), '3h. Sensitive fields (password_hash) are not exposed');
  assert('created_at' in (w || {}), '3i. created_at is present in wallet response');
  assert('updated_at' in (w || {}), '3j. updated_at is present in wallet response');

  // ── 4. Transaction history — correct data + ordering ─────────────────────
  console.log('\n--- 4. Transaction History ---');

  const txnRes = await fetch(`${BASE_URL}/wallet/transactions`, {
    headers: { Cookie: u1Cookies },
  });
  const txnJson = await txnRes.json();
  assert(txnRes.status === 200, '4a. GET /wallet/transactions returns 200');
  assert(Array.isArray(txnJson.data), '4b. Response data is an array');
  assert(txnJson.data.length === 3, `4c. Returns all 3 seeded transactions (got ${txnJson.data.length})`);

  // Verify newest-first ordering (created_at DESC)
  const dates = txnJson.data.map((t) => new Date(t.created_at).getTime());
  let orderedNewestFirst = true;
  for (let i = 0; i < dates.length - 1; i++) {
    if (dates[i] < dates[i + 1]) { orderedNewestFirst = false; break; }
  }
  assert(orderedNewestFirst, '4d. Transactions are ordered newest-first (created_at DESC)');

  // Verify transaction field shapes
  const firstTxn = txnJson.data[0];
  assert(firstTxn?.wallet_id === walletId, '4e. Transaction wallet_id matches the user wallet');
  assert(typeof firstTxn?.amount === 'number', '4f. Transaction amount is a number (not string)');
  assert(
    ['topup', 'charging_payment', 'refund', 'cashback', 'adjustment'].includes(firstTxn?.type),
    `4g. Transaction type is a valid enum value (got "${firstTxn?.type}")`
  );
  assert(firstTxn?.currency === 'INR', '4h. Transaction currency is INR');
  assert('description' in firstTxn, '4i. description field is present');
  assert('reference_type' in firstTxn, '4j. reference_type field is present');
  assert('reference_id' in firstTxn, '4k. reference_id field is present');
  assert('created_at' in firstTxn, '4l. created_at field is present');

  // The newest transaction should be the debit (charging_payment, inserted last)
  assert(
    firstTxn?.type === 'charging_payment',
    `4m. Newest transaction is the debit (charging_payment) — got "${firstTxn?.type}"`
  );
  assert(firstTxn?.amount < 0, '4n. Debit amount is negative');

  // ── 5. Cross-user isolation ────────────────────────────────────────────────
  console.log('\n--- 5. Cross-User Isolation ---');

  // User 2 reads their own wallet — should NOT see User 1's transactions or balance
  const u2WalletRes = await fetch(`${BASE_URL}/wallet`, {
    headers: { Cookie: u2Cookies },
  });
  const u2WalletJson = await u2WalletRes.json();
  assert(u2WalletRes.status === 200, '5a. User 2 GET /wallet returns 200 (own wallet)');
  assert(u2WalletJson.data?.user_id === u2Id, '5b. User 2 wallet.user_id is their own ID (not User 1)');
  assert(
    Math.abs((u2WalletJson.data?.balance ?? -1) - 0) < 0.01,
    `5c. User 2 balance is 0 (does not include User 1's 650) — got ${u2WalletJson.data?.balance}`
  );

  // User 2 cannot see User 1's 3 transactions
  const u2TxnRes = await fetch(`${BASE_URL}/wallet/transactions`, {
    headers: { Cookie: u2Cookies },
  });
  const u2TxnJson = await u2TxnRes.json();
  assert(u2TxnRes.status === 200, '5d. User 2 GET /wallet/transactions returns 200');
  assert(
    u2TxnJson.data?.length === 0,
    `5e. User 2 sees 0 transactions (isolated from User 1's 3) — got ${u2TxnJson.data?.length}`
  );

  // ── 6. Regression: Existing APIs ─────────────────────────────────────────
  console.log('\n--- 6. Regression: Existing API Surfaces ---');

  const meRes = await fetch(`${BASE_URL}/auth/me`, { headers: { Cookie: u1Cookies } });
  assert(meRes.status === 200, '6a. GET /auth/me still returns 200');

  const vehRes = await fetch(`${BASE_URL}/vehicles`, { headers: { Cookie: u1Cookies } });
  assert(vehRes.status === 200, '6b. GET /vehicles still returns 200');

  const stRes = await fetch(`${BASE_URL}/stations/nearby?lat=19.0596&lng=72.8295&radius_km=10`);
  assert(stRes.status === 200, '6c. GET /stations/nearby (PostGIS) still returns 200');

  const sessRes = await fetch(`${BASE_URL}/sessions`, { headers: { Cookie: u1Cookies } });
  assert(sessRes.status === 200, '6d. GET /sessions still returns 200');

  // ── Cleanup ───────────────────────────────────────────────────────────────
  try {
    await cleanupTransactions(u1Id);
    await cleanupTransactions(u2Id);
  } catch (_) {
    // Non-critical — test users are ephemeral
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n========================================================');
  console.log(`📊 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('❌ Unhandled error in test suite:', err);
  process.exit(1);
});
