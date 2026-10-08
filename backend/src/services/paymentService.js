/**
 * backend/src/services/paymentService.js
 *
 * Core payment business logic and wallet top-up orchestration (Phase 3E.4).
 *
 * Responsibilities:
 *  1. createPaymentOrder() - Authenticated order creation with server-authoritative amount.
 *  2. processPaymentWebhook() - Authenticates webhook signature, handles idempotent fulfillment.
 *  3. verifyAndCreditPayment() - Server-verified checkout completion.
 *  4. creditWalletForPayment() - Atomic row-locked ledger insertion for external payment.
 *  5. getPaymentById() & listUserPayments() - User-scoped payment status retrieval.
 *
 * Security & Financial Invariants:
 *  - Authoritative Amount: Frontend amounts are validated and stored upon order creation;
 *    wallet credits strictly use the backend-created payment amount, verified against provider.
 *  - Strict Atomicity: Row-level locks (FOR UPDATE on payments and wallets) within a single
 *    PostgreSQL transaction ensure zero partial credits or inconsistent ledger states.
 *  - Database-Level Idempotency: Protected by both status machine checks and the unique index
 *    `uq_wallet_txns_payment_id`. Concurrent or replayed webhooks yield exactly ONE wallet credit.
 *  - Separation of Concerns: `payments` table tracks external gateway status;
 *    `wallet_transactions` immutable signed ledger records internal movement (`type = 'topup'`).
 *  - No Secret Leakage: Webhook secrets and internal provider credentials are never returned.
 */

import pool, { query } from '../config/database.js';
import config from '../config/env.js';
import paymentProvider from './paymentProvider.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Create a new wallet top-up payment order.
 *
 * @param {object} params
 * @param {string} params.userId - Authenticated user UUID
 * @param {number} params.amount - Requested top-up amount in INR
 * @param {string} [params.currency='INR']
 * @returns {Promise<object>} Order response for client checkout
 */
export async function createPaymentOrder({ userId, amount, currency = 'INR' }) {
  if (!userId || !UUID_REGEX.test(userId)) {
    const err = new Error('Invalid or missing user ID.');
    err.statusCode = 400;
    err.code = 'INVALID_USER_ID';
    throw err;
  }

  // 1. Validate amount
  const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (typeof parsedAmount !== 'number' || isNaN(parsedAmount) || parsedAmount <= 0) {
    const err = new Error('Top-up amount must be a positive number.');
    err.statusCode = 400;
    err.code = 'INVALID_AMOUNT';
    throw err;
  }

  // Round to 2 decimal places
  const normalizedAmount = Number(parsedAmount.toFixed(2));

  // Check bounds
  const minAmount = config.payment.minTopupAmount || 10;
  const maxAmount = config.payment.maxTopupAmount || 50000;
  if (normalizedAmount < minAmount || normalizedAmount > maxAmount) {
    const err = new Error(`Amount must be between ₹${minAmount} and ₹${maxAmount}.`);
    err.statusCode = 400;
    err.code = 'AMOUNT_OUT_OF_BOUNDS';
    err.details = { min: minAmount, max: maxAmount, requested: normalizedAmount };
    throw err;
  }

  // Validate currency
  const normalizedCurrency = (currency || 'INR').toUpperCase();
  if (normalizedCurrency !== 'INR') {
    const err = new Error(`Unsupported currency: "${currency}". Only "INR" is accepted.`);
    err.statusCode = 400;
    err.code = 'INVALID_CURRENCY';
    throw err;
  }

  // 2. Fetch user's wallet
  const walletRes = await query(
    `SELECT id, currency, status FROM wallets WHERE user_id = $1`,
    [userId]
  );

  if (walletRes.rows.length === 0) {
    const err = new Error('User does not have an active wallet.');
    err.statusCode = 404;
    err.code = 'WALLET_NOT_FOUND';
    throw err;
  }

  const wallet = walletRes.rows[0];
  if (wallet.status !== 'active') {
    const err = new Error(`Wallet is ${wallet.status}; cannot top up.`);
    err.statusCode = 400;
    err.code = 'WALLET_INACTIVE';
    throw err;
  }

  // 3. Create payment order via provider
  const providerOrder = await paymentProvider.createOrder({
    amount: normalizedAmount,
    currency: normalizedCurrency,
    notes: {
      userId,
      walletId: wallet.id,
      purpose: 'wallet_topup',
    },
  });

  // 4. Record payment intent in the payments table
  const insertRes = await query(
    `INSERT INTO payments (
       user_id,
       wallet_id,
       provider,
       provider_order_id,
       amount,
       currency,
       status,
       metadata,
       created_at,
       updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'created', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id, provider_order_id, amount::float AS amount, currency, status, created_at`,
    [
      userId,
      wallet.id,
      config.payment.provider || 'razorpay',
      providerOrder.id,
      normalizedAmount,
      normalizedCurrency,
      JSON.stringify({ provider_order: providerOrder }),
    ]
  );

  const payment = insertRes.rows[0];

  return {
    payment_id: payment.id,
    order_id: payment.provider_order_id,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    key_id: paymentProvider.keyId,
    provider: config.payment.provider || 'razorpay',
    created_at: payment.created_at,
  };
}

