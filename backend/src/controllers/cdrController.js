/**
 * backend/src/controllers/cdrController.js
 *
 * REST API controller for VahanGrid Charge Detail Records (Phase 3E.2).
 *
 * Endpoints:
 *  GET /api/v1/cdrs             — list authenticated user's CDRs
 *  GET /api/v1/cdrs/:id         — get CDR detail (ownership enforced)
 *  GET /api/v1/sessions/:id/cdr — get CDR for a specific session (ownership enforced)
 *
 * CDRs are read-only from the REST layer. Finalization is triggered internally
 * by the session lifecycle (stopSession / TransactionEvent Ended).
 */

import * as cdrService from '../services/cdrService.js';
import { settleCdr } from '../services/walletSettlementService.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/cdrs
 * List all CDRs belonging to the authenticated user.
 */
export async function listCdrsHandler(req, res, next) {
  try {
    const cdrs = await cdrService.listCdrsByUser(req.user.id);
    return res.status(200).json({
      success: true,
      data: cdrs,
      meta: {
        count: cdrs.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/cdrs/:id
 * Get a single CDR by UUID. Enforces user ownership (403 if mismatched).
 */
export async function getCdrByIdHandler(req, res, next) {
  try {
    const { id } = req.params;

    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CDR_ID',
          message: 'CDR ID must be a valid UUID.',
        },
      });
    }

    const cdr = await cdrService.getCdrById(id, req.user.id);

    if (!cdr) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CDR_NOT_FOUND',
          message: `CDR with ID '${id}' was not found.`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: cdr,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'CDR_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * GET /api/v1/sessions/:id/cdr
 * Get the CDR associated with a specific charging session.
 * Enforces user ownership of the session.
 */
export async function getCdrBySessionHandler(req, res, next) {
  try {
    const { id: sessionId } = req.params;

    if (!UUID_REGEX.test(sessionId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SESSION_ID',
          message: 'Session ID must be a valid UUID.',
        },
      });
    }

    const cdr = await cdrService.getCdrBySessionId(sessionId, req.user.id);

    if (!cdr) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CDR_NOT_FOUND',
          message: `No CDR found for session '${sessionId}'. The session may still be active or ineligible for a CDR.`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: cdr,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'CDR_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * POST /api/v1/cdrs/:id/settle
 * Explicitly triggers or retries settlement for an authenticated user's CDR.
 * Ownership is enforced: users can only settle their own CDRs.
 */
export async function settleCdrHandler(req, res, next) {
  try {
    const { id } = req.params;

    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CDR_ID',
          message: 'CDR ID must be a valid UUID.',
        },
      });
    }

    const result = await settleCdr(id, {
      userId: req.user.id,
      throwOnInsufficient: true,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'SETTLEMENT_ERROR',
          message: err.message,
          details: err.details || undefined,
        },
      });
    }
    next(err);
  }
}

