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
const ALLOWED_SESSION_STATUSES = ['active', 'completed', 'stopped', 'pending', 'faulted', 'cancelled', 'all'];
const ALLOWED_SETTLEMENT_STATUSES = ['settled', 'pending', 'failed', 'none', 'all'];

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
    const settlementStatus = req.query.settlement_status || 'all';
    const startDate = req.query.from || req.query.start_date || null;
    const endDate = req.query.to || req.query.end_date || null;
    const search = req.query.search || null;

    if (!ALLOWED_SESSION_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Invalid session status '${status}'. Allowed values: ${ALLOWED_SESSION_STATUSES.join(', ')}.`,
        },
      });
    }

    if (!ALLOWED_SETTLEMENT_STATUSES.includes(settlementStatus)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Invalid settlement status '${settlementStatus}'. Allowed values: ${ALLOWED_SETTLEMENT_STATUSES.join(', ')}.`,
        },
      });
    }

    if (stationId && !UUID_REGEX.test(stationId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: "'station_id' must be a valid UUID." },
      });
    }

    if (startDate && isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATE', message: "'from' must be a valid ISO 8601 date string." },
      });
    }

    if (endDate && isNaN(new Date(endDate).getTime())) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATE', message: "'to' must be a valid ISO 8601 date string." },
      });
    }

    const result = await operatorService.getOperatorSessions({
      cpoId,
      page,
      limit,
      status,
      stationId,
      settlementStatus,
      startDate,
      endDate,
      search,
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
 * GET /api/v1/operator/sessions/:id
 * Retrieve single session details for operator audit with masked PII.
 */
export async function getSessionDetailHandler(req, res, next) {
  try {
    const { resolved, cpoId } = await resolveCpoScope(req, res);
    if (!resolved) return;

    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Session ID must be a valid UUID.' },
      });
    }

    const session = await operatorService.getOperatorSessionDetail(id, cpoId, req.user.role === 'admin');
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: `Session with ID '${id}' was not found.` },
      });
    }

    return res.status(200).json({
      success: true,
      data: session,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: { code: err.code || 'SESSION_ERROR', message: err.message },
      });
    }
    next(err);
  }
}

/**
 * POST /api/v1/operator/sessions/:id/remote-stop
 * Remotely stop an active session at an operator-owned station.
 */
export async function operatorRemoteStopHandler(req, res, next) {
  try {
    const { resolved, cpoId } = await resolveCpoScope(req, res);
    if (!resolved) return;

    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Session ID must be a valid UUID.' },
      });
    }

    const timeoutMs = req.body?.timeoutMs ? parseInt(req.body.timeoutMs, 10) : 10000;
    const result = await operatorService.operatorRemoteStopSession(id, {
      cpoId,
      isAdmin: req.user.role === 'admin',
      timeoutMs,
    });

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Remote stop executed successfully.',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: { code: err.code || 'REMOTE_STOP_ERROR', message: err.message },
      });
    }
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

/**
 * GET /api/v1/operator/stations/:id
 *
 * Fetch full detail for a single station. Requires the station to belong to the
 * operator's CPO. Admins may fetch any station. requireStationOperator middleware
 * has already loaded and ownership-verified the station; we re-fetch for the full
 * EVSE/connector payload from the operator service.
 */
export async function getStationDetailHandler(req, res, next) {
  try {
    const { id } = req.params;

    // requireStationOperator has already validated ownership and set req.station.
    // Use the station's own cpo_id so the service scoped query passes correctly.
    const scopedCpoId = req.user.role === 'admin' ? null : req.user.cpo_id;

    const station = await operatorService.getStationDetail(id, scopedCpoId);
    if (!station) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'STATION_NOT_FOUND',
          message: `Station with ID '${id}' was not found or does not belong to your network.`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: station,
    });
  } catch (err) {
    next(err);
  }
}

// Allowed station status values (mirrors the DB CHECK constraint in locations table)
const ALLOWED_LOCATION_STATUSES = ['active', 'inactive', 'under_construction', 'planned', 'decommissioned'];

