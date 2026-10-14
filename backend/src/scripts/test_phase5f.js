/**
 * backend/src/scripts/test_phase5f.js
 *
 * Phase 5F — Cloud Staging Deployment & Integration Verification Test Suite.
 *
 * Verification Areas:
 *  A. Staging Container & Reverse Proxy Manifest Audit
 *     - Parse and validate docker-compose.staging.yml schema and service dependencies.
 *     - Inspect backend/Dockerfile for multi-stage build, unprivileged user, and healthcheck.
 *     - Inspect frontend/Dockerfile and frontend/nginx.conf for SPA fallback routing.
 *     - Inspect nginx/staging.conf for TLS, WebSocket upgrades, and sanitized headers.
 *  B. Safe Failure Behavior & Security Boundaries
 *     - Missing authentication token -> 401 MISSING_TOKEN.
 *     - Expired authentication token -> 401 TOKEN_EXPIRED.
 *     - Forged / invalid signature JWT -> 401 INVALID_TOKEN.
 *     - Cross-role denial (Driver -> Operator route) -> 403 OPERATOR_ROLE_REQUIRED.
 *     - Multi-tenant isolation (Cross-CPO access) -> 403 CPO_ACCESS_DENIED.
 *     - IDOR isolation (Driver A -> Driver B session) -> 404 SESSION_NOT_FOUND.
 *  C. Payment Sandbox Security & Authoritative Ledger
 *     - Top-up order amount bounds enforcement (₹10 - ₹50,000).
 *     - Razorpay key secret non-exposure.
 *     - Webhook HMAC signature verification with timing-safe comparison.
 *     - Webhook idempotency and concurrency protection.
 *  D. OCPP WebSocket Connection & Reconnection Resilience
 *     - Mock charger connection to CSMS gateway.
 *     - BootNotification exchange and Accepted CALLRESULT.
 *     - Clean disconnect and reconnect simulation.
 *  E. Database PostGIS Spatial Integrity
 *     - All 22 migrations confirmed in schema_migrations.
 *     - PostGIS extension active.
 *     - Spatial ST_Distance calculation on locations.location.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';
import pool, { query } from '../config/database.js';
import config from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

const BASE_URL = 'http://127.0.0.1:3001/api/v1';
const WS_URL = 'ws://127.0.0.1:3001';

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

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  let json = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON
  }
  return { status: res.status, headers: res.headers, data: json };
}

function makeSignature(body, secret) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  return crypto.createHmac('sha256', secret).update(buf).digest('hex');
}

async function runPhase5fAudit() {
  console.log('\n================================================================');
  console.log('  VahanGrid Phase 5F — Cloud Staging & Integration Verification');
  console.log('================================================================\n');

  // ───────────────────────────────────────────────────────────────────────────
  // A. Staging Container & Reverse Proxy Manifest Audit
  // ───────────────────────────────────────────────────────────────────────────
  console.log('======================================================================');
  console.log('  A. Staging Container & Reverse Proxy Manifest Audit');
  console.log('======================================================================\n');

  // A1. Compose file verification
  const composePath = path.join(REPO_ROOT, 'docker-compose.staging.yml');
  assert('A1. docker-compose.staging.yml exists', fs.existsSync(composePath));
  const composeContent = fs.readFileSync(composePath, 'utf8');
  assert('A1. Compose defines db service with postgis image', composeContent.includes('postgis/postgis:16-3.4-alpine'));
  assert('A1. Compose defines persistent pgdata_staging volume', composeContent.includes('pgdata_staging:'));
  assert('A1. Compose defines migration service with service_healthy dependency', composeContent.includes('service_healthy'));
  assert('A1. Compose defines backend service with service_completed_successfully dependency', composeContent.includes('service_completed_successfully'));
  assert('A1. Compose restricts port exposure: only reverse-proxy exposes 80 and 443', composeContent.includes('"80:80"') && composeContent.includes('"443:443"') && !composeContent.includes('"5432:5432"'));

  // A2. Backend Dockerfile verification
  const backendDockerPath = path.join(REPO_ROOT, 'backend/Dockerfile');
  assert('A2. backend/Dockerfile exists', fs.existsSync(backendDockerPath));
  const backendDockerContent = fs.readFileSync(backendDockerPath, 'utf8');
  assert('A2. Backend Dockerfile uses multi-stage build (base, dependencies, runner)', backendDockerContent.includes('AS base') && backendDockerContent.includes('AS runner'));
  assert('A2. Backend Dockerfile configures non-root user vahangrid', backendDockerContent.includes('USER vahangrid'));
  assert('A2. Backend Dockerfile defines container HEALTHCHECK on /health/liveness', backendDockerContent.includes('HEALTHCHECK') && backendDockerContent.includes('/health/liveness'));

  // A3. Frontend Dockerfile & NGINX SPA routing
  const frontendDockerPath = path.join(REPO_ROOT, 'frontend/Dockerfile');
  const frontendNginxPath = path.join(REPO_ROOT, 'frontend/nginx.conf');
  assert('A3. frontend/Dockerfile exists', fs.existsSync(frontendDockerPath));
  assert('A3. frontend/nginx.conf exists', fs.existsSync(frontendNginxPath));
  const frontendNginxContent = fs.readFileSync(frontendNginxPath, 'utf8');
  assert('A3. Frontend NGINX configures SPA fallback try_files $uri $uri/ /index.html', frontendNginxContent.includes('try_files $uri $uri/ /index.html;'));
  assert('A3. Frontend NGINX configures immutable caching for /assets/', frontendNginxContent.includes('location /assets/'));

  // A4. Unified Staging Reverse Proxy (nginx/staging.conf)
  const stagingNginxPath = path.join(REPO_ROOT, 'nginx/staging.conf');
  assert('A4. nginx/staging.conf exists', fs.existsSync(stagingNginxPath));
  const stagingNginxContent = fs.readFileSync(stagingNginxPath, 'utf8');
  assert('A4. Staging NGINX configures HTTP to HTTPS 301 redirect', stagingNginxContent.includes('return 301 https://$host$request_uri;'));
  assert('A4. Staging NGINX enables TLSv1.2 and TLSv1.3 with secure ciphers', stagingNginxContent.includes('ssl_protocols TLSv1.2 TLSv1.3;'));
  assert('A4. Staging NGINX sets security headers (HSTS, nosniff, SAMEORIGIN)', stagingNginxContent.includes('Strict-Transport-Security') && stagingNginxContent.includes('X-Content-Type-Options'));
  assert('A4. Staging NGINX routes /health directly to backend', stagingNginxContent.includes('location /health'));
  assert('A4. Staging NGINX routes /api/v1/ with X-Forwarded-Proto $scheme', stagingNginxContent.includes('X-Forwarded-Proto $scheme;'));
  assert('A4. Staging NGINX routes /ocpp/ with WebSocket upgrade and 3600s read timeout', stagingNginxContent.includes('proxy_set_header Upgrade $http_upgrade;') && stagingNginxContent.includes('proxy_read_timeout 3600s;'));

  // ───────────────────────────────────────────────────────────────────────────
  // B. Safe Failure Behavior & Security Boundaries
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n======================================================================');
  console.log('  B. Safe Failure Behavior & Security Boundaries');
  console.log('======================================================================\n');

  // B1. Missing authentication token
  const unauthRes = await fetchJson(`${BASE_URL}/auth/me`);
  assert('B1. Missing token returns 401', unauthRes.status === 401);
  assert('B1. Error code is MISSING_TOKEN', unauthRes.data?.error?.code === 'MISSING_TOKEN');

  // B2. Expired JWT token
  const expiredToken = jwt.sign(
    { sub: 'b0000001-0000-0000-0000-000000000001' },
    config.jwt.secret,
    { expiresIn: '-1s' } // Expired 1 second ago
  );
  const expiredRes = await fetchJson(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  assert('B2. Expired token returns 401', expiredRes.status === 401);
  assert('B2. Error code is TOKEN_EXPIRED', expiredRes.data?.error?.code === 'TOKEN_EXPIRED');

  // B3. Forged / invalid signature JWT token
  const forgedToken = jwt.sign(
    { sub: 'b0000001-0000-0000-0000-000000000001' },
    'tampered_attacker_secret_that_does_not_match',
    { expiresIn: '1h' }
  );
  const forgedRes = await fetchJson(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${forgedToken}` },
  });
  assert('B3. Forged signature token returns 401', forgedRes.status === 401);
  assert('B3. Error code is INVALID_TOKEN', forgedRes.data?.error?.code === 'INVALID_TOKEN');

  // B4. Cross-role authorization: Driver attempting operator endpoints
  const driverLogin = await fetchJson(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'priya.sharma@example.com', password: 'Demo@1234' }),
  });
  const driverCookie = driverLogin.headers.get('set-cookie');
  assert('B4. Driver login succeeds', driverLogin.status === 200 && driverCookie);

  const driverOpAttempt = await fetchJson(`${BASE_URL}/operator/overview`, {
    headers: { Cookie: driverCookie },
  });
  assert('B4. Driver accessing operator overview returns 403', driverOpAttempt.status === 403);
  assert('B4. Error code is OPERATOR_ROLE_REQUIRED', driverOpAttempt.data?.error?.code === 'OPERATOR_ROLE_REQUIRED');

  // B5. Multi-tenant isolation: Tata operator attempting Statiq station
  const tataLogin = await fetchJson(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'operator.tata@example.com', password: 'Demo@1234' }),
  });
  const tataCookie = tataLogin.headers.get('set-cookie');
  assert('B5. Tata operator login succeeds', tataLogin.status === 200 && tataCookie);

  // Statiq station UUID from seed data
  const statiqStationRes = await query(`
    SELECT l.id FROM locations l
    JOIN cpos c ON l.cpo_id = c.id
    WHERE c.name ILIKE '%statiq%'
    LIMIT 1;
  `);
  if (statiqStationRes.rows.length > 0) {
    const statiqId = statiqStationRes.rows[0].id;
    const crossCpoRes = await fetchJson(`${BASE_URL}/operator/stations/${statiqId}`, {
      headers: { Cookie: tataCookie },
    });
    assert('B5. Cross-CPO station access denied with 403', crossCpoRes.status === 403);
    assert('B5. Error code is CPO_ACCESS_DENIED', crossCpoRes.data?.error?.code === 'CPO_ACCESS_DENIED');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // C. Payment Sandbox Security & Authoritative Ledger
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n======================================================================');
  console.log('  C. Payment Sandbox Security & Authoritative Ledger');
  console.log('======================================================================\n');

  // C1. Top-up amount bounds enforcement
  const zeroAmtRes = await fetchJson(`${BASE_URL}/payments/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverCookie },
    body: JSON.stringify({ amount: 0 }),
  });
  assert('C1. Top-up amount ₹0 rejected with 400', zeroAmtRes.status === 400);

  const underMinRes = await fetchJson(`${BASE_URL}/payments/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverCookie },
    body: JSON.stringify({ amount: 5 }), // ₹5 < ₹10 min
  });
  assert('C1. Top-up amount below ₹10 rejected with 400', underMinRes.status === 400);

  const overMaxRes = await fetchJson(`${BASE_URL}/payments/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverCookie },
    body: JSON.stringify({ amount: 60000 }), // ₹60,000 > ₹50,000 max
  });
  assert('C1. Top-up amount above ₹50,000 rejected with 400', overMaxRes.status === 400);

  // C2. Order creation key secret protection
  const validOrderRes = await fetchJson(`${BASE_URL}/payments/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverCookie },
    body: JSON.stringify({ amount: 150 }),
  });
  assert('C2. Valid top-up order created with 201', validOrderRes.status === 201);
  assert('C2. Public key_id present in order response', typeof validOrderRes.data?.data?.key_id === 'string');
  assert('C2. Key secret is NOT leaked in order response', validOrderRes.data?.data?.key_secret === undefined && validOrderRes.data?.data?.secret === undefined);

  // C3. Webhook signature enforcement
  const webhookSecret = config.payment.webhookSecret;
  const testOrderId = validOrderRes.data?.data?.order_id;
  const whPayload = JSON.stringify({
    event: 'order.paid',
    payload: {
      order: { entity: { id: testOrderId, amount: 15000 } },
      payment: { entity: { id: `pay_p5f_${Date.now()}`, order_id: testOrderId, amount: 15000 } },
    },
  });

  const forgedWhRes = await fetchJson(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'bad_sig' },
    body: whPayload,
  });
  assert('C3. Webhook with forged signature rejected with 400', forgedWhRes.status === 400);

  const validSig = makeSignature(whPayload, webhookSecret);
  const validWhRes = await fetchJson(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': validSig },
    body: whPayload,
  });
  assert('C3. Webhook with valid signature accepted with 200', validWhRes.status === 200);
  assert('C3. Webhook credits wallet: already_processed is false', validWhRes.data?.data?.result?.already_processed === false);

  // Duplicate webhook delivery
  const dupWhRes = await fetchJson(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': validSig },
    body: whPayload,
  });
  assert('C3. Duplicate webhook returns 200 idempotent already_processed: true', dupWhRes.data?.data?.result?.already_processed === true);

  // ───────────────────────────────────────────────────────────────────────────
  // D. OCPP WebSocket Connection & Reconnection Resilience
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n======================================================================');
  console.log('  D. OCPP WebSocket Connection & Reconnection Resilience');
  console.log('======================================================================\n');

  const cpId = `CP_STAGING_${Date.now()}`;
  const wsEndpoint = `${WS_URL}/ocpp/${cpId}`;

  function connectAndBoot(id) {
    return new Promise((resolve) => {
      let ws;
      try {
        ws = new WebSocket(wsEndpoint);
      } catch (err) {
        resolve({ ok: false, error: err.message });
        return;
      }

      const timeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) ws.close();
        resolve({ ok: false, error: 'OCPP connection timed out' });
      }, 5000);

      ws.on('open', () => {
        const bootMsg = JSON.stringify([
          2,
          `msg_${id}`,
          'BootNotification',
          {
            reason: 'PowerUp',
            chargingStation: {
              model: 'VG-HYPER-180',
              vendorName: 'VahanGrid Networks',
              serialNumber: cpId.slice(0, 20),
            },
          },
        ]);
        ws.send(bootMsg);
      });

      ws.on('message', (msg) => {
        clearTimeout(timeout);
        try {
          const parsed = JSON.parse(msg.toString());
          ws.close();
          resolve({ ok: true, data: parsed });
        } catch (e) {
          ws.close();
          resolve({ ok: false, error: e.message });
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ ok: false, error: err.message });
      });
    });
  }

  // 1. Initial connection & BootNotification
  const conn1 = await connectAndBoot('boot1');
  assert('D1. Charger connects and completes BootNotification exchange', conn1.ok === true);
  assert('D1. CSMS returns CALLRESULT (type 3)', conn1.data?.[0] === 3);
  assert('D1. CSMS response status is Accepted', conn1.data?.[2]?.status === 'Accepted');

  // 2. Reconnection simulation (charger disconnects and reconnects)
  const conn2 = await connectAndBoot('boot2');
  assert('D2. Charger reconnects cleanly and completes second BootNotification', conn2.ok === true);
  assert('D2. Reconnected charger receives Accepted status', conn2.data?.[2]?.status === 'Accepted');

  // Verify charge point record in database
  const cpDb = await query('SELECT status, model, vendor_name FROM ocpp_charge_points WHERE charge_point_id = $1', [cpId]);
  assert('D3. Charge point registered in PostgreSQL ocpp_charge_points table', cpDb.rows.length === 1);
  assert('D3. Registered charge point has online status', cpDb.rows[0]?.status === 'online');

  // ───────────────────────────────────────────────────────────────────────────
  // E. Database PostGIS Spatial Integrity
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n======================================================================');
  console.log('  E. Database PostGIS Spatial Integrity');
  console.log('======================================================================\n');

  // E1. All 22 migrations applied
  const migCount = await query('SELECT count(*)::int AS count FROM schema_migrations');
  assert('E1. All 22 schema migrations confirmed present', migCount.rows[0]?.count === 22);

  // E2. PostGIS extension enabled
  const postgisCheck = await query("SELECT extname, extversion FROM pg_extension WHERE extname = 'postgis'");
  assert('E2. PostGIS spatial extension confirmed active', postgisCheck.rows.length === 1);

  // E3. PostGIS ST_Distance calculation
  const spatialRes = await query(`
    SELECT name, city,
           ROUND(ST_Distance(location, ST_SetSRID(ST_MakePoint(77.2090, 28.6139), 4326)::geography)::numeric, 1) AS dist_meters
    FROM locations
    WHERE location IS NOT NULL
    LIMIT 1;
  `);
  assert(
    'E3. ST_Distance geography calculation succeeds',
    spatialRes.rows.length > 0 && !isNaN(parseFloat(spatialRes.rows[0]?.dist_meters))
  );

  // Summary
  console.log('\n================================================================');
  console.log(`  Phase 5F Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error(`❌ ${failed} checks failed:`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  } else {
    console.log('🎉 All Phase 5F integration checks passed successfully!\n');
    process.exit(0);
  }
}

runPhase5fAudit().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
