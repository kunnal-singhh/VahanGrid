/**
 * src/routes/vehicles.js
 *
 * Vehicle routes for VahanGrid.
 * Mounted at /api/v1/vehicles in routes/index.js.
 *
 * GET    /         — list authenticated user's vehicles
 * POST   /         — create a vehicle for the authenticated user
 * GET    /:id      — get one vehicle (ownership enforced)
 * PATCH  /:id      — update one vehicle (ownership enforced)
 * DELETE /:id      — delete one vehicle (ownership enforced)
 *
 * All routes require authentication.
 */

import { Router } from 'express';
import {
  listVehicles,
  createVehicle,
  getVehicle,
  updateVehicle,
  deleteVehicle,
} from '../controllers/vehicleController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

// Apply authenticate to all vehicle routes.
router.use(authenticate);

router.get('/',     listVehicles);
router.post('/',    createVehicle);
router.get('/:id',  getVehicle);
router.patch('/:id', updateVehicle);
router.delete('/:id', deleteVehicle);

export default router;
