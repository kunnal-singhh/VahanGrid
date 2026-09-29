/**
 * src/controllers/vehicleController.js
 *
 * HTTP handlers for VahanGrid vehicle management.
 *
 * Authorization: all handlers use req.user.id (from authenticate middleware).
 * The user_id is never read from the request body, query string, or path params.
 *
 * Connector type is validated against known standards used in India.
 * Note: vehicles.connector_type is VARCHAR(50) with no DB CHECK constraint —
 * the allowed-list is enforced here at the API layer.
 */

import * as vehicleService from '../services/vehicleService.js';

// UUID regex — matches any 8-4-4-4-12 hex UUID
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Known connector type values accepted by this API.
 * Derived from standards common in India + global EVs.
 * vehicles.connector_type has no DB CHECK — this is API-layer enforcement only.
 */
const VALID_CONNECTOR_TYPES = [
  'CCS2', 'CCS1', 'CHAdeMO',
  'Type2', 'Type1',
  'Bharat DC-001', 'Bharat AC-001',
  'GBT_AC', 'GBT_DC',
];

function isValidUUID(id) {
  return UUID_REGEX.test(id);
}

function isPositiveNumber(val) {
  return typeof val === 'number' && isFinite(val) && val > 0;
}

function isNonNegativeNumber(val) {
  return typeof val === 'number' && isFinite(val) && val >= 0;
}

/**
 * Validate vehicle creation/update payload.
 * Returns array of error strings (empty = valid).
 * @param {object} body
 * @param {boolean} isCreate  True for POST, false for PATCH (partial is ok)
 */
function validateVehicleFields(body, isCreate) {
  const errors = [];

  const {
    manufacturer, model, variant,
    battery_capacity_kwh, usable_battery_capacity_kwh,
    connector_type,
    max_ac_power_kw, max_dc_power_kw,
  } = body;

  if (isCreate || manufacturer !== undefined) {
    if (!manufacturer || typeof manufacturer !== 'string' || !manufacturer.trim()) {
      errors.push('manufacturer is required and must be a non-empty string.');
    }
  }

  if (isCreate || model !== undefined) {
    if (!model || typeof model !== 'string' || !model.trim()) {
      errors.push('model is required and must be a non-empty string.');
    }
  }

  if (variant !== undefined && variant !== null) {
    if (typeof variant !== 'string') errors.push('variant must be a string.');
  }

  if (isCreate || battery_capacity_kwh !== undefined) {
    if (!isPositiveNumber(battery_capacity_kwh)) {
      errors.push('battery_capacity_kwh must be a positive number greater than 0.');
    }
  }

  if (usable_battery_capacity_kwh !== undefined && usable_battery_capacity_kwh !== null) {
    if (!isPositiveNumber(usable_battery_capacity_kwh)) {
      errors.push('usable_battery_capacity_kwh must be a positive number when provided.');
    } else if (
      battery_capacity_kwh !== undefined &&
      usable_battery_capacity_kwh > battery_capacity_kwh
    ) {
      errors.push('usable_battery_capacity_kwh must not exceed battery_capacity_kwh.');
    }
  }

  if (isCreate || connector_type !== undefined) {
    if (!connector_type || typeof connector_type !== 'string') {
      errors.push('connector_type is required.');
    } else if (!VALID_CONNECTOR_TYPES.includes(connector_type)) {
      errors.push(
        `connector_type must be one of: ${VALID_CONNECTOR_TYPES.join(', ')}.`
      );
    }
  }

  if (max_ac_power_kw !== undefined && max_ac_power_kw !== null) {
    if (!isNonNegativeNumber(max_ac_power_kw)) {
      errors.push('max_ac_power_kw must be a non-negative number when provided.');
    }
  }

  if (max_dc_power_kw !== undefined && max_dc_power_kw !== null) {
    if (!isNonNegativeNumber(max_dc_power_kw)) {
      errors.push('max_dc_power_kw must be a non-negative number when provided.');
    }
  }

  return errors;
}

// ── Route handlers ────────────────────────────────────────────────────────────

/**
 * GET /api/v1/vehicles
 * List all vehicles belonging to the authenticated user.
 */
export async function listVehicles(req, res, next) {
  try {
    const vehicles = await vehicleService.getVehiclesByUser(req.user.id);
    return res.status(200).json({
      success: true,
      data: vehicles,
      meta: { count: vehicles.length },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/vehicles
 * Create a new vehicle for the authenticated user.
 */
export async function createVehicle(req, res, next) {
  try {
    const errors = validateVehicleFields(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid vehicle data.', details: errors },
      });
    }

    const vehicle = await vehicleService.createVehicle(req.user.id, req.body);
    return res.status(201).json({ success: true, data: vehicle });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
    }
    next(err);
  }
}

/**
 * GET /api/v1/vehicles/:id
 * Get a specific vehicle — only if it belongs to the authenticated user.
 */
export async function getVehicle(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Vehicle ID must be a valid UUID.' },
      });
    }

    const vehicle = await vehicleService.getVehicleById(id, req.user.id);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: { code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found.' },
      });
    }

    return res.status(200).json({ success: true, data: vehicle });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/vehicles/:id
 * Update allowed fields of a vehicle — only if it belongs to the authenticated user.
 */
export async function updateVehicle(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Vehicle ID must be a valid UUID.' },
      });
    }

    const errors = validateVehicleFields(req.body, false);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid vehicle data.', details: errors },
      });
    }

    // Build updates object from allowed fields only.
    const ALLOWED_FIELDS = [
      'manufacturer', 'model', 'variant',
      'battery_capacity_kwh', 'usable_battery_capacity_kwh',
      'connector_type', 'max_ac_power_kw', 'max_dc_power_kw',
    ];
    const updates = {};
    for (const field of ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_UPDATES',
          message: 'No updatable fields were provided.',
        },
      });
    }

    const vehicle = await vehicleService.updateVehicle(id, req.user.id, updates);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: { code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found.' },
      });
    }

    return res.status(200).json({ success: true, data: vehicle });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
    }
    next(err);
  }
}

/**
 * DELETE /api/v1/vehicles/:id
 * Delete a vehicle — only if it belongs to the authenticated user.
 */
export async function deleteVehicle(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Vehicle ID must be a valid UUID.' },
      });
    }

    const deleted = await vehicleService.deleteVehicle(id, req.user.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: { code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found.' },
      });
    }

    return res.status(200).json({
      success: true,
      data: null,
      meta: { message: 'Vehicle deleted successfully.' },
    });
  } catch (err) {
    next(err);
  }
}
