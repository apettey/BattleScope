#!/usr/bin/env node
import path from 'path';
import { runMigrations } from '@battlescope/database';
import { createLogger } from '@battlescope/logger';
import { getDatabase, closeDatabase } from './client';

const logger = createLogger({ serviceName: 'ingestion-migrate' });

async function migrate() {
  try {
    logger.info('Starting database migrations...');

    const db = getDatabase(logger);
    const migrationsPath = path.join(__dirname, '../../migrations');

    await runMigrations(db, {
      migrationsPath,
      logger,
    });

    logger.info('Migrations completed successfully');
    await closeDatabase(logger);
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
