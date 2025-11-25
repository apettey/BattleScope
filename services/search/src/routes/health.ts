import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { healthCheck } from '../typesense-client';

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (request, reply) => {
    try {
      const typesenseHealthy = await healthCheck(fastify.typesense);

      const health = {
        status: typesenseHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        service: 'search',
        version: '1.0.0',
        checks: {
          typesense: typesenseHealthy ? 'up' : 'down',
        },
      };

      const statusCode = typesenseHealthy ? 200 : 503;
      return reply.code(statusCode).send(health);
    } catch (error: any) {
      fastify.log.error({ error: error.message }, 'Health check failed');
      return reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'search',
        version: '1.0.0',
        error: error.message,
      });
    }
  });
};

export default healthRoute;
