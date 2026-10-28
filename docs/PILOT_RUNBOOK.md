# VahanGrid — Pilot Runbook

> **Document type**: Operational runbook
> **Phase**: 5H — Release Decision & Pilot Readiness
> **Revision**: 2026-10-15
> **Scope**: Minimum viable operational procedure for a controlled internal pilot.
> Never put real credentials, passwords, API keys, or personal data in this document.

> [!IMPORTANT]
> A failed authorization check, invalid webhook signature acceptance, duplicate wallet credit,
> unexplained ledger mismatch, unsafe remote OCPP operation, or failed recovery verification
> **must stop the pilot immediately** until the issue is root-caused and resolved.

---

## Stop Conditions

Stop the pilot and escalate immediately if any of the following occur:

- Any webhook with an invalid HMAC-SHA256 signature results in a wallet credit
- A wallet balance is credited more than once for the same Razorpay payment ID
- A driver can access another driver's session, balance, or personal data
- An operator can manage stations or sessions belonging to a different CPO
- A charging session ends but no CDR is created, or the CDR amount does not match the tariff
- `/health/readiness` returns 503 for more than 60 seconds during active pilot traffic
- Any database write to `wallet_transactions` or `charging_sessions` lacks atomicity evidence
- An OCPP message from an unregistered charger is accepted and acted upon

---

## Contacts & Escalation

| Role | Responsibility | Contact placeholder |
|---|---|---|
| Engineering Lead | Architecture decisions, database recovery | [replace before use] |
| On-Call Engineer | First responder, deployment issues | [replace before use] |
| QA / Test Engineer | Test execution sign-off | [replace before use] |
| Security Reviewer | Auth, payment, OCPP security | [replace before use] |
| Razorpay Account Manager | Payment issues, webhook failures | Razorpay dashboard support |

---

## Step 0: Prerequisites

Confirm all of the following before proceeding:

- [ ] All four roles in `docs/PRODUCTION_RELEASE_CHECKLIST.md` §9 have signed off
- [ ] `docs/PHASE_5H_RELEASE_DECISION.md` has been reviewed and accepted
- [ ] Staging host is provisioned with Docker + Compose v2 installed
- [ ] TLS certificate is loaded into `certs_staging` named volume (`staging.crt` and `staging.key`)
- [ ] All 5 services in `docker-compose.staging.yml` verified (`db`, `migration`, `backend`, `frontend`, `reverse-proxy`)
- [ ] All secrets are injected via environment (never committed to git):
  - `STAGING_DB_PASSWORD` (strong random string)
  - `STAGING_JWT_SECRET` (>=32 random chars, no placeholder words)
  - `STAGING_PAYMENT_KEY_ID` (must start with `rzp_test_` for pilot)
  - `STAGING_PAYMENT_KEY_SECRET`
  - `STAGING_PAYMENT_WEBHOOK_SECRET`
- [ ] Razorpay webhook URL registered in dashboard pointing to `https://<staging-host>/api/v1/payments/webhook`
- [ ] At least one physical EVSE provisioned with the staging OCPP URL (for EVSE steps only)
- [ ] Backup storage location confirmed (separate host or cloud object storage)

---

## Step 1: Preflight & Environment Verification

### 1.1 Configuration validation

```bash
# On the staging host — verify compose file is syntactically valid
# (Verified offline in Phase 6A & 6B with Docker Compose v5.1.4: exits 0)
docker compose -f docker-compose.staging.yml config

# Expected: outputs resolved YAML with all 5 services; exits 0
```

### 1.2 Port audit

```bash
# Confirm DB port is NOT exposed to host network
docker compose -f docker-compose.staging.yml config | grep -E "5432|published"

# Expected: port 5432 must NOT appear as a published port
# Only ports 80 and 443 should be published
```

### 1.3 Environment variable check

```bash
# Verify JWT_SECRET length (must be >= 32 chars in production)
echo -n "$STAGING_JWT_SECRET" | wc -c

# Verify payment key is test key (not live key for pilot)
echo $STAGING_PAYMENT_KEY_ID | grep "rzp_test_"
```

**Stop condition**: If `STAGING_JWT_SECRET` is shorter than 32 characters, or if `STAGING_PAYMENT_KEY_ID` starts with `rzp_live_`, stop and correct the configuration.

---

## Step 2: Database Migration & Backup

### 2.1 Pre-deployment backup

```bash
# Take a full compressed backup before any migration
pg_dump -h <db_host> -U vahangrid_admin -d vahangrid_staging -Fc \
  -f "vahangrid_staging_preflight_$(date +%Y%m%d_%H%M%S).dump"

# Verify the backup file is non-empty
ls -lh vahangrid_staging_preflight_*.dump
```

