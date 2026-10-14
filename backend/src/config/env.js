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

// ── Required variables validation ───────────────────────────────────────────
const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];

const INSECURE_SECRET_PATTERNS = [
  'secret',
  'jwt_secret',
  'change_this',
  'changeme',
  'test_secret',
  'your_jwt_secret',
  'vahangrid_secret',
  '123456',
  'password',
];

/**
 * Validates environment configuration.
 * Returns { valid: boolean, errors: string[], warnings: string[] }
 *
 * @param {object} [env=process.env]
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateEnvironment(env = process.env) {
  const errors = [];
  const warnings = [];

  const isProd = env.NODE_ENV === 'production';

  // 1. Check required presence
  for (const key of REQUIRED) {
    if (!env[key] || !env[key].trim()) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // 2. Validate DATABASE_URL
  if (env.DATABASE_URL) {
    const dbUrl = env.DATABASE_URL.trim();
    if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
      errors.push("DATABASE_URL must start with 'postgresql://' or 'postgres://'");
    }
  }

  // 3. Validate JWT_SECRET security in production
  if (env.JWT_SECRET) {
    const secret = env.JWT_SECRET.trim();
    if (isProd) {
      if (secret.length < 32) {
        errors.push('In production, JWT_SECRET must be at least 32 characters long for cryptographic security.');
      }
      const lowerSecret = secret.toLowerCase();
      if (INSECURE_SECRET_PATTERNS.some((p) => lowerSecret === p || lowerSecret.includes(p))) {
        errors.push('In production, JWT_SECRET must not use obvious default or placeholder words.');
      }
    } else if (secret.length < 16) {
      warnings.push('JWT_SECRET is shorter than 16 characters; consider using a longer secret.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// Run validation at startup
const validation = validateEnvironment(process.env);
if (!validation.valid) {
  console.error(`[config] ❌ Environment configuration validation failed:`);
  validation.errors.forEach((e) => console.error(`  - ${e}`));
  console.error('[config]    Please check backend/.env against backend/.env.example and fix the above issues.');
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}
if (validation.warnings.length > 0 && process.env.NODE_ENV !== 'test') {
  validation.warnings.forEach((w) => console.warn(`[config] ⚠️  ${w}`));
}

// ── Exported configuration object ────────────────────────────────────────────
const rawFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = rawFrontendUrl.split(',').map((u) => u.trim()).filter(Boolean);

// Trust proxy: 1 in production or if TRUST_PROXY is set to '1'/'true'/etc.
let trustProxy = false;
if (process.env.TRUST_PROXY !== undefined) {
  const tp = process.env.TRUST_PROXY.toLowerCase();
  trustProxy = tp === 'true' || tp === '1' ? 1 : tp === 'false' || tp === '0' ? false : process.env.TRUST_PROXY;
} else if (process.env.NODE_ENV === 'production') {
  trustProxy = 1;
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
  trustProxy,

  database: {
    url: process.env.DATABASE_URL,
  },

  cors: {
    frontendUrl: allowedOrigins[0] || 'http://localhost:5173',
    allowedOrigins,
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
