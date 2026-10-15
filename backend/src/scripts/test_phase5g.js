/**
 * backend/src/scripts/test_phase5g.js
 *
 * Phase 5G — Release Candidate Hardening Test Suite.
 *
 * Verification Areas:
 *  A. Release Candidate Static Manifest Audit
 *  B. Security Boundary Hardening (Live Server + Source Audit)
 *  C. Logger & PII Redaction (Static Module Inspection)
 *  D. Environment Validation Hardening (Unit Validation)
 *  E. Seed Guard Verification (Subprocess)
 *  F. OCPP WebSocket Gateway Resilience (Live)
 *  G. Database & PostGIS Migration Integrity (Live)
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import pool, { query } from '../config/database.js';
import { validateEnvironment } from '../config/env.js';
import { sanitizeLogData, maskEmail, maskPhone } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const BACKEND_ROOT = path.resolve(__dirname, '../../');

const execFileAsync = promisify(execFile);

const BASE_URL = 'http://127.0.0.1:3001';
const API_URL = `${BASE_URL}/api/v1`;
const WS_URL = `ws://127.0.0.1:3001`;

let passed = 0;
let failed = 0;
const errors = [];

function assert(msg, condition) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
    errors.push(msg);
  }
}

function section(title) {
  console.log(`\n${'='.repeat(70)}\n  ${title}\n${'='.repeat(70)}\n`);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, headers: res.headers, data };
}

async function runPhase5gAudit() {
  console.log('\n================================================================');
  console.log('  VahanGrid Phase 5G — Release Candidate Hardening');
  console.log('================================================================');

  // ─────────────────────────────────────────────────────────────────────────
  // A. Release Candidate Static Manifest Audit
  // ─────────────────────────────────────────────────────────────────────────
  section('A. Release Candidate Static Manifest Audit');

  const criticalFiles = [
    'backend/Dockerfile',
    'backend/src/server.js',
    'backend/src/app.js',
    'backend/src/scripts/migrate.js',
    'backend/src/config/env.js',
    'backend/src/config/database.js',
    'backend/src/middleware/rateLimiter.js',
    'backend/src/utils/logger.js',
    'backend/.env.example',
    'frontend/Dockerfile',
    'frontend/nginx.conf',
    'nginx/staging.conf',
    'docker-compose.staging.yml',
    'docs/PRODUCTION_RELEASE_CHECKLIST.md',
    'docs/DEPLOYMENT_AND_RECOVERY.md',
  ];
  for (const f of criticalFiles) {
    assert(`A1. Critical file exists: ${f}`, fs.existsSync(path.join(REPO_ROOT, f)));
  }

  const gitignorePath = path.join(REPO_ROOT, '.gitignore');
  const backendGitignorePath = path.join(BACKEND_ROOT, '.gitignore');
  const gitignoreContent = [gitignorePath, backendGitignorePath]
    .filter(fs.existsSync)
    .map((p) => fs.readFileSync(p, 'utf8'))
    .join('\n');
  assert('A2. .gitignore excludes .env files', gitignoreContent.includes('.env'));
  assert('A2. .gitignore does not exclude .env.example', !gitignoreContent.includes('*.env.example'));

  const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND_ROOT, 'package.json'), 'utf8'));
  assert('A3. package.json has "start" script', typeof pkg.scripts?.start === 'string');
  assert('A3. package.json has "migrate" script', typeof pkg.scripts?.migrate === 'string');
  assert('A3. package.json has "seed" script', typeof pkg.scripts?.seed === 'string');
  assert('A3. package.json has "test" script', typeof pkg.scripts?.test === 'string');
  assert('A3. package.json has "test:phase5g" script', typeof pkg.scripts?.['test:phase5g'] === 'string');
  assert('A3. package.json specifies node >=18 engine', !!(pkg.engines?.node));

  const backendDockerfile = fs.readFileSync(path.join(REPO_ROOT, 'backend/Dockerfile'), 'utf8');
  assert('A4. Backend Dockerfile uses multi-stage build (AS base, AS runner)', backendDockerfile.includes('AS base') && backendDockerfile.includes('AS runner'));
  assert('A4. Backend Dockerfile creates and switches to non-root user (vahangrid)', backendDockerfile.includes('adduser') && backendDockerfile.includes('USER vahangrid'));
  assert('A4. Backend Dockerfile defines HEALTHCHECK on /health/liveness', backendDockerfile.includes('HEALTHCHECK') && backendDockerfile.includes('/health/liveness'));
  assert('A4. Backend Dockerfile uses node:20-alpine base', backendDockerfile.includes('node:20-alpine'));
  assert('A4. Backend Dockerfile uses npm ci --omit=dev (production install)', backendDockerfile.includes('npm ci --omit=dev'));

  const frontendDockerfile = fs.readFileSync(path.join(REPO_ROOT, 'frontend/Dockerfile'), 'utf8');
  const frontendNginx = fs.readFileSync(path.join(REPO_ROOT, 'frontend/nginx.conf'), 'utf8');
  assert('A5. Frontend Dockerfile uses multi-stage build (builder stage)', frontendDockerfile.includes('AS builder'));
  assert('A5. Frontend NGINX uses SPA fallback routing (try_files $uri $uri/ /index.html)', frontendNginx.includes('try_files $uri $uri/ /index.html'));
  assert('A5. Frontend NGINX configures immutable caching for /assets/', frontendNginx.includes('/assets/') && frontendNginx.includes('immutable'));

  const stagingNginx = fs.readFileSync(path.join(REPO_ROOT, 'nginx/staging.conf'), 'utf8');
  assert('A6. Staging NGINX enforces HTTPS redirect from HTTP', stagingNginx.includes('return 301 https://$host$request_uri'));
  assert('A6. Staging NGINX enforces TLSv1.2 and TLSv1.3', stagingNginx.includes('ssl_protocols TLSv1.2 TLSv1.3;'));
  assert('A6. Staging NGINX sets HSTS header', stagingNginx.includes('Strict-Transport-Security'));
  assert('A6. Staging NGINX prevents clickjacking (X-Frame-Options)', stagingNginx.includes('X-Frame-Options'));
  assert('A6. Staging NGINX prevents MIME sniffing (X-Content-Type-Options)', stagingNginx.includes('X-Content-Type-Options'));
  assert('A6. Staging NGINX routes /ocpp/ with WebSocket upgrade and 3600s timeout',
    stagingNginx.includes('proxy_set_header Upgrade $http_upgrade') && stagingNginx.includes('proxy_read_timeout 3600s'));
  assert('A6. Staging NGINX does not expose database port (5432)', !stagingNginx.includes('5432'));

  const composeContent = fs.readFileSync(path.join(REPO_ROOT, 'docker-compose.staging.yml'), 'utf8');
  assert('A7. Compose uses PostGIS 16 Alpine image', composeContent.includes('postgis/postgis:16-3.4-alpine'));
  assert('A7. Compose persistent volume pgdata_staging is defined', composeContent.includes('pgdata_staging'));
  assert('A7. Compose db service has pg_isready healthcheck', composeContent.includes('pg_isready'));
  assert('A7. Compose does not expose database port to host (no "5432:5432")', !composeContent.includes('"5432:5432"'));
  assert('A7. Compose migration depends on db service_healthy', composeContent.includes('service_healthy'));
  assert('A7. Compose backend waits for migration service_completed_successfully', composeContent.includes('service_completed_successfully'));

  // ─────────────────────────────────────────────────────────────────────────
  // B. Security Boundary Hardening (Live Server + Source Audit)
  // ─────────────────────────────────────────────────────────────────────────
  section('B. Security Boundary Hardening');

  const appJsContent = fs.readFileSync(path.join(BACKEND_ROOT, 'src/app.js'), 'utf8');
  const healthMountPos = appJsContent.indexOf("use('/health', healthRouter)");
  const rateLimitMountPos = appJsContent.indexOf("use('/api/v1', globalApiLimiter)");
  assert('B1. /health routes registered before globalApiLimiter in app.js',
    healthMountPos !== -1 && rateLimitMountPos !== -1 && healthMountPos < rateLimitMountPos);
  assert('B2. app.js preserves req.rawBody in express.json verify callback', appJsContent.includes('req.rawBody = buf'));
  assert('B3. app.js does not set CORS wildcard origin (*)', !appJsContent.includes("origin: '*'") && !appJsContent.includes("origin:'*'"));
  const helmetPos = appJsContent.indexOf('app.use(helmet())');
  assert('B4. Helmet middleware applied before route registration', helmetPos !== -1 && helmetPos < Math.min(healthMountPos, rateLimitMountPos));

  const livenessRes = await fetchJson(`${BASE_URL}/health/liveness`);
  assert('B5. GET /health/liveness returns 200', livenessRes.status === 200);
  assert('B5. GET /health/liveness body contains status: ok', livenessRes.data?.status === 'ok');
  assert('B5. GET /health/liveness body contains service name', typeof livenessRes.data?.service === 'string');

  const readinessRes = await fetchJson(`${BASE_URL}/health/readiness`);
  assert('B6. GET /health/readiness returns 200', readinessRes.status === 200);
  assert('B6. GET /health/readiness body contains status: ready', readinessRes.data?.status === 'ready');
  assert('B6. GET /health/readiness body confirms database connected', readinessRes.data?.database === 'connected');

  const healthRes = await fetchJson(`${BASE_URL}/health`);
  assert('B7. GET /health returns 200', healthRes.status === 200);
  assert('B7. GET /health reports status: healthy', healthRes.data?.status === 'healthy');
  assert('B7. GET /health reports postgis: enabled', healthRes.data?.postgis === 'enabled');
  assert('B7. GET /health includes uptimeSeconds', typeof healthRes.data?.uptimeSeconds === 'number');
  assert('B7. GET /health does not leak DATABASE_URL or password strings',
    !JSON.stringify(healthRes.data || {}).toLowerCase().includes('password') &&
    !JSON.stringify(healthRes.data || {}).toLowerCase().includes('postgres://'));

  const unauthRes = await fetchJson(`${API_URL}/auth/me`);
  assert('B8. GET /api/v1/auth/me without token returns 401', unauthRes.status === 401);
  assert('B8. Error code is MISSING_TOKEN', unauthRes.data?.error?.code === 'MISSING_TOKEN');

  const oversizedPayload = JSON.stringify({ data: 'x'.repeat(110 * 1024) });
  const oversizedRes = await fetchJson(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: oversizedPayload,
  });
  assert('B9. Oversized request body (>100kb) is rejected (413 or 400)', oversizedRes.status === 413 || oversizedRes.status === 400);

  const xFrameOptions = livenessRes.headers.get('x-frame-options');
  const xContentType = livenessRes.headers.get('x-content-type-options');
  assert('B10. X-Frame-Options header set by Helmet', typeof xFrameOptions === 'string' && xFrameOptions.length > 0);
  assert('B10. X-Content-Type-Options header set by Helmet', xContentType === 'nosniff');

  // ─────────────────────────────────────────────────────────────────────────
  // C. Logger & PII Redaction
  // ─────────────────────────────────────────────────────────────────────────
  section('C. Logger & PII Redaction');

  assert('C1. maskEmail masks local part correctly', maskEmail('driver@example.com') === 'd***@example.com');
  assert('C1. maskEmail handles single-char local', maskEmail('a@example.com') === '*@example.com');
  assert('C1. maskEmail handles non-string gracefully', maskEmail(null) === null);
  assert('C1. maskEmail returns [REDACTED_EMAIL] for missing @ symbol', maskEmail('notanemail') === '[REDACTED_EMAIL]');

  assert('C2. maskPhone masks all but last 4 digits', maskPhone('+919876543210') === '******3210');
  assert('C2. maskPhone handles short input as ****', maskPhone('123') === '****');
  assert('C2. maskPhone passes through non-string values', maskPhone(42) === 42);

  const loggedCreds = sanitizeLogData({ password: 'SuperSecret123', email: 'user@vahangrid.com' });
  assert('C3. sanitizeLogData redacts password field', loggedCreds.password === '[REDACTED]');
  assert('C3. sanitizeLogData masks email field (u***@...)', loggedCreds.email?.startsWith('u***@') === true);

  const loggedAuth = sanitizeLogData({ authorization: 'Bearer eyJ...', token: 'tok123', vg_token: 'cookie_val' });
  assert('C4. sanitizeLogData redacts authorization header', loggedAuth.authorization === '[REDACTED]');
  assert('C4. sanitizeLogData redacts token field', loggedAuth.token === '[REDACTED]');
  assert('C4. sanitizeLogData redacts vg_token field', loggedAuth.vg_token === '[REDACTED]');

  const sanitizedBearer = sanitizeLogData('Bearer eyJhbGciOiJIUzI1NiJ9.abc');
  assert('C5. sanitizeLogData redacts Bearer token strings', sanitizedBearer === 'Bearer [REDACTED]');

  const sanitizedCookie = sanitizeLogData('vg_token=eyJhbGciOiJIUzI1NiJ9; Path=/; HttpOnly');
  assert('C6. sanitizeLogData redacts vg_token in cookie strings',
    sanitizedCookie.includes('vg_token=[REDACTED]') && !sanitizedCookie.includes('eyJ'));

  const nested = sanitizeLogData({ user: { password: 'abc', email: 'admin@vahangrid.com', phone: '+919876543210' } });
  assert('C7. sanitizeLogData redacts password in nested object', nested.user?.password === '[REDACTED]');
  assert('C7. sanitizeLogData masks email in nested object', nested.user?.email?.includes('***') === true);
  assert('C7. sanitizeLogData masks phone in nested object', nested.user?.phone?.includes('***') === true);

  const plain = sanitizeLogData({ userId: 'uuid-123', amount: 1000 });
  assert('C8. sanitizeLogData passes through non-sensitive userId', plain.userId === 'uuid-123');
  assert('C8. sanitizeLogData passes through numeric amount', plain.amount === 1000);

  // ─────────────────────────────────────────────────────────────────────────
  // D. Environment Validation Hardening
  // ─────────────────────────────────────────────────────────────────────────
  section('D. Environment Validation Hardening');

  const d1 = validateEnvironment({ JWT_SECRET: 'a_very_secure_jwt_secret_that_is_long_enough' });
  assert('D1. validateEnvironment fails when DATABASE_URL is missing', !d1.valid);
  assert('D1. Error mentions DATABASE_URL', d1.errors.some((e) => e.includes('DATABASE_URL')));

  const d2 = validateEnvironment({ DATABASE_URL: 'postgresql://user:pass@localhost/db' });
  assert('D2. validateEnvironment fails when JWT_SECRET is missing', !d2.valid);
  assert('D2. Error mentions JWT_SECRET', d2.errors.some((e) => e.includes('JWT_SECRET')));

  const d3 = validateEnvironment({ DATABASE_URL: 'mysql://user:pass@localhost/db', JWT_SECRET: 'secure_secret_32_chars_minimum_ok' });
  assert('D3. validateEnvironment rejects non-PostgreSQL DATABASE_URL', !d3.valid);
  assert("D3. Error mentions postgresql://", d3.errors.some((e) => e.toLowerCase().includes('postgresql')));

  const d4 = validateEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@h/d', JWT_SECRET: 'tooshort' });
  assert('D4. validateEnvironment fails with short JWT_SECRET in production (<32 chars)', !d4.valid);
  assert('D4. Error mentions 32 characters', d4.errors.some((e) => e.includes('32')));

  const d5 = validateEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@h/d', JWT_SECRET: 'this_is_a_super_secret_password_placeholder' });
  assert('D5. validateEnvironment rejects placeholder JWT_SECRET in production', !d5.valid);

  const d6 = validateEnvironment({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://vahangrid_admin:high_entropy_pass@db:5432/vahangrid',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  });
  assert('D6. validateEnvironment passes with valid production config', d6.valid);
  assert('D6. No errors reported for valid production config', d6.errors.length === 0);

  // ─────────────────────────────────────────────────────────────────────────
  // E. Seed Guard Verification
  // ─────────────────────────────────────────────────────────────────────────
  section('E. Seed Guard Verification');

  let seedExitCode = null;
  try {
    await execFileAsync('node', ['src/scripts/seed.js'], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, NODE_ENV: 'production' },
    });
    seedExitCode = 0;
  } catch (err) {
    seedExitCode = err.code;
  }
  assert('E1. seed.js exits code 1 when NODE_ENV=production', seedExitCode === 1);

  // ─────────────────────────────────────────────────────────────────────────
  // F. OCPP WebSocket Gateway Resilience (Live)
  // ─────────────────────────────────────────────────────────────────────────
  section('F. OCPP WebSocket Gateway Resilience');

  const TEST_CP_ID = `vg-phase5g-rc-${Date.now()}`;
  let wsOpenOk = false;
  let bootAccepted = false;
  let reconnectOk = false;

  await new Promise((resolve) => {
    const ws1 = new WebSocket(`${WS_URL}/ocpp/${TEST_CP_ID}`, ['ocpp2.0.1']);
    const timeout = setTimeout(() => { console.error('  FAIL: WS connection timed out'); resolve(); }, 8000);

    ws1.on('open', () => {
      wsOpenOk = true;
      const msgId = crypto.randomUUID();
      ws1.send(JSON.stringify([2, msgId, 'BootNotification', {
        reason: 'PowerUp',
        chargingStation: { model: 'VG-RC-TESTER', vendorName: 'VahanGrid' },
      }]));
    });

    ws1.on('message', (rawMsg) => {
      clearTimeout(timeout);
      try {
        const msg = JSON.parse(rawMsg.toString());
        if (Array.isArray(msg) && msg[0] === 3) bootAccepted = msg[2]?.status === 'Accepted';
      } catch { /* ignore */ }
      ws1.close();
      resolve();
    });

    ws1.on('error', (err) => { clearTimeout(timeout); console.error('  WS error:', err.message); resolve(); });
  });

  assert('F1. OCPP WebSocket connection to /ocpp/<chargePointId> succeeds', wsOpenOk);
  assert('F1. OCPP 2.0.1 BootNotification CALLRESULT returns Accepted status', bootAccepted);

  // Allow server-side WebSocket cleanup to complete before reconnect attempt
  await new Promise((r) => setTimeout(r, 600));

  await new Promise((resolve) => {
    const ws2 = new WebSocket(`${WS_URL}/ocpp/${TEST_CP_ID}`, ['ocpp2.0.1']);
    const timeout = setTimeout(() => { console.error('  FAIL: Reconnect timed out'); resolve(); }, 8000);

    ws2.on('open', () => {
      ws2.send(JSON.stringify([2, crypto.randomUUID(), 'BootNotification', {
        reason: 'RemoteReset',
        chargingStation: { model: 'VG-RC-TESTER', vendorName: 'VahanGrid' },
      }]));
    });

    ws2.on('message', (rawMsg) => {
      clearTimeout(timeout);
      try {
        const msg = JSON.parse(rawMsg.toString());
        if (Array.isArray(msg) && msg[0] === 3) reconnectOk = msg[2]?.status === 'Accepted';
      } catch { /* ignore */ }
      ws2.close();
      resolve();
    });

    ws2.on('error', (err) => { clearTimeout(timeout); console.error('  Reconnect WS error:', err.message); resolve(); });
  });

  assert('F2. Charger reconnect to same chargePointId succeeds and returns Accepted', reconnectOk);

  await new Promise((r) => setTimeout(r, 800));
  const cpState = await query("SELECT status FROM ocpp_charge_points WHERE charge_point_id = $1", [TEST_CP_ID]);
  assert('F3. Charge point DB record updated to online after reconnect', cpState.rows[0]?.status === 'online');

  // ─────────────────────────────────────────────────────────────────────────
  // G. Database & PostGIS Migration Integrity (Live)
  // ─────────────────────────────────────────────────────────────────────────
  section('G. Database & PostGIS Migration Integrity');

  const migResult = await query('SELECT count(*)::int AS count FROM schema_migrations');
  assert('G1. All 22 schema migrations are present', migResult.rows[0]?.count === 22);

  const migNames = await query('SELECT name AS migration_name FROM schema_migrations ORDER BY name ASC');
  const expectedPrefixes = Array.from({ length: 22 }, (_, i) => String(i + 1).padStart(3, '0'));
  const actualPrefixes = migNames.rows.map((r) => r.migration_name?.slice(0, 3));
  assert('G2. Migrations are sequential with no gaps (001–022)', expectedPrefixes.every((p, i) => actualPrefixes[i] === p));

  const postgisResult = await query("SELECT extname FROM pg_extension WHERE extname = 'postgis'");
  assert('G3. PostGIS spatial extension is active', postgisResult.rows.length === 1);

  const spatialResult = await query(`
    SELECT name,
           ROUND(ST_Distance(location, ST_SetSRID(ST_MakePoint(77.2090, 28.6139), 4326)::geography)::numeric, 1) AS dist_meters
    FROM locations WHERE location IS NOT NULL LIMIT 1;
  `);
  assert('G4. ST_Distance geography calculation succeeds on locations table',
    spatialResult.rows.length > 0 && !isNaN(parseFloat(spatialResult.rows[0]?.dist_meters)));

  const pingResult = await query('SELECT 1 AS ping');
  assert('G5. Database connection pool SELECT 1 health-ping succeeds', pingResult.rows[0]?.ping === 1);

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`  Phase 5G Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  await pool.end();

  if (failed > 0) {
    console.error(`\u274c ${failed} checks failed:`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  } else {
    console.log('\u{1f389} All Phase 5G release candidate hardening checks passed!\n');
    process.exit(0);
  }
}

runPhase5gAudit().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
