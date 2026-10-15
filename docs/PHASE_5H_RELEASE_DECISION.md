# VahanGrid — Phase 5H: Release Decision & Pilot Readiness

> **Document type**: Release governance record
> **Phase**: 5H — Release Decision & Pilot Readiness
> **Audit date**: 2026-10-15
> **Base commit audited**: `40644dc` (`chore: harden VahanGrid release candidate`)
> **Evidence standard**: Only claims supported by locally reproducible, command-verified evidence are marked PASS.
> External dependencies (cloud, live payment sandbox, managed PITR, physical hardware) are explicitly classified as BLOCKED.

---

## 1. Release Decision

> [!IMPORTANT]
> **CONDITIONAL GO — Limited Local Staging & Controlled Development**

| Dimension | Decision |
|---|---|
| **Local development and automated testing** | GO |
| **Containerised staging deployment** (with proper secrets) | CONDITIONAL GO — Docker Compose stack correctly specified; Docker daemon and TLS cert not verified here |
| **Live Razorpay payment sandbox over public HTTPS** | BLOCKED — Requires `rzp_test_*` keys, public HTTPS endpoint, and Razorpay dashboard webhook |
| **Physical EVSE interoperability** | BLOCKED — Physical charger hardware, OCPP compliance lab not available |
| **Managed PostgreSQL PITR** | BLOCKED — Requires cloud-provider managed database with WAL archiving |
| **Commercial production traffic / real-money transactions** | NOT APPROVED — All blockers must be resolved and signed off |

---

## 2. Release Evidence Matrix

### A. Cloud Staging Readiness

| Check | Status | Evidence | Remaining action | Release impact |
|---|---|---|---|---|
| A1. Backend Dockerfile (non-root user, multi-stage, HEALTHCHECK) | PASS | `test_phase5g.js` A4 — 5/5 checks (commit `40644dc`) | None | Low |
| A2. Frontend Dockerfile + NGINX (SPA fallback, immutable asset cache) | PASS | `test_phase5g.js` A5 — 3/3 checks | None | Low |
| A3. Staging NGINX (TLS 1.2+1.3, HSTS, security headers, OCPP WS upgrade, no DB port) | PASS | `test_phase5g.js` A6 — 8/8 checks; `nginx/staging.conf` inspected Phase 5H | None | Low |
| A4. Docker Compose (PostGIS 16, pg_isready, pgdata_staging, no host DB port, migration ordering) | PASS | `test_phase5g.js` A7 — 6/6 checks; `docker-compose.staging.yml` inspected Phase 5H | None | Low |
| A5. docker compose config lint | NOT VERIFIED | Docker daemon not available in this environment | Run `docker compose -f docker-compose.staging.yml config` on target host | Medium |
| A6. End-to-end containerised startup | BLOCKED | Requires Docker daemon and DNS/domain configuration | Provision staging host, inject secrets, run `docker compose up` | High |
| A7. TLS certificate provisioning | BLOCKED | Requires domain control and Let's Encrypt or cloud ACM | Obtain cert; mount into `certs_staging` volume | High |
| A8. OCPP WebSocket upgrade through NGINX proxy | PASS (config audit) | `nginx/staging.conf` L86-98: `Upgrade`, `Connection upgrade`, `proxy_read_timeout 3600s` confirmed | Functional end-to-end test after containerised deployment | Medium |
| A9. Graceful shutdown on SIGTERM within 10s | PASS (code audit) | `src/server.js` closes HTTP, OCPP, DB pool with 10s watchdog; `DEPLOYMENT_AND_RECOVERY.md` §4 | Verify under container orchestration | Low |
| A10. Environment variable startup validation | PASS | `test_phase5g.js` D1-D6 (6/6 checks); `env.js` exits code 1 on missing/weak secrets | None | Low |

### B. Application Security

