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
| `lat` | number | **Yes** | â€” | Latitude between `-90.0` and `90.0` |
| `lng` | number | **Yes** | â€” | Longitude between `-180.0` and `180.0` |
| `radius_km` | number | No | `5` | Radius in kilometers (`> 0` and `â‰¤ 100`) |

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
| `name` | string | âœ… | Full name (min 2 characters) |
| `email` | string | âœ… | Valid email address (normalized to lowercase) |
| `phone` | string | âŒ | Indian mobile number (e.g. `9876543210` or `+919876543210`) |
| `password` | string | âœ… | Minimum 8 characters |

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

The `vg_token` cookie is also set on the response â€” the user is logged in immediately after registration.

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
| `401` | `INVALID_CREDENTIALS` | Wrong email or password (same code for both â€” prevents email enumeration) |

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
| `401` | `TOKEN_EXPIRED` | JWT has expired â€” user must log in again |
| `401` | `INVALID_TOKEN` | JWT signature is invalid |
| `401` | `USER_NOT_FOUND` | Token is valid but user no longer exists in the database |

---

### Authentication Security Notes

- **`password_hash` is never returned** in any API response.
- **Email enumeration is prevented**: login returns `INVALID_CREDENTIALS` for both wrong email and wrong password.
- **Timing attack mitigation**: a dummy bcrypt compare runs even when the user is not found, so response times are consistent.
- **Client-supplied user IDs are never trusted**: `req.user` is populated exclusively from the verified JWT and a fresh DB lookup.
- **SQL injection**: all queries use parameterized SQL (`$1`, `$2`, â€¦). No string concatenation.

---

## 4. User Profile

All user profile endpoints require a valid `vg_token` cookie. The user identity is always derived from the token â€” never from a client-supplied ID.

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

All vehicle endpoints require a valid `vg_token` cookie. **Authorization is enforced at the database layer** â€” every query includes `AND user_id = <authenticated user id>`, preventing any cross-user access (IDOR protection).

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
| `manufacturer` | string | âœ… | e.g. `"Tata Motors"` |
| `model` | string | âœ… | e.g. `"Nexon EV"` |
| `variant` | string | âŒ | e.g. `"Max"` |
| `battery_capacity_kwh` | number | âœ… | Must be > 0 |
| `usable_battery_capacity_kwh` | number | âŒ | Must be > 0 and â‰¤ battery_capacity_kwh |
| `connector_type` | string | âœ… | One of the accepted values above |
| `max_ac_power_kw` | number | âŒ | Must be â‰¥ 0 |
| `max_dc_power_kw` | number | âŒ | Must be â‰¥ 0 |

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

