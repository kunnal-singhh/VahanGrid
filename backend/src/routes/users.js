/**
 * src/routes/users.js
 *
 * User profile routes for VahanGrid.
 * Mounted at /api/v1/users in routes/index.js.
 *
 * GET   /me  — return authenticated user profile
 * PATCH /me  — update name or phone
 *
 * All routes require authentication (JWT cookie).
 */

import { Router } from 'express';
import { getMe, updateMe } from '../controllers/userController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

router.get('/me',   authenticate, getMe);
router.patch('/me', authenticate, updateMe);

export default router;
