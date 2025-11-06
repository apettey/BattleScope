import { z } from 'zod';
import { buildUrl, fetchJson } from '../api/http.js';

const ShipUsageSchema = z.object({
  shipTypeId: z.string(),
  shipTypeName: z.string().nullable(),
  count: z.number().int(),
});

const OpponentAllianceSchema = z.object({
  allianceId: z.string(),
  allianceName: z.string().nullable(),
  battleCount: z.number().int(),
});

const SystemUsageSchema = z.object({
  systemId: z.string(),
  systemName: z.string().nullable(),
  battleCount: z.number().int(),
});

const TopPilotSchema = z.object({
  characterId: z.string(),
  characterName: z.string().nullable(),
  battleCount: z.number().int(),
});

const AllianceStatisticsSchema = z.object({
  totalBattles: z.number().int(),
  totalKillmails: z.number().int(),
  totalIskDestroyed: z.string(),
  totalIskLost: z.string(),
  iskEfficiency: z.number(),
  averageParticipants: z.number(),
  mostUsedShips: z.array(ShipUsageSchema),
  topOpponents: z.array(OpponentAllianceSchema),
  topSystems: z.array(SystemUsageSchema),
});

export const AllianceDetailSchema = z.object({
  allianceId: z.string(),
  allianceName: z.string().nullable(),
  ticker: z.string().nullable(),
  statistics: AllianceStatisticsSchema,
});

const CorporationStatisticsSchema = z.object({
  totalBattles: z.number().int(),
  totalKillmails: z.number().int(),
  totalIskDestroyed: z.string(),
  totalIskLost: z.string(),
  iskEfficiency: z.number(),
  averageParticipants: z.number(),
  mostUsedShips: z.array(ShipUsageSchema),
  topOpponents: z.array(OpponentAllianceSchema),
  topPilots: z.array(TopPilotSchema),
});

export const CorporationDetailSchema = z.object({
  corpId: z.string(),
  corpName: z.string().nullable(),
  ticker: z.string().nullable(),
  allianceId: z.string().nullable(),
  allianceName: z.string().nullable(),
  statistics: CorporationStatisticsSchema,
});

const CharacterStatisticsSchema = z.object({
  totalBattles: z.number().int(),
  totalKills: z.number().int(),
  totalLosses: z.number().int(),
  totalIskDestroyed: z.string(),
  totalIskLost: z.string(),
  iskEfficiency: z.number(),
  mostUsedShips: z.array(ShipUsageSchema),
  topOpponents: z.array(OpponentAllianceSchema),
  favoriteSystems: z.array(SystemUsageSchema),
});

export const CharacterDetailSchema = z.object({
  characterId: z.string(),
  characterName: z.string().nullable(),
  corpId: z.string().nullable(),
  corpName: z.string().nullable(),
  allianceId: z.string().nullable(),
  allianceName: z.string().nullable(),
  statistics: CharacterStatisticsSchema,
});

export type AllianceDetail = z.infer<typeof AllianceDetailSchema>;
export type CorporationDetail = z.infer<typeof CorporationDetailSchema>;
export type CharacterDetail = z.infer<typeof CharacterDetailSchema>;
export type ShipUsage = z.infer<typeof ShipUsageSchema>;
export type OpponentAlliance = z.infer<typeof OpponentAllianceSchema>;
export type TopPilot = z.infer<typeof TopPilotSchema>;

export interface FetchEntityOptions {
  signal?: AbortSignal;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export const fetchAllianceDetail = async (
  allianceId: string,
  options: FetchEntityOptions = {},
): Promise<AllianceDetail> => {
  const { signal, baseUrl, fetchFn } = options;
  const url = buildUrl(`/alliances/${allianceId}`, {}, baseUrl);
  const response = await fetchJson<unknown>(url, { signal }, fetchFn);
  return AllianceDetailSchema.parse(response);
};

export const fetchCorporationDetail = async (
  corpId: string,
  options: FetchEntityOptions = {},
): Promise<CorporationDetail> => {
  const { signal, baseUrl, fetchFn } = options;
  const url = buildUrl(`/corporations/${corpId}`, {}, baseUrl);
  const response = await fetchJson<unknown>(url, { signal }, fetchFn);
  return CorporationDetailSchema.parse(response);
};

export const fetchCharacterDetail = async (
  characterId: string,
  options: FetchEntityOptions = {},
): Promise<CharacterDetail> => {
  const { signal, baseUrl, fetchFn } = options;
  const url = buildUrl(`/characters/${characterId}`, {}, baseUrl);
  const response = await fetchJson<unknown>(url, { signal }, fetchFn);
  return CharacterDetailSchema.parse(response);
};

export const formatIsk = (iskString: string): string => {
  const isk = BigInt(iskString);
  if (isk >= 1_000_000_000_000n) {
    return `${(Number(isk) / 1_000_000_000_000).toFixed(2)}T ISK`;
  }
  if (isk >= 1_000_000_000n) {
    return `${(Number(isk) / 1_000_000_000).toFixed(2)}B ISK`;
  }
  if (isk >= 1_000_000n) {
    return `${(Number(isk) / 1_000_000).toFixed(2)}M ISK`;
  }
  return `${Number(isk).toLocaleString()} ISK`;
};
