export {
  ENRICHMENT_QUEUE_NAME,
  createEnrichmentQueue,
  enqueueKillmailEnrichment,
} from './queue.js';
export type { EnrichmentJobData } from './queue.js';

import { createDb, KillmailEnrichmentRepository } from '@battlescope/database';
import { Redis as IORedis } from 'ioredis';
import { QueueEvents, Worker } from 'bullmq';
import { pino } from 'pino';
import { loadConfig } from './config.js';
import { KillmailEnrichmentService, ZKillboardSource } from './enrichment-service.js';
import { createHealthServer } from './health.js';
import { ENRICHMENT_QUEUE_NAME, type EnrichmentJobData } from './queue.js';

const logger = pino({ name: 'enrichment-worker', level: process.env.LOG_LEVEL ?? 'info' });

export const start = async (): Promise<void> => {
  const config = loadConfig();
  const db = createDb();
  const repository = new KillmailEnrichmentRepository(db);
  const source = new ZKillboardSource();
  const service = new KillmailEnrichmentService(repository, source, config.throttleMs);

  const redisForHealth = new IORedis(config.redisUrl, { connectionName: 'enrichment-health' });
  const healthServer = createHealthServer({
    db,
    redis: redisForHealth,
  });

  const worker = new Worker<EnrichmentJobData>(
    ENRICHMENT_QUEUE_NAME,
    async (job) => {
      const { killmailId } = job.data;
      logger.debug({ killmailId, jobId: job.id }, 'Processing enrichment job');
      await service.process(killmailId);
    },
    {
      connection: new IORedis(config.redisUrl, { connectionName: 'enrichment-worker' }),
      concurrency: config.concurrency,
    },
  );

  const queueEvents = new QueueEvents(ENRICHMENT_QUEUE_NAME, {
    connection: new IORedis(config.redisUrl, { connectionName: 'enrichment-events' }),
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error({ jobId, failedReason }, 'Enrichment job failed');
  });

  queueEvents.on('completed', ({ jobId, returnvalue }) => {
    logger.debug({ jobId, returnvalue }, 'Enrichment job completed');
  });

  worker.on('error', (error) => {
    logger.error({ err: error }, 'Worker encountered an error');
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('Shutting down enrichment worker');
    await Promise.allSettled([
      (async () => {
        try {
          await healthServer.close();
        } catch (error) {
          logger.warn({ err: error }, 'Failed closing health server');
        }
      })(),
      (async () => {
        try {
          await queueEvents.close();
        } catch (error) {
          logger.warn({ err: error }, 'Failed closing queue events');
        }
      })(),
      (async () => {
        try {
          await worker.close();
        } catch (error) {
          logger.warn({ err: error }, 'Failed closing worker');
        }
      })(),
      (async () => {
        try {
          await redisForHealth.quit();
        } catch (error) {
          logger.warn({ err: error }, 'Failed closing Redis connection');
        }
      })(),
      (async () => {
        try {
          await db.destroy();
        } catch (error) {
          logger.warn({ err: error }, 'Failed destroying database connection');
        }
      })(),
    ]);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  await queueEvents.waitUntilReady();
  await worker.waitUntilReady();
  await healthServer.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port }, 'Enrichment health server ready');
};

const run = async () => {
  try {
    await start();
  } catch (error) {
    logger.error({ err: error }, 'Enrichment worker failed to start');
    process.exitCode = 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  void run();
}