**Stop condition**: If the backup file is 0 bytes or the command fails, do not proceed.

### 2.2 Copy backup off-site

```bash
# Transfer backup to separate host or object storage before proceeding
# Example for S3:
# aws s3 cp vahangrid_staging_preflight_*.dump s3://<bucket>/vahangrid/backups/
```

### 2.3 Run migrations

```bash
docker compose -f docker-compose.staging.yml run --rm migration

# Expected output: 22 migrations applied (or already-applied skipped)
# Expected exit code: 0
```

**Stop condition**: If the migration service exits non-zero, do not start the backend. Review logs, restore from backup if schema was partially modified.

### 2.4 Verify migration count

```bash
# Connect to staging DB and verify 22 migrations are recorded
psql -h <db_host> -U vahangrid_admin -d vahangrid_staging \
  -c "SELECT count(*) FROM schema_migrations;"

# Expected: count = 22
```

### 2.5 Backup/restore drill (run once before first pilot, record results)

```bash
# 1. Restore the pre-deployment backup into an isolated test database
createdb -h <isolated_host> -U <user> vahangrid_restore_test
pg_restore -h <isolated_host> -U <user> -d vahangrid_restore_test \
  vahangrid_staging_preflight_*.dump

# 2. Verify row counts match source
psql -h <isolated_host> -U <user> -d vahangrid_restore_test \
  -c "SELECT count(*) FROM users; SELECT count(*) FROM wallet_transactions;"

# 3. Drop the test database after verification
dropdb -h <isolated_host> -U <user> vahangrid_restore_test
```

Record the outcome (row counts, timing, any errors) in the pilot log.

---

## Step 3: Deployment & Health Checks

### 3.1 Start containers

```bash
docker compose -f docker-compose.staging.yml up -d

# Wait for all services to reach running/healthy state
docker compose -f docker-compose.staging.yml ps
```

### 3.2 Health probe verification

```bash
# Liveness — Node.js event loop responsive
curl -sf https://<staging-host>/health/liveness | python3 -m json.tool
# Expected: { "status": "ok", "service": "VahanGrid API", "uptimeSeconds": <n> }

# Readiness — database connectivity
curl -sf https://<staging-host>/health/readiness | python3 -m json.tool
# Expected: { "status": "ready", "database": "connected" }

# Full health — PostGIS and uptime
curl -sf https://<staging-host>/health | python3 -m json.tool
# Expected: { "status": "healthy", "postgis": "enabled" }
```

**Stop condition**: If `/health/readiness` returns 503, the backend cannot reach the database. Stop and diagnose before proceeding.

### 3.3 TLS verification

```bash
# Verify TLS certificate is valid and trusted
curl -v https://<staging-host>/health/liveness 2>&1 | grep -E "SSL|issuer|subject|expire"

# Verify HTTP redirects to HTTPS
curl -v http://<staging-host>/health/liveness 2>&1 | grep "301\|Location"
```

### 3.4 OCPP WebSocket endpoint reachability

```bash
# Verify WebSocket upgrade is accepted (wscat or websocat must be installed)
wscat --connect wss://<staging-host>/ocpp/PILOT-TEST-CP-001

# Expected: WebSocket connection established (101 Switching Protocols)
# Type Ctrl+C to disconnect after verifying connection
```

---

## Step 4: Driver, Operator, and Administrator Smoke Tests

### 4.1 Driver registration and login

```bash
# Register a pilot test driver (use non-production email; delete after pilot)
curl -sf -X POST https://<staging-host>/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Pilot Driver","email":"pilot.driver@test.vahangrid.internal","password":"PilotTest@2024!","role":"driver"}'
# Expected: { "success": true, "user": { "role": "driver" } }

# Login and capture cookie
curl -sf -c cookies.txt -X POST https://<staging-host>/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"pilot.driver@test.vahangrid.internal","password":"PilotTest@2024!"}'
# Expected: { "success": true, "user": { "role": "driver" } }; vg_token cookie set
```

### 4.2 Role enforcement checks

```bash
# Driver must NOT access operator endpoints
curl -sf -b cookies.txt https://<staging-host>/api/v1/stations/admin
# Expected: 403 OPERATOR_ROLE_REQUIRED or 404

# Driver must NOT access another driver's wallet
# (Test with a different driver's UUID — must return 403 or empty, not their balance)
```

**Stop condition**: If a driver can access operator endpoints or another driver's data, stop the pilot.

### 4.3 Operator and admin login

