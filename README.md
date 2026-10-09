# VahanGrid — Unified EV Charging & Mobility Ecosystem

> **One Platform. Disparate Networks. Seamless EV Mobility.**  
> An open, production-grade EV charging infrastructure and mobility platform built for the Indian EV ecosystem, featuring an **OCPP 2.0.1 CSMS Gateway**, **PostGIS Spatial Search**, **Immutable Double-Entry Financial Ledger**, **Live Telemetry Dashboard**, and **Razorpay-Compatible Roaming Payments**.

---

## 📌 Executive Summary & Problem Statement

The Indian electric vehicle (EV) charging landscape is fragmented across proprietary Charge Point Operator (CPO) walled gardens—including Tata Power EZ Charge, Statiq, ChargeZone, and Jio-bp. Drivers are forced to juggle 5+ mobile apps, maintain locked pre-funded balances across proprietary wallets, navigate unpredictable tariffs, and encounter opaque charger availability states.

**VahanGrid** solves this by unifying discovery, charger hardware communication, tariff calculation, session metering, and roaming payments under an open, standards-compliant architectural foundation:

1. **Spatial Discovery:** Sub-50ms PostGIS geospatial queries indexing multi-operator charging stations across India.
2. **OCPP 2.0.1 CSMS Gateway:** Native WebSocket gateway communicating bidirectionally with real and simulated charging equipment.
3. **Live Telemetry & Power Analytics:** Real-time power curve visualization, battery SoC tracking, and deterministic paisa-level billing.
4. **Immutable Financial Ledger:** Double-entry signed transaction ledger with zero mutable balance columns, preventing balance drift and race conditions.
5. **Unified Roaming Payments & Recovery:** Razorpay checkout with server-authoritative HMAC-SHA256 signature verification, idempotent top-ups, and in-place settlement failure recovery.

---

## 🏗️ System Architecture

```mermaid
flowchart TB
    subgraph Clients["Driver & Client Tier"]
        FE["React 18 + Vite SPA<br/>(Tailwind Tokens • SVG Charts • Leaflet)"]
        OCPP_SIM["EVSE Charger Hardware / Simulator<br/>(OCPP 2.0.1 JSON over WebSocket)"]
    end

    subgraph Gateway["Application & Gateway Tier (Node.js + Express)"]
        HTTP_ROUTER["Express REST Router (/api/v1/*)<br/>(Helmet • CORS • CookieParser • Morgan)"]
        WS_SERVER["OCPP 2.0.1 CSMS Gateway (ws://)<br/>(Heartbeat • Status • TxEvent • MeterValues)"]
        AUTH_MID["JWT Authentication Middleware<br/>(HTTP-Only Secure Cookie 'vg_token')"]
        PRICING_ENG["Tariff Engine & Paisa Rounding<br/>(5-Tier Scope • GST Calculation)"]
        SETTLE_ENG["Atomic Settlement Service<br/>(Row Locks • SELECT FOR UPDATE)"]
        PAY_SERV["Payment Gateway Service<br/>(Razorpay HMAC Verification)"]
    end

    subgraph DataTier["Persistence & Spatial Tier (PostgreSQL 14+ with PostGIS 3+)"]
        POSTGIS["PostGIS Spatial Engine<br/>(geography Point 4326 • GIST Index)"]
        DB_STATIONS[("Stations, EVSEs & Connectors<br/>3-Tier Physical Hierarchy")]
        DB_SESSIONS[("Charging Sessions & Meter Telemetry<br/>Time-Series Samples")]
        DB_CDRS[("Immutable CDRs<br/>Tariff & Pricing JSONB Snapshots")]
        DB_WALLET[("Signed Transaction Ledger<br/>wallets & wallet_transactions")]
        DB_PAYMENTS[("Payment Orders & Webhooks<br/>Idempotent Unique Indices")]
    end

    FE -->|HTTPS REST API + Cookies| HTTP_ROUTER
    OCPP_SIM <-->|Bidirectional WebSocket /ocpp/:id| WS_SERVER

    HTTP_ROUTER --> AUTH_MID
    AUTH_MID --> PRICING_ENG
    AUTH_MID --> SETTLE_ENG
    AUTH_MID --> PAY_SERV

    WS_SERVER --> DB_STATIONS
    WS_SERVER --> DB_SESSIONS
    HTTP_ROUTER --> POSTGIS
    HTTP_ROUTER --> DB_STATIONS
    PRICING_ENG --> DB_CDRS
    SETTLE_ENG --> DB_WALLET
    PAY_SERV --> DB_PAYMENTS
    PAY_SERV --> DB_WALLET
```

