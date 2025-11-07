import { pino } from 'pino';
import {
  BattleRepository,
  KillmailRepository,
  RulesetRepository,
  DashboardRepository,
  createDb,
} from '@battlescope/database';
import { startTelemetry, stopTelemetry } from '@battlescope/shared';
import { createEsiClient } from '@battlescope/esi-client';
import { Redis as RedisConstructor } from 'ioredis';
import type { Redis as RedisClient } from 'ioredis';
import { loadConfig } from './config.js';
import { buildServer } from './server.js';
import { NameEnricher } from './services/name-enricher.js';
import { createRedisCacheAdapter } from './services/redis-cache.js';

const logger = pino({ name: 'api-bootstrap', level: process.env.LOG_LEVEL ?? 'info' });

export const start = async (): Promise<void> => {
  await startTelemetry();
  const config = loadConfig();
  const db = createDb();
  const battleRepository = new BattleRepository(db);
  const killmailRepository = new KillmailRepository(db);
  const rulesetRepository = new RulesetRepository(db);
  const dashboardRepository = new DashboardRepository(db);

  let redis: RedisClient | null = null;
  if (config.esiRedisCacheUrl) {
    const client = new RedisConstructor(config.esiRedisCacheUrl, { lazyConnect: true });
    try {
      await client.connect();
      logger.info('Connected to Redis for ESI caching');
      redis = client;
    } catch (error) {
      logger.warn(
        { err: error },
        'Failed to connect to Redis cache; falling back to in-memory cache',
      );
      await client.quit().catch(() => undefined);
    }
  }

  const esiClient = createEsiClient({
    baseUrl: config.esiBaseUrl,
    datasource: config.esiDatasource,
    compatibilityDate: config.esiCompatibilityDate,
    timeoutMs: config.esiTimeoutMs,
    cache: redis ? createRedisCacheAdapter(redis) : undefined,
    cacheTtlMs: config.esiCacheTtlSeconds * 1000,
  });

  const nameEnricher = new NameEnricher(esiClient);
  const app = buildServer({
    battleRepository,
    killmailRepository,
    rulesetRepository,
    dashboardRepository,
    db,
    config,
    nameEnricher,
    redis: redis ?? undefined,
  });

  const shutdown = async () => {
    logger.info('Shutting down API server');
    await app.close();
    await db.destroy();
    if (redis) {
      await redis.quit();
    }
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
