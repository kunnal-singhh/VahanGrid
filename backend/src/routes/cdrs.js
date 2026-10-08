/**
 * backend/src/routes/cdrs.js
 *
 * REST API routes for VahanGrid Charge Detail Records (/api/v1/cdrs).
 * Mounted at /api/v1/cdrs in routes/index.js.
 *
 * GET /              — list authenticated user's CDRs
 * GET /:id           — get CDR detail by UUID (ownership enforced)
 *
 * All routes require authentication via authenticate middleware.
 * CDRs are read-only; no mutation endpoints are exposed.
 */

import { Router } from 'express';
import { listCdrsHandler, getCdrByIdHandler, settleCdrHandler } from '../controllers/cdrController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

router.use(authenticate);

router.get('/',           listCdrsHandler);
router.get('/:id',        getCdrByIdHandler);
router.post('/:id/settle', settleCdrHandler);

export default router;
