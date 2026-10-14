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
import pool, { checkDatabaseConnection } from './config/database.js';
import app from './app.js';
import { initOcppServer, closeOcppServer } from './ocpp/index.js';
import logger from './utils/logger.js';

const { port, nodeEnv } = config;

// ── Startup sequence ─────────────────────────────────────────────────────────

async function startServer() {
  logger.info('startup', `VahanGrid API starting in ${nodeEnv} mode`, { port, nodeEnv });

  // ── 1. Database connectivity check ────────────────────────────────────────
  // We refuse to start accepting HTTP traffic if the database is unreachable.
  // This prevents a partial-start state where the server looks healthy but
  // every data-dependent endpoint immediately fails.
  logger.info('startup', 'Verifying PostgreSQL connectivity...');
  const db = await checkDatabaseConnection();

  if (!db.connected) {
    logger.error('startup', 'Cannot connect to PostgreSQL database. Exiting.', {
      error: config.isDev ? db.error : 'Connection refused / unreachable',
    });
    console.error('[startup] ❌ Cannot connect to PostgreSQL:', db.error);
    console.error('[startup]    Check DATABASE_URL in your .env file.');
    console.error('[startup]    Is PostgreSQL running? Is the database created?');
    process.exit(1);
  }

  logger.info('startup', 'PostgreSQL database connected', {
    postgis: db.postgis ? 'enabled' : 'disabled',
  });

  // ── 2. Start HTTP server ───────────────────────────────────────────────────
  const server = app.listen(port, () => {
    logger.info('startup', `HTTP server listening on http://localhost:${port}`, {
      healthEndpoint: `/health`,
      apiHealth: `/api/v1/health`,
      ocppWebSocket: `ws://localhost:${port}/ocpp/<charge-point-id>`,
    });
  });

  // ── 3. Initialize OCPP WebSocket Gateway ──────────────────────────────────
  initOcppServer(server);

  // ── 4. Graceful shutdown ───────────────────────────────────────────────────
  // When the process receives SIGTERM or SIGINT (e.g. Docker, Kubernetes, systemd),
  // stop accepting new connections, drain HTTP requests, close OCPP sockets, and close DB pool.
  let isShuttingDown = false;
  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info('shutdown', `Received ${signal} — initiating graceful shutdown sequence`);

    // Force-exit after 10 s if resources fail to drain
    const forceTimer = setTimeout(() => {
      logger.error('shutdown', 'Graceful shutdown timed out after 10s. Forcing process exit.');
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    try {
      // 1. Close OCPP WebSockets
      closeOcppServer();
      logger.info('shutdown', 'OCPP WebSocket server and connections closed');

      // 2. Stop accepting new HTTP requests and finish in-flight
      await new Promise((resolve) => server.close(resolve));
      logger.info('shutdown', 'HTTP listener closed');

      // 3. Drain PostgreSQL connection pool
      await pool.end();
      logger.info('shutdown', 'PostgreSQL connection pool drained and closed');

      logger.info('shutdown', 'Graceful shutdown completed successfully. Process exiting cleanly.');
      process.exit(0);
    } catch (err) {
      logger.error('shutdown', 'Error during graceful shutdown sequence', { error: err.message });
      process.exit(1);
    }
  }

  process.on('uncaughtException', (err) => {
    logger.error('server', 'Uncaught exception encountered', { message: err.message, stack: err.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('server', 'Unhandled promise rejection encountered', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

startServer();
