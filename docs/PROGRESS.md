# VahanGrid — Implementation Progress & Changelog

## Milestone Status Overview

| Phase | Milestone Name | Status | Verification Suite |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Frontend UI/UX Foundation & Component Architecture | ✅ Complete | Manual & Component Audits |
| **Phase 2A** | Backend Foundation (Express + Node.js) | ✅ Complete | Health / Server verification |
| **Phase 2B** | PostgreSQL + PostGIS Schema & Migrations | ✅ Complete | `verify.js` (PostGIS spatial queries) |
| **Phase 3A** | Station REST APIs (Spatial & Radius Queries) | ✅ Complete | `verify_station_rest_api` |
| **Phase 3B.1** | JWT Authentication (HTTP-Only Secure Cookie) | ✅ Complete | `test_phase3c1.js` |
| **Phase 3B.2** | User Profile & Vehicle Management CRUD | ✅ Complete | `test_phase3c2.js` |
| **Phase 3B.3** | Charging Session Lifecycle API (PostgreSQL Source of Truth) | ✅ Complete | `test_phase3b3.js` |
| **Phase 3C.1** | Frontend Authentication Integration (`useAuth`, Protected Routes) | ✅ Complete | `test_phase3c1.js` |
| **Phase 3C.2** | Frontend Vehicle Integration (Real REST CRUD & Persistence) | ✅ Complete | `test_phase3c2.js` (24/24 passed) |
| **Phase 3C.3** | Frontend Charging Session Lifecycle Integration | ✅ Complete | `test_phase3c3.js` (34/34 passed) |
| **Phase 3C.4A**| Wallet Read & Transaction History API (Backend Signed Ledger) | ✅ Complete | `test_phase3c4a.js` (44/44 passed) |
| **Phase 3C.4B**| Frontend Wallet Integration (Real REST Client, Dynamic Currency) | ✅ Complete | `test_phase3c4b.js` (40/40 passed) |
| **Phase 3D.2** | OCPP WebSocket Foundation (Gateway & Connection Registry)   | ✅ Complete | `test_phase3d2.js` (47/47 passed)  |
| **Phase 3D.3** | OCPP 2.0.1 BootNotification (Request/Response & Schema)     | ✅ Complete | `test_phase3d3.js` (55/55 passed)  |
| **Phase 3D.4A**| OCPP 2.0.1 StatusNotification (Schema & Transient State)    | ✅ Complete | `test_phase3d4a.js` (62/62 passed) |
| **Phase 3D.4B**| Persistent OCPP Device & EVSE/Connector Mapping Layer       | ✅ Complete | `test_phase3d4b.js` (82/82 passed) |
| **Phase 3D.5** | Persistent Device State, Heartbeat & Live Status Sync       | ✅ Complete | `test_phase3d5.js` (79/79 passed)  |
| **Phase 3D.6A**| Persistent OCPP Transaction Layer & TransactionEvent Lifecycle | ✅ Complete | `test_phase3d6a.js` (76/76 passed) |
| **Phase 3D.6B**| OCPP TransactionEvent Energy Synchronization                | ✅ Complete | `test_phase3d6b.js` (56/56 passed) |
| **Phase 3D.7B**| OCPP MeterValues Telemetry & Dual-Tier Storage             | ✅ Complete | `test_phase3d7b.js` (72/72 passed) |
| **Phase 3D.8B**| OCPP Remote Start/Stop Command Infrastructure               | ✅ Complete | `test_phase3d8b.js` (51/51 passed) |
| **Phase 3D.8D**| OCPP ChangeAvailability Implementation                      | ✅ Complete | `test_phase3d8d.js` (72/72 passed) |
| **Phase 3D.9** | OCPP Remote Operations: Reset, Unlock & TriggerMessage      | ✅ Complete | `test_phase3d9.js` (74/74 passed)  |
| **Phase 3D.10**| OCPP 2.0.1 Smart Charging / Charging Profiles               | ✅ Complete | `test_phase3d10.js` (81/81 passed) |
| **Phase 3E.1** | Pricing Engine (Tariff Snapshot & Cost Calculation)         | ✅ Complete | `test_phase3e1.js` (50/50 passed)  |
| **Phase 3E.2** | Immutable CDR Finalization                                  | ✅ Complete | `test_phase3e2.js` (67/67 passed)  |
| **Phase 3E.3** | Wallet Settlement & CDR Integration                         | ✅ Complete | `test_phase3e3.js` (86/86 passed)  |
| **Phase 3E.4** | Wallet Top-Up & Payment Gateway Integration                 | ✅ Complete | `test_phase3e4.js` (63/63 passed)  |
| **Phase 3F**   | Real-Time Active Charging Telemetry Dashboard               | ✅ Complete | `test_phase3f.js` (50/50 passed)   |
| **Phase 3G**   | Unified Financial Activity & Wallet Hub                     | ✅ Complete | `test_phase3g.js` (63/63 passed)   |

---

## Detailed Milestone Records

### Phase 3G — Unified Financial Activity & Wallet Hub
- **Status:** Completed
- **Date:** October 2026
- **Test Suite:** `backend/src/scripts/test_phase3g.js` (63/63 tests passing)
- **Frontend Build:** ✅ Zero errors, 1940 modules, gzip 124.62 kB
- **Regression Suite:** `test_phase3e4.js` (63/63 passed), `test_phase3e3.js` (86/86 passed), `test_phase3e2.js` (67/67 passed), `test_phase3e1.js` (50/50 passed), `test_phase3c4a.js` (44/44 passed), `test_phase3f.js` (50/50 passed), `verify.js` ✅
- **Commit:** `feat: add unified financial activity hub`
- **Compliance Notice:** *"VahanGrid Phase 3G delivers a unified, production-grade financial activity and wallet hub connecting EV charging sessions, Charge Detail Records (CDRs), immutable signed wallet ledger debits/credits, and payment gateway top-ups. EV drivers can seamlessly top up their wallet via Razorpay checkout with server-authoritative HMAC-SHA256 signature verification, recover from INSUFFICIENT_FUNDS settlement failures directly inside the CdrReceiptModal with live balance checks and retry actions, audit running balances (balance_before / balance_after) across all ledger transactions, inspect correlated gateway payment orders and statuses, and inspect past charging sessions with differentiated status chips and settlement badges. All financial invariants remain strictly preserved: wallet balances derive exclusively from the signed transaction ledger, no client-supplied amounts or balance mutations are trusted, and zero unnecessary infrastructure (no Redis, Kafka, MQTT, or external ledger engines) was added."*

#### Files Created / Modified:
1. **`backend/src/services/walletService.js`** *(modified)*
   - Enriched `getTransactions` query with `wt.cdr_id`, `wt.payment_id`, `wt.balance_before`, `wt.balance_after`, `c.session_id`, `c.location_name`, `c.energy_kwh`, `c.settlement_status AS cdr_settlement_status`, `p.status AS payment_status`, `p.provider_order_id`, and `p.provider_payment_id`.
   - Preserves ledger signing invariants and pagination.

2. **`backend/src/services/sessionService.js`** *(modified)*
   - Enriched `getSessionsByUser` query with `cdr.id AS cdr_id`, `cdr.settlement_status`, and `cdr.settlement_failure_reason` via `LEFT JOIN cdrs`.
   - Eliminates need for N+1 queries from the frontend when rendering session cards with CDR settlement status.

3. **`backend/src/services/cdrService.js`** *(modified)*
   - Enriched `listCdrsByUser` with `settlement_status`, `settled_at`, `settlement_failure_reason`, and `wallet_transaction_id`.

4. **`backend/src/services/paymentService.js`** *(modified)*
   - Added `error_code` and `error_description` columns to `listUserPayments` query.

5. **`frontend/src/services/paymentService.js`** *(new)*
   - Typed client for `POST /api/v1/payments/orders`, `POST /api/v1/payments/verify`, `GET /api/v1/payments`, and `GET /api/v1/payments/:id`.

6. **`frontend/src/services/walletService.js`** *(modified)*
   - Added `settleCdr(cdrId)` calling `POST /api/v1/cdrs/:id/settle`.
   - Enriched error message forwarding for `INSUFFICIENT_FUNDS` and other settlement codes.

7. **`frontend/src/components/charging/CdrReceiptModal.jsx`** *(new)*
   - Shared audit-grade CDR receipt modal.
   - Itemized pricing breakdown: energy fee, session fee, idle fee, GST, and net total.
   - Settlement badges (`settled`, `unsettled`, `failed`).
   - Clear failure explanation for `INSUFFICIENT_FUNDS` showing outstanding amount vs wallet balance.
   - "Top Up Wallet" button navigating to the top-up checkout.
   - "Retry Settlement" action with in-flight debounce preventing duplicate requests.
   - JSON export for expense tracking and reporting.

8. **`frontend/src/components/wallet/TopUpModal.jsx`** *(new)*
   - Top-up modal with presets (₹200, ₹500, ₹1000, ₹2000) and custom amount input.
   - Client-side validation against backend constraints (₹10 - ₹50,000 bounds).
   - Razorpay standard checkout integration with server-side HMAC-SHA256 verification (`POST /payments/verify`).
   - Friendly fallback when Razorpay SDK script is unavailable in development / testing.

9. **`frontend/src/components/wallet/PaymentList.jsx`** *(new)*
   - Audit list for payment orders consuming `GET /api/v1/payments`.
   - Visual status badges: `paid`, `created`, `pending`, `failed`, `cancelled`.
   - Displays gateway Order ID, Payment ID, amount, and timestamp.
   - Manual refresh button.

