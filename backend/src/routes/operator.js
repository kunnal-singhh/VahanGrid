/**
 * src/routes/operator.js
 *
 * REST API routes for VahanGrid Operator Dashboard (/api/v1/operator).
 *
 * Security:
 * - All routes are protected by authenticate (JWT cookie) and requireOperator middleware.
 * - Operators are strictly scoped to their assigned CPO. Cross-tenant queries are blocked.
 * - Driver accounts are rejected with 403 OPERATOR_ROLE_REQUIRED.
 */

import { Router } from 'express';
import {
  getOverviewHandler,
  getStationsHandler,
  getSessionsHandler,
  getAnalyticsHandler,
} from '../controllers/operatorController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireOperator } from '../middleware/authorize.js';

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

// GET /api/v1/operator/analytics  - Time-series buckets for energy and revenue curves
router.get('/analytics', getAnalyticsHandler);

export default router;
