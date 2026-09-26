/**
 * src/middleware/errorHandler.js
 *
 * Centralized Express error handling middleware.
 *
 * Express recognizes a middleware with 4 parameters (err, req, res, next)
 * as an error handler. It is registered LAST in app.js so it catches errors
 * thrown or passed via next(err) anywhere in the application.
 *
 * WHY CENTRALIZED:
 * Without this, every route would need its own try/catch with duplicated
 * response logic. This keeps routes clean and ensures consistent error
 * formatting across the entire API.
 */

import config from '../config/env.js';

/**
 * Normalize any thrown value into a safe, structured HTTP response.
 *
 * Rules:
 *  - 4xx errors = client mistake → show message
 *  - 5xx errors = server problem → show generic message in production
 *  - Never expose: stack traces, DB passwords, connection strings in production
 */
export function errorHandler(err, req, res, _next) {
  // Determine status code. Express sets err.status/err.statusCode on some
  // built-in errors (e.g. JSON parse failure = 400). Default to 500.
  const status = err.status || err.statusCode || 500;

  // Log the full error server-side so we can debug it, but never send
  // the raw error to the client in production.
  console.error(`[error] ${req.method} ${req.path} → ${status}`, err.message);
  if (config.isDev) {
    console.error(err.stack);
  }

  // ── Client-facing response ────────────────────────────────────────────────
  const isClientError = status >= 400 && status < 500;

  const body = {
    success: false,
    status,
    message: isClientError
      ? err.message                             // Tell the client what they did wrong
      : 'An unexpected server error occurred.', // Hide internal details in production
  };

  // In development, include the stack trace to speed up debugging.
  if (config.isDev && !isClientError) {
    body.stack = err.stack;
  }

  // Attach the database-specific hint only in development.
  if (config.isDev && err.code && err.code.startsWith('23')) {
    // PostgreSQL error codes starting with 23 are integrity constraint violations.
    body.dbCode = err.code;
  }

  res.status(status).json(body);
}
