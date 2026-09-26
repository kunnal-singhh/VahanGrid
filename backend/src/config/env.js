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
const REQUIRED = ['DATABASE_URL'];

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
};

export default config;
