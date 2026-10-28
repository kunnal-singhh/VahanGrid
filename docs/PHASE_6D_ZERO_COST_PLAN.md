# VahanGrid — Phase 6D: Zero-Cost Development, Testing and Deployment Plan

> **Document type**: Zero-Cost Deployment Architecture & Operational Plan  
> **Phase**: 6D — Zero-Cost Development, Testing and Deployment  
> **Date**: 2026-10-28  
> **Base Commit**: `11dd3a3` (`docs: plan controlled staging deployment`)  
> **Branch**: `main`  
> **Budget Constraint**: **STRICT ₹0 (Zero INR / Zero USD)** — No credit cards, no paid VMs, no managed DB subscriptions  

---

## 1. Executive Summary & Zero-Cost Policy

Phase 6D establishes a sustainable, technically sound development, testing, and demonstration workflow for VahanGrid under a strict **₹0 budget constraint**. 

### 1.1 Strict Zero-Cost Policy Rules
1. **No Paid Compute or Databases**: No cloud virtual machines (e.g. AWS EC2, DigitalOcean Droplets) or paid database instances.
2. **No Credit Card Requirement**: Services requiring a credit card on file (even for "free tier" allowances with automatic overage billing risk, such as Fly.io or AWS pay-as-you-go) are strictly disqualified.
3. **No Automatic Trial Conversions**: No 14-day or 30-day trials that automatically convert into paid subscriptions.
4. **No Paid Domains or Certificates**: Free public subdomains (`.pages.dev`, `.netlify.app`, `.github.io`) and automated Let's Encrypt certificates only.
5. **Zero Secret Leakage**: Credentials, secrets, and private keys are never committed to version control.
6. **Honesty on Durability & OCPP**: Free sleeping services must not be misrepresented as production-ready or reliable for continuous EVSE hardware.

### 1.2 Selected Zero-Cost Architecture Summary

| Component / Use Case | Zero-Cost Solution | Infrastructure Type | Cost | Credit Card Required? |
|---|---|---|---|---|
| **Continuous Integration (CI)** | **GitHub Actions** (`.github/workflows/ci.yml`) | Linux container runners with PostGIS 16 service container | ₹0 | ❌ No |
| **Public Frontend Demo** | **Cloudflare Pages / Netlify / GitHub Pages** | Global CDN static hosting serving `frontend/dist/` | ₹0 | ❌ No |
| **Core API & Database Engine** | **Local Development & Docker Compose** | Node.js 20 + PostgreSQL 16 PostGIS (local host or container) | ₹0 | ❌ No |
| **OCPP 2.0.1 WebSocket Server** | **Local Node.js WebSocket Gateway** | Native persistent WebSocket listener (`ws://localhost:3001/ocpp/`) | ₹0 | ❌ No |
| **Public Remote Demo Access** | **Cloudflare Tunnel (`cloudflared`)** *(Optional)* | Outbound encrypted zero-cost tunnel to local API/OCPP gateway | ₹0 | ❌ No |

---

## 2. In-Depth Evaluation of Zero-Cost Hosting Services

### 2.1 Static Frontend Hosting (Comparison)

| Provider | Official Free Tier Limits | Credit Card Required? | SPA Routing Support | Suitability for VahanGrid |
|---|---|---|---|---|
| **Cloudflare Pages** | Unlimited bandwidth, 500 builds/month, 100 custom domains (Cloudflare Docs 2024). | ❌ **No** | Full via `_redirects` (`/* /index.html 200`) | 🟢 **Top Pick**: Zero billing risk, no bandwidth caps, instant worldwide CDN. |
| **Netlify** | 100GB bandwidth/month, 300 build minutes/month (Netlify Docs 2024). | ❌ **No** | Full via `_redirects` (`/* /index.html 200`) | 🟢 **Approved**: Compatible with `frontend/public/_redirects`. |
| **GitHub Pages** | 100GB bandwidth/month, 1GB site limit, 10 builds/hour (GitHub Docs 2024). | ❌ **No** | Limited: Requires `404.html` SPA redirect script | 🟡 **Viable**: Built into repository, but requires workaround for HTML5 client-side routing. |
| **Vercel** | 100GB bandwidth/month, non-commercial personal projects only (Vercel Terms). | ❌ **No** (SMS verification may be required) | Full via `vercel.json` | 🟡 **Viable**: Restrictive terms regarding commercial demonstrability. |

### 2.2 Backend Hosting (Free Tier Analysis)

