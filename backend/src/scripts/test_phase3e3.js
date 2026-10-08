/**
 * backend/src/scripts/test_phase3e3.js
 *
 * Phase 3E.3 - Wallet Settlement & CDR Integration Test Suite
 *
 * Comprehensive coverage:
 *  A. Basic Settlement: CDR finalized -> wallet debit -> wallet transaction -> CDR settled
 *  B. Idempotency: Sequential duplicate calls, concurrent duplicate calls, single debit invariant
 *  C. Insufficient Balance: Zero debt creation, no partial debit, CDR marked failed, retryable
 *  D. Zero Amount: ₹0.00 CDR marked settled with 0 wallet movement and no 0.00 txn violation
 *  E. Precision: ₹0.01 micro-debit and ₹335.71 fractional decimals
 *  F. Authorization & REST: 401 unauth, 403 cross-user, 400 bad uuid, 404 missing, 200 success
 *  G. Failure Cases: Non-finalized CDR, non-existent CDR
 *  H. Concurrency (Different CDRs): Two simultaneous CDRs for same wallet without lost updates
 */

import pool, { query } from '../config/database.js';
import { calculatePrice } from '../services/pricingService.js';
import { finalizeCdr, getCdrById, getCdrBySessionId } from '../services/cdrService.js';
import { settleCdr, getSettlementStatus } from '../services/walletSettlementService.js';
import { getWallet, getTransactions } from '../services/walletService.js';

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
  console.log(`\n${'='.repeat(60)}\n  ${title}\n${'='.repeat(60)}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSeededConnector() {
  const r = await query(`
    SELECT cn.id AS connector_id, e.id AS evse_id, l.id AS location_id, l.cpo_id
    FROM connectors cn
    JOIN evses e ON cn.evse_id = e.id
    JOIN locations l ON e.location_id = l.id
    LIMIT 1
  `);
  if (r.rows.length === 0) throw new Error('No connector found');
  return r.rows[0];
}

async function createTestUserWithWallet(label = 'user') {
  const ts = Date.now() + Math.floor(Math.random() * 10000);
  const email = `settle_${label}_${ts}@example.com`;
  const phone = `+9193${Math.floor(10000000 + Math.random() * 89999999)}`;
  const userRes = await query(
    `INSERT INTO users (name, email, phone, password_hash)
     VALUES ($1, $2, $3, '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF')
     RETURNING id, email`,
    [`Settle ${label}`, email, phone]
  );
  const user = userRes.rows[0];

  const walletRes = await query(
    `INSERT INTO wallets (user_id, currency, status)
     VALUES ($1, 'INR', 'active')
     RETURNING id`,
    [user.id]
  );
  const wallet = walletRes.rows[0];
  return { user, wallet };
}

async function creditWallet(walletId, amount) {
  const r = await query(
    `INSERT INTO wallet_transactions (wallet_id, type, amount, currency, description)
     VALUES ($1, 'topup', $2, 'INR', 'Test topup funding')
     RETURNING id, amount`,
    [walletId, amount]
  );
  return r.rows[0];
}

async function createAndFinalizeCdr(userId, connectorId, totalAmount = 150.00, energyKwh = 8.0) {
  const tariffSnapshot = {
    tariff_id: 'e0000001-0000-0000-0000-000000000001',
    name: 'Settle Test Tariff',
    currency: 'INR',
    price_per_kwh: 15.0,
    session_fee: 10.0,
    price_per_minute: 0,
    idle_fee_per_minute: 0,
    grace_period_minutes: 0,
    tax_rate: 0.18,
    snapshotted_at: new Date().toISOString(),
  };

  const startedAt = new Date(Date.now() - 3600 * 1000);
  const endedAt = new Date();

  // Create session
  const sessRes = await query(
    `INSERT INTO charging_sessions (
       user_id, connector_id, status, started_at, ended_at,
       duration_seconds, energy_kwh, cost_amount, currency, tariff_snapshot
     ) VALUES ($1, $2, 'completed', $3, $4, 3600, $5, $6, 'INR', $7)
     RETURNING id`,
    [userId, connectorId, startedAt, endedAt, energyKwh, totalAmount, JSON.stringify(tariffSnapshot)]
  );
  const sessionId = sessRes.rows[0].id;

  // Finalize CDR
  const cdr = await finalizeCdr(sessionId);

  // If totalAmount was explicitly customized for testing, update CDR total_amount
  if (cdr && Number(cdr.total_amount) !== totalAmount) {
    await query(
      `UPDATE cdrs SET total_amount = $1 WHERE id = $2`,
      [totalAmount, cdr.id]
    );
  }

  // Ensure unsettled for isolated settlement testing
  await query(`DELETE FROM wallet_transactions WHERE cdr_id = $1`, [cdr.id]);
  await query(`UPDATE cdrs SET settlement_status = 'unsettled', settled_at = NULL, wallet_transaction_id = NULL WHERE id = $1`, [cdr.id]);
  return await getCdrById(cdr.id);
}

async function cleanupUser(userId) {
  await query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = $1)`, [userId]);
  await query(`DELETE FROM cdrs WHERE user_id = $1`, [userId]);
  await query(`DELETE FROM charging_sessions WHERE user_id = $1`, [userId]);
  await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
  await query(`DELETE FROM users WHERE id = $1`, [userId]);
}

