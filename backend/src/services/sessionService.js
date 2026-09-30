/**
 * src/services/sessionService.js
 *
 * Database access layer for VahanGrid charging session lifecycle.
 *
 * Security contract enforced here:
 *   - Every session query is scoped by user_id = authenticated user.
 *   - Connector availability is checked inside a serializable transaction
 *     with a row-level lock (SELECT ... FOR UPDATE) so two concurrent
 *     start requests for the same connector cannot both succeed.
 *   - On start: sets charging_sessions.status = 'active' and connectors.status = 'charging'.
 *   - On stop: sets charging_sessions.status = 'stopped', records ended_at,
 *     calculates duration_seconds, and sets connectors.status = 'available'.
 *
 * IMPORTANT — Phase 3B.3 scope:
 *   This layer manages application-level session records only.
 *   There is NO real charger communication (no OCPP/MQTT).
 *   energy_kwh and cost_amount remain at their DEFAULT (0) values set
 *   by the schema, because there is no real telemetry to populate them yet.
 */

import pool, { query } from '../config/database.js';

// ---------------------------------------------------------------------------
// SELECT fragments
// ---------------------------------------------------------------------------

/** Safe session columns for list queries — includes station & connector helpers. */
const SESSION_LIST_FIELDS = `
  cs.id,
  cs.user_id,
  cs.vehicle_id,
  cs.connector_id,
  cs.started_at,
  cs.ended_at,
  cs.start_soc,
  cs.end_soc,
  cs.energy_kwh::float   AS energy_kwh,
  cs.duration_seconds,
  cs.cost_amount::float  AS cost_amount,
  cs.currency,
  cs.status,
  cs.external_session_id,
  cs.created_at,
  cs.updated_at,
  l.name                 AS station_name,
  l.city                 AS station_city,
  cn.standard            AS connector_standard,
  v.model                AS vehicle_model
`;

/**
 * Full nested session query — joins vehicle, connector, EVSE, location, CPO.
 * Used for active session (GET /sessions/active) and single session detail.
 */
const RICH_SESSION_SQL = `
  SELECT
    cs.id,
    cs.user_id,
    cs.vehicle_id,
    cs.connector_id,
    cs.started_at,
    cs.ended_at,
    cs.start_soc,
    cs.end_soc,
    cs.energy_kwh::float   AS energy_kwh,
    cs.duration_seconds,
    cs.cost_amount::float  AS cost_amount,
    cs.currency,
    cs.status,
    cs.external_session_id,
    cs.created_at,
    cs.updated_at,
    -- Vehicle
    CASE WHEN v.id IS NULL THEN NULL ELSE
      json_build_object(
        'id',                    v.id,
        'manufacturer',          v.manufacturer,
        'model',                 v.model,
        'variant',               v.variant,
        'battery_capacity_kwh',  v.battery_capacity_kwh::float,
        'connector_type',        v.connector_type
      )
    END AS vehicle,
    -- Connector
    json_build_object(
      'id',            cn.id,
      'connector_id',  cn.connector_id,
      'standard',      cn.standard,
      'format',        cn.format,
      'power_type',    cn.power_type,
      'max_power_kw',  cn.max_power_kw::float,
      'status',        cn.status
    ) AS connector,
    -- EVSE
    json_build_object(
      'id',                 e.id,
      'evse_uid',           e.evse_uid,
      'evse_code',          e.evse_code,
      'max_power_kw',       e.max_power_kw::float,
      'physical_reference', e.physical_reference
    ) AS evse,
    -- Location / Station
    json_build_object(
      'id',            l.id,
      'name',          l.name,
      'address_line1', l.address_line1,
      'city',          l.city,
      'state',         l.state,
      'latitude',      l.latitude::float,
      'longitude',     l.longitude::float
    ) AS location,
    -- CPO
    json_build_object(
      'id',         c.id,
      'name',       c.name,
      'short_code', c.short_code
    ) AS cpo
  FROM charging_sessions cs
  LEFT JOIN vehicles   v  ON cs.vehicle_id   = v.id
  JOIN connectors      cn ON cs.connector_id = cn.id
  JOIN evses           e  ON cn.evse_id      = e.id
  JOIN locations       l  ON e.location_id   = l.id
  JOIN cpos            c  ON l.cpo_id        = c.id
`;

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Check vehicle existence and ownership.
 *
 * @param {string} vehicleId
 * @returns {Promise<{id: string, user_id: string}|null>}
 */
