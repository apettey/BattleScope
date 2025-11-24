import {
  BattleRepository,
  KillmailRepository,
  KillmailEnrichmentRepository,
  PilotShipHistoryRepository,
  createDb,
} from '@battlescope/database';
import { startTelemetry, stopTelemetry } from '@battlescope/shared';
import { ClusteringEngine, ClustererService } from '@battlescope/battle-reports';
import { loadConfig } from './config.js';
import { createHealthServer } from './health.js';
import { pino } from 'pino';

const logger = pino({ name: 'clusterer-bootstrap', level: process.env.LOG_LEVEL ?? 'info' });

export const start = async (): Promise<void> => {
  await startTelemetry();
  const config = loadConfig();
  const db = createDb();
  const battleRepository = new BattleRepository(db);
  const killmailRepository = new KillmailRepository(db);
  const enrichmentRepository = new KillmailEnrichmentRepository(db);
  const shipHistoryRepository = new PilotShipHistoryRepository(db);
  const engine = new ClusteringEngine({
    windowMinutes: config.windowMinutes,
    gapMaxMinutes: config.gapMaxMinutes,
    minKills: config.minKills,
  });
  const service = new ClustererService(
    battleRepository,
    killmailRepository,
    engine,
    config.processingDelayMinutes,
    enrichmentRepository,
    shipHistoryRepository,
  );
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
    await stopTelemetry();
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
  start().catch(async (error) => {
    logger.error({ err: error }, 'Clusterer service failed to start');
    await stopTelemetry();
    process.exitCode = 1;
  });
}
