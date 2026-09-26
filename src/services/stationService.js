/**
 * ============================================================================
 * VAHANGRID STATION SERVICE
 * ============================================================================
 * 
 * ARCHITECTURAL NOTICE:
 * This service mediates all station queries, availability checks, and reservations.
 * 
 * CURRENT PHASE (Phase 1):
 * Returns DEVELOPMENT MOCK DATA (labeled in `src/data/mockData.js`).
 * 
 * FUTURE PHASES (Phase 2+):
 * Will make asynchronous HTTP/REST queries to:
 *   GET /api/v1/stations (PostgreSQL + PostGIS geospatial indexing)
 *   POST /api/v1/stations/:id/reserve (OCPI Reservation Module)
 * 
 * The React visual layer calls `stationService` methods and remains unchanged.
 * ============================================================================
 */

import { STATIONS, OPERATORS } from '../data/mockData';
import { filterStationsAlongPolyline } from '../utils/geoUtils';

// In-memory state holding the current station states during development session
let activeStationsState = [...STATIONS];

export const stationService = {
  /**
   * Fetches all charging stations with optional filtering.
   */
  async getStations({ operator = 'all', status = 'all', connector = 'all', search = '' } = {}) {
    // Simulated async network delay for realistic UI state handling
    await new Promise((resolve) => setTimeout(resolve, 60));

    let result = [...activeStationsState];

    if (operator && operator !== 'all') {
      result = result.filter((s) => s.operator === operator);
    }

    if (status && status !== 'all') {
      result = result.filter((s) => s.status === status);
    }

    if (connector && connector !== 'all') {
      result = result.filter((s) => s.connector === connector);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (s.address && s.address.toLowerCase().includes(q))
      );
    }

    return result;
  },

  /**
   * Retrieves a single station by its unique identifier.
   */
  async getStationById(id) {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return activeStationsState.find((s) => s.id === id) || null;
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
    await new Promise((resolve) => setTimeout(resolve, 40));
    return filterStationsAlongPolyline(routeCoords, activeStationsState, maxDetourKm);
  },

  /**
   * Reserves a charging slot (Simulation for Phase 1).
   */
  async reserveSlot(stationId) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    activeStationsState = activeStationsState.map((s) => {
      if (s.id === stationId) {
        return { ...s, status: 'reserved', waitMin: 30 };
      }
      return s;
    });
    return { success: true, stationId, holdDurationMinutes: 30 };
  },

  /**
   * Cancels a slot reservation.
   */
  async cancelReservation(stationId) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    activeStationsState = activeStationsState.map((s) => {
      if (s.id === stationId) {
        return { ...s, status: 'available', waitMin: 0 };
      }
      return s;
    });
    return { success: true, stationId };
  },

  /**
   * Updates station state (e.g. when charging begins or stops).
   */
  updateStationStatus(stationId, status, current = 0) {
    activeStationsState = activeStationsState.map((s) => {
      if (s.id === stationId) {
        return { ...s, status, current };
      }
      return s;
    });
  }
};
