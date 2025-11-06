import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { BattlesView } from '../battles/components/BattlesView.js';
import { HomeView } from '../home/HomeView.js';
import { RecentKillsView } from '../killfeed/RecentKillsView.js';
import { RulesView } from '../rules/RulesView.js';
import { AllianceView } from '../entities/AllianceView.js';
import { CorporationView } from '../entities/CorporationView.js';
import { CharacterView } from '../entities/CharacterView.js';

type TabId = 'home' | 'recent' | 'rules' | 'battles';
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

const tabs: Array<{ id: TabId; label: string; render: () => JSX.Element }> = [
  { id: 'home', label: 'Home', render: () => <HomeView /> },
  { id: 'recent', label: 'Recent Kills', render: () => <RecentKillsView /> },
  { id: 'rules', label: 'Rules', render: () => <RulesView /> },
  { id: 'battles', label: 'Battles', render: () => <BattlesView /> },
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

export const App: FC = () => {
  const [route, setRoute] = useState<RouteState>(() => getInitialRoute());

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
        <div>
          <h1 style={{ marginBottom: '0.5rem' }}>BattleScope Operations Console</h1>
          <p style={{ maxWidth: '48rem', color: '#475569' }}>
            Monitor battle statistics, stream killmail activity, and curate ingestion rules across
            the cluster.
          </p>
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
            {tabs.map((tab) => {
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