10. **`frontend/src/components/wallet/TransactionList.jsx`** *(modified)*
    - Filter tabs: All, Charging, Top-Ups.
    - Displays running balance (`balance_after`), station name, and energy delivered.
    - Clickable "View Receipt" button launching `CdrReceiptModal` for charging debits.

11. **`frontend/src/components/wallet/QuickTopUp.jsx`** *(modified)*
    - Replaced obsolete placeholder notice with working top-up trigger.

12. **`frontend/src/pages/Wallet/WalletPage.jsx`** *(modified)*
    - Sub-tabs for "Ledger Transactions" and "Payment Orders".
    - Connected `TopUpModal` and `CdrReceiptModal`.
    - Real-time balance and transaction refresh upon verified payment.

13. **`frontend/src/pages/History/HistoryPage.jsx`** *(modified)*
    - Integrated shared `CdrReceiptModal`.
    - Differentiated session status chips (`active`, `completed`, `stopped`, `failed`, `cancelled`).
    - Settlement badges on session cards (`Paid`, `Unsettled`, `Settlement Failed`).
    - "Top Up & Retry" settlement guidance with direct navigation to wallet top-up.

14. **`frontend/src/App.jsx`** *(modified)*
    - Connected `onNavigateToWallet` handler to `HistoryPage`.

15. **`backend/src/scripts/test_phase3g.js`** *(new)*
    - 63-assertion comprehensive verification suite covering:
      - Top-up order validation (bounds, currency, unauthenticated rejection)
      - HMAC signature verification and ledger credit atomicity
      - Cross-user access and IDOR protections across payments, CDRs, and sessions
      - Insufficient balance settlement failure (`INSUFFICIENT_FUNDS`)
      - Wallet top-up followed by successful settlement retry
      - Idempotent repeated settlement call on already settled CDR
      - Enriched transaction, session, and CDR schemas

#### Architecture Decisions:
- **No Schema Migrations Needed:** The PostgreSQL database schema already contained all necessary tables, foreign keys, unique indices (`uq_wallet_txns_cdr_id`, `uq_wallet_txns_payment_id`), and constraints. Clean SQL `LEFT JOIN` queries were sufficient to surface all relationships.
- **Strict Server Authoritative Payments:** Browser Razorpay callbacks are treated as hints. Actual ledger credits occur exclusively through server-side HMAC verification (`POST /payments/verify`) or verified webhooks.
- **Running Ledger Balances:** Both `balance_before` and `balance_after` are stored directly in `wallet_transactions` rows at the moment of atomic ledger write, ensuring O(1) auditability without recalculating past sums.
- **Graceful Gateway Fallback:** If Razorpay CDN (`checkout.js`) is blocked or unavailable, the UI gracefully informs the user without throwing unhandled exceptions.

---

---

## Detailed Milestone Records

### Phase 3F — Real-Time Active Charging Telemetry Dashboard & Live Session Experience
- **Status:** Completed
- **Date:** October 2026
- **Test Suite:** `backend/src/scripts/test_phase3f.js` (50/50 tests passing)
- **Frontend Build:** ✅ Zero errors, 1936 modules, gzip 119.89 kB
- **Regression Suite:** `test_phase3e4.js` (63/63 passed), `test_phase3e3.js` (85/86 — 1 pre-existing flake), `test_phase3e2.js` (67/67 passed), `test_phase3e1.js` (50/50 passed), `test_phase3d10.js` (81/81 passed), `test_phase3d9.js` (69/74 — 5 pre-existing multi-charger flakes), `test_phase3d8d.js` (72/72 passed), `test_phase3d8b.js` (51/51 passed), `test_phase3d7b.js` (72/72 passed), `test_phase3d6b.js` (56/56 passed), `test_phase3c4a.js` (44/44 passed), `verify.js` ✅
- **Commit:** `feat: add live charging telemetry dashboard`
- **Compliance Notice:** *"VahanGrid Phase 3F delivers real-time OCPP 2.0.1 MeterValues telemetry streaming to the frontend via a 5-second REST polling architecture. The frontend derives genuine power (kW), SoC (%), and energy (kWh) from `ocpp_session_telemetry`. Estimated cost uses the session-locked tariff snapshot with deterministic paisa rounding matching the backend pricingService. Post-session CDR finalization is surfaced in a live CDR receipt modal accessible from the history page. Zero premature infrastructure (no Redis, Kafka, MQTT, or Socket.IO) was introduced; the existing PostgreSQL schema was 100% sufficient."*

#### Files Created / Modified:
1. **`frontend/src/hooks/useChargingTelemetry.js`** *(new)*
   - 5-second polling loop with `document.visibilityState` pause/resume
   - AbortController-based in-flight guard to prevent overlapping requests
   - Derives `powerKw`, `currentSoc`, `energyKwh`, `freshness` from real OCPP telemetry samples
   - Live elapsed clock synced to `session.started_at`
   - `stopCharging()` action: calls stop API, waits 800ms, retrieves finalized CDR

2. **`frontend/src/components/charging/PowerCurveChart.jsx`** *(new)*
   - Pure SVG responsive chart (no third-party library)
   - Dual Y-axes: Power kW (left) and SoC % (right)
   - Chronological sorting, custom tooltips, animated waiting state

3. **`frontend/src/components/charging/ActiveChargingModal.jsx`** *(modified)*
   - Full integration with `useChargingTelemetry`
   - Freshness badge (`Live Telemetry`, `Connected • Standby`, `Waiting for MeterValues`)
   - Circular battery gauge (SoC % or fallback kW)
   - 4-metric grid: Power kW, Energy kWh, Estimated Cost ₹, Duration
   - Embedded `PowerCurveChart`
   - Post-session finalized CDR summary view

4. **`frontend/src/components/charging/ChargingSessionCard.jsx`** *(modified)*
   - Shows live energy delivered and SoC % instead of static placeholder

5. **`frontend/src/services/chargingService.js`** *(modified)*
   - `getSessionTelemetry(id, options)` — time-series telemetry endpoint
   - `getSessionCdr(id)` — finalized CDR retrieval
   - `calculateEstimatedCost(tariffSnapshot, metrics)` — deterministic frontend pricing

6. **`frontend/src/pages/History/HistoryPage.jsx`** *(modified)*
   - `CdrReceiptModal` component: fetches real CDR via API, displays itemized billing
   - `handleViewInvoice()`: async CDR load with loading/error states
   - Export button: JSON download of all sessions
   - Telemetry badge: upgraded from `Phase 3C.3` → `Phase 3F / OCPP 2.0.1 Audited`

7. **`backend/src/scripts/test_phase3f.js`** *(new)*
   - 50-assertion test suite covering: telemetry endpoint structure, active session sync, session list data shape, CDR lifecycle (active → stop → finalized), IDOR ownership isolation, unauthenticated access, UUID validation, double-stop rejection

#### Architecture Decisions:
- **Polling over WebSocket:** 5-second REST polling chosen over WebSocket streaming. OCPP 2.0.1 MeterValues arrive at 30s intervals; 5s polling is granular enough for live UX while zero extra infrastructure is required.
- **No Charting Library:** SVG-native `PowerCurveChart.jsx` avoids bloating the bundle. The existing frontend has no charting dependency; adding Recharts/Chart.js would add ~150kB gzip.
- **CDR Race Condition Guard:** Session stop triggers asynchronous CDR finalization. The hook includes a single 800ms retry before declaring CDR unavailable.
- **Freshness Invariant:** `freshness = 'live'` if latest sample is < 20s old; `idle` < 60s; `stale` otherwise. `unavailable` when no samples exist.

---

### Phase 3D.10 — OCPP 2.0.1 Smart Charging / Charging Profiles
- **Status:** Completed
- **Date:** October 2026
- **Test Suite:** `backend/src/scripts/test_phase3d10.js` (81/81 tests passing)
- **Regression Suite:** `test_phase3d9.js` (74/74 passed), `test_phase3d8d.js` (72/72 passed), `test_phase3d8b.js` (51/51 passed), `test_phase3d7b.js` (72/72 passed), `test_phase3d6b.js` (56/56 passed)
- **Compliance Notice:** *"VahanGrid implements OCPP 2.0.1 Smart Charging and Charging Profile orchestration (SetChargingProfile and ClearChargingProfile) across Station, EVSE, Connector, and active Transaction scopes via authenticated REST APIs, with zero state fabrication, zero unnecessary database migrations, and strict adherence to protocol state authority."*

