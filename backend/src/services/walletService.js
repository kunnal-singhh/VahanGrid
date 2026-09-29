/**
 * src/services/walletService.js
 *
 * Database access layer for VahanGrid wallet read operations.
 *
 * Security contract:
 *   - ALL queries are scoped by user_id from the authenticated session (req.user.id).
 *   - wallet_id is NEVER accepted from the client — it is always derived
 *     from the user's own wallet row via user_id lookup.
 *   - A user can only read their own wallet and transactions.
 *
 * Schema facts (from migrations 008 + 009):
 *   wallets              — 1:1 with users. Balance is NOT stored as a column;
 *                          it is derived as SUM(amount) over wallet_transactions.
 *   wallet_transactions  — immutable signed ledger (positive = credit, negative = debit).
 *
 * Phase 3C.4A scope:
 *   READ-ONLY: getWallet() and getTransactions() only.
 *   Top-up, deductions, tariff calculation, and payment gateways are NOT implemented.
 *   cost_amount on charging sessions remains 0 until real OCPP telemetry is available.
 */

import { query } from '../config/database.js';

// ---------------------------------------------------------------------------
// Column allowlists — never expose internal/system-sensitive fields
// ---------------------------------------------------------------------------

/** Safe wallet fields returned to the client. */
const WALLET_FIELDS = `
  w.id,
  w.user_id,
  w.currency,
  w.status,
  w.created_at,
  w.updated_at,
  COALESCE(SUM(wt.amount), 0)::float  AS balance
`;

/** Safe transaction fields returned to the client. */
const TRANSACTION_FIELDS = `
  wt.id,
  wt.wallet_id,
  wt.type,
  wt.amount::float     AS amount,
  wt.currency,
  wt.reference_type,
  wt.reference_id,
  wt.description,
  wt.created_at
`;

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Get the authenticated user's wallet, including their current balance.
 *
 * Balance is computed as the running sum of the wallet_transactions ledger
 * (positive credits minus negative debits). Returns null if the user has
 * no wallet record yet — callers should surface this as HTTP 404.
 *
 * @param {string} userId  UUID from req.user.id
 * @returns {Promise<object|null>}
 */
export async function getWallet(userId) {
  const result = await query(
    `SELECT ${WALLET_FIELDS}
     FROM wallets w
     LEFT JOIN wallet_transactions wt ON wt.wallet_id = w.id
     WHERE w.user_id = $1
     GROUP BY w.id`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Get all transactions for the authenticated user's wallet, ordered
 * newest first (created_at DESC).
 *
 * Returns an empty array if the wallet has no transactions or the user
 * has no wallet (we look up the wallet_id internally — client never supplies it).
 *
 * @param {string} userId  UUID from req.user.id
 * @returns {Promise<Array<object>>}
 */
export async function getTransactions(userId) {
  const result = await query(
    `SELECT ${TRANSACTION_FIELDS}
     FROM wallet_transactions wt
     JOIN wallets w ON wt.wallet_id = w.id
     WHERE w.user_id = $1
     ORDER BY wt.created_at DESC`,
    [userId]
  );
  return result.rows;
}
