import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createLogger } from '@battlescope/logger';
import { EventBus } from '@battlescope/events';
import { getConfig } from './config';
import { getDatabase, closeDatabase } from './database';
import { healthRoutes, killmailRoutes, statsRoutes } from './routes';
import { ZKillboardPoller } from './poller';

const logger = createLogger({ serviceName: 'ingestion' });
const config = getConfig();

let poller: ZKillboardPoller | null = null;
let eventBus: EventBus | null = null;

async function main() {
  try {
    logger.info('Starting Ingestion Service...', {
      port: config.service.port,
      env: config.service.env,
    });

    // Initialize database
    const db = getDatabase(logger);
    logger.info('Database initialized');

    // Initialize event bus
    eventBus = new EventBus(config.eventBus);
    logger.info('Event bus initialized', {
      brokers: config.eventBus.brokers,
      clientId: config.eventBus.clientId,
    });

    // Initialize Fastify
    const fastify = Fastify({
      logger: logger,
      requestIdLogLabel: 'requestId',
      disableRequestLogging: false,
    });

    // Register plugins
    await fastify.register(cors, {
      origin: true, // Allow all origins in development
      credentials: true,
    });

    // Register routes
    await healthRoutes(fastify, db);
    await killmailRoutes(fastify, db);
    await statsRoutes(fastify, db);

    // Start server
    await fastify.listen({
      port: config.service.port,
      host: '0.0.0.0',
    });

    logger.info('HTTP server started', {
      port: config.service.port,
      url: `http://localhost:${config.service.port}`,
    });

    // Start ZKillboard poller
    poller = new ZKillboardPoller(db, eventBus, logger, config.zkillboard);
    await poller.start();

    logger.info('Ingestion Service ready');

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        // Stop poller first
        if (poller) {
          await poller.stop();
          logger.info('Poller stopped');
        }

        // Close HTTP server
        await fastify.close();
        logger.info('HTTP server closed');

        // Disconnect event bus
        if (eventBus) {
          await eventBus.disconnect();
          logger.info('Event bus disconnected');
        }

        // Close database connection
        await closeDatabase(logger);

        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start service', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  process.exit(1);
});

main();
