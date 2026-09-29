/**
 * frontend/src/context/AuthContext.jsx
 *
 * React Context provider for VahanGrid authentication state.
 *
 * Security:
 * - JWT is in HTTP-only cookie managed by browser/backend.
 * - This context holds only safe user identity metadata (id, name, email, phone).
 * - On startup, an initial GET /auth/me check determines if an active session exists.
 * - During the initial check, `loading` is true to avoid flash of wrong UI.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initial check on application mount
  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const currentUser = await authService.getCurrentUser();
        if (isMounted) {
          setUser(currentUser);
        }
      } catch (err) {
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const loggedInUser = await authService.login({ email, password });
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const register = useCallback(async ({ name, email, phone, password }) => {
    const registeredUser = await authService.register({ name, email, phone, password });
    setUser(registeredUser);
    return registeredUser;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const currentUser = await authService.getCurrentUser();
    setUser(currentUser);
    return currentUser;
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
