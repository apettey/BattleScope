import { pino } from 'pino';
import {
  BattleRepository,
  KillmailRepository,
  RulesetRepository,
  DashboardRepository,
  createDb,
} from '@battlescope/database';
import { startTelemetry, stopTelemetry } from '@battlescope/shared';
import { loadConfig } from './config.js';
import { buildServer } from './server.js';

const logger = pino({ name: 'api-bootstrap', level: process.env.LOG_LEVEL ?? 'info' });

export const start = async (): Promise<void> => {
  await startTelemetry();
  const config = loadConfig();
  const db = createDb();
  const battleRepository = new BattleRepository(db);
  const killmailRepository = new KillmailRepository(db);
  const rulesetRepository = new RulesetRepository(db);
  const dashboardRepository = new DashboardRepository(db);
  const app = buildServer({
    battleRepository,
    killmailRepository,
    rulesetRepository,
    dashboardRepository,
    db,
    config,
  });

  const shutdown = async () => {
    logger.info('Shutting down API server');
    await app.close();
    await db.destroy();
    await stopTelemetry();
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  await app.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port, host: config.host }, 'API server ready');
};

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch(async (error) => {
    logger.error({ err: error }, 'API server failed to start');
    await stopTelemetry();
    process.exitCode = 1;
  });
}

export { buildServer };
