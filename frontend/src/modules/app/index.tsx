import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';
import { BattlesView } from '../battles/components/BattlesView.js';
import { HomeView } from '../home/HomeView.js';
import { RecentKillsView } from '../killfeed/RecentKillsView.js';
import { RulesView } from '../rules/RulesView.js';

type TabId = 'home' | 'recent' | 'rules' | 'battles';

const tabs: Array<{ id: TabId; label: string; render: () => JSX.Element }> = [
  { id: 'home', label: 'Home', render: () => <HomeView /> },
  { id: 'recent', label: 'Recent Kills', render: () => <RecentKillsView /> },
  { id: 'rules', label: 'Rules', render: () => <RulesView /> },
  { id: 'battles', label: 'Battles', render: () => <BattlesView /> },
];

const isValidTab = (value: string): value is TabId => tabs.some((tab) => tab.id === value);

const getInitialTab = (): TabId => {
  if (typeof window === 'undefined') {
    return 'home';
  }
  const fromHash = window.location.hash.replace(/^#/, '');
  return isValidTab(fromHash) ? fromHash : 'home';
};

export const App: FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>(() => getInitialTab());

  useEffect(() => {
    const handleHashChange = () => {
      const next = getInitialTab();
      setActiveTab(next);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const nextHash = `#${activeTab}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }, [activeTab]);

  const view = useMemo(() => tabs.find((tab) => tab.id === activeTab) ?? tabs[0], [activeTab]);

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
                    onClick={() => setActiveTab(tab.id)}
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
        {view.render()}
      </section>
    </main>
  );
};
