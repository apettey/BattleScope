import pino from 'pino';
import { BattleRepository, createDb } from '@battlescope/database';
import { loadConfig } from './config';
import { buildServer } from './server';

const logger = pino({ name: 'api-bootstrap', level: process.env.LOG_LEVEL ?? 'info' });

export const start = async (): Promise<void> => {
  const config = loadConfig();
  const db = createDb();
  const battleRepository = new BattleRepository(db);
  const app = buildServer({ battleRepository, db });

  const shutdown = async () => {
    logger.info('Shutting down API server');
    await app.close();
    await db.destroy();
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
  start().catch((error) => {
    logger.error({ err: error }, 'API server failed to start');
    process.exitCode = 1;
  });
}

export { buildServer };
