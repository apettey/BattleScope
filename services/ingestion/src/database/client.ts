import { Kysely } from 'kysely';
import { createDatabase, getDatabaseConfigFromEnv } from '@battlescope/database';
import type { Database } from './schema';
import type { Logger } from '@battlescope/logger';

let dbInstance: Kysely<Database> | null = null;

export function getDatabase(logger: Logger): Kysely<Database> {
  if (!dbInstance) {
    const config = getDatabaseConfigFromEnv();
    dbInstance = createDatabase<Database>(config);
    logger.info('Database connection established');
  }
  return dbInstance;
}

export async function closeDatabase(logger: Logger): Promise<void> {
  if (dbInstance) {
    await dbInstance.destroy();
    dbInstance = null;
    logger.info('Database connection closed');
  }
}
