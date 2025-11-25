import { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    return {
      status: 'healthy',
      service: 'ingestion-service',
      version: '3.0.0',
      timestamp: new Date().toISOString(),
    };
  });

  fastify.get('/metrics', async (_request, reply) => {
    reply.type('text/plain');
    return '# Metrics placeholder\n';
  });
};
