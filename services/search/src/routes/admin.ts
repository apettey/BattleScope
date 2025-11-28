import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Collections } from '../schemas';

// Schema for reindex request
const ReindexRequestSchema = z.object({
  collection: z.enum(['battles', 'killmails', 'characters', 'corporations', 'systems', 'all']),
  clear_existing: z.boolean().default(false),
});

const adminRoute: FastifyPluginAsync = async (fastify) => {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  // Reindex collections
  typedFastify.post(
    '/api/admin/reindex',
    {
      schema: {
        body: ReindexRequestSchema,
        response: {
          200: z.object({
            message: z.string(),
            collection: z.string(),
            cleared: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { collection, clear_existing } = request.body;

      try {
        // TODO: Add authentication/authorization middleware
        // For now, this is an unprotected admin endpoint

        const collectionsToReindex: string[] =
          collection === 'all'
            ? [
                Collections.BATTLES,
                Collections.KILLMAILS,
                Collections.CHARACTERS,
                Collections.CORPORATIONS,
                Collections.SYSTEMS,
              ]
            : [collection];

        for (const coll of collectionsToReindex) {
          if (clear_existing) {
            fastify.log.info({ collection: coll }, 'Clearing collection');
            await fastify.indexer.clearCollection(coll);
          }

          fastify.log.info({ collection: coll }, 'Reindex requested');
        }

        return reply.send({
          message: `Reindex initiated for ${collection}`,
          collection,
          cleared: clear_existing,
        });
      } catch (error: any) {
        fastify.log.error({ error: error.message }, 'Reindex failed');
        reply.code(500).send({ error: 'Reindex failed', message: error.message } as any);
        return;
      }
    }
  );

  // Get collection statistics
  typedFastify.get('/api/admin/stats', async (request, reply) => {
    try {
      const collections = [
        Collections.BATTLES,
        Collections.KILLMAILS,
        Collections.CHARACTERS,
        Collections.CORPORATIONS,
        Collections.SYSTEMS,
      ];

      const stats = await Promise.all(
        collections.map(async (collectionName) => {
          try {
            const collection = await fastify.typesense.collections(collectionName).retrieve();
            return {
              name: collectionName,
              num_documents: collection.num_documents || 0,
            };
          } catch (error: any) {
            fastify.log.error({ collection: collectionName, error }, 'Failed to get collection stats');
            return {
              name: collectionName,
              num_documents: 0,
              error: error.message,
            };
          }
        })
      );

      return {
        collections: stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      fastify.log.error({ error: error.message }, 'Failed to get stats');
      return reply.code(500).send({ error: 'Failed to get stats', message: error.message });
    }
  });

  // Delete a document by ID
  typedFastify.delete(
    '/api/admin/:collection/:id',
    {
      schema: {
        params: z.object({
          collection: z.enum(['battles', 'killmails', 'characters', 'corporations', 'systems']),
          id: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { collection, id } = request.params;

      try {
        await fastify.typesense.collections(collection).documents(id).delete();

        fastify.log.info({ collection, id }, 'Document deleted');

        return {
          message: 'Document deleted successfully',
          collection,
          id,
        };
      } catch (error: any) {
        if (error.httpStatus === 404) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        fastify.log.error({ error: error.message, collection, id }, 'Failed to delete document');
        return reply.code(500).send({ error: 'Failed to delete document', message: error.message });
      }
    }
  );

  // Get collection schema
  typedFastify.get(
    '/api/admin/schema/:collection',
    {
      schema: {
        params: z.object({
          collection: z.enum(['battles', 'killmails', 'characters', 'corporations', 'systems']),
        }),
      },
    },
    async (request, reply) => {
      const { collection } = request.params;

      try {
        const schema = await fastify.typesense.collections(collection).retrieve();

        return {
          collection,
          schema,
        };
      } catch (error: any) {
        if (error.httpStatus === 404) {
          return reply.code(404).send({ error: 'Collection not found' });
        }

        fastify.log.error({ error: error.message, collection }, 'Failed to get schema');
        return reply.code(500).send({ error: 'Failed to get schema', message: error.message });
      }
    }
  );

  // Health check for admin routes
  typedFastify.get('/api/admin/health', async (request, reply) => {
    return {
      status: 'ok',
      service: 'search-admin',
      timestamp: new Date().toISOString(),
    };
  });
};

export default adminRoute;