// ---------------------------------------------------------------------------
// A. Basic Settlement
// ---------------------------------------------------------------------------

async function testBasicSettlement() {
  section('A. Basic Settlement');

  const conn = await getSeededConnector();
  const { user, wallet } = await createTestUserWithWallet('basic');

  // Fund wallet with ₹500
  await creditWallet(wallet.id, 500.00);

  // Check initial balance
  const initialWallet = await getWallet(user.id);
  assert('A0: Initial wallet balance is 500.00', initialWallet.balance === 500.00);

  // Create finalized CDR for ₹150.00
  const cdr = await createAndFinalizeCdr(user.id, conn.connector_id, 150.00);
  assert('A0: CDR created with total 150.00', Number(cdr.total_amount) === 150.00);
  assert('A0: CDR is initially unsettled', cdr.settlement_status === 'unsettled');

  // Execute settlement
  const res = await settleCdr(cdr.id);
  assert('A1: settleCdr returns settled: true', res.settled === true);
  assert('A1: res.already_settled is false', res.already_settled === false);
  assert('A1: res.amount is 150.00', res.amount === 150.00);
  assert('A2: res.balance_before is 500.00', res.balance_before === 500.00);
  assert('A2: res.balance_after is 350.00', res.balance_after === 350.00);

  // Verify wallet balance derived from ledger
  const updatedWallet = await getWallet(user.id);
  assert('A3: Wallet balance after settlement is exactly 350.00', updatedWallet.balance === 350.00);

  // Verify wallet transaction record
  const txns = await getTransactions(user.id);
  const debitTxn = txns.find(t => t.id === res.transaction_id);
  assert('A4: Linked wallet transaction exists', Boolean(debitTxn));
  assert('A4: Transaction type is charging_payment', debitTxn.type === 'charging_payment');
  assert('A4: Transaction amount is -150.00', debitTxn.amount === -150.00);
  assert('A4: Transaction reference_type is cdr', debitTxn.reference_type === 'cdr');
  assert('A4: Transaction reference_id matches CDR id', debitTxn.reference_id === cdr.id);

  // Verify CDR row
  const updatedCdr = await getCdrById(cdr.id);
  assert('A5: CDR settlement_status is settled', updatedCdr.settlement_status === 'settled');
  assert('A5: CDR settled_at timestamp set', Boolean(updatedCdr.settled_at));
  assert('A5: CDR wallet_transaction_id matches', updatedCdr.wallet_transaction_id === res.transaction_id);
  assert('A5: CDR total_amount remains untouched', Number(updatedCdr.total_amount) === 150.00);

  // Verify getSettlementStatus service
  const statusInfo = await getSettlementStatus(cdr.id);
  assert('A6: getSettlementStatus returns settlement details', statusInfo.settlement_status === 'settled');
  assert('A6: getSettlementStatus includes transaction_amount', statusInfo.transaction_amount === -150.00);

  await cleanupUser(user.id);
}

