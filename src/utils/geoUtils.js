import { INDIA_POLYGON } from '../data/mockData';

/**
 * Calculates great-circle distance between two coordinates in kilometers using Haversine formula.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Ray-casting algorithm to test if a point is within a polygon.
 */
export function isPointInPolygon(point, polygon = INDIA_POLYGON) {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Filters stations that lie within India geographic coordinates.
 */
export function isIndiaStation(station) {
  if (!station || typeof station.lat !== 'number' || typeof station.lng !== 'number') return false;
  if (station.lat < 6.0 || station.lat > 37.5 || station.lng < 68.0 || station.lng > 98.0) return false;
  return isPointInPolygon([station.lat, station.lng], INDIA_POLYGON);
}

/**
 * Finds charging stations within a given detour distance from a route polyline.
 */
export function filterStationsAlongPolyline(routeCoords, stations, maxDetourKm = 30) {
  if (!routeCoords || routeCoords.length < 2 || !stations || !stations.length) return [];

  // Compute cumulative distance array along route
  const cumKm = [0];
  for (let i = 1; i < routeCoords.length; i++) {
    cumKm.push(
      cumKm[i - 1] +
        haversineKm(
          routeCoords[i - 1][0],
          routeCoords[i - 1][1],
          routeCoords[i][0],
          routeCoords[i][1]
        )
    );
  }

  // Sample route points every ~3 km for fast lookup
  const totalRouteKm = cumKm[cumKm.length - 1];
  const step = Math.max(1, Math.floor(routeCoords.length / Math.max(1, totalRouteKm / 3)));
  const sampled = [];
  for (let i = 0; i < routeCoords.length; i += step) {
    sampled.push({ coord: routeCoords[i], km: cumKm[i] });
  }
  sampled.push({ coord: routeCoords[routeCoords.length - 1], km: cumKm[cumKm.length - 1] });

  return stations
    .filter((s) => s.lat && s.lng)
    .map((s) => {
      let minDist = Infinity;
      let nearestKm = 0;

      for (const pt of sampled) {
        const d = haversineKm(s.lat, s.lng, pt.coord[0], pt.coord[1]);
        if (d < minDist) {
          minDist = d;
          nearestKm = pt.km;
        }
      }

      if (minDist > maxDetourKm) return null;

      return {
        ...s,
        kmAlongRoute: Math.round(nearestKm),
        detourDistanceKm: Math.round(minDist * 10) / 10,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.kmAlongRoute - b.kmAlongRoute);
}
