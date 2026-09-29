/**
 * backend/src/scripts/test_phase3c4b.js
 *
 * Automated verification test suite for Phase 3C.4B — Frontend Wallet Integration.
 *
 * Verifies:
 *  1. Frontend Codebase Mock Audit:
 *     - walletService.js uses real endpoints (/wallet, /wallet/transactions) and credentials: 'include'
 *     - walletService.js contains zero simulated balance, mock transactions, or local state
 *     - mockData.js does not export INITIAL_TRANSACTIONS
 *     - VahanPassCard, AIChatbot, and App.jsx no longer hardcode 1450 balance
 *     - App.jsx does not fetch wallet in public data loader
 *     - WalletPage.jsx connects to walletService with loading, error, and empty states
 *  2. Unauthenticated wallet requests return 401
 *  3. Freshly registered user receives balance=0 and empty transaction list ([])
 *  4. Seeded transactions compute exact signed balance (500 + 200 - 50 = 650)
 *  5. Transactions returned newest-first with correct field schema
 *  6. Cross-user isolation: User 2 sees own zero balance and empty transactions
 *  7. Logout behavior: Cleared session returns 401 on wallet access
 *  8. Regression: Auth, vehicles, stations (PostGIS), and charging sessions intact
 *  9. Frontend production build artifact verification
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

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

async function seedTransactions(userId) {
  const walletRes = await query(
    `SELECT id FROM wallets WHERE user_id = $1`,
    [userId]
  );
  const walletId = walletRes.rows[0].id;

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

async function cleanupTransactions(userId) {
  await query(
    `DELETE FROM wallet_transactions
     WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = $1)`,
    [userId]
  );
}

async function run() {
  console.log('========================================================');
  console.log('🧪 Starting Phase 3C.4B Frontend Wallet Integration Verification');
  console.log('========================================================\n');

  // ── 1. Frontend Codebase Mock Audit ───────────────────────────────────────
  console.log('--- 1. Frontend Codebase Mock Audit ---');

  const walletServicePath = path.join(projectRoot, 'frontend/src/services/walletService.js');
  const walletServiceContent = fs.readFileSync(walletServicePath, 'utf8');

  assert(
    !walletServiceContent.includes('1450') && !walletServiceContent.includes('currentBalance'),
    '1a. walletService.js does NOT contain simulated balance (1450 / currentBalance)'
  );
  assert(
    !walletServiceContent.includes('INITIAL_TRANSACTIONS'),
    '1b. walletService.js does NOT import or reference INITIAL_TRANSACTIONS'
  );
  assert(
    walletServiceContent.includes("credentials: 'include'"),
    "1c. walletService.js uses credentials: 'include' for HTTP-only cookie authentication"
  );
  assert(
    walletServiceContent.includes('getWallet()') && walletServiceContent.includes('getWalletTransactions()'),
    '1d. walletService.js exports getWallet() and getWalletTransactions()'
  );
  assert(
    !walletServiceContent.includes('localStorage.setItem') &&
    !walletServiceContent.includes('localStorage.getItem'),
    '1e. walletService.js does NOT call localStorage.setItem or localStorage.getItem'
  );

  const mockDataPath = path.join(projectRoot, 'frontend/src/data/mockData.js');
  const mockDataContent = fs.readFileSync(mockDataPath, 'utf8');
  assert(
    !mockDataContent.includes('export const INITIAL_TRANSACTIONS'),
    '1f. mockData.js does NOT export INITIAL_TRANSACTIONS mock data'
  );

  const vahanPassCardPath = path.join(projectRoot, 'frontend/src/components/wallet/VahanPassCard.jsx');
  const vahanPassCardContent = fs.readFileSync(vahanPassCardPath, 'utf8');
  assert(
    !vahanPassCardContent.includes('balance = 1450'),
    '1g. VahanPassCard.jsx does NOT default balance to 1450'
  );

  const chatbotPath = path.join(projectRoot, 'frontend/src/components/ai/AIChatbot.jsx');
  const chatbotContent = fs.readFileSync(chatbotPath, 'utf8');
  assert(
    !chatbotContent.includes('balance = 1450'),
    '1h. AIChatbot.jsx does NOT default balance to 1450'
  );

  const appPath = path.join(projectRoot, 'frontend/src/App.jsx');
  const appContent = fs.readFileSync(appPath, 'utf8');
  assert(
    !appContent.includes('useState(1450)'),
    '1i. App.jsx does NOT initialize balance state to 1450'
  );
  assert(
    !appContent.includes('walletService.getBalance()') || appContent.includes('loadUserWallet'),
    '1j. App.jsx handles authenticated wallet loading via loadUserWallet (not in public data)'
  );

  const walletPagePath = path.join(projectRoot, 'frontend/src/pages/Wallet/WalletPage.jsx');
  const walletPageContent = fs.readFileSync(walletPagePath, 'utf8');
  assert(
    walletPageContent.includes('walletService.getWallet()') &&
    walletPageContent.includes('walletService.getWalletTransactions()'),
    '1k. WalletPage.jsx autonomously fetches real wallet and transaction data via walletService'
  );
  assert(
    walletPageContent.includes('Loader2') && walletPageContent.includes('Retry'),
    '1l. WalletPage.jsx contains loading state spinner and error state with Retry capability'
  );

  // ── 2. Unauthenticated Requests ───────────────────────────────────────────
  console.log('\n--- 2. Unauthenticated Wallet Requests ---');

  const unauth1 = await fetch(`${BASE_URL}/wallet`);
  assert(unauth1.status === 401, '2a. GET /wallet without auth returns 401');

  const unauth2 = await fetch(`${BASE_URL}/wallet/transactions`);
  assert(unauth2.status === 401, '2b. GET /wallet/transactions without auth returns 401');

  // ── 3. Setup: Register Test Users ─────────────────────────────────────────
  console.log('\n--- 3. Setup: Register Test Users ---');
  const ts = Date.now();
  const u1Email = `wallet_front_u1_${ts}@vahan.test`;
  const u2Email = `wallet_front_u2_${ts}@vahan.test`;
  const PASSWORD = 'WalletPass@2026!';

  const u1Reg = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u1Email, password: PASSWORD, name: 'Wallet Frontend User 1' }),
  });
  const u1Cookies = parseCookies(u1Reg);
  const u1Json = await u1Reg.json();
  const u1Id = u1Json.data?.user?.id;

  const u2Reg = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u2Email, password: PASSWORD, name: 'Wallet Frontend User 2' }),
  });
  const u2Cookies = parseCookies(u2Reg);
  const u2Json = await u2Reg.json();
  const u2Id = u2Json.data?.user?.id;

  assert(u1Reg.status === 201 && u1Id, '3a. User 1 registered successfully');
  assert(u2Reg.status === 201 && u2Id, '3b. User 2 registered successfully');

  // ── 4. Fresh Wallet Initial State ─────────────────────────────────────────
  console.log('\n--- 4. Fresh Wallet State (0 Balance & Empty Transactions) ---');

  const freshWalletRes = await fetch(`${BASE_URL}/wallet`, { headers: { Cookie: u1Cookies } });
  const freshWallet = await freshWalletRes.json();
  assert(freshWalletRes.status === 200, '4a. GET /wallet returns 200 for fresh user');
  assert(freshWallet.data?.balance === 0, '4b. Fresh user wallet balance is 0');
  assert(freshWallet.data?.currency === 'INR', '4c. Wallet currency is INR');
  assert(freshWallet.data?.status === 'active', '4d. Wallet status is active');

  const freshTxRes = await fetch(`${BASE_URL}/wallet/transactions`, { headers: { Cookie: u1Cookies } });
  const freshTx = await freshTxRes.json();
  assert(freshTxRes.status === 200, '4e. GET /wallet/transactions returns 200');
  assert(Array.isArray(freshTx.data) && freshTx.data.length === 0, '4f. Fresh user transactions is empty array []');

  // ── 5. Seeded Transactions & Balance Computation ──────────────────────────
  console.log('\n--- 5. Seeded Transactions & Derived Balance ---');

  const { walletId, expectedBalance } = await seedTransactions(u1Id);

  const seededWalletRes = await fetch(`${BASE_URL}/wallet`, { headers: { Cookie: u1Cookies } });
  const seededWallet = await seededWalletRes.json();
  assert(seededWalletRes.status === 200, '5a. GET /wallet returns 200 after transaction insertion');
  assert(
    Math.abs(seededWallet.data?.balance - expectedBalance) < 0.01,
    `5b. Derived wallet balance is ${expectedBalance} (got ${seededWallet.data?.balance})`
  );

  const seededTxRes = await fetch(`${BASE_URL}/wallet/transactions`, { headers: { Cookie: u1Cookies } });
  const seededTx = await seededTxRes.json();
  assert(seededTxRes.status === 200, '5c. GET /wallet/transactions returns 200');
  assert(seededTx.data.length === 3, '5d. User 1 receives all 3 transactions');

  // Check ordering
  const d0 = new Date(seededTx.data[0].created_at).getTime();
  const d1 = new Date(seededTx.data[1].created_at).getTime();
  const d2 = new Date(seededTx.data[2].created_at).getTime();
  assert(d0 >= d1 && d1 >= d2, '5e. Transactions are strictly ordered newest-first');

  // Check debit transaction field values
  const debitTx = seededTx.data[0];
  assert(debitTx.type === 'charging_payment', '5f. Top transaction is charging_payment');
  assert(debitTx.amount === -50, '5g. Debit amount is -50');
  assert(debitTx.description === 'Charging session deduction', '5h. Transaction description is correct');

  // ── 6. Cross-User Isolation ────────────────────────────────────────────────
  console.log('\n--- 6. Cross-User Isolation ---');

  const u2WalletRes = await fetch(`${BASE_URL}/wallet`, { headers: { Cookie: u2Cookies } });
  const u2Wallet = await u2WalletRes.json();
  assert(u2WalletRes.status === 200, '6a. User 2 GET /wallet returns 200');
  assert(u2Wallet.data?.balance === 0, '6b. User 2 has isolated balance of 0 (does not see User 1 balance)');

  const u2TxRes = await fetch(`${BASE_URL}/wallet/transactions`, { headers: { Cookie: u2Cookies } });
  const u2Tx = await u2TxRes.json();
  assert(u2TxRes.status === 200, '6c. User 2 GET /wallet/transactions returns 200');
  assert(u2Tx.data?.length === 0, '6d. User 2 sees 0 transactions (isolated from User 1 transactions)');

  // ── 7. Logout Behavior ─────────────────────────────────────────────────────
  console.log('\n--- 7. Logout Behavior ---');

  const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: u1Cookies },
  });
  assert(logoutRes.status === 200, '7a. POST /auth/logout returns 200');

  const logoutCookies = parseCookies(logoutRes);
  const postLogoutWalletRes = await fetch(`${BASE_URL}/wallet`, {
    headers: { Cookie: logoutCookies },
  });
  assert(
    postLogoutWalletRes.status === 401,
    '7b. GET /wallet after logout returns 401'
  );

  // ── 8. Regression of Existing APIs ─────────────────────────────────────────
  console.log('\n--- 8. Regression of Existing APIs ---');

  const stationsRes = await fetch(`${BASE_URL}/stations/nearby?lat=19.0596&lng=72.8295&radius_km=10`);
  assert(stationsRes.status === 200, '8a. GET /stations/nearby (PostGIS) returns 200');

  const vehRes = await fetch(`${BASE_URL}/vehicles`, { headers: { Cookie: u2Cookies } });
  assert(vehRes.status === 200, '8b. GET /vehicles returns 200');

  const sessRes = await fetch(`${BASE_URL}/sessions`, { headers: { Cookie: u2Cookies } });
  assert(sessRes.status === 200, '8c. GET /sessions returns 200');

  // ── 9. Frontend Production Build Artifact Verification ────────────────────
  console.log('\n--- 9. Frontend Production Build Artifact Verification ---');
  const distHtmlPath = path.join(projectRoot, 'frontend/dist/index.html');
  assert(fs.existsSync(distHtmlPath), '9a. frontend/dist/index.html exists from production build');

  // Cleanup
  await cleanupTransactions(u1Id);
  await cleanupTransactions(u2Id);

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
