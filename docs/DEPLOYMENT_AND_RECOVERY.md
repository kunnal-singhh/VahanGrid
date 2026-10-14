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
