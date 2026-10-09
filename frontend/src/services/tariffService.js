/**
 * frontend/src/services/tariffService.js
 *
 * REST API client for VahanGrid Tariffs and Pricing Operations (Phase 3E & 4D).
 * Connects to:
 *   - GET    /api/v1/tariffs           (List tariffs scoped to operator's CPO)
 *   - POST   /api/v1/tariffs           (Create new CPO or station tariff)
 *   - GET    /api/v1/tariffs/:id       (Get single tariff details)
 *   - PATCH  /api/v1/tariffs/:id       (Update mutable tariff parameters)
 *   - DELETE /api/v1/tariffs/:id       (Deactivate / delete tariff)
 *   - GET    /api/v1/tariffs/resolve   (Hierarchical active tariff resolution)
 *   - POST   /api/v1/tariffs/calculate (Authoritative server-side pricing calculator)
 *
 * Security & Tenancy:
 *   - Credentials: 'include' transports HTTP-only JWT auth cookie.
 *   - Multi-tenant scoping enforced server-side from req.user.cpo_id.
 *   - Historical sessions and CDR snapshots remain immutable when tariffs are edited.
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
    const message = json?.error?.message || 'Access denied. You can only manage tariffs belonging to your CPO.';
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

export const tariffService = {
  /**
   * List tariffs filtered by optional location, active status, search string, or CPO.
   * Multi-tenant scoping: Operators automatically see only their own CPO's tariffs.
   * @param {{ location_id?: string, is_active?: boolean|string, search?: string, cpo_id?: string }} [params]
   * @returns {Promise<Array<object>>}
   */
  async listTariffs({ location_id = null, is_active = null, search = '', cpo_id = null } = {}) {
    const params = new URLSearchParams();
    if (location_id) params.append('location_id', location_id);
    if (is_active !== null && is_active !== undefined && is_active !== 'all') {
      params.append('is_active', String(is_active));
    }
    if (search && search.trim()) params.append('search', search.trim());
    if (cpo_id) params.append('cpo_id', cpo_id);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/tariffs${query}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    const json = await handleResponse(res, 'Failed to fetch tariff plans.');
    return json.data || [];
  },

  /**
   * Fetch single tariff by UUID.
   * @param {string} id - Tariff UUID
   * @returns {Promise<object>}
   */
  async getTariff(id) {
    if (!id) throw new Error('Tariff ID is required');
    const res = await fetch(`${API_BASE_URL}/tariffs/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    const json = await handleResponse(res, 'Failed to fetch tariff details.');
    return json.data;
  },

  /**
   * Create a new tariff for the authenticated operator's CPO.
   * Server automatically attaches operator's cpo_id.
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async createTariff(payload) {
    const res = await fetch(`${API_BASE_URL}/tariffs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const json = await handleResponse(res, 'Failed to create tariff plan.');
    return json.data;
  },

  /**
   * Update mutable fields of an existing tariff belonging to operator's CPO.
   * @param {string} id - Tariff UUID
   * @param {object} updates
   * @returns {Promise<object>}
   */
  async updateTariff(id, updates) {
    if (!id) throw new Error('Tariff ID is required');
    const res = await fetch(`${API_BASE_URL}/tariffs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    });

    const json = await handleResponse(res, 'Failed to update tariff plan.');
    return json.data;
  },

  /**
   * Deactivate or delete a tariff.
   * If historical sessions reference it, the server automatically soft-deactivates it.
   * @param {string} id - Tariff UUID
   * @returns {Promise<{ deleted: boolean, deactivated: boolean, message: string }>}
   */
  async deleteTariff(id) {
    if (!id) throw new Error('Tariff ID is required');
    const res = await fetch(`${API_BASE_URL}/tariffs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    const json = await handleResponse(res, 'Failed to delete or deactivate tariff.');
    return json.data;
  },

  /**
   * Resolve hierarchical active tariff for a station or target.
   * @param {{ location_id?: string, connector_id?: string, evse_id?: string, cpo_id?: string }} params
   * @returns {Promise<object|null>}
   */
  async resolveTariff(params = {}) {
    const q = new URLSearchParams();
    if (params.location_id) q.append('location_id', params.location_id);
    if (params.connector_id) q.append('connector_id', params.connector_id);
    if (params.evse_id) q.append('evse_id', params.evse_id);
    if (params.cpo_id) q.append('cpo_id', params.cpo_id);

    const res = await fetch(`${API_BASE_URL}/tariffs/resolve?${q.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (res.status === 404) return null;
    const json = await handleResponse(res, 'Failed to resolve applicable tariff.');
    return json.data;
  },

  /**
   * Server-authoritative calculation of charging price based on tariff and metrics.
   * @param {{ tariff_id?: string, tariff?: object, metrics: { energy_kwh?: number, duration_minutes?: number, idle_minutes?: number } }} payload
   * @returns {Promise<object>}
   */
  async calculatePricing(payload) {
    const res = await fetch(`${API_BASE_URL}/tariffs/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const json = await handleResponse(res, 'Failed to calculate pricing.');
    return json.data;
  },
};