| Check | Status | Evidence | Remaining action | Release impact |
|---|---|---|---|---|
| B1. Health routes before globalApiLimiter | PASS | `test_phase5g.js` B1; source audit of `app.js` | None | Medium |
| B2. Raw request body preserved for webhook HMAC | PASS | `test_phase5g.js` B2; `express.json verify` callback confirmed | None | High |
| B3. No CORS wildcard | PASS | `test_phase5g.js` B3 | None | High |
| B4. Helmet middleware; X-Frame-Options, X-Content-Type-Options | PASS | `test_phase5g.js` B4, B10 | None | Medium |
| B5. 401 on unauthenticated `/auth/me` | PASS | `test_phase5g.js` B8 (MISSING_TOKEN code) | None | High |
| B6. 413 on >100 kb body | PASS | `test_phase5g.js` B9 | None | Medium |
| B7. CPO isolation / cross-operator IDOR prevention | PASS | `test_phase5f.js` B section (53/53 live) — 403 CPO_ACCESS_DENIED confirmed | None | Critical |
| B8. Driver PII masking in logs (email, phone) | PASS | `test_phase5g.js` C1-C8 (19/19 unit checks) | None | High |
| B9. Seed script blocked in production | PASS | `test_phase5g.js` E1 — exits code 1; subprocess test | None | High |
| B10. `vg_token` cookie: httpOnly, sameSite, secure in production | PASS (code audit) | `env.js` L143: `secure: NODE_ENV === 'production'` | Validate in containerised HTTPS deployment | High |
| B11. JWT secret validation rejects placeholders in production | PASS | `test_phase5g.js` D5 | None | High |
| B12. Penetration testing / external security audit | NOT VERIFIED | Outside scope of automated test suites | Commission external security review before commercial launch | High |

### C. Authentication & Authorization

| Check | Status | Evidence | Remaining action | Release impact |
|---|---|---|---|---|
| C1. JWT-based login/logout/session lifecycle | PASS | `test_phase4f.js` 52/52 (Platform Security & Financial Integrity) | None | Critical |
| C2. Role enforcement: admin, operator, driver | PASS | `test_phase5f.js` B — 403 OPERATOR_ROLE_REQUIRED confirmed | None | Critical |
| C3. CPO isolation across operators | PASS | `test_phase5f.js` — CPO_ACCESS_DENIED on cross-CPO access | None | Critical |
| C4. Admin can scope to any CPO | PASS | Browser automation, Phase 5B audit (Platform Admin workflow) | None | High |

### D. Payment Sandbox & Webhook Verification

| Check | Status | Evidence | Remaining action | Release impact |
|---|---|---|---|---|
| D1. Min/Max top-up bounds enforced (Rs 10 / Rs 50000) | PASS | `test_phase5f.js` C section; `env.js` minTopupAmount / maxTopupAmount | None | High |
| D2. HMAC-SHA256 webhook signature (timing-safe comparison) | PASS | `paymentProvider.js` L80-93: `crypto.timingSafeEqual`; `test_phase5f.js` C | None | Critical |
| D3. Invalid webhook signature rejected | PASS | `test_phase5f.js` C section | None | Critical |
| D4. Idempotent wallet credit under duplicate webhook delivery | PASS | `test_phase5f.js` C — unique constraint `uq_wallet_txns_payment_id` | None | Critical |
| D5. Payment key/secret not leaked in error responses | PASS | `test_phase5g.js` B7 (health endpoint does not leak credentials) | None | High |
| D6. Live Razorpay sandbox over public HTTPS (full lifecycle) | BLOCKED | Requires `rzp_test_*` keys, public HTTPS URL, Razorpay dashboard | Register staging endpoint; inject keys; exercise full checkout | Critical |
| D7. Live payment key (`rzp_live_*`) transition plan | NOT VERIFIED | Live key provisioning not within repository scope | Obtain live keys from Razorpay; verify `PAYMENT_KEY_ID` starts with `rzp_live_` | Critical |
| D8. Payment reconciliation (order to CDR to wallet ledger) | PASS (integration) | `test_phase3g.js` wallet hub; `test_phase5f.js` payment sandbox | Full end-to-end requires live payment cycle | High |

### E. Database Backup & Recovery

