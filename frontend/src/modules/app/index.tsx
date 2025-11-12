import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { BattlesView } from '../battles/components/BattlesView.js';
import { HomeView } from '../home/HomeView.js';
import { RecentKillsView } from '../killfeed/RecentKillsView.js';
import { AllianceView } from '../entities/AllianceView.js';
import { CorporationView } from '../entities/CorporationView.js';
import { CharacterView } from '../entities/CharacterView.js';
import { EnhancedProfileView } from '../auth/components/EnhancedProfileView.js';
import { AdminView } from '../auth/components/AdminView.js';
import { BattleReportsConfigView } from '../auth/components/BattleReportsConfigView.js';
import { UserMenu } from '../auth/components/UserMenu.js';
import { useAuth } from '../auth/AuthContext.js';
import { resolveBaseUrl } from '../api/http.js';

type TabId = 'home' | 'recent' | 'battles' | 'profile' | 'admin' | 'battle-reports-admin';
type EntityType = 'alliance' | 'corporation' | 'character';

type RouteState =
  | {
      type: 'tab';
      tabId: TabId;
    }
  | {
      type: 'entity';
      entityType: EntityType;
      entityId: string;
    };

const tabs: Array<{ id: TabId; label: string; render: () => JSX.Element; adminOnly?: boolean }> = [
  { id: 'home', label: 'Home', render: () => <HomeView /> },
  { id: 'recent', label: 'Recent Kills', render: () => <RecentKillsView /> },
  { id: 'battles', label: 'Battle Reports', render: () => <BattlesView /> },
  { id: 'profile', label: 'Profile', render: () => <EnhancedProfileView /> },
  { id: 'admin', label: 'Admin', render: () => <AdminView />, adminOnly: true },
  {
    id: 'battle-reports-admin',
    label: 'Battle Reports Admin',
    render: () => <BattleReportsConfigView />,
    adminOnly: true,
  },
];

const isValidTab = (value: string): value is TabId => tabs.some((tab) => tab.id === value);

const isValidEntityType = (value: string): value is EntityType =>
  value === 'alliance' || value === 'corporation' || value === 'character';

const parseRoute = (hash: string): RouteState => {
  const cleaned = hash.replace(/^#/, '');

  // Check for entity route: alliance:123, corporation:456, character:789
  const entityMatch = cleaned.match(/^(alliance|corporation|character):(\d+)$/);
  if (entityMatch) {
    const [, entityType, entityId] = entityMatch;
    if (isValidEntityType(entityType)) {
      return { type: 'entity', entityType, entityId };
    }
  }

  // Check for tab route
  if (isValidTab(cleaned)) {
    return { type: 'tab', tabId: cleaned };
  }

  // Default to home
  return { type: 'tab', tabId: 'home' };
};

const getInitialRoute = (): RouteState => {
  if (typeof window === 'undefined') {
    return { type: 'tab', tabId: 'home' };
  }
  return parseRoute(window.location.hash);
};

const getErrorMessage = (errorCode: string | null): string | null => {
  if (!errorCode) return null;
  switch (errorCode) {
    case 'org_not_allowed':
      return 'Authentication failed: Your corporation or alliance is not authorized to access this application. Please contact an administrator if you believe this is an error.';
    case 'auth_failed':
      return 'Authentication failed: Unable to complete login. Please try again.';
    default:
      return `Authentication error: ${errorCode}`;
  }
};

export const App: FC = () => {
  const [route, setRoute] = useState<RouteState>(() => getInitialRoute());
  const { user, loading } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);

  // Check for error query params from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      setAuthError(getErrorMessage(error));
      // Clear error from URL
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const next = parseRoute(window.location.hash);
      setRoute(next);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    let nextHash: string;
    if (route.type === 'tab') {
      nextHash = `#${route.tabId}`;
    } else {
      nextHash = `#${route.entityType}:${route.entityId}`;
    }
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }, [route]);

  const activeTab = route.type === 'tab' ? route.tabId : null;

  // Check if user is admin/super admin
  const isAdmin = user?.isSuperAdmin || user?.featureRoles.some((r) => r.roleKey === 'admin');

  // Filter tabs based on user permissions
  const visibleTabs = tabs.filter((tab) => {
    if (tab.adminOnly) {
      return isAdmin;
    }
    return true;
  });

  const renderView = () => {
    if (route.type === 'entity') {
      switch (route.entityType) {
        case 'alliance':
          return <AllianceView allianceId={route.entityId} />;
        case 'corporation':
          return <CorporationView corpId={route.entityId} />;
        case 'character':
          return <CharacterView characterId={route.entityId} />;
      }
    }

    const tab = tabs.find((t) => t.id === route.tabId) ?? tabs[0];
    return tab.render();
  };

  // Show loading state
  if (loading) {
    return (
      <main
        style={{
          padding: '2rem',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          minHeight: '100vh',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#475569' }}>Loading...</h2>
        </div>
      </main>
    );
  }

  // Show login screen if not authenticated
  if (!user) {
    const apiBaseUrl = resolveBaseUrl();

    return (
      <main
        style={{
          padding: '2rem',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          minHeight: '100vh',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: '1rem',
            padding: '3rem',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
            maxWidth: '32rem',
            width: '100%',
            textAlign: 'center',
          }}
        >
          <h1 style={{ marginBottom: '1rem', fontSize: '2rem' }}>BattleScope Operations Console</h1>
          <p style={{ color: '#475569', marginBottom: '2rem' }}>
            Sign in with your EVE Online account to access the console
          </p>

          {authError && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '1rem',
                borderRadius: '0.5rem',
                marginBottom: '2rem',
                textAlign: 'left',
              }}
            >
              <strong>Error:</strong> {authError}
            </div>
          )}

          <a
            href={`${apiBaseUrl}/auth/login`}
            style={{
              display: 'inline-block',
              background: '#0ea5e9',
              color: '#fff',
              padding: '0.875rem 1.5rem',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              fontWeight: 600,
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#0284c7')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#0ea5e9')}
          >
            Sign in with EVE Online
          </a>
        </div>
      </main>
    );
  }

  // Render authenticated app
  return (
    <main
      style={{
        padding: '2rem',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        minHeight: '100vh',
        background: '#f8fafc',
      }}
    >
      <header style={{ marginBottom: '1.5rem', display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ marginBottom: '0.5rem' }}>BattleScope Operations Console</h1>
            <p style={{ maxWidth: '48rem', color: '#475569' }}>
              Monitor battle statistics, stream killmail activity, and curate ingestion rules across
              the cluster.
            </p>
          </div>
          <UserMenu />
        </div>

        <nav aria-label="Primary" style={{ borderBottom: '1px solid #cbd5f5' }}>
          <ul
            style={{
              display: 'flex',
              gap: '1rem',
              listStyle: 'none',
              padding: 0,
              margin: 0,
              flexWrap: 'wrap',
            }}
          >
            {visibleTabs.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => setRoute({ type: 'tab', tabId: tab.id })}
                    aria-current={isActive ? 'page' : undefined}
                    style={{
                      padding: '0.75rem 1.25rem',
                      border: 'none',
                      borderBottom: isActive ? '3px solid #0ea5e9' : '3px solid transparent',
                      background: 'transparent',
                      color: isActive ? '#0f172a' : '#475569',
                      fontWeight: isActive ? 600 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <section
        style={{
          background: '#fff',
          borderRadius: '1rem',
          padding: '2rem',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
        }}
      >
        {renderView()}
      </section>
    </main>
  );
};
