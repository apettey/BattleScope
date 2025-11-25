import Redis from 'ioredis';
import { createLogger } from '@battlescope/logger';

const logger = createLogger({ serviceName: 'enrichment-redis' });

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    redis.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    redis.on('connect', () => {
      logger.info('Connected to Redis');
    });
  }

  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
