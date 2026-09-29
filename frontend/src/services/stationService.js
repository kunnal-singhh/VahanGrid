/**
 * frontend/src/services/stationService.js
 *
 * VahanGrid Station Service — Phase 3A: Real Backend REST API Integration.
 *
 * Connects frontend React components to the Express + PostgreSQL/PostGIS backend:
 *   - GET /api/v1/stations
 *   - GET /api/v1/stations/:id
 *   - GET /api/v1/stations/nearby?lat=...&lng=...&radius_km=...
 *
 * Maintains the service boundary contract: components call stationService methods,
 * never raw fetch() directly.
 */

import { OPERATORS } from '../data/mockData';
import { filterStationsAlongPolyline } from '../utils/geoUtils';

// Base backend API URL from environment variable (.env) with safe localhost fallback
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

/**
 * Maps raw backend API location record to UI presentational model.
 * Preserves all PostGIS coordinates as standard numbers and extracts top power and primary plug.
 */
function mapApiStationToUI(apiStation) {
  // Derive operator key matching UI operator pills ('tata', 'statiq', 'chargezone', 'jiobp', 'kazam')
  const shortCode = apiStation.cpo?.short_code?.toLowerCase() || '';
  const opKey = shortCode.replace(/[^a-z0-9]/g, '');
  const operator = opKey.startsWith('tata') ? 'tata' : opKey;

  // Determine top power and primary connector standard across EVSEs
  let maxPower = 50;
  let primaryConnector = 'CCS2';

  if (Array.isArray(apiStation.evses) && apiStation.evses.length > 0) {
    for (const evse of apiStation.evses) {
      if (evse.max_power_kw && evse.max_power_kw > maxPower) {
        maxPower = evse.max_power_kw;
      }
      if (Array.isArray(evse.connectors) && evse.connectors.length > 0) {
        primaryConnector = evse.connectors[0].standard || primaryConnector;
      }
    }
  }

  const address = [apiStation.address_line1, apiStation.address_line2, apiStation.city, apiStation.state]
    .filter(Boolean)
    .join(', ');

  return {
    id: apiStation.id,
    name: apiStation.name,
    operator: operator,
    cpo: apiStation.cpo,
    address: address,
    city: apiStation.city,
    state: apiStation.state,
    lat: apiStation.latitude,
    lng: apiStation.longitude,
    latitude: apiStation.latitude,
    longitude: apiStation.longitude,
    status: apiStation.status === 'active' ? 'available' : apiStation.status,
    connector: primaryConnector,
    power: maxPower,
    // Note: Live tariff & dynamic queue wait time will connect in Phase 3B/4
    price: 19.5,
    queue: 0,
    waitMin: 0,
    uptime: 99.4,
    latency: 35,
    voltage: 415,
    current: 0,
    temp: 34,
    distance_km: apiStation.distance_km !== undefined ? apiStation.distance_km : null,
    evses: apiStation.evses || [],
  };
}

export const stationService = {
  /**
   * Fetches all charging stations from the real backend REST API with client-side filtering.
   */
  async getStations({ operator = 'all', status = 'all', connector = 'all', search = '' } = {}) {
    try {
      const res = await fetch(`${API_BASE_URL}/stations`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch stations from API`);
      }

      const json = await res.json();
      let stations = (json.data || []).map(mapApiStationToUI);

      // Filter by operator network
      if (operator && operator !== 'all') {
        stations = stations.filter((s) => s.operator === operator);
      }

      // Filter by operational status
      if (status && status !== 'all') {
        stations = stations.filter((s) => s.status === status);
      }

      // Filter by connector type
      if (connector && connector !== 'all') {
        stations = stations.filter((s) => s.connector === connector);
      }

      // Text search query
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        stations = stations.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q) ||
            (s.address && s.address.toLowerCase().includes(q)) ||
            (s.city && s.city.toLowerCase().includes(q))
        );
      }

      return stations;
    } catch (err) {
      console.error('[stationService] Error communicating with backend stations API:', err.message);
      throw err;
    }
  },

  /**
   * Retrieves a single station by its unique UUID from the backend API.
   */
  async getStationById(id) {
    try {
      const res = await fetch(`${API_BASE_URL}/stations/${id}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`HTTP ${res.status}: Failed to fetch station by id`);
      }

      const json = await res.json();
      return json.data ? mapApiStationToUI(json.data) : null;
    } catch (err) {
      console.error(`[stationService] Error retrieving station ${id}:`, err.message);
      return null;
    }
  },

  /**
   * Retrieves stations within a given radius (km) using the PostGIS spatial query endpoint.
   */
  async getNearbyStations(lat, lng, radiusKm = 5) {
    try {
      const url = `${API_BASE_URL}/stations/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius_km=${encodeURIComponent(radiusKm)}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch nearby stations`);
      }

      const json = await res.json();
      return (json.data || []).map(mapApiStationToUI);
    } catch (err) {
      console.error('[stationService] Error retrieving nearby stations:', err.message);
      return [];
    }
  },

  /**
   * Fetches operators registered in the VahanGrid network.
   */
  async getOperators() {
    return [...OPERATORS];
  },

  /**
   * Finds stations situated along a specified polyline path.
   */
  async getStationsAlongRoute(routeCoords, maxDetourKm = 30) {
    const allStations = await this.getStations();
    return filterStationsAlongPolyline(routeCoords, allStations, maxDetourKm);
  },

  /**
   * Reserves a charging slot (Client-side simulation until Reservation API in Phase 3B).
   */
  async reserveSlot(stationId) {
    return { success: true, stationId, holdDurationMinutes: 30 };
  },

  /**
   * Cancels a slot reservation.
   */
  async cancelReservation(stationId) {
    return { success: true, stationId };
  },

  /**
   * Status update stub for live charging sessions.
   */
  updateStationStatus(_stationId, _status, _current = 0) {
    // Session state is managed by chargingService
  }
};
