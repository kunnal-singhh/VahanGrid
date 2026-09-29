/**
 * src/routes/wallet.js
 *
 * Wallet routes for VahanGrid.
 * Mounted at /api/v1/wallet in routes/index.js.
 *
 * GET  /              — authenticated user's wallet + derived balance
 * GET  /transactions  — authenticated user's transaction history (newest first)
 *
 * All routes require authentication via the authenticate middleware.
 * Identity is derived from req.user.id — the client never supplies a user_id or wallet_id.
 *
 * Phase 3C.4A scope:
 *   READ-ONLY. Top-up, payment gateway, and charging billing are not implemented.
 */

import { Router } from 'express';
import { getWalletHandler, getTransactionsHandler } from '../controllers/walletController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

// Enforce authentication across all wallet endpoints
router.use(authenticate);

// Static route (/transactions) MUST be registered before any parameterized route.
// Currently there are no :id param routes in this phase.
router.get('/', getWalletHandler);
router.get('/transactions', getTransactionsHandler);

export default router;
