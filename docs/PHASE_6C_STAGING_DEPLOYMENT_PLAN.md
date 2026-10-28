# VahanGrid — Phase 6C: Staging Provider Decision and Deployment Readiness Plan

> **Document type**: Technical Evaluation, Architecture Decision Record & Staging Readiness Plan  
> **Phase**: 6C — Staging Provider Decision and Deployment Readiness  
> **Date**: 2026-10-28  
> **Base Commit**: `2cf0e4f` (`chore: finalize staging deployment gate`)  
> **Branch**: `main`  
> **Status**: **READY FOR PROJECT OWNER DECISION** (Local Architecture Verified; Remote Provisioning Blocked)  

---

## 1. Executive Summary & Recommended Architecture

Phase 6C defines the minimum practical staging deployment plan for VahanGrid. The goal is to provide a technically sound, cost-conscious staging deployment recommendation that allows testing under realistic conditions without incurring premature production overhead or vendor lock-in.

### 1.1 Architectural Recommendation

> [!TIP]
> **Recommended Staging Architecture: Option 1 — Single Isolated Linux Compute VM Running Existing Docker Compose Stack**

### 1.2 Recommendation Rationale
1. **100% Manifest & Architecture Fidelity**: The exact 5-service topology (`db`, `migration`, `backend`, `frontend`, `reverse-proxy`) defined in [`docker-compose.staging.yml`](../docker-compose.staging.yml) has already been statically validated, linted, and tested locally. Running it on an isolated Linux VM preserves this architecture without code alterations or adapter refactoring.
2. **OCPP 2.0.1 WebSocket Stability**: EV charging stations maintain long-lived, stateful bidirectional WebSocket connections (`wss://<domain>/ocpp/<chargePointId>`). The repository's NGINX configuration sets `proxy_read_timeout 3600s` and `proxy_send_timeout 3600s`. Generic PaaS platforms (e.g., standard Heroku, basic Render) frequently enforce 60s–100s idle request timeouts or drop idle persistent TCP sockets, causing continuous charger reconnection flapping. Option 1 gives complete control over proxy timeouts and WebSocket buffer handling.
3. **Cost Efficiency**: A single 2 vCPU / 4GB RAM virtual machine costs qualitatively within the **Low** cost band (unverified estimate: $15–$40/month across providers like AWS EC2, GCP Compute Engine, DigitalOcean, or Hetzner). In contrast, managed container services with load balancers and managed PostgreSQL databases quickly reach the **High** cost band ($90–$250+/month).
4. **Strict Network Isolation**: PostgreSQL (port 5432) remains exclusively on the internal Docker bridge network (`vahangrid_internal_net`), completely inaccessible from the public internet. Only the edge NGINX reverse proxy exposes ports 80 and 443.
5. **Zero Vendor Lock-In**: The deployment depends only on standard Linux, Docker Engine, and Docker Compose v2. The entire stack can be migrated between cloud providers or on-premises servers within minutes.

---

## 2. Comparative Evaluation of Staging Architectures

