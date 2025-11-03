import { createDb, KillmailRepository } from '@battlescope/database';
import { loadConfig } from './config';
import { IngestionService } from './service';
import { MockKillmailSource, ZKillboardRedisQSource } from './source';
import { createHealthServer } from './health';
import pino from 'pino';

const logger = pino({ name: 'ingest-bootstrap', level: process.env.LOG_LEVEL ?? 'info' });

export const start = async (): Promise<void> => {
  const config = loadConfig();
  const db = createDb();
  const repository = new KillmailRepository(db);
  const source = new ZKillboardRedisQSource(config.redisqUrl, config.redisqQueueId);
  const service = new IngestionService(repository, source);
  const healthServer = createHealthServer(db);

  const abortController = new AbortController();

  const shutdown = async () => {
    if (abortController.signal.aborted) {
      return;
    }
    abortController.abort();
    logger.info('Shutting down ingestion service');
    await healthServer.close();
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
