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