---

## ⚡ Core Domain Model & Entity Relationships

VahanGrid strictly models real-world physical and financial relationships according to international EV standards (**OCPI 2.2.1** and **OCPP 2.0.1**):

```mermaid
erDiagram
    USERS ||--|| WALLETS : "owns (1:1)"
    USERS ||--o{ VEHICLES : "registers (1:N)"
    USERS ||--o{ CHARGING_SESSIONS : "initiates (1:N)"
    USERS ||--o{ PAYMENTS : "creates (1:N)"

    WALLETS ||--o{ WALLET_TRANSACTIONS : "immutable ledger (1:N)"

    CPOS ||--o{ LOCATIONS : "operates (1:N)"
    CPOS ||--o{ TARIFFS : "configures (1:N)"
    LOCATIONS ||--o{ EVSES : "contains (1:N)"
    EVSES ||--o{ CONNECTORS : "provides (1:N)"

    CONNECTORS ||--o{ CHARGING_SESSIONS : "powers (1:N)"
    CHARGING_SESSIONS ||--|| CDRS : "finalizes into (1:1)"
    CDRS ||--o| WALLET_TRANSACTIONS : "settles via (1:1)"
    PAYMENTS ||--o| WALLET_TRANSACTIONS : "credits via (1:1)"

    EVSES ||--o| OCPP_CHARGE_POINTS : "mapped to"
    CHARGING_SESSIONS ||--o{ OCPP_SESSION_TELEMETRY : "records (1:N)"
```

### Key Architectural Invariants:
1. **Three-Tier Hardware Hierarchy:** `Location` (site) $\rightarrow$ `EVSE` (cabinet) $\rightarrow$ `Connector` (physical plug). Dual-gun DC fast chargers share power at the EVSE tier without flattening connector states.
2. **Derived Wallet Balance:** The `wallets` table contains **no editable balance column**. Balance is dynamically derived via:
   $$\text{Balance} = \sum_{\text{wallet\_transactions}} \text{amount}$$
   Positive amounts represent credits (`topup`, `refund`); negative amounts represent debits (`charging_payment`).
3. **Audit-Grade Immutable CDRs:** Upon session completion, `cdrs` store immutable `JSONB` snapshots of the tariff applied and itemized pricing breakdown. Post-facto tariff edits never mutate settled charges.
4. **Idempotency Guarantees:** Database partial unique indices (`uq_wallet_txns_cdr_id`, `uq_wallet_txns_payment_id`) prevent double-settlement or double-crediting under high concurrency.

---

## 🛠️ Complete Technology Stack

| Layer | Technology | Version | Purpose & Rationale |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React + Vite | React 18, Vite 6 | Lightning-fast HMR, modular SPA architecture, production bundle tree-shaking |
| **Styling & Design** | Vanilla CSS + Tailwind Tokens | Custom | Bespoke glassmorphism UI, dark mode palette, CSS micro-animations without bloated runtime |
| **Icons & Visuals** | Lucide React | 0.344+ | Clean, consistent SVG icon set for EV telemetry and battery gauges |
| **Mapping & Spatial UI** | Leaflet + Carto Dark | Leaflet 1.9 | Responsive tile rendering with custom dark-mode Carto Voyager basemaps |
| **Charts & Telemetry** | Pure SVG PowerCurveChart | Custom | Native SVG line charts with dual Y-axes (kW and SoC %) without heavy external chart libraries |
| **Backend Runtime** | Node.js + Express | Node 18+, Express 4.19 | Non-blocking I/O, REST endpoints, robust middleware ecosystem |
| **OCPP WebSocket Gateway**| `ws` | 8.22+ | Full-duplex WebSocket connection registry for charge point communication |
| **Database & GIS** | PostgreSQL + PostGIS | PG 14+, PostGIS 3.3+ | Native `geography(Point, 4326)` spatial types, spatial indexing (`GIST`), relational constraints |
| **Authentication** | JWT (`jsonwebtoken`) + `bcryptjs` | JWT 9, Bcrypt 3 | Secure HTTP-Only cookie `vg_token`, stateless claims, password hashing |
| **Security Headers** | Helmet + CORS | Helmet 7, CORS 2.8 | Protection against XSS, clickjacking, MIME sniffing, and strict origin validation |
| **Payment Gateway** | Razorpay-Compatible Adapter | Custom HMAC | Server-side HMAC-SHA256 signature verification, webhook processing, idempotent ledger writes |

