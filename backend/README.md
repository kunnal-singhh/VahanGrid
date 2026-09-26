# VahanGrid Backend

> Node.js + Express API server for the VahanGrid unified EV charging platform.

**Phase 2A — Backend Foundation**  
Status: PostgreSQL connectivity layer complete. No business API endpoints yet.

---

## Architecture Position

```
React (Vite)          ← Phase 1 — complete
    ↓
Node.js + Express     ← This service (Phase 2A)
    ↓
PostgreSQL + PostGIS   ← Database (Phase 2A setup)
    ↓
(future)
OCPP 2.0.1 / OCPI 2.2.1 / MQTT / Redis / Python ML
```

---

## Required Software

| Tool | Version | Why |
|---|---|---|
| Node.js | ≥ 18 | Backend runtime |
| npm | ≥ 9 | Package manager |
| PostgreSQL | ≥ 14 | Relational database |
| PostGIS | ≥ 3.3 | Geospatial extension for PostgreSQL |

---

## 1. Install PostgreSQL and PostGIS

### Windows

Download the installer from https://www.postgresql.org/download/windows/

During installation, **check the "Stack Builder" option** at the end.  
Use Stack Builder to add **PostGIS** as a spatial extension.

Alternatively, install with Chocolatey:
```powershell
# Install Chocolatey first if you don't have it (https://chocolatey.org)
choco install postgresql --version=16 -y
choco install postgis    -y
```

### macOS

```bash
brew install postgresql@16 postgis
brew services start postgresql@16
```

### Ubuntu / Debian

```bash
sudo apt install postgresql postgresql-contrib postgis
sudo systemctl start postgresql
```

---

## 2. Create the VahanGrid Database

Connect to PostgreSQL as the superuser (`postgres`):

```bash
# On Windows (run in psql command prompt or pgAdmin)
# On macOS/Linux:
psql -U postgres
```

Run these commands inside `psql`:

```sql
-- Create a dedicated application user (replace 'your_password' with a real password)
CREATE USER vahangrid_user WITH PASSWORD 'your_password';

-- Create the database
CREATE DATABASE vahangrid_db OWNER vahangrid_user;

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE vahangrid_db TO vahangrid_user;

-- Exit
\q
```

> **Why a dedicated user?**  
> Running your app as the `postgres` superuser means a SQL injection bug could
> drop or read any table in any database on the server. A minimal-privilege user
> limits blast radius.

---

## 3. Enable PostGIS

Connect to the VahanGrid database:

```bash
psql -U postgres -d vahangrid_db
```

Run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify it worked:
SELECT postgis_version();
```

Or run the provided SQL file:

```bash
psql -U postgres -d vahangrid_db -f database/001_enable_postgis.sql
```

> **Why PostGIS?**  
> VahanGrid needs to answer queries like "find all charging stations within 30 km
> of this GPS coordinate". Plain SQL stores lat/lng as plain numbers and forces
> you to filter everything in application code. PostGIS adds native geometry
> types, spatial indexes (GIST), and functions like `ST_DWithin` that make these
> queries run in milliseconds even with millions of rows.

---

## 4. Create the .env File

Copy the template:

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://vahangrid_user:your_password@localhost:5432/vahangrid_db
FRONTEND_URL=http://localhost:5173
```

**Never commit `.env`.** It is already listed in `.gitignore`.

---

## 5. Install Dependencies

```bash
# From the backend/ directory
npm install
```

This installs:
- `express` — HTTP server framework
- `pg` — PostgreSQL driver (uses a connection pool)
- `dotenv` — loads `.env` into `process.env`
- `cors` — configures Cross-Origin Resource Sharing
- `helmet` — sets security HTTP headers automatically
- `morgan` — HTTP request logging

---

## 6. Run the Backend

### Development (auto-restarts on file save)

```bash
npm run dev
```

Node.js 18+ includes `--watch` mode natively — no nodemon needed.

### Production

```bash
npm start
```

Expected startup output:

```
🔌 VahanGrid API — starting in development mode
[startup] Checking database connection…
[startup] ✅ PostgreSQL connected
[startup] ✅ PostGIS extension detected
[startup] ✅ HTTP server listening on http://localhost:3001
[startup]    Health endpoint: http://localhost:3001/api/v1/health
```

If the database is unreachable, the server **exits immediately** with a clear
message rather than starting in a broken state.

---

## 7. Test the Health Endpoint

```bash
# Using curl
curl http://localhost:3001/api/v1/health

# Using PowerShell
Invoke-RestMethod http://localhost:3001/api/v1/health | ConvertTo-Json
```

**Healthy response (PostgreSQL connected + PostGIS enabled):**

```json
{
  "success": true,
  "service": "VahanGrid API",
  "status": "healthy",
  "database": "connected",
  "postgis": "enabled",
  "timestamp": "2026-09-26T14:00:00.000Z"
}
```

**Unhealthy response (database unreachable):**

```json
{
  "success": false,
  "service": "VahanGrid API",
  "status": "unhealthy",
  "database": "disconnected",
  "error": "connect ECONNREFUSED 127.0.0.1:5432",
  "timestamp": "2026-09-26T14:00:00.000Z"
}
```

---

## 8. Test Unknown Routes

Any URL that doesn't exist returns a structured 404 (not Express's default HTML):

```bash
curl http://localhost:3001/api/v1/nonexistent
```

```json
{
  "success": false,
  "status": 404,
  "message": "Route not found: GET /api/v1/nonexistent"
}
```

---

## 9. Verify PostGIS

After enabling PostGIS (`001_enable_postgis.sql`) and starting the backend,
the health endpoint will show:

```json
"postgis": "enabled"
```

If you haven't run the SQL yet it shows:

```json
"postgis": "not yet enabled"
```

---

## Phase 2B — What Comes Next

Phase 2B will design and implement the core PostgreSQL schema:

- `users` — driver accounts
- `vehicles` — EV models registered to users
- `stations` — charging locations with PostGIS `geography` columns
- `chargers` — individual connectors at a station
- `charging_sessions` — CDR records
- `wallet_transactions` — VahanPass balance movements

Once the schema is stable, `stationService.js` in the frontend will be
switched from mock data to real `GET /api/v1/stations` calls.

---

## Directory Reference

```
backend/
├── src/
│   ├── config/
│   │   ├── env.js          # Load + validate environment variables
│   │   └── database.js     # PostgreSQL connection pool + query helper
│   ├── routes/
│   │   ├── index.js        # Mount all /api/v1/* routers
│   │   └── health.js       # GET /api/v1/health
│   ├── middleware/
│   │   ├── errorHandler.js # Centralized 4xx/5xx responses
│   │   └── notFound.js     # 404 catch-all
│   ├── app.js              # Express app (middleware + routing)
│   └── server.js           # Startup, DB check, port binding
├── database/
│   └── 001_enable_postgis.sql
├── .env.example
├── .gitignore
└── package.json
```