- **IDOR prevention**: every SQL query for a specific vehicle includes `AND user_id = $<authenticated_user_id>`. Even if a malformed request sends the wrong vehicle ID, the DB query returns 0 rows â€” not a 403, but a 404 (to avoid revealing existence of another user's resource).
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
- **Access Control:** Enforces ownership â€” returns `403 FORBIDDEN` if requested by another user.
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
- **Access Control:** Enforces ownership â€” returns `403 FORBIDDEN` (`CDR_ACCESS_DENIED`) if requested for another user's CDR.
- **Source of Truth:** The settlement amount is strictly taken from the immutable `cdr.total_amount`. The client cannot specify or tamper with the settlement amount.
- **Idempotency:** Protected at both application layer and DB unique index (`uq_wallet_txns_cdr_id`). Re-calling on an already settled CDR returns `200 OK` with `already_settled: true` without double-debiting.
- **Zero-Amount Sessions:** For â‚¹0.00 sessions, marks `settlement_status = 'settled'` without creating an invalid â‚¹0.00 ledger transaction.

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

---

## 13. Payments & Wallet Top-up API (Phase 3E.4)

### `POST /api/v1/payments/orders`
Creates a server-authoritative payment intent/order to top up the authenticated user's wallet.

- **Authentication:** Required (`vg_token` cookie or Bearer token).
- **Validation:** Amount must be positive, between â‚¹10 and â‚¹50,000, currency must be `'INR'`.
- **Integrity:** The backend records the authoritative amount in `payments` table and initiates a gateway order (Razorpay).

#### Request Body
```json
{
  "amount": 500.0,
  "currency": "INR"
}
```

#### Response `201 Created`
```json
{
  "success": true,
  "data": {
    "payment_id": "9a1f2b3c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    "order_id": "order_a1b2c3d4e5f6g7h8",
    "amount": 500,
    "currency": "INR",
    "status": "created",
    "key_id": "rzp_test_vahangrid",
    "provider": "razorpay",
    "created_at": "2026-10-08T17:30:00.000Z"
  }
}
```

---

### `POST /api/v1/payments/webhook`
Public endpoint receiving asynchronous webhook events from the payment gateway.

- **Authentication:** HMAC-SHA256 signature verified via `x-razorpay-signature` header against `PAYMENT_WEBHOOK_SECRET` using raw request buffer (`req.rawBody`). Does NOT use JWT.
- **Idempotency:** Protected by `SELECT FOR UPDATE` on the payment record and database partial unique index (`uq_wallet_txns_payment_id`). Duplicate/replayed webhooks return `200 OK` with `already_processed: true` without double-crediting.
- **Atomicity:** Payment state transition to `'paid'` and wallet credit ledger insertion (`type = 'topup'`) execute in a single atomic database transaction.
- **Amount Tampering Defense:** Rejects any webhook payload reporting an amount differing from the server-authoritative payment order amount.

#### Headers
```http
Content-Type: application/json
x-razorpay-signature: <hmac-sha256-hex-signature>
```

#### Request Body (Sample `order.paid` event)
```json
{
  "event": "order.paid",
  "payload": {
    "order": {
      "entity": {
        "id": "order_a1b2c3d4e5f6g7h8",
        "amount": 50000
      }
    },
    "payment": {
      "entity": {
        "id": "pay_xyz987654321",
        "order_id": "order_a1b2c3d4e5f6g7h8",
        "amount": 50000
      }
    }
  }
}
```

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "received": true,
    "event": "order.paid",
    "result": {
      "success": true,
      "already_processed": false,
      "payment_id": "9a1f2b3c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
      "status": "paid",
      "amount": 500.0,
      "currency": "INR",
      "transaction_id": "wt_11112222-3333-4444-5555-666677778888",
      "balance_before": 0.0,
      "balance_after": 500.0,
      "completed_at": "2026-10-08T17:31:00.000Z"
    }
  }
}
```

---

### `POST /api/v1/payments/verify`
Authenticated client verification endpoint called when the frontend Razorpay checkout callback fires.

- **Authentication:** Required (`vg_token` cookie or Bearer token).
- **Validation:** Verifies `HMAC_SHA256(order_id + '|' + payment_id, key_secret) === signature`.

#### Request Body
```json
{
  "orderId": "order_a1b2c3d4e5f6g7h8",
  "paymentId": "pay_xyz987654321",
  "signature": "<razorpay-signature>"
}
```

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "success": true,
    "already_processed": false,
    "payment_id": "9a1f2b3c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    "status": "paid",
    "amount": 500.0,
    "currency": "INR",
    "transaction_id": "wt_11112222-3333-4444-5555-666677778888",
    "balance_before": 0.0,
    "balance_after": 500.0,
    "completed_at": "2026-10-08T17:31:00.000Z"
  }
}
```

---

### `GET /api/v1/payments/:id`
Retrieves details of a specific payment order.

- **Authentication:** Required.
- **Access Control:** User-isolated (returns `403 FORBIDDEN` for other users' payments to prevent IDOR).
- **Security:** Gateway secrets, keys, and webhook signing materials are strictly excluded.

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "9a1f2b3c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    "user_id": "b0000001-0000-0000-0000-000000000001",
    "wallet_id": "w0000001-0000-0000-0000-000000000001",
    "provider": "razorpay",
    "provider_order_id": "order_a1b2c3d4e5f6g7h8",
    "provider_payment_id": "pay_xyz987654321",
    "amount": 500.0,
    "currency": "INR",
    "status": "paid",
    "wallet_transaction_id": "wt_11112222-3333-4444-5555-666677778888",
    "error_code": null,
    "error_description": null,
    "created_at": "2026-10-08T17:30:00.000Z",
    "updated_at": "2026-10-08T17:31:00.000Z",
    "completed_at": "2026-10-08T17:31:00.000Z"
  }
}
```

---

### `GET /api/v1/payments`
Lists payment history for the authenticated user, newest first.

- **Authentication:** Required (`vg_token` cookie or Bearer token).
- **Pagination:** Supports `limit` (default 50) and `offset` (default 0) query parameters.
- **Access Control:** User-isolated (enforces `WHERE user_id = $1`).

#### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "9a1f2b3c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
      "user_id": "b0000001-0000-0000-0000-000000000001",
      "wallet_id": "w0000001-0000-0000-0000-000000000001",
      "provider": "razorpay",
      "provider_order_id": "order_a1b2c3d4e5f6g7h8",
      "provider_payment_id": "pay_xyz987654321",
      "amount": 500.0,
      "currency": "INR",
      "status": "paid",
      "wallet_transaction_id": "wt_11112222-3333-4444-5555-666677778888",
      "error_code": null,
      "error_description": null,
      "created_at": "2026-10-08T17:30:00.000Z",
      "updated_at": "2026-10-08T17:31:00.000Z",
      "completed_at": "2026-10-08T17:31:00.000Z"
    }
  ],
  "meta": {
    "count": 1,
    "limit": 50,
    "offset": 0
  }
}
```

