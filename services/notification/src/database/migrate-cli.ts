import { runMigrations } from '@battlescope/database';
import { createDatabase, closeDatabase } from './client';
import path from 'path';

async function migrate() {
  console.log('Running database migrations...');

  try {
    const db = createDatabase();

    await runMigrations(db, {
      migrationsPath: path.join(__dirname, '../../migrations'),
    });

    await closeDatabase();
    console.log('✅ Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
