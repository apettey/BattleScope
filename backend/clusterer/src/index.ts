import { BattleRepository, KillmailRepository, createDb } from '@battlescope/database';
import { loadConfig } from './config';
import { ClusteringEngine } from './engine';
import { ClustererService } from './service';
import { createHealthServer } from './health';
import pino from 'pino';

const logger = pino({ name: 'clusterer-bootstrap', level: process.env.LOG_LEVEL ?? 'info' });

export const start = async (): Promise<void> => {
  const config = loadConfig();
  const db = createDb();
  const battleRepository = new BattleRepository(db);
  const killmailRepository = new KillmailRepository(db);
  const engine = new ClusteringEngine({
    windowMinutes: config.windowMinutes,
    gapMaxMinutes: config.gapMaxMinutes,
    minKills: config.minKills,
  });
  const service = new ClustererService(battleRepository, killmailRepository, engine);
  const healthServer = createHealthServer(db);
  const abortController = new AbortController();

  const shutdown = async () => {
    if (abortController.signal.aborted) {
      return;
    }
    abortController.abort();
    logger.info('Shutting down clusterer service');
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
  logger.info({ port: config.port }, 'Clusterer health server ready');

  await service.runForever(config.intervalMs, config.batchSize, abortController.signal);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((error) => {
    logger.error({ err: error }, 'Clusterer service failed to start');
    process.exitCode = 1;
  });
}

export { ClustererService, ClusteringEngine };