```bash
# Login as an operator (use seeded operator account)
curl -sf -c op_cookies.txt -X POST https://<staging-host>/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<operator-email>","password":"<operator-password>"}'

# Login as admin (use seeded admin account)
curl -sf -c admin_cookies.txt -X POST https://<staging-host>/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin-email>","password":"<admin-password>"}'
```

### 4.4 CPO isolation check

```bash
# Operator must NOT see stations from another CPO
# (Call station list endpoint and verify only own CPO stations are returned)
curl -sf -b op_cookies.txt https://<staging-host>/api/v1/stations | \
  python3 -c "import sys,json; data=json.load(sys.stdin); print('CPOs:', set(s['cpo_id'] for s in data.get('stations',[])))"
# Expected: only one CPO ID matches the operator's CPO
```

**Stop condition**: If stations from another CPO appear in the response, stop the pilot.

---

## Step 5: Payment Sandbox & Webhook Verification

### 5.1 Create a wallet top-up order

```bash
# Create a payment order for Rs 500
curl -sf -b cookies.txt -X POST https://<staging-host>/api/v1/payments/orders \
  -H "Content-Type: application/json" \
  -d '{"amount":500}'
# Expected: { "success": true, "order": { "id": "order_...", "amount": 50000, "currency": "INR" } }

# Record the order ID for webhook simulation below
```

### 5.2 Simulate webhook delivery (valid signature)

```bash
ORDER_ID="order_<from_above>"
PAYMENT_ID="pay_pilot_test_$(date +%s)"
PAYLOAD='{"event":"payment.captured","payload":{"payment":{"entity":{"id":"'$PAYMENT_ID'","order_id":"'$ORDER_ID'","amount":50000,"currency":"INR","status":"captured"}}}}'

# Generate HMAC-SHA256 signature using the webhook secret
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$STAGING_PAYMENT_WEBHOOK_SECRET" | awk '{print $2}')

curl -sf -X POST https://<staging-host>/api/v1/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-razorpay-signature: $SIG" \
  -d "$PAYLOAD"
# Expected: 200 OK
```

### 5.3 Verify wallet credit

```bash
curl -sf -b cookies.txt https://<staging-host>/api/v1/wallet
# Expected: balance increased by Rs 500 (50000 paise)
```

### 5.4 Duplicate webhook (idempotency check)

```bash
# Replay the identical webhook with the same payment ID
curl -sf -X POST https://<staging-host>/api/v1/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-razorpay-signature: $SIG" \
  -d "$PAYLOAD"
# Expected: 200 OK (idempotent) but wallet balance must NOT increase again
```

Verify balance is unchanged after the duplicate delivery.

**Stop condition**: If the wallet balance increased after the duplicate webhook, stop immediately.

### 5.5 Forged webhook (invalid signature rejection)

```bash
curl -sf -X POST https://<staging-host>/api/v1/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-razorpay-signature: 0000000000000000000000000000000000000000000000000000000000000000" \
  -d "$PAYLOAD"
# Expected: 400 or 401 — must NOT credit the wallet
```

**Stop condition**: If the forged webhook results in a wallet credit, stop immediately.

### 5.6 Amount bounds enforcement

```bash
# Below minimum (Rs 5 — should be rejected)
curl -sf -b cookies.txt -X POST https://<staging-host>/api/v1/payments/orders \
  -H "Content-Type: application/json" -d '{"amount":5}'
# Expected: 400 error

# Above maximum (Rs 60000 — should be rejected)
curl -sf -b cookies.txt -X POST https://<staging-host>/api/v1/payments/orders \
  -H "Content-Type: application/json" -d '{"amount":60000}'
# Expected: 400 error
```

---

## Step 6: OCPP Simulator Checks

### 6.1 Simulator-based functional test (local tool required)

Use `wscat`, `websocat`, or the VahanGrid OCPP test scripts to verify each message type.

```bash
# BootNotification
wscat --connect wss://<staging-host>/ocpp/PILOT-CP-001
# Send: [2,"msg-001","BootNotification",{"reason":"PowerUp","chargingStation":{"model":"PilotModel","vendorName":"PilotVendor"}}]
# Expected CALLRESULT: [3,"msg-001",{"currentTime":"...","interval":300,"status":"Accepted"}]

# Verify DB record
psql -h <db_host> -U vahangrid_admin -d vahangrid_staging \
  -c "SELECT charge_point_id, status, last_boot_at FROM ocpp_charge_points WHERE charge_point_id='PILOT-CP-001';"
# Expected: status = 'online'

# Heartbeat
# Send: [2,"msg-002","Heartbeat",{}]
# Expected CALLRESULT: [3,"msg-002",{"currentTime":"..."}]

# StatusNotification
# Send: [2,"msg-003","StatusNotification",{"timestamp":"...","connectorStatus":"Available","evseId":1,"connectorId":1}]
# Expected CALLRESULT: [3,"msg-003",{}]
```

