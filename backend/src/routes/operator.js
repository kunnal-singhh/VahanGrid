/**
 * src/routes/operator.js
 *
 * REST API routes for VahanGrid Operator Dashboard (/api/v1/operator).
 *
 * Security:
 * - All routes are protected by authenticate (JWT cookie) and requireOperator middleware.
 * - Operators are strictly scoped to their assigned CPO. Cross-tenant queries are blocked.
 * - Driver accounts are rejected with 403 OPERATOR_ROLE_REQUIRED.
 * - Per-station routes additionally use requireStationOperator for CPO ownership enforcement.
 */

import { Router } from 'express';
import {
  getOverviewHandler,
  getStationsHandler,
  getSessionsHandler,
  getSessionDetailHandler,
  operatorRemoteStopHandler,
  getAnalyticsHandler,
  getStationDetailHandler,
  updateStationHandler,
} from '../controllers/operatorController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireOperator, requireStationOperator } from '../middleware/authorize.js';

const router = Router();

// Enforce authentication & operator/admin role across all operator routes
router.use(authenticate);
router.use(requireOperator);

// GET /api/v1/operator/overview   - Network KPIs & period aggregates
router.get('/overview', getOverviewHandler);

// GET /api/v1/operator/stations   - Fleet station list with OCPP health & connector breakdown
router.get('/stations', getStationsHandler);

// GET /api/v1/operator/sessions   - Live and recent charging sessions (masked driver PII)
router.get('/sessions', getSessionsHandler);

// GET /api/v1/operator/sessions/:id - Detailed session audit record with masked PII
router.get('/sessions/:id', getSessionDetailHandler);

// POST /api/v1/operator/sessions/:id/remote-stop - Safely stop an active session at an owned station
router.post('/sessions/:id/remote-stop', operatorRemoteStopHandler);

// GET /api/v1/operator/analytics  - Time-series buckets for energy and revenue curves
router.get('/analytics', getAnalyticsHandler);

// ── Phase 4C: Station Management ──────────────────────────────────────────────
// GET  /api/v1/operator/stations/:id  - Full detail for a single owned station
// PATCH /api/v1/operator/stations/:id - Update mutable metadata for an owned station
router.get('/stations/:id', requireStationOperator, getStationDetailHandler);
router.patch('/stations/:id', requireStationOperator, updateStationHandler);

export default router;
