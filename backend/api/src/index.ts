import { pino } from 'pino';
import {
  BattleRepository,
  KillmailRepository,
  RulesetRepository,
  DashboardRepository,
  AccountRepository,
  CharacterRepository,
  FeatureRepository,
  AuthConfigRepository,
  AuditLogRepository,
  createDb,
} from '@battlescope/database';
import {
  createEncryptionService,
  createEVESSOService,
  createSessionService,
  createAuthorizationService,
} from '@battlescope/auth';
import { startTelemetry, stopTelemetry } from '@battlescope/shared';
import { createEsiClient } from '@battlescope/esi-client';
import { createTypesenseClient, createSearchService } from '@battlescope/search';
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
  const accountRepository = new AccountRepository(db);
  const characterRepository = new CharacterRepository(db);
  const featureRepository = new FeatureRepository(db);
  const authConfigRepository = new AuthConfigRepository(db, logger);
  const auditLogRepository = new AuditLogRepository(db);

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

  // Create separate Redis client for session management
  let sessionRedis: RedisClient | undefined = undefined;
  if (config.sessionRedisUrl) {
    const client = new RedisConstructor(config.sessionRedisUrl, { lazyConnect: true });
    try {
      await client.connect();
      logger.info('Connected to Redis for session storage');
      sessionRedis = client;
    } catch (error) {
      logger.warn(
        { err: error },
        'Failed to connect to session Redis; sessions will use in-memory storage',
      );
      await client.quit().catch(() => undefined);
    }
  }

  // Instantiate auth services (only if auth is configured)
  const isAuthConfigured =
    config.eveClientId && config.eveClientSecret && config.eveCallbackUrl && config.encryptionKey;

  let encryptionService: ReturnType<typeof createEncryptionService> | undefined = undefined;
  let eveSSOService: ReturnType<typeof createEVESSOService> | undefined = undefined;
  let sessionService: ReturnType<typeof createSessionService> | undefined = undefined;
  let authorizationService: ReturnType<typeof createAuthorizationService> | undefined = undefined;

  if (isAuthConfigured) {
    logger.info('Auth configuration found, enabling authentication features');
    encryptionService = createEncryptionService(config.encryptionKey!);
    eveSSOService = createEVESSOService(
      {
        clientId: config.eveClientId!,
        clientSecret: config.eveClientSecret!,
        callbackUrl: config.eveCallbackUrl!,
        scopes: config.eveScopes,
      },
      esiClient,
    );
    sessionService = createSessionService(sessionRedis, {
      sessionTtl: config.sessionTtlSeconds,
      cookieName: config.sessionCookieName,
    });
    authorizationService = createAuthorizationService(sessionRedis, {
      cacheTtl: config.authzCacheTtlSeconds,
    });
  } else {
    logger.warn(
      'Auth configuration incomplete - authentication features disabled. Set EVE_CLIENT_ID, EVE_CLIENT_SECRET, EVE_CALLBACK_URL, and ENCRYPTION_KEY to enable.',
    );
  }

  const nameEnricher = new NameEnricher(esiClient);

  // Initialize Typesense client and search service
  const typesenseClient = createTypesenseClient(
    {
      nodes: [
        {
          host: config.typesenseHost,
          port: config.typesensePort,
          protocol: config.typesenseProtocol,
        },
      ],
      apiKey: config.typesenseApiKey,
      connectionTimeoutSeconds: 5,
      numRetries: 3,
    },
    logger.child({ component: 'typesense' }),
  );

  const searchService = createSearchService(typesenseClient, logger.child({ component: 'search' }));
  logger.info(
    { host: config.typesenseHost, port: config.typesensePort },
    'Search service initialized',
  );

  const app = buildServer({
    battleRepository,
    killmailRepository,
    rulesetRepository,
    dashboardRepository,
    accountRepository,
    characterRepository,
    featureRepository,
    authConfigRepository,
    auditLogRepository,
    db,
    config,
    nameEnricher,
    esiClient,
    eveSSOService,
    sessionService,
    authorizationService,
    encryptionService,
    redis: redis ?? undefined,
    searchService,
  });

  const shutdown = async () => {
    logger.info('Shutting down API server');
    await app.close();
    await db.destroy();
    if (redis) {
      await redis.quit();
    }
    if (sessionRedis) {
      await sessionRedis.quit();
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
