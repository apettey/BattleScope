import { z } from 'zod';
import { buildUrl, defaultFetch, fetchJson } from '../api/http.js';

const KillmailEnrichmentSchema = z.object({
  status: z.enum(['pending', 'processing', 'succeeded', 'failed']),
  payload: z.record(z.any()).nullable(),
  error: z.string().nullable(),
  fetchedAt: z.string().nullable(),
  updatedAt: z.string(),
  createdAt: z.string(),
});

const KillmailDetailSchema = z.object({
  killmailId: z.string(),
  occurredAt: z.string(),
  victimAllianceId: z.string().nullable(),
  victimCorpId: z.string().nullable(),
  victimCharacterId: z.string().nullable(),
  attackerAllianceIds: z.array(z.string()),
  attackerCorpIds: z.array(z.string()),
  attackerCharacterIds: z.array(z.string()),
  iskValue: z.string().nullable(),
  zkbUrl: z.string().url(),
  enrichment: KillmailEnrichmentSchema.nullable(),
});

const BattleParticipantSchema = z.object({
  battleId: z.string().uuid(),
  characterId: z.number().int(),
  allianceId: z.number().nullable(),
  corpId: z.number().nullable(),
  shipTypeId: z.number().nullable(),
  sideId: z.number().nullable(),
  isVictim: z.boolean(),
});

export const BattleSummarySchema = z.object({
  id: z.string().uuid(),
  systemId: z.string(),
  spaceType: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  totalKills: z.string(),
  totalIskDestroyed: z.string(),
  zkillRelatedUrl: z.string().url(),
});

export const BattleDetailSchema = BattleSummarySchema.extend({
  createdAt: z.string(),
  killmails: z.array(KillmailDetailSchema),
  participants: z.array(
    BattleParticipantSchema.extend({
      characterId: z.string(),
      allianceId: z.string().nullable(),
      corpId: z.string().nullable(),
      shipTypeId: z.string().nullable(),
      sideId: z.string().nullable(),
    }),
  ),
});

const BattlesListResponseSchema = z.object({
  items: z.array(BattleSummarySchema),
  nextCursor: z.string().nullable(),
});

export type BattleSummary = z.infer<typeof BattleSummarySchema>;
export type BattleDetail = z.infer<typeof BattleDetailSchema>;
export type KillmailDetail = z.infer<typeof KillmailDetailSchema>;
export type BattlesListResponse = z.infer<typeof BattlesListResponseSchema>;

export interface FetchBattlesOptions {
  limit?: number;
  cursor?: string | null;
  signal?: AbortSignal;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export const fetchBattles = async (
  options: FetchBattlesOptions = {},
): Promise<BattlesListResponse> => {
  const { limit, cursor, signal, baseUrl, fetchFn } = options;
  const url = buildUrl(
    '/battles',
    {
      limit: limit ? String(limit) : undefined,
      cursor,
    },
    baseUrl,
  );

  const data = await fetchJson(url, { signal }, fetchFn ?? defaultFetch);
  return BattlesListResponseSchema.parse(data);
};

export interface FetchBattleDetailOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

export const fetchBattleDetail = async (
  battleId: string,
  options: FetchBattleDetailOptions = {},
): Promise<BattleDetail> => {
  const { baseUrl, fetchFn, signal } = options;
  const url = buildUrl(`/battles/${battleId}`, {}, baseUrl);
  const data = await fetchJson(url, { signal }, fetchFn ?? defaultFetch);
  return BattleDetailSchema.parse(data);
};

export const formatIsk = (value: string | null): string => {
  if (!value) {
    return '—';
  }

  try {
    const amount = BigInt(value);
    return `${amount.toLocaleString()} ISK`;
  } catch {
    return `${value} ISK`;
  }
};
