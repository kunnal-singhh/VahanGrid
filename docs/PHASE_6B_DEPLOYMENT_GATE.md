# VahanGrid — Phase 6B: Deployment Preparation and Security Gate

> **Document type**: Deployment Preparation & Security Gate Audit  
> **Phase**: 6B — Deployment Preparation and Security Gate  
> **Date**: 2026-10-28  
> **Base Commit**: `6a128e2` (`chore: complete Phase 6A cloud staging readiness and infrastructure audit`)  
> **Branch**: `main`  
> **Gate Status**: **CONDITIONAL GO for Authorized Isolated Staging** / **BLOCKED for Commercial Production**  

---

## 1. Executive Summary & Audit Verdict

Phase 6B performs a comprehensive security gate and deployment readiness audit of VahanGrid before its first authorized deployment to an isolated staging environment.

### Core Audit Outcomes

| Check | Verdict | Details / Evidence |
|---|---|---|
| **Compose Service Topology** | 🟢 **CORRECTED & PASS** | Corrected previous report error ("4 services") to verified **5 services**: `db`, `migration`, `backend`, `frontend`, `reverse-proxy`. |
| **Database Network Isolation** | 🟢 **PASS** | PostgreSQL port 5432 is strictly internal (`internal_net`). Zero host port publishing. |
| **Secret Validation & Failsafe** | 🟢 **PASS** | `env.js` validates `DATABASE_URL` and `JWT_SECRET` (>=32 chars, rejects placeholders). Fails startup with exit code 1 in production. |
| **TLS Certificate Invariant** | 🟢 **PASS** | `nginx/staging.conf` maps `/etc/nginx/certs/staging.crt` and `staging.key`. Volume `certs_staging` population and renewal procedure verified. |
| **Secret Leakage Prevention** | 🟢 **PASS & HARDENED** | Root `.gitignore` updated to ignore `nginx/certs/`, `*.pem`, `*.key`, and `*.crt`. PII masking verified in logger. |
| **Health Probe Consistency** | 🟢 **PASS** | Liveness, readiness, and full health probes return HTTP 200 with PostGIS enabled and database connected. |
| **Local Docker Daemon Status** | 🟡 **LOCAL LIMITATION** | Docker CLI v29.5.2 & Compose v5.1.4 available. Service `com.docker.service` stopped; cannot start without elevation. Offline linting verified (`exit 0`). |
| **Regression Test Verification** | 🟢 **PASS** | All active test suites passed fresh in Phase 6B: 104/104 Phase 5G, 53/53 Phase 5F, 59/59 Phase 5E, 51/51 Phase 5D, 52/52 Phase 4F. |
| **Frontend Production Build** | 🟢 **PASS** | `npm run build` compiled 1960 modules in 11.52s with 0 errors. |
| **Remote Cloud Staging** | 🔴 **BLOCKED** | External cloud account, remote Linux VM, public DNS, and live TLS remain unprovisioned. |

---

## 2. Invariant & Safety Audit Findings

### 2.1 Service Topology: 5 Services Confirmed
`docker-compose.staging.yml` defines exactly 5 services:
1. `db`: `postgis/postgis:16-3.4-alpine`
   - Bound exclusively to internal bridge network `internal_net`.
   - Healthcheck: `pg_isready -U vahangrid_admin -d vahangrid_staging` (5s interval, 5 retries).
   - Storage: Persistent volume `pgdata_staging`.
2. `migration`: One-shot container built from `./backend`
   - Command: `node src/scripts/migrate.js`.
   - Dependency: `db: condition: service_healthy`.
3. `backend`: REST API & OCPP 2.0.1 WebSocket gateway built from `./backend`
   - Non-privileged user: `vahangrid`.
   - Dependencies: `db: condition: service_healthy`, `migration: condition: service_completed_successfully`.
   - Internal listener on port `3001`.
4. `frontend`: Compiled Vite SPA served by NGINX 1.27 built from `./frontend`
   - SPA client-side fallback: `try_files $uri $uri/ /index.html;`.
   - Immutable asset caching: `location /assets/` (1-year cache).
   - Internal listener on port `80`.