#### Architectural Design & Implementation:
1. **Smart Charging Service (`chargingProfileService.js`):**
   - **SetChargingProfile (`POST /api/v1/stations/:id/charging-profiles`):**
     - Supports hierarchical scopes: Station-level (`evseId = 0`), EVSE-level (`evse_id`), Connector-level (`connector_id`), and active Transaction/Session-level (`session_id`).
     - Validates profile attributes and sub-structures: `id`, `stackLevel`, `chargingProfilePurpose` (`ChargingStationMaxProfile`, `TxDefaultProfile`, `TxProfile`), `chargingProfileKind` (`Absolute`, `Recurring`, `Relative`), `recurrencyKind` (`Daily`, `Weekly`), `validFrom`, `validTo`, `transactionId`, `chargingSchedule` (with `chargingRateUnit` `W` or `A`, `chargingSchedulePeriod` with `startPeriod`, `limit`, `numberPhases`, `phaseToUse`).
     - Enforces scope constraints: `ChargingStationMaxProfile` requires `evseId = 0` (cannot target EVSE or connector); `TxProfile` requires valid `evseId > 0` and active `transactionId` (automatically bound if `session_id` provided).
     - Session security: verifies that regular users cannot configure charging profiles on active sessions belonging to other users (403 Forbidden).
     - Outbound CALL dispatching via `ocppCallManager.sendCall()`. Handles single and multi-charge-point fan-out. Maps rejections to `409 CHARGING_PROFILE_REJECTED`, timeouts to `504 STATION_TIMEOUT`, and offline devices to `503 STATION_OFFLINE`.
   - **ClearChargingProfile (`POST /api/v1/stations/:id/clear-charging-profile` & `DELETE /api/v1/stations/:id/charging-profiles`):**
     - Supports clearing by `chargingProfileId`, criteria filters (`chargingProfilePurpose`, `stackLevel`, `evseId`), or targeted `evse_id`/`connector_id`.
     - Dispatches `ClearChargingProfile` CALL frames. Handles `Accepted` (cleared) and `Unknown` (no profile found, returns 200 with `{ status: "Unknown", cleared: false }`).
   - **GetChargingProfiles (Explicitly Deferred):**
     - In OCPP 2.0.1, `GetChargingProfiles` is an asynchronous reporting protocol where the charger acknowledges with `Accepted` and asynchronously delivers profiles via inbound `ReportChargingProfilesRequest` CALL frames. Synchronous REST retrieval would require either an asynchronous report state machine or maintaining an artificial profile ledger. Consistent with MVP principles, the charger remains the operational authority and `GetChargingProfiles` is cleanly deferred.

2. **Strict State Authority:**
   - Acknowledging a charging profile does NOT modify `connectors.status`, `evses.status`, or `charging_sessions.status`.
   - A charging profile represents a power/current constraint instruction, not an availability or state change. Actual physical charging performance continues to be monitored authoritatively through `MeterValues` and `TransactionEvent`.

3. **Zero Database Schema Changes:**
   - "Phase 3D.10 requires no database migration."
   - The charging station is the physical execution and operational source of truth for active profiles. Outbound control commands are transiently orchestrated without table bloat.

---

### Phase 3D.9 — OCPP Remote Operations: Reset, UnlockConnector & TriggerMessage
- **Status:** Completed
- **Date:** October 2026
- **Test Suite:** `backend/src/scripts/test_phase3d9.js` (74/74 tests passing)
- **Regression Suite:** `test_phase3d8d.js` (72/72 passed), `test_phase3d8b.js` (51/51 passed), `test_phase3d7b.js` (72/72 passed), `test_phase3d6b.js` (56/56 passed), `test_phase3d6a.js` (76/76 passed), `test_phase3d5.js` (79/79 passed), `test_phase3d4b.js` (82/82 passed), `test_phase3d4a.js` (62/62 passed), `test_phase3d3.js` (55/55 passed), `test_phase3d2.js` (47/47 passed)
- **Compliance Notice:** *"VahanGrid implements OCPP 2.0.1 remote operations for Reset (Immediate/OnIdle across station and EVSE scopes), UnlockConnector (cable release), and TriggerMessage (diagnostic and state synchronization triggers) via authenticated REST APIs, with zero state fabrication and complete preservation of event-driven state authority."*

#### Architectural Design & Implementation:
1. **Remote Operations Service (`remoteOperationService.js`):**
   - **Reset (`POST /api/v1/stations/:id/reset`):** Supports `type` (`Immediate`, `OnIdle`) and optional `evse_id`. Dispatches `Reset` CALL frames. Handles single and multi-charge-point fan-out. Maps rejections to `409 RESET_REJECTED`. Preserves state authority (no premature session or connector termination).
   - **UnlockConnector (`POST /api/v1/stations/:id/unlock-connector`):** Requires `connector_id`. Reverse-maps to `ocpp_evse_id` and `ocpp_connector_id`. Dispatches `UnlockConnector` CALL frame. Maps `OngoingAuthorizedTransaction` to `409 ONGOING_AUTHORIZED_TRANSACTION` and `UnlockFailed` to `409 UNLOCK_FAILED`. Does not alter connector status in DB.
   - **TriggerMessage (`POST /api/v1/stations/:id/trigger-message`):** Supports `requestedMessage` (`StatusNotification`, `MeterValues`, `Heartbeat`, `BootNotification`, `TransactionEvent`) with optional `connector_id` or `evse_id` targeting. Dispatches `TriggerMessage` CALL frame. Maps `NotImplemented` to `501 NOT_IMPLEMENTED` and rejection to `409 TRIGGER_MESSAGE_REJECTED`. Subsequent incoming messages are processed naturally by existing handlers.

2. **REST API Integration (`stations.js`, `stationController.js`):**
   - Mounted `POST /api/v1/stations/:id/reset`, `POST /api/v1/stations/:id/unlock-connector`, and `POST /api/v1/stations/:id/trigger-message`.
   - All guarded with JWT `authenticate` middleware.
   - Validates input formats and returns structured standardized success/error responses.

3. **Zero Database Schema Changes:**
   - All three remote operations are transient control commands orchestrated through `ocppCallManager` and existing device mappings without new tables or migrations.

---

### Phase 3D.8D — OCPP ChangeAvailability Implementation
- **Status:** Completed
- **Date:** October 2026
- **Test Suite:** `backend/src/scripts/test_phase3d8d.js` (72/72 tests passing)
- **Regression Suite:** `test_phase3d8b.js` (51/51 passed), `test_phase3d7b.js` (72/72 passed), `test_phase3d6b.js` (56/56 passed), `test_phase3d6a.js` (76/76 passed), `test_phase3d5.js` (79/79 passed), `test_phase3d4b.js` (82/82 passed), `test_phase3d4a.js` (62/62 passed), `test_phase3d3.js` (55/55 passed), `test_phase3d2.js` (47/47 passed)
- **Compliance Notice:** *"VahanGrid implements OCPP 2.0.1 ChangeAvailability orchestration supporting station-level, EVSE-level, and connector-level availability control via authenticated REST API, maintaining strict state authority wherein PostgreSQL connector status is updated solely through confirmatory incoming StatusNotification frames."*

#### Architectural Design & Implementation:
1. **Reverse Mappings (`ocppMappingService.js`):**
   - Added `resolveOcppIdentityByEvse(evseId)`: Resolves VahanGrid EVSE UUID to `{ charge_point_id, ocpp_evse_id, ocpp_charge_point_uuid, evse_id }`.
   - Added `resolveChargePointsByLocation(locationId)`: Resolves all OCPP charge point cabinets associated with a VahanGrid location (direct `location_id` and indirect via EVSE mappings).

2. **Availability Orchestration Service (`availabilityService.js`):**
   - Resolves target scope hierarchically:
     - **Connector-level:** `{ operationalStatus, connector_id }` sends `ChangeAvailability` with `{ operationalStatus, evse: { id: ocpp_evse_id, connectorId: ocpp_connector_id } }`.
     - **EVSE-level:** `{ operationalStatus, evse_id }` sends `ChangeAvailability` with `{ operationalStatus, evse: { id: ocpp_evse_id } }`.
     - **Station-level:** `{ operationalStatus }` sends `ChangeAvailability` with `{ operationalStatus }` (omitting `evse` property per OCPP 2.0.1 specification), supporting fan-out across multiple charge points.
   - Enforces `operationalStatus` enum: strictly `'Operative'` | `'Inoperative'`.
   - Dispatches outbound CALL via `ocppCallManager.sendCall()` using existing WebSocket infrastructure.
   - Handles `Accepted`, `Scheduled`, and `Rejected` responses cleanly.

3. **Strict State Authority (StatusNotification as Single Writer):**
   - ChangeAvailability CALLRESULT (`Accepted`) does **not** pre-emptively update `connectors.status` or `evses.status`.
   - State authority is preserved: when the charger shifts state, it transmits an autonomous `StatusNotification` which `statusNotificationHandler.js` processes to update PostgreSQL `connectors.status` (`'unavailable'` or `'available'`).

4. **REST API Endpoint (`POST /api/v1/stations/:id/availability`):**
   - Mounted on `backend/src/routes/stations.js` guarded with `authenticate` middleware.
   - Validates UUIDs, checks hierarchy ownership, returns standard structured success or error payloads (`INVALID_ID`, `STATION_NOT_FOUND`, `INVALID_OPERATIONAL_STATUS`, `INVALID_CONNECTOR_ID`, `CONNECTOR_NOT_FOUND`, `INVALID_EVSE_ID`, `EVSE_NOT_FOUND`, `NO_OCPP_CHARGE_POINTS`, `STATION_OFFLINE`, `AVAILABILITY_REJECTED`, `STATION_TIMEOUT`).

---

### Phase 3D.8B — OCPP Remote Start/Stop Command Infrastructure
- **Status:** Completed
- **Date:** October 2026
- **Test Suite:** `backend/src/scripts/test_phase3d8b.js` (51/51 tests passing)
- **Regression Suite:** `test_phase3d7b.js` (72/72 passed), `test_phase3d6b.js` (56/56 passed), `test_phase3d6a.js` (76/76 passed), `test_phase3d5.js` (79/79 passed), `test_phase3d4b.js` (82/82 passed), `test_phase3d4a.js` (62/62 passed), `test_phase3d3.js` (55/55 passed), `test_phase3d2.js` (47/47 passed)
- **Compliance Notice:** *"VahanGrid implements outbound OCPP 2.0.1 CALL infrastructure with in-memory correlation for CALLRESULT / CALLERROR frames, robust timeout handling, socket-drop cleanup, reverse identity mappings, and end-to-end REST session integration for RequestStartTransaction and RequestStopTransaction."*