// Immutable / ownership fields operators must never change
const IMMUTABLE_FIELDS = ['id', 'cpo_id', 'source_type', 'source_id', 'last_verified_at', 'created_at', 'updated_at', 'country_code'];

/**
 * PATCH /api/v1/operator/stations/:id
 *
 * Update mutable metadata for a station the operator owns.
 * requireStationOperator middleware has already verified CPO ownership.
 * This handler validates every accepted field individually then delegates
 * to operatorService.updateStation which enforces a safe allowlist.
 */
export async function updateStationHandler(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    // Block any attempt to override immutable / ownership fields
    for (const field of IMMUTABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'IMMUTABLE_FIELD',
            message: `Field '${field}' is immutable and cannot be changed.`,
          },
        });
      }
    }

    // Collect validated fields
    const fields = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0 || body.name.trim().length > 255) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FIELD', message: "'name' must be a non-empty string up to 255 characters." },
        });
      }
      fields.name = body.name.trim();
    }

    if (body.address_line1 !== undefined) {
      if (typeof body.address_line1 !== 'string' || body.address_line1.trim().length === 0 || body.address_line1.trim().length > 255) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FIELD', message: "'address_line1' must be a non-empty string up to 255 characters." },
        });
      }
      fields.address_line1 = body.address_line1.trim();
    }

    if (body.address_line2 !== undefined) {
      if (body.address_line2 !== null && (typeof body.address_line2 !== 'string' || body.address_line2.length > 255)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FIELD', message: "'address_line2' must be a string up to 255 characters or null." },
        });
      }
      fields.address_line2 = body.address_line2 === null ? null : body.address_line2.trim();
    }

    if (body.city !== undefined) {
      if (typeof body.city !== 'string' || body.city.trim().length === 0 || body.city.trim().length > 100) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FIELD', message: "'city' must be a non-empty string up to 100 characters." },
        });
      }
      fields.city = body.city.trim();
    }

    if (body.state !== undefined) {
      if (typeof body.state !== 'string' || body.state.trim().length === 0 || body.state.trim().length > 100) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FIELD', message: "'state' must be a non-empty string up to 100 characters." },
        });
      }
      fields.state = body.state.trim();
    }

    if (body.postal_code !== undefined) {
      if (body.postal_code !== null && (typeof body.postal_code !== 'string' || body.postal_code.length > 20)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FIELD', message: "'postal_code' must be a string up to 20 characters or null." },
        });
      }
      fields.postal_code = body.postal_code === null ? null : body.postal_code.trim();
    }

    if (body.timezone !== undefined) {
      if (typeof body.timezone !== 'string' || body.timezone.trim().length === 0 || body.timezone.trim().length > 50) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FIELD', message: "'timezone' must be a non-empty string up to 50 characters (e.g. 'Asia/Kolkata')." },
        });
      }
      fields.timezone = body.timezone.trim();
    }

    if (body.latitude !== undefined) {
      const lat = parseFloat(body.latitude);
      if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FIELD', message: "'latitude' must be a number between -90 and 90." },
        });
      }
      fields.latitude = lat;
    }

    if (body.longitude !== undefined) {
      const lng = parseFloat(body.longitude);
      if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FIELD', message: "'longitude' must be a number between -180 and 180." },
        });
      }
      fields.longitude = lng;
    }

    if (body.status !== undefined) {
      if (!ALLOWED_LOCATION_STATUSES.includes(body.status)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FIELD',
            message: `'status' must be one of: ${ALLOWED_LOCATION_STATUSES.join(', ')}.`,
          },
        });
      }
      fields.status = body.status;
    }

    // Require lat & lng to be updated together (PostGIS geometry consistency)
    const hasLat = Object.prototype.hasOwnProperty.call(fields, 'latitude');
    const hasLng = Object.prototype.hasOwnProperty.call(fields, 'longitude');
    if (hasLat !== hasLng) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FIELD',
          message: "'latitude' and 'longitude' must be updated together.",
        },
      });
    }

    const updated = await operatorService.updateStation(id, fields);
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'STATION_NOT_FOUND',
          message: `Station with ID '${id}' was not found.`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}
