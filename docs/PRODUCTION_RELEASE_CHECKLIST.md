# VahanGrid — Production Release Checklist

> **Scope**: This checklist documents the verified pre-release state of the VahanGrid platform
> as of the Phase 5C production readiness audit. Each item is sourced from actual code and
> configuration — no assumption is made about services or infrastructure not present in the
> repository.
>
> **Authority**: A release may proceed only after every **REQUIRED** item is checked.  
> **OPTIONAL** items are recommended but are not blocking.

---

## 0. Pre-Release Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| 0.1 | All regression suites pass (`test_phase5a`, `test_phase4f`, `test_phase4e`, `test_phase3g`) | ✅ Verified | Confirmed passing in Phase 5C audit |
| 0.2 | Frontend production build succeeds with zero warnings (`npm run build`) | ✅ Verified | Vite build clean in Phase 5C audit |
| 0.3 | No `frontend/index.html.bak` or other development artefacts committed | ✅ Enforced | `.gitignore` entry; file is untracked |
| 0.4 | `backend/src/scripts/seed.js` blocked in production (`NODE_ENV === 'production'`) | ✅ Verified | Production guard added in Phase 5C |
| 0.5 | Git working tree is clean on `main` (no uncommitted changes to tracked files) | ⬜ Operator | Verify with `git status` before release |

---

## 1. Environment Configuration

### 1.1 Required Backend Variables (`backend/.env`)

> Template: [`backend/.env.example`](../backend/.env.example)

| Variable | Required | Production Constraint |
|----------|----------|-----------------------|
| `NODE_ENV` | **Yes** | Must be exactly `production` |
| `DATABASE_URL` | **Yes** | Must start with `postgresql://` or `postgres://`; SSL (`?sslmode=require`) recommended |
| `JWT_SECRET` | **Yes** | >= 32 chars; must not contain placeholder words (`secret`, `changeme`, `password`, etc.) |
| `FRONTEND_URL` | **Yes** | Fully-qualified HTTPS origin(s); comma-separated for multiple |
| `JWT_EXPIRES_IN` | No | Defaults to `7d`; shorten for higher-security deployments |
| `PORT` | No | Defaults to `3001`; set to match reverse proxy upstream |
| `TRUST_PROXY` | No | Defaults to `1` in production; match your proxy topology |
| `PAYMENT_PROVIDER` | No | Defaults to `razorpay` |
| `PAYMENT_PROVIDER_KEY` | Conditional | Required when payments are enabled; must use `rzp_live_*` key |
| `PAYMENT_PROVIDER_SECRET` | Conditional | Required when payments are enabled; keep secret |
| `PAYMENT_WEBHOOK_SECRET` | Conditional | Required for Razorpay webhook HMAC verification |

**Checklist**:

- [ ] `NODE_ENV=production` is set in the deployment environment
- [ ] `DATABASE_URL` points to the production PostgreSQL instance with SSL
- [ ] `JWT_SECRET` is >= 32 characters, randomly generated, and does not contain placeholder words
- [ ] `FRONTEND_URL` matches the exact production SPA origin(s) (HTTPS)
- [ ] `PAYMENT_PROVIDER_KEY` uses a live key (`rzp_live_*`), not a test key
- [ ] No `.env` file is committed to the repository; only `.env.example` is tracked

### 1.2 Startup Validation (Automated)

The backend validates critical configuration at startup (`src/config/env.js`):

- **Hard failures** (exits with code `1`):
  - `DATABASE_URL` missing or not a PostgreSQL URI
  - `JWT_SECRET` missing, shorter than 32 chars (in production), or uses placeholder words
- **Warnings**:
  - `JWT_SECRET` shorter than 16 chars in development

> Do NOT suppress startup validation errors or set `NODE_ENV` to `development` in production
> to work around validation — this disables cookie security and JSON-only logging.

---

## 2. Security Audit

### 2.1 Authentication & Session Security

- [ ] `vg_token` cookie is issued with `httpOnly: true`, `sameSite: 'lax'`, `secure: true` (enforced when `NODE_ENV === 'production'`)
- [ ] JWT claims include `sub` (user UUID), `role`, `cpo_id`; no passwords or PII stored in token
- [ ] `JWT_SECRET` is not derivable from public information
- [ ] Sessions are invalidated on logout (cookie cleared server-side via `res.clearCookie`)

### 2.2 CORS & Trusted Proxy

- [ ] `FRONTEND_URL` lists only the intended production origin(s); wildcard (`*`) is never used
- [ ] `TRUST_PROXY` is set correctly for your reverse proxy depth (prevents IP spoofing via `X-Forwarded-For`)
- [ ] All HTTPS traffic is terminated at the reverse proxy; the backend communicates over the internal network only

### 2.3 Rate Limiting & Denial-of-Service

- [ ] Request body size is capped at `100 kb` (enforced by `express.json({ limit: '100kb' })`)
- [ ] Authentication endpoints (`/api/v1/auth/*`) are rate-limited by a reverse proxy or middleware layer before reaching the backend
- [ ] Health probe endpoints are not exposed publicly without network-level protection

### 2.4 Role-Based Access Control

