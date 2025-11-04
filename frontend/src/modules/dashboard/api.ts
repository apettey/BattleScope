import { z } from 'zod';
import { buildUrl, defaultFetch, fetchJson } from '../api/http.js';

const TopAllianceSchema = z.object({
  allianceId: z.string(),
  allianceName: z.string().nullable(),
  battleCount: z.number(),
});

const TopCorporationSchema = z.object({
  corpId: z.string(),
  corpName: z.string().nullable(),
  battleCount: z.number(),
});

const DashboardSummarySchema = z.object({
  totalBattles: z.number(),
  totalKillmails: z.number(),
  uniqueAlliances: z.number(),
  uniqueCorporations: z.number(),
  topAlliances: z.array(TopAllianceSchema),
  topCorporations: z.array(TopCorporationSchema),
  generatedAt: z.string(),
});

export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

export interface FetchDashboardSummaryOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

export const fetchDashboardSummary = async (
  options: FetchDashboardSummaryOptions = {},
): Promise<DashboardSummary> => {
  const { baseUrl, fetchFn, signal } = options;
  const url = buildUrl('/stats/summary', {}, baseUrl);
  const data = await fetchJson(url, { signal }, fetchFn ?? defaultFetch);
  return DashboardSummarySchema.parse(data);
};