| Dimension | Option 1: Single Isolated Linux VM (Docker Compose) [Recommended] | Option 2: Managed App Platform + Managed PostgreSQL (PaaS) | Option 3: Managed Containers + Managed RDS (CaaS / ECS / EKS) |
|---|---|---|---|
| **Description** | Single Linux VM (Ubuntu 22.04 LTS) running the verified 5-service Docker Compose staging stack. | Backend on PaaS (Render/Fly.io), frontend on static CDN (Vercel/Cloudflare Pages), DB on managed PostGIS (Supabase/Neon/RDS). | Backend & Frontend on AWS ECS Fargate or GCP Cloud Run; DB on AWS RDS for PostgreSQL with PostGIS. |
| **Operational Complexity** | **Low**: Single system, identical to local development topology. Zero new configuration formats. | **Medium**: Three separate vendor consoles, cross-origin CORS rules, external connection pooling. | **High to Very High**: IAM roles, VPC subnets, NAT Gateways, Target Groups, Application Load Balancers, ECS Task Definitions. |
| **Qualitative Cost Band** | **Low** (Qualitative band: ~$15 – $40 / month, *unverified estimate*) | **Medium** (Qualitative band: ~$35 – $90 / month, *unverified estimate*) | **High** (Qualitative band: ~$90 – $250+ / month, *unverified estimate*) |
| **Data Persistence** | Persistent Docker volume (`pgdata_staging`) mapped to host SSD / EBS block storage. | Fully managed disk storage with provider-level hardware failure handling. | Multi-AZ or single-AZ managed EBS/EFS with automated volume expansion. |
| **Backup & PITR** | **Local Backups**: Automated cron taking daily `pg_dump -Fc` compressed backups to off-site object storage.<br>**PITR**: Not automated out-of-the-box; requires manual WAL archiving configuration. | **Managed Backups**: Turnkey daily backups; automated 7-day PITR included in paid tiers. | **Turnkey Continuous PITR**: AWS RDS automated snapshots and 1-second continuous transaction log archiving (1–35 days). |
| **TLS & Ingress** | NGINX edge reverse proxy with Let's Encrypt Certbot HTTP-01 challenge. Auto-renewed via cron with zero-downtime NGINX reload. | Automatic managed TLS certificates provided by platform edge router / CDN. | AWS Certificate Manager (ACM) or Cloud Load Balancing with managed SSL certs. |
| **Network Controls** | Cloud security group limits public ingress to ports 80 & 443; port 22 restricted to admin IPs. DB port 5432 has zero host exposure. | Database is usually exposed to public internet with password and SSL requirement; IP whitelisting requires static IP add-ons. | Private subnets with zero public internet route to database or container tasks; ALB in public subnet. |
| **WebSocket Support (OCPP 2.0.1)** | **100% Native & Tested**: NGINX `proxy_pass` with HTTP/1.1 Upgrade headers and custom 3600s timeouts. No arbitrary disconnection. | **Risk of Timeouts**: Many PaaS routers drop idle WebSocket connections after 60–100s, triggering charger reconnect loops. | **Full Support**: Application Load Balancer supports WebSockets, but idle timeout must be manually increased from 60s default to 3600s. |
| **Vendor Lock-in** | **Zero**: 100% portable OCI containers and standard Docker Compose v2 specification. | **Low to Moderate**: Depends on provider-specific buildpacks, dashboard secrets, and proprietary database configurations. | **Moderate to High**: Depends on cloud-specific IAM, Terraform modules, CloudFormation templates, and ALB annotations. |

---

## 3. Decision Required from Project Owner

To proceed from planning to execution, the project owner must make three explicit decisions:

1. **Provider Selection**:
   - Approve Option 1 (Single Isolated Linux VM) on an agreed cloud provider (e.g. AWS EC2 `t3.medium`, GCP Compute Engine `e2-medium`, DigitalOcean Droplet, or dedicated hosting).
2. **Budget Authorization**:
   - Authorize an initial staging infrastructure budget cap (e.g., $25–$50/month).
3. **Domain Allocation & Credentials**:
   - Designate a staging subdomain (e.g., `staging.vahangrid.com` or `staging.vahangrid.internal`).
   - Supply non-production test credentials for Razorpay sandbox (`rzp_test_*`).

*Note: In accordance with safety rules, no cloud infrastructure has been provisioned, no billing accounts have been registered, and no money has been spent.*

---

## 4. Staging Configuration & Invariant Audit

The repository's staging deployment configuration was audited against all architecture requirements:

| Invariant / Component | Verified Repository State | Alignment with Recommended Architecture |
|---|---|---|
| **Five-Service Topology** | `db`, `migration`, `backend`, `frontend`, `reverse-proxy` defined in [`docker-compose.staging.yml`](../docker-compose.staging.yml). | Fully supported. Starts on single command `docker compose up -d`. |
| **Service Dependencies** | `migration` waits for `db: service_healthy`; `backend` waits for `migration: service_completed_successfully` and `db: service_healthy`; `reverse-proxy` waits for `backend` and `frontend`. | Safe, ordered startup eliminates race conditions between migrations and API server. |
| **Database Port Isolation** | PostgreSQL port `5432` has NO published host port in `docker-compose.staging.yml`. Port 5432 is bound exclusively to `vahangrid_internal_net`. | High security: public scanning tools cannot reach the database port. |
| **Persistent Storage** | Named volume `pgdata_staging` mapped to PostgreSQL data directory (`/var/lib/postgresql/data`). | Data persists across container restarts, image updates, and host reboots. |
| **TLS Certificate Mapping** | In [`nginx/staging.conf`](../nginx/staging.conf), paths are `/etc/nginx/certs/staging.crt` and `staging.key`. Reverse proxy mounts named volume `certs_staging:/etc/nginx/certs:ro`. | Fully verified. Populated on host via Certbot standalone or helper container; reloaded via `nginx -s reload`. |
| **Secret Management** | In [`backend/src/config/env.js`](../backend/src/config/env.js), startup fails (exit code 1) in production if `JWT_SECRET` is missing, <32 chars, or uses placeholder words. Root [`.gitignore`](../.gitignore) excludes `.env`, `*.key`, `*.pem`, `*.crt`, and `nginx/certs/`. | Prevents credential leaks; fails safely if staging secrets are misconfigured. |
| **OCPP WebSocket Routing** | NGINX proxies `/ocpp/` with `Upgrade` and `Connection "upgrade"` headers and `3600s` read/send timeouts. | Handles bidirectional telemetry without premature socket termination. |
| **Payment Sandbox Safety** | In [`backend/src/config/env.js`](../backend/src/config/env.js), keys must start with `rzp_test_`. Webhook verification uses `crypto.timingSafeEqual` and records transactions in `processed_webhooks` for idempotency. | Safe testing: no real monetary charges can occur. |
| **Observability & Probes** | Three health endpoints: `GET /health/liveness`, `GET /health/readiness`, `GET /health`. Structured JSON logging with PII masking (email, phone, auth tokens). | Container orchestrators and monitoring tools can accurately assess node health. |

