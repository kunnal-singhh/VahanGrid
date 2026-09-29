/**
 * src/middleware/authenticate.js
 *
 * JWT authentication middleware for VahanGrid.
 *
 * How it works:
 * 1. Reads the JWT from the HTTP-only cookie (config.cookie.name).
 * 2. Verifies the token signature and expiry using the JWT_SECRET.
 * 3. Loads the user record from PostgreSQL (ensures user still exists and is active).
 * 4. Attaches the user to req.user so downstream handlers can use it.
 * 5. Returns 401 for any authentication failure — missing cookie, bad signature,
 *    expired token, or user no longer in the database.
 *
 * Security notes:
 * - The JWT is in an HTTP-only cookie: JavaScript cannot read it (XSS protection).
 * - We do NOT trust the user ID supplied by the client body or query string.
 * - We always re-fetch the user from the DB so stale/deleted accounts are rejected.
 */

import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import { getUserById } from '../services/authService.js';

/**
 * Express middleware that enforces authentication.
 * Attach to any route that requires a logged-in user.
 */
export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.[config.cookie.name];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authentication required. Please log in.',
        },
      });
    }

    // Verify signature and decode payload. Throws if invalid or expired.
    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch (jwtErr) {
      const isExpired = jwtErr.name === 'TokenExpiredError';
      return res.status(401).json({
        success: false,
        error: {
          code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
          message: isExpired
            ? 'Your session has expired. Please log in again.'
            : 'Invalid authentication token. Please log in again.',
        },
      });
    }

    // Load the user from the database — do not trust the payload alone.
    // This rejects tokens for deleted/suspended accounts.
    const user = await getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'The account associated with this session no longer exists.',
        },
      });
    }

    // Attach the safe user object for downstream handlers.
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
