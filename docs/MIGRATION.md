# VahanGrid — Phase 1 Migration Documentation

> **Project:** VahanGrid (formerly prototyped as EVConnect)  
> **Tagline:** One Platform. Multiple Charging Networks. Seamless EV Mobility.  
> **Phase:** Phase 1 — UI & Frontend Structural Migration Only  
> **Target Region:** India (Bharat)  

---

## 1. Executive Summary

This document details the architectural migration from the hackathon prototype **EVConnect** to the modular, scalable enterprise foundation of **VahanGrid**.

The core objective of Phase 1 is **strict UI/UX and frontend structural migration**. No production backend logic, machine learning models, real payment integrations, OCPP/OCPI implementations, or simulated fake production APIs were introduced. Instead, all data access has been decoupled behind an asynchronous service layer, establishing a clean contract for future backend and CPO integrations.

---

## 2. What Was Reused

The following visual concepts, layout ideas, and assets were extracted from EVConnect and adapted into VahanGrid:

1. **Visual Map Concept (`LiveMap.jsx`):**
   - Leaflet-based interactive map displaying charging station markers across Indian geographical coordinates.
   - Dynamic dark/light theme switching and tile layer rendering.
   - Interactive popups/tooltips showing charger wattage, connector types, and pricing.
   - Route polyline display with automated map boundary fitting.

2. **Station Details & Telemetry Gauges (`StationPanel.jsx`):**
   - High-density telemetry cards showcasing power (kW), pricing (₹/kWh), wait times, and latency.
   - Hourly occupancy and congestion forecast bar charts.
   - Hardware fault alerts and status badge indicators.

3. **Active Charging Session Monitor (`ChargingSession.jsx`):**
   - Circular progress ring displaying live State-of-Charge (SoC) progression.
   - Real-time energy delivered (kWh), session expenditure (₹), and tailpipe CO₂ offset (kg).
   - Emergency and user-initiated "End Session" controls.

4. **Multi-Stop Route Planner (`RoutePlanner.jsx`):**
   - Highway corridor transit planning between Indian cities.
   - Nominatim/Photon geocoding autocomplete with bounding box constraints for India.
   - OSRM route path computation.
   - Greedy station stop selection based on vehicle battery capacity and departure SoC.

5. **Unified Roaming Wallet Card (`WalletPanel.jsx`):**
   - Virtual pass / RFID card visualization with balance display.
   - Quick one-tap top-up buttons (₹200, ₹500, ₹1000, ₹2000).
   - Multi-CPO billing report breakdown and transaction history feed.

6. **Conversational Assistant Concept (`AIChatbot.jsx`):**
   - EV mobility assistant for range checks, corridor recommendations, and roaming FAQ.
   - Visual banner asset (`ev_banner.png`).

---

## 3. What Was Changed & Improved

VahanGrid is designed to feel like a completely new, state-of-the-art product rather than a renamed copy:

1. **Complete Rebranding:**
   - Replaced all instances of `EVConnect` and `VoltPass` with `VahanGrid` and `VahanPass`.
   - Updated product metadata, HTML title, favicon, navigation headers, and technical commentary.
   - Positioned specifically for the Indian electric mobility ecosystem (featuring Tata Power EZ Charge, Statiq, ChargeZone, Jio-bp pulse, and Kazam).

2. **Clean Modular Project Structure:**
   - Disassembled monolithic files into focused directories under `frontend/`:
     - `frontend/src/components/layout/` (Header, Sidebar, BottomNav)
     - `frontend/src/components/map/` (LiveMap, MapLegend)
     - `frontend/src/components/stations/` (StationCard, StationDetailsModal, StationFilterBar)
     - `frontend/src/components/route/` (RoutePlanner, RouteSummaryCard)
     - `frontend/src/components/charging/` (ActiveChargingModal, ChargingSessionCard)
     - `frontend/src/components/wallet/` (VahanPassCard, QuickTopUp, TransactionList)
     - `frontend/src/components/ai/` (AIChatbot, ChatSuggestions)
   - Created dedicated page views under `frontend/src/pages/`:
     - `Dashboard/`
     - `Stations/`
     - `RoutePlanner/`
     - `Charging/`
     - `Wallet/`
     - `History/`
     - `Profile/`

