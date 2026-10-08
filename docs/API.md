# VahanGrid REST API Specification

> **Base URL:** `http://localhost:3001/api/v1`  
> **Content-Type:** `application/json`  
> **Versioning:** `/api/v1`

---

## 1. System & Health

### `GET /api/v1/health`
Checks the operational status of the API server, database connectivity, and PostGIS availability.

#### Request
```http
GET /api/v1/health HTTP/1.1
Host: localhost:3001
```

#### Response (200 OK)
```json
{
  "success": true,
  "service": "VahanGrid API",
  "status": "healthy",
  "database": "connected",
  "postgis": "enabled",
  "timestamp": "2026-09-29T01:52:57.963Z"
}
```

#### Response (503 Service Unavailable)
*Returned when PostgreSQL is unreachable.*
```json
{
  "success": false,
  "service": "VahanGrid API",
  "status": "unhealthy",
  "database": "disconnected",
  "error": "connect ECONNREFUSED 127.0.0.1:5432",
  "timestamp": "2026-09-29T01:52:57.963Z"
}
```

---

## 2. Stations (Locations) API

All station records represent physical charging hubs stored in PostgreSQL with PostGIS spatial geography points.

### `GET /api/v1/stations`
Retrieves all registered charging stations with nested CPO, EVSE, and connector details.

#### Request
```http
GET /api/v1/stations HTTP/1.1
Host: localhost:3001
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "f0000001-0000-0000-0000-000000000001",
      "name": "Connaught Place Fast Hub",
      "address_line1": "Block B, Radial Road 2, Inner Circle",
      "address_line2": "Near Rajiv Chowk Metro Gate 5",
      "city": "New Delhi",
      "state": "Delhi",
      "postal_code": "110001",
      "country_code": "IN",
      "timezone": "Asia/Kolkata",
      "latitude": 28.6315,
      "longitude": 77.2167,
      "status": "active",
      "source_type": "simulated",
      "last_verified_at": "2026-09-29T01:24:13.295Z",
      "created_at": "2026-09-29T01:24:13.295Z",
      "updated_at": "2026-09-29T01:24:13.295Z",
      "cpo": {
        "id": "a0000001-0000-0000-0000-000000000001",
        "name": "Tata Power EZ Charge",
        "short_code": "TATA_EZ",
        "website": "https://www.tatapower.com/ev-charging",
        "support_phone": "+9118002095161",
        "support_email": "customercare@tatapower.com"
      },
      "evses": [
        {
          "id": "e1000001-0000-0000-0000-000000000001",
          "evse_uid": "IN*TATA*E01",
          "evse_code": "CP-DEL-01",
          "status": "available",
          "floor_level": "0",
          "physical_reference": "Bay 1 (North)",
          "max_power_kw": 60,
          "connectors": [
            {
              "id": "c1000001-0000-0000-0000-000000000001",
              "connector_id": "1",
              "standard": "CCS2",
              "format": "cable",
              "power_type": "DC",
              "max_voltage_v": 500,
              "max_amperage_a": 150,
              "max_power_kw": 60,
              "status": "available"
            },
            {
              "id": "c1000001-0000-0000-0000-000000000002",
              "connector_id": "2",
              "standard": "Bharat DC-001",
              "format": "cable",
              "power_type": "DC",
              "max_voltage_v": 100,
              "max_amperage_a": 200,
              "max_power_kw": 15,
              "status": "available"
            }
          ]
        }
      ]
    }
  ],
  "meta": {
    "count": 6
  }
}
```

---

### `GET /api/v1/stations/:id`
Retrieves detailed information for a single charging station by its UUID.

#### Request
```http
GET /api/v1/stations/f0000001-0000-0000-0000-000000000001 HTTP/1.1
Host: localhost:3001
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "f0000001-0000-0000-0000-000000000001",
    "name": "Connaught Place Fast Hub",
    "city": "New Delhi",
    "latitude": 28.6315,
    "longitude": 77.2167,
    "cpo": {
      "name": "Tata Power EZ Charge",
      "short_code": "TATA_EZ"
    },
    "evses": [...]
  }
}
```

#### Response (404 Not Found)
*Returned when the station ID does not exist.*
```json
{
  "success": false,
  "error": {
    "code": "STATION_NOT_FOUND",
    "message": "Station with ID '00000000-0000-0000-0000-000000000000' was not found."
  }
}
```

