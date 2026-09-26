/**
 * ============================================================================
 * VAHANGRID ROUTE & NAVIGATION SERVICE
 * ============================================================================
 * 
 * ARCHITECTURAL NOTICE:
 * Handles place searching (geocoding), road routing polyline generation,
 * and EV charging stop computation.
 * 
 * In production phases:
 * - Will integrate official Mapbox/Google/HERE/OpenStreetMap routing APIs
 * - Multi-stop energy estimation algorithms factoring topography and weather
 * ============================================================================
 */

import { DEFAULT_CORRIDOR_PATH } from '../data/mockData';
import { haversineKm, filterStationsAlongPolyline } from '../utils/geoUtils';

const PHOTON_API_URL = import.meta.env.VITE_PHOTON_API_URL || 'https://photon.komoot.io/api';
const OSRM_ROUTING_URL = import.meta.env.VITE_OSRM_ROUTING_URL || 'https://router.project-osrm.org/route/v1/driving/';

const FALLBACK_CITIES = [
  { displayName: "Delhi, National Capital Territory, India", shortName: "Delhi", lat: 28.6139, lng: 77.2090 },
  { displayName: "Noida, Uttar Pradesh, India", shortName: "Noida", lat: 28.5355, lng: 77.3910 },
  { displayName: "Lucknow, Uttar Pradesh, India", shortName: "Lucknow", lat: 26.8467, lng: 80.9462 },
  { displayName: "Kanpur, Uttar Pradesh, India", shortName: "Kanpur", lat: 26.4499, lng: 80.3319 },
  { displayName: "Agra, Uttar Pradesh, India", shortName: "Agra", lat: 27.1767, lng: 78.0081 },
  { displayName: "Mathura, Uttar Pradesh, India", shortName: "Mathura", lat: 27.4924, lng: 77.6737 },
  { displayName: "Mumbai, Maharashtra, India", shortName: "Mumbai", lat: 19.0760, lng: 72.8777 },
  { displayName: "Pune, Maharashtra, India", shortName: "Pune", lat: 18.5204, lng: 73.8567 },
  { displayName: "Bengaluru, Karnataka, India", shortName: "Bengaluru", lat: 12.9716, lng: 77.5946 },
  { displayName: "Mysuru, Karnataka, India", shortName: "Mysuru", lat: 12.2958, lng: 76.6394 },
  { displayName: "Hyderabad, Telangana, India", shortName: "Hyderabad", lat: 17.3850, lng: 78.4867 },
  { displayName: "Chennai, Tamil Nadu, India", shortName: "Chennai", lat: 13.0827, lng: 80.2707 },
  { displayName: "Ahmedabad, Gujarat, India", shortName: "Ahmedabad", lat: 23.0225, lng: 72.5714 },
  { displayName: "Jaipur, Rajasthan, India", shortName: "Jaipur", lat: 26.9124, lng: 75.7873 },
  { displayName: "Kolkata, West Bengal, India", shortName: "Kolkata", lat: 22.5726, lng: 88.3639 },
];

