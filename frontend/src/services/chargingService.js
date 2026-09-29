/**
 * frontend/src/services/chargingService.js
 *
 * VahanGrid Charging Session Service — Phase 3C.3: Real REST API Integration.
 *
 * Connects frontend React components to the Express + PostgreSQL backend:
 *   - POST /api/v1/sessions/start
 *   - GET  /api/v1/sessions/active
 *   - GET  /api/v1/sessions
 *   - GET  /api/v1/sessions/:id
 *   - POST /api/v1/sessions/:id/stop
 *
 * Eliminates all mock/simulated session behavior.
 * All requests include credentials: "include" for HTTP-only JWT cookies.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

/**
 * Standard friendly error messages for backend error codes.
 */
const ERROR_MESSAGES = {
  VALIDATION_ERROR: 'Invalid session parameters. Please verify connector and vehicle.',
  INVALID_UUID: 'Invalid identifier format.',
  VEHICLE_NOT_FOUND: 'Selected vehicle could not be found.',
  VEHICLE_NOT_OWNED: 'Please select one of your vehicles.',
  CONNECTOR_NOT_FOUND: 'Connector not found at this station.',
  CONNECTOR_HIERARCHY_INVALID: 'Connector is not properly configured.',
  CONNECTOR_UNAVAILABLE: 'This connector is no longer available.',
  CONNECTOR_OCCUPIED: 'This connector is already in use by another session.',
  SESSION_ALREADY_ACTIVE: 'You already have an active charging session.',
  SESSION_NOT_FOUND: 'Charging session not found.',
  SESSION_ALREADY_STOPPED: 'Charging session is already stopped.',
  SESSION_NOT_ACTIVE: 'This charging session is not currently active.',
};

/**
 * Maps raw backend session record to frontend presentation object.
 * Preserves all database columns while offering convenient UI aliases.
 */
export function normalizeSession(s) {
  if (!s) return null;

  const stationName = s.location?.name || 'Charging Station';
  const cpoName = s.cpo?.name || s.cpo?.short_code || 'Network Operator';
  const operator = (s.cpo?.short_code || s.cpo?.name || 'operator').toLowerCase().replace(/[^a-z0-9]/g, '');
  const vehicleName = s.vehicle
    ? `${s.vehicle.manufacturer} ${s.vehicle.model}${s.vehicle.variant ? ' ' + s.vehicle.variant : ''}`
    : 'Registered EV';
  const connectorStandard = s.connector?.standard || 'CCS2';
  const maxPowerKw = s.connector?.max_power_kw || s.evse?.max_power_kw || 50;

  return {
    ...s,
    // Presentational aliases
    stationName,
    cpoName,
    operator,
    vehicleName,
    connectorStandard,
    power: maxPowerKw,
    startSoc: s.start_soc ?? 20,
    currentSoc: s.end_soc ?? s.start_soc ?? 20,
    startTime: s.started_at ? new Date(s.started_at).getTime() : Date.now(),
    energyKwh: s.energy_kwh ?? 0,
    costAmount: s.cost_amount ?? 0,
    durationSeconds: s.duration_seconds ?? 0,
    isOffline: false,
  };
}

/**
 * Parses API error response and throws Error with user-friendly message and code.
 */
async function handleResponseError(res, fallbackMessage) {
  let errData = null;
  try {
    errData = await res.json();
  } catch {
    // Response not JSON
  }

  const code = errData?.error?.code || 'UNKNOWN_ERROR';
  const message = ERROR_MESSAGES[code] || errData?.error?.message || fallbackMessage || `HTTP ${res.status}`;

  const err = new Error(message);
  err.code = code;
  err.status = res.status;
  throw err;
}

export const chargingService = {
  /**
   * Starts a new charging session for the authenticated user.
   *
   * @param {string} connectorId - UUID of the connector to charge on
   * @param {string} vehicleId - UUID of the authenticated user's vehicle
   * @returns {Promise<Object>} Normalized active session object
   */
  async startChargingSession(connectorId, vehicleId) {
    if (!connectorId || !vehicleId) {
      throw new Error('Both connector and vehicle must be selected.');
    }

    const res = await fetch(`${API_BASE_URL}/sessions/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        connector_id: connectorId,
        vehicle_id: vehicleId,
      }),
    });

    if (!res.ok) {
      await handleResponseError(res, 'Failed to start charging session.');
    }

    const json = await res.json();
    return normalizeSession(json.data);
  },

  /**
   * Retrieves the current active charging session for the authenticated user.
   *
   * @returns {Promise<Object|null>} Normalized active session or null
   */
  async getActiveSession() {
    const res = await fetch(`${API_BASE_URL}/sessions/active`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!res.ok) {
      if (res.status === 401) return null;
      await handleResponseError(res, 'Failed to check active charging session.');
    }

    const json = await res.json();
    return json.data ? normalizeSession(json.data) : null;
  },

  /**
   * Lists all past and present charging sessions for the authenticated user.
   *
   * @returns {Promise<Array<Object>>} Array of normalized session objects
   */
  async getSessions() {
    const res = await fetch(`${API_BASE_URL}/sessions`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!res.ok) {
      if (res.status === 401) return [];
      await handleResponseError(res, 'Failed to retrieve charging sessions history.');
    }

    const json = await res.json();
    const list = json.data || [];
    return list.map(normalizeSession);
  },

  /**
   * Retrieves details for a specific session by ID.
   *
   * @param {string} id - UUID of session
   * @returns {Promise<Object|null>}
   */
  async getSessionById(id) {
    if (!id) return null;

    const res = await fetch(`${API_BASE_URL}/sessions/${encodeURIComponent(id)}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!res.ok) {
      if (res.status === 404 || res.status === 401) return null;
      await handleResponseError(res, 'Failed to retrieve session details.');
    }

    const json = await res.json();
    return json.data ? normalizeSession(json.data) : null;
  },

  /**
   * Stops an active charging session owned by the authenticated user.
   *
   * @param {string} id - UUID of the session to stop
   * @returns {Promise<Object>} Normalized stopped session object
   */
  async stopChargingSession(id) {
    if (!id) {
      throw new Error('Session ID is required to stop charging.');
    }

    const res = await fetch(`${API_BASE_URL}/sessions/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!res.ok) {
      await handleResponseError(res, 'Failed to stop charging session.');
    }

    const json = await res.json();
    return normalizeSession(json.data);
  },

  /**
   * Backward-compatible alias for startSession.
   */
  async startSession({ connectorId, vehicleId }) {
    return this.startChargingSession(connectorId, vehicleId);
  },

  /**
   * Backward-compatible alias for stopSession.
   */
  async stopSession({ session }) {
    const id = session?.id || session?.sessionId;
    return this.stopChargingSession(id);
  },
};