---

## 14. Wallet & Unified Financial Activity API (Phase 3G)

### `GET /api/v1/wallet`
Retrieves the authenticated user's wallet record with real-time derived balance.

- **Authentication:** Required (`vg_token` cookie or Bearer token).
- **Integrity:** Derived directly from `SUM(amount)` over the append-only `wallet_transactions` ledger.

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "w0000001-0000-0000-0000-000000000001",
    "user_id": "b0000001-0000-0000-0000-000000000001",
    "balance": 500.0,
    "currency": "INR",
    "status": "active",
    "created_at": "2026-10-08T17:00:00.000Z",
    "updated_at": "2026-10-08T17:31:00.000Z"
  }
}
```

---

### `GET /api/v1/wallet/transactions`
Retrieves enriched ledger transaction history for the authenticated user, newest first.

- **Authentication:** Required (`vg_token` cookie or Bearer token).
- **Pagination:** Supports `limit` (default 50) and `offset` (default 0) query parameters.
- **Filtering:** Supports `type` query parameter (`topup`, `charging_payment`, `refund`, `cashback`, `adjustment`).
- **Enrichment:** Includes running balances (`balance_before`, `balance_after`), joined CDR station metadata (`location_name`, `energy_kwh`, `session_id`, `cdr_settlement_status`), and joined payment metadata (`payment_status`, `provider_order_id`, `provider_payment_id`).

#### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "wt_22223333-4444-5555-6666-777788889999",
      "wallet_id": "w0000001-0000-0000-0000-000000000001",
      "type": "charging_payment",
      "amount": -150.0,
      "currency": "INR",
      "description": "Charging session at Koramangala Tech Park Hub (23.75 kWh)",
      "reference_id": "4a761ef2-bb30-4e38-9524-74714bf390f7",
      "balance_before": 500.0,
      "balance_after": 350.0,
      "cdr_id": "c0000001-0000-0000-0000-000000000001",
      "payment_id": null,
      "created_at": "2026-10-08T18:00:00.000Z",
      "session_id": "4a761ef2-bb30-4e38-9524-74714bf390f7",
      "location_name": "Koramangala Tech Park Hub",
      "energy_kwh": 23.75,
      "cdr_settlement_status": "settled",
      "payment_status": null,
      "provider_order_id": null,
      "provider_payment_id": null
    },
    {
      "id": "wt_11112222-3333-4444-5555-666677778888",
      "wallet_id": "w0000001-0000-0000-0000-000000000001",
      "type": "topup",
      "amount": 500.0,
      "currency": "INR",
      "description": "Top-up via Razorpay (pay_xyz987654321)",
      "reference_id": null,
      "balance_before": 0.0,
      "balance_after": 500.0,
      "cdr_id": null,
      "payment_id": "9a1f2b3c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
      "created_at": "2026-10-08T17:31:00.000Z",
      "session_id": null,
      "location_name": null,
      "energy_kwh": null,
      "cdr_settlement_status": null,
      "payment_status": "paid",
      "provider_order_id": "order_a1b2c3d4e5f6g7h8",
      "provider_payment_id": "pay_xyz987654321"
    }
  ],
  "meta": {
    "count": 2,
    "limit": 50,
    "offset": 0
  }
}
```

## Phase 4A.1: Operator Identity & Authorization Security Policy

