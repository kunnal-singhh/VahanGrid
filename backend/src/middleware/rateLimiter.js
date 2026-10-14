/**
 * backend/src/middleware/rateLimiter.js
 *
 * Application-layer rate limiting middleware for VahanGrid.
 *
 * Why this exists:
 *   The production release checklist (docs/PRODUCTION_RELEASE_CHECKLIST.md item 8.5)
 *   identified the absence of application-layer rate limiting as a medium-severity
 *   production blocker. A reverse proxy can provide IP-level limits, but
 *   application-layer limits defend against abuse of expensive operations
 *   (bcrypt hashing on login/register, HMAC verification on webhooks, DB writes
 *   on payment creation) even before the reverse proxy is in place.
 *
 * Design decisions:
 *   - Limits are intentionally more permissive in development/test to allow test
 *     suites to run without hitting the limiter.
 *   - Production limits are conservative to defend against credential stuffing and
 *     payment abuse while permitting legitimate user behaviour.
 *   - The webhook limiter is deliberately lenient: Razorpay retries webhooks and
 *     may source delivery from multiple IPs. HMAC-SHA256 signature verification
 *     (in processPaymentWebhook) is the real cryptographic guard for webhooks;
 *     the rate limit is a DoS / CPU-exhaustion backstop only.
 *   - Payment order/verify limiters are keyed by authenticated user ID when
 *     req.user is available (set by authenticate middleware), falling back to
 *     req.ip for unauthenticated paths.
 *
 * MULTI-INSTANCE LIMITATION:
 *   This module uses express-rate-limit's default MemoryStore. Counters are
 *   in-process only and are NOT shared across multiple backend instances (e.g.
 *   multiple pods in Kubernetes or a PM2 cluster). For multi-instance deployments,
 *   replace the default store with a Redis-backed store such as rate-limit-redis:
 *
 *     import RedisStore from 'rate-limit-redis';
 *     store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
 *
 *   Counters also reset on process restart. During rolling updates, this means
 *   the old instance's counters are lost. This is an acceptable trade-off for
 *   most deployments.
 *
 * PROXY TRUST:
 *   Rate limits are keyed by req.ip. Express derives req.ip from X-Forwarded-For
 *   when trust proxy is configured (app.set('trust proxy', ...) in app.js from
 *   config.trustProxy). Ensure TRUST_PROXY is set correctly in production so
 *   that real client IPs are used, not the proxy's IP.
 *   If trust proxy is not set, all requests appear to come from the same IP and
 *   the limit is shared across ALL clients, which is almost certainly wrong.
 */

import { rateLimit } from 'express-rate-limit';
import config from '../config/env.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Choose the effective limit based on environment.
 * In production, use the strict limit. In development/test, use the generous
 * multiplier so test suites (which all originate from 127.0.0.1) do not trip
 * the limiter and mask real application errors.
 *
 * @param {number} prodLimit  - Requests allowed in production
 * @param {number} devLimit   - Requests allowed in development/test
 * @returns {number}
 */
function envLimit(prodLimit, devLimit) {
  return config.isProd ? prodLimit : devLimit;
}

/**
 * Standard 429 Too Many Requests response handler.
 * Produces the same { success, error: { code, message } } shape used by all
 * other VahanGrid error responses so clients can handle it uniformly.
 *
 * @param {string} errorMessage - Human-readable reason for the limit
 * @returns {function(req, res): void}
 */
function rateLimitHandler(errorMessage) {
  return (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: errorMessage,
      },
    });
  };
}

// ---------------------------------------------------------------------------
// Limiters
// ---------------------------------------------------------------------------

/**
 * Auth — Login
 *
 * Production: 10 attempts per 15 minutes per IP.
 * Development: 50 per 15 minutes (enough for all test suites).
 *
 * Rationale: Defending against credential-stuffing attacks. A legitimate user
 * making 10 failed login attempts in 15 minutes is extremely unlikely; an
 * automated attacker is not. `skipSuccessfulRequests: false` counts every
 * attempt (successful logins do not "reset" the budget) to prevent a
 * "try-and-stop-on-success" abuse pattern.
 */