// ---------------------------------------------------------------------------
// B. Idempotency
// ---------------------------------------------------------------------------

async function testIdempotency() {
  section('B. Idempotency');

  const conn = await getSeededConnector();
  const { user, wallet } = await createTestUserWithWallet('idempotency');

  // Create CDR first (wallet has 0 balance, so auto-settlement fails cleanly with INSUFFICIENT_FUNDS)
  const cdr = await createAndFinalizeCdr(user.id, conn.connector_id, 100.00);

  // Fund wallet with ₹500
  await creditWallet(wallet.id, 500.00);

  // 1. First settlement
  const res1 = await settleCdr(cdr.id);
  assert('B1: First settlement succeeds', res1.settled === true && res1.already_settled === false);

  // 2. Second sequential settlement
  const res2 = await settleCdr(cdr.id);
  assert('B2: Second call returns settled: true', res2.settled === true);
  assert('B2: Second call returns already_settled: true', res2.already_settled === true);
  assert('B2: Second call returns same transaction_id', res2.transaction_id === res1.transaction_id);

  // Verify balance was NOT debited twice
  const w1 = await getWallet(user.id);
  assert('B3: Wallet balance is 400.00 (not 300.00)', w1.balance === 400.00);

  // Verify only 1 debit transaction exists
  const txRes = await query(`SELECT COUNT(*) FROM wallet_transactions WHERE cdr_id = $1`, [cdr.id]);
  assert('B4: Exactly 1 transaction in DB for CDR', parseInt(txRes.rows[0].count, 10) === 1);

  // 3. Concurrent settlement test on a new CDR
  const cdr2 = await createAndFinalizeCdr(user.id, conn.connector_id, 75.00);
  const [cRes1, cRes2] = await Promise.all([
    settleCdr(cdr2.id),
    settleCdr(cdr2.id),
  ]);

  assert('B5: Concurrent call 1 reports settled: true', cRes1.settled === true);
  assert('B5: Concurrent call 2 reports settled: true', cRes2.settled === true);
  assert('B5: One of the calls was already_settled or same transaction',
    (cRes1.already_settled || cRes2.already_settled) || cRes1.transaction_id === cRes2.transaction_id);

  const w2 = await getWallet(user.id);
  assert('B6: Balance is 325.00 (400 - 75)', w2.balance === 325.00);

  const txRes2 = await query(`SELECT COUNT(*) FROM wallet_transactions WHERE cdr_id = $1`, [cdr2.id]);
  assert('B7: Exactly 1 transaction in DB after concurrent settlement', parseInt(txRes2.rows[0].count, 10) === 1);

  await cleanupUser(user.id);
}

// ---------------------------------------------------------------------------
// C. Insufficient Balance
// ---------------------------------------------------------------------------

