import type { FastifyPluginAsync } from 'fastify';
import { getDatabase } from '../database/client';
import { getRedis } from '../lib/redis';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (request, reply) => {
    try {
      // Check database connection
      const db = getDatabase();
      await db.selectFrom('enrichment_stats').select('id').limit(1).execute();

      // Check Redis connection
      const redis = getRedis();
      await redis.ping();

      return {
        status: 'healthy',
        service: 'enrichment',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'ok',
          redis: 'ok',
        },
      };
    } catch (error: any) {
      fastify.log.error('Health check failed:', error);
      reply.status(503);
      return {
        status: 'unhealthy',
        service: 'enrichment',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  });

  fastify.get('/health/ready', async (request, reply) => {
    try {
      const db = getDatabase();
      await db.selectFrom('enrichment_stats').select('id').limit(1).execute();

      const redis = getRedis();
      await redis.ping();

      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      reply.status(503);
      return {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  });

  fastify.get('/health/live', async (request, reply) => {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  });
};

export default healthRoutes;
