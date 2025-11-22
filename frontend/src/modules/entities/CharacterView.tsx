import { useEffect, useState } from 'react';
import type { FC } from 'react';
import {
  fetchCharacterDetail,
  fetchCharacterShips,
  fetchCharacterLosses,
  formatIsk,
  type CharacterDetail,
  type CharacterShipsResponse,
  type CharacterLossesResponse,
  type CharacterLoss,
} from './api.js';
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
  characterId: string;
}

export const CharacterView: FC<Props> = ({ characterId }) => {
  const { wrapApiCall } = useApiCall();
  const [character, setCharacter] = useState<CharacterDetail | null>(null);
  const [shipHistory, setShipHistory] = useState<CharacterShipsResponse | null>(null);
  const [losses, setLosses] = useState<CharacterLossesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FetchError | null>(null);
  const [showAllShips, setShowAllShips] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    // Fetch all data in parallel
    Promise.all([
      wrapApiCall(() => fetchCharacterDetail(characterId, { signal: controller.signal })),
      wrapApiCall(() =>
        fetchCharacterShips(characterId, { signal: controller.signal, limit: 20 }),
      ).catch(() => null), // Ship history may not exist yet
      wrapApiCall(() =>
        fetchCharacterLosses(characterId, { signal: controller.signal, limit: 10 }),
      ).catch(() => null), // Losses may not exist yet
    ])
      .then(([detail, ships, lossesData]) => {
        if (controller.signal.aborted) return;
        setCharacter(detail);
        setShipHistory(ships);
        setLosses(lossesData);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(toError(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [characterId, wrapApiCall]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading character details...</div>;
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

  if (!character) {
    return <div style={{ padding: '2rem' }}>Character not found</div>;
  }

  const stats = character.statistics;
  const displayShips = showAllShips
    ? (shipHistory?.ships ?? [])
    : (shipHistory?.ships ?? []).slice(0, 5);

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {/* Header */}
      <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
          {character.characterName || `Character ${character.characterId}`}
        </h2>
        <div style={{ color: '#64748b' }}>
          Character ID: {character.characterId}
          {character.corpId && character.corpName && (
            <span style={{ marginLeft: '1rem' }}>
              | Corporation:{' '}
              <EntityLink type="corporation" id={character.corpId} name={character.corpName} />
            </span>
          )}
          {character.allianceId && character.allianceName && (
            <span style={{ marginLeft: '1rem' }}>
              | Alliance:{' '}
              <EntityLink type="alliance" id={character.allianceId} name={character.allianceName} />
            </span>
          )}
        </div>
      </div>

      {/* Statistics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        <StatCard label="Total Battles" value={stats.totalBattles.toString()} />
        <StatCard label="Kills" value={stats.totalKills.toString()} color="#10b981" />
        <StatCard label="Losses" value={stats.totalLosses.toString()} color="#ef4444" />
        <StatCard
          label="ISK Destroyed"
          value={formatIsk(stats.totalIskDestroyed)}
          color="#10b981"
        />
        <StatCard label="ISK Lost" value={formatIsk(stats.totalIskLost)} color="#ef4444" />
        <StatCard label="ISK Efficiency" value={`${stats.iskEfficiency.toFixed(2)}%`} />
      </div>

      {/* Ship History Section */}
      {shipHistory && shipHistory.ships.length > 0 && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h3 style={{ fontSize: '1.25rem' }}>Ships Flown</h3>
            {shipHistory.ships.length > 5 && (
              <button
                onClick={() => setShowAllShips(!showAllShips)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0ea5e9',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                {showAllShips ? 'Show Less' : `Show All (${shipHistory.ships.length})`}
              </button>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem', color: '#64748b' }}>Ship</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', color: '#64748b' }}>
                    Flown
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', color: '#10b981' }}>
                    Kills
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', color: '#ef4444' }}>
                    Losses
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', color: '#10b981' }}>
                    ISK Destroyed
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', color: '#ef4444' }}>
                    ISK Lost
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', color: '#64748b' }}>
                    Efficiency
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayShips.map((ship) => {
                  const destroyed = BigInt(ship.iskDestroyed);
                  const lost = BigInt(ship.iskLost);
                  const total = destroyed + lost;
                  const efficiency = total > 0n ? Number((destroyed * 100n) / total) : 0;

                  return (
                    <tr
                      key={ship.shipTypeId}
                      style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}
                    >
                      <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                        {ship.shipTypeName || `Ship ${ship.shipTypeId}`}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>{ship.timesFlown}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#10b981' }}>
                        {ship.kills}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#ef4444' }}>
                        {ship.losses}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#10b981' }}>
                        {formatIsk(ship.iskDestroyed)}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#ef4444' }}>
                        {formatIsk(ship.iskLost)}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem',
                          textAlign: 'right',
                          color: efficiency >= 50 ? '#10b981' : '#ef4444',
                        }}
                      >
                        {efficiency.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Losses Section */}
      {losses && losses.losses.length > 0 && (
        <div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
            Recent Losses ({losses.totalLosses} total - {formatIsk(losses.totalIskLost)} lost)
          </h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {losses.losses.map((loss) => (
              <LossCard key={loss.killmailId} loss={loss} />
            ))}
          </div>
        </div>
      )}

      {/* Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Most Used Ships (from battle participation) */}
        <div>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Most Used Ships (Battles)</h3>
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

        {/* Favorite Systems */}
        <div>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Favorite Systems</h3>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {stats.favoriteSystems.length === 0 ? (
              <div style={{ color: '#94a3b8' }}>No system data available</div>
            ) : (
              stats.favoriteSystems.map((system) => (
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

interface LossCardProps {
  loss: CharacterLoss;
}

const LossCard: FC<LossCardProps> = ({ loss }) => {
  const date = new Date(loss.occurredAt);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span style={{ fontWeight: 600, color: '#991b1b' }}>
          {loss.shipTypeName || `Ship ${loss.shipTypeId}`}
        </span>
        <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
          {loss.systemName || `System ${loss.systemId}`} - {date.toLocaleDateString()}{' '}
          {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {loss.shipValue && (
          <span style={{ fontWeight: 600, color: '#ef4444' }}>{formatIsk(loss.shipValue)}</span>
        )}
        <a
          href={loss.zkbUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '0.5rem 1rem',
            background: '#ef4444',
            color: 'white',
            borderRadius: '0.375rem',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          View Kill
        </a>
      </div>
    </div>
  );
};
