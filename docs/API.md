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