- [ ] All admin routes require `role === 'admin'` via `requireAdmin` middleware
- [ ] All operator routes require `role === 'operator'` via `requireOperator` middleware
- [ ] CPO isolation is enforced — operators can only manage stations belonging to their own `cpo_id`
- [ ] Driver-facing endpoints do not expose other drivers' session data, PII, or wallet balances

### 2.5 Financial Calculation Integrity

- [ ] Wallet debit/credit operations are performed server-side only; client-supplied amounts are never trusted
- [ ] Razorpay payment amounts are computed from the server-authoritative tariff and verified against the signed Razorpay order before funds are captured
- [ ] Webhook authenticity is verified via HMAC-SHA256 (`PAYMENT_WEBHOOK_SECRET`) before any balance is credited

### 2.6 Error Handling & Information Disclosure

- [ ] Production error responses return generic messages (no stack traces, SQL errors, or internal paths)
- [ ] Logger (`src/utils/logger.js`) redacts passwords, tokens, API keys, `authorization` headers, emails, and phone numbers in all log lines
- [ ] `DEBUG` or verbose logging flags are not enabled in production

### 2.7 Development Data Safeguard

- [ ] `backend/src/scripts/seed.js` exits with an error if `NODE_ENV === 'production'`
- [ ] Demo credentials (`Demo@1234`) can ONLY exist in the database after intentionally running the seed script in development; confirm the production database was never seeded with development data

---

## 3. Database & Migration Readiness

### 3.1 Migration Safety

- [ ] All pending migrations are applied before starting the new backend version: `node src/scripts/migrate.js`
- [ ] Migrations are applied in a transaction (`BEGIN ... COMMIT`); failed migrations auto-rollback and halt deployment
- [ ] Migration filenames follow the sequential naming convention (`001_`, `002_`, ...); no gaps exist
- [ ] No destructive DDL runs without a prior schema compatibility window

### 3.2 Connection Pool

- [ ] PostgreSQL connection pool maximum (`max: 10`) is appropriate for the expected concurrent request volume
- [ ] Database server `max_connections` is set above the pool maximum across all backend instances

### 3.3 Backup & Recovery

> Detailed procedures: [`docs/DEPLOYMENT_AND_RECOVERY.md`](./DEPLOYMENT_AND_RECOVERY.md)

- [ ] A full `pg_dump -Fc` backup is taken immediately before migration or deployment
- [ ] The backup file is stored on a different host or object storage (not the database server)
- [ ] Recovery from backup is tested at least once before go-live (`pg_restore -d vahangrid_prod backup.dump`)
- [ ] Point-in-time recovery (WAL archiving) or managed snapshots are enabled for the production database
- [ ] Backup restoration procedure is documented and accessible to the on-call engineer

---

## 4. Release & Deployment Configuration

### 4.1 Backend Startup

```bash
# Apply migrations (run once before starting the new version)
NODE_ENV=production node src/scripts/migrate.js

# Start the server (via process manager or container entrypoint)
NODE_ENV=production node src/server.js
```

- [ ] `node src/scripts/migrate.js` completes without error before the new backend version is started
- [ ] The backend process is managed by a process manager (PM2, systemd, Docker, Kubernetes) that restarts on crash
- [ ] `SIGTERM` graceful shutdown is confirmed: in-flight requests complete, OCPP connections are closed, and the pool is drained within 10 seconds

### 4.2 Frontend Hosting

```bash
# Build production-optimised static assets
cd frontend && npm run build
# Output: frontend/dist/ — serve with NGINX, Caddy, or any static host
```

- [ ] `VITE_API_URL` (or `VITE_BACKEND_URL`) in `frontend/.env.production` points to the production API base URL
- [ ] The SPA `dist/` directory is served with a fallback rule for SPA routing:
  ```nginx
  try_files $uri $uri/ /index.html;
  ```
- [ ] Static assets are served with appropriate `Cache-Control` headers (long TTL for hashed bundles, `no-cache` for `index.html`)

### 4.3 Reverse Proxy Configuration

- [ ] HTTPS is terminated at the reverse proxy; backend receives HTTP on the internal network
- [ ] `X-Forwarded-Proto`, `X-Forwarded-For`, and `X-Real-IP` headers are forwarded to the backend
- [ ] WebSocket upgrades are proxied correctly to the backend for OCPP connections:
  ```nginx
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  ```
- [ ] HSTS (`Strict-Transport-Security`) is set with at least `max-age=31536000`
- [ ] TLS certificate covers all production domains and is set to auto-renew

### 4.4 Health Probes

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /health/liveness` | Container heartbeat | `200 { "status": "ok" }` |
| `GET /health/readiness` | DB connectivity | `200 { "status": "ready" }` or `503` |
| `GET /health` | Full component check | `200 { "status": "healthy" }` or `503` |

- [ ] Liveness probe is configured in the container orchestrator with an appropriate failure threshold
- [ ] Readiness probe is used by the load balancer to drain traffic from unhealthy instances before replacement

---

## 5. OCPP Integration

- [ ] OCPP WebSocket endpoint (`ws[s]://<host>/ocpp/<charge-point-id>`) is reachable from charger hardware
- [ ] TLS is terminated at the reverse proxy for `wss://` connections
- [ ] Charge-point ID format and authentication match the hardware provisioning configuration
- [ ] CDR (Charge Detail Record) creation is validated end-to-end in staging before go-live
- [ ] OCPP session recovery (orphaned `CHARGING` sessions) is exercised and confirmed

