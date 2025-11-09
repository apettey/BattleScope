import { useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { ApiError } from './http.js';

/**
 * Custom hook that wraps API calls with automatic 401 handling
 *
 * When any API call returns 401, it automatically logs out the user
 * and redirects to the login screen.
 */
export function useApiCall() {
  const { handleApiError } = useAuth();

  const wrapApiCall = useCallback(
    async <T>(apiCall: () => Promise<T>): Promise<T> => {
      try {
        return await apiCall();
      } catch (error) {
        // If it's a 401, clear the user session
        if (error instanceof ApiError && error.status === 401) {
          handleApiError(error);
        }
        // Re-throw so components can still handle the error locally if needed
        throw error;
      }
    },
    [handleApiError],
  );

  return { wrapApiCall };
}
