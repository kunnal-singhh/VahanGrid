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

---

## Detailed Milestone Records

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
