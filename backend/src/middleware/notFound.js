/**
 * src/middleware/notFound.js
 *
 * 404 catch-all middleware.
 *
 * This runs AFTER all real routes are registered. If Express reaches this
 * middleware, it means no route matched the request path — so we generate
 * a structured 404 response instead of the default Express HTML page.
 *
 * The created error is passed to next() and caught by errorHandler.js.
 */

export function notFound(req, res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
}