---

## 🚀 Key Implemented Features (Phase 1 through Phase 3G)

### 1. Spatial Station Discovery & PostGIS Radius Engine
- Interactive map and list explorer displaying charging hubs across Indian metropolitan corridors.
- Sub-50ms radius queries using PostGIS `ST_DWithin` and `ST_Distance` on `geography(Point, 4326)`.
- Real-time connector standard filtering (`CCS2`, `Type 2`, `Bharat DC-001`, `CHAdeMO`) and live availability badges.

### 2. Digital Garage & User Profiles
- Secure user registration, authentication, and session persistence via HTTP-Only `vg_token` cookies.
- EV garage supporting vehicle specification management: battery capacity (kWh), usable battery capacity, max AC/DC charge rates, and plug standards.
- Database-level IDOR prevention (`AND user_id = $1`) ensuring strict user isolation.

### 3. Charging Session Lifecycle & Concurrency Guards
- Atomic session initiation: validates connector availability, locks rows with `SELECT FOR UPDATE`, sets connector to `'charging'`, and records timestamps.
- Conflict rejection: returns `409 SESSION_ALREADY_ACTIVE` if user has an ongoing session, or `409 CONNECTOR_IN_USE` if connector is occupied.
- Controlled stop flow: marks session `'stopped'`, recalculates duration, releases connector to `'available'`, and triggers asynchronous CDR finalization.

### 4. OCPP 2.0.1 CSMS Gateway & Protocol Engine
- Standard-compliant WebSocket gateway listening at `ws://localhost:3001/ocpp/:chargePointId`.
- Implements core OCPP 2.0.1 actions:
  - `BootNotification`: Registration handshake with firmware, vendor, and serial number capture.
  - `StatusNotification`: Live EVSE/connector state updates (`Available`, `Occupied`, `Faulted`, `Unavailable`).
  - `Heartbeat`: Liveness tracking with last-seen timestamps and offline detection.
  - `TransactionEvent` (`Started`, `Updated`, `Ended`): Authoritative energy synchronization.
  - `MeterValues`: High-frequency power (kW), energy (kWh), and battery state of charge (SoC %).
  - `SetChargingProfile` / `ClearChargingProfile`: Smart charging power limitation schedules.
  - `Reset`, `UnlockConnector`, and `TriggerMessage`: Remote operator controls.

### 5. Live Charging Telemetry Dashboard & Power Curve
- 5-second resilient REST polling loop with automatic background pause via `document.visibilityState`.
- Real-time derived metrics: Power (kW), Energy Delivered (kWh), Battery SoC (%), and Session Duration.
- Deterministic frontend cost calculation mirroring the backend tariff engine.
- Pure SVG `PowerCurveChart` with dual Y-axes, custom tooltips, and chronological sample sorting.

### 6. Dynamic Pricing Engine & Immutable CDR Generation
- 5-tier tariff resolution precedence: Connector $\rightarrow$ EVSE $\rightarrow$ Location $\rightarrow$ CPO $\rightarrow$ System Default.
- Supports energy rates (₹/kWh), session fees, time rates, idle fees with grace periods, and GST tax computation.
- Deterministic paisa rounding (`roundToPaisa`) to eliminate floating-point arithmetic errors.
- Audit-grade Charge Detail Records (CDRs) storing finalized energy, cost, and JSON snapshots.

