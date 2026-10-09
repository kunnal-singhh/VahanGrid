/**
 * frontend/src/services/paymentService.js
 *
 * REST API client for VahanGrid Payment Gateway & Wallet Top-up (Phase 3G).
 * Connects to Express + PostgreSQL:
 *   - POST /api/v1/payments/orders   (create top-up order intent)
 *   - POST /api/v1/payments/verify   (verify checkout completion & credit wallet)
 *   - GET  /api/v1/payments          (authenticated user's payment history)
 *   - GET  /api/v1/payments/:id      (payment order details)
 *
 * Security & Financial Model:
 *   - All requests send credentials: 'include' for HTTP-only JWT cookies.
 *   - Client never supplies secrets.
 *   - Server-side signature verification is authoritative for wallet credits.
 *   - Client never calculates wallet balances.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

async function handleResponse(res, fallbackMessage) {
  if (res.status === 401) {
    const err = new Error('Authentication required. Please log in.');
    err.status = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || fallbackMessage;
    const err = new Error(message);
    err.status = res.status;
    err.code = json?.error?.code || 'PAYMENT_ERROR';
    err.details = json?.error?.details || null;
    throw err;
  }
  return json.data;
}

export const paymentService = {
  /**
   * Creates a payment order for wallet top-up.
   *
   * @param {object} params
   * @param {number} params.amount - Top-up amount in INR (min ₹10, max ₹50,000)
   * @param {string} [params.currency='INR']
   * @returns {Promise<object>} { payment_id, order_id, amount, currency, status, key_id, provider, created_at }
   */
  async createOrder({ amount, currency = 'INR' }) {
    const res = await fetch(`${API_BASE_URL}/payments/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ amount, currency }),
    });
    return handleResponse(res, 'Failed to create payment order.');
  },

  /**
   * Verifies payment completion signature with the backend and credits the wallet.
   *
   * @param {object} params
   * @param {string} params.orderId - Provider order ID (order_...)
   * @param {string} params.paymentId - Provider payment ID (pay_...)
   * @param {string} params.signature - HMAC checkout signature
   * @returns {Promise<object>} Result containing transaction_id, status, balance_after
   */
  async verifyPayment({ orderId, paymentId, signature }) {
    const res = await fetch(`${API_BASE_URL}/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        order_id: orderId,
        payment_id: paymentId,
        signature,
      }),
    });
    return handleResponse(res, 'Payment verification failed.');
  },

  /**
   * Retrieves payment history for the authenticated user, newest first.
   *
   * @param {object} [options={}]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @returns {Promise<Array<object>>} List of payment records
   */
  async getPayments({ limit = 50, offset = 0 } = {}) {
    const queryParams = new URLSearchParams({ limit, offset });
    const res = await fetch(`${API_BASE_URL}/payments?${queryParams.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    const data = await handleResponse(res, 'Failed to retrieve payment history.');
    return Array.isArray(data) ? data : [];
  },

  /**
   * Retrieves a specific payment record by UUID.
   *
   * @param {string} paymentId
   * @returns {Promise<object>}
   */
  async getPaymentById(paymentId) {
    if (!paymentId) throw new Error('Payment ID is required.');
    const res = await fetch(`${API_BASE_URL}/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse(res, 'Failed to retrieve payment details.');
  },
};