export const routeService = {
  /**
   * Search Indian cities, towns, and highways by query string.
   */
  async searchPlaces(query) {
    if (!query || query.trim().length < 2) return [];

    try {
      const url = `${PHOTON_API_URL}?q=${encodeURIComponent(query)}&bbox=68.0,6.0,98.0,36.0&limit=8`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Geocoding request failed');
      const data = await res.json();

      const indiaFeatures = (data.features || []).filter(
        (f) => f.properties.country === 'India' || !f.properties.country
      );

      if (indiaFeatures.length > 0) {
        return indiaFeatures.slice(0, 6).map((f) => {
          const p = f.properties;
          const parts = [p.name, p.city || p.county, p.state, p.country].filter(Boolean);
          const uniqueParts = [...new Set(parts)];
          return {
            displayName: uniqueParts.join(', '),
            shortName: p.name || uniqueParts[0],
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
            type: p.osm_value || 'place',
          };
        });
      }

      // Fallback matching
      return this.getFallbackPlaces(query);
    } catch (err) {
      console.warn('Geocoding service unavailable, utilizing local fallback cities:', err);
      return this.getFallbackPlaces(query);
    }
  },

  getFallbackPlaces(query) {
    const q = query.toLowerCase();
    const matches = FALLBACK_CITIES.filter((c) => c.displayName.toLowerCase().includes(q));
    if (matches.length > 0) return matches;
    return FALLBACK_CITIES.slice(0, 5);
  },

  /**
   * Fetches driving route polyline and distance from OSRM.
   */
  async fetchRoute(fromCoords, toCoords) {
    if (!fromCoords || !toCoords) return null;

    try {
      const url = `${OSRM_ROUTING_URL}${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('OSRM routing request failed');
      const data = await res.json();

      if (!data.routes || data.routes.length === 0) return null;

      const route = data.routes[0];
      // OSRM coordinates are [lng, lat] -> convert to Leaflet [lat, lng]
      const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

      return {
        routeCoords: coords,
        distanceKm: Math.round(route.distance / 1000),
        durationMins: Math.round(route.duration / 60),
      };
    } catch (err) {
      console.warn('OSRM routing service unavailable, returning interpolated corridor:', err);
      // Construct approximate direct route with intermediate waypoints
      const directDistance = Math.round(
        haversineKm(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng)
      );
      const interpolated = [
        [fromCoords.lat, fromCoords.lng],
        [(fromCoords.lat * 2 + toCoords.lat) / 3, (fromCoords.lng * 2 + toCoords.lng) / 3],
        [(fromCoords.lat + toCoords.lat * 2) / 3, (fromCoords.lng + toCoords.lng * 2) / 3],
        [toCoords.lat, toCoords.lng],
      ];
      return {
        routeCoords: interpolated,
        distanceKm: directDistance,
        durationMins: Math.round((directDistance / 70) * 60), // estimated 70 km/h average
      };
    }
  },

  /**
   * Computes recommended EV charging stops along a route.
   */
  planEVStops({ routeCoords, totalDistanceKm, startSoc, stationsList, vehicle }) {
    if (!routeCoords || routeCoords.length < 2 || !totalDistanceKm) return [];

    const ratedRange = vehicle?.range || 437;
    const stationsAlong = filterStationsAlongPolyline(routeCoords, stationsList, 35);

    const plannedStops = [];
    let currentKm = 0;
    let currentSoc = startSoc;

    let iterations = 0;
    while (iterations < 10) {
      iterations++;
      const currentRemainingKm = ratedRange * (currentSoc / 100);
      const remainingDistanceToDest = totalDistanceKm - currentKm;

      // Check if destination is reachable with a 10% safety buffer
      if (currentRemainingKm >= remainingDistanceToDest + ratedRange * 0.1) {
        break;
      }

      // Greedily find farthest reachable station along the corridor
      let candidateStation = null;
      for (const st of stationsAlong) {
        if (plannedStops.some((s) => s.id === st.id)) continue;
        if (st.kmAlongRoute <= currentKm) continue;

        const distanceAhead = st.kmAlongRoute - currentKm;
        if (distanceAhead <= currentRemainingKm - ratedRange * 0.08) {
          candidateStation = st;
        }
      }

      // If no candidate is reachable within ideal buffer, take nearest ahead
      if (!candidateStation) {
        for (const st of stationsAlong) {
          if (plannedStops.some((s) => s.id === st.id)) continue;
          if (st.kmAlongRoute > currentKm) {
            candidateStation = st;
            break;
          }
        }
      }

      if (!candidateStation) break;

      const arrivalSoc = Math.max(
        5,
        Math.round(currentSoc - ((candidateStation.kmAlongRoute - currentKm) / ratedRange) * 100)
      );
      const targetSoc = 80;
      const energyNeededKwh = Math.round(
        (vehicle?.battery || 40.5) * ((targetSoc - arrivalSoc) / 100) * 10
      ) / 10;
      const chargeTimeMins = Math.round((energyNeededKwh / (candidateStation.power || 60)) * 60);

      plannedStops.push({
        ...candidateStation,
        arrivalSoc,
        departureSoc: targetSoc,
        energyNeededKwh,
        chargeTimeMins: Math.max(12, chargeTimeMins),
        estimatedCost: Math.round(energyNeededKwh * (candidateStation.price || 18)),
      });

      currentKm = candidateStation.kmAlongRoute;
      currentSoc = targetSoc;
    }

    return plannedStops;
  },

  getDefaultCorridor() {
    return [...DEFAULT_CORRIDOR_PATH];
  }
};
