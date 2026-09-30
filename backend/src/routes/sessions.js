/**
 * src/routes/sessions.js
 *
 * Charging session lifecycle routes for VahanGrid.
 * Mounted at /api/v1/sessions in routes/index.js.
 *
 * POST /start     — start a charging session
 * GET  /active    — get current active session
 * GET  /          — list authenticated user's session history
 * GET  /:id       — get session details (ownership enforced)
 * POST /:id/stop  — stop an active session (ownership enforced)
 *
 * All routes require authentication via authenticate middleware.
 */

import { Router } from 'express';
import {
  startSessionHandler,
  getActiveSessionHandler,
  listSessionsHandler,
  getSessionHandler,
  getSessionTelemetryHandler,
  stopSessionHandler,
} from '../controllers/sessionController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

// Enforce authentication across all session endpoints
router.use(authenticate);

// Lifecycle routes (static routes must be defined before parameterized :id)
router.post('/start',          startSessionHandler);
router.get('/active',          getActiveSessionHandler);
router.get('/',                listSessionsHandler);
router.get('/:id/telemetry',   getSessionTelemetryHandler);
router.get('/:id',             getSessionHandler);
router.post('/:id/stop',       stopSessionHandler);

export default router;