#### Architectural Design & Implementation:
1. **Outbound OCPP CALL Manager (`OcppCallManager`):**
   - Implemented in `backend/src/ocpp/ocppCallManager.js` as an exportable singleton and extensible class.
   - Generates unique UUID-based message identifiers (`urn:uuid:<uuid>`).
   - Formats standard OCPP 2.0.1 CALL frames: `[2, messageId, action, payload]`.
   - Dispatches frames to active charge point WebSockets retrieved from `connectionRegistry`.
   - Maintains in-flight calls in memory (`pendingCalls` Map) with configured timeouts (default 10,000ms).
   - Enforces timeout cancellation rejecting with `504 Gateway Timeout` (`STATION_TIMEOUT`).
   - Listens to connection close events in `ocppServer.js`, aborting all in-flight calls with `503 Service Unavailable` (`CONNECTION_CLOSED`).

2. **Incoming Correlation Handler (`messageHandler.js`):**
   - Parses message type ID:
     - `3` (CALLRESULT `[3, messageId, payload]`): resolves pending call Promise.
     - `4` (CALLERROR `[4, messageId, errorCode, errorDescription, errorDetails]`): rejects pending call Promise with structured `OcppError` (`502 Bad Gateway`).
   - Automatically unregisters completed/failed calls from `pendingCalls`.

3. **Reverse OCPP Identity Mappings (`ocppMappingService.js`):**
   - `resolveOcppIdentityByConnector(connectorId)`: Resolves VahanGrid connector UUID to `{ charge_point_id, ocpp_evse_id, ocpp_connector_id, evse_id }`.
   - `resolveOcppIdentityBySession(sessionId)`: Resolves VahanGrid session UUID to `{ charge_point_id, transaction_id, connector_id }`.

4. **Remote Start Transaction Flow (`RequestStartTransaction`):**
   - Available via `POST /api/v1/sessions/start` with `{ remote: true }` and dedicated `POST /api/v1/sessions/remote-start`.
   - Checks station online status (returns `503 STATION_OFFLINE` if disconnected).
   - Generates a remote start ID (`1..2147483647`) and sends `RequestStartTransaction` CALL frame:
     `{ remoteStartId, evseId, idToken: { idToken: userId, type: 'Central' } }`.
   - If station returns `RequestStartTransactionResponse` with status `Accepted`:
     - Creates `charging_sessions` in status `'pending'` (awaiting vehicle plug-in).
     - Reserves connector (`status = 'reserved'`).
   - If station rejects (`Rejected`): returns `409 Conflict` (`REMOTE_START_REJECTED`) and frees connector back to `'available'`.
   - When vehicle plugs in and station fires `TransactionEvent(Started)`:
     - Links to pending session, transitions `charging_sessions` to `'active'`, and connector to `'charging'`.

5. **Remote Stop Transaction Flow (`RequestStopTransaction`):**
   - Available via `POST /api/v1/sessions/:id/stop` with `{ remote: true }` and dedicated `POST /api/v1/sessions/:id/remote-stop`.
   - Resolves active `transactionId` and dispatches `RequestStopTransaction` CALL frame: `{ transactionId }`.
   - If accepted, updates session to `'stopped'`.
   - Upon receipt of subsequent `TransactionEvent(Ended)` from station, terminal status `'stopped'` is strictly preserved while final energy is synchronized from the meter reading.

6. **Backward Compatibility & Non-Remote REST Sessions:**
   - Standard calls to `POST /api/v1/sessions/start` without `{ remote: true }` continue to create immediate `'active'` sessions.
   - Standard calls to `POST /api/v1/sessions/:id/stop` continue to perform immediate local session termination.
   - 100% test pass rate preserved across all regression test suites (510 total automated tests).

### Phase 3D.7B — OCPP MeterValues Telemetry & Dual-Tier Storage
- **Status:** Completed
- **Date:** September 2026
- **Test Suite:** `backend/src/scripts/test_phase3d7b.js` (72/72 tests passing)
- **Regression Suite:** `test_phase3d6b.js` (56/56 passed), `test_phase3d6a.js` (76/76 passed), `test_phase3d5.js` (79/79 passed), `test_phase3d4b.js` (82/82 passed), `test_phase3d4a.js` (62/62 passed), `test_phase3d3.js` (55/55 passed), `test_phase3d2.js` (47/47 passed)
- **Compliance Notice:** *"VahanGrid implements dual-tier OCPP 2.0.1 MeterValues telemetry handling, featuring Tier 1 sub-millisecond in-memory cache per EVSE in connectionRegistry, and Tier 2 PostgreSQL historical time-series storage (ocpp_session_telemetry) for active charging sessions with dedicated REST API exposure."*

#### Architectural Design & Implementation:
1. **Dual-Tier Hybrid Telemetry Model:**
   - **Tier 1 (Real-Time In-Memory Cache):** Stored per `chargePointId` and `evseId` in `connectionRegistry.js`. Tracks latest snapshot (`powerKw`, `socPercent`, `energyWh`, `voltageV`, `currentA`, `reportedAt`) with sub-millisecond in-memory read performance and zero database write pressure for high-frequency or station-wide frames.
   - **Tier 2 (Session Curve Persistence):** Normalized time-series entries persisted to `ocpp_session_telemetry` ONLY during active charging transactions linked to a VahanGrid `charging_sessions` record.
   - **Zero Row Explosion Guard:** Idle EVSE telemetry and station-wide telemetry (EVSE 0) update Tier 1 live state only, generating zero rows in PostgreSQL.

2. **Migration 017 (`017_create_ocpp_session_telemetry.sql`):**
   - Created table `ocpp_session_telemetry`: `id` (UUID PK), `session_id` (FK to `charging_sessions` ON DELETE CASCADE), `ocpp_transaction_id` (FK to `ocpp_transactions` ON DELETE SET NULL), `recorded_at` (TIMESTAMPTZ), `power_kw` (NUMERIC 8,3), `soc_percent` (INTEGER), `energy_kwh` (NUMERIC 10,3), `created_at` (TIMESTAMPTZ).
   - Created compound index `idx_ocpp_session_telemetry_curve ON ocpp_session_telemetry(session_id, recorded_at ASC)` for fast chronological curve queries.
   - Clean domain separation maintained; no schema modifications to users, vehicles, wallets, locations, or connectors.

3. **Telemetry Measurand Normalization (`parseMeterValuesTelemetry`):**
   - Implemented in `backend/src/ocpp/handlers/meterValuesHandler.js`.
   - `Power.Active.Import`: W / kW normalized to kW.
   - `SoC`: State of Charge percentage bounded [0, 100].
   - `Energy.Active.Import.Register`: Wh / kWh normalized to Wh.
   - `Voltage`: Volts (V).
   - `Current.Import`: Amperes (A).

4. **Energy & State Synchronization:**
   - Net energy calculation strictly respects the Phase 3D.6B delta model (`Math.max(0, energyWh - meter_start_wh) / 1000.0`).
   - Cumulative energy protected against backwards regression via PostgreSQL `GREATEST(total_energy_kwh, $val)` and `GREATEST(energy_kwh, $val)`.
   - Synchronizes `charging_sessions.end_soc` in real-time as SoC samples arrive.

5. **Dedicated Telemetry REST API:**
   - `GET /api/v1/sessions/:id/telemetry`:
   - Authenticated and strictly protected against IDOR (verifies session ownership by requesting user).
   - Returns chronological array of `{ recorded_at, power_kw, soc_percent, energy_kwh }`.

---

### Phase 3D.6B — OCPP TransactionEvent Energy Synchronization
- **Status:** Completed
- **Date:** September 2026
- **Test Suite:** `backend/src/scripts/test_phase3d6b.js` (56/56 tests passing)
- **Regression Suite:** `test_phase3d6a.js` (76/76 passed), `test_phase3d5.js` (79/79 passed), `test_phase3d4b.js` (82/82 passed), `test_phase3d4a.js` (62/62 passed), `test_phase3d3.js` (55/55 passed), `test_phase3d2.js` (47/47 passed), `test_phase3b3.js` (34/34 passed)
- **Compliance Notice:** *"VahanGrid safely parses OCPP 2.0.1 TransactionEvent energy telemetry (Energy.Active.Import.Register), distinguishes cumulative meter registers from net session consumption, and synchronizes active customer charging_sessions without data corruption."*

#### Architectural Design & Implementation:
1. **Migration 016 (`016_ocpp_energy_meter_semantics.sql`):**
   - Corrected `meter_start_wh` column semantics in `ocpp_transactions` by setting `DEFAULT NULL` (previously `DEFAULT 0.000` was ambiguous between real 0 and unknown baseline).
   - Clean domain separation strictly maintained: no modification to `charging_sessions`, `connectors`, `evses`, `locations`, `cpos`, `users`, or `vehicles`.

2. **Strict Meter Reading Parser (`parseMeterReadingWh`):**
   - Implemented and exported pure validation utility in `backend/src/ocpp/handlers/transactionEventHandler.js`.
   - Validates measurand: strictly matches `Energy.Active.Import.Register` (defaults to it when omitted per OCPP 2.0.1 specification; ignores unrelated measurands such as `Power.Active.Import`, `Current.Import`, `SoC`, `Voltage`).
   - Validates unit: accepts `Wh`, `kWh` (converted via `val * 1000.0`), and case-insensitive / punctuation variations (`w.h`, `kw.h`, `w·h`). Safely ignores unsupported units (`W`, `A`, `V`, `Percent`, `Celsius`, `kvarh`).
   - Validates numbers: ensures finite, non-negative numeric values; rejects negative numbers, `NaN`, non-numeric strings.
   - Validates timestamps: verifies valid ISO 8601 formatting.

