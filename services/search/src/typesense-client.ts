import Typesense from 'typesense';
import { Client } from 'typesense/lib/Typesense/Client';
import { Config } from './config';
import { ALL_SCHEMAS } from './schemas';
import { logger } from '@battlescope/logger';

let client: Client | null = null;

export function createTypesenseClient(config: Config): Client {
  if (!client) {
    client = new Typesense.Client({
      nodes: [
        {
          host: config.typesense.host,
          port: config.typesense.port,
          protocol: config.typesense.protocol,
        },
      ],
      apiKey: config.typesense.apiKey,
      connectionTimeoutSeconds: config.typesense.connectionTimeoutSeconds,
    });

    logger.info(
      {
        host: config.typesense.host,
        port: config.typesense.port,
        protocol: config.typesense.protocol,
      },
      'Typesense client created'
    );
  }

  return client;
}

export function getTypesenseClient(): Client {
  if (!client) {
    throw new Error('Typesense client not initialized. Call createTypesenseClient first.');
  }
  return client;
}

export async function initializeCollections(client: Client): Promise<void> {
  logger.info('Initializing Typesense collections...');

  for (const schema of ALL_SCHEMAS) {
    try {
      // Try to retrieve the collection
      await client.collections(schema.name).retrieve();
      logger.info({ collection: schema.name }, 'Collection already exists');
    } catch (error: any) {
      // Collection doesn't exist, create it
      if (error.httpStatus === 404) {
        try {
          await client.collections().create(schema);
          logger.info({ collection: schema.name }, 'Collection created successfully');
        } catch (createError: any) {
          logger.error(
            { collection: schema.name, error: createError.message },
            'Failed to create collection'
          );
          throw createError;
        }
      } else {
        logger.error(
          { collection: schema.name, error: error.message },
          'Failed to retrieve collection'
        );
        throw error;
      }
    }
  }

  logger.info('All collections initialized successfully');
}

export async function healthCheck(client: Client): Promise<boolean> {
  try {
    const health = await client.health.retrieve();
    return health.ok === true;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Typesense health check failed');
    return false;
  }
}