### 6.2 Reconnect resilience

```bash
# Close WebSocket and reconnect with same chargePointId
# Verify: new BootNotification is accepted, DB status remains 'online'
```

### 6.3 CALLERROR on unsupported action

```bash
# Send an unknown action
# Send: [2,"msg-099","UnknownAction",{}]
# Expected CALLERROR: [4,"msg-099","NotImplemented","...","{}"]
```

---

## Step 7: Physical EVSE Test Procedure

> [!WARNING]
> This section requires physical charger hardware and an authorised test environment.
> Do NOT attempt physical EVSE testing until all simulator checks (Step 6) pass cleanly.
> Do NOT connect physical EVSEs to a deployment that has not completed Steps 1-5.

### Prerequisites

- [ ] Physical EVSE is provisioned with:
  - OCPP Server URL: `wss://<staging-host>/ocpp/<chargePointId>`
  - Protocol: OCPP 2.0.1 (preferred) or OCPP 1.6 with gateway
- [ ] EVSE is in a safe, monitored test environment
- [ ] No real vehicles or real energy delivery is required for connectivity tests
- [ ] An authorised operator is physically present at the charger

### 7.1 EVSE BootNotification

1. Power on the EVSE
2. Monitor backend logs: `docker compose logs -f backend`
3. Confirm BootNotification is received and responded with `Accepted`
4. Verify DB: `SELECT status, model, vendor_name FROM ocpp_charge_points WHERE charge_point_id='<evse_id>';`

### 7.2 Heartbeat cycle

1. Wait for at least two Heartbeat messages (default interval: 300 seconds)
2. Confirm each receives a `HeartbeatResponse` with current server time
3. Confirm `last_seen_at` is updated in `ocpp_charge_points`

### 7.3 StatusNotification

1. Verify EVSE sends `StatusNotification` with `connectorStatus: Available`
2. Confirm the backend processes it without error (log check)

### 7.4 Full transaction cycle (requires vehicle or test load)

> Only proceed if a vehicle or certified test load is available and supervised.

1. Initiate RemoteStartTransaction from the backend (operator portal or API)
2. Verify EVSE receives the `RequestStartTransaction` OCPP call and responds `Accepted`
3. Confirm a charging session row is created: `SELECT * FROM charging_sessions ORDER BY started_at DESC LIMIT 1;`
4. Monitor MeterValues telemetry: `SELECT * FROM ocpp_session_telemetry ORDER BY recorded_at DESC LIMIT 5;`
5. Stop the session via RemoteStopTransaction
6. Verify TransactionEvent `Ended` is received
7. Verify CDR is created: `SELECT * FROM cdrs ORDER BY created_at DESC LIMIT 1;`
8. Verify wallet debit matches CDR amount

**Stop condition**: If CDR amount does not match the applicable tariff, or if wallet debit does not match CDR, stop the pilot and audit the billing logic.

---

## Step 8: Session, CDR, Wallet Ledger & Reconciliation

```bash
# Verify no orphaned CHARGING sessions (all sessions must be COMPLETED or ACTIVE with a live charger)
psql -h <db_host> -U vahangrid_admin -d vahangrid_staging \
  -c "SELECT id, status, started_at, ended_at FROM charging_sessions WHERE status='CHARGING' ORDER BY started_at;"

# Verify CDR count matches completed session count
psql -h <db_host> -U vahangrid_admin -d vahangrid_staging \
  -c "SELECT (SELECT count(*) FROM charging_sessions WHERE status='COMPLETED') AS sessions,
             (SELECT count(*) FROM cdrs) AS cdrs;"
# Expected: sessions <= cdrs (a CDR should exist for every completed session)

# Verify wallet ledger balance equals sum of credits minus sum of debits
psql -h <db_host> -U vahangrid_admin -d vahangrid_staging \
  -c "SELECT w.balance,
             SUM(CASE WHEN wt.type='CREDIT' THEN wt.amount ELSE 0 END) AS total_credits,
             SUM(CASE WHEN wt.type='DEBIT' THEN wt.amount ELSE 0 END) AS total_debits
      FROM wallets w
      JOIN wallet_transactions wt ON wt.wallet_id = w.id
      WHERE w.user_id = '<pilot-driver-uuid>'
      GROUP BY w.balance;"
# Expected: balance = total_credits - total_debits
```

