/**
 * backend/src/routes/stations.js
 *
 * REST API routes for VahanGrid stations (/api/v1/stations).
 */

import { Router } from 'express';
import {
  getAllStations,
  getStationById,
  getNearbyStations,
  changeAvailabilityHandler,
} from '../controllers/stationController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

// 1. GET /api/v1/stations/nearby (placed before /:id so 'nearby' is not parsed as UUID)
router.get('/nearby', getNearbyStations);

// 2. GET /api/v1/stations
router.get('/', getAllStations);

// 3. GET /api/v1/stations/:id
router.get('/:id', getStationById);

// 4. POST /api/v1/stations/:id/availability (OCPP 2.0.1 ChangeAvailability)
router.post('/:id/availability', authenticate, changeAvailabilityHandler);

export default router;

