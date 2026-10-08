/**
 * src/config/env.js
 *
 * Central environment configuration module.
 *
 * WHY THIS EXISTS:
 * Rather than reading process.env directly in every file, we load, validate,
 * and export config from one place. This means:
 *   - Missing variables fail at startup, not mid-request.
 *   - The rest of the codebase uses typed, named values instead of raw strings.
 *   - Changing a variable name only requires one edit here.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Resolve the path to the .env file relative to this file's location.
// __dirname is not available in ES modules, so we derive it manually.
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

// ── Required variables ───────────────────────────────────────────────────────
// If DATABASE_URL is missing, the backend cannot function — fail immediately
// rather than hiding the problem until a database query is attempted.
// JWT_SECRET is also required: without it the server cannot issue or verify tokens.
const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[config] ❌ Missing required environment variables: ${missing.join(', ')}`);
  console.error('[config]    Copy backend/.env.example to backend/.env and fill in the values.');
  process.exit(1);
}

// ── Exported configuration object ────────────────────────────────────────────
const config = {
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',

  database: {
    url: process.env.DATABASE_URL,
  },

  cors: {
    // Default to localhost:5173 (Vite dev server) if FRONTEND_URL is not set.
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  },

  jwt: {
    // JWT_SECRET is required (enforced above). Minimum recommended: 32 random bytes.
    secret: process.env.JWT_SECRET,
    // How long a token lives before it must be refreshed. Default 7 days.
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  cookie: {
    // Name of the HTTP-only cookie that carries the JWT.
    name: 'vg_token',
    // In production, cookies are only sent over HTTPS.
    secure: process.env.NODE_ENV === 'production',
    // 7 days in milliseconds (must match JWT expiry)
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },

  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'razorpay',
    keyId: process.env.PAYMENT_KEY_ID || process.env.PAYMENT_PROVIDER_KEY || 'rzp_test_vahangrid',
    keySecret: process.env.PAYMENT_KEY_SECRET || process.env.PAYMENT_PROVIDER_SECRET || 'test_payment_secret',
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || 'test_webhook_secret',
    minTopupAmount: 10,
    maxTopupAmount: 50000,
  },
};

export default config;
