# VahanGrid — Multi-Phase Development Roadmap

> **Product Vision:** Unified EV Charging & Mobility Ecosystem for India  
> **Tagline:** One Platform. Multiple Charging Networks. Seamless EV Mobility.  

---

```
                       VAHANGRID ARCHITECTURE EVOLUTION
                       
   [ Phase 1: Completed ]          [ Phase 2: Planned ]             [ Phase 3: Planned ]
+---------------------------+   +---------------------------+   +---------------------------+
| React 19 Frontend Shell   |   | Node.js / Express Backend |   | OCPI 2.2.1 Roaming Hub    |
| Component Architecture    |-->| PostgreSQL + PostGIS      |-->| OCPP 2.0.1 Bridge         |
| Service Layer (Mock Data) |   | JWT Auth & Vehicle API    |   | UPI / Razorpay Gateway    |
| Rebranded Visual Identity |   | Live BEE / OSM Ingestion  |   | Hardware Edge Mode Sync   |
+---------------------------+   +---------------------------+   +---------------------------+
                                                                             |
                                                                             v
                                                                    [ Phase 4: Planned ]
                                                                +---------------------------+
                                                                | MQTT Real-Time Telemetry  |
                                                                | FastAPI ML Microservices  |
                                                                | Predictive Maintenance    |
                                                                | Dynamic Green Tariff Grid |
                                                                +---------------------------+
```

---

## Phase 1: Frontend UI/UX & Structural Migration (Completed)

**Objective:** Extract valuable frontend patterns from the EVConnect prototype, establish clean modular architecture, rebrand to VahanGrid, and isolate all data behind typed asynchronous services.

- [x] Create modular frontend structure (`src/components/`, `src/pages/`, `src/services/`, `src/utils/`, `src/data/`).
- [x] Complete rebranding to **VahanGrid** and **VahanPass**.
- [x] Isolate development mock data behind `stationService`, `routeService`, `walletService`, `vehicleService`, `chargingService`, and `aiService`.
- [x] Eliminate legacy hackathon popups, fake ML anomaly generators, and direct database queries from visual components.
- [x] Deliver polished, responsive UI with dark/light themes, Leaflet integration, and modern typography.
- [x] Compile migration and architectural documentation (`docs/MIGRATION.md` and `docs/ROADMAP.md`).

---

## Phase 2: Core Backend & Geospatial Database Foundation

**Objective:** Build the authoritative backend service and geospatial database to replace mock data with persistent data models.

1. **Database Architecture:**
   - Deploy **PostgreSQL** with the **PostGIS** spatial extension.
   - Design spatial tables with SRID 4326:
     - `stations`: Geographic coordinates, operator, connector types, maximum kW, pricing schema.
     - `users` & `vehicles`: Driver profiles, registered vehicles, battery pack sizes, connector types.
     - `reservations`: Temporal slot holds with automated expiration.
   - Implement spatial indexes (`GIST` index on station location) for high-performance radius queries (`ST_DWithin`, `ST_Distance`).

2. **Backend API Gateway:**
   - Develop a production **Node.js + Express** (or NestJS) API service.
   - Endpoints:
     - `GET /api/v1/stations`: Bounding box and radius queries.
     - `GET /api/v1/stations/:id`: Live station details and connector status.
     - `POST /api/v1/reservations`: Slot reservation and hold logic.
     - `GET /api/v1/vehicles`: Supported Indian vehicle library.
   - Plug backend directly into `src/services/stationService.js` without altering UI components.

3. **Legitimate Indian Data Ingestion:**
   - Ingest open datasets from the Bureau of Energy Efficiency (BEE) and OpenStreetMap (Overpass API).
   - Establish data pipelines with validated coordinates along major highway corridors (Yamuna Expressway, NH48, Mumbai-Pune Expressway, Bengaluru-Mysuru Expressway).

---

## Phase 3: Cross-Network Roaming (OCPI) & Protocols (OCPP)

**Objective:** Implement interoperable standards enabling drivers to charge on any network using one VahanPass identity.

1. **OCPI 2.2.1 Implementation:**
   - Implement eMSP (e-Mobility Service Provider) and CPO (Charge Point Operator) roles.
   - Modules:
     - `Locations`: Real-time catalog exchange of hubs and EVSEs.
     - `Tariffs`: Transparent per-kWh and idle fees across networks.
     - `Sessions`: Unified session token authorization.
     - `CDRs`: Charge Detail Record clearing and automated invoice generation.

2. **OCPP 2.0.1 Bridge (CSMS):**
   - Implement a secure WebSocket server handling standard OCPP messages:
     - `BootNotification`
     - `StatusNotification`
     - `MeterValues`
     - `Authorize` / `RemoteStartTransaction` / `RemoteStopTransaction`

3. **Payment Gateway Integration:**
   - Integrate legitimate payment infrastructure for India:
     - UPI 2.0 AutoPay (mandate-based post-charging settlement).
     - Bharat BillPay / Razorpay / Cashfree.
   - Real-time balance deduction and automated GST compliant invoices.

4. **Resilient Edge Gateway Mode:**
   - Implement cryptographically signed offline tokens for highway zones with poor cellular coverage.
   - Local transaction queue with automatic server reconciliation when connectivity restores.

---

## Phase 4: Telemetry Pipeline & Machine Learning Services

**Objective:** Scale the platform with sub-second hardware telemetry and predictive intelligence.

1. **Real-time Telemetry with MQTT & WebSockets:**
   - Deploy high-throughput MQTT broker (EMQX / HiveMQ).
   - Stream sub-second voltage, current, hardware temperature, and power delivery curves to active charging monitors.

2. **Python / FastAPI Machine Learning Services:**
   - **Queue & Wait-Time Prediction:** Estimate arrival congestion using historical charging curve data and traffic patterns.
   - **Predictive Charger Health:** Isolation Forest and autoencoder models trained on hardware telemetry to detect anomalous voltage drops and prevent unexpected station downtime.
   - **Dynamic Energy Routing:** Multi-stop highway routing optimizing for elevation changes, battery thermal degradation, and solar time-of-day tariffs.

3. **VahanGrid Mobility Copilot (Production LLM):**
   - Connect frontend chat interface to a Retrieval-Augmented Generation (RAG) backend utilizing live station status and corridor route context.
