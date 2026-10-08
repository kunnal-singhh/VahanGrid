# VahanGrid Database Architecture & Domain Model

> **Authoritative Specification: Phase 2B — Core Database Schema**  
> Engine: PostgreSQL 18+ with PostGIS 3.6+ Spatial Extension

---

## 1. Domain Model Overview

VahanGrid models the electric vehicle mobility and charging infrastructure of India. Rather than creating generic, frontend-shaped mock tables, the schema reflects the real-world standards used across modern EV networks (including **OCPI 2.2.1** and **OCPP 2.0.1** architectural patterns).

```
┌─────────────────┐
│      Users      │
└────────┬────────┘
         │ 1:1
         ├───────────────────────────────┐
         │ 1:N                           │
┌────────▼────────┐             ┌────────▼────────┐
│    Vehicles     │             │     Wallets     │
└────────┬────────┘             └────────┬────────┘
         │                               │ 1:N
         │                               ▼
         │                      ┌─────────────────┐
         │                      │   Wallet Txns   │
         │                      │ (Signed Ledger) │
         │                      └─────────────────┘
         │
         │ 1:N (via sessions)
         ▼
┌────────────────────────────────────────────────────────┐
│                   Charging Sessions                    │
│                        (CDRs)                          │
└────────────────────────┬───────────────────────────────┘
                         │ N:1
                         ▼
┌─────────────────┐             ┌─────────────────┐
│      CPOs       │ 1:N         │   Connectors    │
│  ( Tata, etc.)  ├────────┐    │  (CCS2, Type2)  │
└─────────────────┘        │    └────────▲────────┘
                           │             │ N:1
                    ┌──────▼──────┐      │
                    │  Locations  │ 1:N ┌┴────────────────┐
                    │ (PostGIS Pt)├────►│      EVSEs      │
                    └─────────────┘     │(Charging Posts) │
                                        └─────────────────┘
```

---

## 2. Core Entities

### 1. `cpos` (Charge Point Operators)
Represents the charging network brand or operating entity (e.g., Tata Power EZ Charge, Statiq, ChargeZone, Jio-bp pulse, Kazam).
- **Key field:** `short_code` (e.g. `TATA_EZ`, `STATIQ`, `JIO_BP`) — used as the operator prefix for OCPI roaming and global EVSE IDs.
- **Constraints:** Unique `short_code`, status lifecycle check.

### 2. `locations` (Charging Stations / Hubs)
A physical geographic site where charging equipment is installed (e.g., Connaught Place Radial Road 2, BKC Mumbai, Mile 42 Food Mall on Mumbai-Pune Expressway).
- **Key field:** `location geography(Point, 4326)` — authoritative PostGIS spatial coordinate.
- **Trigger:** `trg_sync_locations_point` automatically syncs `location` whenever `latitude` and `longitude` are inserted or updated.
- **Index:** `GIST` index `idx_locations_location_gist` for sub-millisecond radius searches (`ST_DWithin`) and corridor queries (`ST_Distance`).
- **Provenance:** `source_type` (`government`, `cpo`, `osm`, `ocpi`, `simulated`, `vahangrid`) tracks the origin of each location record.

### 3. `evses` (Electric Vehicle Supply Equipment)
An individual physical charging cabinet, kiosk, or post located within a charging station.
- **Key field:** `evse_uid` — unique identifier for the EVSE within that location (e.g., `IN*TATA*E01`).
- An EVSE can supply power to one or multiple vehicles and holds physical references (e.g., Bay 1, Pillar G-4).

### 4. `connectors` (Plugs / Sockets)
The actual physical interface cable or socket that attaches to the vehicle.
- **Key fields:** `standard` (`CCS2`, `Type 2`, `Bharat DC-001`, `CHAdeMO`), `max_power_kw`, `power_type` (`DC`, `AC_1_PHASE`, `AC_3_PHASE`).
- Multiple connectors can exist on a single EVSE (e.g. a dual-gun 120kW DC fast charger has two CCS2 connectors, or a triple-standard unit with CCS2, CHAdeMO, and Type 2).

### 5. `users`
EV drivers, fleet operators, or system administrators.
- **Key fields:** `email` (unique, format verified), `phone` (unique), `password_hash` (reserved for Phase 3 authentication).

### 6. `vehicles`
The EV models registered by users in their digital garage.
- **Key fields:** `battery_capacity_kwh`, `usable_battery_capacity_kwh`, `connector_type`, `max_dc_power_kw`, `max_ac_power_kw`.
- All physical units are stored as `NUMERIC` with positive constraints.

### 7. `wallets`
The user's unified VahanPass digital wallet (1:1 with user).
- **Core Principle:** **No mutable balance column is stored here.**
- Storing an editable `balance` integer or float invites race conditions, drift, and balance tampering. Instead, the balance is derived directly from the transaction ledger.

### 8. `wallet_transactions` (Signed Financial Ledger)
An immutable, append-only ledger of financial events.
- **Signed Amount:**
  - Positive (`+₹2,000.00`) = Credit (UPI/Card top-up, refund, cashback).
  - Negative (`-₹490.00`) = Debit (charging session settlement, reservation fee).
- **Current Balance Query:**
  ```sql
  SELECT COALESCE(SUM(amount), 0) AS balance
  FROM wallet_transactions
  WHERE wallet_id = $1;
  ```
- **Constraint:** `amount <> 0`, foreign key `ON DELETE RESTRICT` (financial records can never be orphaned or deleted).

