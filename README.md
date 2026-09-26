# VahanGrid — Unified EV Charging & Mobility Ecosystem

> **One Platform. Multiple Charging Networks. Seamless EV Mobility.**

VahanGrid is an open, unified electric vehicle charging and mobility platform tailored for the Indian EV ecosystem. It unifies charging discovery, multi-stop corridor route planning, charger hardware telemetry, and roaming payments across disparate Charge Point Operators (CPOs) including Tata Power, Statiq, ChargeZone, and Jio-bp.

---

## ⚡ Current Status

| Phase | Description | Status |
|---|---|---|
| Phase 1 | React + Vite frontend UI/UX | ✅ Complete |
| **Phase 2A** | **Node.js + Express backend foundation + PostgreSQL connectivity** | **✅ Complete** |
| Phase 2B | Core database schema (users, stations, chargers, sessions) | 🔜 Next |
| Phase 3 | Real station data, authentication, charging session APIs | ⏳ Planned |
| Phase 4 | OCPI 2.2.1 roaming, OCPP 2.0.1 hardware, MQTT telemetry | ⏳ Planned |

> ⚠️ This project is not production-ready. All station and session data is currently mock data in `src/data/mockData.js`.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────┐
│   React + Vite (frontend)       │  http://localhost:5173
│   src/components, src/pages     │
│   src/services (→ mock now,     │
│   → real API in Phase 2B)       │
└───────────────┬─────────────────┘
                │ HTTP (JSON)
                ▼
┌─────────────────────────────────┐
│   Node.js + Express (backend)   │  http://localhost:3001
│   backend/src/app.js            │
│   Helmet, CORS, Morgan          │
│   GET /api/v1/health            │  ← Phase 2A
│   GET /api/v1/stations  (soon)  │  ← Phase 2B
└───────────────┬─────────────────┘
                │ pg (connection pool)
                ▼
┌─────────────────────────────────┐
│   PostgreSQL + PostGIS          │  localhost:5432
│   Database: vahangrid_db        │
│   PostGIS extension ready       │
└─────────────────────────────────┘

(Future)
├── OCPP 2.0.1 (charging hardware)
├── OCPI 2.2.1 (cross-network roaming)
├── MQTT      (real-time telemetry)
└── Python / FastAPI (ML routing)
```

## 🗂️ Project Structure

```
VahanGrid/
├── backend/                      # ← NEW in Phase 2A
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.js            # Load + validate environment
│   │   │   └── database.js       # PostgreSQL pool + query helper
│   │   ├── routes/
│   │   │   ├── index.js          # Mount all /api/v1/* routers
│   │   │   └── health.js         # GET /api/v1/health
│   │   ├── middleware/
│   │   │   ├── errorHandler.js   # Centralized error formatting
│   │   │   └── notFound.js       # 404 catch-all
│   │   ├── app.js                # Express app (middleware + routing)
│   │   └── server.js             # Startup, DB check, port binding
│   ├── database/
│   │   └── 001_enable_postgis.sql
│   ├── .env.example
│   └── README.md                 # Backend setup guide
├── docs/
│   ├── MIGRATION.md
│   └── ROADMAP.md
├── src/                          # Frontend (Phase 1 — unchanged)
│   ├── components/
│   ├── pages/
│   ├── services/                 # Still uses mock data
│   ├── data/mockData.js
│   ├── utils/
│   ├── App.jsx
│   └── index.css
├── .env.example
├── package.json
└── vite.config.js
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- npm v9+
- PostgreSQL 14+ with PostGIS 3.3+

### Run the Frontend (Phase 1)
```bash
# From the project root
npm install
npm run dev
```
Visit `http://localhost:5173` — uses mock data, no backend required.

### Run the Backend (Phase 2A)
See [`backend/README.md`](./backend/README.md) for full PostgreSQL + PostGIS setup instructions.

```bash
# From the backend/ directory
cd backend
npm install
cp .env.example .env   # then edit .env with your DB credentials
npm run dev
```

Test: `curl http://localhost:3001/api/v1/health`

### Build Frontend for Production
```bash
npm run build
```

---

## 📋 Architectural Principles

1. **Separation of Concerns:**
   ```
   Visual Component  ──>  Service Layer  ──>  [Future Backend / PostGIS / OCPI]
   ```
   React components never make direct database queries or unmanaged network calls.
2. **Resilience & Fault Tolerance:**
   Default public fallbacks ensure map tiles and routing endpoints operate reliably even without local `.env` setup.
3. **Data Integrity:**
   Simulated data is never presented as legitimate production data. All mock records are labeled `DEVELOPMENT MOCK DATA`.

---

## 🗺️ Roadmap & Documentation
- Read [MIGRATION.md](file:///c:/Users/kunal%20singh/OneDrive/Desktop/VahanGrid/docs/MIGRATION.md) for detailed notes on what was reused, modified, and removed from EVConnect.
- Read [ROADMAP.md](file:///c:/Users/kunal%20singh/OneDrive/Desktop/VahanGrid/docs/ROADMAP.md) for Phase 2 (PostgreSQL + PostGIS), Phase 3 (OCPI/OCPP), and Phase 4 (ML & MQTT) timelines.
