'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/store';
import api from '@/lib/api';
import { LoadingSpinner } from './LoadingSpinner';

const publicPaths = ['/', '/auth/callback'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, setUser, isLoading, setLoading } = useAuth();

  useEffect(() => {
    const fetchUser = async () => {
      // Skip auth check for public paths
      if (publicPaths.includes(pathname || '')) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get('/api/me');
        setUser(response.data);
      } catch (error) {
        console.error('Failed to fetch user:', error);
        setUser(null);
        router.push('/');
      }
    };

    fetchUser();
  }, [pathname, router, setUser, setLoading]);

  // Show loading spinner for protected routes
  if (isLoading && !publicPaths.includes(pathname || '')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Redirect to login if not authenticated on protected routes
  if (!user && !isLoading && !publicPaths.includes(pathname || '')) {
    router.push('/');
    return null;
  }

  return <>{children}</>;
}
