import { promises as fs } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { newDb, DataType } from 'pg-mem';
import type { Database } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../migrations');

export interface InMemoryDatabase {
  db: Kysely<Database>;
  destroy: () => Promise<void>;
}

export const createInMemoryDatabase = async (): Promise<InMemoryDatabase> => {
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  mem.public.registerFunction({
    name: 'now',
    returns: DataType.timestamptz,
    implementation: () => new Date(),
  });
  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    implementation: () => {
      // UUID v4 implementation using crypto if available, otherwise fallback
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      // Fallback UUID v4 implementation
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    },
  });

  const adapter = mem.adapters.createPg();
  const pool = new adapter.Pool();

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });

  const migrationFiles = (await fs.readdir(migrationsDir)).filter(
    (file) => file.endsWith('.ts') || file.endsWith('.js'),
  );
  migrationFiles.sort();

  for (const file of migrationFiles) {
    const module = await import(pathToFileURL(path.join(migrationsDir, file)).href);
    if (typeof module.up === 'function') {
      await module.up(db);
    }
  }

  return {
    db,
    destroy: async () => {
      await db.destroy();
      await pool.end();
    },
  };
};
