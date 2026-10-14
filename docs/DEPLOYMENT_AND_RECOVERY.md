# VahanGrid — Deployment Readiness, Observability & Recovery Guide

## 1. Overview & Architecture

VahanGrid is a full-stack EV charging and mobility platform consisting of:
- **Frontend SPA**: React 19 + Tailwind CSS built with Vite, outputting static static assets in `frontend/dist/`.
- **Backend API & OCPP Gateway**: Node.js (Express) serving RESTful APIs (`/api/v1`) and an integrated WebSocket server for OCPP 2.0.1 / OCPP 1.6 charge point communication.
- **Database**: PostgreSQL 14+ with PostGIS spatial extension for geospatial queries and charging station telemetry.

```
                    +------------------------------------------+
                    |        Reverse Proxy / Load Balancer      |
                    |   (NGINX / Cloudflare / AWS ALB / Traefik)|
                    +--------------------+---------------------+
                                         |
               +-------------------------+-------------------------+
               |                                                   |
      HTTP / WebSocket                                      Static Files (SPA)
               |                                                   |
               v                                                   v
+-------------------------------+                     +-------------------------+
|      VahanGrid Backend        |                     |      VahanGrid SPA      |
|  - Express REST APIs          |                     |  - Vite React 19 Build  |
|  - OCPP WebSocket Gateway     |                     |  - Static CDN / NGINX   |
|  - Health & Readiness Probes  |                     +-------------------------+
+---------------+---------------+
                |
                v
+-------------------------------+
|     PostgreSQL + PostGIS      |
|  - ACID Ledgers & Sessions    |
|  - Geospatial Spatial Indices |
|  - Connection Pooling (10 max)|
+-------------------------------+
```

---

## 2. Environment Configuration & Security

### 2.1 Backend Environment Variables (`backend/.env`)

| Variable | Required | Production Constraint | Description |
| :--- | :---: | :--- | :--- |
| `PORT` | No | Defaults to `3001` | Local port for HTTP & WebSocket server. |
| `NODE_ENV` | Yes | Must be `production` | Enables strict security, HTTPS cookies, and JSON logs. |
| `DATABASE_URL` | **Yes** | Must start with `postgresql://` or `postgres://` | Full connection URI to PostgreSQL instance. SSL recommended (`?sslmode=require`). |
| `FRONTEND_URL` | **Yes** | Fully qualified origin(s) | Allowed CORS origins. Comma-separated for multiple (e.g. `https://vahangrid.com,https://admin.vahangrid.com`). |
| `JWT_SECRET` | **Yes** | **>= 32 chars**, non-default | Cryptographic secret for signing auth tokens. Fails startup if insecure. |
| `JWT_EXPIRES_IN` | No | Defaults to `7d` | Lifespan of JWT session tokens. |
| `TRUST_PROXY` | No | Defaults to `1` in prod | Instructs Express to trust reverse proxy headers (`X-Forwarded-*`). |
| `PAYMENT_PROVIDER` | No | Defaults to `razorpay` | Payment gateway provider adapter. |
| `PAYMENT_KEY_ID` | Yes (for payments) | `rzp_live_...` | Public API key for Razorpay checkout. |
| `PAYMENT_KEY_SECRET` | Yes (for payments) | Secret key | Private key for Razorpay order creation. |
| `PAYMENT_WEBHOOK_SECRET` | Yes (for payments) | Secret string | HMAC-SHA256 signature key for verifying webhook authenticity. |

### 2.2 Security Invariants Enforced at Startup
1. **Failsafe Secret Validation**: If `NODE_ENV === 'production'`, startup is aborted with an exit code of `1` if `JWT_SECRET` is missing, shorter than 32 characters, or uses known placeholder words (`secret`, `changeme`, `test_secret`, etc.).
2. **Database URI Sanity Check**: Rejects malformed or non-PostgreSQL URIs before connecting.
3. **HTTP-only & Secure Cookies**: Authentication tokens (`vg_token`) are issued with `httpOnly: true`, `sameSite: 'lax'`, and `secure: true` (in production).
4. **Header Protection**: Helmet baseline enabled by default across all HTTP routes.
5. **Request Body Caps**: JSON parser capped at `100kb` to mitigate denial-of-service memory pressure.

---

## 3. Observability & Health Probes

VahanGrid exposes standardized health probes mounted both at `/health` (for root load balancers) and `/api/v1/health` (for API consumers):

