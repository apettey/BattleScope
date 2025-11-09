import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { fetchAllianceDetail, formatIsk, type AllianceDetail } from './api.js';
import { EntityLink } from '../common/components/EntityLink.js';
import { useApiCall } from '../api/useApiCall.js';

interface FetchError {
  message: string;
}

const toError = (error: unknown): FetchError => {
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
};

interface Props {
  allianceId: string;
}

export const AllianceView: FC<Props> = ({ allianceId }) => {
  const { wrapApiCall } = useApiCall();
  const [alliance, setAlliance] = useState<AllianceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FetchError | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    wrapApiCall(() => fetchAllianceDetail(allianceId, { signal: controller.signal }))
      .then((detail) => {
        if (controller.signal.aborted) return;
        setAlliance(detail);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(toError(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [allianceId, wrapApiCall]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading alliance details...</div>;
  }

  if (error) {
    return (
      <div
        style={{
          padding: '2rem',
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: '0.5rem',
        }}
      >
        Error: {error.message}
      </div>
    );
  }

  if (!alliance) {
    return <div style={{ padding: '2rem' }}>Alliance not found</div>;
  }

  const stats = alliance.statistics;

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {/* Header */}
      <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
          {alliance.allianceName || `Alliance ${alliance.allianceId}`}
          {alliance.ticker && (
            <span style={{ color: '#64748b', fontSize: '1.5rem', marginLeft: '1rem' }}>
              [{alliance.ticker}]
            </span>
          )}
        </h2>
        <div style={{ color: '#64748b' }}>Alliance ID: {alliance.allianceId}</div>
      </div>

      {/* Statistics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        <StatCard label="Total Battles" value={stats.totalBattles.toString()} />
        <StatCard label="Total Killmails" value={stats.totalKillmails.toString()} />
        <StatCard
          label="ISK Destroyed"
          value={formatIsk(stats.totalIskDestroyed)}
          color="#10b981"
        />
        <StatCard label="ISK Lost" value={formatIsk(stats.totalIskLost)} color="#ef4444" />
        <StatCard label="ISK Efficiency" value={`${stats.iskEfficiency.toFixed(2)}%`} />
        <StatCard label="Avg Participants" value={stats.averageParticipants.toFixed(1)} />
      </div>

      {/* Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Most Used Ships */}
        <div>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Most Used Ships</h3>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {stats.mostUsedShips.length === 0 ? (
              <div style={{ color: '#94a3b8' }}>No ship data available</div>
            ) : (
              stats.mostUsedShips.map((ship) => (
                <div
                  key={ship.shipTypeId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.75rem',
                    background: '#f8fafc',
                    borderRadius: '0.5rem',
                  }}
                >
                  <span>{ship.shipTypeName || `Ship ${ship.shipTypeId}`}</span>
                  <span style={{ fontWeight: 600, color: '#0ea5e9' }}>{ship.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Opponents */}
        <div>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Top Opponents</h3>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {stats.topOpponents.length === 0 ? (
              <div style={{ color: '#94a3b8' }}>No opponent data available</div>
            ) : (
              stats.topOpponents.map((opponent) => (
                <div
                  key={opponent.allianceId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.75rem',
                    background: '#f8fafc',
                    borderRadius: '0.5rem',
                  }}
                >
                  <EntityLink
                    type="alliance"
                    id={opponent.allianceId}
                    name={opponent.allianceName || `Alliance ${opponent.allianceId}`}
                  />
                  <span style={{ fontWeight: 600, color: '#0ea5e9' }}>
                    {opponent.battleCount} battles
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Systems */}
        <div>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Top Systems</h3>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {stats.topSystems.length === 0 ? (
              <div style={{ color: '#94a3b8' }}>No system data available</div>
            ) : (
              stats.topSystems.map((system) => (
                <div
                  key={system.systemId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.75rem',
                    background: '#f8fafc',
                    borderRadius: '0.5rem',
                  }}
                >
                  <span>{system.systemName || `System ${system.systemId}`}</span>
                  <span style={{ fontWeight: 600, color: '#0ea5e9' }}>
                    {system.battleCount} battles
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string;
  color?: string;
}

const StatCard: FC<StatCardProps> = ({ label, value, color = '#0f172a' }) => (
  <div
    style={{
      padding: '1.5rem',
      background: '#f8fafc',
      borderRadius: '0.75rem',
      border: '1px solid #e2e8f0',
    }}
  >
    <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{label}</div>
    <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
  </div>
);