### 7. Unified Financial Activity Hub & Wallet Hub (Phase 3G)
- **Top-Up Checkout:** Razorpay checkout flow with bounds checking (₹10 to ₹50,000), order creation, and public key delivery.
- **Server-Authoritative HMAC Verification:** Payments credited exclusively upon verified server-side HMAC-SHA256 signature verification or authenticated webhooks.
- **Running Ledger Balances:** Ledger transactions store `balance_before` and `balance_after` alongside correlated CDR and payment order metadata.
- **Settlement Failure Recovery:** Clear user guidance on `INSUFFICIENT_FUNDS` failures inside `CdrReceiptModal`, outstanding amount comparisons, direct top-up navigation, and one-click idempotent settlement retry.
- **Payment Audit Log:** Dedicated tab in `WalletPage` listing all gateway order states (`created`, `pending`, `paid`, `failed`, `cancelled`).

---

## 💻 Local Setup & Installation

### Prerequisites
- **Node.js:** v18.0.0 or higher
- **npm:** v9.0.0 or higher
- **PostgreSQL:** v14 or higher with **PostGIS 3.3+** spatial extension

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/kunnal-singhh/VahanGrid.git
cd VahanGrid
```

---

### Step 2: Install Dependencies
Install dependencies across both frontend and backend using the root convenience script:
```bash
npm run install:all
```
*(Or install individually: `cd frontend && npm install && cd ../backend && npm install`)*

---

### Step 3: Configure Environment Variables

#### Backend Configuration
Copy the template and configure your local PostgreSQL database credentials:
```bash
cp backend/.env.example backend/.env
```
Edit `backend/.env`:
```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/vahangrid
FRONTEND_URL=http://localhost:5173
JWT_SECRET=your_super_secret_jwt_key_min_32_characters_random
JWT_EXPIRES_IN=7d
PAYMENT_PROVIDER=razorpay
PAYMENT_PROVIDER_KEY=rzp_test_vahangrid
PAYMENT_PROVIDER_SECRET=test_payment_secret
PAYMENT_WEBHOOK_SECRET=test_webhook_secret
```

#### Frontend Configuration
Copy the frontend template:
```bash
cp frontend/.env.example frontend/.env
```
Edit `frontend/.env`:
```env
VITE_APP_NAME=VahanGrid
VITE_API_BASE_URL=http://localhost:3001/api/v1
```

---

### Step 4: Database Setup & Migration
1. Create the PostgreSQL database (if not already existing):
   ```bash
   psql -U postgres -c "CREATE DATABASE vahangrid;"
   psql -U postgres -d vahangrid -c "CREATE EXTENSION IF NOT EXISTS postgis;"
   psql -U postgres -d vahangrid -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
   ```
2. Execute schema migrations:
   ```bash
   npm run db:migrate
   ```
3. Seed development stations, CPOs, EVSEs, connectors, and tariffs:
   ```bash
   npm run db:seed
   ```
4. Verify database schema, constraints, and spatial indexes:
   ```bash
   npm run db:verify
   ```
   *(Expected output: `✅ Schema verification completed successfully! 51 tables checked.`)*

---

### Step 5: Start Development Servers

Run both servers from the repository root in separate terminals:

```bash
# Terminal 1: Start Backend API & OCPP Gateway (Port 3001)
npm run backend

# Terminal 2: Start Frontend Vite Dev Server (Port 5173)
npm run frontend
```

Open your browser at **`http://localhost:5173`**.

---

## 🧪 Testing & Verification Suites

VahanGrid includes a comprehensive automated regression suite covering all architectural tiers.

### Available Test Commands (from repository root)

