import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { statsRoutes } from './routes/stats.js';
import { logger } from './utils/logger.js';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

async function start() {
  try {
    await fastify.register(cors);
    await fastify.register(healthRoutes);
    await fastify.register(statsRoutes);

    const port = config.port;
    await fastify.listen({ port, host: '0.0.0.0' });

    logger.info({ port }, 'Ingestion Service started');
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

start();