### 9. `charging_sessions` (Charge Detail Records — CDRs)
Historical or active charging transactions.
- **Key fields:** `start_soc`, `end_soc` (0–100%), `energy_kwh`, `duration_seconds`, `cost_amount`, `status`, `external_session_id`.
- Foreign keys ensure integrity: `user_id` and `connector_id` use `ON DELETE RESTRICT` so charging history is permanently auditable; `vehicle_id` uses `ON DELETE SET NULL` so decommissioning a car does not delete historical charging logs.

---

## 3. Why Location, EVSE, and Connector Are Separate Concepts

A frequent mistake in early EV prototypes is flattening everything into a single `"station"` table:

```
❌ Bad/Flattened:
Station { name, lat, lng, charger_type, kw }
```

In the physical world and in international EV standards (OCPI / OCPP), a charging station is a **three-tier hierarchy**:

```
Location (Charging Station / Park)
   └── EVSE 1 (Physical charging post/cabinet)
   │     ├── Connector 1 (CCS2 120kW gun A)
   │     └── Connector 2 (CCS2 120kW gun B)
   └── EVSE 2 (AC Destination Charger)
         └── Connector 1 (Type 2 22kW socket)
```

### Why this separation is mandatory:
1. **Multi-Gun Cabinets:** High-power DC fast chargers (e.g. 120kW / 180kW) commonly have **two CCS2 guns** connected to a single power converter. If Car A plugs into Gun 1, Gun 2 might be throttled or unavailable. Flattening them into one row makes representing shared power or connector-level availability impossible.
2. **Different Connector Standards on One Post:** A single cabinet often provides one DC fast cable (CCS2) and one AC cable (Type 2), or a legacy Bharat DC-001 plug. Each has different voltages, currents, power ratings, and pricing.
3. **OCPP / OCPI Alignment:** 
   - **OCPP 2.0.1** talks to an `EVSE` and targets an individual `ConnectorId`.
   - **OCPI 2.2.1** publishes `locations`, which contain `evses`, which contain `connectors`.
   By structuring VahanGrid this way from day one, future OCPI roaming and OCPP bridge integration will connect natively without requiring schema refactoring.

---

## 4. Primary Key & Timestamp Strategy

- **Primary Keys:** UUID v4 generated via PostgreSQL native `gen_random_uuid()` (`pgcrypto` extension). Avoids sequential ID enumeration attacks and simplifies future offline/distributed sync.
- **Timestamps:** `TIMESTAMPTZ` (Timestamp with Time Zone) for all datetime fields, defaulted to `CURRENT_TIMESTAMP`. This avoids UTC/IST timezone ambiguity when reconciling sessions across CPOs.

---

## 5. Spatial Queries (PostGIS)

All spatial queries use the `geography(Point, 4326)` column on `locations`:

### Find stations within 30 km of a user's location:
```sql
SELECT 
  l.id,
  l.name,
  c.name AS cpo_name,
  l.city,
  ROUND((ST_Distance(l.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000.0)::numeric, 2) AS distance_km
FROM locations l
JOIN cpos c ON l.cpo_id = c.id
WHERE ST_DWithin(l.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 30000)
ORDER BY distance_km ASC;
```

Thanks to the `idx_locations_location_gist` spatial index, this query uses a R-tree bounding box search in logarithmic time ($O(\log N)$) rather than a table scan.

---

## 6. Relationship with Phase 3A REST APIs

The Phase 3A REST API (`/api/v1/stations`, `/api/v1/stations/:id`, `/api/v1/stations/nearby`) surfaces this database architecture directly to client applications:

- **Entity Assembly:** Each `location` record is joined with its parent `cpo`, while its child `evses` and grandchild `connectors` are aggregated into structured JSON arrays in a single, high-performance parameterized query via PostgreSQL's `json_agg()`.
- **Coordinate Transparency:** The PostGIS `geography` column is unpacked to standard JSON `latitude` and `longitude` numbers for map renderers (Leaflet).
- **Spatial Acceleration:** The `/api/v1/stations/nearby` endpoint applies `ST_DWithin` and `ST_Distance` on `locations.location` to return proximity-ranked charging hubs without requiring client-side geometric calculations.

---

## 7. Tariffs & Charge Detail Records (CDRs)

### Tariffs Table (`tariffs` - Migration `018_create_tariffs.sql`)
Supports scoped pricing rules with precedence hierarchy:
1. `connector_id` (Most specific)
2. `evse_id`
3. `location_id`
4. `cpo_id`
5. System Default (All FKs NULL)

Columns:
- `id`: UUID PRIMARY KEY
- Scoping FKs: `cpo_id`, `location_id`, `evse_id`, `connector_id`
- Rates: `price_per_kwh`, `session_fee`, `price_per_min`, `idle_fee_per_min` (all `NUMERIC(10,2)`)
- Rules: `idle_grace_minutes` (INT), `tax_rate` (`NUMERIC(5,4)` e.g. 0.1800)
- Temporal: `valid_from`, `valid_to`, `is_active`

### Charge Detail Records Table (`cdrs` - Migration `019_create_cdrs.sql`)
Finalized immutable billing records generated when a session terminates (`completed` or `stopped`).
- **Idempotency:** Enforced via `CONSTRAINT uq_cdr_session_id UNIQUE (session_id)`.
- **Integrity:** `session_id`, `user_id`, `connector_id`, `evse_id`, `location_id`, `cpo_id` linked via FKs with `ON DELETE RESTRICT`.
- **Snapshots:** Copies `cpo_name`, `location_name`, `location_city`, `connector_standard`, `tariff_snapshot` (JSONB), and `pricing_breakdown` (JSONB) so post-facto entity renames or tariff revisions cannot alter settled bills.
- **Precision:** `energy_kwh NUMERIC(8,3)`, `total_amount NUMERIC(10,2)` (never float).