### 3.1 Full Health Probe (`GET /health` or `GET /api/v1/health`)
- **Purpose**: Comprehensive component check for monitoring dashboards (Datadog, Grafana, Pingdom).
- **Behavior**: Tests active database pool connectivity and checks PostGIS extension status.
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "service": "VahanGrid API",
    "status": "healthy",
    "database": "connected",
    "postgis": "enabled",
    "uptimeSeconds": 1420,
    "timestamp": "2026-10-15T02:30:00.000Z"
  }
  ```
- **Degraded Response (`503 Service Unavailable`)**:
  ```json
  {
    "success": false,
    "service": "VahanGrid API",
    "status": "unhealthy",
    "database": "disconnected",
    "uptimeSeconds": 1420,
    "timestamp": "2026-10-15T02:30:00.000Z"
  }
  ```
  *(Note: Database connection strings, passwords, and raw error stacks are strictly omitted in production).*

### 3.2 Liveness Probe (`GET /health/liveness`)
- **Purpose**: Kubernetes `livenessProbe` or container heartbeat check.
- **Behavior**: Verifies that the Node.js event loop is spinning and responsive without querying the database.
- **Response (`200 OK`)**:
  ```json
  {
    "status": "ok",
    "service": "VahanGrid API",
    "uptimeSeconds": 1420,
    "timestamp": "2026-10-15T02:30:00.000Z"
  }
  ```

### 3.3 Readiness Probe (`GET /health/readiness`)
- **Purpose**: Kubernetes `readinessProbe` or load-balancer target group health check.
- **Behavior**: Performs a low-overhead `SELECT 1` ping. If PostgreSQL is unreachable, returns `503` so traffic is drained from this instance until the database recovers.
- **Success (`200 OK`)**:
  ```json
  {
    "status": "ready",
    "service": "VahanGrid API",
    "database": "connected",
    "timestamp": "2026-10-15T02:30:00.000Z"
  }
  ```

### 3.4 Operational Structured Logging
All background events, errors, and lifecycle updates use `backend/src/utils/logger.js`.
- **In Production**: Emits structured JSON lines compatible with Fluentd, AWS CloudWatch, Datadog, or Grafana Loki.
- **Sensitive Data Redaction**:
  - Automatically redacts passwords, tokens, API keys, webhook secrets, and `authorization` headers.
  - Automatically masks driver PII: emails are masked to `u***@example.com` and phone numbers to `******3210`.

---

## 4. Graceful Shutdown & Zero Downtime

When receiving `SIGTERM` or `SIGINT` (e.g. during a rolling update or container replacement):
1. **Stop Traffic Ingestion**: The HTTP listener closes, stopping new incoming HTTP requests while allowing in-flight requests to complete cleanly.
2. **Disconnect OCPP Chargers**: Active WebSocket connections are notified and terminated cleanly via `closeOcppServer()`.
3. **Drain Database Pool**: Active PostgreSQL queries are allowed to conclude, and the connection pool is closed via `pool.end()`.
4. **Safety Timeout**: A 10-second watchdog timer ensures that if a resource hangs, the process exits forcefully (`process.exit(1)`) to avoid hanging deployments.

---

## 5. Database Management, Migrations & Recovery

### 5.1 Running Migrations
VahanGrid includes a zero-dependency migration runner in `backend/src/scripts/migrate.js`:
```bash
cd backend
npm run migrate
```
- **Tracking**: Executed migrations are tracked in the `schema_migrations` table.
- **Transactions**: Each migration file executes inside an atomic PostgreSQL transaction (`BEGIN ... COMMIT`). If any statement fails, the entire file is rolled back with `ROLLBACK`.
- **Idempotency**: Running `npm run migrate` repeatedly is completely safe; already-applied migrations are skipped.

### 5.2 Backup Procedures
Run scheduled automated backups using native PostgreSQL tools:
```bash
# Full compressed database dump
pg_dump -h <db_host> -U <db_user> -d vahangrid_db -Fc -f "vahangrid_backup_$(date +%Y%m%d_%H%M%S).dump"

# Plain SQL schema + data dump
pg_dump -h <db_host> -U <db_user> -d vahangrid_db --clean --if-exists > "vahangrid_backup_$(date +%Y%m%d).sql"
```

### 5.3 Disaster Recovery & Rollback
To restore a database snapshot into a new or recovered instance:
```bash
# 1. Terminate active connections (if restoring over existing database)
psql -h <db_host> -U <db_user> -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'vahangrid_db' AND pid <> pg_backend_pid();"