async function testInsufficientBalance() {
  section('C. Insufficient Balance');

  const conn = await getSeededConnector();
  const { user, wallet } = await createTestUserWithWallet('insufficient');

  // Fund wallet with only ₹50.00
  await creditWallet(wallet.id, 50.00);

  // Create CDR for ₹200.00
  const cdr = await createAndFinalizeCdr(user.id, conn.connector_id, 200.00);

  // Settle with throwOnInsufficient = false
  const res = await settleCdr(cdr.id, { throwOnInsufficient: false });
  assert('C1: settleCdr returns settled: false', res.settled === false);
  assert('C1: status is failed', res.status === 'failed');
  assert('C1: reason is INSUFFICIENT_FUNDS', res.reason === 'INSUFFICIENT_FUNDS');

  // Check wallet balance remains completely untouched (no partial debit)
  const w = await getWallet(user.id);
  assert('C2: Wallet balance remains exactly 50.00 (no partial debit)', w.balance === 50.00);

  // Check no debit transaction was created
  const txRes = await query(`SELECT COUNT(*) FROM wallet_transactions WHERE cdr_id = $1`, [cdr.id]);
  assert('C3: Zero wallet transactions created', parseInt(txRes.rows[0].count, 10) === 0);

  // Check CDR settlement state
  const updatedCdr = await getCdrById(cdr.id);
  assert('C4: CDR settlement_status is failed', updatedCdr.settlement_status === 'failed');
  assert('C4: settlement_failure_reason is INSUFFICIENT_FUNDS', updatedCdr.settlement_failure_reason === 'INSUFFICIENT_FUNDS');
  assert('C4: CDR status remains finalized', updatedCdr.status === 'finalized');
  assert('C4: CDR total_amount intact', Number(updatedCdr.total_amount) === 200.00);

  // Test throwOnInsufficient = true throws expected error
  let threw = false;
  try {
    await settleCdr(cdr.id, { throwOnInsufficient: true });
  } catch (err) {
    threw = true;
    assert('C5: throwOnInsufficient throws INSUFFICIENT_FUNDS error', err.code === 'INSUFFICIENT_FUNDS');
    assert('C5: error status code is 400', err.statusCode === 400);
  }
  assert('C5: Exception was thrown', threw);

  // Now top up wallet with ₹300 (total balance = ₹350) and retry settlement!
  await creditWallet(wallet.id, 300.00);
  const retryRes = await settleCdr(cdr.id);
  assert('C6: Settlement succeeds after wallet topup', retryRes.settled === true);
  assert('C6: New balance is 150.00 (350 - 200)', retryRes.balance_after === 150.00);

  const finalCdr = await getCdrById(cdr.id);
  assert('C7: CDR is now settled', finalCdr.settlement_status === 'settled');
  assert('C7: settlement_failure_reason cleared', finalCdr.settlement_failure_reason === null);

  await cleanupUser(user.id);
}

// ---------------------------------------------------------------------------
// D. Zero Amount CDR
// ---------------------------------------------------------------------------

async function testZeroAmountCdr() {
  section('D. Zero Amount CDR');

  const conn = await getSeededConnector();
  const { user, wallet } = await createTestUserWithWallet('zero');

  // Fund wallet with ₹100
  await creditWallet(wallet.id, 100.00);

  // Create ₹0.00 CDR
  const cdr = await createAndFinalizeCdr(user.id, conn.connector_id, 0.00, 0.0);

  const res = await settleCdr(cdr.id);
  assert('D1: Zero-amount CDR settles successfully', res.settled === true);
  assert('D1: Amount is 0.00', res.amount === 0.00);
  assert('D2: balance_before equals balance_after (100.00)', res.balance_before === 100.00 && res.balance_after === 100.00);
  assert('D2: transaction_id is null (no 0.00 row)', res.transaction_id === null);

  // Verify wallet balance unchanged
  const w = await getWallet(user.id);
  assert('D3: Wallet balance unchanged at 100.00', w.balance === 100.00);

  // Verify no debit row in wallet_transactions
  const txRes = await query(`SELECT COUNT(*) FROM wallet_transactions WHERE wallet_id = $1 AND type = 'charging_payment'`, [wallet.id]);
  assert('D4: Zero charging_payment rows inserted', parseInt(txRes.rows[0].count, 10) === 0);

  // Verify CDR is marked settled
  const updatedCdr = await getCdrById(cdr.id);
  assert('D5: CDR marked settled in database', updatedCdr.settlement_status === 'settled');
  assert('D5: CDR settled_at is set', Boolean(updatedCdr.settled_at));

  // Second settle call on zero-amount CDR is idempotent
  const res2 = await settleCdr(cdr.id);
  assert('D6: Re-settle zero-amount CDR returns already_settled: true', res2.already_settled === true);

  await cleanupUser(user.id);
}

// ---------------------------------------------------------------------------
// E. Decimal & Fractional Precision
// ---------------------------------------------------------------------------

