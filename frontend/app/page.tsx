'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/store';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (user && !isLoading) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  const handleLogin = () => {
    window.location.href = '/api/auth/login';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-eve-blue rounded-2xl flex items-center justify-center">
            <span className="text-white font-bold text-4xl">B</span>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-white">BattleScope V3</h1>
          <p className="text-xl text-gray-400">
            EVE Online Battle Intelligence
          </p>
        </div>

        {/* Description */}
        <div className="space-y-4 text-gray-400">
          <p>
            Track battles in real-time, analyze killmails, and gain intelligence
            on conflicts across New Eden.
          </p>
          <ul className="text-sm space-y-2">
            <li>Real-time killmail feed and battle clustering</li>
            <li>Detailed battle reports with timelines</li>
            <li>Advanced search and filtering</li>
            <li>Custom notifications and watchlists</li>
          </ul>
        </div>

        {/* Login Button */}
        <div className="pt-6">
          <Button
            onClick={handleLogin}
            size="lg"
            fullWidth
            className="text-lg"
          >
            <svg
              className="w-6 h-6 mr-2"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
            </svg>
            Login with EVE Online
          </Button>
        </div>

        {/* Footer */}
        <div className="pt-8 text-xs text-gray-600">
          <p>
            BattleScope V3 uses EVE Online Single Sign-On (SSO) for authentication.
            <br />
            No passwords are stored. We only access public character information.
          </p>
        </div>
      </div>
    </div>
  );
}