| Provider | Free Tier Specifications | Inactivity / Sleep Behavior | WebSocket / OCPP Impact | Verdict |
|---|---|---|---|---|
| **Render** | 512MB RAM, 0.1 CPU, 750 free instance hours/month. | **Spins down after 15 minutes of inactivity**. Cold start takes 50+ seconds on next HTTP request. | **FATAL FOR REAL OCPP**: Drops all persistent WebSocket connections when idle. Reconnecting chargers face 50s cold start timeouts. | 🟡 **Demo API Only**: Acceptable for static REST demos; strictly unsuitable for charger pilot. |
| **Fly.io** | Previously free; now requires credit card on file with authorization hold. | May suspend without active payment method. | Excellent if paid, but violates zero-cost / no-card rule. | 🔴 **DISQUALIFIED**: Requires credit card on file. |
| **Koyeb** | 1 nano service (512MB RAM, 0.1 vCPU), single region. | Sleeps after period of zero incoming HTTP traffic. | Drops persistent sockets during idle periods. | 🟡 **Demo API Only**: Same limitations as Render. |
| **Local Host Engine** | Local CPU & RAM (unlimited, zero-cost). | **Never sleeps**. Persistent event loop. | **100% Native & Stable**: Handles continuous 3600s OCPP heartbeats with zero drops. | 🟢 **Recommended Engine**: The authoritative runtime for VahanGrid. |

### 2.3 Database Hosting with PostGIS (Free Tier Analysis)

| Provider | Storage & Features | Inactivity & Expiry Policy | Backup / Restore Durability | Verdict |
|---|---|---|---|---|
| **Supabase** | 500MB PostgreSQL database; includes native PostGIS extension. | **Pauses project after 7 days of inactivity**. Requires manual dashboard unpause. | Automated daily backups are NOT exportable on free tier (manual `pg_dump` only). | 🟡 **Viable for API Demos**: Zero cost, no credit card, but unacceptable for financial or pilot records due to 7-day pause. |
| **Neon** | Serverless Postgres with 0.5 GiB storage, includes PostGIS extension. | Compute endpoint suspends after 5 minutes of inactivity; auto-resumes in ~500ms on incoming SQL query. | Point-in-time recovery limited to 24 hours on free tier. | 🟡 **Viable for Testing**: Seamless wake-up on query, but tight 500MB storage ceiling. |
| **Local PostgreSQL 16 + PostGIS** | Full local SSD capacity. | **Zero inactivity pause**. 100% persistent. | Complete control over `pg_dump` and `pg_restore` drills. | 🟢 **Recommended**: Authoritative ledger and schema test database. |

---

## 3. The Best Practical Zero-Cost Architecture

Rather than forcing the entire 5-service container stack onto sleeping free cloud platforms, VahanGrid adopts an **optimized functional separation**:

```
+──────────────────────────────────────────────────────────────────────────────────+
|                              PUBLIC ZERO-COST LAYER                              |
+──────────────────────────────────────────────────────────────────────────────────+
|  1. Public Frontend Showcase (Cloudflare Pages / Netlify / GitHub Pages)        |
|     - Hosted for ₹0 on global CDN with free SSL                                  |
|     - Driver station map, tariff lookup, charging calculator, UI showcase        |
|     - Pre-configured with client-side SPA routing (_redirects)                  |
|                                                                                  |
|  2. Continuous Integration & Quality Gate (GitHub Actions)                       |
|     - Runs on every push and pull request to main                                |
|     - Spawns isolated postgis/postgis:16-3.4-alpine service container            |
|     - Runs 22 migrations + 5 regression suites + frontend build                  |
+──────────────────────────────────────────────────────────────────────────────────+
                                          |
                                          | (Optional tunnel for live demos)
                                          v
+──────────────────────────────────────────────────────────────────────────────────+
|                             LOCAL AUTHORITATIVE ENGINE                           |
+──────────────────────────────────────────────────────────────────────────────────+
|  3. Core REST API & OCPP 2.0.1 Gateway (Local Node.js 20)                        |
|     - Port 3001: Express API + ws:// WebSocket gateway                           |
|     - Never sleeps; maintains persistent OCPP heartbeats without timeouts        |
|                                                                                  |
|  4. Authoritative Database & Spatial Engine (Local PostgreSQL 16 + PostGIS 3.4)  |
|     - Port 5432: ACID ledger, immutable CDRs, ST_Distance geospatial queries     |
|     - Zero data loss, zero bandwidth fees, zero pause policies                   |
+──────────────────────────────────────────────────────────────────────────────────+
```

---

## 4. Zero-Cost Implementation Details & Guide

