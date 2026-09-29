/**
 * src/controllers/authController.js
 *
 * HTTP request handlers for VahanGrid authentication endpoints.
 *
 * Responsibilities:
 * - Validate request body fields (400 for bad input).
 * - Delegate to authService for business/DB logic.
 * - Issue / clear JWT cookies.
 * - Return standardised { success, data, error } responses.
 *
 * What this controller does NOT do:
 * - SQL queries (that is authService's job).
 * - Password hashing (authService handles that).
 * - JWT verification on protected routes (authenticate middleware does that).
 */

import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import * as authService from '../services/authService.js';

// -- Helpers -------------------------------------------------------------------

/** Basic email format check (not exhaustive; DB constraint is the authority). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Indian mobile number: optional +91 or 0 prefix, then 10 digits starting with 6-9. */
const PHONE_REGEX = /^(\+91|0)?[6-9]\d{9}$/;

/**
 * Sign a JWT and set it as an HTTP-only cookie on the response.
 *
 * @param {object} res   Express response object
 * @param {string} userId  UUID of the authenticated user
 */
function issueAuthCookie(res, userId) {
  const token = jwt.sign(
    { sub: userId },           // 'sub' (subject) is the JWT standard claim for user ID
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  res.cookie(config.cookie.name, token, {
    httpOnly: true,            // Not accessible from JavaScript — XSS protection
    secure: config.cookie.secure, // HTTPS only in production
    sameSite: 'lax',           // Prevents CSRF for cross-origin navigations
    maxAge: config.cookie.maxAgeMs,
    path: '/',
  });
}

/**
 * Clear the authentication cookie.
 * Must use the exact same options as when it was set.
 */
function clearAuthCookie(res) {
  res.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: 'lax',
    path: '/',
  });
}

// -- Route handlers ------------------------------------------------------------

/**
 * POST /api/v1/auth/register
 *
 * Body: { name, email, phone?, password }
 */
export async function register(req, res, next) {
  try {
    const { name, email, phone, password } = req.body;

    // -- 1. Validation ---------------------------------------------------------
    const errors = [];

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      errors.push('name must be at least 2 characters.');
    }
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      errors.push('A valid email address is required.');
    }
    if (phone !== undefined && phone !== null && phone !== '') {
      if (typeof phone !== 'string' || !PHONE_REGEX.test(phone.trim())) {
        errors.push('phone must be a valid Indian mobile number (e.g. 9876543210 or +919876543210).');
      }
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      errors.push('password must be at least 8 characters.');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Registration failed due to invalid input.',
          details: errors,
        },
      });
    }

    // -- 2. Delegate to service ------------------------------------------------
    const user = await authService.registerUser({
      name: name.trim(),
      email: email.trim(),
      phone: phone ? phone.trim() : undefined,
      password,
    });

    // -- 3. Issue cookie and respond -------------------------------------------
    issueAuthCookie(res, user.id);

    return res.status(201).json({
      success: true,
      data: { user },
      meta: {
        message: 'Registration successful. You are now logged in.',
      },
    });
  } catch (err) {
    // Map service-level errors to HTTP responses
    if (err.statusCode === 409) {
      return res.status(409).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * POST /api/v1/auth/login
 *
 * Body: { email, password }
 */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // -- 1. Basic presence validation ------------------------------------------
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'email is required.',
        },
      });
    }
    if (!password || typeof password !== 'string' || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'password is required.',
        },
      });
    }

    // -- 2. Verify credentials -------------------------------------------------
    const user = await authService.verifyCredentials(email, password);

    // Return the same 401 for "user not found" and "wrong password" to prevent
    // email enumeration attacks.
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'The email or password you entered is incorrect.',
        },
      });
    }

    // -- 3. Issue cookie and respond -------------------------------------------
    issueAuthCookie(res, user.id);

    return res.status(200).json({
      success: true,
      data: { user },
      meta: {
        message: 'Login successful.',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/logout
 *
 * Clears the authentication cookie. No body required.
 * This route does NOT require authentication — logging out an already-
 * unauthenticated request is a no-op and should succeed silently.
 */
export async function logout(_req, res, _next) {
  clearAuthCookie(res);
  return res.status(200).json({
    success: true,
    data: null,
    meta: {
      message: 'You have been logged out successfully.',
    },
  });
}

/**
 * GET /api/v1/auth/me
 *
 * Returns the currently authenticated user's profile.
 * Protected by the authenticate middleware — req.user is already populated.
 */
export async function me(req, res, _next) {
  return res.status(200).json({
    success: true,
    data: { user: req.user },
  });
}