async function testPrecision() {
  section('E. Monetary Precision');

  const conn = await getSeededConnector();
  const { user, wallet } = await createTestUserWithWallet('precision');

  // Fund wallet with ₹500.00
  await creditWallet(wallet.id, 500.00);

  // 1. Settle micro-amount ₹0.01
  const cdr1 = await createAndFinalizeCdr(user.id, conn.connector_id, 0.01);
  const res1 = await settleCdr(cdr1.id);
  assert('E1: ₹0.01 debit balance_before is 500.00', res1.balance_before === 500.00);
  assert('E1: ₹0.01 debit balance_after is 499.99', res1.balance_after === 499.99);

  const w1 = await getWallet(user.id);
  assert('E1: Ledger derived balance is 499.99', w1.balance === 499.99);

  // 2. Settle fractional amount ₹335.71
  const cdr2 = await createAndFinalizeCdr(user.id, conn.connector_id, 335.71);
  const res2 = await settleCdr(cdr2.id);
  assert('E2: ₹335.71 debit balance_before is 499.99', res2.balance_before === 499.99);
  // 499.99 - 335.71 = 164.28
  assert('E2: ₹335.71 debit balance_after is 164.28', res2.balance_after === 164.28);

  const w2 = await getWallet(user.id);
  assert('E2: Ledger derived balance is 164.28', w2.balance === 164.28);

  await cleanupUser(user.id);
}

// ---------------------------------------------------------------------------
// F. Authorization & REST Endpoints
// ---------------------------------------------------------------------------