export async function getVehicleOwnership(vehicleId) {
  const result = await query(
    'SELECT id, user_id FROM vehicles WHERE id = $1',
    [vehicleId]
  );
  return result.rows[0] || null;
}

/**
 * Check connector existence, station hierarchy linkage, and status.
 *
 * @param {string} connectorId
 * @returns {Promise<{exists: boolean, inHierarchy: boolean, status: string|null, connector: object|null}>}
 */
export async function getConnectorHierarchy(connectorId) {
  const raw = await query('SELECT id, status FROM connectors WHERE id = $1', [connectorId]);
  if (raw.rows.length === 0) {
    return { exists: false, inHierarchy: false, status: null, connector: null };
  }

  const hier = await query(
    `SELECT cn.id, cn.status, e.id AS evse_id, l.id AS location_id
     FROM connectors cn
     JOIN evses     e ON cn.evse_id    = e.id
     JOIN locations l ON e.location_id = l.id
     WHERE cn.id = $1`,
    [connectorId]
  );

  if (hier.rows.length === 0) {
    return { exists: true, inHierarchy: false, status: raw.rows[0].status, connector: null };
  }

  return {
    exists: true,
    inHierarchy: true,
    status: hier.rows[0].status,
    connector: hier.rows[0],
  };
}

/**
 * Start a charging session.
 *
 * Uses a SERIALIZABLE transaction with SELECT FOR UPDATE on the connector row
 * to prevent two concurrent requests from creating two active sessions on the
 * same connector.
 *
 * Pre-conditions verified inside the transaction (after lock):
 *   1. Connector exists and is 'available'.
 *   2. User has no existing 'active' or 'pending' session.
 *   3. Connector has no existing 'active' or 'pending' session.
 *
 * Updates:
 *   - Inserts charging_sessions record with status 'active'.
 *   - Updates connectors.status = 'charging'.
 *
 * @param {string} userId
 * @param {string} connectorId  UUID of the connector
 * @param {string} vehicleId    UUID of the vehicle (ownership already checked)
 * @returns {Promise<object>} Created session with nested station/vehicle info
 */
