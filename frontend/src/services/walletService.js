/**
 * frontend/src/services/walletService.js
 *
 * REST API client for VahanGrid Wallet operations (Phase 3C.4B).
 * Connects to Express + PostgreSQL:
 *   - GET /api/v1/wallet               (authenticated user's wallet + derived balance)
 *   - GET /api/v1/wallet/transactions  (authenticated user's transaction history)
 *
 * Security & Data Model:
 *   - All requests send credentials: 'include' for HTTP-only JWT cookies.
 *   - Identity is derived strictly on the server from the verified session (req.user.id).
 *   - Balance is calculated authoritatively by PostgreSQL via a signed ledger (SUM(amount)).
 *   - The frontend never calculates, fabricates, or stores the wallet balance.
 *   - Never stores wallet balance in localStorage.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

/**
 * Handles HTTP response from wallet endpoints, parsing error payloads cleanly.
 */
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
    err.code = json?.error?.code;
    throw err;
  }
  return json.data;
}

export const walletService = {
  /**
   * Retrieves the authenticated user's wallet object.
   * Shape: { id, user_id, currency, status, created_at, updated_at, balance }
   * @returns {Promise<object>}
   */
  async getWallet() {
    const res = await fetch(`${API_BASE_URL}/wallet`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse(res, 'Failed to retrieve wallet information');
  },

  /**
   * Retrieves the authenticated user's wallet transactions, ordered newest-first.
   * Shape: Array<{ id, wallet_id, type, amount, currency, reference_type, reference_id, description, created_at }>
   * @returns {Promise<Array<object>>}
   */
  async getWalletTransactions() {
    const res = await fetch(`${API_BASE_URL}/wallet/transactions`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    const data = await handleResponse(res, 'Failed to retrieve wallet transactions');
    return Array.isArray(data) ? data : [];
  },

  /**
   * Compatibility alias for getWalletTransactions.
   * @returns {Promise<Array<object>>}
   */
  async getTransactions() {
    return this.getWalletTransactions();
  },

  /**
   * Compatibility helper returning only the derived balance number.
   * @returns {Promise<number>}
   */
  async getBalance() {
    const wallet = await this.getWallet();
    return wallet?.balance ?? 0;
  },
};