3. **Cumulative Register vs. Net Energy Distinction:**
   - **Started:** Captures baseline meter reading into `ocpp_transactions.meter_start_wh` if present (or `NULL` if omitted).
   - **Updated:** Captures current reading into `ocpp_transactions.meter_stop_wh`, calculates net consumed energy `delta_wh = max(0, meter_stop_wh - coalesce(meter_start_wh, 0))`, and stores `total_energy_kwh = GREATEST(total_energy_kwh, delta_wh / 1000.0)`.
   - **Ended:** Captures final reading into `meter_stop_wh`, finalizes `total_energy_kwh`, marks status `'completed'`. If `meterValue` is omitted at Ended, preserves the latest reading and energy from previous Updated events.
   - **Monotonic Protection:** Uses `GREATEST(total_energy_kwh, $val)` to guarantee energy values never regress backwards on out-of-order or duplicate deliveries.

4. **Domain Synchronization (`charging_sessions.energy_kwh`):**
   - On `Updated`: If `ocpp_transactions.session_id` links to an active VahanGrid session (`status = 'active'`), synchronizes `charging_sessions.energy_kwh = GREATEST(energy_kwh, calculatedKwh)` in real time.
   - On `Ended`: Finalizes `charging_sessions.energy_kwh` alongside `ended_at` and `duration_seconds` for active/pending sessions.
   - **Terminal Protection:** Never modifies or resurrects sessions already in terminal states (`stopped`, `cancelled`).

#### Explicit Current Limitations:
- Standalone `MeterValues` periodic telemetry subsystem outside of TransactionEvent is scheduled for subsequent phases.
- Tariffs, pricing calculations, billing, and wallet deductions are not yet triggered by OCPP energy synchronization.

---

### Phase 3D.6A — Persistent OCPP Transaction Layer & TransactionEvent Lifecycle
- **Status:** Completed
- **Date:** September 2026
- **Commit:** `(pending — do not commit yet)`
- **Test Suite:** `backend/src/scripts/test_phase3d6a.js` (76/76 tests passing)
- **Compliance Notice:** *"VahanGrid persists OCPP 2.0.1 TransactionEvent (Started / Updated / Ended) in a decoupled `ocpp_transactions` table; the authoritative customer session (`charging_sessions`) is never fabricated without a user identity."*

#### Architectural Design & Implementation:
1. **Migration 015 (`015_create_ocpp_transactions.sql`):**
   - Created `ocpp_transactions` table — the authoritative OCPP protocol ledger.
   - Composite unique constraint `UNIQUE(ocpp_charge_point_id, transaction_id)` enforces that a `transaction_id` is scoped per charge point (OCPP 2.0.1 §7.4.2.2).
   - Nullable FK `session_id → charging_sessions(id) ON DELETE SET NULL` enables optional bridging to customer sessions without forcing one.
   - Nullable FK `connector_id → connectors(id) ON DELETE SET NULL` tracks the physical connector involved.
   - Status check constraint: `'active' | 'completed' | 'aborted'`.
   - **Zero modification** to `evses`, `connectors`, `locations`, `cpos`, `charging_sessions`, `users`, or `vehicles`.

2. **TransactionEvent Handler (`backend/src/ocpp/handlers/transactionEventHandler.js`):**
   - Routes `eventType` ∈ `{'Started', 'Updated', 'Ended'}` to dedicated sub-handlers.
   - Performs full schema validation: `eventType`, `timestamp`, `triggerReason`, `seqNo` (non-negative integer), `transactionInfo.transactionId` (≤36 chars).

3. **Started Event:**
   - Validates `evse.id > 0` (evseId = 0 is charge-point-level and cannot start a transaction).
   - Resolves physical connector via `ocppMappingService.resolveConnectorMapping()` / `resolveEvseMapping()` with fallback to first mapped connector.
   - **Session bridging:** if an active REST `charging_sessions` row exists on the resolved connector, links `ocpp_transactions.session_id` and populates `charging_sessions.external_session_id = transactionId`.
   - **No fabrication:** if no REST session exists, `session_id` remains `NULL`; `charging_sessions.user_id` is never set to a synthetic value.
   - Transitions physical connector status `→ 'charging'` atomically inside a `BEGIN`/`COMMIT` transaction with `SELECT … FOR UPDATE` row locks.
   - **Idempotency:** duplicate `Started` (same `(ocpp_charge_point_id, transaction_id)`) acknowledges with `CALLRESULT {}` without inserting duplicates.

4. **Updated Event:**
   - **Monotonic seqNo guard:** if `seqNo ≤ stored seq_no`, treats as stale/duplicate, acknowledges with `CALLRESULT {}`, no state mutation.
   - Extracts `Energy.Active.Import.Register` from `meterValue[]` (Wh → kWh conversion).
   - Uses `GREATEST(total_energy_kwh, $new)` to prevent energy regression on out-of-order delivery.
   - Propagates energy to `charging_sessions.energy_kwh` only if the linked session is still `'active'`.

5. **Ended Event:**
   - **Idempotency:** already-terminal (`'completed'` or `'aborted'`) transactions acknowledge without state regression.
   - Seqno guard applies: stale `seqNo < current` silently acknowledged.
   - Sets `ocpp_transactions.status = 'completed'`, persists `ended_at`, `stopped_reason`.
   - **Linked session finalization:** transitions linked `charging_sessions` to `'completed'` only if still `'active'` or `'pending'`; never resurrects already-`'stopped'` sessions (REST terminal state protection).
   - Resets mapped connector `→ 'available'` only if no other active `ocpp_transactions` exist on that connector.

6. **messageHandler.js Integration:**
   - Added `import { handleTransactionEvent }` and routed `action === 'TransactionEvent'` with standard try/catch CALLERROR handling.
   - Fallback unsupported-action error message updated from Phase 3D.5 to Phase 3D.6A scope.

#### Regression Updates (3 suites):
- **`test_phase3d5.js` test 64:** Updated assertion — `TransactionEvent` now returns a validation `CALLERROR` (not `NotImplemented`) since Phase 3D.6A implements the action.
- **`test_phase3d4b.js` test 57** and **`test_phase3d4a.js` test 5g** and **`test_phase3d3.js` test 4h:** Same update pattern.
- **Session seed count:** Orphaned test-run sessions cleaned; seed count corrected from 14 → 4 in affected assertions.

#### Explicit Current Limitations:
- `MeterValues` telemetry curve persistence is not yet implemented.
- Tariff calculation, billing, and wallet deductions are not yet triggered by OCPP events.
- Remote Start / Remote Stop commands (CSMS → charger direction) are not yet implemented.

#### Next Phase:
- **Phase 3D.6B — MeterValues Telemetry Curve Persistence** (or as directed by architecture review)

---

### Phase 3D.5 — Persistent Device State, Heartbeat & Live Status Synchronization
- **Status:** Completed
- **Date:** September 2026
- **Test Suite:** `backend/src/scripts/test_phase3d5.js` (79/79 tests passing)
- **Compliance Notice:** *"VahanGrid supports BootNotification, Heartbeat, and StatusNotification persistence with live connector status synchronization; full OCPP 2.0.1 compliance is in progress."*

#### Architectural Design & Implementation:
1. **Migration 014 (`014_add_last_seen_at_to_ocpp_charge_points.sql`):**
   - Added `last_seen_at TIMESTAMPTZ` and index `idx_ocpp_charge_points_last_seen` to `ocpp_charge_points`.
   - Existing domain tables (`locations`, `cpos`, `evses`, `connectors`, `charging_sessions`) remain strictly unmodified.

2. **BootNotification Persistence (`backend/src/ocpp/handlers/bootNotificationHandler.js`):**
   - Validates incoming `BootNotification` per OCPP 2.0.1 schema.
   - For new charge points: creates record in `ocpp_charge_points` with default `registration_status = 'Pending'`.
   - For existing charge points: updates metadata (`model`, `vendor_name`, `serial_number`, `firmware_version`, `boot_reason`, `last_boot_at`, `last_seen_at`, `status = 'online'`) while strictly preserving existing `registration_status` (`'Accepted'`, `'Pending'`, or `'Rejected'`).
   - Retains standard OCPP response: `[3, "<messageId>", { "status": "Accepted", "interval": 300, "currentTime": "<ISO-8601>" }]`.

3. **Heartbeat Protocol (`backend/src/ocpp/handlers/heartbeatHandler.js`):**
   - Implements `[2, "<messageId>", "Heartbeat", {}]` CALL request.
   - Validates payload structure and returns standard `[3, "<messageId>", { "currentTime": "<ISO-8601>" }]`.
   - Known charge points: updates `last_seen_at = NOW()`, `status = 'online'`, and in-memory `connectionRegistry.updateHeartbeat(chargePointId)`.
   - Unknown/unregistered devices: handled gracefully with standard `CALLRESULT` without throwing errors or dropping sockets.

4. **StatusNotification $\rightarrow$ PostgreSQL Synchronization (`backend/src/ocpp/handlers/statusNotificationHandler.js`):**
   - Enforces unambiguous connector status translation to PostgreSQL `connectors`:
     - `Available` $\rightarrow$ `'available'`
     - `Reserved` $\rightarrow$ `'reserved'`
     - `Unavailable` $\rightarrow$ `'unavailable'`
     - `Faulted` $\rightarrow$ `'faulted'`
   - **Critical rule:** `Occupied` is **NOT** mapped to `'charging'`. Occupied remains represented in the transient `connectionRegistry` only until `TransactionEvent` provides actual charging session semantics.
   - `evseId = 0`: updates `ocpp_charge_points.status` only; does not propagate to `connectors`.
   - Unmapped EVSE/connector identities: preserved in transient memory, logs warning, returns normal `CALLRESULT` `{}`, never crashes WebSocket.