export async function startSession(userId, connectorId, vehicleId) {
  const client = await pool.connect();
  try {
    // SERIALIZABLE prevents phantom reads; FOR UPDATE prevents concurrent writes
    // on the same connector row.
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // Lock the connector row for the duration of this transaction.
    const lockResult = await client.query(
      `SELECT id, status FROM connectors WHERE id = $1 FOR UPDATE`,
      [connectorId]
    );

    if (lockResult.rows.length === 0) {
      const err = new Error('Connector not found.');
      err.statusCode = 404;
      err.code = 'CONNECTOR_NOT_FOUND';
      throw err;
    }

    const connector = lockResult.rows[0];
    if (connector.status !== 'available') {
      const err = new Error(`Connector is not available (current status: ${connector.status}).`);
      err.statusCode = 409;
      err.code = 'CONNECTOR_UNAVAILABLE';
      throw err;
    }

    // Check: user has no active/pending session.
    const userActiveResult = await client.query(
      `SELECT id FROM charging_sessions
       WHERE user_id = $1 AND status IN ('active', 'pending')
       LIMIT 1`,
      [userId]
    );
    if (userActiveResult.rows.length > 0) {
      const err = new Error('You already have an active charging session. Please stop it before starting a new one.');
      err.statusCode = 409;
      err.code = 'SESSION_ALREADY_ACTIVE';
      throw err;
    }

    // Check: connector has no active/pending session (concurrency safety).
    const connectorActiveResult = await client.query(
      `SELECT id FROM charging_sessions
       WHERE connector_id = $1 AND status IN ('active', 'pending')
       LIMIT 1`,
      [connectorId]
    );
    if (connectorActiveResult.rows.length > 0) {
      const err = new Error('This connector is already in use by another session.');
      err.statusCode = 409;
      err.code = 'CONNECTOR_IN_USE';
      throw err;
    }

    // Create the session. Status defaults to 'active'.
    const insertResult = await client.query(
      `INSERT INTO charging_sessions
         (user_id, vehicle_id, connector_id, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id`,
      [userId, vehicleId, connectorId]
    );

    const newSessionId = insertResult.rows[0].id;

    // Update connector status to 'charging'
    await client.query(
      `UPDATE connectors SET status = 'charging', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [connectorId]
    );

    await client.query('COMMIT');

    // Fetch and return the complete rich session representation
    return await getSessionById(newSessionId, userId);
  } catch (err) {
    await client.query('ROLLBACK');
    // Map PostgreSQL transaction serialization failure (40001) or deadlock (40P01) to 409 conflict
    if (err.code === '40001' || err.code === '40P01') {
      const conflictErr = new Error('Could not start session due to concurrent conflicting request. Please try again.');
      conflictErr.statusCode = 409;
      conflictErr.code = 'CONCURRENCY_CONFLICT';
      throw conflictErr;
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get the authenticated user's current active/pending session with full nested details.
 *
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getActiveSession(userId) {
  const result = await query(
    `${RICH_SESSION_SQL}
     WHERE cs.user_id = $1
       AND cs.status IN ('active', 'pending')
     ORDER BY cs.started_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * List all sessions for the authenticated user, newest first.
 *
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function getSessionsByUser(userId) {
  const result = await query(
    `SELECT ${SESSION_LIST_FIELDS}
     FROM charging_sessions cs
     JOIN connectors cn ON cs.connector_id = cn.id
     JOIN evses e ON cn.evse_id = e.id
     JOIN locations l ON e.location_id = l.id
     LEFT JOIN vehicles v ON cs.vehicle_id = v.id
     WHERE cs.user_id = $1
     ORDER BY cs.started_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Get one session by ID, enforcing ownership.
 * Returns null if not found or belongs to another user.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getSessionById(sessionId, userId) {
  const result = await query(
    `${RICH_SESSION_SQL}
     WHERE cs.id = $1 AND cs.user_id = $2`,
    [sessionId, userId]
  );
  return result.rows[0] || null;
}

/**
 * Stop an active session owned by the authenticated user.
 *
 * Sets status = 'stopped', records ended_at, computes duration_seconds,
 * and resets connector status back to 'available'.
 * energy_kwh and cost_amount remain at their current values (0 until real
 * charger telemetry is integrated in a future OCPP phase).
 *
 * @param {string} sessionId
 * @param {string} userId
 * @returns {Promise<object>} Updated rich session
 * @throws if session not found, not owned, or already stopped
 */
export async function stopSession(sessionId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the session row to prevent race conditions.
    const lockResult = await client.query(
      `SELECT id, user_id, connector_id, status FROM charging_sessions
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [sessionId, userId]
    );

    if (lockResult.rows.length === 0) {
      const err = new Error('Session not found.');
      err.statusCode = 404;
      err.code = 'SESSION_NOT_FOUND';
      throw err;
    }

    const session = lockResult.rows[0];
    if (session.status !== 'active' && session.status !== 'pending') {
      const err = new Error(`Session is already in a terminal state (status: ${session.status}).`);
      err.statusCode = 409;
      err.code = 'SESSION_ALREADY_STOPPED';
      throw err;
    }

    // Update session: compute duration from started_at to now, set status = 'stopped'.
    await client.query(
      `UPDATE charging_sessions
       SET
         status           = 'stopped',
         ended_at         = CURRENT_TIMESTAMP,
         duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))::integer),
         updated_at       = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sessionId]
    );

    // Reset connector status back to 'available'
    await client.query(
      `UPDATE connectors SET status = 'available', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [session.connector_id]
    );

    await client.query('COMMIT');

    // Return the updated session with rich details
    return await getSessionById(sessionId, userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves historical telemetry time-series curve for a charging session (Phase 3D.7B).
 *
 * Scoped by authenticated userId to prevent IDOR.
 * Returns chronological list of samples (recorded_at, power_kw, soc_percent, energy_kwh).
 *
 * @param {string} sessionId
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function getSessionTelemetry(sessionId, userId) {
  // Verify session exists and belongs to user
  const sess = await query(
    `SELECT id FROM charging_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );

  if (sess.rows.length === 0) {
    const err = new Error('Session not found.');
    err.statusCode = 404;
    err.code = 'SESSION_NOT_FOUND';
    throw err;
  }

  const res = await query(
    `SELECT
       recorded_at,
       power_kw::float      AS power_kw,
       soc_percent::integer AS soc_percent,
       energy_kwh::float    AS energy_kwh
     FROM ocpp_session_telemetry
     WHERE session_id = $1
     ORDER BY recorded_at ASC`,
    [sessionId]
  );

  return res.rows;
}

