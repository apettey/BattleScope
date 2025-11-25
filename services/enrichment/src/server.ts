import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createLogger } from '@battlescope/logger';
import healthRoutes from './routes/health';
import enrichedRoutes from './routes/enriched';

const logger = createLogger({ serviceName: 'enrichment-server' });

export async function buildServer() {
  const fastify = Fastify({
    logger: false, // Use our custom logger
    requestIdHeader: 'x-request-id',
    trustProxy: true,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Request logging
  fastify.addHook('onRequest', async (request) => {
    logger.info({
      msg: 'Incoming request',
      method: request.method,
      url: request.url,
      requestId: request.id,
    });
  });

  // Response logging
  fastify.addHook('onResponse', async (request, reply) => {
    logger.info({
      msg: 'Request completed',
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      requestId: request.id,
      responseTime: reply.getResponseTime(),
    });
  });

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    logger.error({
      msg: 'Request error',
      error: error.message,
      stack: error.stack,
      method: request.method,
      url: request.url,
      requestId: request.id,
    });

    reply.status(error.statusCode || 500).send({
      error: 'Internal Server Error',
      message: error.message,
      requestId: request.id,
    });
  });

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(enrichedRoutes);

  return fastify;
}