**Stop condition**: Any ledger mismatch must stop the pilot and trigger a financial audit.

---

## Step 9: Monitoring, Incident Escalation & Rollback

### 9.1 Log monitoring

```bash
# Tail all service logs during pilot
docker compose -f docker-compose.staging.yml logs -f

# Filter for errors only
docker compose -f docker-compose.staging.yml logs --no-log-prefix backend | grep '"level":"error"'
```

### 9.2 Health monitoring during pilot

```bash
# Simple health poll every 30 seconds (run in separate terminal)
while true; do
  STATUS=$(curl -sf https://<staging-host>/health/readiness | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "UNREACHABLE")
  echo "$(date -u +%H:%M:%S) $STATUS"
  sleep 30
done
```

Alert the On-Call Engineer immediately if status is not `ready` for more than 60 seconds.

### 9.3 Rollback procedure

```bash
# Stop the current backend (preserve database and volumes)
docker compose -f docker-compose.staging.yml stop backend

# Restore previous image (if using versioned tags)
# Edit docker-compose.staging.yml to use the previous backend image tag
docker compose -f docker-compose.staging.yml up -d backend

# Verify health after rollback
curl -sf https://<staging-host>/health/readiness
```

### 9.4 Emergency database recovery

```bash
# 1. Stop all services
docker compose -f docker-compose.staging.yml down

# 2. Terminate active connections on the database
psql -h <db_host> -U vahangrid_admin \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='vahangrid_staging' AND pid <> pg_backend_pid();"

# 3. Restore from the most recent backup
pg_restore -h <db_host> -U vahangrid_admin -d vahangrid_staging \
  --clean --if-exists -v vahangrid_staging_preflight_<timestamp>.dump

# 4. Restart services and verify health
docker compose -f docker-compose.staging.yml up -d
curl -sf https://<staging-host>/health/readiness
```

---

## Step 10: Post-Pilot Cleanup

After the pilot is complete (or if a stop condition is triggered):

```bash
# 1. Take a final post-pilot backup
pg_dump -h <db_host> -U vahangrid_admin -d vahangrid_staging -Fc \
  -f "vahangrid_staging_postpilot_$(date +%Y%m%d_%H%M%S).dump"

# 2. Remove pilot test accounts (driver, if created fresh for the pilot)
psql -h <db_host> -U vahangrid_admin -d vahangrid_staging \
  -c "DELETE FROM users WHERE email='pilot.driver@test.vahangrid.internal';"

# 3. Stop all containers
docker compose -f docker-compose.staging.yml down

# 4. Archive pilot logs
docker compose -f docker-compose.staging.yml logs > "pilot_log_$(date +%Y%m%d).txt"

# 5. Delete test cookie files
rm -f cookies.txt op_cookies.txt admin_cookies.txt
```

---

## Pilot Sign-Off Checklist

Complete before declaring the pilot successful:

- [ ] Step 1: Preflight and environment verification — PASS
- [ ] Step 2: Database migration and backup — PASS; backup stored off-site
- [ ] Step 3: All three health probes return expected responses — PASS
- [ ] Step 4: Driver/Operator/Admin smoke tests — PASS; no IDOR, no CPO leakage
- [ ] Step 5: Payment webhook signature verified; idempotency confirmed; forgery rejected — PASS
- [ ] Step 6: Simulator BootNotification, Heartbeat, StatusNotification, CALLERROR — PASS
- [ ] Step 7: Physical EVSE (if available) — PASS or DEFERRED (record reason)
- [ ] Step 8: CDR count matches completed sessions; wallet ledger balanced — PASS
- [ ] Step 9: No unresolved errors in logs during pilot window — PASS
- [ ] Step 10: Post-pilot cleanup complete — PASS

| Role | Name | Date | Outcome |
|---|---|---|---|
| Engineering Lead | | | |
| QA / Test Engineer | | | |
| On-Call Engineer | | | |

---

*Generated during Phase 5H — Release Decision & Pilot Readiness.*
*See [`docs/PHASE_5H_RELEASE_DECISION.md`](./PHASE_5H_RELEASE_DECISION.md) for the full release evidence matrix.*
*See [`docs/DEPLOYMENT_AND_RECOVERY.md`](./DEPLOYMENT_AND_RECOVERY.md) for detailed infrastructure procedures.*
*See [`docs/PHASE_6C_STAGING_DEPLOYMENT_PLAN.md`](./PHASE_6C_STAGING_DEPLOYMENT_PLAN.md) for provider evaluation and remote deployment plan.*
