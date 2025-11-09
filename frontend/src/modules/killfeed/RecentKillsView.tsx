import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpaceType } from '@battlescope/shared';
import {
  createKillmailStream,
  fetchRecentKillmails,
  formatParticipantCount,
  type KillmailFeedItem,
} from './api.js';
import { EntityLink } from '../common/components/EntityLink.js';
import { EntityList } from '../common/components/EntityList.js';
import { useApiCall } from '../api/useApiCall.js';

const MAX_ITEMS = 50;
const SPACE_TYPES: SpaceType[] = ['kspace', 'jspace', 'pochven'];

type ConnectionStatus = 'connecting' | 'open' | 'closed';

const spaceTypeLabels: Record<SpaceType, string> = {
  kspace: '🌌 Known Space',
  jspace: '🕳️ Wormhole Space',
  pochven: '⚡ Pochven',
};

const spaceTypeColors: Record<SpaceType, string> = {
  kspace: '#3b82f6',
  jspace: '#8b5cf6',
  pochven: '#ec4899',
};

const limitItems = (items: KillmailFeedItem[]): KillmailFeedItem[] => items.slice(0, MAX_ITEMS);

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const formatIsk = (value: string | null): string => {
  if (!value) {
    return '—';
  }
  try {
    const amount = BigInt(value);
    if (amount >= 1_000_000_000n) {
      return `${(Number(amount) / 1_000_000_000).toFixed(1)}B ISK`;
    }
    if (amount >= 1_000_000n) {
      return `${(Number(amount) / 1_000_000).toFixed(1)}M ISK`;
    }
    return `${amount.toLocaleString()} ISK`;
  } catch {
    return `${value} ISK`;
  }
};

export const RecentKillsView = () => {
  const { wrapApiCall } = useApiCall();
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
        const initial = await wrapApiCall(() => fetchRecentKillmails({ limit: MAX_ITEMS }));
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
  }, [applySnapshot, applyUpdate, handleError, wrapApiCall]);

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
        <h2 id="recent-kills-heading" style={{ marginBottom: '0.5rem' }}>
          Recent Killmails
        </h2>
        <p style={{ marginBottom: '1rem', color: '#64748b' }}>
          Live stream of killmail activity grouped by space type. Toggle the filters to focus on
          specific operational domains.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {SPACE_TYPES.map((type) => {
            const isActive = activeFilters.has(type);
            return (
              <label
                key={type}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  background: isActive ? spaceTypeColors[type] : '#f1f5f9',
                  color: isActive ? '#fff' : '#475569',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontWeight: 500,
                  border: `2px solid ${isActive ? spaceTypeColors[type] : '#e2e8f0'}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => toggleFilter(type)}
                  style={{ cursor: 'pointer' }}
                />
                {spaceTypeLabels[type]}
              </label>
            );
          })}
          <span
            style={{
              fontSize: '0.875rem',
              color: '#64748b',
              padding: '0.5rem 1rem',
              background: '#f8fafc',
              borderRadius: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background:
                  status === 'open' ? '#10b981' : status === 'connecting' ? '#f59e0b' : '#ef4444',
              }}
            />
            {status === 'connecting' && 'Connecting…'}
            {status === 'open' && 'Live'}
            {status === 'closed' && 'Disconnected'}
          </span>
        </div>
        {error && (
          <p
            role="alert"
            style={{
              color: '#dc2626',
              marginTop: '1rem',
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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
          gap: '1.5rem',
        }}
      >
        {SPACE_TYPES.filter((type) => activeFilters.has(type)).map((spaceType) => {
          const entries = grouped[spaceType];
          return (
            <section
              key={spaceType}
              style={{
                display: 'grid',
                gap: '1rem',
                alignContent: 'start',
              }}
              aria-label={`${spaceTypeLabels[spaceType]} kills`}
            >
              <h3
                style={{
                  marginBottom: 0,
                  fontSize: '1.125rem',
                  color: spaceTypeColors[spaceType],
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span
                  style={{
                    width: '4px',
                    height: '24px',
                    background: spaceTypeColors[spaceType],
                    borderRadius: '2px',
                  }}
                />
                {spaceTypeLabels[spaceType]}
              </h3>
              {entries.length === 0 ? (
                <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                  No recent kills in this area.
                </p>
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
                        padding: '1rem',
                        background: '#fff',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                        transition: 'box-shadow 0.2s, transform 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <header
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '0.75rem',
                          paddingBottom: '0.75rem',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <div>
                          <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>
                            {item.systemName || `System #${item.systemId}`}
                          </strong>
                          <div
                            style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}
                          >
                            {formatTimestamp(item.occurredAt)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>
                            {formatIsk(item.iskValue)}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {formatParticipantCount(item.participantCount)}
                          </div>
                        </div>
                      </header>

                      <dl
                        style={{ display: 'grid', gap: '0.5rem', margin: 0, fontSize: '0.875rem' }}
                      >
                        <div>
                          <dt
                            style={{ color: '#64748b', marginBottom: '0.25rem', fontWeight: 500 }}
                          >
                            💀 Victim
                          </dt>
                          <dd style={{ margin: 0 }}>
                            <EntityLink
                              type="character"
                              id={item.victimCharacterId}
                              name={item.victimCharacterName}
                              showAvatar={true}
                              avatarSize={24}
                            />
                            {item.victimCorpId && (
                              <div style={{ marginTop: '0.25rem', fontSize: '0.8125rem' }}>
                                <EntityLink
                                  type="corporation"
                                  id={item.victimCorpId}
                                  name={item.victimCorpName}
                                  showAvatar={true}
                                  avatarSize={20}
                                />
                                {item.victimAllianceId && (
                                  <>
                                    {' • '}
                                    <EntityLink
                                      type="alliance"
                                      id={item.victimAllianceId}
                                      name={item.victimAllianceName}
                                      showAvatar={true}
                                      avatarSize={20}
                                    />
                                  </>
                                )}
                              </div>
                            )}
                          </dd>
                        </div>

                        {item.attackerAllianceIds.length > 0 && (
                          <div>
                            <dt
                              style={{ color: '#64748b', marginBottom: '0.25rem', fontWeight: 500 }}
                            >
                              ⚔️ Attacker Alliances
                            </dt>
                            <dd style={{ margin: 0 }}>
                              <EntityList
                                type="alliance"
                                ids={item.attackerAllianceIds}
                                names={item.attackerAllianceNames}
                                showAvatars={true}
                                avatarSize={20}
                                maxDisplay={3}
                              />
                            </dd>
                          </div>
                        )}
                      </dl>

                      <a
                        href={item.zkbUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          marginTop: '0.75rem',
                          fontSize: '0.875rem',
                          color: '#0ea5e9',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        View on zKillboard →
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