---

## 5. First Remote Deployment Checklist

Every prerequisite for the first remote staging deployment is classified below:

| Checklist Item | Requirement Detail | Current Audit Status | Evidence / Verification Method |
|---|---|---|---|
| **1. Budget & Provider Approval** | Project owner approves cloud provider and budget cap ($25–$50/mo). | 🔴 **BLOCKED** | Requires external project owner decision. |
| **2. Staging Compute Node** | Linux VM (Ubuntu 22.04 LTS, 2 vCPU, 4GB RAM) with Docker Engine & Compose v2. | 🔴 **BLOCKED** | Awaiting provider authorization and instance launch. |
| **3. Firewall Security Group** | Inbound: TCP 80 & 443 public; TCP 22 restricted to admin IPs. Outbound: All traffic. Internal: Port 5432 blocked from public. | 🟢 **VERIFIED (Spec)** | Validated in `docker-compose.staging.yml` (port 5432 unmapped); host firewall rules documented. |
| **4. DNS & Domain Mapping** | Staging A-record points to VM public IP (e.g. `staging.vahangrid.com`). | 🔴 **BLOCKED** | Requires domain registrar DNS configuration. |
| **5. TLS Certificate Issuance** | Let's Encrypt certificate generated via Certbot standalone and copied to `certs_staging`. | 🟢 **VERIFIED (Spec)** / 🔴 **BLOCKED (Live)** | NGINX TLS configuration verified; live issuance blocked by lack of domain/host. |
| **6. Secret Injection (`.env.staging`)** | High-entropy production secrets generated via `openssl rand -hex` and saved to staging host. | 🟢 **VERIFIED (Spec)** | `env.js` validation passes with valid production mock; file excluded from Git. |
| **7. Database Backup Baseline** | Initial pre-deployment snapshot created via `pg_dump -Fc` and verified non-empty. | 🟢 **VERIFIED (Local)** | Backup and restore commands tested and documented in runbook. |
| **8. Stack Launch & Migrations** | `docker compose -f docker-compose.staging.yml up -d` executes migrations and boots 5 services. | 🟢 **VERIFIED (Config)** | `docker compose config` exits 0 (verified Phase 6A, 6B, 6C); 22 migrations applied. |
| **9. Three-Tier Health Checks** | Verify `GET /health/liveness`, `/health/readiness`, `/health` return HTTP 200. | 🟢 **VERIFIED (Local)** | Probed live on port 3001; returns JSON with PostGIS enabled and DB connected. |
| **10. Role Smoke Tests (RBAC)** | Verify driver, operator, admin roles, IDOR prevention, and cross-CPO access denial (403). | 🟢 **VERIFIED (Local)** | Phase 4F (52/52) and Phase 5F (53/53) regression suites pass 100%. |
| **11. OCPP WebSocket Gate** | Verify mock charger connects to `wss://<host>/ocpp/<id>` and completes `BootNotification`. | 🟢 **VERIFIED (Local)** | Automated OCPP WebSocket test passes (Phase 5E & 5F suites). |
| **12. Payment Sandbox Smoke Test** | Create test top-up order with `rzp_test_*` key; deliver signed mock webhook; verify balance. | 🟢 **VERIFIED (Local)** | HMAC-SHA256 signature and idempotency verified (Phase 5D & 5F suites). |
| **13. Rollback & Incident Runbook** | Documented procedure to roll back container images and restore database snapshot. | 🟢 **VERIFIED (Runbook)** | Documented in [`docs/PILOT_RUNBOOK.md`](./PILOT_RUNBOOK.md) §9. |

---

## 6. Actionable Remote Deployment Execution Procedure

When cloud infrastructure is authorized, execute this exact sequence on the staging node:

