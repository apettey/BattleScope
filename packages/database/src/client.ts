import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  maxConnections?: number;
}

export function createDatabase<T>(config: DatabaseConfig): Kysely<T> {
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.maxConnections || 20,
  });

  return new Kysely<T>({
    dialect: new PostgresDialect({ pool }),
  });
}

export function getDatabaseConfigFromEnv(): DatabaseConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'battlescope',
    user: process.env.DB_USER || 'battlescope',
    password: process.env.DB_PASSWORD || 'dev_password',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
  };
}
