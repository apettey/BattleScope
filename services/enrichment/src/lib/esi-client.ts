import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { createLogger } from '@battlescope/logger';
import { getRedis } from './redis';
import { getDatabase } from '../database/client';
import { getRateLimiter } from './rate-limiter';

const logger = createLogger({ serviceName: 'esi-client' });

export interface ESIShipType {
  type_id: number;
  name: string;
  description: string;
  group_id: number;
  mass?: number;
  volume?: number;
}

export interface ESIGroup {
  group_id: number;
  name: string;
  category_id: number;
}

export interface ESISystem {
  system_id: number;
  name: string;
  constellation_id: number;
  security_status: number;
  position?: {
    x: number;
    y: number;
    z: number;
  };
}

export interface ESIConstellation {
  constellation_id: number;
  name: string;
  region_id: number;
}

export interface ESIRegion {
  region_id: number;
  name: string;
  description?: string;
}

export interface ESICharacter {
  character_id: number;
  name: string;
  corporation_id: number;
  alliance_id?: number;
  birthday: string;
}

export interface ESICorporation {
  corporation_id: number;
  name: string;
  ticker: string;
  member_count: number;
  alliance_id?: number;
}

export interface ESIAlliance {
  alliance_id: number;
  name: string;
  ticker: string;
  executor_corporation_id: number;
}

interface ESIRateLimitHeaders {
  group: string;
  limit: string;
  remaining: number;
  used: number;
  reset?: number;
}

export class ESIClient {
  private client: AxiosInstance;
  private redis = getRedis();
  private db = getDatabase();
  private rateLimiter = getRateLimiter();

  // Default rate limit assumptions if headers are missing
  private readonly DEFAULT_RATE_LIMIT_GROUP = 'default';
  private readonly DEFAULT_RATE_LIMIT = '150/15m';

  constructor() {
    this.client = axios.create({
      baseURL: 'https://esi.evetech.net/latest',
      timeout: 30000, // Increased timeout for rate-limited requests
      headers: {
        'User-Agent': 'BattleScope/3.0 (contact@battlescope.io)',
      },
    });

    // Add response interceptor to handle rate limit errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const status = error.response?.status;

        if (status === 420) {
          // Legacy error limit exceeded (100 errors/minute)
          logger.error({
            msg: 'ESI legacy error limit (420) exceeded',
            url: error.config?.url,
          });
          // Wait 60 seconds for error window to reset
          await this.sleep(60000);
        } else if (status === 429) {
          // Rate limit exceeded
          const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '60', 10);
          logger.warn({
            msg: 'ESI rate limit (429) exceeded',
            url: error.config?.url,
            retryAfter,
          });
          await this.sleep(retryAfter * 1000);
        }