| Command | Target | Scope |
| :--- | :--- | :--- |
| `npm test` | Phase 3G Hub | Validates top-ups, checkout verification, ledger enrichment, and settlement recovery (63 tests) |
| `npm run test:all` | Full Regression | Runs all 11 test suites consecutively across auth, vehicles, sessions, tariffs, CDRs, OCPP, and payments (540+ tests) |
| `npm run db:verify` | PostgreSQL Schema | Verifies 51 tables, check constraints, foreign keys, unique indices, and PostGIS SRID 4326 |
| `npm run build:frontend` | Production Build | Executes production Vite build and validates bundle compilation |

### Running Test Suites Directly (in `backend/`):
```bash
# Phase 3C.1: Authentication & JWT Cookies (22 tests)
node src/scripts/test_phase3c1.js

# Phase 3C.2: Driver Vehicles & IDOR Isolation (24 tests)
node src/scripts/test_phase3c2.js

# Phase 3C.3: Charging Sessions & State Machine (34 tests)
node src/scripts/test_phase3c3.js

# Phase 3C.4A: Signed Wallet Ledger Transactions (44 tests)
node src/scripts/test_phase3c4a.js

# Phase 3E.1: Dynamic Tariffs & Pricing Engine (50 tests)
node src/scripts/test_phase3e1.js

# Phase 3E.2: Immutable CDR Finalization (67 tests)
node src/scripts/test_phase3e2.js

# Phase 3E.3: Wallet Settlement Engine (86 tests)
node src/scripts/test_phase3e3.js

# Phase 3E.4: Payment Gateway & Webhook Verification (63 tests)
node src/scripts/test_phase3e4.js

# Phase 3F: Live Telemetry & SVG Power Curves (50 tests)
node src/scripts/test_phase3f.js

# Phase 3G: Unified Financial Activity & Settlement Recovery (63 tests)
node src/scripts/test_phase3g.js
```

---

## 🔌 OCPP 2.0.1 Hardware & Simulator Workflow

The backend runs an integrated OCPP 2.0.1 CSMS gateway on the same HTTP/WebSocket server.

### Connecting a Charger / Simulator
To connect a physical charger or an OCPP simulator (e.g. *SteVe*, *OCPP 2.0.1 Simulator*, or custom test scripts):

1. **WebSocket URL:**
   ```
   ws://localhost:3001/ocpp/{chargePointId}
   ```
   *(Example: `ws://localhost:3001/ocpp/CP-DEL-01`)*
2. **Subprotocol:** `ocpp2.0.1`

### Lifecycle Sequence:
1. **BootNotification:** Charger connects and transmits vendor/model. Server accepts and marks charger online.
2. **StatusNotification:** Charger informs connector readiness (`Available`).
3. **TransactionEvent (Started):** Initiates session, maps EVSE, and locks connector.
4. **MeterValues:** Streams periodic voltage, current, power (kW), and battery SoC (%) updates stored in `ocpp_session_telemetry`.
5. **TransactionEvent (Ended):** Stops session, releases connector, and triggers CDR generation.

---

## 📚 Key REST API Endpoints

