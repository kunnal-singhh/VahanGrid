/**
 * src/middleware/authorize.js
 *
 * Role-Based Access Control (RBAC) and Tenant Authorization Middleware.
 *
 * Responsibilities:
 *  1. requireRole(...allowedRoles):
 *     Ensures authenticated user has one of the specified roles.
 *  2. requireOperator:
 *     Requires role === 'operator' (with valid cpo_id) or role === 'admin'.
 *     Fails closed (403 OPERATOR_CPO_REQUIRED) if an operator has no cpo_id.
 *  3. requireStationOperator:
 *     Ensures the authenticated actor is authorized to manage the specific station.
 *     - If operator: validates station.cpo_id matches req.user.cpo_id.
 *     - If admin: allowed for all stations.
 *     - If driver: 403 OPERATOR_ROLE_REQUIRED.
 *     - If station not found: 404 STATION_NOT_FOUND.
 *  4. requireTariffOperator:
 *     Ensures the authenticated actor is authorized to manage tariffs.
 *     - For creation: enforces cpo_id === req.user.cpo_id. Prevents client-supplied cpo_id override.
 *     - For mutation (patch/delete): verifies target tariff belongs to req.user.cpo_id.
 */

import { getStationById } from '../services/stationService.js';
import { getTariffById } from '../services/tariffService.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Require the authenticated user to have one of the specified roles.
 * Must be preceded by `authenticate` middleware.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required. Please log in.',
        },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_ROLE',
          message: `Access denied. Required role: ${allowedRoles.join(', ')}.`,
        },
      });
    }

    next();
  };
}

/**
 * Require operator privileges.
 * Allows 'operator' (with non-null cpo_id) or 'admin'.
 * Rejects drivers with 403 OPERATOR_ROLE_REQUIRED.
 * Fails closed with 403 OPERATOR_CPO_REQUIRED if operator has no cpo_id.
 */
export function requireOperator(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required. Please log in.',
      },
    });
  }

  const { role, cpo_id } = req.user;

  if (role === 'admin') {
    req.cpo_id = cpo_id || null;
    return next();
  }

  if (role !== 'operator') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'OPERATOR_ROLE_REQUIRED',
        message: 'Access denied. Operator role is required for this management operation.',
      },
    });
  }

  // Fail closed if operator lacks CPO association
  if (!cpo_id) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'OPERATOR_CPO_REQUIRED',
        message: 'Operator account is not associated with an authorized Charge Point Operator (CPO).',
      },
    });
  }

  req.cpo_id = cpo_id;
  next();
}

/**
 * Require the operator to own/manage the specific station identified by req.params.id.
 * Must be preceded by `authenticate`.
 */
export async function requireStationOperator(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required. Please log in.',
        },
      });
    }

    const { role, cpo_id } = req.user;

    // Reject drivers immediately
    if (role !== 'operator' && role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'OPERATOR_ROLE_REQUIRED',
          message: 'Access denied. Operator role is required to manage charging stations.',
        },
      });
    }

    const { id } = req.params;
    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'The requested station ID must be a valid UUID.',
        },
      });
    }

    // Fail closed if operator has no CPO
    if (role === 'operator' && !cpo_id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'OPERATOR_CPO_REQUIRED',
          message: 'Operator account is not associated with an authorized Charge Point Operator (CPO).',
        },
      });
    }

    const station = await getStationById(id);
    if (!station) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'STATION_NOT_FOUND',
          message: `Station with ID '${id}' was not found.`,
        },
      });
    }

    // If operator, enforce CPO tenancy
    const stationCpoId = station.cpo?.id || station.cpo_id;
    if (role === 'operator' && stationCpoId !== cpo_id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'CPO_ACCESS_DENIED',
          message: 'Access denied. You are not authorized to manage stations belonging to another Charge Point Operator.',
        },
      });
    }

    req.station = station;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Require operator authorization for tariff modifications.
 * Must be preceded by `authenticate`.
 */
export async function requireTariffOperator(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required. Please log in.',
        },
      });
    }

    const { role, cpo_id } = req.user;

    if (role !== 'operator' && role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'OPERATOR_ROLE_REQUIRED',
          message: 'Access denied. Operator role is required for tariff management.',
        },
      });
    }

    if (role === 'admin') {
      return next();
    }

    // Fail closed if operator lacks CPO
    if (!cpo_id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'OPERATOR_CPO_REQUIRED',
          message: 'Operator account is not associated with an authorized Charge Point Operator (CPO).',
        },
      });
    }

    // For POST /api/v1/tariffs (Create)
    if (req.method === 'POST') {
      // If client supplied a cpo_id in body, verify it matches the authenticated operator
      if (req.body?.cpo_id && req.body.cpo_id !== cpo_id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'CPO_ACCESS_DENIED',
            message: 'Access denied. You cannot create tariffs for another Charge Point Operator.',
          },
        });
      }

      // Enforce server-authoritative CPO: client cannot override
      req.body = req.body || {};
      req.body.cpo_id = cpo_id;

      // If location_id is provided, verify it belongs to this operator
      if (req.body.location_id) {
        const loc = await getStationById(req.body.location_id);
        if (!loc) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'STATION_NOT_FOUND',
              message: `Station '${req.body.location_id}' was not found.`,
            },
          });
        }
        const locCpoId = loc.cpo?.id || loc.cpo_id;
        if (locCpoId !== cpo_id) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'CPO_ACCESS_DENIED',
              message: 'Access denied. You cannot attach tariffs to a station belonging to another CPO.',
            },
          });
        }
      }

      return next();
    }

    // For PATCH / DELETE / GET by :id
    const { id } = req.params;
    if (id) {
      if (!UUID_REGEX.test(id)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ID', message: 'Tariff ID must be a valid UUID.' },
        });
      }

      const tariff = await getTariffById(id);
      if (!tariff) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TARIFF_NOT_FOUND',
            message: `Tariff with ID '${id}' was not found.`,
          },
        });
      }

      if (tariff.cpo_id !== cpo_id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'CPO_ACCESS_DENIED',
            message: 'Access denied. You cannot manage tariffs belonging to another Charge Point Operator.',
          },
        });
      }

      // Prevent switching tariff to another CPO on PATCH
      if (req.body?.cpo_id && req.body.cpo_id !== cpo_id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'CPO_ACCESS_DENIED',
            message: 'Access denied. You cannot reassign a tariff to another CPO.',
          },
        });
      }

      req.tariff = tariff;
    }

    next();
  } catch (err) {
    next(err);
  }
}
