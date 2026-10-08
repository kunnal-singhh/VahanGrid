/**
 * backend/src/services/tariffService.js
 *
 * Tariff Management and Resolution Service for VahanGrid (Phase 3E.1).
 *
 * Responsibilities:
 *  1. CRUD operations for EV charging tariffs.
 *  2. Multi-tier hierarchical resolution:
 *     Priority 1: Connector-specific tariff
 *     Priority 2: EVSE-specific tariff
 *     Priority 3: Station/Location-specific tariff
 *     Priority 4: CPO-wide default tariff
 *     Priority 5: Global fallback tariff
 *  3. Time-based validity checks (valid_from <= timestamp <= valid_to) and active status filtering.
 *  4. Strict input validation (prices >= 0, valid ISO dates, 18% standard GST default).
 */

import { query } from '../config/database.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(val) {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

/**
 * Validates tariff creation/update inputs.
 *
 * @param {object} data
 * @param {boolean} [isUpdate=false]
 */
export function validateTariffInput(data, isUpdate = false) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const err = new Error('Tariff payload must be an object.');
    err.statusCode = 400;
    err.code = 'INVALID_PAYLOAD';
    throw err;
  }

  // Name
  if (!isUpdate || data.name !== undefined) {
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      const err = new Error("Tariff 'name' is required and must be a non-empty string.");
      err.statusCode = 400;
      err.code = 'INVALID_NAME';
      throw err;
    }
  }

  // Currency
  if (data.currency !== undefined) {
    if (typeof data.currency !== 'string' || data.currency.trim().length !== 3) {
      const err = new Error("Tariff 'currency' must be a 3-letter currency code (e.g. 'INR').");
      err.statusCode = 400;
      err.code = 'INVALID_CURRENCY';
      throw err;
    }
  }

  // Price per kWh
  if (data.price_per_kwh !== undefined) {
    const p = Number(data.price_per_kwh);
    if (!Number.isFinite(p) || p < 0) {
      const err = new Error("'price_per_kwh' must be a non-negative number.");
      err.statusCode = 400;
      err.code = 'INVALID_PRICE_KWH';
      throw err;
    }
  }

  // Session fee
  if (data.session_fee !== undefined) {
    const f = Number(data.session_fee);
    if (!Number.isFinite(f) || f < 0) {
      const err = new Error("'session_fee' must be a non-negative number.");
      err.statusCode = 400;
      err.code = 'INVALID_SESSION_FEE';
      throw err;
    }
  }

  // Price per minute
  if (data.price_per_minute !== undefined) {
    const m = Number(data.price_per_minute);
    if (!Number.isFinite(m) || m < 0) {
      const err = new Error("'price_per_minute' must be a non-negative number.");
      err.statusCode = 400;
      err.code = 'INVALID_PRICE_MINUTE';
      throw err;
    }
  }

  // Idle fee per minute
  if (data.idle_fee_per_minute !== undefined) {
    const idl = Number(data.idle_fee_per_minute);
    if (!Number.isFinite(idl) || idl < 0) {
      const err = new Error("'idle_fee_per_minute' must be a non-negative number.");
      err.statusCode = 400;
      err.code = 'INVALID_IDLE_FEE';
      throw err;
    }
  }

  // Grace period
  if (data.grace_period_minutes !== undefined) {
    const g = Number(data.grace_period_minutes);
    if (!Number.isInteger(g) || g < 0) {
      const err = new Error("'grace_period_minutes' must be a non-negative integer.");
      err.statusCode = 400;
      err.code = 'INVALID_GRACE_PERIOD';
      throw err;
    }
  }

  // Tax rate
  if (data.tax_rate !== undefined) {
    const t = Number(data.tax_rate);
    if (!Number.isFinite(t) || t < 0 || t > 1.0) {
      const err = new Error("'tax_rate' must be a fraction between 0.00 and 1.00 (e.g. 0.18 for 18% GST).");
      err.statusCode = 400;
      err.code = 'INVALID_TAX_RATE';
      throw err;
    }
  }

  // Date range
  let fromDate = null;
  let toDate = null;

  if (data.valid_from !== undefined && data.valid_from !== null) {
    fromDate = new Date(data.valid_from);
    if (isNaN(fromDate.getTime())) {
      const err = new Error("'valid_from' must be a valid ISO 8601 date string.");
      err.statusCode = 400;
      err.code = 'INVALID_DATE';
      throw err;
    }
  }

  if (data.valid_to !== undefined && data.valid_to !== null) {
    toDate = new Date(data.valid_to);
    if (isNaN(toDate.getTime())) {
      const err = new Error("'valid_to' must be a valid ISO 8601 date string.");
      err.statusCode = 400;
      err.code = 'INVALID_DATE';
      throw err;
    }
  }

  if (fromDate && toDate && toDate < fromDate) {
    const err = new Error("'valid_to' cannot be earlier than 'valid_from'.");
    err.statusCode = 400;
    err.code = 'INVALID_DATE_RANGE';
    throw err;
  }
}