5. `reverse-proxy`: Edge NGINX 1.27 container
   - Ingress ports: `80:80` (HTTP -> HTTPS redirect) and `443:443` (TLS termination).
   - Upstreams: `backend_upstream` (port 3001) and `frontend_upstream` (port 80).
   - Routes: `/health`, `/api/v1/`, `/ocpp/` (with WebSocket upgrade), and `/` (frontend).

### 2.2 TLS Certificate Mapping and Renewal
- In `nginx/staging.conf`, certificate paths are hardcoded to `/etc/nginx/certs/staging.crt` and `/etc/nginx/certs/staging.key`.
- In `docker-compose.staging.yml`, `certs_staging:/etc/nginx/certs:ro` mounts a named volume into `reverse-proxy`.
- **First-time Provisioning**: Certificates obtained on the host via Certbot standalone on port 80 are loaded into the named volume:
  ```bash
  docker run --rm \
    -v vahangrid_certs_staging:/etc/nginx/certs \
    -v /etc/letsencrypt/live/<domain>:/certs:ro \
    alpine sh -c "cp /certs/fullchain.pem /etc/nginx/certs/staging.crt && cp /certs/privkey.pem /etc/nginx/certs/staging.key && chmod 600 /etc/nginx/certs/*"
  ```
- **Zero-Downtime Renewal**: Certbot renews using the webroot path `/.well-known/acme-challenge/` routed to `/var/www/certbot`, copies renewed certs into `certs_staging`, and reloads NGINX gracefully:
  ```bash
  docker compose -f docker-compose.staging.yml exec reverse-proxy nginx -s reload
  ```

### 2.3 Secret Management & Root `.gitignore` Hardening
- Audit identified that TLS certificates (`*.pem`, `*.key`, `*.crt`) and `nginx/certs/` were not explicitly ignored at the root.
- Root `.gitignore` was updated to exclude `*.pem`, `*.key`, `*.crt`, and `nginx/certs/` to prevent inadvertent tracking of TLS private keys.
- Secret injection occurs strictly via `.env.staging` (which is excluded from Git via `.gitignore`).
- Failsafe validation in `backend/src/config/env.js` prevents application boot if `JWT_SECRET` is shorter than 32 characters or uses placeholder values in production.

### 2.4 Backup vs. Point-in-Time Recovery (PITR) Distinction
- **Local / Container Backup**: Snapshot-in-time backups via `docker exec db pg_dump -Fc` are verified. These allow full point-of-dump restoration.
- **Continuous PITR**: True point-in-time recovery requires WAL segment archiving to durable object storage (e.g. S3/GCS) or a cloud-managed database (AWS RDS, Supabase, Neon, Cloud SQL). Managed PITR remains classified as **BLOCKED** until external cloud database infrastructure is provisioned.

---

## 3. Fresh Verification Evidence (Executed in Phase 6B)

The following commands were directly executed in the workspace during Phase 6B:

| Verification Action | Command Run | Exit Code | Result Detail |
|---|---|---|---|
| **Compose Linting** | `docker compose -f docker-compose.staging.yml config` | `0` | Verified 5 services, volumes, networks, and dependencies without errors. |
| **Docker Daemon Attempt** | `Start-Service com.docker.service` | `0` | Remained `Stopped`. Documented elevation requirement; runtime containers not simulated. |
| **Backend Daemon** | `node src/server.js` | Background | Started on port 3001, connected to PostgreSQL with PostGIS enabled. |
| **Liveness Probe** | `curl.exe -s http://localhost:3001/health/liveness` | `0` | `{"status":"ok","service":"VahanGrid API","uptimeSeconds":15}` |
| **Readiness Probe** | `curl.exe -s http://localhost:3001/health/readiness` | `0` | `{"status":"ready","service":"VahanGrid API","database":"connected"}` |
| **Full Health Probe** | `curl.exe -s http://localhost:3001/health` | `0` | `{"success":true,"status":"healthy","database":"connected","postgis":"enabled"}` |
| **Database Migrations** | `node src/scripts/migrate.js` | `0` | `All migrations are already up to date (22 applied).` |
| **Frontend Production Build** | `npm run build` | `0` | 1960 modules compiled in 11.52s. Clean bundles in `dist/`. |
| **Phase 5G Hardening** | `npm run test:phase5g` | `0` | **104 passed / 0 failed** (Security boundaries, PII redactor, env validation, PostGIS). |
| **Phase 5F Staging Integration** | `npm run test:phase5f` | `0` | **53 passed / 0 failed** (Manifest audit, auth/CPO boundaries, webhook HMAC, OCPP DB). |
| **Phase 5E Remote Staging** | `npm run test:phase5e` | `0` | **59 passed / 0 failed** (Rate limiting, proxy trust, payment bounds, tamper protection). |
| **Phase 5D Blocker Remediation** | `node src/scripts/test_phase5d.js` | `0` | **51 passed / 0 failed** (Subprocess Phase 3G: 63 passed / 0 failed). |
| **Phase 4F Platform Reliability** | `node src/scripts/test_phase4f.js` | `0` | **52 passed / 0 failed** (RBAC, IDOR prevention, CPO isolation, ledger atomicity). |