All administrative, remote charger control, and tariff management endpoints enforce strict server-side authorization:

### 1. User Roles & Claims
- `driver`: Default EV driver account. Has access to discovery, roaming charging, personal sessions, and personal wallet. Cannot perform station hardware commands or modify tariffs.
- `operator`: Charge Point Operator staff (e.g. Tata Power, Statiq). Bound to an authoritative `cpo_id`. Can only inspect and manage hardware, active operations, and tariffs belonging to their own CPO.
- `admin`: Platform Super Admin with cross-network maintenance access.

### 2. Protected Station Remote Operations
Mounted at `/api/v1/stations/:id/*` (Requires `authenticate` + `requireStationOperator`):
- `POST /api/v1/stations/:id/availability` â€” Remote ChangeAvailability
- `POST /api/v1/stations/:id/reset` â€” Remote Soft/Hard Reset
- `POST /api/v1/stations/:id/unlock-connector` â€” Remote UnlockConnector
- `POST /api/v1/stations/:id/trigger-message` â€” Remote TriggerMessage
- `POST /api/v1/stations/:id/charging-profiles` â€” Remote SetChargingProfile
- `POST /api/v1/stations/:id/clear-charging-profile` â€” Remote ClearChargingProfile
- `DELETE /api/v1/stations/:id/charging-profiles` â€” Remote ClearChargingProfile alias

**Authorization Rules:**
- Unauthenticated requests: `401 UNAUTHENTICATED`
- Driver requests: `403 OPERATOR_ROLE_REQUIRED`
- Operator managing station of another CPO: `403 CPO_ACCESS_DENIED`
- Operator with unlinked `cpo_id`: `403 OPERATOR_CPO_REQUIRED` (fails closed)

### 3. Protected Tariff Management
Mounted at `/api/v1/tariffs/*`:
- `POST /api/v1/tariffs` â€” Create Tariff (Requires `authenticate` + `requireTariffOperator`)
  - Server automatically locks `cpo_id` to `req.user.cpo_id`.
  - If `location_id` is provided, verifies that location belongs to operator's CPO.
- `GET /api/v1/tariffs` â€” List Tariffs (Requires `authenticate` + `requireOperator`)
  - Automatically filters results to `cpo_id = req.user.cpo_id`.
- `PATCH /api/v1/tariffs/:id` & `DELETE /api/v1/tariffs/:id` (Requires `authenticate` + `requireTariffOperator`)
  - Verifies target tariff belongs to `req.user.cpo_id`.
- `GET /api/v1/tariffs/resolve` & `POST /api/v1/tariffs/calculate`
  - Permitted for authenticated drivers and operators.

---

## Phase 4A.2: Operator Dashboard APIs (`/api/v1/operator/*`)

Dedicated management and telemetry endpoints for Charge Point Operators (CPOs) and platform administrators.

**Access Policy:**
- Authentication required (`jwt` cookie or `Authorization: Bearer <token>`).
- Role required: `operator` (locked strictly to `users.cpo_id`) or `admin` (super-admin cross-network access).
- Multi-tenant isolation: Operators attempting to supply or query a foreign `cpo_id` receive `403 CPO_ACCESS_DENIED`.
- Driver access is rejected with `403 OPERATOR_ROLE_REQUIRED`.
- Driver PII masking: Drivers' names are strictly masked (e.g. `Priya S.`), and email addresses, phone numbers, and wallet identifiers are completely omitted.

---

### `GET /api/v1/operator/overview`

Fleet-level real-time KPI overview and authoritative CDR revenue metrics.

