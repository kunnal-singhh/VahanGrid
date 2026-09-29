# VahanGrid Backend

> Node.js + Express API server and PostgreSQL/PostGIS database for the VahanGrid unified EV charging platform.

**Status: Phase 2B Complete — Core Database Schema & Migrations**

---

## Architecture Position

```
React (Vite)          ← Phase 1 — complete (frontend/)
    ↓
Node.js + Express     ← Phase 2A — complete (backend/)
    ↓
PostgreSQL + PostGIS   ← Phase 2B — complete (10 domain migrations + seeds)
    ↓
(future)
OCPP 2.0.1 / OCPI 2.2.1 / MQTT / Redis / Python ML
```

---

## Required Software

| Tool | Minimum Version | Installed | Purpose |
|---|---|---|---|
| Node.js | ≥ 18 | v22.14.0 | Backend runtime |
| npm | ≥ 9 | 10.9.2 | Package manager |
| PostgreSQL | ≥ 14 | 18.6 | Relational database engine |
| PostGIS | ≥ 3.3 | 3.6.2 | Geospatial indexing & spatial functions |

---

## 1. Database Creation

Connect to PostgreSQL as the superuser (`postgres`):

```bash
psql -U postgres
```

Run inside `psql`:

```sql
-- Create database
CREATE DATABASE vahangrid;

-- Connect to the database
\c vahangrid

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify PostGIS installation
SELECT postgis_full_version();
```

---

## 2. Environment Configuration

Copy the template:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/vahangrid
FRONTEND_URL=http://localhost:5173
```

> **Git Safety:** Never commit `.env`. It is ignored in `.gitignore`.

---

## 3. Database Migrations (Phase 2B)

VahanGrid uses a transparent, zero-ORM migration system located in `database/migrations/`.
Migrations run in numbered chronological order, tracked in the `schema_migrations` table:

| # | Migration File | Responsibility |
|---|---|---|
| 001 | `001_create_extensions.sql` | Enables `pgcrypto` (`gen_random_uuid()`) & `postgis` |
| 002 | `002_create_users.sql` | Driver accounts, email/phone uniqueness, password placeholder |
| 003 | `003_create_vehicles.sql` | Registered EVs, battery kWh & charging kW constraints |
| 004 | `004_create_cpos.sql` | Charging network operators (Tata, Statiq, Jio-bp, etc.) |
| 005 | `005_create_locations.sql` | Charging stations with `geography(Point, 4326)` & GIST index |
| 006 | `006_create_evses.sql` | Charging kiosks/posts (location 1:N EVSEs) |
| 007 | `007_create_connectors.sql` | Plugs/guns (CCS2, Type 2, Bharat DC-001, CHAdeMO) |
| 008 | `008_create_wallets.sql` | 1:1 user VahanPass wallet (no editable balance column) |
| 009 | `009_create_wallet_transactions.sql` | Signed immutable financial ledger (Credits +, Debits -) |
| 010 | `010_create_charging_sessions.sql` | Charge Detail Records (CDRs) with SoC, energy, cost |

### Run Migrations:

```bash
# From backend/
npm run migrate

# Or from repository root:
npm run db:migrate
```

---

## 4. Development Seed Data

Realistic Indian EV ecosystem seed data is located in `database/seeds/001_seed_development_data.sql`:
- **5 CPOs:** Tata Power EZ Charge, Statiq, ChargeZone, Jio-bp pulse, Kazam EV
- **4 Users & Registered Vehicles:** Tata Nexon EV Max, MG ZS EV, Mahindra XUV400, Hyundai Ioniq 5
- **6 Locations:** Connaught Place (Delhi), BKC (Mumbai), Koramangala (Bengaluru), Mile 42 Food Mall (Mumbai-Pune Expressway), Cyber Hub (Gurugram), Electronic City (Bengaluru)
- **9 EVSEs & 13 Connectors:** 150kW Ultra-Fast Dual CCS2, 120kW Fast Chargers, 60kW DC, 22kW AC Type-2, Bharat DC-001
- **4 Wallets & 7 Ledger Transactions:** UPI top-ups, charging debits, mobility cashbacks
- **4 Charging Sessions:** 3 historical completed sessions and 1 active in-progress session

### Run Seeds:

```bash
# From backend/
npm run seed

