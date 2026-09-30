/**
 * src/controllers/sessionController.js
 *
 * HTTP handlers for VahanGrid charging session lifecycle.
 *
 * Security & Authorization:
 *   - All handlers rely on req.user.id set by the authenticate middleware.
 *   - user_id is NEVER read from request body, query parameters, or URL params.
 *   - Cross-user access (reading or stopping another user's session) returns
 *     SESSION_NOT_FOUND (404) or VEHICLE_NOT_OWNED (403) to prevent IDOR
 *     and resource enumeration.
 */

import * as sessionService from '../services/sessionService.js';

// UUID validation regex (matches standard 8-4-4-4-12 hex UUIDs)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * POST /api/v1/sessions/start
 *
 * Start a charging session for the authenticated user.
 * Validates vehicle ownership, connector existence/hierarchy, connector availability,
 * and ensures no active sessions conflict.
 */
export async function startSessionHandler(req, res, next) {
  try {
    const { connector_id, vehicle_id } = req.body || {};

    // 1. Validate required fields
    if (!connector_id || !vehicle_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'connector_id and vehicle_id are required.',
        },
      });
    }

    // 2. Validate UUID formats
    if (!isValidUUID(connector_id) || !isValidUUID(vehicle_id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_UUID',
          message: 'connector_id and vehicle_id must be valid UUIDs.',
        },
      });
    }

    // 3. Verify vehicle existence and ownership
    const vehicle = await sessionService.getVehicleOwnership(vehicle_id);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'VEHICLE_NOT_FOUND',
          message: 'Vehicle not found.',
        },
      });
    }

    if (vehicle.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'VEHICLE_NOT_OWNED',
          message: 'You do not own this vehicle.',
        },
      });
    }

    // 4. Verify connector existence, hierarchy, and availability
    const connInfo = await sessionService.getConnectorHierarchy(connector_id);
    if (!connInfo.exists) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CONNECTOR_NOT_FOUND',
          message: 'Connector not found.',
        },
      });
    }

    if (!connInfo.inHierarchy) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CONNECTOR_HIERARCHY_INVALID',
          message: 'Connector is not properly linked to an EVSE or station.',
        },
      });
    }

    if (connInfo.status !== 'available') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONNECTOR_UNAVAILABLE',
          message: `Connector is not available (current status: ${connInfo.status}).`,
        },
      });
    }

    // 5. Start session (atomic with row locks)
    const session = await sessionService.startSession(req.user.id, connector_id, vehicle_id);
    return res.status(201).json({
      success: true,
      data: session,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'SESSION_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * GET /api/v1/sessions/active
 *
 * Return the authenticated user's current active charging session (or null if none).
 */
export async function getActiveSessionHandler(req, res, next) {
  try {
    const session = await sessionService.getActiveSession(req.user.id);
    return res.status(200).json({
      success: true,
      data: session, // null if no active session
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/sessions
 *
 * List all charging sessions for the authenticated user, newest first.
 */
export async function listSessionsHandler(req, res, next) {
  try {
    const sessions = await sessionService.getSessionsByUser(req.user.id);
    return res.status(200).json({
      success: true,
      data: sessions,
      meta: {
        count: sessions.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/sessions/:id
 *
 * Get a single charging session by ID.
 * Returns 404 if not found OR if owned by a different user.
 */
export async function getSessionHandler(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_UUID',
          message: 'Invalid session ID format.',
        },
      });
    }

    const session = await sessionService.getSessionById(id, req.user.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found.',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: session,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/sessions/:id/stop
 *
 * Stop an active charging session owned by the authenticated user.
 */
export async function stopSessionHandler(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_UUID',
          message: 'Invalid session ID format.',
        },
      });
    }

    const session = await sessionService.stopSession(id, req.user.id);
    return res.status(200).json({
      success: true,
      data: session,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'SESSION_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * GET /api/v1/sessions/:id/telemetry
 *
 * Return historical time-series telemetry curve for a session owned by the authenticated user.
 */
export async function getSessionTelemetryHandler(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_UUID',
          message: 'Invalid session ID format.',
        },
      });
    }

    const telemetry = await sessionService.getSessionTelemetry(id, req.user.id);
    return res.status(200).json({
      success: true,
      data: telemetry,
      meta: {
        session_id: id,
        count: telemetry.length,
      },
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'SESSION_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