#### Query Parameters
- `period` (string, optional): Aggregate period for CDR financial metrics. One of `24h`, `7d`, `30d` (default), `90d`, `all`.
- `cpo_id` (UUID, optional, **admin only**): Scope overview to a specific CPO. If omitted, admins receive platform-wide aggregate (`cpo.id = 'all'`).

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "cpo": {
      "id": "a0000001-0000-0000-0000-000000000001",
      "name": "Tata Power EZ Charge",
      "short_code": "TATA_EZ"
    },
    "stations": {
      "total": 6,
      "online": 4,
      "offline": 2
    },
    "connectors": {
      "total": 14,
      "breakdown": {
        "available": 8,
        "occupied": 4,
        "faulted": 1,
        "unavailable": 1
      }
    },
    "sessions": {
      "active_now": 2
    },
    "period": "30d",
    "metrics": {
      "total_sessions": 38,
      "total_energy_kwh": 492.5,
      "total_revenue_inr": 8865.0,
      "settled_revenue_inr": 8500.0,
      "unsettled_revenue_inr": 365.0,
      "settlement_rate_percent": 95.88
    }
  }
}
```

---

### `GET /api/v1/operator/stations`

Paginated fleet station inventory with live EVSE/connector capacity, OCPP connectivity status, and active charging counts.

#### Query Parameters
- `page` (integer >= 1, default `1`)
- `limit` (integer 1â€“50, default `10`)
- `status` (string, optional): One of `all` (default), `active`, `inactive`, `maintenance`
- `search` (string, optional): Substring filter on station name or city
- `cpo_id` (UUID, optional, **admin only**)

#### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "22222222-2222-2222-2222-222222222222",
      "name": "Connaught Place Fast Hub",
      "address": "Inner Circle, Connaught Place",
      "city": "New Delhi",
      "state": "Delhi",
      "postal_code": "110001",
      "coordinates": {
        "latitude": 28.6315,
        "longitude": 77.2167
      },
      "operational_health": "active",
      "evse_count": 2,
      "connector_count": 4,
      "connectors_breakdown": {
        "available": 2,
        "occupied": 1,
        "faulted": 0,
        "unavailable": 1
      },
      "active_sessions_count": 1,
      "ocpp": {
        "is_online": true,
        "last_heartbeat": "2026-10-09T18:00:00.000Z",
        "station_charge_point_id": "CP-DEL-001"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total_count": 4,
    "total_pages": 1
  }
}
```

---

### `GET /api/v1/operator/sessions`

Paginated session feed scoped strictly to the operator's stations with masked driver identity (zero PII exposure) and immutable CDR settlement tracking.

#### Query Parameters
- `page` (integer >= 1, default `1`)
- `limit` (integer 1â€“100, default `20`)
- `status` (string, optional): One of `all` (default), `charging`, `completed`, `stopped`, `faulted`
- `station_id` (UUID, optional): Filter sessions for a specific station
- `cpo_id` (UUID, optional, **admin only**)

#### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "session_id": "4a761ef2-bb30-4e38-9524-74714bf390f7",
      "status": "stopped",
      "started_at": "2026-10-08T17:30:00.000Z",
      "stopped_at": "2026-10-08T18:00:00.000Z",
      "total_energy_kwh": 23.75,
      "total_cost_inr": 150.0,
      "driver": {
        "display_name": "Priya S."
      },
      "vehicle": {
        "make": "Tata",
        "model": "Nexon EV Max"
      },
      "station": {
        "id": "11111111-1111-1111-1111-111111111111",
        "name": "Koramangala Tech Park Hub",
        "city": "Bengaluru"
      },
      "hardware": {
        "evse_id": "1",
        "connector_id": "1",
        "connector_type": "CCS-2"
      },
      "cdr": {
        "id": "c0000001-0000-0000-0000-000000000001",
        "settlement_status": "settled",
        "total_amount": 150.0
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total_count": 1,
    "total_pages": 1
  }
}
```

---

### `GET /api/v1/operator/analytics`

Continuous time-series analytics powered by bounded PostgreSQL date series generation with gap filling, providing historical trend insights.

#### Query Parameters
- `period` (string, optional): One of `24h` (24 hourly buckets), `7d` (7 daily buckets, default), `30d` (30 daily buckets)
- `cpo_id` (UUID, optional, **admin only**)

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "cpo": {
      "id": "a0000001-0000-0000-0000-000000000001",
      "name": "Tata Power EZ Charge",
      "short_code": "TATA_EZ"
    },
    "period": "7d",
    "granularity": "daily",
    "summary": {
      "total_sessions": 24,
      "total_energy_kwh": 312.4,
      "total_billed_inr": 5623.2,
      "total_settled_inr": 5400.0
    },
    "time_series": [
      {
        "timestamp": "2026-10-04T00:00:00.000Z",
        "label": "04 Oct",
        "session_count": 4,
        "energy_kwh": 52.8,
        "billed_amount_inr": 950.4,
        "settled_amount_inr": 950.4
      }
    ]
  }
}
```

---

## Phase 4C: Operator Station Management APIs