3. **Data Access Decoupling (Service Layer):**
   - In EVConnect, components made direct `fetch` calls to localhost endpoints with hardcoded fallbacks or directly imported `mockData.js`.
   - In VahanGrid, **zero visual components directly import mock data or make raw API queries**.
   - Created a clean service layer under `frontend/src/services/`:
     - `stationService.js`
     - `routeService.js`
     - `walletService.js`
     - `vehicleService.js`
     - `chargingService.js`
     - `aiService.js`
   - All visual components interact exclusively through service contracts returning Promises.

4. **Design System & Aesthetics:**
   - Upgraded to modern typography (`Plus Jakarta Sans`, `Orbitron`, `Inter`).
   - Implemented refined glassmorphism tokens (`glass`, `glass-card`, `glass-highlight`) with calibrated backdrop filters.
   - Designed high-contrast dark and light modes with vibrant Indian mobility accents (Electric Cyan, Indian Emerald, and Amber/Saffron energy pulses).
   - Added full mobile-responsiveness with a collapsible desktop sidebar, expandable search, and dedicated mobile bottom navigation.

5. **Robust Environmental Fallbacks:**
   - Eliminated undefined string interpolations for map tile URLs and geocoding endpoints by embedding reliable public defaults.

---

## 4. What Was Removed

The following obsolete, hackathon-specific, or fake production code was explicitly removed:

1. **Fake Machine Learning Telemetry:**
   - Removed pseudo Isolation Forest fault anomaly generators masquerading as production ML in the frontend.
   - Removed synthetic random station generators that created fake charging stops on the fly along unknown routes.

2. **Fake Production Backend Bridges:**
   - Removed ad-hoc `socket.io-client` connections trying to bind to an offline prototype server.
   - Removed direct fetch calls to `/api/stations/:id/start-charge` and `/api/wallet/sync-offline` embedded inside UI handlers.

3. **Hackathon Pitch Modals & Hardcoded Text:**
   - Removed hackathon pitch popups ("ET AutoTech Hackathon 2026").
   - Removed hardcoded hackathon presentation claims.

4. **Coupled Component State:**
   - Removed deeply nested state logic trapped inside visual components; converted them into reusable presentational components with callback props.

---

## 5. What Remains Mock (Development Mock Data)

The following items are currently mock data for UI validation and are clearly isolated in `frontend/src/data/mockData.js` and behind `frontend/src/services/`:

| Feature | Mock Implementation in Phase 1 | Future Production Source |
|---|---|---|
| **Charging Stations** | 10 sample Indian highway corridor hubs | PostgreSQL + PostGIS geospatial database |
| **CPO Operators** | 5 Indian operators (Tata, Statiq, ChargeZone, Jio-bp, Kazam) | Registered CPO partners via OCPI 2.2.1 |
| **Charger Telemetry** | Fixed voltage (415V), simulated temperature & latency | Real-time OCPP 2.0.1 MeterValues via MQTT |
| **Occupancy Forecast** | Sample 6-hour utilization arrays | FastAPI ML time-series prediction service |
| **Wallet Balance & Top-Up** | In-memory balance with simulated UPI credit | Real payment gateway (UPI 2.0 AutoPay / Razorpay) |
| **CDRs & Transactions** | In-memory list with simulated timestamps | Immutable database transaction log + OCPI CDRs |
| **Copilot AI Responses** | Pattern-matched response generator | Python / FastAPI LLM microservice with RAG |

---

## 6. What Will Be Rebuilt in Future Phases

The following enterprise systems will be built from scratch in subsequent phases:

1. **Backend API Gateway:** Node.js + Express / NestJS microservices architecture.
2. **Geospatial Database:** PostgreSQL with PostGIS extension for spatial station queries within radius / polygon bounds.
3. **OCPI 2.2.1 Roaming Hub:** Full implementation of Locations, Tariffs, Sessions, CDRs, and Tokens modules.
4. **OCPP 2.0.1 Charging Station Management System (CSMS):** Direct WebSocket communication with physical chargers for remote start/stop, smart charging profiles, and diagnostics.
5. **Real-time Telemetry Pipeline:** MQTT broker (e.g. EMQX / HiveMQ) for sub-second sensor streaming.
6. **Machine Learning Services:** Python / FastAPI models for queue wait-time prediction, battery degradation estimation, and predictive charger maintenance.
7. **Legitimate Data Ingestion:** Integrations with Bureau of Energy Efficiency (BEE), OpenStreetMap, and certified CPO partners.
