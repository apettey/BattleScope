import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchBattles,
  fetchBattleDetail,
  formatIsk,
  type BattleSummary,
  type BattleDetail,
  type KillmailDetail,
} from '../api.js';

interface FetchError {
  message: string;
}

const toError = (error: unknown): FetchError => {
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
};

export const BattlesView = () => {
  const [battles, setBattles] = useState<BattleSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<FetchError | null>(null);

  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [selectedBattle, setSelectedBattle] = useState<BattleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<FetchError | null>(null);

  const detailAbortRef = useRef<AbortController | null>(null);

  const loadBattle = useCallback((battleId: string) => {
    setSelectedBattleId(battleId);
    setDetailLoading(true);
    setDetailError(null);
    setSelectedBattle(null);

    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;

    fetchBattleDetail(battleId, { signal: controller.signal })
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
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true);
    setListError(null);

    fetchBattles({ limit: 10, signal: controller.signal })
      .then((response: { items: BattleSummary[]; nextCursor?: string | null }) => {
        if (controller.signal.aborted) {
          return;
        }
        setBattles(response.items);
        setNextCursor(response.nextCursor ?? null);
        if (response.items.length > 0) {
          loadBattle(response.items[0].id);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setListError(toError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setListLoading(false);
        }
      });

    return () => {
      controller.abort();
      detailAbortRef.current?.abort();
    };
  }, [loadBattle]);

  const handleSelect = useCallback(
    (battleId: string) => {
      if (battleId === selectedBattleId) {
        return;
      }
      loadBattle(battleId);
    },
    [loadBattle, selectedBattleId],
  );

  const handleLoadMore = useCallback(() => {
    if (!nextCursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setListError(null);

    fetchBattles({ cursor: nextCursor })
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
  }, [loadingMore, nextCursor]);

  const selectedSummary = useMemo(
    () => battles.find((battle) => battle.id === selectedBattleId) ?? null,
    [battles, selectedBattleId],
  );

  return (
    <section aria-labelledby="battles-heading">
      <header>
        <h2 id="battles-heading">Recent Battles</h2>
        {listLoading && <p role="status">Loading battles…</p>}
        {listError && !listLoading && <p role="alert">{listError.message}</p>}
      </header>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <aside style={{ minWidth: '18rem', flex: '1 1 18rem' }}>
          <h3>Battle Feed</h3>
          {battles.length === 0 && !listLoading && !listError && <p>No battles available yet.</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {battles.map((battle) => {
              const isSelected = battle.id === selectedBattleId;
              return (
                <li key={battle.id} style={{ marginBottom: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => handleSelect(battle.id)}
                    aria-pressed={isSelected}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: isSelected ? '2px solid #0ea5e9' : '1px solid #cbd5f5',
                      background: isSelected ? '#e0f2fe' : '#f8fafc',
                      cursor: 'pointer',
                    }}
                  >
                    <strong>System {battle.systemId}</strong>
                    <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                      {new Date(battle.startTime).toLocaleString()} • {battle.spaceType}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                      {battle.totalKills} kills • {formatIsk(battle.totalIskDestroyed)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div style={{ marginTop: '1rem' }}>
            <button type="button" onClick={handleLoadMore} disabled={!nextCursor || loadingMore}>
              {loadingMore ? 'Loading…' : nextCursor ? 'Load more battles' : 'No more results'}
            </button>
          </div>
        </aside>

        <article style={{ flex: '2 1 24rem' }}>
          <h3>Battle Details</h3>
          {detailLoading && <p role="status">Loading battle details…</p>}
          {detailError && !detailLoading && <p role="alert">{detailError.message}</p>}
          {!detailLoading && !detailError && selectedBattle && selectedSummary && (
            <div>
              <p>
                <strong>Battle:</strong> {selectedSummary.spaceType} in system{' '}
                {selectedSummary.systemId}
              </p>
              <p>
                <strong>Window:</strong> {new Date(selectedSummary.startTime).toLocaleString()} →{' '}
                {new Date(selectedSummary.endTime).toLocaleString()}
              </p>
              <p>
                <strong>Total:</strong> {selectedSummary.totalKills} kills,{' '}
                {formatIsk(selectedSummary.totalIskDestroyed)} destroyed
              </p>
              <p>
                <a href={selectedSummary.zkillRelatedUrl} target="_blank" rel="noreferrer">
                  View on zKillboard
                </a>
              </p>

              <section aria-labelledby="killmail-heading">
                <h4 id="killmail-heading">Killmails</h4>
                <ul style={{ paddingLeft: 0, listStyle: 'none' }}>
                  {selectedBattle.killmails.map((killmail: KillmailDetail) => (
                    <li
                      key={killmail.killmailId}
                      style={{
                        padding: '0.75rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        marginBottom: '0.75rem',
                      }}
                    >
                      <div>
                        <strong>Killmail #{killmail.killmailId}</strong> –{' '}
                        {new Date(killmail.occurredAt).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                        ISK: {formatIsk(killmail.iskValue)} | Enrichment:{' '}
                        {killmail.enrichment ? killmail.enrichment.status : 'pending'}
                      </div>
                      {killmail.enrichment?.error && (
                        <div style={{ color: '#b91c1c', fontSize: '0.85rem' }}>
                          Error: {killmail.enrichment.error}
                        </div>
                      )}
                      <div style={{ fontSize: '0.85rem' }}>
                        <a href={killmail.zkbUrl} target="_blank" rel="noreferrer">
                          View killmail
                        </a>
                      </div>
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
            battles.length === 0 && <p>Select a battle to inspect details.</p>}
        </article>
      </div>
    </section>
  );
};