# 2. Restore from custom format dump
pg_restore -h <db_host> -U <db_user> -d vahangrid_db --clean --if-exists -v "vahangrid_backup.dump"
```

---

## 6. Frontend Production Hosting

### 6.1 Building Static Assets
```bash
cd frontend
npm run build
```
The output directory `frontend/dist/` contains:
- `index.html`
- Optimized vendor chunks: `vendor-react-*.js`, `vendor-icons-*.js`, `vendor-ai-*.js`, `index-*.js`.
- Minified CSS with Tailwind styles.

### 6.2 NGINX SPA Configuration Example
```nginx
server {
    listen 80;
    server_name vahangrid.com;

    root /var/www/vahangrid/frontend/dist;
    index index.html;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    # Static assets caching
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, no-transform, immutable";
    }

    # SPA routing fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Reverse proxy API requests to backend
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Reverse proxy OCPP WebSockets
    location /ocpp/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
}
```

---

## 7. Staging Environment Validation & Browser Audit (Phase 5B)

### 7.1 Staging Environment Topology
- **Deployment Status**: Local Staging Environment executed and validated on `http://localhost:3001` (Backend API & OCPP WebSocket Gateway) and `http://localhost:5173` (Frontend SPA) powered by PostgreSQL 18 with PostGIS.
- **Infrastructure Limitation**: No remote cloud hosting accounts (e.g. AWS, GCP, Vercel, Railway) are configured in the repository; no cloud staging was invented or fabricated.
- **Separation of Environments**: Staging uses sandbox configuration and local development/seed accounts. Production checks enforce high-entropy secrets and fail fast if default credentials are used.

### 7.2 Automated Verification Results
- **Phase 5A Probes & Config**: `47/47 passed` (`npm run test:phase5a`).
- **Phase 4F Platform Reliability**: `52/52 passed` (`npm run test:phase4f`).
- **Phase 4E Operator Operations**: `42/42 passed` (`npm run test:phase4e`).
- **Phase 3G Financial Activity Hub**: `63/63 passed` (`npm run test:phase3g`).
- **Frontend Production Build**: `npm run build` compiled in 9.15s with zero chunk warnings.

### 7.3 Real Browser Workflows Exercised
Browser automation sessions were recorded and verified:
1. **Driver Workflow (`priya.sharma@example.com`)**:
   - Authentication via HTTP-only cookie `vg_token`.
   - Driver Dashboard verified with active balance, SoC, and vehicle state.
   - Live Stations view: opened station detail modal for BKC Mobility Hub, verified connector power ratings, pricing, and live status.
   - VahanPass Wallet: verified current balance and ledger transaction list.
   - Session History: verified past charging sessions and CDR settlement statuses.
   - Role Enforcement: verified "Operator Portal" link is completely hidden for driver accounts.
   - Theme Toggle: toggled dark/light theme seamlessly.
   - Clean sign-out verified.
2. **Operator Workflow (`operator.tata@example.com`)**:
   - Authenticated as Tata Power Operator.
   - Sidebar displayed "Network Operations" with "CPO" badge.
   - Operator Portal verified with CPO context "Tata Power EZ Charge (TATA_EZ)" and real-time KPI cards.
   - Station Fleet: inspected fleet inventory and opened Edit Station modal.
   - Tariff Management: inspected tariff rules and opened Create Tariff modal.
   - Session Monitoring: inspected live/completed sessions and verified driver PII is masked.
   - Clean sign-out verified.
3. **Platform Admin Workflow (`admin@vahangrid.com`)**:
   - Authenticated as Platform Super Admin.
   - Sidebar displayed "ADMIN" badge under Network Operations.
   - Operator Portal verified with CPO scope dropdown ("Platform-Wide (All CPOs)").
   - Selected specific CPO ("Tata Power EZ Charge") and verified dynamic fleet filtering.
   - Clean sign-out verified.

---

## 8. Phase 5D — Production Blocker Remediation (2026-10-15)

### 8.1 Application-Layer Rate Limiting

**Implementation**: `backend/src/middleware/rateLimiter.js` using `express-rate-limit@7`.

