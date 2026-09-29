/**
 * src/routes/auth.js
 *
 * Authentication routes for VahanGrid.
 *
 * Mounted at /api/v1/auth in routes/index.js.
 *
 * POST /register  — Create a new account
 * POST /login     — Authenticate and receive a session cookie
 * POST /logout    — Clear the session cookie
 * GET  /me        — Return the currently authenticated user (protected)
 */

import { Router } from 'express';
import { register, login, logout, me } from '../controllers/authController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

router.post('/register', register);
router.post('/login',    login);
router.post('/logout',   logout);
router.get('/me',        authenticate, me);

export default router;
