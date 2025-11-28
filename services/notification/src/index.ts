import { createLogger } from '@battlescope/logger';
import { createDatabase, closeDatabase } from './database/client';
import {
  SubscriptionsRepository,
  NotificationsRepository,
  WebhookDeliveriesRepository,
} from './database';
import { buildServer } from './server';
import { WebSocketManager } from './websocket';
import { WebhookDeliveryService } from './webhook-delivery';
import { startEventConsumer } from './consumer';
import { config } from './config';

const logger = createLogger({ serviceName: 'notification-service' });

async function main() {
  try {
    logger.info('Starting BattleScope Notification Service...');
    logger.info({
      port: config.port,
      nodeEnv: config.nodeEnv,
      database: config.database.database,
      kafkaBrokers: config.kafka.brokers,
    }, 'Configuration');

    // Initialize database
    logger.info('Connecting to database...');
    createDatabase();
    logger.info('Database connected');

    // Build Fastify server
    logger.info('Building HTTP server...');
    const app = await buildServer();

    // Start HTTP server and get the underlying HTTP server for WebSocket
    const address = await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });
    logger.info({ address }, 'HTTP server started');

    // Initialize WebSocket manager
    logger.info('Initializing WebSocket server...');
    const wsManager = new WebSocketManager(app.server);
    logger.info('WebSocket server initialized');

    // Initialize repositories
    const subscriptionsRepo = new SubscriptionsRepository();
    const notificationsRepo = new NotificationsRepository();
    const webhookDeliveriesRepo = new WebhookDeliveriesRepository();

    // Initialize webhook delivery service
    logger.info('Initializing webhook delivery service...');
    const webhookService = new WebhookDeliveryService(webhookDeliveriesRepo);
    webhookService.startRetryProcessor();
    logger.info('Webhook delivery service initialized');

    // Start event consumer
    logger.info('Starting event consumer...');
    const consumer = await startEventConsumer({
      subscriptionsRepo,
      notificationsRepo,
      wsManager,
      webhookService,
    });
    logger.info('Event consumer started');

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      try {
        // Stop accepting new connections
        logger.info('Stopping HTTP server...');
        await app.close();

        // Stop event consumer
        logger.info('Stopping event consumer...');
        await consumer.disconnect();

        // Stop webhook retry processor
        logger.info('Stopping webhook delivery service...');
        webhookService.stopRetryProcessor();

        // Close WebSocket connections
        logger.info('Closing WebSocket connections...');
        await wsManager.close();

        // Close database connections
        logger.info('Closing database connections...');
        await closeDatabase();

        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    logger.info({
      wsConnections: wsManager.getTotalConnectionsCount(),
      wsUsers: wsManager.getConnectedUsersCount(),
    }, 'BattleScope Notification Service is running');

    // Log stats periodically
    setInterval(() => {
      logger.info({
        wsConnections: wsManager.getTotalConnectionsCount(),
        wsUsers: wsManager.getConnectedUsersCount(),
      }, 'Service stats');
    }, 60000); // Every minute
  } catch (error) {
    logger.error({ error }, 'Failed to start service');
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught Exception');
  process.exit(1);
});

main();