/**
 * Creates a new tariff in the database.
 *
 * @param {object} params
 * @returns {Promise<object>} Created tariff row
 */
export async function createTariff(params) {
  validateTariffInput(params, false);

  const {
    name,
    description = null,
    cpo_id = null,
    location_id = null,
    evse_id = null,
    connector_id = null,
    currency = 'INR',
    price_per_kwh = 0.0000,
    session_fee = 0.00,
    price_per_minute = 0.0000,
    idle_fee_per_minute = 0.0000,
    grace_period_minutes = 0,
    tax_rate = 0.1800,
    is_active = true,
    valid_from = new Date(),
    valid_to = null,
  } = params;

  // Validate UUID scopes if provided
  if (cpo_id) {
    if (!isValidUUID(cpo_id)) {
      const err = new Error("Invalid 'cpo_id' UUID.");
      err.statusCode = 400;
      err.code = 'INVALID_CPO_ID';
      throw err;
    }
    const cpoCheck = await query('SELECT id FROM cpos WHERE id = $1', [cpo_id]);
    if (cpoCheck.rows.length === 0) {
      const err = new Error(`CPO with ID '${cpo_id}' was not found.`);
      err.statusCode = 404;
      err.code = 'CPO_NOT_FOUND';
      throw err;
    }
  }

  if (location_id) {
    if (!isValidUUID(location_id)) {
      const err = new Error("Invalid 'location_id' UUID.");
      err.statusCode = 400;
      err.code = 'INVALID_LOCATION_ID';
      throw err;
    }
    const locCheck = await query('SELECT id FROM locations WHERE id = $1', [location_id]);
    if (locCheck.rows.length === 0) {
      const err = new Error(`Station with ID '${location_id}' was not found.`);
      err.statusCode = 404;
      err.code = 'STATION_NOT_FOUND';
      throw err;
    }
  }

  if (evse_id) {
    if (!isValidUUID(evse_id)) {
      const err = new Error("Invalid 'evse_id' UUID.");
      err.statusCode = 400;
      err.code = 'INVALID_EVSE_ID';
      throw err;
    }
    const evseCheck = await query('SELECT id FROM evses WHERE id = $1', [evse_id]);
    if (evseCheck.rows.length === 0) {
      const err = new Error(`EVSE with ID '${evse_id}' was not found.`);
      err.statusCode = 404;
      err.code = 'EVSE_NOT_FOUND';
      throw err;
    }
  }

  if (connector_id) {
    if (!isValidUUID(connector_id)) {
      const err = new Error("Invalid 'connector_id' UUID.");
      err.statusCode = 400;
      err.code = 'INVALID_CONNECTOR_ID';
      throw err;
    }
    const connCheck = await query('SELECT id FROM connectors WHERE id = $1', [connector_id]);
    if (connCheck.rows.length === 0) {
      const err = new Error(`Connector with ID '${connector_id}' was not found.`);
      err.statusCode = 404;
      err.code = 'CONNECTOR_NOT_FOUND';
      throw err;
    }
  }

  const result = await query(
    `INSERT INTO tariffs (
       name, description, cpo_id, location_id, evse_id, connector_id,
       currency, price_per_kwh, session_fee, price_per_minute, idle_fee_per_minute,
       grace_period_minutes, tax_rate, is_active, valid_from, valid_to
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
     ) RETURNING *`,
    [
      name.trim(),
      description,
      cpo_id,
      location_id,
      evse_id,
      connector_id,
      currency.toUpperCase(),
      Number(price_per_kwh),
      Number(session_fee),
      Number(price_per_minute),
      Number(idle_fee_per_minute),
      parseInt(grace_period_minutes, 10),
      Number(tax_rate),
      Boolean(is_active),
      valid_from,
      valid_to,
    ]
  );

  return result.rows[0];
}

