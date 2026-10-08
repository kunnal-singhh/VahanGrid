/**
 * backend/src/controllers/paymentController.js
 *
 * HTTP controllers for Payment Gateway & Wallet Top-up (Phase 3E.4).
 */

import {
  createPaymentOrder,
  processPaymentWebhook,
  verifyAndCreditPayment,
  getPaymentById,
  listUserPayments,
} from '../services/paymentService.js';

/**
 * POST /api/v1/payments/orders
 * Create a new payment order for wallet top-up.
 */
export async function createOrderHandler(req, res, next) {
  try {
    const { amount, currency } = req.body;
    const order = await createPaymentOrder({
      userId: req.user.id,
      amount,
      currency,
    });

    res.status(201).json({
      success: true,
      data: order,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/payments/webhook
 * Handle asynchronous payment gateway events (e.g. order.paid, payment.captured).
 * Signature verification is required; no JWT auth.
 */
export async function webhookHandler(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body), 'utf8');

    const result = await processPaymentWebhook({
      rawBody,
      signature,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/payments/verify
 * Authenticated frontend callback verification (Razorpay checkout handler).
 */
export async function verifyPaymentHandler(req, res, next) {
  try {
    const { order_id, orderId, payment_id, paymentId, signature } = req.body;
    const result = await verifyAndCreditPayment({
      userId: req.user.id,
      orderId: order_id || orderId,
      paymentId: payment_id || paymentId,
      signature,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/payments/:id
 * Retrieve details for a specific payment.
 */
export async function getPaymentHandler(req, res, next) {
  try {
    const payment = await getPaymentById(req.params.id, req.user.id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: 'Payment not found.',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/payments
 * List payment history for authenticated user.
 */
export async function listPaymentsHandler(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

    const payments = await listUserPayments(req.user.id, limit, offset);

    res.status(200).json({
      success: true,
      data: payments,
    });
  } catch (err) {
    next(err);
  }
}
