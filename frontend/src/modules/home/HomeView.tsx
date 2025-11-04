import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardSummary } from '../dashboard/api.js';
import { fetchDashboardSummary } from '../dashboard/api.js';
import { EntityLink } from '../common/components/EntityLink.js';

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
        <h2 id="dashboard-heading" style={{ marginBottom: '0.5rem' }}>
          Operational Overview
        </h2>
        <p style={{ marginBottom: '1rem', color: '#64748b' }}>
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
            style={{
              padding: '0.5rem 1rem',
              background: loading ? '#e2e8f0' : '#0ea5e9',
              color: loading ? '#64748b' : '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Refreshing…' : 'Refresh now'}
          </button>
          {generatedAt && !loading && (
            <span style={{ fontSize: '0.875rem', color: '#64748b' }}>Updated {generatedAt}</span>
          )}
        </div>
        {error && (
          <p
            role="alert"
            style={{
              color: '#dc2626',
              marginTop: '0.75rem',
              padding: '0.75rem',
              background: '#fef2f2',
              borderRadius: '0.5rem',
              border: '1px solid #fecaca',
            }}
          >
            {error}
          </p>
        )}
      </header>

      <section
        aria-label="Summary statistics"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        {[
          { label: 'Total Battles', value: summary?.totalBattles, icon: '⚔️' },
          { label: 'Killmails Indexed', value: summary?.totalKillmails, icon: '💀' },
          { label: 'Alliances Involved', value: summary?.uniqueAlliances, icon: '🛡️' },
          { label: 'Corporations Involved', value: summary?.uniqueCorporations, icon: '🏢' },
        ].map(({ label, value, icon }) => (
          <div
            key={label}
            style={{
              background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
              borderRadius: '0.75rem',
              padding: '1.25rem',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>{icon}</span>
              <h3 style={{ margin: 0, fontSize: '0.875rem', color: '#475569', fontWeight: 500 }}>
                {label}
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: '1.875rem', fontWeight: 700, color: '#0f172a' }}>
              {loading && value === undefined ? '…' : numberFormatter.format(value ?? 0)}
            </p>
          </div>
        ))}
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
        }}
      >
        <section
          style={{
            background: '#fff',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
          aria-label="Top alliances"
        >
          <h3
            style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.125rem', color: '#0f172a' }}
          >
            🏆 Top Alliances
          </h3>
          {summary?.topAlliances?.length ? (
            <ol
              style={{
                paddingLeft: '0',
                margin: 0,
                listStyle: 'none',
                display: 'grid',
                gap: '0.75rem',
              }}
            >
              {summary.topAlliances.map((item, index) => (
                <li
                  key={item.allianceId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    background: '#f8fafc',
                    borderRadius: '0.5rem',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: index === 0 ? '#fbbf24' : index === 1 ? '#94a3b8' : '#cd7f32',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                    }}
                  >
                    {index + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <EntityLink
                      type="alliance"
                      id={item.allianceId}
                      name={item.allianceName}
                      showAvatar={true}
                      avatarSize={32}
                    />
                    <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {numberFormatter.format(item.battleCount)} battle
                      {item.battleCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: '#64748b', margin: 0 }}>No alliance activity recorded yet.</p>
          )}
        </section>

        <section
          style={{
            background: '#fff',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
          aria-label="Top corporations"
        >
          <h3
            style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.125rem', color: '#0f172a' }}
          >
            🏢 Top Corporations
          </h3>
          {summary?.topCorporations?.length ? (
            <ol
              style={{
                paddingLeft: '0',
                margin: 0,
                listStyle: 'none',
                display: 'grid',
                gap: '0.75rem',
              }}
            >
              {summary.topCorporations.map((item, index) => (
                <li
                  key={item.corpId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    background: '#f8fafc',
                    borderRadius: '0.5rem',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: index === 0 ? '#fbbf24' : index === 1 ? '#94a3b8' : '#cd7f32',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                    }}
                  >
                    {index + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <EntityLink
                      type="corporation"
                      id={item.corpId}
                      name={item.corpName}
                      showAvatar={true}
                      avatarSize={32}
                    />
                    <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {numberFormatter.format(item.battleCount)} battle
                      {item.battleCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: '#64748b', margin: 0 }}>No corporate activity recorded yet.</p>
          )}
        </section>
      </div>
    </section>
  );
};
