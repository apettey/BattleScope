import { createDb } from '@battlescope/database';
import { createLoggerConfig } from '@battlescope/shared';
import Typesense from 'typesense';
import { Pool } from 'pg';
import pino from 'pino';
import { EntitySyncer } from './entity-syncer.js';

const logger = pino(createLoggerConfig());

interface Config {
  databaseUrl: string;
  typesenseHost: string;
  typesensePort: string;
  typesenseProtocol: string;
  typesenseApiKey: string;
}

function loadConfig(): Config {
  const config: Config = {
    databaseUrl: process.env.DATABASE_URL ?? '',
    typesenseHost: process.env.TYPESENSE_HOST ?? 'localhost',
    typesensePort: process.env.TYPESENSE_PORT ?? '8108',
    typesenseProtocol: process.env.TYPESENSE_PROTOCOL ?? 'http',
    typesenseApiKey: process.env.TYPESENSE_API_KEY ?? '',
  };

  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  if (!config.typesenseApiKey) {
    throw new Error('TYPESENSE_API_KEY environment variable is required');
  }

  return config;
}

async function main() {
  logger.info('Starting search entity sync');

  const config = loadConfig();

  logger.info(
    {
      typesenseHost: config.typesenseHost,
      typesensePort: config.typesensePort,
    },
    'Configuration loaded',
  );

  // Initialize database client
  const pool = new Pool({ connectionString: config.databaseUrl });
  const db = createDb(pool);

  // Initialize Typesense client
  const typesenseClient = new Typesense.Client({
    nodes: [
      {
        host: config.typesenseHost,
        port: Number(config.typesensePort),
        protocol: config.typesenseProtocol,
      },
    ],
    apiKey: config.typesenseApiKey,
    connectionTimeoutSeconds: 10,
  });

  // Create entity syncer
  const entitySyncer = new EntitySyncer(db, typesenseClient, logger);

  try {
    // Run the sync
    await entitySyncer.syncAllEntities();

    logger.info('Entity sync completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Entity sync failed');
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error in main');
  process.exit(1);
});