Complete API specifications are documented in [docs/API.md](file:///c:/Users/kunal%20singh/OneDrive/Desktop/VahanGrid/docs/API.md).

### Core Endpoints Reference

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Public | Server, database, and PostGIS health check |
| `GET` | `/api/v1/stations` | Public | List charging stations with nested CPO, EVSE, and connectors |
| `GET` | `/api/v1/stations/nearby?lat=...&lng=...&radius=...` | Public | Spatial proximity search ranked by distance (km) |
| `POST` | `/api/v1/auth/register` | Public | Register new user account; sets HTTP-only `vg_token` |
| `POST` | `/api/v1/auth/login` | Public | Authenticate with email/password |
| `POST` | `/api/v1/auth/logout` | Session | Clear session cookie |
| `GET` | `/api/v1/auth/me` | Session | Return authenticated driver profile |
| `GET` | `/api/v1/vehicles` | Session | List owned vehicles in digital garage |
| `POST` | `/api/v1/sessions/start` | Session | Start active charging session on available connector |
| `POST` | `/api/v1/sessions/:id/stop` | Session | Terminate active charging session |
| `GET` | `/api/v1/sessions/active` | Session | Retrieve driver's active charging session |
| `GET` | `/api/v1/sessions/:id/telemetry` | Session | Retrieve time-series power and SoC samples |
| `GET` | `/api/v1/sessions/:id/cdr` | Session | Retrieve finalized immutable Charge Detail Record |
| `POST` | `/api/v1/cdrs/:id/settle` | Session | Trigger or retry CDR settlement against wallet |
| `GET` | `/api/v1/wallet` | Session | Retrieve derived wallet balance |
| `GET` | `/api/v1/wallet/transactions` | Session | List enriched transaction ledger with running balances |
| `POST` | `/api/v1/payments/orders` | Session | Create Razorpay top-up order (₹10 – ₹50,000) |
| `POST` | `/api/v1/payments/verify` | Session | Verify client checkout signature and credit wallet |
| `POST` | `/api/v1/payments/webhook` | HMAC Signature| Asynchronous payment gateway webhook endpoint |
| `GET` | `/api/v1/payments` | Session | List payment orders and gateway statuses |

---

## 🖥️ User Interface Views & Visual Experience

| View | Purpose | Visual Experience |
| :--- | :--- | :--- |
| **Station Explorer** | Geographic discovery & corridor planning | Leaflet map with operator markers, real-time connector availability chips, distance indicators, and detailed drawer modals. |
| **Active Charging Modal** | Live session monitoring | Real-time circular battery gauge (SoC %), live power (kW), energy delivered (kWh), running cost estimation, and interactive SVG power curve. |
| **CDR Receipt Modal** | Audit-grade session billing | Itemized tariff breakdown, energy fee, session fee, idle penalties, GST, settlement badges, and JSON export. |
| **Unified Wallet Hub** | Financial ledger & top-up checkout | VahanPass card with derived balance, preset top-up chips, Razorpay modal checkout, running ledger balance audit log, and payment order tracking. |
| **Settlement Recovery** | Insufficient funds remediation | Clear failure banner explaining outstanding bill vs balance, direct one-click top-up checkout, and in-place idempotent retry action. |

---

## 🔒 Security Highlights & Production Readiness

- **Strict IDOR Protection:** Parameterized SQL queries always enforce ownership (`WHERE user_id = $1`). Accessing another user's session, vehicle, CDR, or payment returns `403 FORBIDDEN` or `404 NOT FOUND`.
- **HMAC Payment Signature Verification:** Browser checkout callbacks are treated as hints. Wallet credits occur strictly through server-side HMAC-SHA256 signature verification (`POST /payments/verify`) or verified gateway webhooks.
- **Zero Mutable Balance:** Wallet balances cannot be manipulated via client requests. Balance is dynamically computed by summing append-only ledger rows with cryptographic integrity.
- **Credential Hygiene:** Provider secrets, database credentials, and webhook keys are loaded from environment variables and strictly excluded from API responses and client code.
- **Safe SQL Parameterization:** 100% of database queries use parameter placeholders (`$1, $2, ...`) via `pg.Pool`, eliminating SQL injection risks.

---

## ⚠️ Current Scope & Limitations (For Evaluators)

When evaluating or demonstrating VahanGrid for SDE interviews:

1. **Payment Gateway Mode:** Runs in test mode (`rzp_test_...`). Real payments require live Razorpay production keys in `.env`.
2. **Charger Hardware:** Real OCPP chargers stream live telemetry; in local development, automated test suites and the OCPP simulator generate synthetic `MeterValues`.
3. **In-Memory WebSocket Registry:** The OCPP connection registry uses an in-memory map on the Node.js process. In multi-instance horizontal scaling, a Redis pub/sub adapter would be introduced for cross-node charger routing.
4. **Local Demonstration:** The project is fully demonstrable locally on any standard developer workstation running Node.js and PostgreSQL.

---

## 📄 License & Attribution

Developed by **Kunal Singh** as an engineering demonstration of full-stack systems engineering, distributed IoT protocols (OCPP 2.0.1), geospatial indexing (PostGIS), and double-entry financial ledger design for the Indian EV mobility ecosystem.

Released under the **MIT License**.
