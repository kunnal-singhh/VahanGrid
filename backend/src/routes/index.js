/**
 * src/routes/index.js
 *
 * API v1 route registry.
 *
 * WHY API VERSIONING (/api/v1/):
 * Once a public API is live with real users or partner integrations (OCPI),
 * you cannot break existing clients by changing response shapes. Versioning
 * lets you introduce /api/v2/ while keeping /api/v1/ stable. It costs almost
 * nothing to set up now and is painful to retrofit later.
 *
 * Add future route modules here as they are implemented.
 * The route files themselves stay focused on a single resource.
 */

import { Router } from 'express';
import healthRouter from './health.js';
import stationsRouter from './stations.js';

// ── Future imports (uncomment as each phase is implemented) ──────────────────
// import authRouter     from './auth.js';
// import usersRouter    from './users.js';
// import vehiclesRouter from './vehicles.js';
// import chargingRouter from './charging.js';
// import walletRouter   from './wallet.js';

const router = Router();

// ── Registered routes ────────────────────────────────────────────────────────
router.use('/health',   healthRouter);
router.use('/stations', stationsRouter);

// ── Future routes (Phase 3B onward) ─────────────────────────────────────────
// router.use('/auth',     authRouter);
// router.use('/users',    usersRouter);
// router.use('/vehicles', vehiclesRouter);
// router.use('/charging', chargingRouter);
// router.use('/wallet',   walletRouter);

export default router;
