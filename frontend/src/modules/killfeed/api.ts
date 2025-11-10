import { z } from 'zod';
import type { SecurityType } from '@battlescope/shared';
import { buildUrl, defaultFetch, fetchJson } from '../api/http.js';

const KillmailFeedItemSchema = z.object({
  killmailId: z.string(),
  systemId: z.string(),
  systemName: z.string().nullable(),
  occurredAt: z.string(),
  securityType: z.enum(['highsec', 'lowsec', 'nullsec', 'wormhole', 'pochven']),
  victimAllianceId: z.string().nullable(),
  victimAllianceName: z.string().nullable(),
  victimCorpId: z.string().nullable(),
  victimCorpName: z.string().nullable(),
  victimCharacterId: z.string().nullable(),
  victimCharacterName: z.string().nullable(),
  attackerAllianceIds: z.array(z.string()),
  attackerAllianceNames: z.array(z.string().nullable()),
  attackerCorpIds: z.array(z.string()),
  attackerCorpNames: z.array(z.string().nullable()),
  attackerCharacterIds: z.array(z.string()),
  attackerCharacterNames: z.array(z.string().nullable()),
  iskValue: z.string().nullable(),
  zkbUrl: z.string().url(),
  battleId: z.string().uuid().nullable(),
  participantCount: z.number(),
});

const KillmailFeedResponseSchema = z.object({
  items: z.array(KillmailFeedItemSchema),
  count: z.number(),
});

export type KillmailFeedItem = z.infer<typeof KillmailFeedItemSchema>;
export type KillmailFeedResponse = z.infer<typeof KillmailFeedResponseSchema>;

export interface FetchRecentKillmailsOptions {
  limit?: number;
  securityTypes?: readonly SecurityType[];
  trackedOnly?: boolean;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

export const fetchRecentKillmails = async (
  options: FetchRecentKillmailsOptions = {},
): Promise<KillmailFeedResponse> => {
  const { limit, securityTypes, trackedOnly, baseUrl, fetchFn, signal } = options;
  const url = buildUrl(
    '/killmails/recent',
    {
      limit: limit ? String(limit) : undefined,
      trackedOnly: trackedOnly ? 'true' : undefined,
      securityType: securityTypes && securityTypes.length > 0 ? securityTypes : undefined,
    },
    baseUrl,
  );

  const data = await fetchJson(url, { signal }, fetchFn ?? defaultFetch);
  return KillmailFeedResponseSchema.parse(data);
};

export interface KillmailStreamOptions {
  limit?: number;
  securityTypes?: readonly SecurityType[];
  trackedOnly?: boolean;
  pollIntervalMs?: number;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  onSnapshot: (items: KillmailFeedItem[]) => void;
  onUpdate?: (item: KillmailFeedItem) => void;
  onError?: (error: unknown) => void;
}

export const createKillmailStream = (options: KillmailStreamOptions) => {
  const {
    limit,
    securityTypes,
    trackedOnly,
    pollIntervalMs,
    baseUrl,
    fetchFn,
    onSnapshot,
    onUpdate,
    onError,
  } = options;
  const params: Record<string, string | readonly string[] | null | undefined> = {
    limit: limit ? String(limit) : undefined,
    trackedOnly: trackedOnly ? 'true' : undefined,
    securityType: securityTypes && securityTypes.length > 0 ? securityTypes : undefined,
  };
  const url = buildUrl('/killmails/stream', params, baseUrl);

  const supportsEventSource =
    typeof window !== 'undefined' && typeof window.EventSource !== 'undefined';

  if (supportsEventSource) {
    const source = new EventSource(url, { withCredentials: true });

    source.addEventListener('snapshot', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as unknown;
        const parsed = z.array(KillmailFeedItemSchema).parse(payload);
        onSnapshot(parsed);
      } catch (error) {
        onError?.(error);
      }
    });

    source.addEventListener('killmail', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as unknown;
        const parsed = KillmailFeedItemSchema.parse(payload);
        onUpdate?.(parsed);
      } catch (error) {
        onError?.(error);
      }
    });

    source.addEventListener('error', (event) => {
      onError?.(event);
    });

    return () => {
      source.close();
    };
  }

  let cancelled = false;
  const interval = pollIntervalMs ?? 5000;

  const runPoll = async () => {
    if (cancelled) {
      return;
    }
    try {
      const response = await fetchRecentKillmails({
        limit,
        securityTypes,
        trackedOnly,
        baseUrl,
        fetchFn,
      });
      onSnapshot(response.items);
    } catch (error) {
      onError?.(error);
    } finally {
      if (!cancelled) {
        setTimeout(() => {
          void runPoll();
        }, interval);
      }
    }
  };

  setTimeout(() => {
    void runPoll();
  }, 0);

  return () => {
    cancelled = true;
  };
};

export const formatParticipantCount = (count: number): string =>
  `${count} pilot${count === 1 ? '' : 's'}`;
