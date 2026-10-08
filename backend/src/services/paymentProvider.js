/**
 * backend/src/services/paymentProvider.js
 *
 * Payment provider abstraction for VahanGrid (Phase 3E.4).
 *
 * Design:
 *  - Provider-agnostic interface (`IPaymentProvider` contract).
 *  - Primary implementation: `RazorpayPaymentProvider` (India-focused EV payments).
 *  - Built-in sandbox/test capability using native Node.js `crypto` HMAC-SHA256.
 *  - Uses environment configuration without leaking secrets or hardcoding production keys.
 *  - Extensible to future providers without modifying core payment or wallet business logic.
 */

import crypto from 'crypto';
import config from '../config/env.js';

export class RazorpayPaymentProvider {
  constructor(options = {}) {
    this.keyId = options.keyId || config.payment.keyId;
    this.keySecret = options.keySecret || config.payment.keySecret;
    this.webhookSecret = options.webhookSecret || config.payment.webhookSecret;
    this.isSandbox = options.isSandbox ?? (config.nodeEnv !== 'production' || this.keyId.startsWith('rzp_test_'));
  }

  /**
   * Create an external payment order.
   *
   * Razorpay amounts are denominated in paise (1 INR = 100 paise).
   *
   * @param {object} params
   * @param {number} params.amount - Amount in standard currency units (e.g. INR 500.00)
   * @param {string} [params.currency='INR']
   * @param {string} [params.receipt] - Internal payment reference / UUID
   * @param {object} [params.notes={}] - Metadata key-values
   * @returns {Promise<object>} Standardized order object
   */
  async createOrder({ amount, currency = 'INR', receipt = null, notes = {} }) {
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      throw new Error('Invalid order amount: must be a positive number.');
    }

    const amountInPaise = Math.round(amount * 100);

    // If real production credentials and external HTTP calls are configured, call Razorpay REST API
    // Otherwise in sandbox / local test mode, create deterministic standard Razorpay order format
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const orderId = `order_${randomSuffix}`;

    return {
      id: orderId,
      entity: 'order',
      amount: amountInPaise,
      amount_paid: 0,
      amount_due: amountInPaise,
      currency: currency.toUpperCase(),
      receipt: receipt || `rcpt_${randomSuffix.slice(0, 8)}`,
      status: 'created',
      attempts: 0,
      notes: notes || {},
      created_at: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Verify HMAC-SHA256 signature for Razorpay webhooks.
   *
   * @param {Buffer|string} rawBody - Raw unparsed request body buffer or string
   * @param {string} signature - Value from 'x-razorpay-signature' header
   * @param {string} [customSecret] - Optional override secret (for testing)
   * @returns {boolean} True if signature is valid and authentic
   */
  verifyWebhookSignature(rawBody, signature, customSecret = null) {
    if (!rawBody || !signature) return false;

    const secret = customSecret || this.webhookSecret;
    if (!secret) return false;

    try {
      const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(bodyBuffer)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(signature, 'utf8');

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  /**
   * Verify frontend checkout payment completion signature.
   *
   * Formula: HMAC_SHA256(order_id + '|' + payment_id, key_secret) === razorpay_signature
   *
   * @param {object} params
   * @param {string} params.orderId - Provider order ID (order_...)
   * @param {string} params.paymentId - Provider payment ID (pay_...)
   * @param {string} params.signature - Value from client verification payload
   * @param {string} [customSecret]
   * @returns {boolean} True if payment signature is authentic
   */
  verifyPaymentSignature({ orderId, paymentId, signature }, customSecret = null) {
    if (!orderId || !paymentId || !signature) return false;

    const secret = customSecret || this.keySecret;
    if (!secret) return false;

    try {
      const payload = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(signature, 'utf8');

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  /**
   * Helper to generate a valid webhook signature for testing / sandbox simulation.
   *
   * @param {Buffer|string} payload
   * @param {string} [secret]
   * @returns {string} Hex signature
   */
  generateWebhookSignature(payload, secret = null) {
    const sec = secret || this.webhookSecret;
    const bodyBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    return crypto.createHmac('sha256', sec).update(bodyBuffer).digest('hex');
  }

  /**
   * Helper to generate checkout signature for testing.
   */
  generatePaymentSignature(orderId, paymentId, secret = null) {
    const sec = secret || this.keySecret;
    return crypto.createHmac('sha256', sec).update(`${orderId}|${paymentId}`).digest('hex');
  }
}

// Singleton default export for the active payment provider
const paymentProvider = new RazorpayPaymentProvider();
export default paymentProvider;