#### Response (400 Bad Request)
*Returned when the station ID is not a valid UUID format.*
```json
{
  "success": false,
  "error": {
    "code": "INVALID_ID",
    "message": "The requested station ID must be a valid UUID."
  }
}
```

---

### `GET /api/v1/stations/nearby`
Finds charging stations within a radial distance from a given GPS coordinate using PostGIS spatial indexing (`ST_DWithin` and `ST_Distance`). Results are sorted nearest first.

#### Query Parameters
| Parameter | Type | Required | Default | Validation |
|---|---|---|---|---|
| `lat` | number | **Yes** | — | Latitude between `-90.0` and `90.0` |
| `lng` | number | **Yes** | — | Longitude between `-180.0` and `180.0` |
| `radius_km` | number | No | `5` | Radius in kilometers (`> 0` and `≤ 100`) |

#### Request
```http
GET /api/v1/stations/nearby?lat=28.6315&lng=77.2167&radius_km=50 HTTP/1.1
Host: localhost:3001
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "f0000001-0000-0000-0000-000000000001",
      "name": "Connaught Place Fast Hub",
      "city": "New Delhi",
      "latitude": 28.6315,
      "longitude": 77.2167,
      "distance_km": 0,
      "cpo": {
        "name": "Tata Power EZ Charge",
        "short_code": "TATA_EZ"
      },
      "evses": [...]
    },
    {
      "id": "f0000001-0000-0000-0000-000000000005",
      "name": "Cyber Hub Fast Charging Zone",
      "city": "Gurugram",
      "latitude": 28.495,
      "longitude": 77.0895,
      "distance_km": 19.59,
      "cpo": {
        "name": "Tata Power EZ Charge",
        "short_code": "TATA_EZ"
      },
      "evses": [...]
    }
  ],
  "meta": {
    "count": 2,
    "center": {
      "latitude": 28.6315,
      "longitude": 77.2167
    },
    "radius_km": 50
  }
}
```

#### Validation Error Responses (400 Bad Request)
```json
{
  "success": false,
  "error": {
    "code": "INVALID_QUERY",
    "message": "'lat' must be a valid number between -90 and 90."
  }
}
```
```json
{
  "success": false,
  "error": {
    "code": "INVALID_QUERY",
    "message": "'radius_km' must be a positive number greater than 0 and at most 100."
  }
}
```

---

## 3. Spatial Query Mechanics

The nearby search leverages the PostgreSQL **GIST** index on `locations.location`:

```sql
WHERE ST_DWithin(
  location,
  ST_SetSRID(ST_MakePoint($longitude, $latitude), 4326)::geography,
  $radiusMeters
)
ORDER BY ST_Distance(location, ST_SetSRID(ST_MakePoint($longitude, $latitude), 4326)::geography) ASC;
```

- Coordinates are strictly ordered `(longitude, latitude)` to match the standard GIS convention $(X, Y)$.
- Distances are evaluated directly on the WGS 84 ellipsoidal surface in meters, eliminating flat-Earth distortion across Indian latitudes.

---

## 3. Authentication

Authentication uses **HTTP-only JWT cookies**. The cookie (`vg_token`) is set automatically on login/register and cleared on logout. It is not accessible to JavaScript (XSS protection).

> **Cookie name:** `vg_token`  
> **Cookie flags:** `HttpOnly; SameSite=Lax; Path=/` (+ `Secure` in production)  
> **Token lifetime:** 7 days (configurable via `JWT_EXPIRES_IN`)

---

### `POST /api/v1/auth/register`

Create a new user account. Automatically creates a linked INR wallet in the same database transaction.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Full name (min 2 characters) |
| `email` | string | ✅ | Valid email address (normalized to lowercase) |
| `phone` | string | ❌ | Indian mobile number (e.g. `9876543210` or `+919876543210`) |
| `password` | string | ✅ | Minimum 8 characters |

```json
{
  "name": "Arjun Mehta",
  "email": "arjun@example.com",
  "phone": "9876543210",
  "password": "SecurePass123!"
}
```

