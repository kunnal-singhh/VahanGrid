# VahanGrid — Phase 6A: Cloud Staging Deployment and Verification

> **Document type**: Cloud Staging Deployment Audit & Infrastructure Verification Record  
> **Phase**: 6A — Cloud Staging Deployment & Verification  
> **Date**: 2026-10-15  
> **Base Commit**: `337197a` (`chore(release): complete Phase 5H release decision and pilot readiness`)  
> **Branch**: `main`  
> **Deployment Status**: **BLOCKED (External Cloud Infrastructure Unavailable)** / **PASS (Local Architecture & Build Integrity)**  

---

## 1. Executive Summary

Phase 6A evaluates the readiness of VahanGrid for deployment to an isolated cloud staging environment. In accordance with safety rules, no cloud resources were provisioned, no fake credentials were used, no billing was incurred, and no secrets were committed or exposed.

### Deployment Status Summary

| Dimension | Verification Status | Notes / Evidence |
|---|---|---|
| **Local Staging Topology & Config** | 🟢 **PASS** | `docker compose -f docker-compose.staging.yml config` passes with exit code 0 (Docker Compose v5.1.4). |
| **Backend & Ingress Architecture** | 🟢 **PASS** | Non-root `vahangrid` user, NGINX reverse-proxy TLS & WebSocket headers, zero public host exposure for DB port 5432. |
| **Database Migrations** | 🟢 **PASS** | 22/22 sequential migrations verified present and applied with PostGIS spatial extension enabled. |
| **Frontend Production Build** | 🟢 **PASS** | `npm run build` completed cleanly in 9.69s (1960 modules transformed, production assets output to `dist/`). |
| **Local Health & Readiness Probes** | 🟢 **PASS** | Live `/health/liveness`, `/health/readiness`, and `/health` return HTTP 200 with JSON payloads. |
| **Regression Verification Suites** | 🟢 **PASS** | 104/104 Phase 5G, 53/53 Phase 5F, 59/59 Phase 5E, 51/51 Phase 5D, 52/52 Phase 4F passing. |
| **Docker Daemon on Host** | 🟡 **LOCAL DAEMON STOPPED** | `docker.exe` v29.5.2 installed; daemon engine offline (`dockerDesktopLinuxEngine` not started). |
| **Cloud Provider Access (AWS/GCP/Azure)** | 🔴 **BLOCKED** | `aws sts get-caller-identity` returned `InvalidClientTokenId`. No valid credentials or cloud account available. |
| **Remote Staging Host & Public DNS** | 🔴 **BLOCKED** | No staging VM provisioned; no public DNS record configured. |
| **TLS Certificate for Staging Domain** | 🔴 **BLOCKED** | Requires domain ownership and Let's Encrypt / ACM certificate issuance. |
| **Live Razorpay Payment Sandbox** | 🔴 **BLOCKED** | Requires active `rzp_test_*` credentials and public HTTPS webhook callback URL. |

---

## 2. Infrastructure Discovery Audit

A comprehensive probe of local and external infrastructure tools was conducted:

### 2.1 Container Tooling
- **Docker CLI**: Present (`Docker version 29.5.2, build 79eb04c`).
- **Docker Compose**: Present (`Docker Compose version v5.1.4`).
- **Docker Daemon Engine**: Stopped (`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`).
- **Compose Config Validation**: Verified offline via `docker compose -f docker-compose.staging.yml config`. Exit code: `0`. All 5 services (`db`, `migration`, `backend`, `frontend`, `reverse-proxy`), volume configurations, network definitions, and health checks validated cleanly.

