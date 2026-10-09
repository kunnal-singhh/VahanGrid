/**
 * src/controllers/operatorController.js
 *
 * HTTP handlers for VahanGrid Operator Dashboard APIs.
 *
 * Security & Tenancy Rules:
 * - Handlers are protected by authenticate and requireOperator middleware.
 * - Operators are locked to req.user.cpo_id. Cross-CPO query overrides are rejected with 403.
 * - Admins may optionally scope to a specific CPO via query parameter (?cpo_id=) or view platform-wide.
 * - Driver requests are rejected by middleware before reaching these handlers.
 */

import * as operatorService from '../services/operatorService.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_PERIODS = ['24h', '7d', '30d'];
const ALLOWED_STATION_STATUSES = ['active', 'inactive', 'all'];
const ALLOWED_SESSION_STATUSES = ['active', 'completed', 'stopped', 'all'];

/**
 * Helper to resolve and validate the authoritative CPO scope.
 */
async function resolveCpoScope(req, res) {
  const { role, cpo_id: userCpoId } = req.user;

  if (role === 'operator') {
    if (req.query.cpo_id && req.query.cpo_id !== userCpoId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CPO_ACCESS_DENIED',
          message: 'Access denied. You cannot query data for another Charge Point Operator.',
        },
      });
      return { resolved: false };
    }
    return { resolved: true, cpoId: userCpoId };
  }

  if (role === 'admin') {
    const requestedCpoId = req.query.cpo_id;
    if (requestedCpoId) {
      if (!UUID_REGEX.test(requestedCpoId)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ID',
            message: "Query parameter 'cpo_id' must be a valid UUID.",
          },
        });
        return { resolved: false };
      }

      const cpo = await operatorService.getCpoInfo(requestedCpoId);
      if (!cpo) {
        res.status(404).json({
          success: false,
          error: {
            code: 'CPO_NOT_FOUND',
            message: `Charge Point Operator with ID '${requestedCpoId}' was not found.`,
          },
        });
        return { resolved: false };
      }
      return { resolved: true, cpoId: requestedCpoId };
    }
    // Admin without cpo_id query param defaults to platform-wide
    return { resolved: true, cpoId: null };
  }

  res.status(403).json({
    success: false,
    error: {
      code: 'OPERATOR_ROLE_REQUIRED',
      message: 'Access denied. Operator role is required for this endpoint.',
    },
  });
  return { resolved: false };
}

/**
 * GET /api/v1/operator/overview
 */
export async function getOverviewHandler(req, res, next) {
  try {
    const { resolved, cpoId } = await resolveCpoScope(req, res);
    if (!resolved) return;

    const period = req.query.period || '30d';
    if (!ALLOWED_PERIODS.includes(period)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PERIOD',
          message: `Invalid reporting period '${period}'. Allowed values: ${ALLOWED_PERIODS.join(', ')}.`,
        },
      });
    }

    const data = await operatorService.getOperatorOverview({ cpoId, period });
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/operator/stations
 */
export async function getStationsHandler(req, res, next) {
  try {
    const { resolved, cpoId } = await resolveCpoScope(req, res);
    if (!resolved) return;

    let page = 1;
    if (req.query.page !== undefined) {
      page = parseInt(req.query.page, 10);
      if (Number.isNaN(page) || page < 1) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PAGINATION', message: "'page' must be an integer greater than or equal to 1." },
        });
      }
    }

    let limit = 10;
    if (req.query.limit !== undefined) {
      limit = parseInt(req.query.limit, 10);
      if (Number.isNaN(limit) || limit < 1 || limit > 50) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PAGINATION', message: "'limit' must be between 1 and 50." },
        });
      }
    }

    const status = req.query.status || 'all';
    const search = req.query.search || null;

    if (!ALLOWED_STATION_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Invalid station status '${status}'. Allowed values: ${ALLOWED_STATION_STATUSES.join(', ')}.`,
        },
      });
    }

    const result = await operatorService.getOperatorStations({
      cpoId,
      page,
      limit,
      status,
      search,
    });

    return res.status(200).json({
      success: true,
      data: result.stations,
      meta: result.pagination,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/operator/sessions
 */
export async function getSessionsHandler(req, res, next) {
  try {
    const { resolved, cpoId } = await resolveCpoScope(req, res);
    if (!resolved) return;

    let page = 1;
    if (req.query.page !== undefined) {
      page = parseInt(req.query.page, 10);
      if (Number.isNaN(page) || page < 1) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PAGINATION', message: "'page' must be an integer greater than or equal to 1." },
        });
      }
    }

    let limit = 20;
    if (req.query.limit !== undefined) {
      limit = parseInt(req.query.limit, 10);
      if (Number.isNaN(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PAGINATION', message: "'limit' must be between 1 and 100." },
        });
      }
    }

    const status = req.query.status || 'all';
    const stationId = req.query.station_id || null;

    if (!ALLOWED_SESSION_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Invalid session status '${status}'. Allowed values: ${ALLOWED_SESSION_STATUSES.join(', ')}.`,
        },
      });
    }
    if (stationId && !UUID_REGEX.test(stationId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: "'station_id' must be a valid UUID." },
      });
    }

    const result = await operatorService.getOperatorSessions({
      cpoId,
      page,
      limit,
      status,
      stationId,
    });

    return res.status(200).json({
      success: true,
      data: result.sessions,
      meta: result.pagination,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/operator/analytics
 */
export async function getAnalyticsHandler(req, res, next) {
  try {
    const { resolved, cpoId } = await resolveCpoScope(req, res);
    if (!resolved) return;

    const period = req.query.period || '7d';
    if (!ALLOWED_PERIODS.includes(period)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PERIOD',
          message: `Invalid analytics period '${period}'. Allowed values: ${ALLOWED_PERIODS.join(', ')}.`,
        },
      });
    }

    const result = await operatorService.getOperatorAnalytics({
      cpoId,
      period,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
