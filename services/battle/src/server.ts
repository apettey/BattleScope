import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { createLogger } from '@battlescope/logger';
import { getDatabase } from './database/client';
import healthRoutes from './routes/health';
import battleRoutes from './routes/battles';
import intelRoutes from './routes/intel';

const logger = createLogger({ serviceName: 'battle-server' });

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof getDatabase>;
  }
}

export async function buildServer(): Promise<FastifyInstance> {
  const server = fastify({
    logger: false, // Using our custom logger
    trustProxy: true,
  });

  // Register plugins
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Add database to fastify instance
  const db = getDatabase();
  server.decorate('db', db);

  // Register routes
  await server.register(healthRoutes);
  await server.register(battleRoutes);
  await server.register(intelRoutes);

  // Global error handler
  server.setErrorHandler((error, request, reply) => {
    logger.error('Request error:', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });

    reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
    });
  });

  return server;
}
