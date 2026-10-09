/**
 * src/services/operatorService.js
 *
 * Data access and aggregation service for Charge Point Operator (CPO) network management.
 *
 * Responsibilities:
 * - Query network overview KPIs (stations, live connectors, active sessions, authoritative CDR finances).
 * - Query paginated station fleet health with connector status breakdown and OCPP connectivity.
 * - Query paginated charging sessions across operator network with driver PII masking.
 * - Generate time-series analytics (hourly/daily buckets for energy, billed revenue, settled revenue).
 *
 * Data Integrity & Security Rules:
 * - Parameterized SQL only.
 * - Scoped strictly to target CPO (or all CPOs if platform admin).
 * - Never leak driver email, phone, or wallet details.
 * - Authoritative financial totals sourced directly from immutable CDRs (never double-counted).
 */

import { query } from '../config/database.js';
import connectionRegistry from '../ocpp/connectionRegistry.js';

/**
 * Mask driver name to First Name + Initial (e.g. "Priya Sharma" -> "Priya S.")
 */
function maskDriverName(fullName) {
  if (!fullName || typeof fullName !== 'string') return 'EV Driver';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * Fetch CPO metadata.
 */
export async function getCpoInfo(cpoId) {
  if (!cpoId) return null;
  const res = await query(
    `SELECT id, name, short_code, website, support_phone, support_email, status
     FROM cpos
     WHERE id = $1`,
    [cpoId]
  );
  return res.rows[0] || null;
}

/**
 * 1. Overview KPIs
 *
 * @param {object} params
 * @param {string|null} params.cpoId - Target CPO UUID (null for admin platform-wide)
 * @param {string} params.period - '24h' | '7d' | '30d' (default '30d')
 */
export async function getOperatorOverview({ cpoId = null, period = '30d' }) {
  const periodMap = {
    '24h': '24 hours',
    '7d': '7 days',
    '30d': '30 days',
  };
  const intervalStr = periodMap[period] || '30 days';

  // 1. CPO info
  const cpo = cpoId ? await getCpoInfo(cpoId) : { id: 'all', name: 'Platform-Wide (All CPOs)', short_code: 'ALL' };

  // 2. Station and connector totals & breakdown
  const statsRes = await query(
    `SELECT
       COUNT(DISTINCT l.id)::int AS total_stations,
       COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active')::int AS active_stations,
       COUNT(DISTINCT l.id) FILTER (WHERE l.status != 'active')::int AS inactive_stations,
       COUNT(DISTINCT cn.id)::int AS total_connectors,
       COUNT(DISTINCT cn.id) FILTER (WHERE cn.status = 'available')::int AS available_connectors,
       COUNT(DISTINCT cn.id) FILTER (WHERE cn.status = 'charging')::int AS charging_connectors,
       COUNT(DISTINCT cn.id) FILTER (WHERE cn.status = 'faulted')::int AS faulted_connectors,
       COUNT(DISTINCT cn.id) FILTER (WHERE cn.status IN ('offline', 'unavailable'))::int AS offline_connectors
     FROM locations l
     LEFT JOIN evses e ON e.location_id = l.id
     LEFT JOIN connectors cn ON cn.evse_id = e.id
     WHERE ($1::uuid IS NULL OR l.cpo_id = $1)`,
    [cpoId]
  );
  const stats = statsRes.rows[0];

  // 3. Online & Faulted stations calculation incorporating OCPP registry & hardware statuses
  const stationHealthRes = await query(
    `SELECT
       l.id,
       l.status,
       ocp.charge_point_id,
       ocp.status AS ocpp_status,
       COUNT(cn.id) FILTER (WHERE cn.status IN ('available', 'charging'))::int AS working_connectors,
       COUNT(cn.id) FILTER (WHERE cn.status = 'faulted')::int AS faulted_connectors
     FROM locations l
     LEFT JOIN evses e ON e.location_id = l.id
     LEFT JOIN connectors cn ON cn.evse_id = e.id
     LEFT JOIN ocpp_charge_points ocp ON ocp.location_id = l.id
     WHERE ($1::uuid IS NULL OR l.cpo_id = $1)
     GROUP BY l.id, ocp.charge_point_id, ocp.status`,
    [cpoId]
  );

  let onlineStations = 0;
  let faultedStations = 0;
  for (const row of stationHealthRes.rows) {
    const isWsConnected = row.charge_point_id ? connectionRegistry.has(row.charge_point_id) : false;
    const isOnline = isWsConnected || row.ocpp_status === 'online' || row.working_connectors > 0;
    if (isOnline && row.status === 'active') {
      onlineStations++;
    }
    if (row.faulted_connectors > 0) {
      faultedStations++;
    }
  }

  // 4. Currently active sessions
  const activeSessRes = await query(
    `SELECT COUNT(DISTINCT cs.id)::int AS count
     FROM charging_sessions cs
     JOIN connectors cn ON cs.connector_id = cn.id
     JOIN evses e ON cn.evse_id = e.id
     JOIN locations l ON e.location_id = l.id
     WHERE cs.status = 'active'
       AND ($1::uuid IS NULL OR l.cpo_id = $1)`,
    [cpoId]
  );
  const activeSessionsCount = activeSessRes.rows[0]?.count || 0;

  // 5. Authoritative CDR Period Metrics
  const cdrMetricsRes = await query(
    `SELECT
       COUNT(c.id)::int AS total_sessions,
       ROUND(COALESCE(SUM(c.energy_kwh), 0)::numeric, 2)::float AS total_energy_kwh,
       ROUND(COALESCE(SUM(c.total_amount), 0)::numeric, 2)::float AS total_revenue_inr,
       ROUND(COALESCE(SUM(CASE WHEN c.settlement_status = 'settled' THEN c.total_amount ELSE 0 END), 0)::numeric, 2)::float AS settled_revenue_inr,
       ROUND(COALESCE(SUM(CASE WHEN c.settlement_status != 'settled' THEN c.total_amount ELSE 0 END), 0)::numeric, 2)::float AS unsettled_revenue_inr
     FROM cdrs c
     WHERE ($1::uuid IS NULL OR c.cpo_id = $1)
       AND c.started_at >= NOW() - $2::interval`,
    [cpoId, intervalStr]
  );
  const cdrMetrics = cdrMetricsRes.rows[0];

  const totalRev = cdrMetrics.total_revenue_inr || 0;
  const settledRev = cdrMetrics.settled_revenue_inr || 0;
  const settlementRate = totalRev > 0 ? Number(((settledRev / totalRev) * 100).toFixed(1)) : 0.0;

  return {
    cpo: {
      id: cpo.id,
      name: cpo.name,
      short_code: cpo.short_code,
    },
    stations: {
      total: stats.total_stations,
      active: stats.active_stations,
      inactive: stats.inactive_stations,
      online: onlineStations,
      faulted: faultedStations,
    },
    connectors: {
      total: stats.total_connectors,
      available: stats.available_connectors,
      charging: stats.charging_connectors,
      faulted: stats.faulted_connectors,
      offline: stats.offline_connectors,
    },
    active_sessions_count: activeSessionsCount,
    reporting_period: period,
    metrics: {
      total_sessions: cdrMetrics.total_sessions,
      total_energy_kwh: cdrMetrics.total_energy_kwh,
      total_revenue_inr: totalRev,
      settled_revenue_inr: settledRev,
      unsettled_revenue_inr: cdrMetrics.unsettled_revenue_inr || 0,
      settlement_rate_percent: settlementRate,
    },
  };
}

/**
 * 2. Stations Fleet List (Paginated & Grouped)
 */
export async function getOperatorStations({
  cpoId = null,
  page = 1,
  limit = 10,
  status = 'all',
  search = null,
}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const searchPattern = search ? `%${search.trim()}%` : null;

  // Total count
  const countRes = await query(
    `SELECT COUNT(DISTINCT l.id)::int AS total
     FROM locations l
     WHERE ($1::uuid IS NULL OR l.cpo_id = $1)
       AND ($2::text = 'all' OR l.status = $2)
       AND ($3::text IS NULL OR l.name ILIKE $3 OR l.city ILIKE $3 OR l.address_line1 ILIKE $3)`,
    [cpoId, status, searchPattern]
  );
  const total = countRes.rows[0]?.total || 0;

  // Station rows with grouped counts
  const stationsRes = await query(
    `SELECT
       l.id,
       l.cpo_id,
       c.name AS cpo_name,
       c.short_code AS cpo_short_code,
       l.name,
       l.address_line1,
       l.city,
       l.state,
       l.postal_code,
       l.latitude::float AS latitude,
       l.longitude::float AS longitude,
       l.status,
       l.created_at,
       l.updated_at,
       COUNT(DISTINCT e.id)::int AS evse_count,
       COUNT(DISTINCT cn.id)::int AS connector_count,
       COUNT(DISTINCT cn.id) FILTER (WHERE cn.status = 'available')::int AS available_connectors,
       COUNT(DISTINCT cn.id) FILTER (WHERE cn.status = 'charging')::int AS charging_connectors,
       COUNT(DISTINCT cn.id) FILTER (WHERE cn.status = 'faulted')::int AS faulted_connectors,
       COUNT(DISTINCT cn.id) FILTER (WHERE cn.status IN ('offline', 'unavailable'))::int AS offline_connectors,
       COUNT(DISTINCT cs.id) FILTER (WHERE cs.status = 'active')::int AS active_sessions_count,
       ocp.charge_point_id AS ocpp_charge_point_id,
       COALESCE(ocp.status, 'offline') AS ocpp_status,
       ocp.last_seen_at,
       ocp.last_boot_at
     FROM locations l
     JOIN cpos c ON l.cpo_id = c.id
     LEFT JOIN evses e ON e.location_id = l.id
     LEFT JOIN connectors cn ON cn.evse_id = e.id
     LEFT JOIN charging_sessions cs ON cs.connector_id = cn.id AND cs.status = 'active'
     LEFT JOIN ocpp_charge_points ocp ON ocp.location_id = l.id
     WHERE ($1::uuid IS NULL OR l.cpo_id = $1)
       AND ($2::text = 'all' OR l.status = $2)
       AND ($3::text IS NULL OR l.name ILIKE $3 OR l.city ILIKE $3 OR l.address_line1 ILIKE $3)
     GROUP BY l.id, c.id, ocp.charge_point_id, ocp.status, ocp.last_seen_at, ocp.last_boot_at
     ORDER BY l.name ASC
     LIMIT $4 OFFSET $5`,
    [cpoId, status, searchPattern, safeLimit, offset]
  );

  const stations = stationsRes.rows.map((row) => {
    const isWsConnected = row.ocpp_charge_point_id ? connectionRegistry.has(row.ocpp_charge_point_id) : false;
    const isOperational = isWsConnected || row.ocpp_status === 'online' || row.available_connectors > 0 || row.charging_connectors > 0;
    const healthStatus = isOperational
      ? (row.faulted_connectors > 0 ? 'degraded' : 'online')
      : (row.status === 'active' ? 'offline' : row.status);

    return {
      id: row.id,
      cpo_id: row.cpo_id,
      cpo: {
        name: row.cpo_name,
        short_code: row.cpo_short_code,
      },
      name: row.name,
      address: {
        line1: row.address_line1,
        city: row.city,
        state: row.state,
        postal_code: row.postal_code,
      },
      coordinates: {
        latitude: row.latitude,
        longitude: row.longitude,
      },
      status: row.status,
      operational_health: healthStatus,
      evse_count: row.evse_count,
      connector_count: row.connector_count,
      connectors_breakdown: {
        available: row.available_connectors,
        charging: row.charging_connectors,
        faulted: row.faulted_connectors,
        offline: row.offline_connectors,
      },
      active_sessions_count: row.active_sessions_count,
      ocpp: {
        charge_point_id: row.ocpp_charge_point_id,
        status: row.ocpp_status,
        ws_connected: isWsConnected,
        last_seen_at: row.last_seen_at,
        last_boot_at: row.last_boot_at,
      },
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  return {
    stations,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      total_pages: Math.ceil(total / safeLimit) || 1,
    },
  };
}

/**
 * 3. Sessions Feed (Paginated with privacy masking)
 */
export async function getOperatorSessions({
  cpoId = null,
  page = 1,
  limit = 20,
  status = 'all',
  stationId = null,
}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  // Total count
  const countRes = await query(
    `SELECT COUNT(DISTINCT cs.id)::int AS total
     FROM charging_sessions cs
     JOIN connectors cn ON cs.connector_id = cn.id
     JOIN evses e ON cn.evse_id = e.id
     JOIN locations l ON e.location_id = l.id
     WHERE ($1::uuid IS NULL OR l.cpo_id = $1)
       AND ($2::uuid IS NULL OR l.id = $2)
       AND ($3::text = 'all' OR cs.status = $3)`,
    [cpoId, stationId, status]
  );
  const total = countRes.rows[0]?.total || 0;

  // Sessions rows
  const sessionsRes = await query(
    `SELECT
       cs.id,
       cs.status,
       cs.started_at,
       cs.ended_at,
       cs.duration_seconds,
       cs.energy_kwh::float AS energy_kwh,
       cs.cost_amount::float AS cost_amount,
       cs.currency,
       cs.start_soc::float AS start_soc,
       cs.end_soc::float AS end_soc,
       l.id AS station_id,
       l.name AS station_name,
       l.city AS station_city,
       e.evse_uid,
       cn.id AS connector_id,
       cn.connector_id AS connector_code,
       cn.standard AS connector_standard,
       cn.max_power_kw::float AS max_power_kw,
       u.name AS driver_raw_name,
       v.manufacturer AS vehicle_manufacturer,
       v.model AS vehicle_model,
       cdr.id AS cdr_id,
       cdr.settlement_status,
       cdr.total_amount::float AS cdr_total_amount
     FROM charging_sessions cs
     JOIN connectors cn ON cs.connector_id = cn.id
     JOIN evses e ON cn.evse_id = e.id
     JOIN locations l ON e.location_id = l.id
     LEFT JOIN users u ON cs.user_id = u.id
     LEFT JOIN vehicles v ON cs.vehicle_id = v.id
     LEFT JOIN cdrs cdr ON cdr.session_id = cs.id
     WHERE ($1::uuid IS NULL OR l.cpo_id = $1)
       AND ($2::uuid IS NULL OR l.id = $2)
       AND ($3::text = 'all' OR cs.status = $3)
     ORDER BY cs.started_at DESC
     LIMIT $4 OFFSET $5`,
    [cpoId, stationId, status, safeLimit, offset]
  );

  const sessions = sessionsRes.rows.map((row) => ({
    id: row.id,
    status: row.status,
    started_at: row.started_at,
    ended_at: row.ended_at,
    duration_seconds: row.duration_seconds,
    energy_kwh: row.energy_kwh,
    cost_amount: row.cost_amount,
    currency: row.currency,
    soc: {
      start: row.start_soc,
      end: row.end_soc,
    },
    station: {
      id: row.station_id,
      name: row.station_name,
      city: row.station_city,
    },
    hardware: {
      evse_uid: row.evse_uid,
      connector_id: row.connector_id,
      connector_code: row.connector_code,
      standard: row.connector_standard,
      max_power_kw: row.max_power_kw,
    },
    driver: {
      name: maskDriverName(row.driver_raw_name),
      vehicle: row.vehicle_manufacturer ? `${row.vehicle_manufacturer} ${row.vehicle_model}` : null,
    },
    cdr: row.cdr_id
      ? {
          id: row.cdr_id,
          settlement_status: row.settlement_status,
          total_amount: row.cdr_total_amount,
        }
      : null,
  }));

  return {
    sessions,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      total_pages: Math.ceil(total / safeLimit) || 1,
    },
  };
}

/**
 * 5. Single Station Detail (for operator edit/view)
 *
 * Returns the full station record including CPO info, EVSEs, and connectors.
 * Enforces CPO scope: operators only see their own stations.
 *
 * @param {string} stationId - Station UUID
 * @param {string|null} cpoId - Owning CPO UUID (null only for admin platform view)
 * @returns {Promise<object|null>} Station object or null if not found/not owned
 */
export async function getStationDetail(stationId, cpoId) {
  const res = await query(
    `SELECT
       l.id,
       l.cpo_id,
       l.name,
       l.address_line1,
       l.address_line2,
       l.city,
       l.state,
       l.postal_code,
       l.country_code,
       l.timezone,
       l.latitude::float AS latitude,
       l.longitude::float AS longitude,
       l.status,
       l.source_type,
       l.last_verified_at,
       l.created_at,
       l.updated_at,
       json_build_object(
         'id', c.id,
         'name', c.name,
         'short_code', c.short_code
       ) AS cpo,
       COALESCE(
         (
           SELECT json_agg(
             json_build_object(
               'id', e.id,
               'evse_uid', e.evse_uid,
               'evse_code', e.evse_code,
               'status', e.status,
               'max_power_kw', e.max_power_kw::float,
               'connectors', COALESCE(
                 (
                   SELECT json_agg(
                     json_build_object(
                       'id', cn.id,
                       'connector_id', cn.connector_id,
                       'standard', cn.standard,
                       'format', cn.format,
                       'power_type', cn.power_type,
                       'max_power_kw', cn.max_power_kw::float,
                       'status', cn.status
                     )
                     ORDER BY cn.connector_id ASC
                   )
                   FROM connectors cn
                   WHERE cn.evse_id = e.id
                 ),
                 '[]'::json
               )
             )
             ORDER BY e.evse_uid ASC
           )
           FROM evses e
           WHERE e.location_id = l.id
         ),
         '[]'::json
       ) AS evses
     FROM locations l
     JOIN cpos c ON l.cpo_id = c.id
     WHERE l.id = $1
       AND ($2::uuid IS NULL OR l.cpo_id = $2)`,
    [stationId, cpoId]
  );
  return res.rows[0] || null;
}

/**
 * 6. Update Station Metadata (safe mutable fields only)
 *
 * Only the following fields may be updated. Ownership (cpo_id), provenance
 * (source_type, source_id), and last_verified_at are never touched.
 * Caller must have already verified CPO ownership before invoking.
 * Latitude/longitude changes automatically sync the PostGIS geography column
 * via the existing database trigger.
 *
 * @param {string} stationId - Station UUID (already ownership-verified)
 * @param {object} fields - Validated, sanitized field updates
 * @returns {Promise<object|null>} Updated station row or null
 */
export async function updateStation(stationId, fields) {
  const MUTABLE_FIELDS = [
    'name',
    'address_line1',
    'address_line2',
    'city',
    'state',
    'postal_code',
    'timezone',
    'latitude',
    'longitude',
    'status',
  ];

  // Filter only safe mutable fields that were actually provided
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  for (const field of MUTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(fields, field)) {
      setClauses.push(`${field} = $${paramIndex}`);
      values.push(fields[field]);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    // Nothing to update — return current record
    return getStationDetail(stationId, null);
  }

  // Always update the updated_at timestamp
  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(stationId); // final param for WHERE clause

  const sql = `
    UPDATE locations
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, cpo_id, name, address_line1, address_line2, city, state,
              postal_code, country_code, timezone,
              latitude::float AS latitude, longitude::float AS longitude,
              status, source_type, last_verified_at, created_at, updated_at
  `;

  const res = await query(sql, values);
  return res.rows[0] || null;
}

/**
 * 4. Time-series Analytics (Bounded bucketing)
 */
export async function getOperatorAnalytics({ cpoId = null, period = '7d' }) {
  if (period === '24h') {
    // 24 hourly buckets
    const sql = `
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('hour', NOW() - INTERVAL '23 hours'),
          date_trunc('hour', NOW()),
          INTERVAL '1 hour'
        ) AS bucket_start
      )
      SELECT
        to_char(b.bucket_start, 'YYYY-MM-DD"T"HH24:00:00"Z"') AS timestamp,
        to_char(b.bucket_start AT TIME ZONE 'Asia/Kolkata', 'HH24:00') AS label,
        COUNT(c.id)::int AS session_count,
        ROUND(COALESCE(SUM(c.energy_kwh), 0)::numeric, 2)::float AS energy_kwh,
        ROUND(COALESCE(SUM(c.total_amount), 0)::numeric, 2)::float AS billed_amount_inr,
        ROUND(COALESCE(SUM(CASE WHEN c.settlement_status = 'settled' THEN c.total_amount ELSE 0 END), 0)::numeric, 2)::float AS settled_amount_inr
      FROM buckets b
      LEFT JOIN cdrs c ON date_trunc('hour', c.started_at) = b.bucket_start
        AND ($1::uuid IS NULL OR c.cpo_id = $1)
      GROUP BY b.bucket_start
      ORDER BY b.bucket_start ASC;
    `;
    const res = await query(sql, [cpoId]);
    return {
      period: '24h',
      interval: '1 hour',
      buckets: res.rows,
    };
  }

  // 7d or 30d (daily buckets)
  const days = period === '30d' ? 30 : 7;
  const intervalDays = days - 1;

  const sql = `
    WITH buckets AS (
      SELECT generate_series(
        date_trunc('day', NOW() - ($2::int * INTERVAL '1 day')),
        date_trunc('day', NOW()),
        INTERVAL '1 day'
      ) AS bucket_start
    )
    SELECT
      to_char(b.bucket_start, 'YYYY-MM-DD"T"00:00:00"Z"') AS timestamp,
      to_char(b.bucket_start AT TIME ZONE 'Asia/Kolkata', 'Mon DD') AS label,
      COUNT(c.id)::int AS session_count,
      ROUND(COALESCE(SUM(c.energy_kwh), 0)::numeric, 2)::float AS energy_kwh,
      ROUND(COALESCE(SUM(c.total_amount), 0)::numeric, 2)::float AS billed_amount_inr,
      ROUND(COALESCE(SUM(CASE WHEN c.settlement_status = 'settled' THEN c.total_amount ELSE 0 END), 0)::numeric, 2)::float AS settled_amount_inr
    FROM buckets b
    LEFT JOIN cdrs c ON date_trunc('day', c.started_at) = b.bucket_start
      AND ($1::uuid IS NULL OR c.cpo_id = $1)
    GROUP BY b.bucket_start
    ORDER BY b.bucket_start ASC;
  `;
  const res = await query(sql, [cpoId, intervalDays]);
  return {
    period: days === 30 ? '30d' : '7d',
    interval: '1 day',
    buckets: res.rows,
  };
}
