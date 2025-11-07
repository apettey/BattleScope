import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { createDb, KillmailRepository, RulesetRepository } from '@battlescope/database';
import {
  ENRICHMENT_QUEUE_NAME,
  assertEnv,
  startTelemetry,
  stopTelemetry,
  type EnrichmentJobPayload,
} from '@battlescope/shared';
import { loadConfig } from './config.js';
import { IngestionService, type KillmailEnrichmentProducer } from './service.js';
import { MockKillmailSource, ZKillboardRedisQSource } from './source.js';
import { createHealthServer } from './health.js';
import { RedisRulesetCache } from './ruleset-cache.js';
import { pino } from 'pino';

const logger = pino({ name: 'ingest-bootstrap', level: process.env.LOG_LEVEL ?? 'info' });

export const start = async (): Promise<void> => {
  await startTelemetry();
  const config = loadConfig();
  const db = createDb();
  const killmailRepository = new KillmailRepository(db);
  const rulesetRepository = new RulesetRepository(db);
  const source = new ZKillboardRedisQSource(config.redisqUrl, config.redisqQueueId);
  const redisUrl = assertEnv('REDIS_URL');

  // Create Redis connections
  const redis = new IORedis(redisUrl, { connectionName: 'ingest-cache' });
  const enrichmentQueue = new Queue<EnrichmentJobPayload>(ENRICHMENT_QUEUE_NAME, {
    connection: new IORedis(redisUrl, { connectionName: 'ingest-enrichment-producer' }),
    defaultJobOptions: {
      removeOnComplete: 1_000,
      removeOnFail: 1_000,
    },
  });

  // Create ruleset cache with pub/sub invalidation
  const rulesetCache = new RedisRulesetCache(rulesetRepository, redis, 300); // 5 min TTL
  await rulesetCache.startInvalidationListener();
  logger.info('Ruleset cache initialized with Redis backend');

  const enrichmentProducer: KillmailEnrichmentProducer = {
    enqueue: async (killmailId: bigint) => {
      await enrichmentQueue.add('enrich-killmail', { killmailId: killmailId.toString() });
    },
  };

  const service = new IngestionService(
    killmailRepository,
    rulesetCache,
    source,
    enrichmentProducer,
  );
  const healthServer = createHealthServer(db);

  const abortController = new AbortController();

  const shutdown = async () => {
    if (abortController.signal.aborted) {
      return;
    }
    abortController.abort();
    logger.info('Shutting down ingestion service');
    await healthServer.close();
    await rulesetCache.close();
    await enrichmentQueue.close();
    await redis.quit();
    await db.destroy();
    await stopTelemetry();
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
  start().catch(async (error) => {
    logger.error({ err: error }, 'Ingestion service failed to start');
    await stopTelemetry();
    process.exitCode = 1;
  });
}

export { IngestionService, MockKillmailSource }; // re-export for tests