async function testAuthorizationAndRest() {
  section('F. Authorization & REST Endpoints');

  const BASE = 'http://localhost:3001/api/v1';
  const conn = await getSeededConnector();

  class HttpClient {
    constructor() {
      this.cookies = {};
    }
    setCookies(res) {
      const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
      for (const c of raw) {
        if (!c) continue;
        const [nameVal] = c.split(';');
        const eq = nameVal.indexOf('=');
        if (eq !== -1) {
          this.cookies[nameVal.slice(0, eq).trim()] = nameVal.slice(eq + 1).trim();
        }
      }
    }
    get cookieHeader() {
      return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    }
    async request(path, opts = {}) {
      const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
      const c = this.cookieHeader;
      if (c) headers['Cookie'] = c;
      const res = await fetch(`${BASE}${path}`, { ...opts, headers });
      this.setCookies(res);
      return res;
    }
  }

  const client1 = new HttpClient();
  const client2 = new HttpClient();

  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const u1Email = `settle_rest1_${ts}@test.com`;
  const u2Email = `settle_rest2_${ts}@test.com`;
  const password = 'StrongPassword@123';

  // Register users
  await client1.request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Settle Rest 1', email: u1Email, phone: `+9194${Math.floor(10000000 + Math.random() * 89999999)}`, password }),
  });
  await client2.request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Settle Rest 2', email: u2Email, phone: `+9195${Math.floor(10000000 + Math.random() * 89999999)}`, password }),
  });

  const me1 = await (await client1.request('/auth/me')).json();
  const user1Id = me1.data.user.id;
  const me2 = await (await client2.request('/auth/me')).json();
  const user2Id = me2.data.user.id;

  // Create CDR for User 1 (₹120) while wallet has 0 balance (auto-settlement fails cleanly with INSUFFICIENT_FUNDS)
  const cdr1 = await createAndFinalizeCdr(user1Id, conn.connector_id, 120.00);

  // Fund user 1 wallet with ₹300
  const w1Res = await query(`SELECT id FROM wallets WHERE user_id = $1`, [user1Id]);
  await creditWallet(w1Res.rows[0].id, 300.00);

  // F1: Unauthenticated request -> 401
  const unauthClient = new HttpClient();
  const rUnauth = await unauthClient.request(`/cdrs/${cdr1.id}/settle`, { method: 'POST' });
  assert('F1: POST /cdrs/:id/settle unauthenticated returns 401', rUnauth.status === 401);

  // F2: Cross-user settlement (User 2 tries to settle User 1's CDR) -> 403
  const rCross = await client2.request(`/cdrs/${cdr1.id}/settle`, { method: 'POST' });
  assert('F2: POST /cdrs/:id/settle cross-user returns 403', rCross.status === 403);
  const crossData = await rCross.json();
  assert('F2: Cross-user error code is CDR_ACCESS_DENIED', crossData.error && crossData.error.code === 'CDR_ACCESS_DENIED');

  // F3: Invalid UUID -> 400
  const rBadUuid = await client1.request('/cdrs/not-a-valid-uuid/settle', { method: 'POST' });
  assert('F3: POST /cdrs/invalid-uuid/settle returns 400', rBadUuid.status === 400);

  // F4: Non-existent CDR -> 404
  const rNotFound = await client1.request('/cdrs/00000000-0000-0000-0000-000000000000/settle', { method: 'POST' });
  assert('F4: POST /cdrs/non-existent/settle returns 404', rNotFound.status === 404);

  // F5: User 2 tries to settle their own CDR without sufficient balance -> 400
  const cdr2 = await createAndFinalizeCdr(user2Id, conn.connector_id, 50.00);
  const rInsuff = await client2.request(`/cdrs/${cdr2.id}/settle`, { method: 'POST' });
  assert('F5: POST /cdrs/:id/settle with insufficient balance returns 400', rInsuff.status === 400);
  const insuffData = await rInsuff.json();
  assert('F5: Error code is INSUFFICIENT_FUNDS', insuffData.error && insuffData.error.code === 'INSUFFICIENT_FUNDS');

  // F6: Valid owner settlement with sufficient balance -> 200 OK
  const rSuccess = await client1.request(`/cdrs/${cdr1.id}/settle`, { method: 'POST' });
  assert('F6: POST /cdrs/:id/settle by owner returns 200', rSuccess.status === 200);
  const successData = await rSuccess.json();
  assert('F6: Settlement result reports settled: true', successData.data && successData.data.settled === true);
  assert('F6: Amount is 120.00', successData.data.amount === 120.00);
  assert('F6: Balance after is 180.00', successData.data.balance_after === 180.00);

  // F7: Retry already settled CDR -> 200 OK (idempotent)
  const rRetry = await client1.request(`/cdrs/${cdr1.id}/settle`, { method: 'POST' });
  assert('F7: Re-settling settled CDR returns 200', rRetry.status === 200);
  const retryData = await rRetry.json();
  assert('F7: Re-settle reports already_settled: true', retryData.data && retryData.data.already_settled === true);

  await cleanupUser(user1Id);
  await cleanupUser(user2Id);
}

// ---------------------------------------------------------------------------
// G. Failure Recovery
// ---------------------------------------------------------------------------

async function testFailureRecovery() {
  section('G. Failure Recovery');

  const { user, wallet } = await createTestUserWithWallet('failure');
  const conn = await getSeededConnector();

  // Create an active (non-terminal) session
  const activeSessRes = await query(
    `INSERT INTO charging_sessions (user_id, connector_id, status, started_at)
     VALUES ($1, $2, 'active', CURRENT_TIMESTAMP)
     RETURNING id`,
    [user.id, conn.connector_id]
  );
  const activeSessionId = activeSessRes.rows[0].id;

  // Active session has no CDR -> null
  const cdr = await finalizeCdr(activeSessionId);
  assert('G1: Active session produces null CDR', cdr === null);

  // Attempt to settle non-existent CDR
  let notFoundThrew = false;
  try {
    await settleCdr('00000000-0000-0000-0000-000000000000');
  } catch (err) {
    notFoundThrew = true;
    assert('G2: Non-existent CDR throws CDR_NOT_FOUND', err.code === 'CDR_NOT_FOUND');
    assert('G2: Status code is 404', err.statusCode === 404);
  }
  assert('G2: Non-existent CDR threw error', notFoundThrew);

  await query(`DELETE FROM charging_sessions WHERE id = $1`, [activeSessionId]);
  await cleanupUser(user.id);
}

