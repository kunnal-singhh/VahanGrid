/**
 * src/routes/index.js
 *
 * API v1 route registry.
 *
 * WHY API VERSIONING (/api/v1/):
 * Once a public API is live with real users or partner integrations (OCPI),
 * you cannot break existing clients by changing response shapes. Versioning
 * lets you introduce /api/v2/ while keeping /api/v1/ stable.
 */

import { Router } from 'express';
import healthRouter   from './health.js';
import stationsRouter from './stations.js';
import authRouter     from './auth.js';
import usersRouter    from './users.js';
import vehiclesRouter from './vehicles.js';
import sessionsRouter from './sessions.js';
import walletRouter   from './wallet.js';
import tariffsRouter  from './tariffs.js';

// -- Future imports (uncomment as each phase is implemented) ------------------
// import chargingRouter from './charging.js';

const router = Router();

// -- Registered routes --------------------------------------------------------
router.use('/health',   healthRouter);
router.use('/stations', stationsRouter);
router.use('/auth',     authRouter);
router.use('/users',    usersRouter);
router.use('/vehicles', vehiclesRouter);
router.use('/sessions', sessionsRouter);
router.use('/wallet',   walletRouter);
router.use('/tariffs',  tariffsRouter);

// -- Future routes --------------------------------------------------------
// router.use('/charging', chargingRouter);

export default router;
