import 'dotenv/config';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { FileMigrationProvider, Migrator } from 'kysely';
import { createDb } from '../src/client';
import type { Database } from '../src/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.resolve(__dirname, '../migrations');

async function migrate() {
  const db = createDb();

  const migrator = new Migrator<Database>({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: migrationsDir,
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((result) => {
    if (result.status === 'Success') {
      console.log(`Migration ${result.migrationName} executed`);
    } else if (result.status === 'Error') {
      console.error(`Migration ${result.migrationName} failed`, result.error);
    }
  });

  await db.destroy();

  if (error) {
    console.error('Migration failed', error);
    process.exitCode = 1;
  }
}

void migrate();