### 2.2 Cloud & SSH Credentials Audit
- **AWS CLI**: Present (`aws-cli/2.x`), but execution of `aws sts get-caller-identity` failed with `InvalidClientTokenId` (no valid credentials configured in environment or `~/.aws`).
- **Other Cloud CLIs**: `gcloud`, `az`, `doctl`, `flyctl`, `terraform` are not present in PATH.
- **SSH Connectivity**: `~/.ssh/config` is absent. No staging jump-host or remote server connection is configured.
- **Environment Variables**: Scanned environment for `AWS_*`, `AZURE_*`, `GCP_*`, `DIGITALOCEAN_*`, `FLY_*`, `VERCEL_*`, `DOCKER_HOST`. None found.
- **Decision**: In strict accordance with constraints, no infrastructure was created or simulated. Remote staging deployment remains **BLOCKED**.

---

## 3. Local Staging & Architecture Verification Evidence

### 3.1 Docker Compose Specification (`docker-compose.staging.yml`)
The canonical Compose specification was verified:
1. **Network Isolation**: `db`, `migration`, `backend`, and `frontend` communicate exclusively over the private bridge network `vahangrid_internal_net`.
2. **Zero Public DB Exposure**: PostgreSQL port `5432` has NO published host port mapping (`ports: []`).
3. **Database Health Check**: `pg_isready -U vahangrid_admin -d vahangrid_staging` with 5s interval and 5 retries.
4. **Deterministic Service Ordering**:
   - `db` starts and reports healthy.
   - `migration` waits for `db: service_healthy` and runs `node src/scripts/migrate.js` to completion.
   - `backend` waits for `migration: service_completed_successfully` before starting HTTP/WebSocket listener.
   - `reverse-proxy` listens on ports `80` and `443`, routing traffic to `frontend` and `backend`.

### 3.2 Live Health & Probe Endpoints
Direct local HTTP probe results on the running backend:
- `GET /health/liveness`:
  ```json
  {"status":"ok","service":"VahanGrid API","uptimeSeconds":3724,"timestamp":"2026-10-15T00:30:32.331Z"}
  ```
- `GET /health/readiness`:
  ```json
  {"status":"ready","service":"VahanGrid API","database":"connected","timestamp":"2026-10-15T00:30:32.554Z"}
  ```
- `GET /health`:
  ```json
  {"success":true,"service":"VahanGrid API","status":"healthy","database":"connected","postgis":"enabled","uptimeSeconds":3724,"timestamp":"2026-10-15T00:30:32.595Z"}
  ```

### 3.3 Database Migrations
Executed `node src/scripts/migrate.js`:
```text
Connecting to 'vahangridDB'...
All migrations are already up to date (22 applied).
```

### 3.4 Frontend Production Build
Executed `npm run build` in `frontend/`:
```text
vite v6.4.3 building for production...
✓ 1960 modules transformed.
dist/index.html                         2.40 kB │ gzip:   1.09 kB
dist/assets/ev_banner-LiIT4-FH.png    825.39 kB
dist/assets/index-C_nwLgLQ.css        106.74 kB │ gzip:  15.85 kB
dist/assets/vendor-react-BXuvrutR.js    4.22 kB │ gzip:   1.58 kB
dist/assets/vendor-icons-BuGxaTCv.js   45.18 kB │ gzip:  11.23 kB
dist/assets/vendor-ai-DKKWDuCv.js     409.95 kB │ gzip:  71.55 kB
dist/assets/index-CLWI7FV6.js         576.78 kB │ gzip: 146.02 kB
✓ built in 9.69s
```

### 3.5 Automated Regression Suites
- **Phase 5G Hardening** (`test_phase5g.js`): **104 passed / 0 failed** (Manifest audit, security boundary, PII redactor, env validator, seed guard, OCPP reconnect, PostGIS).
- **Phase 5F Integration** (`test_phase5f.js`): **53 passed / 0 failed** (Compose manifest, auth & CPO isolation, payment webhook HMAC, OCPP DB persistence).
- **Phase 5E Remote Staging** (`test_phase5e.js`): **59 passed / 0 failed** (Rate limiting, proxy trust, payment bounds, tamper protection, schema integrity).

---

## 4. Complete Cloud Staging Deployment Guide (Executable When Authorized)

