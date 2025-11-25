import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Collections } from '../schemas';

// Query schemas
const SearchQuerySchema = z.object({
  q: z.string().min(1).describe('Search query'),
  type: z.enum(['all', 'battles', 'killmails', 'characters', 'corporations', 'systems']).default('all'),
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(100).default(20),
});

const SuggestQuerySchema = z.object({
  q: z.string().min(1).describe('Partial query for autocomplete'),
  type: z.enum(['characters', 'corporations', 'systems']).default('characters'),
  limit: z.coerce.number().int().positive().max(10).default(5),
});

const BattlesQuerySchema = z.object({
  q: z.string().optional(),
  system: z.string().optional(),
  region: z.string().optional(),
  security_type: z.enum(['highsec', 'lowsec', 'nullsec', 'wormhole']).optional(),
  min_kills: z.coerce.number().int().positive().optional(),
  min_isk: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(100).default(20),
  sort_by: z.enum(['start_time', 'total_kills', 'total_isk_destroyed']).default('start_time'),
});

const KillmailsQuerySchema = z.object({
  q: z.string().optional(),
  system: z.string().optional(),
  region: z.string().optional(),
  ship_type: z.string().optional(),
  ship_group: z.string().optional(),
  victim: z.string().optional(),
  alliance: z.string().optional(),
  min_isk: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(100).default(20),
  sort_by: z.enum(['occurred_at', 'isk_value']).default('occurred_at'),
});

const CharactersQuerySchema = z.object({
  q: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(100).default(20),
});