#### Response `201 Created`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "a1b2c3d4-...",
      "name": "Arjun Mehta",
      "email": "arjun@example.com",
      "phone": "9876543210",
      "created_at": "2026-09-29T00:00:00.000Z",
      "updated_at": "2026-09-29T00:00:00.000Z"
    }
  },
  "meta": {
    "message": "Registration successful. You are now logged in."
  }
}
```

The `vg_token` cookie is also set on the response — the user is logged in immediately after registration.

#### Error Responses

| Status | `error.code` | Cause |
|--------|-------------|-------|
| `400` | `VALIDATION_ERROR` | Missing / invalid fields. `error.details` is an array of messages. |
| `409` | `DUPLICATE_EMAIL` | Email already registered |
| `409` | `DUPLICATE_PHONE` | Phone already registered |

---

### `POST /api/v1/auth/login`

Authenticate with email and password.

#### Request Body

```json
{
  "email": "arjun@example.com",
  "password": "SecurePass123!"
}
```

#### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "a1b2c3d4-...",
      "name": "Arjun Mehta",
      "email": "arjun@example.com",
      "phone": "9876543210",
      "created_at": "2026-09-29T00:00:00.000Z",
      "updated_at": "2026-09-29T00:00:00.000Z"
    }
  },
  "meta": {
    "message": "Login successful."
  }
}
```

The `vg_token` cookie is set on the response.

#### Error Responses

| Status | `error.code` | Cause |
|--------|-------------|-------|
| `400` | `VALIDATION_ERROR` | Missing email or password |
| `401` | `INVALID_CREDENTIALS` | Wrong email or password (same code for both — prevents email enumeration) |

---

### `POST /api/v1/auth/logout`

Clears the authentication cookie. No body required. Returns `200` even if no cookie was present.

#### Response `200 OK`

```json
{
  "success": true,
  "data": null,
  "meta": {
    "message": "You have been logged out successfully."
  }
}
```

---

### `GET /api/v1/auth/me`

Returns the currently authenticated user's profile. Requires a valid `vg_token` cookie.

#### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "a1b2c3d4-...",
      "name": "Arjun Mehta",
      "email": "arjun@example.com",
      "phone": "9876543210",
      "created_at": "2026-09-29T00:00:00.000Z",
      "updated_at": "2026-09-29T00:00:00.000Z"
    }
  }
}
```

#### Error Responses

| Status | `error.code` | Cause |
|--------|-------------|-------|
| `401` | `MISSING_TOKEN` | No `vg_token` cookie present |
| `401` | `TOKEN_EXPIRED` | JWT has expired — user must log in again |
| `401` | `INVALID_TOKEN` | JWT signature is invalid |
| `401` | `USER_NOT_FOUND` | Token is valid but user no longer exists in the database |

---

### Authentication Security Notes

- **`password_hash` is never returned** in any API response.
- **Email enumeration is prevented**: login returns `INVALID_CREDENTIALS` for both wrong email and wrong password.
- **Timing attack mitigation**: a dummy bcrypt compare runs even when the user is not found, so response times are consistent.
- **Client-supplied user IDs are never trusted**: `req.user` is populated exclusively from the verified JWT and a fresh DB lookup.
- **SQL injection**: all queries use parameterized SQL (`$1`, `$2`, …). No string concatenation.

---

## 4. User Profile

All user profile endpoints require a valid `vg_token` cookie. The user identity is always derived from the token — never from a client-supplied ID.

---

### `GET /api/v1/users/me`

Returns the authenticated user's safe profile.

#### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "a1b2c3d4-...",
      "name": "Arjun Mehta",
      "email": "arjun@example.com",
      "phone": "9876543210",
      "created_at": "2026-09-29T00:00:00.000Z",
      "updated_at": "2026-09-29T00:00:00.000Z"
    }
  }
}
```

| Status | `error.code` | Cause |
|--------|-------------|-------|
| `401` | `MISSING_TOKEN` | No cookie |
| `404` | `USER_NOT_FOUND` | Token valid but user deleted |

---

### `PATCH /api/v1/users/me`

Update allowed profile fields. Only `name` and `phone` may be changed. Email changes are not supported in this phase.

#### Request Body (all fields optional)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Full name (min 2 characters) |
| `phone` | string \| null | Indian mobile number, or `null` to remove |

```json
{ "name": "Arjun K. Mehta", "phone": "9123456789" }
```

#### Response `200 OK`

Returns the updated user object (same shape as `GET /users/me`).

| Status | `error.code` | Cause |
|--------|-------------|-------|
| `400` | `VALIDATION_ERROR` | Invalid name or phone format |
| `400` | `NO_UPDATES` | No recognized fields in request body |
| `401` | `MISSING_TOKEN` | Not authenticated |
| `409` | `DUPLICATE_PHONE` | Phone already used by another account |

---

