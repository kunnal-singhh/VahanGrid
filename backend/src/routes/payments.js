/**
 * backend/src/routes/payments.js
 *
 * Payment routes for VahanGrid (Phase 3E.4).
 * Mounted at /api/v1/payments in routes/index.js.
 *
 * Endpoints:
 *  POST /webhook     - Public endpoint for gateway webhooks (signature authenticated).
 *  POST /orders      - Authenticated: Create payment intent for wallet top-up.
 *  POST /verify      - Authenticated: Verify checkout completion signature & credit wallet.
 *  GET  /:id         - Authenticated: Get payment details by ID (user isolated).
 *  GET  /            - Authenticated: List user payment history.
 */

import { Router } from 'express';
import {
  createOrderHandler,
  webhookHandler,
  verifyPaymentHandler,
  getPaymentHandler,
  listPaymentsHandler,
} from '../controllers/paymentController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

// 1. Webhook endpoint (MUST NOT require JWT authentication; verified via gateway signature)
router.post('/webhook', webhookHandler);

// 2. Authenticated endpoints
router.use(authenticate);

router.post('/orders', createOrderHandler);
router.post('/verify', verifyPaymentHandler);
router.get('/', listPaymentsHandler);
router.get('/:id', getPaymentHandler);

export default router;
