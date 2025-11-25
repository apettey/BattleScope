import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Kysely, sql } from 'kysely';

export interface Migration {
  version: string;
  filename: string;
  sql: string;
  checksum: string;
}

interface SchemaMigration {
  version: string;
  applied_at: Date;
  checksum: string;
  execution_time_ms: number;
}

export interface MigrationRunnerOptions {
  migrationsPath: string;
  logger?: {
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
  };
}

const defaultLogger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
};

export async function runMigrations(
  db: Kysely<any>,
  options: MigrationRunnerOptions
): Promise<void> {
  const logger = options.logger || defaultLogger;
  const startTime = Date.now();

  logger.info('Starting database migrations...');

  try {
    // Ensure migrations table exists
    await ensureMigrationsTable(db);

    // Load migration files
    const migrations = await loadMigrations(options.migrationsPath, logger);
    logger.info(`Found ${migrations.length} migration files`);

    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations(db);
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));

    // Find pending migrations
    const pendingMigrations = migrations.filter(m => !appliedVersions.has(m.version));

    if (pendingMigrations.length === 0) {
      logger.info('All migrations up to date');
      return;
    }

    logger.info(`Applying ${pendingMigrations.length} pending migrations`);

    // Apply each pending migration
    for (const migration of pendingMigrations) {
      await applyMigration(db, migration, logger);
    }

    const totalTime = Date.now() - startTime;
    logger.info(`All migrations completed successfully in ${totalTime}ms`);
  } catch (error) {
    logger.error('Migration failed:', error);
    throw new Error(`Database migration failed: ${(error as Error).message}`);
  }
}

async function ensureMigrationsTable(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum TEXT NOT NULL,
      execution_time_ms INTEGER NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
    ON schema_migrations(applied_at DESC)
  `.execute(db);
}

async function loadMigrations(
  migrationsPath: string,
  logger: typeof defaultLogger
): Promise<Migration[]> {
  try {
    const files = await fs.readdir(migrationsPath);
    const sqlFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort(); // Alphabetical = numerical order

    const migrations: Migration[] = [];

    for (const filename of sqlFiles) {
      const filePath = path.join(migrationsPath, filename);
      const sqlContent = await fs.readFile(filePath, 'utf-8');
      const version = filename.replace('.sql', '');
      const checksum = crypto
        .createHash('sha256')
        .update(sqlContent)
        .digest('hex')
        .substring(0, 16);

      migrations.push({
        version,
        filename,
        sql: sqlContent,
        checksum,
      });
    }

    return migrations;
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      logger.warn('Migrations directory not found, skipping migrations');
      return [];
    }
    throw error;
  }
}

async function getAppliedMigrations(db: Kysely<any>): Promise<SchemaMigration[]> {
  const result = await sql<SchemaMigration>`
    SELECT version, applied_at, checksum, execution_time_ms
    FROM schema_migrations
    ORDER BY version ASC
  `.execute(db);

  return result.rows;
}

async function applyMigration(
  db: Kysely<any>,
  migration: Migration,
  logger: typeof defaultLogger
): Promise<void> {
  const startTime = Date.now();
  logger.info(`Applying migration: ${migration.filename}`);

  try {
    // Execute migration SQL
    await sql.raw(migration.sql).execute(db);

    // Record in migrations table
    const executionTime = Date.now() - startTime;
    await sql`
      INSERT INTO schema_migrations (version, checksum, execution_time_ms)
      VALUES (${migration.version}, ${migration.checksum}, ${executionTime})
    `.execute(db);

    logger.info(`✓ Migration ${migration.filename} applied in ${executionTime}ms`);
  } catch (error) {
    logger.error(`✗ Migration ${migration.filename} failed:`, error);
    throw error;
  }
}
