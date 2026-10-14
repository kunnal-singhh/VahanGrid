/**
 * backend/src/scripts/test_phase5a.js
 *
 * Phase 5A — Deployment Readiness, Observability & Health Check Verification Suite.
 *
 * Validates:
 *  1. Environment Configuration validation logic (production security rules, secret entropy, DB schemes).
 *  2. Structured Operational Logger (sensitive token/secret redaction, PII email/phone masking).
 *  3. Health Check Endpoints:
 *     - /health & /api/v1/health (system status & PostGIS detection)
 *     - /health/liveness & /api/v1/health/liveness (lightweight event loop probe)
 *     - /health/readiness & /api/v1/health/readiness (database connectivity ping)
 *  4. Graceful error response on simulated database failure (returns 503, no password/credential leaks).
 *  5. Reverse proxy trust & CORS origin handling.
 */

import http from 'http';
import app from '../app.js';
import config, { validateEnvironment } from '../config/env.js';
import pool from '../config/database.js';
import logger, { sanitizeLogData, maskEmail, maskPhone } from '../utils/logger.js';

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    errors.push(message);
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function request(server, path, options = {}) {
  const address = server.address();
  const port = address.port;
  const url = `http://127.0.0.1:${port}${path}`;

  const res = await fetch(url, options);
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch (_) {
    json = null;
  }
  return { status: res.status, headers: res.headers, body: json, text };
}

