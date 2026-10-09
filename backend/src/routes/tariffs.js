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
import { requireTariffOperator, requireOperator } from '../middleware/authorize.js';

const router = Router();

// Protect tariff management endpoints
router.use(authenticate);

// Specific routes before :id
router.post('/calculate', calculatePricingHandler);
router.get('/resolve', resolveTariffHandler);

// CRUD
router.post('/', requireTariffOperator, createTariffHandler);
router.get('/', requireOperator, listTariffsHandler);
router.get('/:id', requireTariffOperator, getTariffByIdHandler);
router.patch('/:id', requireTariffOperator, updateTariffHandler);
router.delete('/:id', requireTariffOperator, deleteTariffHandler);

export default router;