## 5. Vehicles

All vehicle endpoints require a valid `vg_token` cookie. **Authorization is enforced at the database layer** — every query includes `AND user_id = <authenticated user id>`, preventing any cross-user access (IDOR protection).

**Accepted `connector_type` values:** `CCS2`, `CCS1`, `CHAdeMO`, `Type2`, `Type1`, `Bharat DC-001`, `Bharat AC-001`, `GBT_AC`, `GBT_DC`

---

### `GET /api/v1/vehicles`

List all vehicles belonging to the authenticated user.

#### Response `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": "7d195f39-...",
      "user_id": "a1b2c3d4-...",
      "manufacturer": "Tata Motors",
      "model": "Nexon EV",
      "variant": "Max",
      "battery_capacity_kwh": 40.5,
      "usable_battery_capacity_kwh": 37.0,
      "connector_type": "CCS2",
      "max_ac_power_kw": 7.2,
      "max_dc_power_kw": 50.0,
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "meta": { "count": 1 }
}
```

---

### `POST /api/v1/vehicles`

Create a new vehicle for the authenticated user.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `manufacturer` | string | ✅ | e.g. `"Tata Motors"` |
| `model` | string | ✅ | e.g. `"Nexon EV"` |
| `variant` | string | ❌ | e.g. `"Max"` |
| `battery_capacity_kwh` | number | ✅ | Must be > 0 |
| `usable_battery_capacity_kwh` | number | ❌ | Must be > 0 and ≤ battery_capacity_kwh |
| `connector_type` | string | ✅ | One of the accepted values above |
| `max_ac_power_kw` | number | ❌ | Must be ≥ 0 |
| `max_dc_power_kw` | number | ❌ | Must be ≥ 0 |

#### Response `201 Created`

Returns the created vehicle object.

| Status | `error.code` | Cause |
|--------|-------------|-------|
| `400` | `VALIDATION_ERROR` | Missing required fields or invalid values |
| `401` | `MISSING_TOKEN` | Not authenticated |

---

### `GET /api/v1/vehicles/:id`

Get a specific vehicle by UUID. Returns `404` if the vehicle does not exist **or** belongs to a different user.

#### Response `200 OK`

Returns the vehicle object.

| Status | `error.code` | Cause |
|--------|-------------|-------|
| `400` | `INVALID_ID` | `:id` is not a valid UUID |
| `401` | `MISSING_TOKEN` | Not authenticated |
| `404` | `VEHICLE_NOT_FOUND` | Not found or not owned by authenticated user |

---

### `PATCH /api/v1/vehicles/:id`

Update allowed fields of a vehicle. All fields are optional (at least one must be provided). Returns `404` if not found or not owned.

#### Request Body (all optional)

Same fields as `POST`, all optional. At least one must be provided.

#### Response `200 OK`

Returns the updated vehicle object.

| Status | `error.code` | Cause |
|--------|-------------|-------|
| `400` | `VALIDATION_ERROR` | Invalid field values |
| `400` | `NO_UPDATES` | Empty body / no recognized fields |
| `401` | `MISSING_TOKEN` | Not authenticated |
| `404` | `VEHICLE_NOT_FOUND` | Not found or not owned |

---

### `DELETE /api/v1/vehicles/:id`

Delete a vehicle. Returns `404` if not found or not owned.

#### Response `200 OK`

```json
{
  "success": true,
  "data": null,
  "meta": { "message": "Vehicle deleted successfully." }
}
```

| Status | `error.code` | Cause |
|--------|-------------|-------|
| `400` | `INVALID_ID` | `:id` is not a valid UUID |
| `401` | `MISSING_TOKEN` | Not authenticated |
| `404` | `VEHICLE_NOT_FOUND` | Not found or not owned |

---

### Vehicle Authorization Notes

- **IDOR prevention**: every SQL query for a specific vehicle includes `AND user_id = $<authenticated_user_id>`. Even if a malformed request sends the wrong vehicle ID, the DB query returns 0 rows — not a 403, but a 404 (to avoid revealing existence of another user's resource).
- **user_id in body is ignored**: the service always uses `req.user.id` from the verified JWT.

---

## 5. Charging Sessions API (Phase 3B.3)

All session endpoints represent the application-level charging lifecycle in PostgreSQL.

> **CRITICAL ARCHITECTURAL LIMITATION:**  
> This phase implements application-level session management only. It does **not** communicate with real charger hardware or protocol engines (OCPP 2.0.1, OCPI 2.2.1, MQTT). Live telemetry (real-time energy delivery and dynamic billing) will be integrated in subsequent phases. `energy_kwh` and `cost_amount` remain at schema defaults until charger hardware communication is active.

### Authentication
All session endpoints require authentication via:
- HTTP-only cookie `vg_token`, OR
- Header `Authorization: Bearer <token>`

---

### `POST /api/v1/sessions/start`

Initiates an active charging session on an available connector using an owned vehicle.

#### Request Body
```json
{
  "connector_id": "c1000001-0000-0000-0000-000000000007",
  "vehicle_id": "7d195f39-df2f-48e3-8637-6b934e984539"
}
```

#### Pre-conditions Enforced:
1. User is authenticated (`req.user.id`).
2. Vehicle exists and belongs to the authenticated user.
3. Connector exists and is attached to a valid EVSE & location hierarchy.
4. Connector status is `'available'`.
5. Authenticated user does not already have an active/pending session.
6. Connector does not already have an active/pending session.
7. Atomic row-lock (`SELECT FOR UPDATE`) prevents concurrent double-booking.
8. On success, sets connector status to `'charging'` and creates a session with status `'active'`.

#### Response `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "4a761ef2-bb30-4e38-9524-74714bf390f7",
    "user_id": "b0000001-0000-0000-0000-000000000001",
    "vehicle_id": "7d195f39-df2f-48e3-8637-6b934e984539",
    "connector_id": "c1000001-0000-0000-0000-000000000007",
    "started_at": "2026-09-29T13:06:10.123Z",
    "ended_at": null,
    "start_soc": null,
    "end_soc": null,
    "energy_kwh": 0,
    "duration_seconds": 0,
    "cost_amount": 0,
    "currency": "INR",
    "status": "active",
    "external_session_id": null,
    "created_at": "2026-09-29T13:06:10.123Z",
    "updated_at": "2026-09-29T13:06:10.123Z",
    "vehicle": {
      "id": "7d195f39-df2f-48e3-8637-6b934e984539",
      "manufacturer": "Tata",
      "model": "Nexon EV",
      "variant": null,
      "battery_capacity_kwh": 40.5,
      "connector_type": "CCS2"
    },
    "connector": {
      "id": "c1000001-0000-0000-0000-000000000007",
      "connector_id": "1",
      "standard": "CCS2",
      "format": "cable",
      "power_type": "DC",
      "max_power_kw": 60,
      "status": "charging"
    },
    "evse": {
      "id": "e1000001-0000-0000-0000-000000000005",
      "evse_uid": "IN*STATIQ*E01",
      "evse_code": "BLR-KOR-01",
      "max_power_kw": 60,
      "physical_reference": "Bay 1"
    },
    "location": {
      "id": "f0000001-0000-0000-0000-000000000002",
      "name": "Koramangala Tech Park Hub",
      "address_line1": "80 Feet Road, 4th Block, Koramangala",
      "city": "Bengaluru",
      "state": "Karnataka",
      "latitude": 12.9352,
      "longitude": 77.6245
    },
    "cpo": {
      "id": "a0000001-0000-0000-0000-000000000002",
      "name": "Statiq EV",
      "short_code": "STATIQ"
    }
  }
}
```

| Status | `error.code` | Cause |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Missing `connector_id` or `vehicle_id` |
| `400` | `INVALID_UUID` | Invalid UUID format |
| `401` | `MISSING_TOKEN` | Not authenticated |
| `403` | `VEHICLE_NOT_OWNED` | Vehicle does not belong to the user |
| `404` | `VEHICLE_NOT_FOUND` | Vehicle does not exist |
| `404` | `CONNECTOR_NOT_FOUND` | Connector does not exist |
| `409` | `CONNECTOR_UNAVAILABLE` | Connector is not in 'available' status |
| `409` | `SESSION_ALREADY_ACTIVE` | User already has an active session |
| `409` | `CONNECTOR_IN_USE` | Connector is occupied by another session |
| `409` | `CONCURRENCY_CONFLICT` | Concurrent race condition detected |

---

### `GET /api/v1/sessions/active`

Returns the current active or pending charging session for the authenticated user with nested hierarchy.

#### Response `200 OK` (Active session exists)
```json
{
  "success": true,
  "data": {
    "id": "4a761ef2-bb30-4e38-9524-74714bf390f7",
    "user_id": "b0000001-0000-0000-0000-000000000001",
    "status": "active",
    "started_at": "2026-09-29T13:06:10.123Z",
    "vehicle": { ... },
    "connector": { ... },
    "evse": { ... },
    "location": { ... },
    "cpo": { ... }
  }
}
```

#### Response `200 OK` (No active session)
```json
{
  "success": true,
  "data": null
}
```

---

### `GET /api/v1/sessions`

Lists all charging sessions belonging to the authenticated user, newest first.

#### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "4a761ef2-bb30-4e38-9524-74714bf390f7",
      "user_id": "b0000001-0000-0000-0000-000000000001",
      "vehicle_id": "7d195f39-df2f-48e3-8637-6b934e984539",
      "connector_id": "c1000001-0000-0000-0000-000000000007",
      "started_at": "2026-09-29T13:06:10.123Z",
      "ended_at": "2026-09-29T13:16:10.123Z",
      "start_soc": null,
      "end_soc": null,
      "energy_kwh": 0,
      "duration_seconds": 600,
      "cost_amount": 0,
      "currency": "INR",
      "status": "stopped",
      "station_name": "Koramangala Tech Park Hub",
      "station_city": "Bengaluru",
      "connector_standard": "CCS2",
      "vehicle_model": "Nexon EV"
    }
  ],
  "meta": {
    "count": 1
  }
}
```

