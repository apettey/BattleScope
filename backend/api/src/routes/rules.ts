import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RulesetRepository } from '@battlescope/database';
import type { NameEnricher } from '../services/name-enricher.js';

const TrackedIdSchema = z.union([z.coerce.bigint(), z.string(), z.number()]);

const RulesetBodySchema = z
  .object({
    minPilots: z.coerce.number().int().min(1).max(500).optional(),
    trackedAllianceIds: z.array(TrackedIdSchema).max(250).optional(),
    trackedCorpIds: z.array(TrackedIdSchema).max(250).optional(),
    ignoreUnlisted: z.boolean().optional(),
    updatedBy: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

const coerceIds = (values: readonly (bigint | string | number)[] | undefined): bigint[] => {
  if (!values) {
    return [];
  }
  const set = new Set<bigint>();
  for (const value of values) {
    const bigintValue =
      typeof value === 'bigint'
        ? value
        : typeof value === 'string'
          ? BigInt(value.trim())
          : BigInt(Math.trunc(value));
    set.add(bigintValue);
  }
  return Array.from(set);
};

export const registerRulesRoutes = (
  app: FastifyInstance,
  repository: RulesetRepository,
  nameEnricher: NameEnricher,
): void => {
  app.get('/rulesets/current', async (_, reply) => {
    const ruleset = await repository.getActiveRuleset();
    const enriched = await nameEnricher.enrichRuleset(ruleset);
    return reply.send(enriched);
  });

  app.put('/rulesets/current', async (request, reply) => {
    const body = RulesetBodySchema.parse(request.body ?? {});
    const ruleset = await repository.updateActiveRuleset({
      minPilots: body.minPilots ?? 1,
      trackedAllianceIds: coerceIds(body.trackedAllianceIds),
      trackedCorpIds: coerceIds(body.trackedCorpIds),
      ignoreUnlisted: body.ignoreUnlisted ?? false,
      updatedBy: body.updatedBy ?? null,
    });

    const enriched = await nameEnricher.enrichRuleset(ruleset);
    return reply.send(enriched);
  });
};