| Limiter | Endpoint(s) | Window | Prod Limit | Dev Limit | Key |
|---------|-------------|--------|------------|-----------|-----|
| `authLoginLimiter` | `POST /auth/login` | 15 min | 10 req | 50 req | IP |
| `authRegisterLimiter` | `POST /auth/register` | 1 hour | 5 req | 30 req | IP |
| `webhookLimiter` | `POST /payments/webhook` | 1 min | 200 req | 200 req | IP |
| `paymentOrderLimiter` | `POST /payments/orders` | 1 hour | 10 req | 50 req | User ID |
| `paymentVerifyLimiter` | `POST /payments/verify` | 1 hour | 20 req | 100 req | User ID |
| `globalApiLimiter` | `ALL /api/v1/*` | 15 min | 500 req | 2000 req | IP |

**Response headers**: All limiters emit RFC-compliant `RateLimit-Limit` and `RateLimit-Remaining` headers. Health endpoints (`/health/*`) are explicitly excluded.

**429 response format** (consistent with VahanGrid error contract):
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "<human-readable reason>"
  }
}
```

**Multi-instance limitation**: The default `MemoryStore` is per-process. In a horizontally-scaled deployment (multiple Node.js instances, PM2 cluster mode, Kubernetes pods), counters are NOT shared. Upgrade to `rate-limit-redis` before going multi-instance:
```bash
npm install rate-limit-redis ioredis
```
```js
import RedisStore from 'rate-limit-redis';
// ...
store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
```

**Proxy trust**: Rate limits key off `req.ip`. Set `TRUST_PROXY=true` in production when the backend sits behind NGINX/load balancer so Express uses `X-Forwarded-For` correctly (misconfiguration would share one bucket across all clients).

### 8.2 Cloud Staging Readiness Prerequisites

The following must be completed before a cloud staging environment can be provisioned:

1. **Cloud account selection**: Choose a hosting provider (AWS, GCP, Railway, Render, DigitalOcean App Platform).
2. **Managed PostgreSQL**: Provision a managed PostgreSQL 14+ instance with:
   - Automated daily backups (≥7 day retention)
   - Point-in-time recovery (PITR) enabled
   - Connection pooling (PgBouncer or provider-native)
   - TLS-only connections enforced
3. **Environment variables**: Set all production secrets (high-entropy `JWT_SECRET`, real `PAYMENT_KEY_ID`, `PAYMENT_KEY_SECRET`, `PAYMENT_WEBHOOK_SECRET`) in the cloud provider's secrets store.
4. **Container image**: Build the backend Docker image and push to a container registry:
   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --omit=dev
   COPY src/ ./src/
   ENV NODE_ENV=production
   CMD ["node", "src/server.js"]
   ```
5. **TRUST_PROXY**: Set `TRUST_PROXY=true` when behind a cloud load balancer.
6. **Webhook tunnel**: Use Razorpay's test webhook sender or `ngrok http 3001` to expose the staging webhook endpoint for payment simulation.
7. **Seed guard verification**: Confirm `npm run seed` exits with code 1 in the cloud environment before running migrations.
8. **Migration before deploy**: Run `npm run migrate` as a pre-deploy step.

### 8.3 OCPP Physical Charger Interoperability Test Plan

Simulated OCPP testing (Phase 3D–4F) cannot substitute for real hardware validation. The following test plan applies when a physical OCPP 1.6J-compliant charger is available:

#### Pre-conditions
- Backend OCPP WebSocket server reachable at `wss://<staging-host>/ocpp/<charge-point-id>`
- TLS certificate valid for the staging domain
- Charger configured with backend URL and charge-point ID

#### Test Cases

