/**
 * src/server.js
 *
 * HTTP server entry point.
 *
 * Responsibilities:
 *  1. Load environment config (must be first — other modules read process.env).
 *  2. Verify database connectivity before accepting traffic.
 *  3. Bind the Express app to a port.
 *  4. Handle graceful shutdown so in-flight requests can complete.
 *
 * WHY NOT PUT ALL THIS IN app.js:
 * app.js is a pure Express configuration — it knows nothing about ports or
 * databases. That separation means app.js can be imported by tests without
 * side-effects (no port binding, no DB connection attempt).
 */

// config/env.js MUST be imported first — it calls dotenv.config() and
// validates required variables. If anything is missing it exits the process.
import config from './config/env.js';
import { checkDatabaseConnection } from './config/database.js';
import app from './app.js';

const { port, nodeEnv } = config;

// ── Startup sequence ─────────────────────────────────────────────────────────

async function startServer() {
  console.log(`\n🔌 VahanGrid API — starting in ${nodeEnv} mode`);

  // ── 1. Database connectivity check ────────────────────────────────────────
  // We refuse to start accepting HTTP traffic if the database is unreachable.
  // This prevents a partial-start state where the server looks healthy but
  // every data-dependent endpoint immediately fails.
  console.log('[startup] Checking database connection…');
  const db = await checkDatabaseConnection();

  if (!db.connected) {
    console.error('[startup] ❌ Cannot connect to PostgreSQL:', db.error);
    console.error('[startup]    Check DATABASE_URL in your .env file.');
    console.error('[startup]    Is PostgreSQL running? Is the database created?');
    process.exit(1);
  }

  console.log('[startup] ✅ PostgreSQL connected');
  console.log(
    `[startup] ${db.postgis ? '✅ PostGIS extension detected' : '⚠️  PostGIS not yet enabled — run database/001_enable_postgis.sql'}`
  );

  // ── 2. Start HTTP server ───────────────────────────────────────────────────
  const server = app.listen(port, () => {
    console.log(`[startup] ✅ HTTP server listening on http://localhost:${port}`);
    console.log(`[startup]    Health endpoint: http://localhost:${port}/api/v1/health\n`);
  });

  // ── 3. Graceful shutdown ───────────────────────────────────────────────────
  // When the process receives SIGTERM (e.g. from Docker or a process manager),
  // stop accepting new connections but let in-flight requests finish.
  function shutdown(signal) {
    console.log(`\n[shutdown] Received ${signal} — shutting down gracefully…`);
    server.close(() => {
      console.log('[shutdown] HTTP server closed. Goodbye.');
      process.exit(0);
    });

    // Force-exit after 10 s if requests don't drain.
    setTimeout(() => {
      console.error('[shutdown] ⚠️  Forced exit after timeout.');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

startServer();