export const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envLimit(10, 50),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: rateLimitHandler(
    'Too many login attempts from this IP. Please wait 15 minutes before trying again.'
  ),
});

/**
 * Auth — Registration
 *
 * Production: 5 new accounts per hour per IP.
 * Development: 30 per hour.
 *
 * Rationale: Account creation runs bcrypt (CPU-expensive) and allocates
 * wallet/DB rows. A single IP creating more than 5 accounts in an hour
 * is an anomalous pattern that warrants blocking.
 */
export const authRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: envLimit(5, 30),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler(
    'Too many account registrations from this IP. Please wait 1 hour before trying again.'
  ),
});

/**
 * Payments — Order creation (authenticated)
 *
 * Production: 10 top-up order initiations per hour per authenticated user.
 * Development: 50 per hour.
 *
 * Keyed by authenticated user ID (req.user.id, set by authenticate middleware
 * which runs before this limiter via router.use(authenticate)).
 * Falls back to req.ip in case user is not available (belt-and-suspenders).
 *
 * Rationale: Initiating a Razorpay order creates a DB record and calls the
 * provider API (in production). A legitimate user making more than 10 payment
 * order attempts per hour is highly unusual.
 */
export const paymentOrderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: envLimit(10, 50),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  handler: rateLimitHandler(
    'Too many payment order requests. Please wait 1 hour before initiating another top-up.'
  ),
});

/**
 * Payments — Verification (authenticated)
 *
 * Production: 20 verifications per hour per user.
 * Development: 100 per hour.
 *
 * Keyed by user ID. More generous than order creation because a browser crash
 * or interrupted checkout may require the user to retry the verification step
 * for the same order.
 */
export const paymentVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: envLimit(20, 100),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  handler: rateLimitHandler(
    'Too many payment verification requests. Please wait before retrying.'
  ),
});

/**
 * Payments — Webhook receiver (public, no JWT auth)
 *
 * 200 requests per minute per IP (same in both environments).
 *
 * WHY SO LENIENT:
 *   1. Razorpay retries webhook delivery on non-2xx responses, and may send
 *      bursts of retries for the same event.
 *   2. In production, Razorpay webhooks may originate from multiple IPs across
 *      their delivery infrastructure.
 *   3. The REAL security guard is HMAC-SHA256 signature verification (in
 *      processPaymentWebhook). An unsigned request is rejected instantly before
 *      touching the database.
 *   4. The rate limit here defends against CPU exhaustion from unsigned webhook
 *      floods (e.g. a scanner sending garbage to /payments/webhook repeatedly).
 *
 * NOTE: If webhook delivery is coming through a different set of IPs in
 * production, consider adding Razorpay's documented IP allowlist to the reverse
 * proxy instead of (or in addition to) this application-layer limit.
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: rateLimitHandler(
    'Webhook rate limit exceeded. Please retry delivery shortly.'
  ),
});

/**
 * Global API backstop — applied to all /api/v1/* routes in app.js.
 *
 * Production: 500 requests per 15 minutes per IP.
 * Development: 2000 per 15 minutes.
 *
 * This is a broad last-resort limit to prevent any single IP from saturating
 * the entire backend. Legitimate browser clients (dashboard, mobile web) make
 * far fewer than 33 requests per minute in normal usage. Clients hitting this
 * limit are either test harnesses (which should use the development server) or
 * abusive scrapers.
 *
 * More specific limiters (authLoginLimiter, paymentOrderLimiter, etc.) fire
 * BEFORE this one and will 429 abuse-prone endpoints earlier. This limit acts
 * as a final catch-all that requires no knowledge of route semantics.
 */
export const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envLimit(500, 2000),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler(
    'Too many requests from this IP. Please slow down and try again shortly.'
  ),
});
