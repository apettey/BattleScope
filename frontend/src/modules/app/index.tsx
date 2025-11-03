import type { FC } from 'react';
import { BattlesView } from '../battles/components/BattlesView.js';

export const App: FC = () => (
  <main style={{ padding: '2rem', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
    <header style={{ marginBottom: '2rem' }}>
      <h1>BattleScope Operations Console</h1>
      <p>Monitor recent battles, enrichment status, and killmail references in real time.</p>
    </header>
    <BattlesView />
  </main>
);
