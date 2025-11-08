/**
 * Authentication context provider
 */

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { fetchMe, logout as apiLogout, type MeResponse } from './api.js';

interface AuthContextValue {
  user: MeResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
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
      if (err instanceof Error && err.message.includes('401')) {
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

  useEffect(() => {
    void fetchUser();
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    error,
    refetch: fetchUser,
    logout,
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
