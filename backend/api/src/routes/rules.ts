import type { FastifyInstance } from 'fastify';
import type { RulesetRepository } from '@battlescope/database';
import type { NameEnricher } from '../services/name-enricher.js';
import { RulesetSchema, RulesetUpdateSchema, ErrorResponseSchema } from '../schemas.js';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';

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

const RULESET_INVALIDATION_CHANNEL = 'battlescope:ruleset:invalidate';

export const registerRulesRoutes = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: FastifyInstance<any, any, any, any, ZodTypeProvider>,
  repository: RulesetRepository,
  nameEnricher: NameEnricher,
  redis?: Redis,
): void => {
  app.get('/rulesets/current', {
    schema: {
      tags: ['Rules'],
      summary: 'Get current ruleset',
      description: 'Returns the currently active ruleset configuration',
      response: {
        200: RulesetSchema,
        500: ErrorResponseSchema,
      },
    },
    handler: async (_, reply) => {
      const ruleset = await repository.getActiveRuleset();
      const enriched = await nameEnricher.enrichRuleset(ruleset);
      return reply.send(enriched);
    },
  });

  app.put('/rulesets/current', {
    schema: {
      tags: ['Rules'],
      summary: 'Update current ruleset',
      description:
        'Updates the active ruleset configuration. All fields are optional; omitted fields retain their current values.',
      body: RulesetUpdateSchema,
      response: {
        200: RulesetSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const body = RulesetUpdateSchema.parse(request.body ?? {});
      const ruleset = await repository.updateActiveRuleset({
        minPilots: body.minPilots ?? 1,
        trackedAllianceIds: coerceIds(body.trackedAllianceIds),
        trackedCorpIds: coerceIds(body.trackedCorpIds),
        trackedSystemIds: coerceIds(body.trackedSystemIds),
        trackedSecurityTypes: body.trackedSecurityTypes ?? [],
        ignoreUnlisted: body.ignoreUnlisted ?? false,
        updatedBy: body.updatedBy ?? null,
      });

      // Publish cache invalidation to all ingestion service instances
      if (redis) {
        try {
          const count = await redis.publish(RULESET_INVALIDATION_CHANNEL, new Date().toISOString());
          app.log.info(
            { subscriberCount: count },
            'Published ruleset invalidation to ingestion services',
          );
        } catch (error) {
          app.log.warn({ err: error }, 'Failed to publish ruleset invalidation');
        }
      }

      const enriched = await nameEnricher.enrichRuleset(ruleset);
      return reply.send(enriched);
    },
  });
};
