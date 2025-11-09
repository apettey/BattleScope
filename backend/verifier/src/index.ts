import { Redis } from 'ioredis';
import { pino } from 'pino';
import { createDb } from '@battlescope/database';
import { EsiClient } from '@battlescope/esi-client';
import { createEncryptionService } from '@battlescope/auth';
import { CharacterVerifierService } from './service.js';
import { loadConfig } from './config.js';
import { register } from './metrics.js';

async function main() {
  const config = loadConfig();
  const logger = pino({ name: 'character-verifier', level: process.env.LOG_LEVEL ?? 'info' });

  logger.info(
    { config: { ...config, encryptionKey: '[REDACTED]' } },
    'Starting verifier with config',
  );

  // Create database client
  const db = createDb();

  // Create Redis client
  const redis = new Redis(config.redisUrl, {
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    reconnectOnError(err) {
      logger.error({ err }, 'Redis connection error');
      return true;
    },
  });

  redis.on('error', (error) => {
    logger.error({ error }, 'Redis error');
  });

  redis.on('connect', () => {
    logger.info('Connected to Redis');
  });

  // Create ESI client
  const esiClient = new EsiClient();

  // Create encryption service
  const encryptionService = createEncryptionService(config.encryptionKey);

  // Create verifier service
  const service = new CharacterVerifierService(
    db,
    redis,
    esiClient,
    encryptionService,
    config,
    logger,
  );

  try {
    // Run verification
    const stats = await service.run();

    // Log metrics
    logger.info({ metrics: await register.metrics() }, 'Job metrics');

    // Exit with code 0 on success
    logger.info({ stats }, 'Verification job completed successfully');
    await cleanup(db, redis);
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Verification job failed');
    await cleanup(db, redis);
    process.exit(1);
  }
}

async function cleanup(db: any, redis: Redis) {
  try {
    await db.destroy();
    await redis.quit();
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

main();