| TC | Description | Expected Outcome |
|----|-------------|-----------------|
| TC-1 | **BootNotification**: Power on charger | Server responds `Accepted`, status logs to `charge_point_status` |
| TC-2 | **Heartbeat interval**: Charger sends periodic heartbeats | Server acknowledges each; orphan session recovery not triggered within normal intervals |
| TC-3 | **StatusNotification**: Connector plug-in/out | Connector status transitions `Available → Preparing → Charging → Finishing → Available` recorded |
| TC-4 | **StartTransaction**: Driver presents RFID or app-initiated remote start | Server sends `RemoteStartTransaction`, charger starts session, `StartTransaction.req` received, session created in DB |
| TC-5 | **MeterValues**: Charger sends live energy readings | Values stored in `ocpp_meter_values`, SoC updates propagated |
| TC-6 | **StopTransaction**: Driver stops session | `StopTransaction.req` received, CDR generated with correct kWh and cost |
| TC-7 | **RemoteStop**: Operator initiates remote stop via Portal | Server sends `RemoteStopTransaction`, charger stops, CDR created |
| TC-8 | **Power-loss recovery**: Kill and restart charger mid-session | Server detects orphaned `CHARGING` session after heartbeat timeout; CDR created with last known meter value |
| TC-9 | **CDR settlement**: Driver's wallet balance deducted correctly | CDR status changes `PENDING → SETTLED`; wallet transaction recorded; balance matches cost |
| TC-10 | **Tariff enforcement**: Verify kWh rate applied from active tariff | CDR `total_cost = energy_kwh × tariff_rate_perkwh` within floating-point tolerance |

#### Acceptance Criteria
- All TC-1 through TC-10 pass without server errors
- No orphaned database records (sessions stuck in `CHARGING`, payments stuck in `created`)
- OCPP message logs reviewed for protocol compliance (no `CallerError` or `CallError` responses)

### 8.4 Database Backup & Restore Verification

> [!NOTE]
> The procedures below require `pg_dump` and `pg_restore` to be available in the environment. Run against the **staging** database, not production.

#### Backup
```bash
# Full custom-format compressed dump (recommended for pg_restore)
pg_dump \
  -h <db_host> -U <db_user> -d vahangrid \
  -Fc -Z 9 \
  -f "vahangrid_backup_$(date +%Y%m%d_%H%M%S).dump"

# Verify dump integrity
pg_restore --list "vahangrid_backup_<timestamp>.dump" | head -20
```

#### Restore to isolated test database
```bash
# 1. Create a clean restore target
createdb -h <db_host> -U <db_user> vahangrid_restore_test

# 2. Restore
pg_restore \
  -h <db_host> -U <db_user> \
  -d vahangrid_restore_test \
  --clean --if-exists -v \
  "vahangrid_backup_<timestamp>.dump"

# 3. Spot-check critical tables
psql -h <db_host> -U <db_user> -d vahangrid_restore_test \
  -c "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM wallets; SELECT COUNT(*) FROM payments;"

# 4. Verify migration tracking table is intact
psql -h <db_host> -U <db_user> -d vahangrid_restore_test \
  -c "SELECT * FROM schema_migrations ORDER BY applied_at;"

# 5. Clean up test database
dropdb -h <db_host> -U <db_user> vahangrid_restore_test
```

#### Point-in-Time Recovery (PITR) prerequisites
- `wal_level = replica` in `postgresql.conf`
- `archive_mode = on` with `archive_command` writing WAL segments to durable storage (S3, GCS, etc.)
- For managed databases: enable PITR in provider settings (AWS RDS, Google Cloud SQL, Railway, etc.)

#### RTO / RPO targets
| Target | Value | Notes |
|--------|-------|-------|
| RPO (data loss tolerance) | ≤5 minutes | Achievable with WAL archiving every 5 min or managed PITR |
| RTO (recovery time) | ≤30 minutes | `pg_restore` on typical VahanGrid dataset + migration verification |

---

## 9. Phase 5E — Remote Deployment Readiness & Release Verification (2026-10-15)

### 9.1 Reproducible Containerized Staging Architecture

