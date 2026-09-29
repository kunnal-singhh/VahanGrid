/**
 * backend/src/services/stationService.js
 *
 * Database access service for VahanGrid charging stations (locations).
 *
 * Responsibilities:
 * - Executes parameterized SQL queries using the centralized database pool.
 * - Extracts and aggregates relational EVSEs and connectors into clean JSON objects.
 * - Executes PostGIS spatial queries (ST_DWithin, ST_Distance) on the geography column.
 * - Pure data access layer; receives clean domain parameters and returns JS objects.
 */

import { query } from '../config/database.js';

// Base SQL snippet for nested CPO, EVSE, and Connector aggregation
const BASE_STATION_SELECT = `
  SELECT
    l.id,
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
      'short_code', c.short_code,
      'website', c.website,
      'support_phone', c.support_phone,
      'support_email', c.support_email
    ) AS cpo,
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', e.id,
            'evse_uid', e.evse_uid,
            'evse_code', e.evse_code,
            'status', e.status,
            'floor_level', e.floor_level,
            'physical_reference', e.physical_reference,
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
                    'max_voltage_v', cn.max_voltage_v::float,
                    'max_amperage_a', cn.max_amperage_a::float,
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
`;

/**
 * Retrieve all charging locations with nested CPO, EVSE, and connector details.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function getAllStations() {
  const sql = `
    ${BASE_STATION_SELECT}
    ORDER BY l.name ASC;
  `;
  const result = await query(sql);
  return result.rows;
}

/**
 * Retrieve a single station by its unique UUID.
 *
 * @param {string} id - Station UUID
 * @returns {Promise<Object|null>}
 */
export async function getStationById(id) {
  const sql = `
    ${BASE_STATION_SELECT}
    WHERE l.id = $1;
  `;
  const result = await query(sql, [id]);
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Find stations within a given radius (km) from coordinates using PostGIS.
 *
 * Note on coordinate order:
 * PostGIS ST_MakePoint takes (longitude, latitude).
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} radiusKm
 * @returns {Promise<Array<Object>>}
 */
export async function getNearbyStations(latitude, longitude, radiusKm = 5) {
  const radiusMeters = radiusKm * 1000;

  const sql = `
    SELECT
      l.id,
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
      ROUND((ST_Distance(l.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000.0)::numeric, 2)::float AS distance_km,
      json_build_object(
        'id', c.id,
        'name', c.name,
        'short_code', c.short_code,
        'website', c.website,
        'support_phone', c.support_phone,
        'support_email', c.support_email
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
                      'max_voltage_v', cn.max_voltage_v::float,
                      'max_amperage_a', cn.max_amperage_a::float,
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
    WHERE ST_DWithin(
      l.location,
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      $3
    )
    ORDER BY distance_km ASC;
  `;

  // $1: longitude, $2: latitude, $3: radiusMeters
  const result = await query(sql, [longitude, latitude, radiusMeters]);
  return result.rows;
}
