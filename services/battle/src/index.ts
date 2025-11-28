import path from 'path';
import { runMigrations } from '@battlescope/database';
import { createLogger } from '@battlescope/logger';
import { EventBus, getEventBusConfigFromEnv } from '@battlescope/events';
import { buildServer } from './server';
import { getDatabase, closeDatabase } from './database/client';
import { KillmailConsumer } from './consumer';

const logger = createLogger({ serviceName: 'battle' });

async function start() {
  try {
    // Get database connection
    const db = getDatabase();
    logger.info('Database connection established');

    // Run migrations before starting server
    const migrationsPath = path.join(__dirname, '../migrations');
    await runMigrations(db, { migrationsPath, logger });
    logger.info('Database migrations completed');

    // Initialize event bus
    const eventBusConfig = getEventBusConfigFromEnv();
    const eventBus = new EventBus(eventBusConfig);
    logger.info('Event bus initialized');

    // Start killmail consumer
    const consumer = new KillmailConsumer(eventBus, db);
    await consumer.start();
    logger.info('Killmail consumer started');

    // Build and start server
    const server = await buildServer();
    const port = parseInt(process.env.PORT || '3003', 10);
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    logger.info(`Battle service started on ${host}:${port}`);

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        await consumer.stop();
        await server.close();
        await closeDatabase();
        logger.info('Server closed');
        process.exit(0);
      });
    }
  } catch (error) {
    logger.error('Failed to start battle service:', error);
    await closeDatabase();
    process.exit(1);
  }
}

start();