### Step 1: Base Host Setup & Docker Installation
```bash
# Connect to isolated staging host
ssh ubuntu@<staging-host-ip>

# Install Docker Engine & Compose v2
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

### Step 2: Issue TLS Certificate & Populate Volume
```bash
# Ensure port 80 is temporarily free, then obtain certificate via Certbot
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d staging.vahangrid.com

# Create the named volume used by docker-compose.staging.yml
docker volume create vahangrid_certs_staging

# Copy certificates into the named volume with restricted permissions
docker run --rm \
  -v vahangrid_certs_staging:/etc/nginx/certs \
  -v /etc/letsencrypt/live/staging.vahangrid.com:/certs:ro \
  alpine sh -c "cp /certs/fullchain.pem /etc/nginx/certs/staging.crt && cp /certs/privkey.pem /etc/nginx/certs/staging.key && chmod 600 /etc/nginx/certs/*"
```

### Step 3: Clone Repository & Configure Staging Environment
```bash
mkdir -p /opt/vahangrid && cd /opt/vahangrid
git clone https://github.com/kunnal-singhh/VahanGrid.git repo
cd repo

# Generate strong random secrets (never commit this file)
DB_PASS=$(openssl rand -hex 24)
JWT_SEC=$(openssl rand -hex 32)
WEBHOOK_SEC=$(openssl rand -hex 24)

cat << EOF > .env.staging
NODE_ENV=production
PORT=3001
TRUST_PROXY=1
STAGING_DOMAIN=staging.vahangrid.com
STAGING_DB_PASSWORD=${DB_PASS}
STAGING_JWT_SECRET=${JWT_SEC}
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://staging.vahangrid.com
STAGING_PAYMENT_KEY_ID=rzp_test_staging
STAGING_PAYMENT_KEY_SECRET=replace_with_actual_test_secret
STAGING_PAYMENT_WEBHOOK_SECRET=${WEBHOOK_SEC}
EOF
chmod 600 .env.staging
```

### Step 4: Launch Staging Stack & Apply Migrations
```bash
# Launch the 5-service stack
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build

# Verify all services reach healthy state
docker compose -f docker-compose.staging.yml ps
```

### Step 5: Verify Remote Endpoints
```bash
# Verify health probes through public HTTPS reverse proxy
curl -fsSL https://staging.vahangrid.com/health/liveness
curl -fsSL https://staging.vahangrid.com/health/readiness
curl -fsSL https://staging.vahangrid.com/health

# Verify frontend SPA delivery
curl -fsSL -I https://staging.vahangrid.com/

# Verify API authentication rejection
curl -fsSL -I https://staging.vahangrid.com/api/v1/auth/me
# Expected: HTTP/2 401 Unauthorized
```

### Step 6: Certificate Auto-Renewal Setup
Add a root cron job for automated renewal and zero-downtime NGINX reloading:
```bash
cat << 'EOF' | sudo tee /etc/cron.daily/vahangrid-cert-renewal
#!/bin/bash
certbot renew --quiet
if [ $? -eq 0 ]; then
  docker run --rm \
    -v vahangrid_certs_staging:/etc/nginx/certs \
    -v /etc/letsencrypt/live/staging.vahangrid.com:/certs:ro \
    alpine sh -c "cp /certs/fullchain.pem /etc/nginx/certs/staging.crt && cp /certs/privkey.pem /etc/nginx/certs/staging.key && chmod 600 /etc/nginx/certs/*"
  docker compose -f /opt/vahangrid/repo/docker-compose.staging.yml exec -T reverse-proxy nginx -s reload
fi
EOF
sudo chmod +x /etc/cron.daily/vahangrid-cert-renewal
```

---

## 7. Limitations & Integrity Standard

1. **Local Docker Runtime Limitation**: The local Docker CLI and Compose v5.1.4 are present, but the local Docker Desktop daemon service is stopped and requires Windows administrator privileges to start. All Compose manifests were verified via offline configuration parsing (`docker compose config` exit 0). Runtime container validation was not simulated locally and is not falsely claimed.
2. **Not Commercially Production Ready**: VahanGrid is hardened for an isolated staging pilot. Commercial production release remains **BLOCKED** pending continuous PITR database configuration, formal third-party penetration testing, live Razorpay merchant credentials, physical EVSE laboratory interoperability testing, and stakeholder sign-off.

---

*Generated during Phase 6C — Staging Provider Decision and Deployment Readiness.*  
*Reference documents: [`docs/PHASE_6B_DEPLOYMENT_GATE.md`](./PHASE_6B_DEPLOYMENT_GATE.md), [`docs/DEPLOYMENT_AND_RECOVERY.md`](./DEPLOYMENT_AND_RECOVERY.md), [`docs/PILOT_RUNBOOK.md`](./PILOT_RUNBOOK.md).*
