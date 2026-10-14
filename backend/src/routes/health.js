/**
 * src/routes/health.js
 *
 * Health check route.
 *
 * GET /api/v1/health
 *
 * This endpoint serves two purposes:
 *  1. Manual testing — you can curl or browser it during development.
 *  2. Production monitoring — load balancers and uptime services call it.
 *
 * It performs a real database connectivity check every time it is called,
 * so the "database" field in the response genuinely reflects live state.
 */

import { Router } from 'express';
import { checkDatabaseConnection } from '../config/database.js';
import config from '../config/env.js';

const router = Router();

/**
 * GET /api/v1/health (and /health)
 *
 * Full system health check. Probes database and PostGIS extension.
 * Safe for production: never exposes DB connection strings, credentials,
 * or raw error stack traces to clients.
 */
router.get('/', async (_req, res, next) => {
  try {
    const dbStatus = await checkDatabaseConnection();

    if (!dbStatus.connected) {
      return res.status(503).json({
        success: false,
        service: 'VahanGrid API',
        status: 'unhealthy',
        database: 'disconnected',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        // Only expose the DB error message in development/test
        ...(config.isDev && {
          error: dbStatus.error,
        }),
      });
    }

    return res.status(200).json({
      success: true,
      service: 'VahanGrid API',
      status: 'healthy',
      database: 'connected',
      postgis: dbStatus.postgis ? 'enabled' : 'not yet enabled',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/health/liveness (and /health/liveness)
 *
 * Lightweight liveness probe for orchestrators (e.g., Kubernetes, Docker Compose, AWS ECS).
 * Confirms that the Node.js event loop is running and responsive. Does NOT query the database.
 */
router.get('/liveness', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'VahanGrid API',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/health/readiness (and /health/readiness)
 *
 * Lightweight readiness probe for load balancers.
 * Pings database to confirm the instance is capable of accepting incoming user traffic.
 */
router.get('/readiness', async (_req, res, next) => {
  try {
    const dbStatus = await checkDatabaseConnection();
    if (!dbStatus.connected) {
      return res.status(503).json({
        status: 'not_ready',
        service: 'VahanGrid API',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
        ...(config.isDev && { error: dbStatus.error }),
      });
    }

    return res.status(200).json({
      status: 'ready',
      service: 'VahanGrid API',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