// ---------------------------------------------------------------------------
// H. Concurrent Different CDRs for Same User (No Lost Updates)
// ---------------------------------------------------------------------------

async function testConcurrentDifferentCdrs() {
  section('H. Concurrent Different CDRs (No Lost Updates)');

  const conn = await getSeededConnector();
  const { user, wallet } = await createTestUserWithWallet('concurrent_diff');

  // Fund wallet with exactly ₹1000.00
  await creditWallet(wallet.id, 1000.00);

  // Create two separate CDRs
  // CDR 1: ₹250.00
  // CDR 2: ₹350.00
  const cdr1 = await createAndFinalizeCdr(user.id, conn.connector_id, 250.00);
  const cdr2 = await createAndFinalizeCdr(user.id, conn.connector_id, 350.00);

  // Settle both simultaneously
  const [res1, res2] = await Promise.all([
    settleCdr(cdr1.id),
    settleCdr(cdr2.id),
  ]);

  assert('H1: CDR 1 settled successfully', res1.settled === true);
  assert('H1: CDR 2 settled successfully', res2.settled === true);

  // Check final wallet balance from signed ledger: 1000 - 250 - 350 = 400.00
  const w = await getWallet(user.id);
  assert('H2: Final wallet balance is exactly 400.00 (no lost updates)', w.balance === 400.00);

  // Check two distinct transactions in wallet_transactions
  const txRes = await query(
    `SELECT id, amount::float AS amount, balance_before::float AS balance_before,
            balance_after::float AS balance_after, cdr_id
     FROM wallet_transactions
     WHERE wallet_id = $1 AND type = 'charging_payment'
     ORDER BY created_at ASC`,
    [wallet.id]
  );
  assert('H3: Exactly 2 debit transactions recorded', txRes.rows.length === 2);

  const amounts = txRes.rows.map(r => r.amount).sort((a, b) => a - b);
  assert('H4: Debit amounts match -350 and -250', amounts[0] === -350.00 && amounts[1] === -250.00);

  // Check CDR 1 and CDR 2 both marked settled
  const finalCdr1 = await getCdrById(cdr1.id);
  const finalCdr2 = await getCdrById(cdr2.id);
  assert('H5: CDR 1 marked settled in database', finalCdr1.settlement_status === 'settled');
  assert('H5: CDR 2 marked settled in database', finalCdr2.settlement_status === 'settled');

  await cleanupUser(user.id);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  VahanGrid - Phase 3E.3 Wallet Settlement Test Suite');
  console.log('='.repeat(60));

  try { await testBasicSettlement(); } catch(e) { console.error('testBasicSettlement threw:', e); failed++; errors.push('testBasicSettlement'); }
  try { await testIdempotency(); } catch(e) { console.error('testIdempotency threw:', e); failed++; errors.push('testIdempotency'); }
  try { await testInsufficientBalance(); } catch(e) { console.error('testInsufficientBalance threw:', e); failed++; errors.push('testInsufficientBalance'); }
  try { await testZeroAmountCdr(); } catch(e) { console.error('testZeroAmountCdr threw:', e); failed++; errors.push('testZeroAmountCdr'); }
  try { await testPrecision(); } catch(e) { console.error('testPrecision threw:', e); failed++; errors.push('testPrecision'); }
  try { await testAuthorizationAndRest(); } catch(e) { console.error('testAuthorizationAndRest threw:', e); failed++; errors.push('testAuthorizationAndRest'); }
  try { await testFailureRecovery(); } catch(e) { console.error('testFailureRecovery threw:', e); failed++; errors.push('testFailureRecovery'); }
  try { await testConcurrentDifferentCdrs(); } catch(e) { console.error('testConcurrentDifferentCdrs threw:', e); failed++; errors.push('testConcurrentDifferentCdrs'); }

  console.log('\n' + '='.repeat(60));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) console.log(`  Failed: ${errors.join(', ')}`);
  console.log('='.repeat(60));

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
