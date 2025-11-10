/**
 * Search Routes
 *
 * API endpoints for Typesense-powered search functionality
 */

import type { FastifyInstance } from 'fastify';
import { trace } from '@opentelemetry/api';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { SearchService } from '@battlescope/search';

const tracer = trace.getTracer('battlescope.api.search');

// ============================================================================
// Zod Schemas
// ============================================================================

// Entity autocomplete schemas
const EntityTypeSchema = z.enum(['alliance', 'corporation', 'character']);

const EntityAutocompleteQuerySchema = z.object({
  q: z.string().min(2),
  type: z.union([EntityTypeSchema, z.array(EntityTypeSchema)]).optional().transform((value) => {
    if (!value) return undefined;
    return Array.isArray(value) ? [...new Set(value)] : [value];
  }),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

const EntitySearchResultSchema = z.object({
  id: z.string(),
  type: EntityTypeSchema,
  name: z.string(),
  ticker: z.string().nullable(),
  allianceId: z.string().optional(),
  allianceName: z.string().optional(),
  corpId: z.string().optional(),
  corpName: z.string().optional(),
  battleCount: z.number().int(),
  lastSeenAt: z.string().datetime(),
});

const EntityAutocompleteResponseSchema = z.object({
  alliances: z.array(EntitySearchResultSchema),
  corporations: z.array(EntitySearchResultSchema),
  characters: z.array(EntitySearchResultSchema),
  processingTimeMs: z.number(),
  query: z.string(),
});

// System autocomplete schemas
const SpaceTypeSchema = z.enum(['kspace', 'jspace', 'pochven']);
const SecurityLevelSchema = z.enum(['highsec', 'lowsec', 'nullsec']);

const SystemAutocompleteQuerySchema = z.object({
  q: z.string().min(2),
  space_type: z.union([SpaceTypeSchema, z.array(SpaceTypeSchema)]).optional().transform((value) => {
    if (!value) return undefined;
    return Array.isArray(value) ? [...new Set(value)] : [value];
  }),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

const SystemSearchResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  regionId: z.string(),
  regionName: z.string(),
  constellationId: z.string(),
  constellationName: z.string(),
  spaceType: SpaceTypeSchema,
  securityLevel: SecurityLevelSchema.nullable(),
  securityStatus: z.number(),
  battleCount: z.number().int(),
  lastBattleAt: z.string().datetime().nullable(),
});

const SystemAutocompleteResponseSchema = z.object({
  systems: z.array(SystemSearchResultSchema),
  processingTimeMs: z.number(),
  query: z.string(),
});

// Global search schemas
const GlobalSearchQuerySchema = z.object({
  q: z.string().min(2),
  limit: z.coerce.number().int().min(1).max(10).optional().default(5),
});

const BattleSearchResultSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  systemName: z.string(),
  regionName: z.string(),
  spaceType: SpaceTypeSchema,
  securityLevel: SecurityLevelSchema.nullable(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  duration: z.number().int(),
  totalKills: z.number().int(),
  totalParticipants: z.number().int(),
  totalIskDestroyed: z.number(),
  allianceNames: z.array(z.string()),
  _matchedTerms: z.array(z.string()).optional(),
  _relevanceScore: z.number().optional(),
});

const GlobalSearchResponseSchema = z.object({
  battles: z.array(BattleSearchResultSchema),
  entities: z.object({
    alliances: z.array(EntitySearchResultSchema),
    corporations: z.array(EntitySearchResultSchema),
    characters: z.array(EntitySearchResultSchema),
  }),
  systems: z.array(SystemSearchResultSchema),
  processingTimeMs: z.number(),
  query: z.string(),
  totalResults: z.object({
    battles: z.number().int(),
    entities: z.number().int(),
    systems: z.number().int(),
  }),
});

// Battle search schemas
const BattleFiltersSchema = z.object({
  spaceType: z.array(SpaceTypeSchema).optional(),
  securityLevel: z.array(SecurityLevelSchema).optional(),
  startTime: z.object({
    after: z.string().datetime().optional(),
    before: z.string().datetime().optional(),
  }).optional(),
  totalKills: z.object({
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  }).optional(),
  totalIskDestroyed: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  }).optional(),
  totalParticipants: z.object({
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  }).optional(),
  duration: z.object({
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  }).optional(),
  allianceIds: z.array(z.string()).optional(),
  corpIds: z.array(z.string()).optional(),
  systemIds: z.array(z.string()).optional(),
});

