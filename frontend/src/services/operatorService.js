/**
 * frontend/src/services/operatorService.js
 *
 * REST API client for VahanGrid Operator Operations (Phase 4A.2 & 4B).
 * Connects to:
 *   - GET /api/v1/operator/overview
 *   - GET /api/v1/operator/stations
 *   - GET /api/v1/operator/sessions
 *   - GET /api/v1/operator/analytics
 *
 * Multi-Tenant Security & Authoritative Data:
 *   - All requests send credentials: 'include' for HTTP-only JWT session cookies.
 *   - Identity & tenancy are determined server-side from req.user.cpo_id.
 *   - Financial totals and charging aggregates are sourced from immutable CDRs.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

async function handleResponse(res, fallbackMessage) {
  if (res.status === 401) {
    const err = new Error('Authentication required. Please sign in with an operator account.');
    err.status = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const json = await res.json().catch(() => ({}));

  if (res.status === 403) {
    const code = json?.error?.code || 'FORBIDDEN';
    const message = json?.error?.message || 'Access denied. Operator role is required.';
    const err = new Error(message);
    err.status = 403;
    err.code = code;
    throw err;
  }

  if (!res.ok) {
    const message = json?.error?.message || fallbackMessage;
    const err = new Error(message);
    err.status = res.status;
    err.code = json?.error?.code || 'API_ERROR';
    err.details = json?.error?.details || null;
    throw err;
  }

  return json;
}

export const operatorService = {
  /**
   * Fetch operator fleet overview KPIs and financial aggregates.
   * @param {{ period?: string, cpoId?: string }} [params]
   * @returns {Promise<object>} { cpo, stations, connectors, sessions, period, metrics }
   */
  async getOverview({ period = '30d', cpoId = null } = {}) {
    const params = new URLSearchParams();
    if (period) params.append('period', period);
    if (cpoId) params.append('cpo_id', cpoId);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/operator/overview${query}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    const json = await handleResponse(res, 'Failed to fetch operator overview metrics.');
    return json.data;
  },

  /**
   * Fetch paginated list of operator fleet stations with hardware status and OCPP telemetry.
   * @param {{ page?: number, limit?: number, status?: string, search?: string, cpoId?: string }} [params]
   * @returns {Promise<{ stations: Array<object>, meta: object }>}
   */
  async getStations({ page = 1, limit = 10, status = 'all', search = '', cpoId = null } = {}) {
    const params = new URLSearchParams();
    if (page) params.append('page', String(page));
    if (limit) params.append('limit', String(limit));
    if (status && status !== 'all') params.append('status', status);
    if (search && search.trim()) params.append('search', search.trim());
    if (cpoId) params.append('cpo_id', cpoId);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/operator/stations${query}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    const json = await handleResponse(res, 'Failed to fetch fleet stations inventory.');
    return {
      stations: json.data || [],
      meta: json.meta || { page: 1, limit: 10, total_count: 0, total_pages: 1 },
    };
  },

  /**
   * Fetch paginated charging sessions feed with masked driver privacy & linked CDR settlement.
   * @param {{ page?: number, limit?: number, status?: string, stationId?: string, cpoId?: string }} [params]
   * @returns {Promise<{ sessions: Array<object>, meta: object }>}
   */
  async getSessions({ page = 1, limit = 20, status = 'all', stationId = null, cpoId = null } = {}) {
    const params = new URLSearchParams();
    if (page) params.append('page', String(page));
    if (limit) params.append('limit', String(limit));
    if (status && status !== 'all') params.append('status', status);
    if (stationId) params.append('station_id', stationId);
    if (cpoId) params.append('cpo_id', cpoId);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/operator/sessions${query}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    const json = await handleResponse(res, 'Failed to fetch charging sessions feed.');
    return {
      sessions: json.data || [],
      meta: json.meta || { page: 1, limit: 20, total_count: 0, total_pages: 1 },
    };
  },

  /**
   * Fetch continuous time-series analytics (hourly or daily buckets).
   * @param {{ period?: string, cpoId?: string }} [params]
   * @returns {Promise<object>} { cpo, period, granularity, summary, time_series }
   */
  async getAnalytics({ period = '7d', cpoId = null } = {}) {
    const params = new URLSearchParams();
    if (period) params.append('period', period);
    if (cpoId) params.append('cpo_id', cpoId);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/operator/analytics${query}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    const json = await handleResponse(res, 'Failed to fetch analytics time-series data.');
    return json.data;
  },

  /**
   * Fetch single station details including EVSEs and connectors for operator inspection/editing.
   * Multi-tenant security enforced on server (operator can only view their own CPO stations).
   * @param {string} stationId - Station UUID
   * @returns {Promise<object>} station detail record
   */
  async getStationDetail(stationId) {
    if (!stationId) throw new Error('stationId is required');

    const res = await fetch(`${API_BASE_URL}/operator/stations/${encodeURIComponent(stationId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    const json = await handleResponse(res, 'Failed to fetch station details.');
    return json.data;
  },

  /**
   * Update mutable metadata of an operator's station.
   * Multi-tenant security enforced on server (operator can only update their own CPO stations).
   * @param {string} stationId - Station UUID
   * @param {object} updates - mutable metadata fields { name, address_line1, address_line2, city, state, postal_code, timezone, status, latitude, longitude }
   * @returns {Promise<object>} updated station record
   */
  async updateStation(stationId, updates) {
    if (!stationId) throw new Error('stationId is required');

    const res = await fetch(`${API_BASE_URL}/operator/stations/${encodeURIComponent(stationId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    });

    const json = await handleResponse(res, 'Failed to update station metadata.');
    return json.data;
  },
};

