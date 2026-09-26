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

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const dbStatus = await checkDatabaseConnection();

    // If the database is unreachable, return 503 Service Unavailable.
    // Monitoring tools treat any non-2xx as "down".
    if (!dbStatus.connected) {
      return res.status(503).json({
        success: false,
        service: 'VahanGrid API',
        status: 'unhealthy',
        database: 'disconnected',
        // Only expose the DB error message in development.
        ...(process.env.NODE_ENV !== 'production' && {
          error: dbStatus.error,
        }),
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      service: 'VahanGrid API',
      status: 'healthy',
      database: 'connected',
      postgis: dbStatus.postgis ? 'enabled' : 'not yet enabled',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
