/**
 * src/app.js
 *
 * Express application factory.
 *
 * WHY SEPARATE FROM server.js:
 * app.js builds and exports the Express application object â€” pure HTTP
 * concerns (middleware, routing, error handling). server.js does the
 * infrastructure work: binding to a port, connecting to the database,
 * and starting the process.
 *
 * Keeping them separate means you can import `app` into integration tests
 * without actually starting a server or needing a real port.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import config from './config/env.js';
import apiRoutes from './routes/index.js';
import healthRouter from './routes/health.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { globalApiLimiter } from './middleware/rateLimiter.js';

const app = express();

// â”€â”€ 0. Reverse proxy configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// When running behind a reverse proxy (NGINX, Cloudflare, AWS ALB), trust proxy
// ensures req.ip, req.protocol, and secure cookies evaluate correctly from X-Forwarded-* headers.
if (config.trustProxy) {
  app.set('trust proxy', config.trustProxy);
}

// â”€â”€ 1. Security headers (Helmet) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Helmet sets a collection of HTTP response headers that defend against common
// web vulnerabilities: clickjacking (X-Frame-Options), MIME-type sniffing,
// XSS via Content-Security-Policy, etc. It is a single-line security baseline.
app.use(helmet());

// â”€â”€ 2. CORS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Cross-Origin Resource Sharing: browsers block JS on domain A from calling
// an API on domain B unless the API explicitly opts in.
const corsOrigin =
  config.cors.allowedOrigins && config.cors.allowedOrigins.length > 1
    ? config.cors.allowedOrigins
    : config.cors.frontendUrl;

const corsOptions = {
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // Required for HttpOnly cookie auth
};
app.use(cors(corsOptions));

// ---------------------------------------------------------------------------
// 3. Request logging (Morgan)
// ---------------------------------------------------------------------------
// 'dev' format: GET /api/v1/health 200 4ms
// 'combined' is better for production log aggregators (Datadog, CloudWatch).
app.use(morgan(config.isDev ? 'dev' : 'combined'));

// ---------------------------------------------------------------------------
// 4. Body parsing
// ---------------------------------------------------------------------------
// Parse incoming JSON request bodies. Retain raw body buffer for HMAC webhook signature verification.
app.use(express.json({
  limit: '100kb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// ---------------------------------------------------------------------------
// 5. Cookie parsing
// ---------------------------------------------------------------------------
// Required to read the HTTP-only JWT cookie set during login.
// The cookie name is configured in config/env.js (cookie.name).
app.use(cookieParser());

// ---------------------------------------------------------------------------
// 6. Health routes (Root & Versioned)
// ---------------------------------------------------------------------------
// Load balancers and container orchestrators often ping /health directly.
app.use('/health', healthRouter);

// ---------------------------------------------------------------------------
// 7. API routes
// ---------------------------------------------------------------------------
// Global API rate limiter: broad backstop before route handlers.
// Health probes (/health) are intentionally excluded so they stay
// reachable under load. See middleware/rateLimiter.js for details.
app.use('/api/v1', globalApiLimiter);

app.use('/api/v1', apiRoutes);

// ---------------------------------------------------------------------------
// 8. 404 catch-all
// ---------------------------------------------------------------------------
// Any request that did not match a route above falls through to here.
app.use(notFound);

// ---------------------------------------------------------------------------
// 9. Centralized error handler
// ---------------------------------------------------------------------------
// Must be registered LAST. Four-parameter signature tells Express it is an
// error handler. Catches errors thrown in any route or middleware via next(err).
app.use(errorHandler);

export default app;