/**
 * Retrieves a tariff by its UUID.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getTariffById(id) {
  if (!isValidUUID(id)) {
    const err = new Error('Tariff ID must be a valid UUID.');
    err.statusCode = 400;
    err.code = 'INVALID_ID';
    throw err;
  }

  const result = await query(
    `SELECT t.*,
            l.name AS location_name,
            c.name AS cpo_name
     FROM tariffs t
     LEFT JOIN locations l ON t.location_id = l.id
     LEFT JOIN cpos c      ON t.cpo_id = c.id
     WHERE t.id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

/**
 * Lists tariffs with optional filtering.
 *
 * @param {object} [filters={}]
 * @returns {Promise<Array<object>>}
 */
export async function listTariffs(filters = {}) {
  const conditions = [];
  const values = [];

  if (filters.location_id) {
    if (!isValidUUID(filters.location_id)) {
      const err = new Error("Invalid 'location_id' UUID filter.");
      err.statusCode = 400;
      err.code = 'INVALID_ID';
      throw err;
    }
    values.push(filters.location_id);
    conditions.push(`t.location_id = $${values.length}`);
  }

  if (filters.cpo_id) {
    if (!isValidUUID(filters.cpo_id)) {
      const err = new Error("Invalid 'cpo_id' UUID filter.");
      err.statusCode = 400;
      err.code = 'INVALID_ID';
      throw err;
    }
    values.push(filters.cpo_id);
    conditions.push(`t.cpo_id = $${values.length}`);
  }

  if (filters.is_active !== undefined) {
    values.push(filters.is_active === true || filters.is_active === 'true');
    conditions.push(`t.is_active = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT t.*,
            l.name AS location_name,
            c.name AS cpo_name
     FROM tariffs t
     LEFT JOIN locations l ON t.location_id = l.id
     LEFT JOIN cpos c      ON t.cpo_id = c.id
     ${whereClause}
     ORDER BY t.created_at DESC`,
    values
  );

  return result.rows;
}

/**
 * Updates an existing tariff.
 *
 * @param {string} id
 * @param {object} updates
 * @returns {Promise<object>} Updated tariff row
 */
export async function updateTariff(id, updates = {}) {
  if (!isValidUUID(id)) {
    const err = new Error('Tariff ID must be a valid UUID.');
    err.statusCode = 400;
    err.code = 'INVALID_ID';
    throw err;
  }

  const existing = await getTariffById(id);
  if (!existing) {
    const err = new Error(`Tariff with ID '${id}' was not found.`);
    err.statusCode = 404;
    err.code = 'TARIFF_NOT_FOUND';
    throw err;
  }

  validateTariffInput(updates, true);

  const fields = [];
  const values = [];

  const updateable = [
    'name', 'description', 'currency', 'price_per_kwh', 'session_fee',
    'price_per_minute', 'idle_fee_per_minute', 'grace_period_minutes',
    'tax_rate', 'is_active', 'valid_from', 'valid_to'
  ];

  updateable.forEach((col) => {
    if (updates[col] !== undefined) {
      values.push(updates[col]);
      fields.push(`${col} = $${values.length}`);
    }
  });

  if (fields.length === 0) {
    return existing;
  }

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const result = await query(
    `UPDATE tariffs
     SET ${fields.join(', ')}
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Deactivates or soft-deletes a tariff.
 *
 * @param {string} id
 * @returns {Promise<object>} Deactivated tariff row
 */
export async function deactivateTariff(id) {
  return await updateTariff(id, { is_active: false });
}

/**
 * Deletes a tariff if unreferenced, or deactivates it if historical sessions reference it.
 *
 * @param {string} id
 * @returns {Promise<{deleted: boolean, deactivated: boolean}>}
 */
export async function deleteTariff(id) {
  if (!isValidUUID(id)) {
    const err = new Error('Tariff ID must be a valid UUID.');
    err.statusCode = 400;
    err.code = 'INVALID_ID';
    throw err;
  }

  const existing = await getTariffById(id);
  if (!existing) {
    const err = new Error(`Tariff with ID '${id}' was not found.`);
    err.statusCode = 404;
    err.code = 'TARIFF_NOT_FOUND';
    throw err;
  }

  // Check if historical sessions reference this tariff
  const sessionRef = await query('SELECT id FROM charging_sessions WHERE tariff_id = $1 LIMIT 1', [id]);
  if (sessionRef.rows.length > 0) {
    await query('UPDATE tariffs SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
    return { deleted: false, deactivated: true, message: 'Tariff has historical session references; deactivated instead of deleted.' };
  }

  await query('DELETE FROM tariffs WHERE id = $1', [id]);
  return { deleted: true, deactivated: false, message: 'Tariff deleted successfully.' };
}

/**
 * Hierarchically resolves the active applicable tariff for a charging target.
 *
 * Precedence hierarchy:
 *  1. Connector-level: connector_id matching
 *  2. EVSE-level: evse_id matching
 *  3. Station/Location-level: location_id matching
 *  4. CPO-level: cpo_id matching (with no location/evse/connector specified)
 *  5. Global fallback: all scope pointers NULL
 *
 * @param {object} scope
 * @param {string} [scope.connector_id]
 * @param {string} [scope.evse_id]
 * @param {string} [scope.location_id]
 * @param {string} [scope.cpo_id]
 * @param {Date|string} [scope.timestamp=new Date()]
 * @returns {Promise<object|null>} Resolved tariff row or null
 */
export async function resolveApplicableTariff({ connector_id, evse_id, location_id, cpo_id, timestamp = new Date() } = {}) {
  const ts = new Date(timestamp);
  const validTs = isNaN(ts.getTime()) ? new Date() : ts;

  const result = await query(
    `SELECT t.*
     FROM tariffs t
     WHERE t.is_active = true
       AND t.valid_from <= $1
       AND (t.valid_to IS NULL OR t.valid_to >= $1)
       AND (
            (t.connector_id IS NOT NULL AND t.connector_id = $2)
         OR (t.evse_id IS NOT NULL AND t.evse_id = $3)
         OR (t.location_id IS NOT NULL AND t.location_id = $4)
         OR (t.cpo_id IS NOT NULL AND t.cpo_id = $5 AND t.location_id IS NULL AND t.evse_id IS NULL AND t.connector_id IS NULL)
         OR (t.connector_id IS NULL AND t.evse_id IS NULL AND t.location_id IS NULL AND t.cpo_id IS NULL)
       )
     ORDER BY
       CASE
         WHEN t.connector_id IS NOT NULL AND t.connector_id = $2 THEN 1
         WHEN t.evse_id IS NOT NULL AND t.evse_id = $3           THEN 2
         WHEN t.location_id IS NOT NULL AND t.location_id = $4   THEN 3
         WHEN t.cpo_id IS NOT NULL AND t.cpo_id = $5             THEN 4
         ELSE 5
       END ASC,
       t.created_at DESC
     LIMIT 1`,
    [
      validTs,
      connector_id || null,
      evse_id || null,
      location_id || null,
      cpo_id || null,
    ]
  );

  return result.rows[0] || null;
}
