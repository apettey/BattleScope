import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardSummary } from '../dashboard/api.js';
import { fetchDashboardSummary } from '../dashboard/api.js';

const numberFormatter = new Intl.NumberFormat();

interface LoadState {
  summary: DashboardSummary | null;
  loading: boolean;
  error: string | null;
}

const initialState: LoadState = {
  summary: null,
  loading: true,
  error: null,
};

const REFRESH_INTERVAL_MS = 30_000;

export const HomeView = () => {
  const [{ summary, loading, error }, setState] = useState<LoadState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const nextSummary = await fetchDashboardSummary({ signal: controller.signal });
      if (!controller.signal.aborted) {
        setState({ summary: nextSummary, loading: false, error: null });
      }
    } catch (thrown) {
      if (!controller.signal.aborted) {
        setState((current) => ({
          ...current,
          loading: false,
          error: thrown instanceof Error ? thrown.message : String(thrown),
        }));
      }
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);
    return () => {
      abortRef.current?.abort();
      clearInterval(timer);
    };
  }, [load]);

  const generatedAt = useMemo(() => {
    if (!summary) {
      return null;
    }
    const timestamp = new Date(summary.generatedAt);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp.toLocaleString();
  }, [summary]);

  return (
    <section aria-labelledby="dashboard-heading" style={{ display: 'grid', gap: '1.5rem' }}>
      <header>
        <h2 id="dashboard-heading">Operational Overview</h2>
        <p>
          Track the volume of battle reports and the alliances and corporations appearing most
          frequently across BattleScope.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              void load();
            }}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh now'}
          </button>
          {generatedAt && !loading && (
            <span style={{ fontSize: '0.85rem', color: '#475569' }}>Updated {generatedAt}</span>
          )}
        </div>
        {error && (
          <p role="alert" style={{ color: '#b91c1c', marginTop: '0.5rem' }}>
            {error}
          </p>
        )}
      </header>

      <section
        aria-label="Summary statistics"
        style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}
      >
        {[
          { label: 'Total Battles', value: summary?.totalBattles },
          { label: 'Killmails Indexed', value: summary?.totalKillmails },
          { label: 'Alliances Involved', value: summary?.uniqueAlliances },
          { label: 'Corporations Involved', value: summary?.uniqueCorporations },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              flex: '1 1 12rem',
              background: '#f1f5f9',
              borderRadius: '0.75rem',
              padding: '1rem',
              border: '1px solid #e2e8f0',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#334155' }}>{label}</h3>
            <p style={{ margin: '0.35rem 0 0', fontSize: '1.5rem', fontWeight: 600 }}>
              {loading && value === undefined ? '…' : numberFormatter.format(value ?? 0)}
            </p>
          </div>
        ))}
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
        <section style={{ flex: '1 1 18rem' }} aria-label="Top alliances">
          <h3>Top Alliances</h3>
          {summary?.topAlliances?.length ? (
            <ol style={{ paddingLeft: '1.25rem', margin: 0, color: '#334155' }}>
              {summary.topAlliances.map((item) => (
                <li key={item.allianceId}>
                  Alliance {item.allianceId} — {numberFormatter.format(item.battleCount)} battles
                </li>
              ))}
            </ol>
          ) : (
            <p>No alliance activity recorded yet.</p>
          )}
        </section>
        <section style={{ flex: '1 1 18rem' }} aria-label="Top corporations">
          <h3>Top Corporations</h3>
          {summary?.topCorporations?.length ? (
            <ol style={{ paddingLeft: '1.25rem', margin: 0, color: '#334155' }}>
              {summary.topCorporations.map((item) => (
                <li key={item.corpId}>
                  Corporation {item.corpId} — {numberFormatter.format(item.battleCount)} battles
                </li>
              ))}
            </ol>
          ) : (
            <p>No corporate activity recorded yet.</p>
          )}
        </section>
      </div>
    </section>
  );
};