/**
 * Atomically fulfill a payment and credit the user's wallet.
 *
 * Invariant:
 *  - Must be wrapped in a transaction with row-level locks on `payments` and `wallets`.
 *  - Strictly idempotent: multiple executions guarantee exactly ONE wallet credit.
 *  - Verifies amount consistency between backend order and provider report.
 *
 * @param {object} params
 * @param {string} params.providerOrderId - External order ID (e.g. order_...)
 * @param {string} params.providerPaymentId - External payment ID (e.g. pay_...)
 * @param {number} [params.providerAmountInRupees] - Amount reported by provider in INR
 * @param {string} [params.userId] - Optional user ID for ownership enforcement
 * @returns {Promise<object>}
 */
export async function creditWalletForPayment({
  providerOrderId,
  providerPaymentId,
  providerAmountInRupees = null,
  userId = null,
}) {
  if (!providerOrderId) {
    const err = new Error('Provider order ID is required.');
    err.statusCode = 400;
    err.code = 'INVALID_ORDER_ID';
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock payment row FOR UPDATE
    const paymentRes = await client.query(
      `SELECT * FROM payments WHERE provider_order_id = $1 FOR UPDATE`,
      [providerOrderId]
    );

    if (paymentRes.rows.length === 0) {
      const err = new Error(`Payment order "${providerOrderId}" not found.`);
      err.statusCode = 404;
      err.code = 'PAYMENT_NOT_FOUND';
      throw err;
    }

    const payment = paymentRes.rows[0];

    // 2. Ownership verification if userId passed
    if (userId && payment.user_id !== userId) {
      const err = new Error('Access denied: Payment order belongs to another user.');
      err.statusCode = 403;
      err.code = 'PAYMENT_ACCESS_DENIED';
      throw err;
    }

    // 3. Idempotency Check: if already paid, return early
    if (payment.status === 'paid') {
      const txnRes = await client.query(
        `SELECT id, amount::float AS amount, balance_before::float AS balance_before,
                balance_after::float AS balance_after, created_at
         FROM wallet_transactions WHERE id = $1 OR payment_id = $2`,
        [payment.wallet_transaction_id, payment.id]
      );
      const existingTxn = txnRes.rows[0] || null;

      await client.query('COMMIT');
      return {
        success: true,
        already_processed: true,
        payment_id: payment.id,
        status: 'paid',
        amount: Number(payment.amount),
        currency: payment.currency,
        transaction_id: existingTxn ? existingTxn.id : payment.wallet_transaction_id,
        balance_before: existingTxn ? existingTxn.balance_before : null,
        balance_after: existingTxn ? existingTxn.balance_after : null,
        completed_at: payment.completed_at,
      };
    }

    // 4. Validate State Transitions
    if (payment.status === 'cancelled') {
      const err = new Error('Cannot process a cancelled payment.');
      err.statusCode = 400;
      err.code = 'PAYMENT_CANCELLED';
      throw err;
    }

    // 5. Amount Tampering Protection:
    // If provider payload includes an amount, ensure it matches the backend order amount.
    const authoritativeAmount = Number(payment.amount);
    if (providerAmountInRupees !== null) {
      const diff = Math.abs(providerAmountInRupees - authoritativeAmount);
      if (diff > 0.009) {
        // Mark payment as failed with tampering alert
        await client.query(
          `UPDATE payments
           SET status = 'failed',
               error_code = 'AMOUNT_TAMPERING_DETECTED',
               error_description = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [
            `Reported amount ₹${providerAmountInRupees} does not match order amount ₹${authoritativeAmount}`,
            payment.id,
          ]
        );
        await client.query('COMMIT');

        const err = new Error('Payment rejected: amount tampering detected.');
        err.statusCode = 400;
        err.code = 'AMOUNT_TAMPERING_DETECTED';
        throw err;
      }
    }

    // 6. Lock wallet row FOR UPDATE
    const walletRes = await client.query(
      `SELECT id, currency, status FROM wallets WHERE id = $1 FOR UPDATE`,
      [payment.wallet_id]
    );

    if (walletRes.rows.length === 0) {
      const err = new Error('Associated wallet not found.');
      err.statusCode = 404;
      err.code = 'WALLET_NOT_FOUND';
      throw err;
    }

    const wallet = walletRes.rows[0];
    if (wallet.status !== 'active') {
      const err = new Error(`Wallet is ${wallet.status}; cannot credit.`);
      err.statusCode = 400;
      err.code = 'WALLET_INACTIVE';
      throw err;
    }

    // 7. Calculate authoritative current balance from the signed ledger inside lock
    const balRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(12, 2) AS current_balance
       FROM wallet_transactions WHERE wallet_id = $1`,
      [wallet.id]
    );

    const balanceBefore = Number(balRes.rows[0].current_balance);
    const balanceAfter = Number((balanceBefore + authoritativeAmount).toFixed(2));

    // 8. Insert into wallet_transactions (signed ledger: positive amount = credit)
    const txnRes = await client.query(
      `INSERT INTO wallet_transactions (
         wallet_id,
         type,
         amount,
         currency,
         reference_type,
         reference_id,
         description,
         balance_before,
         balance_after,
         payment_id,
         created_at
       ) VALUES ($1, 'topup', $2, $3, 'payment', $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       RETURNING id, created_at`,
      [
        wallet.id,
        authoritativeAmount,
        payment.currency,
        payment.id,
        `Wallet top-up via ${payment.provider}`,
        balanceBefore,
        balanceAfter,
        payment.id,
      ]
    );

    const transactionId = txnRes.rows[0].id;
    const completedAt = txnRes.rows[0].created_at;

    // 9. Update payment row to 'paid'
    await client.query(
      `UPDATE payments
       SET status = 'paid',
           provider_payment_id = $1,
           wallet_transaction_id = $2,
           completed_at = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [providerPaymentId || null, transactionId, completedAt, payment.id]
    );

    await client.query('COMMIT');

    return {
      success: true,
      already_processed: false,
      payment_id: payment.id,
      status: 'paid',
      amount: authoritativeAmount,
      currency: payment.currency,
      transaction_id: transactionId,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      completed_at: completedAt,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    // Database unique index constraint check (concurrent duplicate webhook)
    if (err.code === '23505' && err.constraint === 'uq_wallet_txns_payment_id') {
      const existing = await query(
        `SELECT p.id AS payment_id, p.amount::float AS amount, p.currency, p.completed_at,
                wt.id AS transaction_id, wt.balance_before::float AS balance_before,
                wt.balance_after::float AS balance_after
         FROM payments p
         JOIN wallet_transactions wt ON wt.payment_id = p.id
         WHERE p.provider_order_id = $1`,
        [providerOrderId]
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        return {
          success: true,
          already_processed: true,
          payment_id: row.payment_id,
          status: 'paid',
          amount: row.amount,
          currency: row.currency,
          transaction_id: row.transaction_id,
          balance_before: row.balance_before,
          balance_after: row.balance_after,
          completed_at: row.completed_at,
        };
      }
    }

    throw err;
  } finally {
    client.release();
  }
}

/**
 * Handle incoming webhook notifications from the payment gateway.
 *
 * @param {object} params
 * @param {Buffer|string} params.rawBody - Raw HTTP body for signature verification
 * @param {string} params.signature - Value of 'x-razorpay-signature' header
 * @param {string} [params.secret] - Optional secret override (for testing)
 * @returns {Promise<object>} Processing result
 */
export async function processPaymentWebhook({ rawBody, signature, secret = null }) {
  if (!signature) {
    const err = new Error('Missing webhook signature.');
    err.statusCode = 400;
    err.code = 'MISSING_SIGNATURE';
    throw err;
  }

  // 1. Verify HMAC-SHA256 signature
  const isValid = paymentProvider.verifyWebhookSignature(rawBody, signature, secret);
  if (!isValid) {
    const err = new Error('Invalid webhook signature.');
    err.statusCode = 400;
    err.code = 'INVALID_SIGNATURE';
    throw err;
  }

  // 2. Parse payload safely
  let payload;
  try {
    payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));
  } catch {
    const err = new Error('Malformed webhook JSON payload.');
    err.statusCode = 400;
    err.code = 'MALFORMED_PAYLOAD';
    throw err;
  }

  const event = payload.event;
  if (!event) {
    const err = new Error('Missing event type in webhook.');
    err.statusCode = 400;
    err.code = 'MISSING_EVENT';
    throw err;
  }

  // 3. Process event types
  if (event === 'order.paid' || event === 'payment.captured') {
    const paymentEntity = payload.payload?.payment?.entity || {};
    const orderEntity = payload.payload?.order?.entity || {};

    const orderId = orderEntity.id || paymentEntity.order_id;
    const paymentId = paymentEntity.id;
    const amountInPaise = paymentEntity.amount || orderEntity.amount;
    const providerAmountInRupees = amountInPaise ? amountInPaise / 100 : null;

    if (!orderId) {
      const err = new Error('Webhook missing provider order ID.');
      err.statusCode = 400;
      err.code = 'MISSING_ORDER_ID';
      throw err;
    }

    const result = await creditWalletForPayment({
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      providerAmountInRupees,
    });

    return {
      received: true,
      event,
      result,
    };
  }

  if (event === 'payment.failed') {
    const paymentEntity = payload.payload?.payment?.entity || {};
    const orderId = paymentEntity.order_id;
    const errorCode = paymentEntity.error_code || 'PAYMENT_FAILED';
    const errorDesc = paymentEntity.error_description || 'Payment failed at gateway.';

    if (orderId) {
      await query(
        `UPDATE payments
         SET status = 'failed',
             error_code = $1,
             error_description = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE provider_order_id = $3 AND status IN ('created', 'pending')`,
        [errorCode, errorDesc, orderId]
      );
    }

    return {
      received: true,
      event,
      status: 'failed',
    };
  }

  // Unhandled / informational event
  return {
    received: true,
    event,
    status: 'ignored',
  };
}

/**
 * Server-side payment verification (called when frontend checkout completes).
 *
 * @param {object} params
 * @param {string} params.userId - Authenticated user UUID
 * @param {string} params.orderId - Provider order ID
 * @param {string} params.paymentId - Provider payment ID
 * @param {string} params.signature - Razorpay checkout signature
 * @returns {Promise<object>}
 */
export async function verifyAndCreditPayment({ userId, orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) {
    const err = new Error('orderId, paymentId, and signature are required.');
    err.statusCode = 400;
    err.code = 'MISSING_VERIFICATION_PARAMS';
    throw err;
  }

  // 1. Verify checkout HMAC signature
  const isValid = paymentProvider.verifyPaymentSignature({ orderId, paymentId, signature });
  if (!isValid) {
    const err = new Error('Invalid payment signature verification failed.');
    err.statusCode = 400;
    err.code = 'INVALID_SIGNATURE';
    throw err;
  }

  // 2. Fulfill payment atomically
  return creditWalletForPayment({
    providerOrderId: orderId,
    providerPaymentId: paymentId,
    userId,
  });
}

/**
 * Retrieve a payment record by ID, scoped to user.
 *
 * @param {string} paymentId - Payment UUID
 * @param {string} userId - Authenticated user UUID
 * @returns {Promise<object|null>}
 */
export async function getPaymentById(paymentId, userId) {
  if (!paymentId || !UUID_REGEX.test(paymentId)) {
    const err = new Error('Invalid payment ID format.');
    err.statusCode = 400;
    err.code = 'INVALID_PAYMENT_ID';
    throw err;
  }

  const res = await query(
    `SELECT p.id,
            p.user_id,
            p.wallet_id,
            p.provider,
            p.provider_order_id,
            p.provider_payment_id,
            p.amount::float AS amount,
            p.currency,
            p.status,
            p.wallet_transaction_id,
            p.error_code,
            p.error_description,
            p.created_at,
            p.updated_at,
            p.completed_at
     FROM payments p
     WHERE p.id = $1`,
    [paymentId]
  );

  if (res.rows.length === 0) return null;

  const payment = res.rows[0];

  // Enforce user isolation
  if (userId && payment.user_id !== userId) {
    const err = new Error('Access denied: Payment belongs to another user.');
    err.statusCode = 403;
    err.code = 'PAYMENT_ACCESS_DENIED';
    throw err;
  }

  return payment;
}

/**
 * List payment history for the authenticated user.
 *
 * @param {string} userId
 * @param {number} [limit=50]
 * @param {number} [offset=0]
 * @returns {Promise<Array<object>>}
 */
export async function listUserPayments(userId, limit = 50, offset = 0) {
  const res = await query(
    `SELECT p.id,
            p.provider,
            p.provider_order_id,
            p.provider_payment_id,
            p.amount::float AS amount,
            p.currency,
            p.status,
            p.wallet_transaction_id,
            p.created_at,
            p.completed_at
     FROM payments p
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return res.rows;
}
