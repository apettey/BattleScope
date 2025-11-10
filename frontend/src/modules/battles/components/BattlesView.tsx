import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchBattles,
  fetchBattleDetail,
  formatIsk,
  type BattleSummary,
  type BattleDetail,
  type KillmailDetail,
} from '../api.js';
import { EntityLink } from '../../common/components/EntityLink.js';
import { EntityList } from '../../common/components/EntityList.js';
import { useApiCall } from '../../api/useApiCall.js';
import { BattleFilters, type BattleFilterValues } from './BattleFilters.js';

interface FetchError {
  message: string;
}

const toError = (error: unknown): FetchError => {
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
};

const securityTypeLabels: Record<string, string> = {
  highsec: '🛡️ High Sec',
  lowsec: '⚠️ Low Sec',
  nullsec: '💀 Null Sec',
  wormhole: '🕳️ Wormhole',
  pochven: '⚡ Pochven',
};

const securityTypeColors: Record<string, string> = {
  highsec: '#10b981',
  lowsec: '#f59e0b',
  nullsec: '#ef4444',
  wormhole: '#8b5cf6',
  pochven: '#ec4899',
};

export const BattlesView = () => {
  const { wrapApiCall } = useApiCall();
  const [battles, setBattles] = useState<BattleSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<FetchError | null>(null);

  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [selectedBattle, setSelectedBattle] = useState<BattleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<FetchError | null>(null);

  const [filterValues, setFilterValues] = useState<BattleFilterValues>({});
  const [appliedFilters, setAppliedFilters] = useState<BattleFilterValues>({});
  const [isApplyingFilters, setIsApplyingFilters] = useState(false);

  const detailAbortRef = useRef<AbortController | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);

  const loadBattle = useCallback(
    (battleId: string) => {
      setSelectedBattleId(battleId);
      setDetailLoading(true);
      setDetailError(null);
      setSelectedBattle(null);

      detailAbortRef.current?.abort();
      const controller = new AbortController();
      detailAbortRef.current = controller;

      wrapApiCall(() => fetchBattleDetail(battleId, { signal: controller.signal }))
        .then((detail: BattleDetail) => {
          if (controller.signal.aborted) {
            return;
          }
          setSelectedBattle(detail);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          setDetailError(toError(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setDetailLoading(false);
          }
        });
    },
    [wrapApiCall],
  );

  const loadBattleList = useCallback(async () => {
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;

    setListLoading(true);
    setListError(null);

    try {
      const response = await wrapApiCall(() =>
        fetchBattles({
          limit: 10,
          signal: controller.signal,
          securityType: appliedFilters.securityType,
          allianceId: appliedFilters.allianceId,
          corpId: appliedFilters.corpId,
          characterId: appliedFilters.characterId,
          since: appliedFilters.since,
          until: appliedFilters.until,
        }),
      );

      if (controller.signal.aborted) {
        return;
      }

      setBattles(response.items);
      setNextCursor(response.nextCursor ?? null);
      if (response.items.length > 0) {
        loadBattle(response.items[0].id);
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        setListError(toError(error));
      }
    } finally {
      if (!controller.signal.aborted) {
        setListLoading(false);
      }
    }
  }, [appliedFilters, loadBattle, wrapApiCall]);

  useEffect(() => {
    void loadBattleList();

    return () => {
      listAbortRef.current?.abort();
      detailAbortRef.current?.abort();
    };
  }, [loadBattleList]);

  const handleSelect = useCallback(
    (battleId: string) => {
      if (battleId === selectedBattleId) {
        return;
      }
      loadBattle(battleId);
    },
    [loadBattle, selectedBattleId],
  );

  const handleApplyFilters = useCallback(() => {
    setIsApplyingFilters(true);
    setAppliedFilters(filterValues);
    // loadBattleList will be triggered by the appliedFilters dependency
    setTimeout(() => setIsApplyingFilters(false), 500);
  }, [filterValues]);

  const handleLoadMore = useCallback(() => {
    if (!nextCursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setListError(null);

    wrapApiCall(() =>
      fetchBattles({
        cursor: nextCursor,
        securityType: appliedFilters.securityType,
        allianceId: appliedFilters.allianceId,
        corpId: appliedFilters.corpId,
        characterId: appliedFilters.characterId,
        since: appliedFilters.since,
        until: appliedFilters.until,
      }),
    )
      .then((response: { items: BattleSummary[]; nextCursor?: string | null }) => {
        setNextCursor(response.nextCursor ?? null);
        setBattles((current) => {
          const existingIds = new Set(current.map((battle) => battle.id));
          const merged = [...current];
          response.items.forEach((item: BattleSummary) => {
            if (!existingIds.has(item.id)) {
              merged.push(item);
            }
          });
          return merged;
        });
      })
      .catch((error: unknown) => {
        setListError(toError(error));
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }, [loadingMore, nextCursor, appliedFilters, wrapApiCall]);

  const selectedSummary = useMemo(
    () => battles.find((battle) => battle.id === selectedBattleId) ?? null,
    [battles, selectedBattleId],
  );

  return (
    <section aria-labelledby="battles-heading" style={{ display: 'grid', gap: '1.5rem' }}>
      <header>
        <h2 id="battles-heading" style={{ marginBottom: '0.5rem' }}>
          Battle Reports
        </h2>
        <p style={{ color: '#64748b', marginBottom: '1rem' }}>
          Browse and analyze battle reports. Use filters to search by alliance, corporation,
          character, space type, and date range. Select a battle to view detailed information about
          participants and killmails.
        </p>
        {listLoading && (
          <p role="status" style={{ color: '#64748b' }}>
            Loading battles…
          </p>
        )}
        {listError && !listLoading && (
          <p
            role="alert"
            style={{
              color: '#dc2626',
              padding: '0.75rem',
              background: '#fef2f2',
              borderRadius: '0.5rem',
            }}
          >
            {listError.message}
          </p>
        )}
      </header>

      <BattleFilters
        values={filterValues}
        onChange={setFilterValues}
        onApply={handleApplyFilters}
        isApplying={isApplyingFilters}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem' }}>
        <aside style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
          <h3 style={{ fontSize: '1rem', color: '#0f172a', marginBottom: 0 }}>Battle Feed</h3>
          {battles.length === 0 && !listLoading && !listError && (
            <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>No battles available yet.</p>
          )}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
            {battles.map((battle) => {
              const isSelected = battle.id === selectedBattleId;
              const securityColor = securityTypeColors[battle.securityType] || '#64748b';
              return (
                <li key={battle.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(battle.id)}
                    aria-pressed={isSelected}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '1rem',
                      borderRadius: '0.75rem',
                      border: isSelected ? `2px solid ${securityColor}` : '1px solid #e2e8f0',
                      background: isSelected ? `${securityColor}10` : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: isSelected
                        ? '0 4px 12px rgba(0, 0, 0, 0.1)'
                        : '0 1px 3px rgba(0, 0, 0, 0.05)',
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
                      <span style={{ fontSize: '1.25rem' }}>
                        {battle.securityType === 'highsec' && '🛡️'}
                        {battle.securityType === 'lowsec' && '⚠️'}
                        {battle.securityType === 'nullsec' && '💀'}
                        {battle.securityType === 'wormhole' && '🕳️'}
                        {battle.securityType === 'pochven' && '⚡'}
                      </span>
                      <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>
                        {battle.systemName || `System #${battle.systemId}`}
                      </strong>
                    </div>
                    <div
                      style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.5rem' }}
                    >
                      {new Date(battle.startTime).toLocaleString()}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.8125rem',
                        color: '#475569',
                      }}
                    >
                      <span>💀 {battle.totalKills} kills</span>
                      <span>{formatIsk(battle.totalIskDestroyed)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {battles.length > 0 && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={!nextCursor || loadingMore}
              style={{
                padding: '0.75rem',
                background: !nextCursor || loadingMore ? '#f1f5f9' : '#0ea5e9',
                color: !nextCursor || loadingMore ? '#94a3b8' : '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: !nextCursor || loadingMore ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              {loadingMore ? 'Loading…' : nextCursor ? 'Load more battles' : 'No more battles'}
            </button>
          )}
        </aside>

        <article style={{ minWidth: 0 }}>
          {detailLoading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              <p>Loading battle details…</p>
            </div>
          )}
          {detailError && !detailLoading && (
            <p
              role="alert"
              style={{
                color: '#dc2626',
                padding: '1rem',
                background: '#fef2f2',
                borderRadius: '0.75rem',
              }}
            >
              {detailError.message}
            </p>
          )}
          {!detailLoading && !detailError && selectedBattle && selectedSummary && (
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              <div
                style={{
                  background: '#fff',
                  borderRadius: '0.75rem',
                  padding: '1.5rem',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                }}
              >
                <h3
                  style={{
                    marginTop: 0,
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>
                    {selectedSummary.securityType === 'highsec' && '🛡️'}
                    {selectedSummary.securityType === 'lowsec' && '⚠️'}
                    {selectedSummary.securityType === 'nullsec' && '💀'}
                    {selectedSummary.securityType === 'wormhole' && '🕳️'}
                    {selectedSummary.securityType === 'pochven' && '⚡'}
                  </span>
                  Battle in {selectedSummary.systemName || `System #${selectedSummary.systemId}`}
                </h3>
                <dl style={{ display: 'grid', gap: '0.75rem', margin: 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem' }}>
                    <dt style={{ color: '#64748b', fontWeight: 500 }}>Security Type:</dt>
                    <dd style={{ margin: 0, color: '#0f172a' }}>
                      {securityTypeLabels[selectedSummary.securityType] ||
                        selectedSummary.securityType}
                    </dd>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem' }}>
                    <dt style={{ color: '#64748b', fontWeight: 500 }}>Duration:</dt>
                    <dd style={{ margin: 0, color: '#0f172a' }}>
                      {new Date(selectedSummary.startTime).toLocaleString()} →{' '}
                      {new Date(selectedSummary.endTime).toLocaleString()}
                    </dd>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem' }}>
                    <dt style={{ color: '#64748b', fontWeight: 500 }}>Total Kills:</dt>
                    <dd style={{ margin: 0, color: '#0f172a', fontWeight: 600 }}>
                      {selectedSummary.totalKills}
                    </dd>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem' }}>
                    <dt style={{ color: '#64748b', fontWeight: 500 }}>ISK Destroyed:</dt>
                    <dd style={{ margin: 0, color: '#0f172a', fontWeight: 600 }}>
                      {formatIsk(selectedSummary.totalIskDestroyed)}
                    </dd>
                  </div>
                </dl>
                <a
                  href={selectedSummary.zkillRelatedUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginTop: '1rem',
                    padding: '0.5rem 1rem',
                    background: '#0ea5e9',
                    color: '#fff',
                    textDecoration: 'none',
                    borderRadius: '0.5rem',
                    fontWeight: 500,
                    fontSize: '0.875rem',
                  }}
                >
                  View battle on zKillboard →
                </a>
              </div>

              <section
                aria-labelledby="participants-heading"
                style={{
                  background: '#fff',
                  borderRadius: '0.75rem',
                  padding: '1.5rem',
                  border: '1px solid #e2e8f0',
                }}
              >
                <h4
                  id="participants-heading"
                  style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.125rem' }}
                >
                  👥 Participants ({selectedBattle.participants.length})
                </h4>
                {selectedBattle.participants.length > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gap: '0.5rem',
                      maxHeight: '400px',
                      overflowY: 'auto',
                    }}
                  >
                    {selectedBattle.participants.map((participant, index) => (
                      <div
                        key={`${participant.characterId}-${index}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '0.75rem',
                          background: participant.isVictim ? '#fef2f2' : '#f0f9ff',
                          borderRadius: '0.5rem',
                          border: participant.isVictim ? '1px solid #fecaca' : '1px solid #bae6fd',
                        }}
                      >
                        <span style={{ fontSize: '1.25rem' }}>
                          {participant.isVictim ? '💀' : '⚔️'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0, fontSize: '0.875rem' }}>
                          <div style={{ marginBottom: '0.25rem' }}>
                            <EntityLink
                              type="character"
                              id={participant.characterId}
                              name={participant.characterName}
                              showAvatar={true}
                              avatarSize={24}
                            />
                            {participant.shipTypeName && (
                              <span style={{ color: '#64748b', marginLeft: '0.5rem' }}>
                                in {participant.shipTypeName}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                            {participant.corpId && (
                              <>
                                <EntityLink
                                  type="corporation"
                                  id={participant.corpId}
                                  name={participant.corpName}
                                  showAvatar={true}
                                  avatarSize={16}
                                />
                                {participant.allianceId && (
                                  <>
                                    {' • '}
                                    <EntityLink
                                      type="alliance"
                                      id={participant.allianceId}
                                      name={participant.allianceName}
                                      showAvatar={true}
                                      avatarSize={16}
                                    />
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#94a3b8' }}>No participants recorded.</p>
                )}
              </section>

              <section
                aria-labelledby="killmail-heading"
                style={{
                  background: '#fff',
                  borderRadius: '0.75rem',
                  padding: '1.5rem',
                  border: '1px solid #e2e8f0',
                }}
              >
                <h4
                  id="killmail-heading"
                  style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.125rem' }}
                >
                  💀 Killmails ({selectedBattle.killmails.length})
                </h4>
                <ul
                  style={{
                    paddingLeft: 0,
                    listStyle: 'none',
                    margin: 0,
                    display: 'grid',
                    gap: '0.75rem',
                  }}
                >
                  {selectedBattle.killmails.map((killmail: KillmailDetail) => (
                    <li
                      key={killmail.killmailId}
                      style={{
                        padding: '1rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.75rem',
                        background: '#f8fafc',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '0.75rem',
                        }}
                      >
                        <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>
                          Killmail #{killmail.killmailId}
                        </strong>
                        <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                          {new Date(killmail.occurredAt).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        <div style={{ color: '#64748b', marginBottom: '0.25rem' }}>Victim:</div>
                        <EntityLink
                          type="character"
                          id={killmail.victimCharacterId}
                          name={killmail.victimCharacterName}
                          showAvatar={true}
                          avatarSize={24}
                        />
                      </div>
                      {killmail.attackerAllianceIds.length > 0 && (
                        <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                          <div style={{ color: '#64748b', marginBottom: '0.25rem' }}>
                            Attacker Alliances:
                          </div>
                          <EntityList
                            type="alliance"
                            ids={killmail.attackerAllianceIds}
                            names={killmail.attackerAllianceNames}
                            showAvatars={true}
                            avatarSize={20}
                            maxDisplay={5}
                          />
                        </div>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          gap: '1rem',
                          fontSize: '0.8125rem',
                          color: '#64748b',
                          marginTop: '0.75rem',
                        }}
                      >
                        <span>💰 {formatIsk(killmail.iskValue)}</span>
                        {killmail.enrichment && (
                          <span>
                            📊 Enrichment:{' '}
                            <span
                              style={{
                                color:
                                  killmail.enrichment.status === 'succeeded'
                                    ? '#10b981'
                                    : killmail.enrichment.status === 'failed'
                                      ? '#ef4444'
                                      : '#f59e0b',
                              }}
                            >
                              {killmail.enrichment.status}
                            </span>
                          </span>
                        )}
                      </div>
                      {killmail.enrichment?.error && (
                        <div
                          style={{
                            color: '#dc2626',
                            fontSize: '0.8125rem',
                            marginTop: '0.5rem',
                            padding: '0.5rem',
                            background: '#fef2f2',
                            borderRadius: '0.25rem',
                          }}
                        >
                          Error: {killmail.enrichment.error}
                        </div>
                      )}
                      <a
                        href={killmail.zkbUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          marginTop: '0.5rem',
                          fontSize: '0.875rem',
                          color: '#0ea5e9',
                          textDecoration: 'none',
                        }}
                      >
                        View killmail →
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
          {!detailLoading &&
            !detailError &&
            !selectedBattle &&
            !listLoading &&
            battles.length === 0 && (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                Select a battle to view details.
              </p>
            )}
        </article>
      </div>
    </section>
  );
};
