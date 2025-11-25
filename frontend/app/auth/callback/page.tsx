'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import api from '@/lib/api';
import { useAuth } from '@/lib/store';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams?.get('code');
      const state = searchParams?.get('state');
      const errorParam = searchParams?.get('error');

      if (errorParam) {
        setError('Authentication failed. Please try again.');
        setTimeout(() => router.push('/'), 3000);
        return;
      }

      if (!code || !state) {
        setError('Invalid callback parameters.');
        setTimeout(() => router.push('/'), 3000);
        return;
      }

      try {
        console.log('[AUTH CALLBACK] Starting callback with code:', code?.substring(0, 10) + '...');

        // The auth service handles the callback and sets the session cookie
        const response = await api.get(
          `/api/auth/callback?code=${code}&state=${state}`
        );

        console.log('[AUTH CALLBACK] Callback response:', response.status);
        console.log('[AUTH CALLBACK] Response headers:', response.headers);
        console.log('[AUTH CALLBACK] Document cookie after callback:', document.cookie);

        // Fetch user data after successful authentication
        console.log('[AUTH CALLBACK] Fetching user data from /api/me');
        const userResponse = await api.get('/api/me');
        console.log('[AUTH CALLBACK] User data fetched:', userResponse.data);
        setUser(userResponse.data);

        // Redirect to dashboard
        router.push('/dashboard');
      } catch (error: any) {
        console.error('[AUTH CALLBACK] Callback failed:', error);
        console.error('[AUTH CALLBACK] Error response:', error.response);
        console.error('[AUTH CALLBACK] Document cookie on error:', document.cookie);
        setError(error.response?.data?.message || 'Authentication failed');
        setTimeout(() => router.push('/'), 3000);
      }
    };

    handleCallback();
  }, [searchParams, router, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        {error ? (
          <>
            <div className="text-red-500 text-xl font-semibold">{error}</div>
            <p className="text-gray-400">Redirecting to login...</p>
          </>
        ) : (
          <>
            <LoadingSpinner size="lg" />
            <p className="text-gray-400">Completing authentication...</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