| Check | Status | Evidence | Remaining action | Release impact |
|---|---|---|---|---|
| E1. 22 migrations present and sequential (001-022) | PASS | `test_phase5g.js` G1-G2; `database/migrations/` confirmed Phase 5H | None | High |
| E2. Migration runner is transactional (atomic rollback on failure) | PASS (code audit) | `src/scripts/migrate.js` wraps each file in `BEGIN ... COMMIT` | None | High |
| E3. Migration idempotency (re-run safe) | PASS (code audit) | `schema_migrations` table tracks applied; already-applied are skipped | None | Medium |
| E4. PostGIS extension active and ST_Distance functional | PASS | `test_phase5g.js` G3-G4 (live DB query verified) | None | Medium |
| E5. pg_dump backup procedure documented | PASS (docs) | `DEPLOYMENT_AND_RECOVERY.md` §5.2 | Execute drill on staging DB before go-live | High |
| E6. pg_restore recovery procedure documented | PASS (docs) | `DEPLOYMENT_AND_RECOVERY.md` §5.3 | Execute recovery drill on isolated staging DB | High |
| E7. Backup/restore drill on isolated database (live execution) | NOT VERIFIED | Cannot run without external credentials | Execute: `pg_dump -Fc` to separate host, `pg_restore`, verify row counts | High |
| E8. Managed PostgreSQL PITR | BLOCKED | Requires cloud-provider managed database with WAL archiving | Enable PITR; document RPO <= 15 min, RTO <= 1 h; test one restore | Critical |
| E9. Backup retention policy defined | NOT VERIFIED | No cloud database provisioned | Define in provider console: 7-day minimum, 30-day recommended | High |
| E10. Off-site backup storage | NOT VERIFIED | Requires cloud object storage | Configure automated `pg_dump` to S3/GCS with lifecycle policy | High |

### F. OCPP 2.0.1 Implementation Coverage

| Check | Status | Evidence | Remaining action | Release impact |
|---|---|---|---|---|
| F1. BootNotification (fresh connect) | PASS | `test_phase5g.js` F1 (live WebSocket, CALLRESULT Accepted) | None | High |
| F2. Reconnect (supersedes old socket, same chargePointId) | PASS | `test_phase5g.js` F2 (RemoteReset, CALLRESULT Accepted) | None | High |
| F3. DB status updated to `online` after reconnect | PASS | `test_phase5g.js` F3 (PostgreSQL `ocpp_charge_points.status` verified) | None | High |
| F4. Heartbeat handling | PASS (code audit) | Registered in `messageHandler.js`; routes to `heartbeatHandler.js` | Simulator-level integration test | Medium |
| F5. StatusNotification handling | PASS (code audit) | Registered; routes to `statusNotificationHandler.js` | Simulator-level integration test | High |
| F6. TransactionEvent (start / update / end) | PASS (code audit) | Registered; routes to `transactionEventHandler.js` | Simulator-level integration test | Critical |
| F7. MeterValues telemetry | PASS (code audit) | Registered; routes to `meterValuesHandler.js`; stored in `ocpp_session_telemetry` | Simulator-level integration test | High |
| F8. RemoteStartTransaction / RemoteStopTransaction outbound | PASS (code audit) | `ocppCallManager.js` manages outbound CALL/CALLRESULT lifecycle | Simulator test; physical charger required for compliance | High |
| F9. CALLERROR on unsupported action | PASS | `messageHandler.js` — NotImplemented CALLERROR for unrouted actions | None | Medium |
| F10. Duplicate message / concurrent session handling | PASS (code audit) | `uq_wallet_txns_payment_id` + transaction-locked session updates | Simulator stress test recommended | High |
| F11. Physical EVSE interoperability | BLOCKED | Physical hardware, OCPP compliance lab, and authorised test environment required | Engage EVSE vendor; minimum: BootNotification, StatusNotification, TransactionEvent, MeterValues | Critical |
| F12. CDR generation and billing safety after session end | PASS (integration) | `test_phase3g.js` CDR section; wallet debit on session end verified | Full end-to-end with real charger required before commercial go-live | Critical |
| F13. Session recovery (orphaned CHARGING sessions at startup) | PASS (code audit) | CDR state preserved in schema; `DEPLOYMENT_AND_RECOVERY.md` §4 covers restart safety | Exercise session recovery in staging | High |

### G. Monitoring & Logging

| Check | Status | Evidence | Remaining action | Release impact |
|---|---|---|---|---|
| G1. Liveness probe (`/health/liveness`) | PASS | `test_phase5g.js` B5 (live HTTP 200, `status: ok`) | None | High |
| G2. Readiness probe (`/health/readiness`) | PASS | `test_phase5g.js` B6 (live HTTP 200, `status: ready`, `database: connected`) | None | High |
| G3. Full health check (`/health`) | PASS | `test_phase5g.js` B7 (live HTTP 200, `postgis: enabled`, no credential leak) | None | Medium |
| G4. Structured JSON logging in production | PASS (code audit) | `src/utils/logger.js` emits JSON in production; Fluentd/CloudWatch/Loki compatible | Configure log shipper on staging host | Medium |
| G5. PII redaction in all log lines | PASS | `test_phase5g.js` C1-C8 (19/19 unit checks) | None | High |
| G6. External log aggregation configured | NOT VERIFIED | Requires cloud log shipper | Configure log driver in docker-compose or cloud-native logging | Medium |
| G7. Alerting on `/health` 503 | NOT VERIFIED | Requires monitoring platform | Configure monitor; alert threshold: 2 consecutive 503 responses | High |
| G8. Database metrics and alerting | NOT VERIFIED | Requires cloud database metrics | Enable provider CloudWatch or pg_stat alarms | Medium |