        throw error;
      }
    );
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Parse ESI rate limit headers from response
   */
  private parseRateLimitHeaders(response: AxiosResponse): ESIRateLimitHeaders | null {
    const headers = response.headers;

    const group = headers['x-esi-error-limit-remain'] || headers['x-ratelimit-group'];
    const limit = headers['x-esi-error-limit-reset'] || headers['x-ratelimit-limit'];
    const remaining = headers['x-esi-error-limit-remain'] || headers['x-ratelimit-remaining'];
    const used = headers['x-ratelimit-used'];
    const reset = headers['x-esi-error-limit-reset'] || headers['x-ratelimit-reset'];

    if (!group || !limit) {
      return null;
    }

    return {
      group,
      limit,
      remaining: parseInt(remaining, 10) || 0,
      used: parseInt(used, 10) || 0,
      reset: reset ? parseInt(reset, 10) : undefined,
    };
  }

  private async getCached<T>(key: string): Promise<T | null> {
    try {
      // Try Redis first
      const cached = await this.redis.get(key);
      if (cached) {
        logger.debug(`Redis cache hit: ${key}`);
        return JSON.parse(cached);
      }

      // Try PostgreSQL cache
      const dbCached = await this.db
        .selectFrom('esi_cache')
        .selectAll()
        .where('cache_key', '=', key)
        .where('expires_at', '>', new Date())
        .executeTakeFirst();

      if (dbCached) {
        logger.debug(`DB cache hit: ${key}`);
        // Restore to Redis
        await this.redis.setex(key, 3600, JSON.stringify(dbCached.cache_value));
        return dbCached.cache_value as T;
      }

      return null;
    } catch (error) {
      logger.error(`Cache read error for ${key}:`, error);
      return null;
    }
  }

  private async setCache(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      // Store in Redis
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));

      // Store in PostgreSQL
      await this.db
        .insertInto('esi_cache')
        .values({
          cache_key: key,
          cache_value: JSON.stringify(value),
          cached_at: new Date(),
          expires_at: expiresAt,
        })
        .onConflict((oc) =>
          oc.column('cache_key').doUpdateSet({
            cache_value: JSON.stringify(value),
            cached_at: new Date(),
            expires_at: expiresAt,
          })
        )
        .execute();

      logger.debug(`Cached: ${key} (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      logger.error(`Cache write error for ${key}:`, error);
    }
  }

  /**
   * Fetch from ESI with proper token bucket rate limiting
   *
   * This implementation:
   * - Waits for tokens to be available before making request
   * - Parses rate limit headers from response
   * - Updates rate limit state based on server's view
   * - Tracks legacy error limit (100 errors/minute)
   * - Handles 420 and 429 errors with backoff
   */
  private async fetchWithCache<T>(
    cacheKey: string,
    url: string,
    ttlSeconds: number = 3600
  ): Promise<T> {
    // Check cache first
    const cached = await this.getCached<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Use default rate limit group assumption
    // In production, these should come from previous responses or configuration
    const rateLimitGroup = this.DEFAULT_RATE_LIMIT_GROUP;
    const rateLimit = this.DEFAULT_RATE_LIMIT;

    try {
      // Wait for tokens to become available (coordinated across all instances via Redis)
      await this.rateLimiter.waitForTokens(rateLimitGroup, rateLimit, 2);

      // Make the request
      const response = await this.client.get<T>(url);
      const data = response.data;
      const statusCode = response.status;

      // Parse rate limit headers
      const rateLimitHeaders = this.parseRateLimitHeaders(response);

      if (rateLimitHeaders) {
        // Update rate limiter state with server's view
        await this.rateLimiter.updateRateLimitState(
          rateLimitHeaders.group,
          rateLimitHeaders.limit,
          rateLimitHeaders.remaining,
          rateLimitHeaders.used,
          statusCode
        );
      }

      // Track errors for legacy error limit
      if (statusCode >= 400) {
        await this.rateLimiter.trackError(statusCode);
      }

      // Cache the result
      await this.setCache(cacheKey, data, ttlSeconds);

      return data;
    } catch (error: any) {
      const statusCode = error.response?.status;

      // Track error for legacy limit
      if (statusCode) {
        await this.rateLimiter.trackError(statusCode);
      }

      if (statusCode === 404) {
        logger.debug(`ESI 404 for ${url}`);
        return null as T;
      }

      logger.error({
        msg: `ESI fetch error for ${url}`,
        errorMessage: error.message,
        statusCode,
        url,
      });

      throw error;
    }
  }

  async getShipType(typeId: number): Promise<ESIShipType | null> {
    return this.fetchWithCache(
      `ship_type:${typeId}`,
      `/universe/types/${typeId}`,
      86400 // 24 hours
    );
  }

  async getGroup(groupId: number): Promise<ESIGroup | null> {
    return this.fetchWithCache(
      `group:${groupId}`,
      `/universe/groups/${groupId}`,
      86400 // 24 hours
    );
  }

  async getSystem(systemId: number): Promise<ESISystem | null> {
    return this.fetchWithCache(
      `system:${systemId}`,
      `/universe/systems/${systemId}`,
      86400 // 24 hours
    );
  }

  async getConstellation(constellationId: number): Promise<ESIConstellation | null> {
    return this.fetchWithCache(
      `constellation:${constellationId}`,
      `/universe/constellations/${constellationId}`,
      86400 // 24 hours
    );
  }

  async getRegion(regionId: number): Promise<ESIRegion | null> {
    return this.fetchWithCache(
      `region:${regionId}`,
      `/universe/regions/${regionId}`,
      86400 // 24 hours
    );
  }

  async getCharacter(characterId: number): Promise<ESICharacter | null> {
    return this.fetchWithCache(
      `character:${characterId}`,
      `/characters/${characterId}`,
      3600 // 1 hour
    );
  }

  async getCorporation(corporationId: number): Promise<ESICorporation | null> {
    return this.fetchWithCache(
      `corporation:${corporationId}`,
      `/corporations/${corporationId}`,
      3600 // 1 hour
    );
  }

  async getAlliance(allianceId: number): Promise<ESIAlliance | null> {
    return this.fetchWithCache(
      `alliance:${allianceId}`,
      `/alliances/${allianceId}`,
      3600 // 1 hour
    );
  }

  async cleanExpiredCache(): Promise<void> {
    try {
      const result = await this.db
        .deleteFrom('esi_cache')
        .where('expires_at', '<', new Date())
        .executeTakeFirst();

      logger.info(`Cleaned ${result.numDeletedRows} expired cache entries`);
    } catch (error) {
      logger.error('Failed to clean expired cache:', error);
    }
  }
}

// Singleton instance
let esiClient: ESIClient | null = null;

export function getESIClient(): ESIClient {
  if (!esiClient) {
    esiClient = new ESIClient();
  }
  return esiClient;
}
