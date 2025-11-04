import { z } from 'zod';
import { buildUrl, defaultFetch, fetchJson } from '../api/http.js';

const RulesetSchema = z.object({
  id: z.string().uuid(),
  minPilots: z.number().int(),
  trackedAllianceIds: z.array(z.string()),
  trackedCorpIds: z.array(z.string()),
  ignoreUnlisted: z.boolean(),
  updatedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Ruleset = z.infer<typeof RulesetSchema>;

export interface FetchRulesetOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

export const fetchCurrentRuleset = async (
  options: FetchRulesetOptions = {},
): Promise<Ruleset> => {
  const { baseUrl, fetchFn, signal } = options;
  const url = buildUrl('/rulesets/current', {}, baseUrl);
  const data = await fetchJson(url, { signal }, fetchFn ?? defaultFetch);
  return RulesetSchema.parse(data);
};

export interface UpdateRulesetPayload {
  minPilots: number;
  trackedAllianceIds: string[];
  trackedCorpIds: string[];
  ignoreUnlisted: boolean;
  updatedBy: string | null;
}

export const updateRuleset = async (
  payload: UpdateRulesetPayload,
  options: FetchRulesetOptions = {},
): Promise<Ruleset> => {
  const { baseUrl, fetchFn, signal } = options;
  const url = buildUrl('/rulesets/current', {}, baseUrl);
  const body = JSON.stringify(payload);
  const data = await fetchJson(
    url,
    {
      method: 'PUT',
      body,
      headers: { 'Content-Type': 'application/json' },
      signal,
    },
    fetchFn ?? defaultFetch,
  );
  return RulesetSchema.parse(data);
};
