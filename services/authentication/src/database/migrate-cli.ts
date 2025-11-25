import path from 'path';
import { runMigrations } from '@battlescope/database';
import { createLogger } from '@battlescope/logger';
import { getDatabase, closeDatabase } from './client';

const logger = createLogger({ serviceName: 'authentication-migrations' });

async function main() {
  try {
    const db = getDatabase();
    const migrationsPath = path.join(__dirname, '../../migrations');

    logger.info('Running database migrations...');
    await runMigrations(db, {
      migrationsPath,
      logger,
    });

    logger.info('✅ Migrations completed successfully');
    await closeDatabase();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    await closeDatabase();
    process.exit(1);
  }
}

main();