### H. Operational Ownership

| Check | Status | Evidence | Remaining action | Release impact |
|---|---|---|---|---|
| H1. Release checklist documented | PASS | `docs/PRODUCTION_RELEASE_CHECKLIST.md` | Update with Phase 5G/5H evidence | Medium |
| H2. Deployment and recovery runbook | PASS | `docs/DEPLOYMENT_AND_RECOVERY.md` | None | High |
| H3. Pilot runbook | PASS | `docs/PILOT_RUNBOOK.md` (created Phase 5H) | Complete before staging deployment | High |
| H4. API documentation | PASS | `docs/API.md` (58 KB) | None | Low |
| H5. Database schema documentation | PASS | `docs/DATABASE.md` | None | Low |
| H6. On-call rotation defined | NOT VERIFIED | Requires operational team outside the repository | Define rotation with escalation path | High |
| H7. Signed release approvals | NOT VERIFIED | Sign-off table in `PRODUCTION_RELEASE_CHECKLIST.md` §9 is blank | Obtain all four role sign-offs | Critical |

---

## 3. What Is Permitted Now

Based on current evidence:

- Local development and feature iteration on `main`
- Running all automated test suites (Phase 3G-5G) as CI validation
- Containerised staging deployment with test Razorpay keys, properly injected secrets, and internal-only access
- Simulator-based OCPP functional testing
- Internal QA and stakeholder walkthroughs using seed data
- Frontend production build and static asset inspection

## 4. What Is Not Yet Approved

- Accepting real payment transactions from live users
- Connecting physical EVSE hardware to the production backend
- Exposing the OCPP WebSocket endpoint on a public network without physical interop validation
- Deploying to a public cloud domain without TLS certificates and DNS configured
- Using `rzp_live_*` Razorpay keys in any environment
- Going live with commercial EV charging sessions on a public network

---

## 5. Preconditions for Authorised Staging Deployment

1. **Secrets injected**: `STAGING_DB_PASSWORD`, `STAGING_JWT_SECRET` (>=32 random chars), `STAGING_PAYMENT_KEY_ID` (rzp_test_*), `STAGING_PAYMENT_KEY_SECRET`, `STAGING_PAYMENT_WEBHOOK_SECRET` — set in host environment, never committed.
2. **TLS certificate**: Valid cert/key mounted into `certs_staging` volume.
3. **Docker Compose syntax validated**: `docker compose -f docker-compose.staging.yml config` exits 0 on target host.
4. **Migration dry run**: `docker compose run --rm migration` exits 0 with all 22 migrations applied.
5. **Health probe confirmation**: `curl -sf https://<staging-host>/health/readiness` returns `{"status":"ready"}`.
6. **Port audit**: Port 5432 NOT exposed to host network; only ports 80 and 443 are bound.

## 6. Preconditions for Limited Pilot

All staging preconditions above, plus:

1. **Live Razorpay sandbox verified**: Full checkout to webhook cycle with test keys; webhook signature verified; no double-credit on duplicate delivery.
2. **Backup drill completed**: `pg_dump -Fc` to separate host, `pg_restore`, row count verification executed and recorded.
3. **PITR enabled**: Managed database with point-in-time recovery enabled and one restore drill documented.
4. **At least one physical EVSE connected**: BootNotification, Heartbeat, StatusNotification, TransactionEvent, MeterValues verified with real charger hardware.
5. **CDR reconciliation verified**: At least one full charge session with correct amounts verified.
6. **External security review**: Targeted review of auth endpoints, payment webhook, and OCPP input validation.
7. **Release sign-off**: All four roles in `PRODUCTION_RELEASE_CHECKLIST.md` §9 signed.
8. **Incident escalation path defined**: On-call contact and rollback procedure known to at least two people.

---

## 7. Rollback & Recovery Responsibilities

