import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { RulesetRepository } from '@battlescope/database';
import type { NameEnricher } from '../services/name-enricher.js';

const RulesetUpdateSchema = z.object({
  minPilots: z.number().int().min(0).max(1000).optional(),
  trackedAllianceIds: z.array(z.string()).optional(),
  trackedCorpIds: z.array(z.string()).optional(),
  trackedSystemIds: z.array(z.string()).optional(),
  trackedSecurityTypes: z
    .array(z.enum(['highsec', 'lowsec', 'nullsec', 'wormhole', 'pochven']))
    .optional(),
  ignoreUnlisted: z.boolean().optional(),
  updatedBy: z.string().nullable().optional(),
});

/**
 * Register public ruleset routes (no authentication required)
 * These are used for testing and backward compatibility
 */
export function registerRulesetRoutes(
  app: FastifyInstance,
  rulesetRepository: RulesetRepository,
  nameEnricher: NameEnricher,
): void {
  const appWithTypes = app.withTypeProvider<ZodTypeProvider>();

  // Get current ruleset
  appWithTypes.get(
    '/rulesets/current',
    {
      schema: {
        tags: ['Rulesets'],
        summary: 'Get current active ruleset',
        response: {
          200: z.object({
            id: z.string().uuid(),
            minPilots: z.number(),
            trackedAllianceIds: z.array(z.string()),
            trackedCorpIds: z.array(z.string()),
            trackedSystemIds: z.array(z.string()),
            trackedSecurityTypes: z.array(z.string()),
            ignoreUnlisted: z.boolean(),
            updatedBy: z.string().nullable(),
            updatedAt: z.string(),
            trackedAllianceNames: z.array(z.string()),
            trackedCorpNames: z.array(z.string()),
          }),
        },
      },
    },
    async (_request, reply) => {
      const ruleset = await rulesetRepository.getActiveRuleset();

      // Enrich alliance and corp names
      const allianceIds = ruleset.trackedAllianceIds.map((id) => Number(id));
      const corpIds = ruleset.trackedCorpIds.map((id) => Number(id));
      const allIds = [...allianceIds, ...corpIds];

      const names = allIds.length > 0 ? await nameEnricher.lookupNames(allIds) : new Map();

      const allianceNames = allianceIds.map((id) => names.get(id.toString()) ?? `Unknown ${id}`);
      const corpNames = corpIds.map((id) => names.get(id.toString()) ?? `Unknown ${id}`);

      return reply.send({
        id: ruleset.id,
        minPilots: ruleset.minPilots,
        trackedAllianceIds: ruleset.trackedAllianceIds.map(String),
        trackedCorpIds: ruleset.trackedCorpIds.map(String),
        trackedSystemIds: ruleset.trackedSystemIds.map(String),
        trackedSecurityTypes: ruleset.trackedSecurityTypes,
        ignoreUnlisted: ruleset.ignoreUnlisted,
        updatedBy: ruleset.updatedBy ?? null,
        updatedAt: ruleset.updatedAt.toISOString(),
        trackedAllianceNames: allianceNames,
        trackedCorpNames: corpNames,
      });
    },
  );

  // Update current ruleset
  appWithTypes.put(
    '/rulesets/current',
    {
      schema: {
        tags: ['Rulesets'],
        summary: 'Update current active ruleset',
        body: RulesetUpdateSchema,
        response: {
          200: z.object({
            id: z.string().uuid(),
            minPilots: z.number(),
            trackedAllianceIds: z.array(z.string()),
            trackedCorpIds: z.array(z.string()),
            trackedSystemIds: z.array(z.string()),
            trackedSecurityTypes: z.array(z.string()),
            ignoreUnlisted: z.boolean(),
            updatedBy: z.string().nullable(),
            updatedAt: z.string(),
            trackedAllianceNames: z.array(z.string()),
            trackedCorpNames: z.array(z.string()),
          }),
        },
      },
    },
    async (request, reply) => {
      const update = request.body;
      const current = await rulesetRepository.getActiveRuleset();

      await rulesetRepository.updateActiveRuleset({
        minPilots: update.minPilots ?? current.minPilots,
        trackedAllianceIds: update.trackedAllianceIds?.map(BigInt) ?? current.trackedAllianceIds,
        trackedCorpIds: update.trackedCorpIds?.map(BigInt) ?? current.trackedCorpIds,
        trackedSystemIds: update.trackedSystemIds?.map(BigInt) ?? current.trackedSystemIds,
        trackedSecurityTypes: update.trackedSecurityTypes ?? current.trackedSecurityTypes,
        ignoreUnlisted: update.ignoreUnlisted ?? current.ignoreUnlisted,
        updatedBy: update.updatedBy ?? current.updatedBy,
      });

      const updated = await rulesetRepository.getActiveRuleset();

      // Enrich alliance and corp names
      const allianceIds = updated.trackedAllianceIds.map((id) => Number(id));
      const corpIds = updated.trackedCorpIds.map((id) => Number(id));
      const allIds = [...allianceIds, ...corpIds];

      const names = allIds.length > 0 ? await nameEnricher.lookupNames(allIds) : new Map();

      const allianceNames = allianceIds.map((id) => names.get(id.toString()) ?? `Unknown ${id}`);
      const corpNames = corpIds.map((id) => names.get(id.toString()) ?? `Unknown ${id}`);

      return reply.send({
        id: updated.id,
        minPilots: updated.minPilots,
        trackedAllianceIds: updated.trackedAllianceIds.map(String),
        trackedCorpIds: updated.trackedCorpIds.map(String),
        trackedSystemIds: updated.trackedSystemIds.map(String),
        trackedSecurityTypes: updated.trackedSecurityTypes,
        ignoreUnlisted: updated.ignoreUnlisted,
        updatedBy: updated.updatedBy ?? null,
        updatedAt: updated.updatedAt.toISOString(),
        trackedAllianceNames: allianceNames,
        trackedCorpNames: corpNames,
      });
    },
  );
}
