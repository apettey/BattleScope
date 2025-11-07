import type { RulesetRecord, RulesetRepository } from '@battlescope/database';
import type { Redis } from 'ioredis';
import { pino } from 'pino';

const logger = pino({ name: 'ruleset-cache', level: process.env.LOG_LEVEL ?? 'info' });

const RULESET_CACHE_KEY = 'battlescope:ruleset:active';
const RULESET_INVALIDATION_CHANNEL = 'battlescope:ruleset:invalidate';

export interface RulesetCache {
  get(): Promise<RulesetRecord>;
  invalidate(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Redis-backed ruleset cache with pub/sub invalidation
 */
export class RedisRulesetCache implements RulesetCache {
  private subscriber: Redis | null = null;

  constructor(
    private readonly repository: RulesetRepository,
    private readonly redis: Redis,
    private readonly ttlSeconds: number = 300, // 5 minutes default
  ) {}

  async startInvalidationListener(): Promise<void> {
    if (this.subscriber) {
      return;
    }

    // Create separate connection for pub/sub
    this.subscriber = this.redis.duplicate();

    await this.subscriber.subscribe(RULESET_INVALIDATION_CHANNEL);
    logger.info('Subscribed to ruleset invalidation channel');

    this.subscriber.on('message', (channel, message) => {
      if (channel === RULESET_INVALIDATION_CHANNEL) {
        logger.info({ message }, 'Received ruleset invalidation message');
        void this.invalidate();
      }
    });
  }

  async get(): Promise<RulesetRecord> {
    // Try to get from Redis cache first
    const cached = await this.redis.get(RULESET_CACHE_KEY);

    if (cached) {
      logger.debug('Ruleset cache hit');
      return JSON.parse(cached, (key, value) => {
        // Revive bigint arrays
        if (key === 'trackedAllianceIds' || key === 'trackedCorpIds') {
          return Array.isArray(value) ? value.map((v) => BigInt(v)) : value;
        }
        // Revive dates
        if ((key === 'createdAt' || key === 'updatedAt') && typeof value === 'string') {
          return new Date(value);
        }
        return value;
      }) as RulesetRecord;
    }

    logger.debug('Ruleset cache miss, loading from database');

    // Cache miss - load from database
    const ruleset = await this.repository.getActiveRuleset();

    // Store in Redis with TTL
    await this.redis.setex(
      RULESET_CACHE_KEY,
      this.ttlSeconds,
      JSON.stringify(ruleset, (key, value) => {
        // Serialize bigints as strings
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      }),
    );

    logger.info({ ttlSeconds: this.ttlSeconds }, 'Cached ruleset in Redis');

    return ruleset;
  }

  async invalidate(): Promise<void> {
    await this.redis.del(RULESET_CACHE_KEY);
    logger.info('Invalidated ruleset cache');
  }

  async close(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }
}

/**
 * Publishes a cache invalidation message to all subscribers
 */
export async function publishRulesetInvalidation(redis: Redis): Promise<void> {
  const count = await redis.publish(RULESET_INVALIDATION_CHANNEL, new Date().toISOString());
  logger.info({ subscriberCount: count }, 'Published ruleset invalidation message');
}
