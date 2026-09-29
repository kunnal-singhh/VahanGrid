/**
 * frontend/src/services/vehicleService.js
 *
 * REST API client for VahanGrid vehicle management (Phase 3C.2).
 * Connects to Express + PostgreSQL:
 *   - GET    /api/v1/vehicles
 *   - POST   /api/v1/vehicles
 *   - GET    /api/v1/vehicles/:id
 *   - PATCH  /api/v1/vehicles/:id
 *   - DELETE /api/v1/vehicles/:id
 *
 * Security:
 * - Credentials included automatically (credentials: 'include') for HTTP-only cookie.
 * - JWT is never handled, inspected, or stored in JavaScript.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

/**
 * Normalizes a raw backend vehicle record for UI compatibility.
 * Provides backwards-compatible field aliases (name, battery, range, connector)
 * so visual components render cleanly while preserving all schema fields.
 */
export function normalizeVehicle(v) {
  if (!v) return null;
  const name = v.name || `${v.manufacturer} ${v.model}${v.variant ? ` (${v.variant})` : ''}`.trim();
  const battery =
    v.battery !== undefined
      ? v.battery
      : typeof v.battery_capacity_kwh === 'number'
      ? v.battery_capacity_kwh
      : parseFloat(v.battery_capacity_kwh) || 40.0;

  // Estimate highway range (~8.5 km/kWh for Indian driving cycle) if not explicitly stored
  const range = v.range !== undefined ? v.range : Math.round(battery * 8.5);
  const connector = v.connector || v.connector_type || 'CCS2';

  return {
    ...v,
    name,
    battery,
    range,
    connector,
  };
}

export const vehicleService = {
  /**
   * Fetch all vehicles belonging to the authenticated user.
   * @returns {Promise<Array<object>>}
   */
  async getVehicles() {
    const res = await fetch(`${API_BASE_URL}/vehicles`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (res.status === 401) {
      const err = new Error('Authentication required. Please log in.');
      err.status = 401;
      err.code = 'UNAUTHENTICATED';
      throw err;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error?.message || 'Failed to fetch vehicles.');
      err.status = res.status;
      err.code = body.error?.code || 'FETCH_ERROR';
      throw err;
    }

    const body = await res.json();
    const rawVehicles = Array.isArray(body.data) ? body.data : [];
    return rawVehicles.map(normalizeVehicle);
  },

  /**
   * Fetch a single vehicle by ID.
   * @param {string} id
   * @returns {Promise<object>}
   */
  async getVehicleById(id) {
    const res = await fetch(`${API_BASE_URL}/vehicles/${id}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (res.status === 401) {
      const err = new Error('Authentication required. Please log in.');
      err.status = 401;
      throw err;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error?.message || 'Vehicle not found.');
      err.status = res.status;
      err.code = body.error?.code || 'VEHICLE_NOT_FOUND';
      throw err;
    }

    const body = await res.json();
    return normalizeVehicle(body.data);
  },

  /**
   * Create a new vehicle for the authenticated user.
   * @param {object} payload
   * @returns {Promise<object>} Created vehicle
   */
  async createVehicle(payload) {
    const res = await fetch(`${API_BASE_URL}/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) {
      const err = new Error(body.error?.message || 'Failed to create vehicle.');
      err.status = res.status;
      err.code = body.error?.code || 'CREATE_ERROR';
      err.details = body.error?.details || [];
      throw err;
    }

    return normalizeVehicle(body.data);
  },

  /**
   * Update an existing vehicle.
   * @param {string} id
   * @param {object} payload
   * @returns {Promise<object>} Updated vehicle
   */
  async updateVehicle(id, payload) {
    const res = await fetch(`${API_BASE_URL}/vehicles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) {
      const err = new Error(body.error?.message || 'Failed to update vehicle.');
      err.status = res.status;
      err.code = body.error?.code || 'UPDATE_ERROR';
      err.details = body.error?.details || [];
      throw err;
    }

    return normalizeVehicle(body.data);
  },

  /**
   * Delete a vehicle by ID.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteVehicle(id) {
    const res = await fetch(`${API_BASE_URL}/vehicles/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error?.message || 'Failed to delete vehicle.');
      err.status = res.status;
      err.code = body.error?.code || 'DELETE_ERROR';
      throw err;
    }

    return true;
  },

  /**
   * Helper to retrieve locally persisted active vehicle preference.
   */
  getActiveVehicleId() {
    try {
      return localStorage.getItem('vg_active_vehicle_id') || null;
    } catch {
      return null;
    }
  },

  /**
   * Helper to persist active vehicle preference.
   */
  setActiveVehicleId(id) {
    try {
      if (id) {
        localStorage.setItem('vg_active_vehicle_id', id);
      } else {
        localStorage.removeItem('vg_active_vehicle_id');
      }
    } catch {
      // Ignored if local storage disabled
    }
  },
};
