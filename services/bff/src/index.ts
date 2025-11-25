/**
 * BFF (Backend for Frontend) Service
 * Main entry point - aggregates APIs from multiple backend services
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { createLogger } from '@battlescope/logger';
import { config } from './config';

// Create logger instance
const logger = createLogger({ serviceName: 'bff' });

// Import route modules
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { battleRoutes } from './routes/battles';
import { intelRoutes } from './routes/intel';
import { searchRoutes } from './routes/search';
import { notificationRoutes } from './routes/notifications';
import { statsRoutes } from './routes/stats';
import { healthRoutes } from './routes/health';

async function startServer() {
  // Create Fastify instance
  const fastify = Fastify({
    logger: false, // We use our own logger
    trustProxy: true,
    requestIdHeader: 'x-request-id',
  });

  // Register plugins
  await fastify.register(cors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  });

  await fastify.register(cookie);

  // Request logging middleware
  fastify.addHook('onRequest', async (request, reply) => {
    logger.info({
      method: request.method,
      url: request.url,
      ip: request.ip,
      requestId: request.id,
    }, 'Incoming request');
  });

  // Response logging middleware
  fastify.addHook('onResponse', async (request, reply) => {
    logger.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.getResponseTime(),
      requestId: request.id,
    }, 'Request completed');
  });

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    logger.error({
      error: error.message,
      stack: error.stack,
      method: request.method,
      url: request.url,
      requestId: request.id,
    }, 'Request error');

    reply.status(error.statusCode || 500).send({
      error: error.name || 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
      statusCode: error.statusCode || 500,
    });
  });

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(battleRoutes);
  await fastify.register(intelRoutes);
  await fastify.register(searchRoutes);
  await fastify.register(notificationRoutes);
  await fastify.register(statsRoutes);

  // Root endpoint
  fastify.get('/', async (request, reply) => {
    return {
      service: 'BattleScope BFF',
      version: '1.0.0',
      description: 'Backend for Frontend - API aggregation service',
      status: 'operational',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth/*',
        battles: '/api/battles',
        intel: '/api/intel/*',
        search: '/api/search',
        notifications: '/api/notifications',
      },
    };
  });

  // Start server
  try {
    await fastify.listen({
      port: config.port,
      host: config.host,
    });

    logger.info({
      port: config.port,
      host: config.host,
      nodeEnv: config.nodeEnv,
      services: config.services,
      cacheEnabled: config.cache.enabled,
      cacheTTL: config.cache.ttl,
    }, 'BFF service started successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to start BFF service');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server
startServer();
