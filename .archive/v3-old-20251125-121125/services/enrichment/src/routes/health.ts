import { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      service: 'enrichment',
      timestamp: new Date().toISOString()
    };
  });

  fastify.get('/ready', async () => {
    return {
      status: 'ready',
      service: 'enrichment',
      timestamp: new Date().toISOString()
    };
  });
};