---

## 6. Observability

- [ ] Structured JSON logs are shipped to a log aggregator (CloudWatch, Datadog, Grafana Loki, etc.)
- [ ] Log retention policy is defined (minimum 30 days recommended)
- [ ] `/health` endpoint is monitored externally with alerting on `503` responses
- [ ] Database CPU, connection count, and disk usage are monitored with alert thresholds
- [ ] An on-call rotation or escalation path is defined for production incidents

---

## 7. Regression Test Results (Phase 5F)

All test suites were executed against the local development stack as part of the Phase 5F integration verification:

| Suite | File | Result | Count |
|-------|------|--------|-------|
| Phase 5F — Cloud Staging & Integration Verification | `test_phase5f.js` | ✅ PASS | 53/53 |
| Phase 5E — Remote Deployment Readiness & Release Verification | `test_phase5e.js` | ✅ PASS | 59/59 |
| Phase 5D — Production Blocker Remediation | `test_phase5d.js` | ✅ PASS | 51/51 |
| Phase 5A — Deployment Readiness & Observability | `test_phase5a.js` | ✅ PASS | 47/47 |
| Phase 4F — Platform Security & Financial Integrity | `test_phase4f.js` | ✅ PASS | 52/52 |
| Phase 4E — Operator Operations | `test_phase4e.js` | ✅ PASS | 42/42 |
| Phase 3G — Unified Financial Activity & Wallet Hub | `test_phase3g.js` | ✅ PASS | 63/63 |
| Frontend Production Build | `frontend/` (`npm run build`) | ✅ PASS | 0 warnings |

**Phase 5F test coverage summary:**
- **Section A**: Staging Container & Reverse Proxy Manifest Audit: parsed and verified `docker-compose.staging.yml`, `backend/Dockerfile` (unprivileged `vahangrid` user, healthcheck on `/health/liveness`), `frontend/Dockerfile` and `frontend/nginx.conf` (`try_files $uri $uri/ /index.html` SPA routing), and `nginx/staging.conf` (TLSv1.2/1.3, security headers, `/ocpp/` WebSocket upgrade with 3600s read timeout, proxy headers).
- **Section B**: Safe Failure Behavior & Security Boundaries: verified 401 on missing/expired/forged JWT, 403 `OPERATOR_ROLE_REQUIRED` on driver accessing operator endpoints, 403 `CPO_ACCESS_DENIED` on cross-CPO access, and verified IDOR protection.
- **Section C**: Payment Sandbox Security: ₹10 min and ₹50,000 max bounds enforced, key secret non-leakage, HMAC-SHA256 signature enforcement, and idempotent single-crediting on duplicate/concurrent deliveries.
- **Section D**: OCPP WebSocket Connection & Reconnection Resilience: verified mock charger connection, OCPP 2.0.1 `BootNotification` exchange with `Accepted` response, clean disconnect, and successful reconnect with PostgreSQL state tracking updated to `online`.
- **Section E**: Database PostGIS Spatial Integrity: 22/22 migrations confirmed present, PostGIS extension verified active, and spatial geography `ST_Distance` calculations validated.

---

## 8. Known Limitations & Open Items

| # | Item | Severity | Status | Recommended Action |
|---|------|----------|--------|--------------------|
| 8.1 | Cloud staging infrastructure provisioning | Medium | **Ready for Deploy** | Deploy containerized stack using `docker-compose.staging.yml` once cloud provider credentials are provided |
| 8.2 | Live Razorpay webhook integration in cloud staging | Medium | **Ready for Test** | Point Razorpay dashboard webhook to staging endpoint (`https://staging-domain/api/v1/payments/webhook`) using test keys |
| 8.3 | Physical OCPP charger hardware testing | High | **Open** | Test with at least one physical OCPP-compliant charger before commercial go-live |
| 8.4 | Managed PostgreSQL automated PITR | High | **Open** | Enable WAL archiving or provider-managed PITR on production database (local backup/restore drill verified) |
| 8.5 | Application-layer rate limiting on auth endpoints | Medium | ✅ **Done** | Implemented via `express-rate-limit@7` in Phase 5D; all auth/payment/webhook endpoints covered |
| 8.6 | Distributed rate-limit store across multi-instance clusters | Low | **Documented** | Replace in-memory `MemoryStore` with `rate-limit-redis` when scaling beyond a single backend instance |

---

## 9. Release Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | | | |
| QA / Test Engineer | | | |
| Security Reviewer | | | |
| On-Call Engineer | | | |

---

*Generated and updated during VahanGrid Phase 5F — Cloud Staging Deployment & Integration Verification Audit.*
*See [`docs/DEPLOYMENT_AND_RECOVERY.md`](./DEPLOYMENT_AND_RECOVERY.md) for operational runbooks.*
