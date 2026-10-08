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
  resetStationHandler,
  unlockConnectorHandler,
  triggerMessageHandler,
  setChargingProfileHandler,
  clearChargingProfileHandler,
  getStationTariffHandler,
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

// 5. POST /api/v1/stations/:id/reset (OCPP 2.0.1 Reset)
router.post('/:id/reset', authenticate, resetStationHandler);

// 6. POST /api/v1/stations/:id/unlock-connector (OCPP 2.0.1 UnlockConnector)
router.post('/:id/unlock-connector', authenticate, unlockConnectorHandler);

// 7. POST /api/v1/stations/:id/trigger-message (OCPP 2.0.1 TriggerMessage)
router.post('/:id/trigger-message', authenticate, triggerMessageHandler);

// 8. POST /api/v1/stations/:id/charging-profiles (OCPP 2.0.1 SetChargingProfile)
router.post('/:id/charging-profiles', authenticate, setChargingProfileHandler);

// 9. POST /api/v1/stations/:id/clear-charging-profile (OCPP 2.0.1 ClearChargingProfile)
router.post('/:id/clear-charging-profile', authenticate, clearChargingProfileHandler);

// 10. DELETE /api/v1/stations/:id/charging-profiles (OCPP 2.0.1 ClearChargingProfile alias)
router.delete('/:id/charging-profiles', authenticate, clearChargingProfileHandler);

// 11. GET /api/v1/stations/:id/tariff (Resolve active station tariff)
router.get('/:id/tariff', getStationTariffHandler);

export default router;


