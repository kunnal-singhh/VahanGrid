/**
 * backend/src/routes/tariffs.js
 *
 * REST API routes for VahanGrid tariffs (/api/v1/tariffs).
 */

import { Router } from 'express';
import {
  createTariffHandler,
  listTariffsHandler,
  resolveTariffHandler,
  calculatePricingHandler,
  getTariffByIdHandler,
  updateTariffHandler,
  deleteTariffHandler,
} from '../controllers/tariffController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

// Protect tariff management endpoints
router.use(authenticate);

// Specific routes before :id
router.post('/calculate', calculatePricingHandler);
router.get('/resolve', resolveTariffHandler);

// CRUD
router.post('/', createTariffHandler);
router.get('/', listTariffsHandler);
router.get('/:id', getTariffByIdHandler);
router.patch('/:id', updateTariffHandler);
router.delete('/:id', deleteTariffHandler);

export default router;
