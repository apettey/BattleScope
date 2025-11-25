import axios, { AxiosInstance } from 'axios';
import { createLogger } from '@battlescope/logger';
import { getRedis } from './redis';
import { getDatabase } from '../database/client';

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

export class ESIClient {
  private client: AxiosInstance;
  private redis = getRedis();
  private db = getDatabase();
  private requestQueue: Promise<any> = Promise.resolve();
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 10; // 10ms = 100 requests/second (under ESI limit of 150/s)

  constructor() {
    this.client = axios.create({
      baseURL: 'https://esi.evetech.net/latest',
      timeout: 10000,
      headers: {
        'User-Agent': 'BattleScope/3.0 (github.com/yourusername/battlescope)',
      },
    });

    // Add response interceptor for rate limiting
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 420) {
          logger.warn('ESI rate limit hit, backing off...');
          await this.sleep(60000); // Wait 1 minute on rate limit
        }
        throw error;
      }
    );
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      await this.sleep(this.MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
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

  private async fetchWithCache<T>(
    cacheKey: string,
    url: string,
    ttlSeconds: number = 3600
  ): Promise<T> {
    // Check cache
    const cached = await this.getCached<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Queue the request to respect rate limits
    return this.requestQueue = this.requestQueue.then(async () => {
      await this.rateLimit();

      try {
        const response = await this.client.get<T>(url);
        const data = response.data;

        // Cache the result
        await this.setCache(cacheKey, data, ttlSeconds);

        return data;
      } catch (error: any) {
        if (error.response?.status === 404) {
          logger.debug(`ESI 404 for ${url}`);
          return null as T;
        }
        logger.error(`ESI fetch error for ${url}:`, error.message);
        throw error;
      }
    });
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
