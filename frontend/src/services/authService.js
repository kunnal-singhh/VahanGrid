/**
 * frontend/src/services/authService.js
 *
 * Client-side authentication service for VahanGrid.
 * Communicates with Express + PostgreSQL backend:
 *   - POST /api/v1/auth/register
 *   - POST /api/v1/auth/login
 *   - POST /api/v1/auth/logout
 *   - GET  /api/v1/auth/me
 *
 * Critical security requirement:
 * The JWT is stored exclusively in an HTTP-only cookie by the backend.
 * JavaScript never reads or stores the JWT in localStorage, sessionStorage, or state.
 * All requests that depend on authentication MUST include { credentials: 'include' }.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

export const authService = {
  /**
   * Register a new user driver account.
   * On success, backend sets HTTP-only cookie 'vg_token' and returns safe user.
   * @param {{ name: string, email: string, phone?: string, password: string }} credentials
   * @returns {Promise<object>} Safe user profile
   */
  async register({ name, email, phone, password }) {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, email, phone, password }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) {
      const err = new Error(body.error?.message || 'Registration failed.');
      err.code = body.error?.code || 'REGISTRATION_ERROR';
      err.status = res.status;
      err.details = body.error?.details || [];
      throw err;
    }

    return body.data.user;
  },

  /**
   * Log in an existing user with email and password.
   * On success, backend sets HTTP-only cookie 'vg_token' and returns safe user.
   * @param {{ email: string, password: string }} credentials
   * @returns {Promise<object>} Safe user profile
   */
  async login({ email, password }) {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) {
      const err = new Error(body.error?.message || 'Login failed.');
      err.code = body.error?.code || 'LOGIN_ERROR';
      err.status = res.status;
      throw err;
    }

    return body.data.user;
  },

  /**
   * Log out the current user.
   * Calls the backend to clear the HTTP-only cookie.
   * @returns {Promise<boolean>}
   */
  async logout() {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch (err) {
      console.error('[authService] Logout network error:', err);
      return false;
    }
  },

  /**
   * Fetch the currently authenticated user's safe profile.
   * Used for initial app load & session verification.
   * @returns {Promise<object|null>} Safe user profile or null if unauthenticated
   */
  async getCurrentUser() {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (res.status === 401) {
        return null; // Normal unauthenticated state
      }

      if (!res.ok) {
        return null;
      }

      const body = await res.json();
      return body.data?.user || null;
    } catch (err) {
      console.warn('[authService] Error fetching current user:', err);
      return null;
    }
  },
};
