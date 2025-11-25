import path from 'path';
import { runMigrations } from '@battlescope/database';
import { createLogger } from '@battlescope/logger';
import { buildServer } from './server';
import { getDatabase, closeDatabase } from './database/client';
import { closeRedis } from './lib/redis';
import { getConsumer } from './consumer';
import { getESIClient } from './lib/esi-client';

const logger = createLogger({ serviceName: 'enrichment' });

async function start() {
  try {
    // Get database connection
    const db = getDatabase();
    logger.info('Database connection established');

    // Run migrations before starting server
    const migrationsPath = path.join(__dirname, '../migrations');
    await runMigrations(db, { migrationsPath, logger });
    logger.info('Database migrations completed');

    // Build and start HTTP server
    const server = await buildServer();
    const port = parseInt(process.env.PORT || '3002', 10);
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    logger.info(`Enrichment service HTTP API started on ${host}:${port}`);

    // Start Kafka consumer
    const consumer = getConsumer();
    await consumer.start();
    logger.info('Kafka consumer started');

    // Start cache cleanup task (runs every hour)
    const esiClient = getESIClient();
    const cleanupInterval = setInterval(async () => {
      try {
        await esiClient.cleanExpiredCache();
      } catch (error) {
        logger.error('Cache cleanup failed:', error);
      }
    }, 3600000); // 1 hour

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);

        clearInterval(cleanupInterval);

        await consumer.stop();
        logger.info('Consumer stopped');

        await server.close();
        logger.info('HTTP server stopped');

        await closeDatabase();
        logger.info('Database connection closed');

        await closeRedis();
        logger.info('Redis connection closed');

        logger.info('Shutdown complete');
        process.exit(0);
      });
    }
  } catch (error) {
    logger.error('Failed to start enrichment service:', error);
    await closeDatabase();
    await closeRedis();
    process.exit(1);
  }
}

start();
