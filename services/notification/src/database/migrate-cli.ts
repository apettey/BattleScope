import { runMigrations } from '@battlescope/database';
import { config } from '../config';
import path from 'path';

async function migrate() {
  console.log('Running database migrations...');
  console.log('Database:', config.database.database);

  try {
    await runMigrations({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
    }, path.join(__dirname, '../../migrations'));

    console.log('✅ Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