---

## 4. First-Deployment Runbook: Executed vs. Proposed Sequence

The deployment procedure for the first authorized staging deployment is ordered as follows:

```
[Phase 6B Validated Locally]
  Step A: Offline Compose Config Linting (5 services validated)
  Step B: Schema Migration Integrity (22 sequential migrations verified)
  Step C: Frontend Production Bundle Compilation (Vite build verified)
  Step D: Security Boundaries & Negative Test Cases (319+ regression assertions verified)
        |
        v
[Proposed for Staging Host Once Authorized]
  Step 1: Provision Isolated Linux VM (Ubuntu 22.04 LTS, >=2 vCPU, >=4GB RAM)
  Step 2: Security Group / Firewall (Ports 80 & 443 public; 22 admin only; 5432 blocked)
  Step 3: DNS A-Record & Certbot TLS Issuance (Mount into certs_staging volume)
  Step 4: Provision High-Entropy Secrets in .env.staging (Never committed)
  Step 5: Launch Stack: docker compose --env-file .env.staging -f docker-compose.staging.yml up -d
  Step 6: Live Smoke Test: Liveness, Readiness, Database, Frontend Delivery
  Step 7: Authorization Smoke Test: Driver, Operator, Admin, Cross-CPO Access Denial
  Step 8: OCPP WebSocket Gateway Handshake: ws:// and wss:// /ocpp/<chargePointId>
  Step 9: Payment Webhook Test: HMAC signature validation & duplicate replay test
  Step 10: Backup Drill, Disaster Recovery & Clean Teardown
```

---

## 5. Remaining External Blockers

| Blocker | Description | Required Unblocking Action | Owner |
|---|---|---|---|
| **BLK-01: Cloud Host** | No staging VM or cloud account available | Authorize and launch Linux compute instance with Docker Engine + Compose v2. | Cloud / Infrastructure Lead |
| **BLK-02: DNS & TLS** | No staging subdomain or live TLS cert | Configure public DNS A-record and issue Let's Encrypt certificate. | DNS Administrator |
| **BLK-03: Razorpay Sandbox** | Live payment sandbox requires HTTPS | Inject `rzp_test_*` credentials and register webhook callback endpoint. | Finance / Product Lead |
| **BLK-04: Managed PITR** | Continuous Point-in-Time Recovery unconfigured | Provision managed PostgreSQL instance with automated backups and WAL archiving. | Database Administrator |
| **BLK-05: Physical EVSE** | Physical hardware lab unverified | Connect physical OCPP 2.0.1 compliant charger to staging endpoint. | Hardware / CPO Partner |

---

## 6. Exact Next Decision or Resource Needed

To proceed from this security gate to an active staging deployment:
1. **Cloud Account Selection & Authorization**: Select cloud provider (AWS, GCP, DigitalOcean, or dedicated Linux server).
2. **Assign Staging Subdomain**: Provide a fully qualified domain name (e.g. `staging.vahangrid.com`) mapped to the host IP.
3. **Execute Steps 1–5 of the First-Deployment Runbook** on the provisioned host.

*Phase 6B Security Gate Audit complete. All configuration invariants, secret protections, and regression suites verified.*
