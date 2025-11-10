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
  enrichment: KillmailEnrichmentSchema.nullable(),
});

const BattleParticipantSchema = z.object({
  battleId: z.string().uuid(),
  characterId: z.number().int(),
  characterName: z.string().nullable(),
  allianceId: z.number().nullable(),
  allianceName: z.string().nullable(),
  corpId: z.number().nullable(),
  corpName: z.string().nullable(),
  shipTypeId: z.number().nullable(),
  shipTypeName: z.string().nullable(),
  sideId: z.number().nullable(),
  isVictim: z.boolean(),
});

export const BattleSummarySchema = z.object({
  id: z.string().uuid(),
  systemId: z.string(),
  systemName: z.string().nullable(),
  securityType: z.enum(['highsec', 'lowsec', 'nullsec', 'wormhole', 'pochven']),
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
      characterName: z.string().nullable(),
      allianceId: z.string().nullable(),
      allianceName: z.string().nullable(),
      corpId: z.string().nullable(),
      corpName: z.string().nullable(),
      shipTypeId: z.string().nullable(),
      shipTypeName: z.string().nullable(),
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
  securityType?: 'highsec' | 'lowsec' | 'nullsec' | 'wormhole' | 'pochven';
  systemId?: string;
  allianceId?: string;
  corpId?: string;
  characterId?: string;
  since?: Date;
  until?: Date;
  signal?: AbortSignal;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export const fetchBattles = async (
  options: FetchBattlesOptions = {},
): Promise<BattlesListResponse> => {
  const {
    limit,
    cursor,
    securityType,
    systemId,
    allianceId,
    corpId,
    characterId,
    since,
    until,
    signal,
    baseUrl,
    fetchFn,
  } = options;
  const url = buildUrl(
    '/battles',
    {
      limit: limit ? String(limit) : undefined,
      cursor,
      securityType,
      systemId,
      allianceId,
      corpId,
      characterId,
      since: since ? since.toISOString() : undefined,
      until: until ? until.toISOString() : undefined,
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
