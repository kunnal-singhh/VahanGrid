/**
 * src/services/vehicleService.js
 *
 * Database access layer for VahanGrid vehicle management.
 *
 * Security contract enforced at this layer:
 *   - Every query that reads/writes a specific vehicle also filters by user_id.
 *   - This prevents IDOR: even if a controller bugs pass the wrong vehicle id,
 *     the query will return 0 rows if the vehicle does not belong to the user.
 *
 * All SQL is parameterized. No string concatenation with user input.
 */

import { query } from '../config/database.js';

/** Columns returned for every vehicle query. NUMERIC cast to float for JSON. */
const VEHICLE_FIELDS = `
  id,
  user_id,
  manufacturer,
  model,
  variant,
  battery_capacity_kwh::float       AS battery_capacity_kwh,
  usable_battery_capacity_kwh::float AS usable_battery_capacity_kwh,
  connector_type,
  max_ac_power_kw::float             AS max_ac_power_kw,
  max_dc_power_kw::float             AS max_dc_power_kw,
  created_at,
  updated_at
`;

/**
 * List all vehicles belonging to the authenticated user.
 *
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function getVehiclesByUser(userId) {
  const result = await query(
    `SELECT ${VEHICLE_FIELDS}
     FROM vehicles
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Get a single vehicle by ID, enforcing ownership.
 * Returns null if not found OR if the vehicle belongs to a different user.
 *
 * @param {string} vehicleId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getVehicleById(vehicleId, userId) {
  const result = await query(
    `SELECT ${VEHICLE_FIELDS}
     FROM vehicles
     WHERE id = $1 AND user_id = $2`,
    [vehicleId, userId]
  );
  return result.rows[0] || null;
}

/**
 * Create a new vehicle for a user.
 *
 * @param {string} userId
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createVehicle(userId, data) {
  const {
    manufacturer,
    model,
    variant = null,
    battery_capacity_kwh,
    usable_battery_capacity_kwh = null,
    connector_type,
    max_ac_power_kw = null,
    max_dc_power_kw = null,
  } = data;

  try {
    const result = await query(
      `INSERT INTO vehicles
         (user_id, manufacturer, model, variant,
          battery_capacity_kwh, usable_battery_capacity_kwh,
          connector_type, max_ac_power_kw, max_dc_power_kw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${VEHICLE_FIELDS}`,
      [
        userId,
        manufacturer,
        model,
        variant,
        battery_capacity_kwh,
        usable_battery_capacity_kwh,
        connector_type,
        max_ac_power_kw,
        max_dc_power_kw,
      ]
    );
    return result.rows[0];
  } catch (err) {
    // PostgreSQL check constraint violation
    if (err.code === '23514') {
      const constraint = err.constraint || '';
      let message = 'A database constraint was violated.';
      if (constraint.includes('battery_capacity')) {
        message = 'battery_capacity_kwh must be greater than 0.';
      } else if (constraint.includes('usable_battery')) {
        message = 'usable_battery_capacity_kwh must be > 0 and <= battery_capacity_kwh.';
      } else if (constraint.includes('max_ac')) {
        message = 'max_ac_power_kw must be >= 0.';
      } else if (constraint.includes('max_dc')) {
        message = 'max_dc_power_kw must be >= 0.';
      }
      const error = new Error(message);
      error.statusCode = 400;
      error.code = 'CONSTRAINT_VIOLATION';
      throw error;
    }
    throw err;
  }
}

/**
 * Update allowed fields of a vehicle, enforcing ownership.
 *
 * @param {string} vehicleId
 * @param {string} userId
 * @param {object} updates  Only updatable fields are processed.
 * @returns {Promise<object|null>} Updated vehicle, or null if not found/not owned.
 */
export async function updateVehicle(vehicleId, userId, updates) {
  const ALLOWED = [
    'manufacturer', 'model', 'variant',
    'battery_capacity_kwh', 'usable_battery_capacity_kwh',
    'connector_type', 'max_ac_power_kw', 'max_dc_power_kw',
  ];

  const setClauses = [];
  const values = [];
  let idx = 1;

  for (const field of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      setClauses.push(`${field} = $${idx}`);
      values.push(updates[field]);
      idx++;
    }
  }

  if (setClauses.length === 0) return null;

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

  // WHERE id AND user_id — ownership enforced at DB level
  values.push(vehicleId, userId);

  try {
    const result = await query(
      `UPDATE vehicles
       SET ${setClauses.join(', ')}
       WHERE id = $${idx} AND user_id = $${idx + 1}
       RETURNING ${VEHICLE_FIELDS}`,
      values
    );
    return result.rows[0] || null;
  } catch (err) {
    if (err.code === '23514') {
      const constraint = err.constraint || '';
      let message = 'A database constraint was violated.';
      if (constraint.includes('usable_battery')) {
        message = 'usable_battery_capacity_kwh must be > 0 and <= battery_capacity_kwh.';
      } else if (constraint.includes('battery_capacity')) {
        message = 'battery_capacity_kwh must be greater than 0.';
      }
      const error = new Error(message);
      error.statusCode = 400;
      error.code = 'CONSTRAINT_VIOLATION';
      throw error;
    }
    throw err;
  }
}

/**
 * Delete a vehicle, enforcing ownership.
 *
 * @param {string} vehicleId
 * @param {string} userId
 * @returns {Promise<boolean>} true if deleted, false if not found/not owned
 */
export async function deleteVehicle(vehicleId, userId) {
  const result = await query(
    `DELETE FROM vehicles
     WHERE id = $1 AND user_id = $2`,
    [vehicleId, userId]
  );
  return result.rowCount > 0;
}