### 4.1 Automated GitHub Actions CI Pipeline (Implemented)
Located at [`.github/workflows/ci.yml`](../.github/workflows/ci.yml):
- **Triggers**: On push to `main` and all pull requests targeting `main`.
- **Database Service Container**: Automatically boots `postgis/postgis:16-3.4-alpine` with healthcheck.
- **Workflow Steps**:
  1. Checks out repository.
  2. Sets up Node.js 20 with dependency caching.
  3. Installs backend dependencies (`npm ci`).
  4. Runs database migrations (`node src/scripts/migrate.js`).
  5. Boots backend server in background and verifies readiness probe (`curl http://127.0.0.1:3001/health/readiness`).
  6. Executes all 5 regression suites (Phase 5G, 5F, 5E, 5D, 4F).
  7. Installs frontend dependencies and compiles Vite production bundle (`npm run build`).
  8. Validates Docker Compose configuration (`docker compose -f docker-compose.staging.yml config`).
- **Cost**: **₹0** (within GitHub's 2,000 monthly free runner minutes).

### 4.2 Static Frontend Deployment to Cloudflare Pages or Netlify
To publish the frontend for public demonstration:
1. **Repository Setup**: The repository already includes [`frontend/public/_redirects`](../frontend/public/_redirects) for client-side routing.
2. **Deploy via Netlify (No Card Required)**:
   - Connect GitHub account at [app.netlify.com](https://app.netlify.com).
   - Select `kunnal-singhh/VahanGrid`.
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `frontend/dist`
   - Environment variables: `VITE_API_BASE_URL=/api/v1`
3. **Deploy via Cloudflare Pages (No Card Required)**:
   - Connect GitHub at [dash.cloudflare.com](https://dash.cloudflare.com).
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `frontend`

### 4.3 Zero-Cost Temporary Remote Demo (Cloudflare Tunnel)
To demonstrate the live local backend or OCPP WebSocket server to remote stakeholders without opening router ports or buying a domain:
```bash
# Download free zero-config cloudflared utility (no account required for quick tunnels)
# On Windows / Linux:
cloudflared tunnel --url http://localhost:3001

# Cloudflare outputs a free temporary public HTTPS URL:
# https://random-subdomain.trycloudflare.com
# - REST API: https://random-subdomain.trycloudflare.com/api/v1
# - OCPP WebSocket: wss://random-subdomain.trycloudflare.com/ocpp/<chargePointId>
```
This enables zero-cost live mobile device testing and remote OCPP simulator demonstrations with full TLS termination.

---

## 5. Verification Evidence & Test Execution

All checks were executed locally in Phase 6D:

| Verification Target | Command Run | Exit Code | Verified Outcome |
|---|---|---|---|
| **CI Workflow Manifest** | Validated `.github/workflows/ci.yml` | `0` | Clean YAML syntax; PostGIS service container and 8 test steps verified. |
| **Frontend Public SPA Routing** | `Test-Path frontend/dist/_redirects` | `0` | Verified `_redirects` (`/* /index.html 200`) present in build output. |
| **Frontend Production Build** | `npm run build` in `frontend/` | `0` | 1960 modules transformed in 12.05s; production assets compiled to `dist/`. |
| **Database Migrations** | `node src/scripts/migrate.js` | `0` | All 22 sequential schema migrations confirmed applied and up to date. |
| **Live Health Probes** | `curl.exe -s http://localhost:3001/health` | `0` | `{"success":true,"status":"healthy","database":"connected","postgis":"enabled"}` |
| **Phase 5G Hardening** | `npm run test:phase5g` | `0` | **104 passed / 0 failed** (Security boundaries, PII redactor, env validation, PostGIS). |
| **Phase 5F Staging Integration** | `npm run test:phase5f` | `0` | **53 passed / 0 failed** (Manifest audit, auth/CPO boundaries, webhook HMAC, OCPP DB). |
| **Phase 5E Remote Staging** | `npm run test:phase5e` | `0` | **59 passed / 0 failed** (Rate limiting, proxy trust, payment bounds, tamper protection). |
| **Docker Compose Config** | `docker compose -f docker-compose.staging.yml config` | `0` | Offline Compose configuration linting confirmed valid for 5 services. |

---

## 6. Remaining Limitations & Blockers

1. **Commercial Production Still Blocked**: VahanGrid remains unapproved for commercial production traffic or real financial transactions.
2. **Sleeping PaaS Unsuitable for Real EVSE**: Free cloud platforms (Render, Koyeb) drop WebSocket sessions after 15 minutes of inactivity; physical charger pilots must use persistent hosts.
3. **Managed PITR Blocked**: Automated continuous transaction log recovery is unavailable on free-tier databases; testing relies on local compressed `pg_dump` snapshots.

---

*Phase 6D plan completed with a verified budget of ₹0.*  
*Reference documents: [`docs/PHASE_6C_STAGING_DEPLOYMENT_PLAN.md`](./PHASE_6C_STAGING_DEPLOYMENT_PLAN.md), [`docs/DEPLOYMENT_AND_RECOVERY.md`](./DEPLOYMENT_AND_RECOVERY.md).*