const searchRoute: FastifyPluginAsync = async (fastify) => {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  // Universal search endpoint
  typedFastify.get(
    '/api/search',
    {
      schema: {
        querystring: SearchQuerySchema,
        response: {
          200: z.object({
            results: z.array(z.any()),
            page: z.number(),
            per_page: z.number(),
            total: z.number(),
            type: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { q, type, page, per_page } = request.query;

      try {
        let results: any[] = [];
        let total = 0;

        if (type === 'all') {
          // Search across all collections
          const collections = [
            Collections.BATTLES,
            Collections.KILLMAILS,
            Collections.CHARACTERS,
            Collections.CORPORATIONS,
            Collections.SYSTEMS,
          ];

          const searches = await Promise.all(
            collections.map(async (collection) => {
              try {
                const searchResults = await fastify.typesense
                  .collections(collection)
                  .documents()
                  .search({
                    q,
                    query_by: this.getQueryFields(collection),
                    per_page: 5, // Limit results per collection
                  });

                return {
                  collection,
                  hits: searchResults.hits || [],
                  found: searchResults.found || 0,
                };
              } catch (error) {
                fastify.log.error({ collection, error }, 'Search failed for collection');
                return { collection, hits: [], found: 0 };
              }
            })
          );

          // Combine results
          results = searches.flatMap((s) =>
            s.hits.map((hit: any) => ({
              ...hit.document,
              _collection: s.collection,
            }))
          );
          total = searches.reduce((sum, s) => sum + s.found, 0);
        } else {
          // Search specific collection
          const collection = this.getCollectionForType(type);
          const searchResults = await fastify.typesense
            .collections(collection)
            .documents()
            .search({
              q,
              query_by: this.getQueryFields(collection),
              page,
              per_page,
            });

          results = searchResults.hits?.map((hit: any) => hit.document) || [];
          total = searchResults.found || 0;
        }

        return {
          results,
          page,
          per_page,
          total,
          type,
        };
      } catch (error: any) {
        fastify.log.error({ error: error.message, query: request.query }, 'Search failed');
        return reply.code(500).send({ error: 'Search failed', message: error.message });
      }
    }
  );

  // Autocomplete/suggest endpoint
  typedFastify.get(
    '/api/search/suggest',
    {
      schema: {
        querystring: SuggestQuerySchema,
      },
    },
    async (request, reply) => {
      const { q, type, limit } = request.query;

      try {
        const collection = this.getCollectionForType(type);
        const searchResults = await fastify.typesense
          .collections(collection)
          .documents()
          .search({
            q,
            query_by: this.getQueryFields(collection),
            per_page: limit,
            prefix: true, // Enable prefix matching for autocomplete
          });

        const suggestions = searchResults.hits?.map((hit: any) => hit.document) || [];

        return { suggestions };
      } catch (error: any) {
        fastify.log.error({ error: error.message }, 'Autocomplete failed');
        return reply.code(500).send({ error: 'Autocomplete failed', message: error.message });
      }
    }
  );

  // Battle-specific search
  typedFastify.get(
    '/api/search/battles',
    {
      schema: {
        querystring: BattlesQuerySchema,
      },
    },
    async (request, reply) => {
      const { q, system, region, security_type, min_kills, min_isk, page, per_page, sort_by } = request.query;

      try {
        // Build filter string
        const filters: string[] = [];
        if (system) filters.push(`system_name:=${system}`);
        if (region) filters.push(`region_name:=${region}`);
        if (security_type) filters.push(`security_type:=${security_type}`);
        if (min_kills) filters.push(`total_kills:>=${min_kills}`);
        if (min_isk) filters.push(`total_isk_destroyed:>=${min_isk}`);

        const searchParams: any = {
          q: q || '*',
          query_by: 'system_name,region_name,alliance_names,participant_names',
          page,
          per_page,
          sort_by: `${sort_by}:desc`,
        };

        if (filters.length > 0) {
          searchParams.filter_by = filters.join(' && ');
        }

        const searchResults = await fastify.typesense
          .collections(Collections.BATTLES)
          .documents()
          .search(searchParams);

        return {
          battles: searchResults.hits?.map((hit: any) => hit.document) || [],
          page,
          per_page,
          total: searchResults.found || 0,
        };
      } catch (error: any) {
        fastify.log.error({ error: error.message }, 'Battle search failed');
        return reply.code(500).send({ error: 'Battle search failed', message: error.message });
      }
    }
  );

  // Killmail-specific search
  typedFastify.get(
    '/api/search/killmails',
    {
      schema: {
        querystring: KillmailsQuerySchema,
      },
    },
    async (request, reply) => {
      const { q, system, region, ship_type, ship_group, victim, alliance, min_isk, page, per_page, sort_by } = request.query;

      try {
        // Build filter string
        const filters: string[] = [];
        if (system) filters.push(`system_name:=${system}`);
        if (region) filters.push(`region_name:=${region}`);
        if (ship_type) filters.push(`ship_type_name:=${ship_type}`);
        if (ship_group) filters.push(`ship_group:=${ship_group}`);
        if (alliance) filters.push(`victim_alliance:=${alliance}`);
        if (min_isk) filters.push(`isk_value:>=${min_isk}`);

        const searchParams: any = {
          q: q || victim || '*',
          query_by: 'victim_name,ship_type_name,system_name,region_name',
          page,
          per_page,
          sort_by: `${sort_by}:desc`,
        };

        if (filters.length > 0) {
          searchParams.filter_by = filters.join(' && ');
        }

        const searchResults = await fastify.typesense
          .collections(Collections.KILLMAILS)
          .documents()
          .search(searchParams);

        return {
          killmails: searchResults.hits?.map((hit: any) => hit.document) || [],
          page,
          per_page,
          total: searchResults.found || 0,
        };
      } catch (error: any) {
        fastify.log.error({ error: error.message }, 'Killmail search failed');
        return reply.code(500).send({ error: 'Killmail search failed', message: error.message });
      }
    }
  );

  // Character search
  typedFastify.get(
    '/api/search/characters',
    {
      schema: {
        querystring: CharactersQuerySchema,
      },
    },
    async (request, reply) => {
      const { q, page, per_page } = request.query;

      try {
        const searchResults = await fastify.typesense
          .collections(Collections.CHARACTERS)
          .documents()
          .search({
            q,
            query_by: 'character_name,corp_name,alliance_name',
            page,
            per_page,
          });

        return {
          characters: searchResults.hits?.map((hit: any) => hit.document) || [],
          page,
          per_page,
          total: searchResults.found || 0,
        };
      } catch (error: any) {
        fastify.log.error({ error: error.message }, 'Character search failed');
        return reply.code(500).send({ error: 'Character search failed', message: error.message });
      }
    }
  );

  // Helper methods
  function getCollectionForType(type: string): string {
    switch (type) {
      case 'battles':
        return Collections.BATTLES;
      case 'killmails':
        return Collections.KILLMAILS;
      case 'characters':
        return Collections.CHARACTERS;
      case 'corporations':
        return Collections.CORPORATIONS;
      case 'systems':
        return Collections.SYSTEMS;
      default:
        return Collections.BATTLES;
    }
  }

  function getQueryFields(collection: string): string {
    switch (collection) {
      case Collections.BATTLES:
        return 'system_name,region_name,alliance_names,participant_names';
      case Collections.KILLMAILS:
        return 'victim_name,ship_type_name,system_name,region_name';
      case Collections.CHARACTERS:
        return 'character_name,corp_name,alliance_name';
      case Collections.CORPORATIONS:
        return 'corp_name,alliance_name';
      case Collections.SYSTEMS:
        return 'system_name,region_name';
      default:
        return 'system_name';
    }
  }
};

export default searchRoute;