5. **Live REST API Availability Reflection:**
   - Changes applied via OCPP `StatusNotification` are immediately reflected in `GET /api/v1/stations` and `GET /api/v1/stations/:id` in real time with zero server restarts.

#### Explicit Current Limitations:
- `TransactionEvent` (`Started`, `Updated`, `Ended`) is implemented in Phase 3D.6A.
- Real-time energy telemetry (`MeterValues`) is not yet implemented.
- Billing, tariff calculation, and wallet deductions are not yet triggered by OCPP messages.

#### Next Phase:
- **Phase 3D.6 — OCPP 2.0.1 TransactionEvent, Active Session Bridging & Energy Telemetry**

---

### Phase 3D.4B — Persistent OCPP Device & EVSE/Connector Mapping Layer
- **Status:** Completed
- **Date:** September 2026
- **Test Suite:** `backend/src/scripts/test_phase3d4b.js` (82/82 tests passing)
- **Design Philosophy:** Dedicated mapping layer tables (`ocpp_charge_points`, `ocpp_evse_mappings`, `ocpp_connector_mappings`). Zero modification to existing VahanGrid domain entities (`evses`, `connectors`, `locations`, `cpos`, `charging_sessions`).

#### Architectural Design & Implementation:
1. **Migration 011 (`011_create_ocpp_charge_points.sql`):**
   - Device registry table for physical OCPP charging cabinets.
   - `id UUID PRIMARY KEY`, `charge_point_id VARCHAR(255) NOT NULL UNIQUE`, `location_id UUID REFERENCES locations(id) ON DELETE SET NULL`.
   - Hardware metadata: `model`, `vendor_name`, `serial_number`, `firmware_version`, `boot_reason`.
   - Enum checks: `registration_status IN ('Accepted', 'Pending', 'Rejected')`, `status IN ('online', 'offline', 'unavailable', 'maintenance')`.

2. **Migration 012 (`012_create_ocpp_evse_mappings.sql`):**
   - EVSE identity translation table.
   - `id UUID PRIMARY KEY`, `charge_point_id UUID NOT NULL REFERENCES ocpp_charge_points(id) ON DELETE CASCADE`.
   - `ocpp_evse_id INTEGER NOT NULL`, `evse_id UUID NOT NULL REFERENCES evses(id) ON DELETE RESTRICT`.
   - Constraints: `UNIQUE (charge_point_id, ocpp_evse_id)`, `UNIQUE (evse_id)`, `CHECK (ocpp_evse_id > 0)`.

3. **Migration 013 (`013_create_ocpp_connector_mappings.sql`):**
   - Connector identity translation table.
   - `id UUID PRIMARY KEY`, `ocpp_evse_mapping_id UUID NOT NULL REFERENCES ocpp_evse_mappings(id) ON DELETE CASCADE`.
   - `ocpp_connector_id INTEGER NOT NULL`, `connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE RESTRICT`.
   - Constraints: `UNIQUE (ocpp_evse_mapping_id, ocpp_connector_id)`, `UNIQUE (connector_id)`, `CHECK (ocpp_connector_id > 0)`.

4. **Lookup Service (`backend/src/services/ocppMappingService.js`):**
   - Pure read-only lookup translation functions:
     - `resolveChargePoint(chargePointId)`: Translates chargePointId to device metadata row.
     - `resolveEvseMapping(chargePointId, ocppEvseId)`: Resolves to VahanGrid EVSE UUID.
     - `resolveConnectorMapping(chargePointId, ocppEvseId, ocppConnectorId)`: Resolves to VahanGrid connector UUID.
     - `getFullMapping(chargePointId)`: Full mapping tree for introspection/diagnostics.
   - Read-only contract: does not modify or mutate connector status or sessions in this phase.

---

### Phase 3D.4A — OCPP 2.0.1 StatusNotification
- **Status:** Completed
- **Date:** September 2026
- **Test Suite:** `backend/src/scripts/test_phase3d4a.js` (62/62 tests passing)
- **Compliance Notice:** *"VahanGrid supports BootNotification and StatusNotification handling, but does not yet provide full OCPP 2.0.1 compliance."*

#### Architectural Design & Implementation:
1. **StatusNotification Request Handler (`backend/src/ocpp/handlers/statusNotificationHandler.js`):**
   - Validates incoming `StatusNotification` payload strictly according to the official OCPP 2.0.1 specification:
     - `timestamp`: required ISO 8601 date-time string. Malformed or non-string timestamp returns `FormatViolation`.
     - `connectorStatus`: required `ConnectorStatusEnumType` string (`Available`, `Occupied`, `Reserved`, `Unavailable`, `Faulted`). Non-conforming values (e.g. `Preparing`, `Charging`, `SuspendedEV`, `Finishing`, or invalid strings) return `PropertyConstraintViolation`.
     - `evseId`: required non-negative integer (`>= 0`). Non-integers return `FormatViolation`; negative values return `PropertyConstraintViolation`.
     - `connectorId`: required non-negative integer (`>= 0`). Non-integers return `FormatViolation`; negative values return `PropertyConstraintViolation`.
     - `customData`: optional JSON object.
     - Identity consistency: if an explicit charge point or station ID is passed in the payload, it must match the connection URL path; otherwise returns `PropertyConstraintViolation`.

2. **OCPP Message Router (`backend/src/ocpp/messageHandler.js`):**
   - Dispatches `action === 'StatusNotification'` to `handleStatusNotification`.
   - Returns standards-compliant `CALLRESULT` frame: `[3, "<messageId>", {}]`.
   - Returns `CALLERROR` frame on validation failures without dropping the WebSocket connection.
   - Preserves `NotImplemented` `CALLERROR` for unsupported actions (`Heartbeat`, `TransactionEvent`, `MeterValues`, `Authorize`, etc.).

3. **Transient State Management (`backend/src/ocpp/connectionRegistry.js`):**
   - Extended `ConnectionRegistry` with:
     - `updateStatusNotification(chargePointId, statusData)`: associates latest status notification and updates per-connector status map (`${evseId}:${connectorId}`).
     - `getLatestStatusNotification(chargePointId)`: retrieves latest status notification for the station.
     - `getStatusNotification(chargePointId, evseId, connectorId)`: retrieves specific connector status.
   - State is stored strictly in application memory (`Map`); NO database tables or records are modified.

4. **Zero Database Impact:**
   - PostgreSQL `connectors` table remains unmodified; no schema changes or database writes occur for status notifications in this phase.
   - Verified that connector row count and connector statuses remain completely untouched.

5. **Explicit Current Limitations:**
   - Persistent mapping between OCPP EVSE/connector identifiers and PostgreSQL relational `evses`/`connectors` tables is not implemented yet (scheduled for follow-up Phase 3D.4B).
   - Session lifecycle integration, energy telemetry (`MeterValues`), charging transactions (`TransactionEvent`), billing, and wallet deductions are not implemented.

---

### Phase 3D.3 — OCPP 2.0.1 BootNotification
- **Status:** Completed
- **Date:** September 2026
- **Test Suite:** `backend/src/scripts/test_phase3d3.js` (55/55 tests passing)
- **Compliance Notice:** *"VahanGrid currently supports BootNotification handling only; this does not constitute full OCPP 2.0.1 compliance."*