# Or from repository root:
npm run db:seed
```

---

## 5. Verify the Database

Run the automated verification script:

```bash
# From backend/
npm run verify:db

# Or from repository root:
npm run db:verify
```

This verifies:
1. All extensions (`postgis`, `pgcrypto`)
2. All 9 domain tables
3. Spatial column: `locations.location` is `geography(Point, 4326)`
4. Spatial index: `idx_locations_location_gist` (`GIST`)
5. Foreign keys and delete policies (`RESTRICT` on financial/session records, `CASCADE` on physical hierarchy)
6. Unique constraints
7. Numeric, SoC, and status `CHECK` constraints

### Inspect Tables & Spatial Queries Manually in `psql`:

```sql
\c vahangrid

-- 1. List all tables
\dt

-- 2. Inspect locations table spatial definition
\d locations

-- 3. Inspect spatial indexes
\di *gist*

-- 4. Verify PostGIS distance query (find stations within 50 km of Connaught Place, New Delhi)
SELECT 
  name, 
  city, 
  ROUND((ST_Distance(location, ST_SetSRID(ST_MakePoint(77.2167, 28.6315), 4326)::geography) / 1000.0)::numeric, 1) AS distance_km
FROM locations
WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(77.2167, 28.6315), 4326)::geography, 50000)
ORDER BY distance_km ASC;

-- 5. Calculate true wallet balance from transaction ledger
SELECT 
  u.name,
  w.currency,
  COALESCE(SUM(t.amount), 0) AS balance
FROM wallets w
JOIN users u ON w.user_id = u.id
LEFT JOIN wallet_transactions t ON t.wallet_id = w.id
GROUP BY u.name, w.currency;
```

---

## 6. Run the Backend API

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

### Test Endpoints:

#### 1. Health Check
```bash
curl http://localhost:3001/api/v1/health
```

#### 2. Get All Stations (with nested CPO, EVSEs, and Connectors)
```bash
curl http://localhost:3001/api/v1/stations
```

#### 3. Get Station by UUID
```bash
curl http://localhost:3001/api/v1/stations/f0000001-0000-0000-0000-000000000001
```

#### 4. Find Nearby Stations (PostGIS ST_DWithin radius search)
```bash
# 5 km default radius around Connaught Place, New Delhi
curl "http://localhost:3001/api/v1/stations/nearby?lat=28.6315&lng=77.2167"

# 50 km radius search
curl "http://localhost:3001/api/v1/stations/nearby?lat=28.6315&lng=77.2167&radius_km=50"
```

For full request/response schemas and error codes, see [`docs/API.md`](../docs/API.md).

---

## Directory Reference

```
backend/
├── database/
│   ├── migrations/              # Numbered SQL migrations (001 - 010)
│   └── seeds/                   # Development seed dataset
├── src/
│   ├── config/
│   │   ├── env.js               # Environment validator
│   │   └── database.js          # PostgreSQL connection pool (pg.Pool)
│   ├── controllers/
│   │   └── stationController.js # Station route handlers & parameter validation
│   ├── services/
│   │   └── stationService.js    # Data access layer & PostGIS queries
│   ├── middleware/
│   │   ├── errorHandler.js      # Centralized error handler
│   │   └── notFound.js          # 404 handler
│   ├── routes/
│   │   ├── index.js             # API v1 router registry
│   │   ├── health.js            # GET /api/v1/health
│   │   └── stations.js          # GET /api/v1/stations (/, /:id, /nearby)
│   ├── scripts/
│   │   ├── migrate.js           # Zero-ORM SQL migration runner
│   │   ├── seed.js              # Seed data runner
│   │   └── verify.js            # Automated schema & PostGIS validator
│   ├── app.js                   # Express application setup (Helmet, CORS, Morgan)
│   └── server.js                # Server entry point
├── .env.example
├── .gitignore
└── package.json
```
