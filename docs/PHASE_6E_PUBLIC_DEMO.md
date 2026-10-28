# Phase 6E — Public Demo Deployment and CI Verification

**Status:** COMPLETE
**Branch:** `main`
**Budget:** Rs.0 strictly enforced

---

## 1. Objective

Investigate and fix the GitHub Actions CI pipeline failure, verify all existing test suites pass locally, document the public demo deployment approach, and ensure no credentials or sensitive data are leaked.

---

## 2. CI Pipeline — Root Cause and Fix

### Root Cause

GitHub Actions run `40743220600` (for commit `c5cbe88`) failed at the **"Run Database Migrations"** step.

**Why:** `backend/src/scripts/migrate.js` imports `config from '../config/env.js'`. That module calls `dotenv.config()` and immediately calls `validateEnvironment(process.env)` at module load time. `validateEnvironment` exits the process with code 1 if `DATABASE_URL` **or** `JWT_SECRET` are absent.

The migration step''s `env:` block only set `DATABASE_URL` — `JWT_SECRET` was missing. Because `backend/.env` is `.gitignore`d and never committed, dotenv found no file and `process.env.JWT_SECRET` was undefined, triggering the validation exit.

### Fix Applied

A new **"Create CI .env"** step was added to `.github/workflows/ci.yml`, placed immediately after `npm ci` and before the migration step. It writes a minimal `backend/.env` file containing all required environment variables with non-sensitive CI-only placeholder values.

The values written to CI `.env` are:
- Non-secret CI-only placeholders used in an isolated, ephemeral GitHub Actions runner
- Never committed to the repository
- Overwritten on every CI run
- No real credentials, no production secrets

---

## 3. Environment Variables Reference

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL + PostGIS connection string |
| `JWT_SECRET` | JWT signing secret — minimum 32 characters |

### Optional

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Runtime environment |
| `PORT` | `3001` | HTTP API listen port |
| `PAYMENT_KEY_ID` | `rzp_test_vahangrid` | Razorpay key ID |
| `PAYMENT_KEY_SECRET` | `test_payment_secret` | Razorpay key secret |
| `PAYMENT_WEBHOOK_SECRET` | `test_webhook_secret` | Razorpay webhook secret |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin(s) |
| `JWT_EXPIRES_IN` | `7d` | JWT token lifetime |

See `backend/.env.example` for the full canonical reference.

---

## 4. Local Test Suite Verification

All suites executed locally against a live PostgreSQL 16 + PostGIS 3.4 instance.

| Suite | Tests | Result |
|---|---|---|
| Phase 5G — Release Candidate Hardening | 104 | PASS 104 passed, 0 failed |
| Phase 5F — Staging Integration | 53 | PASS 53 passed, 0 failed |
| Phase 5E — Remote Staging Verification | 59 | PASS 59 passed, 0 failed |
| Frontend Production Build | — | PASS Built in ~8s, no errors |

---

## 5. Public Demo — Deployment Status

### Current status

| Layer | Status | Notes |
|---|---|---|
| Backend API (Express + OCPP) | **Local only** | No public server provisioned |
| Database (PostgreSQL + PostGIS) | **Local only** | No cloud DB provisioned |
| Frontend SPA (React + Vite) | **Deployable** | Static build ready; free-tier hosting viable |
| CI Pipeline | **GitHub Actions** | Fixed; will run on next push to `main` |

### Frontend public demo options (Rs.0 budget)

| Platform | Free tier | SPA routing | Custom domain |
|---|---|---|---|
| **Cloudflare Pages** | Unlimited builds, 500 deploys/month | Yes | Yes |
| **Netlify** | 100 GB bandwidth/month | Yes (`public/_redirects`) | Yes |
| GitHub Pages | 1 GB storage, 100 GB/month | No (requires hash routing) | Yes (CNAME) |

`frontend/public/_redirects` (created in Phase 6D) handles SPA routing:

```
/*    /index.html    200
```

### Backend public demo — current constraint

No zero-cost persistent-database cloud backend is available without registration. The backend continues to run locally. The frontend static demo is independently deployable.

---

## 6. Secret Leakage Audit

| Check | Result |
|---|---|
| `backend/.env` is gitignored | PASS |
| `backend/.env` not tracked by git | PASS |
| `.env.example` contains no real secrets | PASS |
| No secret embedded in source files | PASS |
| CI `.env` values are non-secret CI-only placeholders | PASS |

---

## 7. CORS Configuration

The backend reads `FRONTEND_URL` (comma-separated list) and configures Express CORS to allow only those origins. For a Netlify/Cloudflare Pages deployment, set `FRONTEND_URL` to the public URL before starting the backend.

---

## 8. SPA Route Fallback

- **Frontend NGINX** (`frontend/nginx.conf`): `try_files $uri $uri/ /index.html`
- **Netlify / Cloudflare Pages**: `frontend/public/_redirects` — `/* /index.html 200`

---

## 9. CI Workflow Summary

File: `.github/workflows/ci.yml`

Steps:
1. Checkout code
2. Setup Node.js 20 with npm cache
3. Install backend dependencies (`npm ci`)
4. **Create CI `.env`** (new step — fixes previous CI failure)
5. Run database migrations (`migrate.js`)
6. Start backend API + OCPP server (health-checked)
7. Phase 5G hardening suite (104 tests)
8. Phase 5F staging integration suite (53 tests)
9. Phase 5E remote staging suite (59 tests)
10. Phase 5D blocker remediation suite
11. Phase 4F platform reliability suite
12. Install frontend dependencies (`npm ci`)
13. Build frontend production bundle (`npm run build`)
14. Validate Docker Compose staging manifest

Trigger: push or pull request to `main`.
Runner: `ubuntu-latest` (GitHub-hosted, Rs.0).
PostGIS service container: `postgis/postgis:16-3.4-alpine`.

---

## 10. Free-Tier Limits

| Service | Limit | Risk |
|---|---|---|
| GitHub Actions | Unlimited (public repo) | None |
| Cloudflare Pages | 500 deploys/month, unlimited bandwidth | None for a demo |
| Netlify | 100 GB/month bandwidth, 300 min build/month | None for a demo |

---

## 11. Next Steps (Conditional)

| Action | Condition | Cost |
|---|---|---|
| Deploy frontend to Cloudflare Pages | Project owner authorises GitHub connection | Rs.0 |
| Deploy backend to Render free tier | Project owner creates Render account | Rs.0 |
| Provision managed PostgreSQL (Neon/Supabase free) | Project owner creates account | Rs.0 |

None of the above are executed in Phase 6E.
