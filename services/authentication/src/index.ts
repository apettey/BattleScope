import path from 'path';
import { runMigrations } from '@battlescope/database';
import { createLogger } from '@battlescope/logger';
import { buildServer } from './server';
import { getDatabase, closeDatabase } from './database/client';
import { closeRedis } from './lib/session';

const logger = createLogger({ serviceName: 'authentication' });

async function start() {
  try {
    // Get database connection
    const db = getDatabase();
    logger.info('Database connection established');

    // Run migrations before starting server (skip if SKIP_MIGRATIONS is set)
    if (process.env.SKIP_MIGRATIONS !== 'true') {
      const migrationsPath = path.join(__dirname, '../migrations');
      await runMigrations(db, { migrationsPath, logger });
      logger.info('Database migrations completed');
    } else {
      logger.info('Skipping database migrations (SKIP_MIGRATIONS=true)');
    }

    // Build and start server
    const server = await buildServer();
    const port = parseInt(process.env.PORT || '3007', 10);
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    logger.info(`Authentication service started on ${host}:${port}`);

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        await server.close();
        await closeDatabase();
        await closeRedis();
        logger.info('Server closed');
        process.exit(0);
      });
    }
  } catch (error) {
    logger.error('Failed to start authentication service:', error);
    await closeDatabase();
    await closeRedis();
    process.exit(1);
  }
}

start();