Authenticated CPO operators can view full hardware details and safely update mutable operational metadata for stations belonging to their CPO. Multi-tenant isolation is enforced via `requireStationOperator` middleware.

---

### `GET /api/v1/operator/stations/:id`

Fetch full detail for a single charging station, including CPO details, EVSE inventory, and real-time connector status.

#### Security & Access Control
- **Authentication**: Required (JWT cookie).
- **Role**: `operator` (locked to their own CPO's stations) or `admin` (can view any station).
- **Driver**: Denied with `403 OPERATOR_ROLE_REQUIRED`.
- **Cross-CPO Access**: Denied with `403 CPO_ACCESS_DENIED`.

#### Path Parameters
- `id` (UUID): Station unique identifier.

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "e0000001-0000-0000-0000-000000000001",
    "cpo_id": "a0000001-0000-0000-0000-000000000001",
    "source_type": "internal",
    "source_id": null,
    "name": "Tata Power Fast Charger â€” Connaught Place",
    "address_line1": "Block A, Inner Circle, Connaught Place",
    "address_line2": null,
    "city": "New Delhi",
    "state": "Delhi",
    "postal_code": "110001",
    "country_code": "IN",
    "latitude": 28.6304,
    "longitude": 77.2177,
    "status": "active",
    "timezone": "Asia/Kolkata",
    "created_at": "2026-09-01T00:00:00.000Z",
    "updated_at": "2026-10-10T02:00:00.000Z",
    "cpo": {
      "id": "a0000001-0000-0000-0000-000000000001",
      "name": "Tata Power EZ Charge",
      "short_code": "TATA_EZ"
    },
    "evses": [
      {
        "id": "...",
        "evse_id": "EVSE-001",
        "status": "AVAILABLE",
        "connectors": [
          {
            "id": "...",
            "connector_id": 1,
            "standard": "CCS2",
            "format": "Cable",
            "power_type": "DC",
            "max_power_kw": 60.0,
            "status": "AVAILABLE"
          }
        ]
      }
    ]
  }
}
```

---

### `PATCH /api/v1/operator/stations/:id`

Update mutable metadata of a station owned by the authenticated operator's CPO.

#### Mutable Fields
- `name` (string, 1â€“255 characters)
- `address_line1` (string, 1â€“255 characters)
- `address_line2` (string, max 255 characters, nullable)
- `city` (string, 1â€“100 characters)
- `state` (string, 1â€“100 characters)
- `postal_code` (string, max 20 characters, nullable)
- `timezone` (string, 1â€“50 characters, e.g. `Asia/Kolkata`)
- `status` (string, `active` or `inactive`)
- `latitude` (number, -90 to 90) & `longitude` (number, -180 to 180) â€” *must be provided together*

#### Protected / Immutable Fields
Attempts to supply any of the following fields return `422 IMMUTABLE_FIELD`:
- `id`, `cpo_id`, `source_type`, `source_id`, `country_code`, `created_at`, `updated_at`

#### Request Body Example
```json
{
  "name": "Tata Power Fast Charger â€” Connaught Place (Hub 1)",
  "address_line1": "Block A, Outer Circle, Connaught Place",
  "city": "New Delhi",
  "state": "Delhi",
  "status": "active",
  "latitude": 28.6305,
  "longitude": 77.2178
}
```

#### Response `200 OK`
```json
{
  "success": true,
  "message": "Station updated successfully",
  "data": {
    "id": "e0000001-0000-0000-0000-000000000001",
    "name": "Tata Power Fast Charger â€” Connaught Place (Hub 1)",
    "address_line1": "Block A, Outer Circle, Connaught Place",
    "city": "New Delhi",
    "state": "Delhi",
    "status": "active",
    "latitude": 28.6305,
    "longitude": 77.2178,
    "updated_at": "2026-10-10T02:40:00.000Z"
  }
}
```

---

## 14. Tariff Management

Protected endpoints for operators (`operator`) and administrators (`admin`) to query, create, update, and resolve tariffs.

### `GET /api/v1/tariffs`
Lists active/inactive tariffs scoped strictly to the operator's CPO. Platform administrators can pass `?cpo_id=` or omit it for platform-wide view.

#### Query Parameters
- `search` (string, optional) â€” Case-insensitive filter matching tariff name, station name, or description.
- `location_id` (UUID, optional) â€” Filter tariffs scoped to a specific station.
- `is_active` (boolean, optional) â€” Filter by active (`true`) or inactive (`false`) status.

#### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "e0000001-0000-0000-0000-000000000001",
      "name": "Tata Standard EV Tariff",
      "description": "Default network-wide rate",
      "cpo_id": "a0000001-0000-0000-0000-000000000001",
      "location_id": null,
      "currency": "INR",
      "price_per_kwh": "15.00",
      "session_fee": "0.00",
      "price_per_minute": "0.00",
      "idle_fee_per_minute": "1.00",
      "grace_period_minutes": 15,
      "tax_rate": "0.1800",
      "is_active": true,
      "valid_from": "2026-01-01T00:00:00.000Z",
      "valid_to": null,
      "created_at": "2026-01-01T00:00:00.000Z",
      "location_name": null,
      "cpo_name": "Tata Power EZ Charge"
    }
  ],
  "meta": {
    "count": 1
  }
}
```

