/**
 * src/controllers/walletController.js
 *
 * HTTP handlers for VahanGrid wallet read APIs.
 *
 * Security & Authorization:
 *   - All handlers rely on req.user.id set by the authenticate middleware.
 *   - user_id and wallet_id are NEVER read from request body, query
 *     parameters, or URL params — identity is derived exclusively from
 *     the verified JWT session.
 *   - A user can never read another user's wallet or transactions.
 *     The service layer enforces this by scoping all SQL to the
 *     authenticated user_id.
 *
 * Phase 3C.4A scope (READ-ONLY):
 *   GET /wallet              — authenticated user's wallet + derived balance
 *   GET /wallet/transactions — authenticated user's transaction history
 *
 * Not implemented in this phase:
 *   - Top-up / funding
 *   - Payment gateway integration
 *   - Charging cost deduction (requires OCPP telemetry)
 *   - Tariff calculation
 */

import * as walletService from '../services/walletService.js';

/**
 * GET /api/v1/wallet
 *
 * Returns the authenticated user's wallet including the derived balance
 * (SUM of all wallet_transactions.amount for this wallet).
 *
 * HTTP 200  — wallet found; returns { success: true, data: wallet }
 * HTTP 404  — no wallet exists for this user yet
 */
export async function getWalletHandler(req, res, next) {
  try {
    const wallet = await walletService.getWallet(req.user.id);

    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'WALLET_NOT_FOUND',
          message: 'No wallet found for your account.',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: wallet,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/wallet/transactions
 *
 * Returns the authenticated user's wallet transaction history,
 * ordered newest-first. Returns an empty array if no transactions exist.
 *
 * HTTP 200  — { success: true, data: transaction[] }
 */
export async function getTransactionsHandler(req, res, next) {
  try {
    const transactions = await walletService.getTransactions(req.user.id);

    return res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (err) {
    next(err);
  }
}
