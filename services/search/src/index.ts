import Fastify from 'fastify';
import cors from '@fastify/cors';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { logger } from '@battlescope/logger';
import { loadConfig } from './config';
import { createTypesenseClient, initializeCollections } from './typesense-client';
import { Indexer } from './indexer';
import { EventConsumer } from './consumer';
import { healthRoute, searchRoute, adminRoute } from './routes';
import { Client } from 'typesense/lib/Typesense/Client';

// Extend Fastify instance with custom properties
declare module 'fastify' {
  interface FastifyInstance {
    typesense: Client;
    indexer: Indexer;
  }
}

async function main() {
  // Load configuration
  const config = loadConfig();

  logger.info({ config: { ...config, typesense: { ...config.typesense, apiKey: '***' } } }, 'Configuration loaded');

  // Create Fastify instance
  const fastify = Fastify({
    logger: logger as any,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  }).withTypeProvider<ZodTypeProvider>();

  // Set up Zod validation
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // Register CORS
  await fastify.register(cors, {
    origin: true, // Allow all origins in development, configure properly for production
    credentials: true,
  });

  // Initialize Typesense client
  const typesenseClient = createTypesenseClient(config);
  fastify.decorate('typesense', typesenseClient);

  // Initialize Typesense collections
  try {
    await initializeCollections(typesenseClient);
    logger.info('Typesense collections initialized');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to initialize Typesense collections');
    process.exit(1);
  }

  // Create indexer
  const indexer = new Indexer(typesenseClient);
  fastify.decorate('indexer', indexer);

  // Register routes
  await fastify.register(healthRoute);
  await fastify.register(searchRoute);
  await fastify.register(adminRoute);

  // Start event consumer
  const eventConsumer = new EventConsumer(config, indexer);

  try {
    await eventConsumer.start();
    logger.info('Event consumer started');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to start event consumer');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');

    try {
      await eventConsumer.stop();
      await fastify.close();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
    process.exit(1);
  });

  // Start server
  try {
    await fastify.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    logger.info({ port: config.port }, 'Search service started successfully');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to start server');
    process.exit(1);
  }
}

// Run the application
main();