A complete, multi-container staging stack is defined in the repository:
- **`backend/Dockerfile`**: Multi-stage Node 20 Alpine container running as an unprivileged system user (`vahangrid`). Emits Docker health checks against `/health/liveness`.
- **`frontend/Dockerfile`**: Multi-stage build producing production Vite assets served by NGINX 1.27 Alpine. Includes immutable asset caching and SPA routing fallback.
- **`frontend/nginx.conf`**: Configures gzip compression, 1-year immutable cache on `/assets/`, and `try_files $uri $uri/ /index.html` to prevent 404s on browser refreshes.
- **`nginx/staging.conf`**: Production-grade reverse proxy and TLS terminator.
  - Terminates TLS with modern cipher suites and security headers (HSTS, X-Frame-Options, CSP, MIME-sniffing protection).
  - Routes `/health` directly to backend without rate-limiting.
  - Proxies `/api/v1/` with sanitized reverse proxy headers (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`).
  - Supports bidirectional WebSocket upgrades for `/ocpp/` with a 3600-second read timeout for continuous charger heartbeats.
  - Proxies SPA traffic to the frontend container.
- **`docker-compose.staging.yml`**: Bridges PostGIS 16-3.4, automated migration container, backend API, frontend SPA, and NGINX on an isolated Docker network.

### 9.2 Rate-Limiting Security Audit Findings

| Area | Implementation & Verification | Assessment |
|------|------------------------------|------------|
| **IP Spoofing Defense** | Configured via `app.set('trust proxy', config.trustProxy)`. In production, defaults to `1` (single reverse proxy hop). Express ignores client-injected `X-Forwarded-For` entries and relies strictly on the hop appended by NGINX. | ✅ Verified Secure |
| **Authenticated User Limits** | `paymentOrderLimiter` and `paymentVerifyLimiter` extract `req.user.id` populated by the `authenticate` JWT middleware. Client request bodies or query params attempting to provide alternate `user_id` values cannot bypass user quotas. | ✅ Verified Secure |
| **Probe Exemption** | `/health`, `/health/liveness`, `/health/readiness` are mounted prior to `globalApiLimiter`. Container health probes and ALB liveness checks never consume rate-limit budget. | ✅ Verified Exempt |
| **429 Response Contract** | Standardized JSON contract: `{ success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: '...' } }`. | ✅ Verified Uniform |
| **Store Topology** | Default `MemoryStore` is per-process. Counters reset upon process restarts. For multi-pod or multi-server scaling, migrate to `rate-limit-redis`. | ⚠️ Documented Single-Node Constraint |

### 9.3 Payment Webhook Reliability & Cryptographic Hardening

- **HMAC Verification**: Raw body buffer preserved via `express.json({ verify: ... })`. Verified using `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
- **Amount Tampering Detection**: The webhook handler verifies that gateway reported amounts match the authoritative DB order amount within ₹0.01 tolerance. Discrepancies mark the payment order as `failed` with code `AMOUNT_TAMPERING_DETECTED` and return HTTP 400.
- **Idempotency & Concurrency**:
  - `creditWalletForPayment` uses row-level locking (`SELECT ... FOR UPDATE`) on the payment and wallet records.
  - Duplicate webhooks return HTTP 200 with `already_processed: true` without double-crediting.
  - Database unique index `uq_wallet_txns_payment_id` intercepts concurrent `Promise.all` deliveries, ensuring exactly one ledger transaction commits.
- **Retry Tolerance**: Gateway retries during transient database outages roll back cleanly without partial ledger writes. Subsequent retries succeed and credit the driver's wallet.

### 9.4 Database & PostGIS Verification Evidence

- **Migration Ordering**: All 22 migration scripts (`001_create_extensions.sql` through `022_add_user_roles_and_cpo_association.sql`) executed in order against a clean PostgreSQL 18 instance with zero schema errors.
- **Backup & Restore Drill**:
  - Generated compressed dump using `pg_dump -Fc -Z 9` (164,611 bytes).
  - Restored to an isolated database `vahangrid_restore_drill` via `pg_restore --clean --if-exists`.
  - Confirmed 100% record restoration across all tables: 225 users, 225 wallets, 134 payments, 55 charging sessions, 50 CDRs, 24 OCPP charge points, 6 locations.
  - Executed spatial PostGIS query: `ST_Distance(location, ST_SetSRID(ST_MakePoint(77.2090, 28.6139), 4326)::geography)` succeeded on restored `locations.location` geography column.

### 9.5 OCPP WebSocket Protocol Verification

- CSMS gateway tested via WebSocket connection (`ws://localhost:3001/ocpp/<chargePointId>`).
- Validated OCPP 2.0.1 `BootNotification` message exchange:
  - Charger sends CALL `[2, "<id>", "BootNotification", { "reason": "PowerUp", "chargingStation": { "model": "VG-DC-FAST", "vendorName": "VahanGrid" } }]`.
  - Server accepts connection, registers charger state, and returns CALLRESULT `[3, "<id>", { "currentTime": "...", "interval": 300, "status": "Accepted" }]`.
- Hardware caveat: Validation performed via WebSocket simulation. Physical interoperability testing with field hardware remains required prior to commercial go-live.

---

*Last updated: 2026-10-15 — Phase 5E Remote Deployment Readiness & Release Verification.*
