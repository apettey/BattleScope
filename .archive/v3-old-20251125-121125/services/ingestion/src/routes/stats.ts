import { FastifyPluginAsync } from 'fastify';

export const statsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/ingestion/stats', async () => {
    return {
      realTime: {
        totalIngested: 0,
        totalAccepted: 0,
        totalRejected: 0,
      },
      historical: {
        totalJobs: 0,
        runningJobs: 0,
      },
    };
  });
};
