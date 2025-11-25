import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    return {
      status: 'healthy',
      service: 'battle-clusterer',
      timestamp: new Date().toISOString(),
    };
  });
};

export default healthRoutes;
