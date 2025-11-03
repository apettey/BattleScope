import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { createDb, KillmailRepository } from '@battlescope/database';
import { ENRICHMENT_QUEUE_NAME, assertEnv, type EnrichmentJobPayload } from '@battlescope/shared';
import { loadConfig } from './config.js';
import { IngestionService, type KillmailEnrichmentProducer } from './service.js';
import { MockKillmailSource, ZKillboardRedisQSource } from './source.js';
import { createHealthServer } from './health.js';
import pino from 'pino';

const logger = pino({ name: 'ingest-bootstrap', level: process.env.LOG_LEVEL ?? 'info' });

export const start = async (): Promise<void> => {
  const config = loadConfig();
  const db = createDb();
  const repository = new KillmailRepository(db);
  const source = new ZKillboardRedisQSource(config.redisqUrl, config.redisqQueueId);
  const redisUrl = assertEnv('REDIS_URL');
  const enrichmentQueue = new Queue<EnrichmentJobPayload>(ENRICHMENT_QUEUE_NAME, {
    connection: new IORedis(redisUrl, { connectionName: 'ingest-enrichment-producer' }),
    defaultJobOptions: {
      removeOnComplete: 1_000,
      removeOnFail: 1_000,
    },
  });

  const enrichmentProducer: KillmailEnrichmentProducer = {
    enqueue: async (killmailId: bigint) => {
      await enrichmentQueue.add('enrich-killmail', { killmailId: killmailId.toString() });
    },
  };

  const service = new IngestionService(repository, source, enrichmentProducer);
  const healthServer = createHealthServer(db);

  const abortController = new AbortController();

  const shutdown = async () => {
    if (abortController.signal.aborted) {
      return;
    }
    abortController.abort();
    logger.info('Shutting down ingestion service');
    await healthServer.close();
    await enrichmentQueue.close();
    await db.destroy();
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  await healthServer.listen({ port: config.port, host: '0.0.0.0' });
  logger.info({ port: config.port }, 'Health server ready');

  await service.runForever(config.pollIntervalMs, abortController.signal);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((error) => {
    logger.error({ err: error }, 'Ingestion service failed to start');
    process.exitCode = 1;
  });
}

export { IngestionService, MockKillmailSource }; // re-export for tests
