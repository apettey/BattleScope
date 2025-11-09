import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { fetchCorporationDetail, formatIsk, type CorporationDetail } from './api.js';
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
  corpId: string;
}

export const CorporationView: FC<Props> = ({ corpId }) => {
  const { wrapApiCall } = useApiCall();
  const [corporation, setCorporation] = useState<CorporationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FetchError | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    wrapApiCall(() => fetchCorporationDetail(corpId, { signal: controller.signal }))
      .then((detail) => {
        if (controller.signal.aborted) return;
        setCorporation(detail);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(toError(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [corpId, wrapApiCall]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>Loading corporation details...</div>
    );
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

  if (!corporation) {
    return <div style={{ padding: '2rem' }}>Corporation not found</div>;
  }

  const stats = corporation.statistics;

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {/* Header */}
      <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
          {corporation.corpName || `Corporation ${corporation.corpId}`}
          {corporation.ticker && (
            <span style={{ color: '#64748b', fontSize: '1.5rem', marginLeft: '1rem' }}>
              [{corporation.ticker}]
            </span>
          )}
        </h2>
        <div style={{ color: '#64748b' }}>
          Corporation ID: {corporation.corpId}
          {corporation.allianceId && corporation.allianceName && (
            <span style={{ marginLeft: '1rem' }}>
              | Alliance:{' '}
              <EntityLink
                type="alliance"
                id={corporation.allianceId}
                name={corporation.allianceName}
              />
            </span>
          )}
        </div>
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

        {/* Top Pilots */}
        <div>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Top Pilots</h3>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {stats.topPilots.length === 0 ? (
              <div style={{ color: '#94a3b8' }}>No pilot data available</div>
            ) : (
              stats.topPilots.map((pilot) => (
                <div
                  key={pilot.characterId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.75rem',
                    background: '#f8fafc',
                    borderRadius: '0.5rem',
                  }}
                >
                  <EntityLink
                    type="character"
                    id={pilot.characterId}
                    name={pilot.characterName || `Character ${pilot.characterId}`}
                  />
                  <span style={{ fontWeight: 600, color: '#0ea5e9' }}>
                    {pilot.battleCount} battles
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