### `POST /api/v1/tariffs`
Creates a new tariff plan. The `cpo_id` is automatically derived on the server from the authenticated operator's account.

#### Request Body
- `name` (string, required)
- `description` (string, optional)
- `location_id` (UUID, optional, station scope must belong to operator's CPO)
- `currency` (string, default `INR`)
- `price_per_kwh` (number, non-negative, default `0.00`)
- `session_fee` (number, non-negative, default `0.00`)
- `price_per_minute` (number, non-negative, default `0.00`)
- `idle_fee_per_minute` (number, non-negative, default `0.00`)
- `grace_period_minutes` (integer, non-negative, default `15`)
- `tax_rate` (number, 0.00 to 1.00, default `0.1800`)
- `is_active` (boolean, default `true`)
- `valid_from` (ISO 8601 timestamp, default current time)
- `valid_to` (ISO 8601 timestamp, optional, must be `>= valid_from`)

#### Response `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "e0000001-0000-0000-0000-000000000099",
    "name": "Tata Off-Peak Night Owl",
    "cpo_id": "a0000001-0000-0000-0000-000000000001",
    "price_per_kwh": "12.50",
    "session_fee": "5.00",
    "is_active": true
  }
}
```

### `PATCH /api/v1/tariffs/:id`
Updates pricing or metadata for an existing tariff owned by the authenticated operator. Past charging sessions and settled CDRs remain strictly immutable and are never retroactively repriced.

#### Mutable Fields
`name`, `description`, `location_id`, `currency`, `price_per_kwh`, `session_fee`, `price_per_minute`, `idle_fee_per_minute`, `grace_period_minutes`, `tax_rate`, `is_active`, `valid_from`, `valid_to`.

#### Immutable Fields
`id`, `cpo_id`, `created_at`, `updated_at` (rejects with `422 IMMUTABLE_FIELD` or `403 CPO_ACCESS_DENIED`).

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "e0000001-0000-0000-0000-000000000099",
    "price_per_kwh": "13.25",
    "session_fee": "6.00",
    "is_active": true,
    "updated_at": "2026-10-10T03:30:00.000Z"
  }
}
```

### `DELETE /api/v1/tariffs/:id`
Deactivates or removes a tariff plan owned by the operator.





---

## Operator Session Operations (Phase 4E)

All routes require `Authorization` via HTTP-only JWT cookie (`vg_token`) with operator or admin role. Drivers receive `403 OPERATOR_ROLE_REQUIRED`.

---

### `GET /api/v1/operator/sessions`

Returns a paginated, multi-filtered session feed scoped to the authenticated operator's CPO. Driver PII is masked server-side.

#### Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Page size, max 100 (default: 20) |
| `status` | string | `active`, `stopped`, `completed`, `faulted`, `pending`, `cancelled`, `all` |
| `settlement_status` | string | `settled`, `pending`, `failed`, `none`, `all` |
| `station_id` | UUID | Filter to a specific station |
| `from` | ISO date | Lower bound for `started_at` (e.g. `2026-10-01`) |
| `to` | ISO date | Upper bound for `started_at` (e.g. `2026-10-10`) |
| `search` | string | Free-text search across station name, city, vehicle model, session ID |

#### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "sess-uuid",
      "status": "stopped",
      "started_at": "2026-10-09T10:00:00.000Z",
      "ended_at": "2026-10-09T11:15:00.000Z",
      "energy_kwh": 14.5,
      "cost_amount": 240.00,
      "tariff_id": "tariff-uuid",
      "tariff_snapshot": { "price_per_kwh": 15.00, "tax_rate": 0.18 },
      "driver": { "name": "Priya S." },
      "station": { "id": "loc-uuid", "name": "Tata EZ Hub", "city": "Mumbai" },
      "hardware": { "evse_uid": "EVSE-01", "connector_code": "1", "standard": "IEC_62196_T2" },
      "cdr": { "id": "cdr-uuid", "settlement_status": "settled", "settled_at": "2026-10-09T11:20:00.000Z" }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 28, "total_pages": 2 }
}
```

#### Error Responses
- `400 INVALID_STATUS` — unknown session status value
- `400 INVALID_SETTLEMENT_STATUS` — unknown settlement_status value
- `401 UNAUTHORIZED` — not authenticated
- `403 OPERATOR_ROLE_REQUIRED` — driver account used

---

### `GET /api/v1/operator/sessions/:id`

Returns comprehensive audit details for a single charging session owned by the operator's CPO. Includes hardware, masked driver PII, tariff snapshot, and CDR.

#### Path Parameters
- `id` — Session UUID

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "sess-uuid",
    "status": "stopped",
    "meter_start": 12500,
    "meter_stop": 27000,
    "energy_kwh": 14.5,
    "cost_amount": 240.00,
    "started_at": "2026-10-09T10:00:00.000Z",
    "ended_at": "2026-10-09T11:15:00.000Z",
    "stop_reason": "Remote",
    "station": { "id": "loc-uuid", "name": "Tata EZ Hub", "city": "Mumbai", "state": "Maharashtra", "cpo_id": "cpo-uuid" },
    "hardware": { "evse_uid": "EVSE-01", "connector_code": "1", "standard": "IEC_62196_T2", "max_power_kw": 22, "current_type": "AC" },
    "charger": { "charge_point_id": "CP-001", "is_connected": false, "transaction_id": 42 },
    "driver": { "name": "Priya S.", "email": "p***@example.com", "phone": "+91 98*** 0000" },
    "vehicle": { "make": "Tata", "model": "Nexon EV", "license_plate": "MH 01 ** 0000" },
    "tariff_id": "tariff-uuid",
    "tariff_snapshot": { "price_per_kwh": 15.00, "session_fee": 5.00, "tax_rate": 0.18, "grace_period_minutes": 15 },
    "cdr": { "id": "cdr-uuid", "settlement_status": "settled", "total_cost_inr": 240.00, "tax_amount": 36.57, "settled_at": "2026-10-09T11:20:00.000Z" }
  }
}
```

#### Error Responses
- `400 INVALID_ID` — malformed UUID
- `401 UNAUTHORIZED` — not authenticated
- `403 OPERATOR_ROLE_REQUIRED` — driver account
- `404 SESSION_NOT_FOUND` — session doesn't exist or belongs to another CPO

---

### `POST /api/v1/operator/sessions/:id/remote-stop`

Dispatches an OCPP `RequestStopTransaction` command to the active charger. Session is only marked stopped if the charger returns `Accepted`.

#### Path Parameters
- `id` — Active session UUID

#### Request Body
```json
{ "timeoutMs": 10000 }
```

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "session": { "id": "sess-uuid", "status": "stopped", "energy_kwh": 14.5 },
    "command": "RequestStopTransaction",
    "outcome": "Confirmed"
  },
  "message": "Remote stop executed successfully."
}
```

#### Error Responses
| Status | Code | Description |
|---|---|---|
| `400` | `INVALID_ID` | Malformed session UUID |
| `401` | `UNAUTHORIZED` | Not authenticated |
| `403` | `OPERATOR_ROLE_REQUIRED` | Driver account |
| `403` | `CPO_ACCESS_DENIED` | Session belongs to another CPO |
| `404` | `SESSION_NOT_FOUND` | Session not found |
| `409` | `SESSION_ALREADY_STOPPED` | Session already in terminal state |
| `409` | `REMOTE_STOP_REJECTED` | Charger rejected `RequestStopTransaction` |
| `503` | `STATION_OFFLINE` | Charger is disconnected from OCPP gateway |
| `504` | `STATION_TIMEOUT` | Charger did not respond within `timeoutMs` |