const BattleSearchRequestSchema = z.object({
  query: z.string().optional(),
  filters: BattleFiltersSchema.optional(),
  sort: z.object({
    by: z.enum(['startTime', 'totalKills', 'totalIskDestroyed', 'totalParticipants', 'duration']),
    order: z.enum(['asc', 'desc']),
  }).optional(),
  page: z.object({
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
  }).optional(),
});

const BattleSearchResponseSchema = z.object({
  hits: z.array(BattleSearchResultSchema),
  estimatedTotalHits: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  processingTimeMs: z.number(),
  query: z.string().optional(),
  facets: z.object({
    spaceType: z.record(z.number()).optional(),
    securityLevel: z.record(z.number()).optional(),
  }).optional(),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

// ============================================================================
// Route Handlers
// ============================================================================

export function registerSearchRoutes(
  app: FastifyInstance,
  searchService: SearchService,
) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /search/entities
   * Autocomplete search for alliances, corporations, and characters
   */
  typedApp.get('/search/entities', {
    schema: {
      description: 'Autocomplete search for entities',
      tags: ['Search'],
      querystring: EntityAutocompleteQuerySchema,
      response: {
        200: EntityAutocompleteResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const span = tracer.startSpan('api.search.entities');

    try {
      const { q, type, limit } = request.query;

      const result = await searchService.autocompleteEntities({
        q,
        type,
        limit,
      });

      span.end();
      return reply.code(200).send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Entity autocomplete failed');
      span.recordException(error as Error);
      span.end();
      return reply.code(500).send({
        error: 'search_error',
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /search/systems
   * Autocomplete search for solar systems
   */
  typedApp.get('/search/systems', {
    schema: {
      description: 'Autocomplete search for systems',
      tags: ['Search'],
      querystring: SystemAutocompleteQuerySchema,
      response: {
        200: SystemAutocompleteResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const span = tracer.startSpan('api.search.systems');

    try {
      const { q, space_type, limit } = request.query;

      const result = await searchService.autocompleteSystems({
        q,
        spaceType: space_type,
        limit,
      });

      span.end();
      return reply.code(200).send(result);
    } catch (error) {
      request.log.error({ err: error }, 'System autocomplete failed');
      span.recordException(error as Error);
      span.end();
      return reply.code(500).send({
        error: 'search_error',
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /search/global
   * Universal search across all data types
   */
  typedApp.get('/search/global', {
    schema: {
      description: 'Global search across all data types',
      tags: ['Search'],
      querystring: GlobalSearchQuerySchema,
      response: {
        200: GlobalSearchResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const span = tracer.startSpan('api.search.global');

    try {
      const { q, limit } = request.query;

      const result = await searchService.searchGlobal(q, limit);

      span.end();
      return reply.code(200).send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Global search failed');
      span.recordException(error as Error);
      span.end();
      return reply.code(500).send({
        error: 'search_error',
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /search/battles
   * Advanced battle search with complex filters
   */
  typedApp.post('/search/battles', {
    schema: {
      description: 'Advanced battle search with filters',
      tags: ['Search'],
      body: BattleSearchRequestSchema,
      response: {
        200: BattleSearchResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const span = tracer.startSpan('api.search.battles');

    try {
      const result = await searchService.searchBattles(request.body);

      span.end();
      return reply.code(200).send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Battle search failed');
      span.recordException(error as Error);
      span.end();
      return reply.code(500).send({
        error: 'search_error',
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /search/health
   * Check search service health status
   */
  typedApp.get('/search/health', {
    schema: {
      description: 'Check search service health',
      tags: ['Search'],
      response: {
        200: z.object({
          healthy: z.boolean(),
          latencyMs: z.number(),
          collections: z.object({
            battles: z.boolean(),
            entities: z.boolean(),
            systems: z.boolean(),
          }),
          error: z.string().optional(),
        }),
      },
    },
  }, async (request, reply) => {
    try {
      const health = await searchService.getClient().checkHealth();
      return reply.code(health.healthy ? 200 : 503).send(health);
    } catch (error) {
      request.log.error({ err: error }, 'Health check failed');
      return reply.code(503).send({
        healthy: false,
        latencyMs: 0,
        collections: {
          battles: false,
          entities: false,
          systems: false,
        },
        error: error instanceof Error ? error.message : 'Health check failed',
      });
    }
  });
}