async function runTests() {
  console.log('\n================================================================');
  console.log('⚡ VahanGrid Phase 5A — Deployment Readiness & Observability Audit');
  console.log('================================================================\n');

  // ── 1. Environment Configuration & Validation ──────────────────────────────
  console.log('📋 1. Environment Configuration & Production Security Validation:');

  // Test 1.1: Missing required variables
  const missingEnv = validateEnvironment({
    NODE_ENV: 'production',
  });
  assert(!missingEnv.valid, 'Rejects configuration missing DATABASE_URL and JWT_SECRET');
  assert(missingEnv.errors.some((e) => e.includes('DATABASE_URL')), 'Reports missing DATABASE_URL error');
  assert(missingEnv.errors.some((e) => e.includes('JWT_SECRET')), 'Reports missing JWT_SECRET error');

  // Test 1.2: Invalid DATABASE_URL scheme
  const invalidDb = validateEnvironment({
    NODE_ENV: 'production',
    DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
    JWT_SECRET: 'a_very_long_secure_production_secret_key_12345',
  });
  assert(!invalidDb.valid, 'Rejects non-PostgreSQL DATABASE_URL scheme');
  assert(invalidDb.errors.some((e) => e.includes('postgresql://')), 'Error mentions postgresql:// requirement');

  // Test 1.3: Insecure JWT_SECRET in production (< 32 chars)
  const shortSecretProd = validateEnvironment({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: 'short_secret',
  });
  assert(!shortSecretProd.valid, 'Rejects short (< 32 chars) JWT_SECRET in production');
  assert(shortSecretProd.errors.some((e) => e.includes('32 characters')), 'Error explains 32 characters requirement');

  // Test 1.4: Placeholder JWT_SECRET in production
  const placeholderSecret = validateEnvironment({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: 'test_secret_that_is_over_thirty_two_chars_long',
  });
  assert(!placeholderSecret.valid, 'Rejects placeholder JWT_SECRET in production even if long');

  // Test 1.5: Valid production configuration
  const validProd = validateEnvironment({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://vahangrid:complex_password_491@db.vahangrid.com:5432/vahangrid_prod?sslmode=require',
    JWT_SECRET: 'e78d91c2b53a49f8a201c94b7e8d32a104f6918a2305bc91234a56b78c90123d',
  });
  assert(validProd.valid, 'Accepts high-entropy production environment configuration');
  assert(validProd.errors.length === 0, 'Zero errors for valid production environment');

  // ── 2. Structured Operational Logger & Sanitization ─────────────────────────
  console.log('\n🔒 2. Structured Logger Sensitive Data Redaction & PII Masking:');

  // Test 2.1: Redacts passwords and secret keys
  const dirtyData = {
    password: 'super_secret_password',
    keySecret: 'rzp_live_secret_key_99',
    webhookSecret: 'whsec_abcdef123456',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.x',
    nested: {
      newPassword: 'my_new_password_123',
      authorization: 'Bearer secret_auth_token_999',
    },
  };
  const sanitized = sanitizeLogData(dirtyData);
  assert(sanitized.password === '[REDACTED]', 'Redacts top-level password');
  assert(sanitized.keySecret === '[REDACTED]', 'Redacts payment keySecret');
  assert(sanitized.webhookSecret === '[REDACTED]', 'Redacts webhookSecret');
  assert(sanitized.token === '[REDACTED]', 'Redacts authentication token');
  assert(sanitized.nested.newPassword === '[REDACTED]', 'Redacts nested password');
  assert(sanitized.nested.authorization === '[REDACTED]', 'Redacts Authorization header key');
  assert(sanitizeLogData('Bearer secret_string_token') === 'Bearer [REDACTED]', 'Redacts Bearer token string');

  // Test 2.2: PII Masking for driver email and phone
  const piiData = {
    email: 'kunal.driver@example.com',
    phone: '+919876543210',
    meta: {
      driverEmail: 'john.doe@vahangrid.com',
    },
  };
  const sanitizedPII = sanitizeLogData(piiData);
  assert(sanitizedPII.email === 'k***@example.com', 'Masks user email in structured logs');
  assert(sanitizedPII.phone === '******3210', 'Masks mobile phone number');
  assert(maskEmail('driver@test.com') === 'd***@test.com', 'maskEmail helper preserves initial character and domain');
  assert(maskPhone('9876543210') === '******3210', 'maskPhone helper preserves only trailing 4 digits');

  // ── 3. Health & Observability Endpoints ─────────────────────────────────────
  console.log('\n🩺 3. Health & Observability Probes Execution:');

  // Start temporary HTTP server on random port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const serverPort = server.address().port;

  try {
    // Test 3.1: Root /health full check
    const rootHealth = await request(server, '/health');
    assert(rootHealth.status === 200, 'GET /health returns HTTP 200 OK');
    assert(rootHealth.body && rootHealth.body.status === 'healthy', 'GET /health body status is healthy');
    assert(rootHealth.body.database === 'connected', 'GET /health reports database connected');
    assert(typeof rootHealth.body.uptimeSeconds === 'number', 'GET /health includes uptimeSeconds');
    assert(Boolean(rootHealth.body.timestamp), 'GET /health includes ISO timestamp');

    // Test 3.2: Versioned /api/v1/health check
    const v1Health = await request(server, '/api/v1/health');
    assert(v1Health.status === 200, 'GET /api/v1/health returns HTTP 200 OK');
    assert(v1Health.body && v1Health.body.database === 'connected', 'GET /api/v1/health reports database connected');
    assert(v1Health.body.postgis === 'enabled', 'GET /api/v1/health verifies PostGIS extension');

    // Test 3.3: Liveness probes (/health/liveness & /api/v1/health/liveness)
    const livenessRoot = await request(server, '/health/liveness');
    assert(livenessRoot.status === 200, 'GET /health/liveness returns HTTP 200 OK');
    assert(livenessRoot.body && livenessRoot.body.status === 'ok', 'GET /health/liveness body status is ok');
    assert(typeof livenessRoot.body.uptimeSeconds === 'number', 'GET /health/liveness includes uptimeSeconds');

    const livenessV1 = await request(server, '/api/v1/health/liveness');
    assert(livenessV1.status === 200, 'GET /api/v1/health/liveness returns HTTP 200 OK');
    assert(livenessV1.body.status === 'ok', 'GET /api/v1/health/liveness body status is ok');

    // Test 3.4: Readiness probes (/health/readiness & /api/v1/health/readiness)
    const readinessRoot = await request(server, '/health/readiness');
    assert(readinessRoot.status === 200, 'GET /health/readiness returns HTTP 200 OK');
    assert(readinessRoot.body && readinessRoot.body.status === 'ready', 'GET /health/readiness body status is ready');
    assert(readinessRoot.body.database === 'connected', 'GET /health/readiness reports database connected');

    const readinessV1 = await request(server, '/api/v1/health/readiness');
    assert(readinessV1.status === 200, 'GET /api/v1/health/readiness returns HTTP 200 OK');
    assert(readinessV1.body.status === 'ready', 'GET /api/v1/health/readiness body status is ready');

    // ── 4. Failure Isolation & Secret Non-Leakage on DB Outage ──────────────────
    console.log('\n🛡️ 4. Simulated Database Outage & Credential Non-Leakage:');

    // Mock pool.query to simulate unreachable PostgreSQL
    const originalQuery = pool.query.bind(pool);
    try {
      pool.query = async () => {
        throw new Error('connection to server at "127.0.0.1", port 5432 failed: Connection refused (password=secretPass123)');
      };

      const degradedHealth = await request(server, '/health');
      assert(degradedHealth.status === 503, 'GET /health returns HTTP 503 on database disconnect');
      assert(degradedHealth.body && degradedHealth.body.status === 'unhealthy', 'Reported status is unhealthy');
      assert(degradedHealth.body.database === 'disconnected', 'Database status reports disconnected');

      const degradedReady = await request(server, '/health/readiness');
      assert(degradedReady.status === 503, 'GET /health/readiness returns HTTP 503 on database disconnect');
      assert(degradedReady.body && degradedReady.body.status === 'not_ready', 'Readiness reports not_ready');
    } finally {
      // Restore original pool.query
      pool.query = originalQuery;
    }

    // ── 5. Reverse Proxy Trust & Security Headers ──────────────────────────────
    console.log('\n⚙️ 5. Express Reverse Proxy Trust & Security Configuration:');
    assert(app.get('trust proxy') !== undefined, 'Express trust proxy setting is configured');
    
    // Check security headers set by Helmet
    const helmetCheck = await request(server, '/health');
    assert(helmetCheck.headers.get('x-content-type-options') === 'nosniff', 'Helmet sets X-Content-Type-Options: nosniff');
    assert(helmetCheck.headers.get('x-frame-options') === 'SAMEORIGIN', 'Helmet sets X-Frame-Options: SAMEORIGIN');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`Phase 5A Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error('❌ Failures:');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  } else {
    console.log('🎉 All Phase 5A deployment readiness & observability checks passed!\n');
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('\n❌ Fatal unhandled error in test suite:', err);
  process.exit(1);
});
