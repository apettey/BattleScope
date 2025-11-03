import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import type { PoolConfig } from 'pg';
import { loadDatabaseConfig } from './env';
import type { Database } from './schema';

const parseBigInt = (value: string | null) => (value === null ? null : BigInt(value));

// 20 = int8, 1700 = numeric
[20, 1700].forEach((oid) => {
  types.setTypeParser(oid, (value) => {
    const parsed = parseBigInt(value);
    return parsed ?? null;
  });
});

// 1184 = timestamptz
types.setTypeParser(1184, (value) => (value === null ? null : new Date(value)));

export const createPool = (config = loadDatabaseConfig()): Pool => {
  const poolConfig: PoolConfig = config.connectionString
    ? {
        connectionString: config.connectionString,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      };

  return new Pool(poolConfig);
};

export const createDb = (pool = createPool()): Kysely<Database> =>
  new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });

export type DatabaseClient = Kysely<Database>;
