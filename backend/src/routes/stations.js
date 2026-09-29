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
} from '../controllers/stationController.js';

const router = Router();

// 1. GET /api/v1/stations/nearby (placed before /:id so 'nearby' is not parsed as UUID)
router.get('/nearby', getNearbyStations);

// 2. GET /api/v1/stations
router.get('/', getAllStations);

// 3. GET /api/v1/stations/:id
router.get('/:id', getStationById);

export default router;