---

### `GET /api/v1/sessions/:id`

Retrieves a single charging session by ID with full nested details.

#### Response `200 OK`
Returns the session object with nested `vehicle`, `connector`, `evse`, `location`, and `cpo`.

| Status | `error.code` | Cause |
|---|---|---|
| `400` | `INVALID_UUID` | `:id` is not a valid UUID |
| `401` | `MISSING_TOKEN` | Not authenticated |
| `404` | `SESSION_NOT_FOUND` | Session not found or owned by a different user |

---

### `POST /api/v1/sessions/:id/stop`

Stops an active charging session owned by the authenticated user.

#### Effects:
1. Verifies the session exists, belongs to the authenticated user, and is currently `active` or `pending`.
2. Updates `charging_sessions`:
   - `status = 'stopped'`
   - `ended_at = CURRENT_TIMESTAMP`
   - `duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))`
3. Updates `connectors`:
   - `status = 'available'` (releasing the connector for other drivers).
4. Returns the updated session object with rich details.

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "4a761ef2-bb30-4e38-9524-74714bf390f7",
    "status": "stopped",
    "started_at": "2026-09-29T13:06:10.123Z",
    "ended_at": "2026-09-29T13:16:10.123Z",
    "duration_seconds": 600,
    "energy_kwh": 0,
    "cost_amount": 0,
    "connector": {
      "status": "available"
    }
  }
}
```

| Status | `error.code` | Cause |
|---|---|---|
| `400` | `INVALID_UUID` | `:id` is not a valid UUID |
| `401` | `MISSING_TOKEN` | Not authenticated |
| `404` | `SESSION_NOT_FOUND` | Session not found or owned by a different user |
| `409` | `SESSION_ALREADY_STOPPED` | Session is already stopped, completed, or cancelled |

---

### `GET /api/v1/sessions/:id/cdr`

Retrieves the finalized Charge Detail Record (CDR) for a specific session.

- **Authentication:** Required (`vg_token` cookie or Bearer token).
- **Access Control:** Enforces ownership — returns `403 FORBIDDEN` if requested by another user.
- **Session Lifecycle:** Returns `404 NOT_FOUND` if the session has not reached a terminal billable state (`completed` or `stopped`).

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "c0000001-0000-0000-0000-000000000001",
    "session_id": "4a761ef2-bb30-4e38-9524-74714bf390f7",
    "user_id": "b0000001-0000-0000-0000-000000000001",
    "status": "finalized",
    "session_status": "completed",
    "energy_kwh": 23.75,
    "duration_seconds": 3600,
    "currency": "INR",
    "energy_cost": 370.0,
    "session_fee": 10.0,
    "time_cost": 0.0,
    "idle_cost": 0.0,
    "subtotal": 380.0,
    "tax_rate": 0.18,
    "tax_amount": 68.4,
    "total_amount": 448.4,
    "location_name": "Aerocity Charging Hub",
    "cpo_name": "Tata Power EZ Charge"
  }
}
```