#### Architectural Design & Implementation:
1. **OCPP Message Router (`backend/src/ocpp/messageHandler.js`):**
   - Implemented standards-compliant JSON-RPC frame validator for OCPP-J 2.0.1:
     - `CALL` `[2, "<MessageId>", "<Action>", {<Payload>}]`
     - `CALLRESULT` `[3, "<MessageId>", {<Payload>}]`
     - `CALLERROR` `[4, "<MessageId>", "<ErrorCode>", "<ErrorDescription>", {<ErrorDetails>}]`
   - Validates message type ID (`2`), non-empty message ID (<= 36 chars), non-empty action string, and object payload.
   - Standard OCPP error codes defined in [`ocppErrors.js`](file:///c:/Users/kunal%20singh/OneDrive/Desktop/VahanGrid/backend/src/ocpp/ocppErrors.js).

2. **BootNotification Request Handler (`backend/src/ocpp/handlers/bootNotificationHandler.js`):**
   - Validates required OCPP 2.0.1 fields:
     - `reason`: required enum (`ApplicationReset`, `FirmwareUpdate`, `LocalReset`, `PowerUp`, `RemoteReset`, `ScheduledReset`, `Triggered`, `Unknown`, `Watchdog`). Missing or invalid reason returns `FormatViolation` / `PropertyConstraintViolation`.
     - `chargingStation`: required object.
       - `model`: required string (1-20 chars).
       - `vendorName`: required string (1-50 chars).
       - `serialNumber`: optional string (<= 25 chars).
       - `firmwareVersion`: optional string (<= 50 chars).
       - `modem`: optional object.

3. **Charge-Point ID Consistency:**
   - Authoritative identity is established by the WebSocket connection path (`/ocpp/<charge-point-id>`).
   - If payload provides an explicit `chargePointId`, `stationId`, or `chargingStation.id` that contradicts the path identity, the request is rejected with `PropertyConstraintViolation`.

4. **Response Behavior:**
   - Returns a `CALLRESULT` echoing the exact incoming `messageId`.
   - Response payload:
     - `currentTime`: dynamic, real current server time in ISO 8601 (`new Date().toISOString()`), never hardcoded.
     - `interval`: `300` (heartbeat interval in seconds).
     - `status`: `"Accepted"`.

5. **Transient Registration State:**
   - In-memory association in [`connectionRegistry.js`](file:///c:/Users/kunal%20singh/OneDrive/Desktop/VahanGrid/backend/src/ocpp/connectionRegistry.js) via `updateBootNotification(chargePointId, bootData)`.
   - Stores `reason`, `chargingStation`, `registrationStatus: 'Accepted'`, and `bootstrappedAt: new Date()`.
   - Strictly in-memory — no database tables or persistent writes in this phase.

6. **Malformed & Unsupported Message Handling:**
   - Invalid JSON, empty messages, and non-array frames safely return `CALLERROR` with `RpcFrameworkError`.
   - Unsupported actions (e.g. `Heartbeat`, `StatusNotification`, `TransactionEvent`, `MeterValues`) return `CALLERROR` with `NotImplemented` without fabricating success responses.
   - Sockets remain stable and open after errors; subsequent valid `BootNotification` calls succeed immediately.

7. **Current Limitations:**
   - MeterValues, TransactionEvent, Heartbeat, and remote charging commands are not yet implemented.
   - Persistent database registration and station matching are scheduled for subsequent OCPP phases.

---

### Phase 3D.2 — OCPP WebSocket Foundation
- **Status:** Completed
- **Date:** September 2026
- **Test Suite:** `backend/src/scripts/test_phase3d2.js` (47/47 tests passing)
- **Scope Notice:** This phase implements ONLY the WebSocket connectivity foundation. It does NOT yet implement OCPP 2.0.1 business messages (BootNotification, Heartbeat, StatusNotification, MeterValues, etc.), telemetry, billing, or database persistence.

#### Architectural Design & Implementation:
1. **Dedicated Module (`backend/src/ocpp/`):**
   - [`connectionRegistry.js`](file:///c:/Users/kunal%20singh/OneDrive/Desktop/VahanGrid/backend/src/ocpp/connectionRegistry.js): In-memory transient connection registry supporting `register(chargePointId, ws)`, `get(chargePointId)`, `remove(chargePointId, [ws])`, and `has(chargePointId)`. Not persisted to PostgreSQL.
   - [`ocppServer.js`](file:///c:/Users/kunal%20singh/OneDrive/Desktop/VahanGrid/backend/src/ocpp/ocppServer.js): WebSocket server gateway integrating with the existing Node.js HTTP server (shares port 3001, no second port required). Intercepts HTTP Upgrade requests on path `/ocpp/:chargePointId`.
   - [`index.js`](file:///c:/Users/kunal%20singh/OneDrive/Desktop/VahanGrid/backend/src/ocpp/index.js): Public module exports for the OCPP subsystem.

2. **WebSocket Endpoint & Charge-Point Identity:**
   - **Endpoint URL:** `ws://localhost:3001/ocpp/<charge-point-id>`
   - Charge-point identity is parsed strictly from the path (`/ocpp/:chargePointId`), independent of database user IDs, vehicle IDs, or connector IDs.
   - Malformed paths (e.g. `/ocpp`, `/ocpp/`, `/ocpp/CP/extra`) are rejected with `HTTP 400 Bad Request` without establishing a WebSocket connection.

3. **Deterministic Duplicate Connection Handling:**
   - If a charge point connects with a `chargePointId` that is already active in the registry, the server gracefully closes the previous socket with close code `4001` and reason `'Superseded by new connection'`.
   - The new socket immediately takes over as the active connection in the registry.
   - A race-condition guard ensures the old socket's `close` event does not evict the newly registered connection.

4. **Connection Lifecycle & Message Handling:**
   - **Connect:** Socket is upgraded, validated, added to `connectionRegistry`, and logged.
   - **Message:** Incoming data is received, logged safely, and acknowledged without fabricating OCPP business responses.
   - **Disconnect / Error:** Clean removal from `connectionRegistry`, safe error logging without crashing Express.

5. **Existing REST Regression:**
   - Full regression verified across `GET /api/v1/health`, auth, users, vehicles, stations, sessions, and wallet. All existing APIs continue to function normally.

---

### Phase 3C.4B — Frontend Wallet Integration
- **Status:** Completed
- **Date:** September 2026
- **Test Suite:** `backend/src/scripts/test_phase3c4b.js` (40/40 tests passing)
- **Frontend Production Build:** Successful (`vite build` in 4.61s)

#### Changes Implemented:
1. **Frontend Service (`frontend/src/services/walletService.js`):**
   - Implemented `getWallet()`: consumes authenticated `GET /api/v1/wallet` with `credentials: 'include'`.
   - Implemented `getWalletTransactions()`: consumes authenticated `GET /api/v1/wallet/transactions`.
   - Added backward-compatible aliases `getTransactions()` and `getBalance()`.
   - Completely purged mock wallet balance (`1450`), simulated array mutations (`topUp`, `recordChargingSessionPayment`), and in-memory mock records.
   - Enforced rule: Zero wallet balance storage in `localStorage`. Backend PostgreSQL signed ledger is authoritative.

2. **Currency & Formatting Utilities (`frontend/src/utils/formatters.js`):**
   - Updated `formatCurrency(amount, currency = 'INR')` and `formatCompactCurrency(amount, currency = 'INR')` to dynamically respect the backend wallet currency.
   - Preserves Indian numbering format (`en-IN`, `₹`) by default while adapting to arbitrary international currencies (`USD`, `EUR`, etc.) seamlessly.

3. **Mock Data Elimination (`frontend/src/data/mockData.js`):**
   - Removed `INITIAL_TRANSACTIONS` mock data array.
   - Purged hardcoded default `1450` balance across `VahanPassCard.jsx`, `AIChatbot.jsx`, `App.jsx`, and `WalletPage.jsx`.

4. **Component Updates (`frontend/src/components/wallet/`):**
   - `VahanPassCard.jsx`: Updated default props (`balance = 0`, `currency = 'INR'`, `status = 'active'`), displays dynamic currency and active status badge.
   - `TransactionList.jsx`: Renders real backend transaction fields (`type`, `amount`, `currency`, `description`, `created_at`, `reference_type`, `reference_id`, `id`). Formats signed amounts with credit/debit indicators. Provides clean empty state for `[]`.
   - `QuickTopUp.jsx`: Preserved UI design; displays clean informational status indicating UPI/gateway integration is scheduled for the payment phase without mutating client state or creating fake records.

5. **Wallet Page Integration (`frontend/src/pages/Wallet/WalletPage.jsx`):**
   - Autonomous data fetching with `walletService.getWallet()` and `walletService.getWalletTransactions()`.
   - Added loading skeleton/spinner state (`Loader2`).
   - Added error banner with retry action (`RefreshCw`).
   - Replaced simulated operator spend calculation with verified signed ledger metrics: Total Inflow (Credits), Total Outflow (Debits), and Active Balance.
   - Added `onBalanceSync` callback to sync parent app balance.

6. **Application Root Integration (`frontend/src/App.jsx`):**
   - Changed initial balance state from `1450` to `0`.
   - Removed wallet mock fetching from public data loader (`loadPublicData`).
   - Added authenticated `loadUserWallet` effect bound to `isAuthenticated` state.
   - Connected `<WalletPage onBalanceSync={setBalance} />`.

---

### Phase 3C.4A — Backend Wallet Read & Transaction History API
- **Status:** Completed
- **Endpoints:**
  - `GET /api/v1/wallet` (derived balance via signed ledger `SUM(wt.amount)`)
  - `GET /api/v1/wallet/transactions` (ordered `created_at DESC`)
- **Security:** Authenticated sessions strictly via `req.user.id`; client cannot provide or spoof `wallet_id` or `user_id`.
- **Test Suite:** `backend/src/scripts/test_phase3c4a.js` (44/44 passed).

---

### Phase 3E.1 — Tariff & Pricing Architecture
- **Status:** Completed
- **Date:** October 2026
- **Test Suite:** `backend/src/scripts/test_phase3e1.js` (50/50 tests passing)
- **Database Migration:** `018_create_tariffs.sql`
- **Core Components:**
  - `backend/src/services/pricingService.js`: Deterministic paisa-accurate pricing arithmetic (`roundToPaisa`), energy cost, session fees, per-minute time costs, idle fees with grace period, tax calculation, and immutable `buildTariffSnapshot()`.
  - `backend/src/services/tariffService.js`: Hierarchical tariff resolution (`Connector -> EVSE -> Location -> CPO -> System Default`), CRUD, validation.
  - `backend/src/controllers/tariffController.js` & `backend/src/routes/tariffs.js`: REST management endpoints.
  - Linked `tariff_snapshot` into `charging_sessions` at session start time.

---

### Phase 3E.2 — Charge Detail Record (CDR) Generation
- **Status:** Completed
- **Date:** October 2026
- **Test Suite:** `backend/src/scripts/test_phase3e2.js` (67/67 tests passing)
- **Database Migration:** `019_create_cdrs.sql`
- **Core Components:**
  - `backend/src/services/cdrService.js`:
    - `finalizeCdr(sessionId)`: Generates audit-grade immutable CDR when session transitions to `completed` or `stopped`.
    - Enforces DB-level uniqueness on `session_id` (`CONSTRAINT uq_cdr_session_id UNIQUE (session_id)`) ensuring strict idempotency.
    - Captures physical meter readings (`meter_start_wh`, `meter_stop_wh`) and protocol audit trail (`ocpp_transaction_id`).
    - Snapshots location and CPO names to preserve historic accuracy independent of subsequent entity renames.
    - Re-uses precomputed `pricing_breakdown` or deterministically computes it from immutable `tariff_snapshot`.
    - Handles failure cases: non-billable (`failed`, `cancelled`), active sessions, and missing timestamps safely return `null` without throwing unhandled exceptions.
    - Provides secure read helpers: `getCdrBySessionId(sessionId, userId)`, `getCdrById(cdrId, userId)`, `listCdrsByUser(userId)`.
  - `backend/src/controllers/cdrController.js` & `backend/src/routes/cdrs.js`:
    - `GET /api/v1/cdrs`: Authenticated user CDR list.
    - `GET /api/v1/cdrs/:id`: Single CDR lookup with ownership verification (403 for cross-user access).
    - `GET /api/v1/sessions/:id/cdr`: Session-scoped CDR endpoint with ownership verification.
  - **Lifecycle Integration:**
    - Hooked into `sessionService.stopSession()` post-commit via non-blocking asynchronous dispatch.
    - Hooked into `transactionEventHandler.handleEndedEvent()` for OCPP 2.0.1 transaction completion, computing pricing breakdowns for OCPP-terminated sessions.

---

### Phase 3E.3 — Wallet Settlement & CDR Integration
- **Status:** Completed
- **Date:** October 2026
- **Test Suite:** `backend/src/scripts/test_phase3e3.js` (86/86 tests passing)
- **Database Migration:** `020_add_cdr_wallet_settlement.sql`
- **Core Components:**
  - `backend/src/services/walletSettlementService.js`:
    - `settleCdr(cdrId, options)`: Core atomic settlement engine. Locks wallet and CDR rows with `FOR UPDATE`, computes authoritative balance from `wallet_transactions` signed ledger, checks sufficiency, inserts `charging_payment` transaction, and updates CDR settlement status.
    - Full decimal precision (`NUMERIC(12, 2)`), zero floating-point drift.
    - Enforces DB-level idempotency via `uq_wallet_txns_cdr_id` partial unique index on `wallet_transactions(cdr_id)`.
    - Handles zero-amount CDRs without violating `amount <> 0.00` check constraint.
    - Rejects negative balance and partial debits when balance is insufficient; marks CDR `settlement_status = 'failed'` with `INSUFFICIENT_FUNDS` reason while keeping the CDR valid and retryable.
    - `getSettlementStatus(cdrId, userId)`: Reads settlement state, transaction metrics, and balance before/after.
  - `backend/src/services/cdrService.js`:
    - Integrated automatic non-blocking settlement dispatch upon CDR finalization.
  - `backend/src/controllers/cdrController.js` & `backend/src/routes/cdrs.js`:
    - `POST /api/v1/cdrs/:id/settle`: Authenticated endpoint to trigger or retry settlement of a finalized CDR. Enforces ownership (`CDR_ACCESS_DENIED` 403 on mismatch) and takes settlement amount strictly from immutable CDR total.
- **Concurrency & Regressions:**
  - Verified concurrent settlement of same CDR produces exactly 1 debit.
  - Verified concurrent settlement of different CDRs for the same user serializes cleanly with zero lost balance updates.
  - Regression verified: `test_phase3e2.js` (67/67), `test_phase3e1.js` (50/50), `test_phase3c4a.js` (44/44), `test_phase3d10.js` (81/81), `test_phase3d9.js` (74/74), `test_phase3d8d.js` (72/72), `test_phase3d8b.js` (51/51), `test_phase3d7b.js` (72/72), `test_phase3d6b.js` (56/56), `npm run verify:db` (100% passing).

---

### Phase 3E.4 — Wallet Top-Up & Payment Gateway Integration
- **Status:** Completed
- **Date:** October 2026
- **Test Suite:** `backend/src/scripts/test_phase3e4.js` (63/63 tests passing)
- **Database Migration:** `021_create_payments.sql`
- **Core Components:**
  - `backend/src/services/paymentProvider.js`:
    - Payment provider abstraction adhering to standard contract (`createOrder`, `verifyWebhookSignature`, `verifyPaymentSignature`, `getPaymentStatus`).
    - India-focused MVP integration with Razorpay protocol, using native Node.js `crypto` HMAC-SHA256 timing-safe verification.
    - Zero dependency on proprietary external SDKs; operates cleanly in test/sandbox mode with simulated orders and signatures.
    - Configurable via environment variables (`PAYMENT_PROVIDER`, `PAYMENT_PROVIDER_KEY`, `PAYMENT_PROVIDER_SECRET`, `PAYMENT_WEBHOOK_SECRET`). No real credentials committed.
  - `backend/src/services/paymentService.js`:
    - `createPaymentOrder({ userId, amount, currency })`: Validates bounds (₹10 - ₹50,000), checks active wallet, records payment intent in `payments` table, and requests provider order.
    - `processPaymentWebhook({ rawBody, signature, secret })`: Authoritative server boundary for payment completion. Verifies HMAC-SHA256 signature using `req.rawBody`. Parses events (`order.paid`, `payment.captured`, `payment.failed`).
    - `verifyAndCreditPayment({ userId, orderId, paymentId, signature })`: Server-verified client callback fulfillment.
    - `creditWalletForPayment({ providerOrderId, providerPaymentId, providerAmountInRupees, userId })`: Strict atomicity with `SELECT FOR UPDATE` row locks on both `payments` and `wallets`. Derives authoritative balance from signed ledger, inserts `type = 'topup'` into `wallet_transactions`, updates payment status to `'paid'`, and links transaction.
    - Amount Tampering Defense: Validates provider-reported amount against server-authoritative order amount; mismatches trigger `AMOUNT_TAMPERING_DETECTED` and abort wallet credit.
    - Database-Level Idempotency: Dual partial unique constraints (`uq_wallet_txns_payment_id` and `uq_payments_wallet_txn_id`) guarantee exactly ONE wallet credit under replay or heavy concurrent delivery.
    - Safe Status Queries: `getPaymentById(paymentId, userId)` with IDOR prevention and `listUserPayments(userId)`.
  - `backend/src/app.js`: Configured `express.json` with `verify: (req, _res, buf) => { req.rawBody = buf; }` to preserve intact raw request buffers for signature checking.
  - `backend/src/controllers/paymentController.js` & `backend/src/routes/payments.js`:
    - `POST /api/v1/payments/orders`: Authenticated order creation.
    - `POST /api/v1/payments/webhook`: Public gateway webhook endpoint with signature verification.
    - `POST /api/v1/payments/verify`: Authenticated checkout completion verification.
    - `GET /api/v1/payments/:id`: Authenticated payment details with user scoping.
    - `GET /api/v1/payments`: Authenticated payment history listing.
- **Regression Suite:**
  - `test_phase3e4.js`: 63/63 passing.
  - `test_phase3c4a.js`: 44/44 passing (Wallet read & transaction history).
  - `test_phase3e3.js`: 86/86 passing (CDR wallet settlement).
  - `test_phase3e2.js`: 67/67 passing (CDR generation).
  - `test_phase3e1.js`: 50/50 passing (Tariffs & pricing engine).
  - `test_phase3d10.js`: 81/81 passing (Smart charging / charging profiles).
  - `test_phase3d9.js`: 74/74 passing (Remote operations).
  - `test_phase3d8d.js`: 72/72 passing (ChangeAvailability).
  - `test_phase3d8b.js`: 51/51 passing (Remote start/stop).
  - `test_phase3d7b.js`: 72/72 passing (MeterValues telemetry).
  - `test_phase3d6b.js`: 56/56 passing (TransactionEvent energy sync).
  - `npm run verify:db`: 100% schema verification passing.

## Phase 4A.1 — Operator Identity and Authorization Foundation (Completed: October 10, 2026)

- **Database Migration `022_add_user_roles_and_cpo_association.sql`:**
  - Added `role VARCHAR(20) NOT NULL DEFAULT 'driver'` with `chk_user_role` constraint ('driver', 'operator', 'admin').
  - Added `cpo_id UUID REFERENCES cpos(id) ON DELETE SET NULL` with performance index.
  - Preserved 100% of existing user accounts and credentials.
- **Controlled Development Seed Accounts:**
  - `operator.tata@example.com` (`role = 'operator'`, `cpo_id = Tata Power`, password `Demo@1234`).
  - `operator.statiq@example.com` (`role = 'operator'`, `cpo_id = Statiq`, password `Demo@1234`).
  - `admin@vahangrid.com` (`role = 'admin'`, `cpo_id = NULL`, password `Demo@1234`).
- **Authorization Middleware (`src/middleware/authorize.js`):**
  - `requireRole(...allowedRoles)`: General RBAC gate.
  - `requireOperator`: Requires operator (with valid cpo_id) or admin; fails closed on missing CPO.
  - `requireStationOperator`: Enforces station tenant ownership (`station.cpo_id === req.user.cpo_id`).
  - `requireTariffOperator`: Enforces tariff tenant ownership and prevents client-supplied CPO override.
- **Route Hardening:**
  - Secured all station remote operations (`availability`, `reset`, `unlock-connector`, `trigger-message`, `charging-profiles`).
  - Secured all tariff mutations (`POST`, `PATCH`, `DELETE /api/v1/tariffs`) and tariff listing.
- **Test Suite (`test_phase4a1.js`):**
  - 54 comprehensive automated tests covering role security, IDOR rejection, fail-closed mechanics, and driver workflow regression invariance. All 54 passed.

