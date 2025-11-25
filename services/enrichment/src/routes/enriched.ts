import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getEnricher } from '../lib/enricher';

const ParamsSchema = z.object({
  killmailId: z.string().transform((val) => parseInt(val, 10)),
});

const enrichedRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/enriched/:killmailId', async (request, reply) => {
    try {
      const { killmailId } = ParamsSchema.parse(request.params);
      const enricher = getEnricher();

      const enriched = await enricher.getEnrichedKillmail(killmailId);

      if (!enriched) {
        reply.status(404);
        return {
          error: 'Killmail not found',
          killmailId,
        };
      }

      return {
        killmail: enriched,
      };
    } catch (error: any) {
      fastify.log.error('Failed to fetch enriched killmail:', error);

      if (error instanceof z.ZodError) {
        reply.status(400);
        return {
          error: 'Invalid killmail ID',
          details: error.errors,
        };
      }

      reply.status(500);
      return {
        error: 'Internal server error',
        message: error.message,
      };
    }
  });

  fastify.get('/api/cache/stats', async (request, reply) => {
    try {
      const enricher = getEnricher();
      const stats = await enricher.getCacheStats();

      return {
        stats,
      };
    } catch (error: any) {
      fastify.log.error('Failed to fetch cache stats:', error);
      reply.status(500);
      return {
        error: 'Internal server error',
        message: error.message,
      };
    }
  });
};

export default enrichedRoutes;