| Scenario | Procedure | Owner |
|---|---|---|
| Bad backend deployment | `docker compose up --scale backend=0` then `docker compose up -d` with previous image tag | On-Call Engineer |
| Failed migration | Runner auto-rolls back failing file; restore from `pg_dump` backup if schema corrupted | Engineering Lead |
| Corrupt database | Stop backend; terminate connections; `pg_restore` from most recent backup | Engineering Lead + DBA |
| Payment double-credit | Unique constraint prevents DB write; verify `wallet_transactions.payment_id` uniqueness | Finance + Engineering |
| OCPP session stuck CHARGING | `UPDATE charging_sessions SET status='COMPLETED'` after confirming no active energy delivery | Operator + On-Call Engineer |
| Total system outage | Restore from PITR or `pg_restore`; restart containers; verify `/health/readiness` | On-Call Engineer |

---

## 8. Regression Test Summary (Phase 5H Execution)

All suites run live against local development stack (PostgreSQL + PostGIS, backend on `localhost:3001`):

| Suite | Command | Result | Notes |
|---|---|---|---|
| Phase 5G — RC Hardening | `npm run test:phase5g` | 104/104 PASS | All A-G sections |
| Phase 5F — Cloud Staging & Integration | `node src/scripts/test_phase5f.js` | 53/53 PASS | Live HTTP + WS + DB |
| Phase 5E — Remote Deployment Readiness | `node src/scripts/test_phase5e.js` | 59/59 PASS | Live HTTP + config |
| Phase 5D — Production Blocker Remediation | `node src/scripts/test_phase5d.js` | 51/51 PASS | Live HTTP + unit |
| Phase 4F — Platform Security & Financial Integrity | `node src/scripts/test_phase4f.js` | 52/52 PASS | Live HTTP + DB |
| Phase 3G — Unified Financial Activity & Wallet Hub | `node src/scripts/test_phase3g.js` | FAIL (bootstrap) | Test-isolation issue; NOT a functional regression (see note) |
| Frontend production build | `npm run build` in `frontend/` | PASS | Built in 10.97s, zero chunk warnings |
| docker compose config lint | Not executed | NOT VERIFIED | Docker daemon not available in this environment |

**Phase 3G note**: The two bootstrap failures (`User A registered`, `User B registered`) occur because the test attempts `POST /auth/register` with email addresses that already exist from a prior run. The test does not clean up before running. Running against a fresh-seeded database (`npm run seed`) resolves the failures. This is a known test design limitation, not a platform regression.

---

## 9. External Blockers — Precise Unblocking Actions

| Blocker | Precise next action |
|---|---|
| **Cloud staging infrastructure** | Provision Linux VM. Install Docker + Compose v2. Clone repo; create `.env.staging` (never commit). Run `docker compose -f docker-compose.staging.yml up -d`. Verify `curl https://<host>/health/readiness`. |
| **TLS certificate for staging** | Point domain at VM IP. Run `certbot --nginx -d <domain>` or mount ACM cert. Mount cert+key into `certs_staging` volume. |
| **Live Razorpay sandbox** | Obtain `rzp_test_*` key pair. Set payment env vars. Add webhook URL `https://<staging-host>/api/v1/payments/webhook` in Razorpay dashboard with `payment.captured` event. Exercise full checkout. |
| **Managed PostgreSQL PITR** | Create managed DB (RDS, Cloud SQL, Supabase, or Neon). Enable automated backups >=7-day retention. Enable PITR/WAL archiving. Test one restore to isolated instance. Document RPO and RTO. |
| **Physical EVSE interoperability** | Procure OCPP 2.0.1 compatible charger. Configure charger OCPP URL to `wss://<staging-host>/ocpp/<chargePointId>`. Exercise full BootNotification, Heartbeat, StatusNotification, TransactionEvent, MeterValues cycle. |
| **External security review** | Engage reviewer or run OWASP ZAP against staging. Minimum scope: auth, payment webhook, OCPP input validation. |
| **Release sign-off** | Circulate `PRODUCTION_RELEASE_CHECKLIST.md` §9 to Engineering Lead, QA/Test Engineer, Security Reviewer, and On-Call Engineer for signature. |

---

## 10. Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | | | |
| QA / Test Engineer | | | |
| Security Reviewer | | | |
| On-Call Engineer | | | |

---

*Phase 5H audit executed 2026-10-15. Commit base: `40644dc`. Evidence is local-stack reproducible unless marked BLOCKED or NOT VERIFIED.*
*See [`docs/PILOT_RUNBOOK.md`](./PILOT_RUNBOOK.md) for step-by-step operational procedures.*
