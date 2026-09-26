/**
 * src/config/database.js
 *
 * PostgreSQL connection pool.
 *
 * WHY A CONNECTION POOL:
 * Opening a new database connection for every HTTP request is expensive
 * (TCP handshake + PostgreSQL auth = ~50-100ms overhead). A pool keeps a set
 * of connections alive and reuses them, making queries fast under load.
 * `pg.Pool` handles this automatically — we just configure it and call query().
 *
 * WHY POSTGIS EVENTUALLY:
 * VahanGrid's core use-case is geospatial — "find chargers within 30 km of
 * this location". PostgreSQL's PostGIS extension adds native geometry types
 * and spatial indexes (GIST) that make those queries orders of magnitude faster
 * than calculating distances in JavaScript. We enable it now so the database
 * is ready when the station schema is designed.
 */

import pg from 'pg';
import config from './env.js';

const { Pool } = pg;

// Create a single shared pool for the entire application.
// All controllers and services should import and use this pool,
// never create their own connections.
const pool = new Pool({
  connectionString: config.database.url,

  // Safety limits — tune these when scaling:
  max: 10,          // Maximum concurrent connections to PostgreSQL
  idleTimeoutMillis: 30_000,    // Drop idle connections after 30 s
  connectionTimeoutMillis: 5_000, // Fail a connection attempt after 5 s
});

// Log pool errors rather than crashing — connection drops are recoverable.
pool.on('error', (err) => {
  console.error('[database] ⚠️  Unexpected pool error:', err.message);
});

/**
 * Execute a parameterised SQL query.
 *
 * Always use parameterised queries ($1, $2 …) — never string-concatenate
 * user input into SQL. The pg driver escapes parameters automatically,
 * preventing SQL injection.
 *
 * @param {string} text   SQL string with $1, $2 … placeholders
 * @param {Array}  params Array of values to substitute
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  // Log slow queries (>200 ms) in development to catch N+1 problems early.
  if (config.isDev && duration > 200) {
    console.warn(`[database] ⏱  Slow query (${duration}ms): ${text}`);
  }

  return result;
}

/**
 * Test that the database is reachable and PostGIS is available.
 * Called once at startup and by the health endpoint.
 *
 * @returns {Promise<{ connected: boolean, postgis: boolean, error?: string }>}
 */
export async function checkDatabaseConnection() {
  try {
    // SELECT 1 is the standard lightweight connectivity ping.
    await pool.query('SELECT 1');

    // Check whether the PostGIS extension is already installed.
    const extResult = await pool.query(
      "SELECT extname FROM pg_extension WHERE extname = 'postgis'"
    );
    const postgisEnabled = extResult.rows.length > 0;

    return { connected: true, postgis: postgisEnabled };
  } catch (err) {
    return { connected: false, postgis: false, error: err.message };
  }
}

export default pool;
