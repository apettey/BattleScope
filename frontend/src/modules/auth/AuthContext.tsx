/**
 * Authentication context provider
 */

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { fetchMe, logout as apiLogout, type MeResponse } from './api.js';
import { ApiError } from '../api/http.js';

interface AuthContextValue {
  user: MeResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
  handleApiError: (error: unknown) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchMe();
      setUser(data);
    } catch (err) {
      // If unauthorized, user is not logged in - this is expected
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setError(null);
      } else {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await apiLogout();
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  /**
   * Global API error handler
   * - 401: Session expired/invalid -> log out user
   * - 403: Insufficient permissions -> show error but keep logged in
   * - Other: Show generic error
   */
  const handleApiError = (error: unknown) => {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        // Session expired or invalid - log out
        setUser(null);
        setError(new Error('Your session has expired. Please log in again.'));
      } else if (error.status === 403) {
        // Permission denied - keep user logged in but show error
        setError(new Error('You do not have permission to access this feature.'));
      } else {
        setError(error);
      }
    } else if (error instanceof Error) {
      setError(error);
    } else {
      setError(new Error('An unknown error occurred'));
    }
  };

  useEffect(() => {
    void fetchUser();
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    error,
    refetch: fetchUser,
    logout,
    handleApiError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