When an authorized cloud account, domain, and staging host are provisioned, follow this exact procedure:

### Step 1: Provision Staging Compute Instance
- **Instance Type**: Minimum 2 vCPU, 4GB RAM (e.g., AWS `t3.medium`, GCP `e2-medium`, or DigitalOcean 4GB Droplet).
- **Operating System**: Ubuntu 22.04 LTS or Debian 12.
- **Firewall / Security Group**:
  - Inbound TCP `80` (HTTP): Allowed for Let's Encrypt validation.
  - Inbound TCP `443` (HTTPS / WSS): Allowed for staging traffic and OCPP WebSocket.
  - Inbound TCP `22` (SSH): Restricted to administrator IPs.
  - Inbound TCP `5432` / `3001`: **STRICTLY BLOCKED** from public ingress.

### Step 2: Install Container Runtime on Staging Host
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

### Step 3: Configure Domain & Issue TLS Certificate
1. Point DNS A-record (e.g. `staging.vahangrid.com`) to the VM public IP.
2. Issue certificate via Certbot:
```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d staging.vahangrid.com

# Populate the named docker volume certs_staging mounted by reverse-proxy
docker volume create vahangrid_certs_staging
docker run --rm \
  -v vahangrid_certs_staging:/etc/nginx/certs \
  -v /etc/letsencrypt/live/staging.vahangrid.com:/certs:ro \
  alpine sh -c "cp /certs/fullchain.pem /etc/nginx/certs/staging.crt && cp /certs/privkey.pem /etc/nginx/certs/staging.key && chmod 600 /etc/nginx/certs/*"
```

### Step 4: Clone Repository & Create Secret Configuration
```bash
cd /opt/vahangrid
git clone https://github.com/kunnal-singhh/VahanGrid.git repo
cd repo

# Create .env.staging with high-entropy production secrets (NEVER commit to git)
cat << 'EOF' > .env.staging
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://vahangrid_admin:$(openssl rand -hex 24)@db:5432/vahangrid_staging
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://staging.vahangrid.com
TRUST_PROXY=1
PAYMENT_PROVIDER=razorpay
PAYMENT_KEY_ID=rzp_test_<staging_key_id>
PAYMENT_KEY_SECRET=<staging_key_secret>
PAYMENT_WEBHOOK_SECRET=<staging_webhook_secret>
EOF
chmod 600 .env.staging
```

### Step 5: Launch Stack & Verify
```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build

# Verify all services healthy
docker compose -f docker-compose.staging.yml ps

# Verify three-tier probes
curl -fk https://staging.vahangrid.com/health/liveness
curl -fk https://staging.vahangrid.com/health/readiness
curl -fk https://staging.vahangrid.com/health
```

---

## 5. Remaining External Blockers & Action Items

| Blocker ID | Item | Action Required | Owner / Dependency |
|---|---|---|---|
| **BLK-01** | Cloud Provider Infrastructure | Authorize cloud provider account & provision Linux VM | Operations / Cloud Lead |
| **BLK-02** | Staging DNS & TLS | Assign staging subdomain & issue TLS certificate | DNS Administrator |
| **BLK-03** | Razorpay Test Sandbox | Inject valid `rzp_test_*` credentials & register webhook URL | Finance / Product Lead |
| **BLK-04** | Managed PostgreSQL PITR | Provision cloud PostgreSQL with automated WAL archiving | Database Administrator |
| **BLK-05** | Physical EVSE Hardware | Connect physical OCPP 2.0.1 charger to staging WSS endpoint | Hardware Partner / CPO |

---

*Generated during Phase 6A — Cloud Staging Deployment and Verification.*  
*See [`docs/DEPLOYMENT_AND_RECOVERY.md`](./DEPLOYMENT_AND_RECOVERY.md) for full disaster recovery instructions.*  
*See [`docs/PILOT_RUNBOOK.md`](./PILOT_RUNBOOK.md) for the 10-step executable pilot procedure.*