---

## 7. Tariffs & Pricing

VahanGrid supports hierarchical tariff resolution across:
`Connector -> EVSE -> Location -> CPO -> System Default`.

### `GET /api/v1/tariffs`
List all active tariffs. Supports optional filters: `cpo_id`, `location_id`, `evse_id`, `connector_id`, `is_active`.

### `GET /api/v1/tariffs/:id`
Retrieve a single tariff by ID.

### `POST /api/v1/tariffs`
Create a new tariff definition.

#### Request Body
```json
{
  "name": "Super Fast DC Peak Tariff",
  "cpo_id": "a0000001-0000-0000-0000-000000000001",
  "location_id": null,
  "price_per_kwh": 18.50,
  "session_fee": 10.00,
  "price_per_min": 0.00,
  "idle_fee_per_min": 1.50,
  "idle_grace_minutes": 10,
  "tax_rate": 0.1800,
  "currency": "INR"
}
```

### `PATCH /api/v1/tariffs/:id`
Update an existing tariff.

### `DELETE /api/v1/tariffs/:id`
Soft-deletes or hard-deletes unreferenced tariffs.

---

## 8. Charge Detail Records (CDRs)

Charge Detail Records represent immutable, audit-grade financial and energy records generated upon session completion.

### `GET /api/v1/cdrs`
List all CDRs belonging to the authenticated user.

#### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "c0000001-0000-0000-0000-000000000001",
      "session_id": "4a761ef2-bb30-4e38-9524-74714bf390f7",
      "user_id": "b0000001-0000-0000-0000-000000000001",
      "status": "finalized",
      "session_status": "completed",
      "energy_kwh": 23.75,
      "duration_seconds": 3600,
      "total_amount": 448.4,
      "currency": "INR",
      "location_name": "Aerocity Charging Hub",
      "cpo_name": "Tata Power EZ Charge",
      "created_at": "2026-10-08T14:30:00.000Z"
    }
  ],
  "meta": {
    "count": 1
  }
}
```

### `GET /api/v1/cdrs/:id`
Retrieve full immutable CDR details for the specified CDR UUID.

#### Response `200 OK`
Returns the full CDR record including immutable snapshots (`tariff_snapshot`, `pricing_breakdown`), physical meters (`meter_start_wh`, `meter_stop_wh`), settlement status (`settlement_status`, `settled_at`, `wallet_transaction_id`), and station metadata snapshots.

---

### `POST /api/v1/cdrs/:id/settle`

Explicitly triggers or retries settlement of a finalized CDR against the authenticated user's wallet.

- **Authentication:** Required (`vg_token` cookie or Bearer token).
- **Access Control:** Enforces ownership — returns `403 FORBIDDEN` (`CDR_ACCESS_DENIED`) if requested for another user's CDR.
- **Source of Truth:** The settlement amount is strictly taken from the immutable `cdr.total_amount`. The client cannot specify or tamper with the settlement amount.
- **Idempotency:** Protected at both application layer and DB unique index (`uq_wallet_txns_cdr_id`). Re-calling on an already settled CDR returns `200 OK` with `already_settled: true` without double-debiting.
- **Zero-Amount Sessions:** For ₹0.00 sessions, marks `settlement_status = 'settled'` without creating an invalid ₹0.00 ledger transaction.

#### Response `200 OK` (Successful Settlement)
```json
{
  "success": true,
  "data": {
    "settled": true,
    "already_settled": false,
    "cdr_id": "c0000001-0000-0000-0000-000000000001",
    "wallet_id": "w0000001-0000-0000-0000-000000000001",
    "amount": 150.0,
    "currency": "INR",
    "balance_before": 500.0,
    "balance_after": 350.0,
    "transaction_id": "t0000001-0000-0000-0000-000000000001",
    "settled_at": "2026-10-08T17:15:00.000Z",
    "status": "settled"
  }
}
```

#### Error Responses

| Status | `error.code` | Cause |
|---|---|---|
| `400` | `INVALID_CDR_ID` | `:id` is not a valid UUID format |
| `400` | `CDR_NOT_FINALIZED` | CDR is still in pending/unfinalized status |
| `400` | `INSUFFICIENT_FUNDS` | Wallet balance is lower than CDR amount; no partial debit performed |
| `401` | `MISSING_TOKEN` | Request lacks valid authentication |
| `403` | `CDR_ACCESS_DENIED` | Authenticated user is not the owner of this CDR |
| `404` | `CDR_NOT_FOUND` | CDR does not exist in database |



