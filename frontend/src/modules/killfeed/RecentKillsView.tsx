import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpaceType } from '@battlescope/shared';
import {
  createKillmailStream,
  fetchRecentKillmails,
  formatParticipantCount,
  type KillmailFeedItem,
} from './api.js';

const MAX_ITEMS = 50;
const SPACE_TYPES: SpaceType[] = ['kspace', 'jspace', 'pochven'];

type ConnectionStatus = 'connecting' | 'open' | 'closed';

const spaceTypeLabels: Record<SpaceType, string> = {
  kspace: 'Known Space',
  jspace: 'Wormhole Space',
  pochven: 'Pochven',
};

const limitItems = (items: KillmailFeedItem[]): KillmailFeedItem[] => items.slice(0, MAX_ITEMS);

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export const RecentKillsView = () => {
  const [items, setItems] = useState<KillmailFeedItem[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<SpaceType>>(() => new Set(SPACE_TYPES));
  const streamCancelRef = useRef<(() => void) | null>(null);

  const applySnapshot = useCallback((snapshot: KillmailFeedItem[]) => {
    setItems(limitItems(snapshot));
    setStatus('open');
    setError(null);
  }, []);

  const applyUpdate = useCallback((item: KillmailFeedItem) => {
    setItems((current) => {
      const existing = current.find((entry) => entry.killmailId === item.killmailId);
      const next = existing
        ? [item, ...current.filter((entry) => entry.killmailId !== item.killmailId)]
        : [item, ...current];
      return limitItems(next);
    });
    setStatus('open');
  }, []);

  const handleError = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : 'Stream disconnected');
    setStatus('closed');
  }, []);

  useEffect(() => {
    let cancelled = false;

    const establishStream = async () => {
      try {
        const initial = await fetchRecentKillmails({ limit: MAX_ITEMS });
        if (!cancelled) {
          applySnapshot(initial.items);
        }
      } catch (thrown) {
        if (!cancelled) {
          handleError(thrown);
        }
      }

      if (cancelled) {
        return;
      }

      streamCancelRef.current = createKillmailStream({
        limit: MAX_ITEMS,
        onSnapshot: (snapshot) => {
          if (!cancelled) {
            applySnapshot(snapshot);
          }
        },
        onUpdate: (update) => {
          if (!cancelled) {
            applyUpdate(update);
          }
        },
        onError: (cause) => {
          if (!cancelled) {
            handleError(cause);
          }
        },
      });
    };

    void establishStream();

    return () => {
      cancelled = true;
      streamCancelRef.current?.();
    };
  }, [applySnapshot, applyUpdate, handleError]);

  const toggleFilter = useCallback((spaceType: SpaceType) => {
    setActiveFilters((current) => {
      const next = new Set(current);
      if (next.has(spaceType)) {
        next.delete(spaceType);
      } else {
        next.add(spaceType);
      }
      return next.size === 0 ? new Set([spaceType]) : next;
    });
  }, []);

  const grouped = useMemo(() => {
    const bucket: Record<SpaceType, KillmailFeedItem[]> = {
      kspace: [],
      jspace: [],
      pochven: [],
    };
    items.forEach((item) => {
      bucket[item.spaceType].push(item);
    });
    return bucket;
  }, [items]);

  return (
    <section aria-labelledby="recent-kills-heading" style={{ display: 'grid', gap: '1.5rem' }}>
      <header>
        <h2 id="recent-kills-heading">Recent Killmails</h2>
        <p>
          Live stream of killmail activity grouped by space type. Toggle the filters to focus on
          specific operational domains.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {SPACE_TYPES.map((type) => (
            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="checkbox"
                checked={activeFilters.has(type)}
                onChange={() => toggleFilter(type)}
              />
              {spaceTypeLabels[type]}
            </label>
          ))}
          <span style={{ fontSize: '0.8rem', color: '#475569' }}>
            {status === 'connecting' && 'Connecting…'}
            {status === 'open' && 'Stream active'}
            {status === 'closed' && 'Stream paused'}
          </span>
        </div>
        {error && (
          <p role="alert" style={{ color: '#b91c1c', marginTop: '0.5rem' }}>
            {error}
          </p>
        )}
      </header>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        {SPACE_TYPES.filter((type) => activeFilters.has(type)).map((spaceType) => {
          const entries = grouped[spaceType];
          return (
            <section
              key={spaceType}
              style={{ flex: '1 1 18rem', display: 'grid', gap: '0.75rem' }}
              aria-label={`${spaceTypeLabels[spaceType]} kills`}
            >
              <h3 style={{ marginBottom: 0 }}>{spaceTypeLabels[spaceType]}</h3>
              {entries.length === 0 ? (
                <p>No kills recorded yet.</p>
              ) : (
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'grid',
                    gap: '0.75rem',
                  }}
                >
                  {entries.map((item) => (
                    <li
                      key={item.killmailId}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.75rem',
                        padding: '0.75rem',
                        background: '#f8fafc',
                      }}
                    >
                      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>Kill #{item.killmailId}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                          {formatTimestamp(item.occurredAt)}
                        </span>
                      </header>
                      <dl
                        style={{
                          display: 'grid',
                          gap: '0.25rem',
                          margin: '0.5rem 0 0',
                          gridTemplateColumns: 'auto 1fr',
                          columnGap: '0.5rem',
                          fontSize: '0.85rem',
                        }}
                      >
                        <dt>System</dt>
                        <dd style={{ margin: 0 }}>#{item.systemId}</dd>
                        <dt>Pilots</dt>
                        <dd style={{ margin: 0 }}>
                          {formatParticipantCount(item.participantCount)}
                        </dd>
                        <dt>Alliances</dt>
                        <dd style={{ margin: 0 }}>
                          {[item.victimAllianceId, ...item.attackerAllianceIds]
                            .filter(Boolean)
                            .map((id) => `#${id}`)
                            .join(', ') || '—'}
                        </dd>
                        <dt>Corporations</dt>
                        <dd style={{ margin: 0 }}>
                          {[item.victimCorpId, ...item.attackerCorpIds]
                            .filter(Boolean)
                            .map((id) => `#${id}`)
                            .join(', ') || '—'}
                        </dd>
                        <dt>ISK</dt>
                        <dd style={{ margin: 0 }}>
                          {item.iskValue ? `${item.iskValue} ISK` : '—'}
                        </dd>
                      </dl>
                      <a href={item.zkbUrl} target="_blank" rel="noreferrer">
                        View on zKillboard ↗
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
};
