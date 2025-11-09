import { request } from 'undici';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { z } from 'zod';
import { InMemoryCache, type CacheAdapter } from './cache.js';
import {
  cacheDegradedCounter,
  cacheHitCounter,
  cacheMissCounter,
  requestCounter,
  requestDurationHistogram,
} from './metrics.js';
import { EsiHttpError, UnauthorizedAPIToken } from './errors.js';

const DEFAULT_BASE_URL = 'https://esi.evetech.net/latest/';
const DEFAULT_DATASOURCE = 'tranquility';
const DEFAULT_COMPATIBILITY_DATE = '2025-09-30';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_TTL_MS = 300_000;
const UNIVERSE_NAMES_OPERATION = 'post_universe_names';
const UNIVERSE_NAMES_BATCH_SIZE = 1000;

const UniverseNameSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  category: z.enum([
    'alliance',
    'character',
    'constellation',
    'corporation',
    'faction',
    'inventory_type',
    'region',
    'solar_system',
    'station',
    'structure',
  ]),
});

const UniverseNamesResponseSchema = z.array(UniverseNameSchema);

const UniverseSystemInfoSchema = z.object({
  system_id: z.number().int(),
  name: z.string(),
  security_status: z.number(),
  constellation_id: z.number().int(),
  star_id: z.number().int().optional(),
  planets: z.array(z.any()).optional(),
  stargates: z.array(z.number().int()).optional(),
  stations: z.array(z.number().int()).optional(),
});

export interface UniverseSystemInfo extends z.infer<typeof UniverseSystemInfoSchema> {}

const CharacterInfoSchema = z.object({
  name: z.string(),
  corporation_id: z.number().int(),
  alliance_id: z.number().int().optional(),
  birthday: z.string(),
  gender: z.enum(['male', 'female']),
  race_id: z.number().int(),
  bloodline_id: z.number().int(),
  description: z.string().optional(),
  security_status: z.number().optional(),
});

export interface CharacterInfo extends z.infer<typeof CharacterInfoSchema> {}

const CorporationInfoSchema = z.object({
  name: z.string(),
  ticker: z.string(),
  member_count: z.number().int(),
  alliance_id: z.number().int().optional(),
  ceo_id: z.number().int(),
  creator_id: z.number().int(),
  date_founded: z.string().optional(),
  description: z.string().optional(),
  tax_rate: z.number(),
  url: z.string().optional(),
});

export interface CorporationInfo extends z.infer<typeof CorporationInfoSchema> {}

const AllianceInfoSchema = z.object({
  name: z.string(),
  ticker: z.string(),
  creator_id: z.number().int(),
  creator_corporation_id: z.number().int(),
  executor_corporation_id: z.number().int().optional(),
  date_founded: z.string(),
});

export interface AllianceInfo extends z.infer<typeof AllianceInfoSchema> {}

const tracer = trace.getTracer('battlescope.esi-client');

const toStatusClass = (statusCode: number | undefined): string => {
  if (!statusCode || statusCode < 100) {
    return 'error';
  }

  const hundred = Math.trunc(statusCode / 100);
  return `${hundred}xx`;
};

const normalizeBaseUrl = (value: string): string => (value.endsWith('/') ? value : `${value}/`);

const chunk = <T>(values: readonly T[], size: number): T[][] => {
  if (values.length <= size) {
    return [values.slice()];
  }

  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
};

const buildCacheKey = (namespace: string, id: number): string => `${namespace}:${id}`;

export type UniverseNameCategory = z.infer<typeof UniverseNameSchema>['category'];

export interface UniverseName extends z.infer<typeof UniverseNameSchema> {}

export interface EsiClientConfig {
  baseUrl?: string;
  datasource?: string;
  compatibilityDate?: string;
  timeoutMs?: number;
  getAccessToken?: () => Promise<string | undefined> | string | undefined;
  cache?: CacheAdapter<unknown>;
  cacheTtlMs?: number;
}

interface RequestOptions {
  operationId: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export class EsiClient {
  private readonly baseUrl: string;
  private readonly datasource: string;
  private readonly compatibilityDate: string;
  private readonly timeoutMs: number;
  private readonly getAccessToken?: () => Promise<string | undefined> | string | undefined;
  private readonly primaryCache?: CacheAdapter<unknown>;
  private readonly fallbackCache: InMemoryCache<unknown>;
  private readonly cacheTtlMs: number;

  constructor(config: EsiClientConfig = {}) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
    this.datasource = config.datasource ?? DEFAULT_DATASOURCE;
    this.compatibilityDate = config.compatibilityDate ?? DEFAULT_COMPATIBILITY_DATE;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.getAccessToken = config.getAccessToken;
    this.primaryCache = config.cache;
    this.cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.fallbackCache = new InMemoryCache<unknown>();
  }

  async getUniverseNames(ids: readonly number[]): Promise<Map<number, UniverseName>> {
    const unique = Array.from(new Set(ids.filter((value) => Number.isFinite(value))));
    const resolved = new Map<number, UniverseName>();
    const missing: number[] = [];

    for (const id of unique) {
      const cached = await this.readCache<UniverseName>(
        buildCacheKey('universe:names', id),
        UNIVERSE_NAMES_OPERATION,
      );
      if (cached) {
        resolved.set(id, cached);
      } else {
        missing.push(id);
      }
    }

    if (missing.length === 0) {
      return resolved;
    }

    const batches = chunk(missing, UNIVERSE_NAMES_BATCH_SIZE);
    for (const batch of batches) {
      const payload = await this.request<unknown>({
        operationId: UNIVERSE_NAMES_OPERATION,
        method: 'POST',
        path: '/universe/names',
        body: batch,
      });

      const entries = UniverseNamesResponseSchema.parse(payload);
      for (const entry of entries) {
        resolved.set(entry.id, entry);
        await this.writeCache(
          buildCacheKey('universe:names', entry.id),
          entry,
          UNIVERSE_NAMES_OPERATION,
        );
      }
    }

    return resolved;
  }

  async getSystemInfo(systemId: number): Promise<UniverseSystemInfo> {
    const operationId = 'get_universe_systems_system_id';
    const cacheKey = buildCacheKey('universe:system', systemId);

    const cached = await this.readCache<UniverseSystemInfo>(cacheKey, operationId);
    if (cached) {
      return cached;
    }

    const payload = await this.request<unknown>({
      operationId,
      method: 'GET',
      path: `/universe/systems/${systemId}`,
    });

    const systemInfo = UniverseSystemInfoSchema.parse(payload);
    await this.writeCache(cacheKey, systemInfo, operationId);

    return systemInfo;
  }

  async getCharacterInfo(characterId: number): Promise<CharacterInfo> {
    const operationId = 'get_characters_character_id';
    const cacheKey = buildCacheKey('characters:info', characterId);

    const cached = await this.readCache<CharacterInfo>(cacheKey, operationId);
    if (cached) {
      return cached;
    }

    const payload = await this.request<unknown>({
      operationId,
      method: 'GET',
      path: `/characters/${characterId}`,
    });

    const characterInfo = CharacterInfoSchema.parse(payload);
    await this.writeCache(cacheKey, characterInfo, operationId);

    return characterInfo;
  }

  async getCorporationInfo(corporationId: number): Promise<CorporationInfo> {
    const operationId = 'get_corporations_corporation_id';
    const cacheKey = buildCacheKey('corporations:info', corporationId);

    const cached = await this.readCache<CorporationInfo>(cacheKey, operationId);
    if (cached) {
      return cached;
    }

    const payload = await this.request<unknown>({
      operationId,
      method: 'GET',
      path: `/corporations/${corporationId}`,
    });

    const corporationInfo = CorporationInfoSchema.parse(payload);
    await this.writeCache(cacheKey, corporationInfo, operationId);

    return corporationInfo;
  }

  async getAllianceInfo(allianceId: number): Promise<AllianceInfo> {
    const operationId = 'get_alliances_alliance_id';
    const cacheKey = buildCacheKey('alliances:info', allianceId);

    const cached = await this.readCache<AllianceInfo>(cacheKey, operationId);
    if (cached) {
      return cached;
    }

    const payload = await this.request<unknown>({
      operationId,
      method: 'GET',
      path: `/alliances/${allianceId}`,
    });

    const allianceInfo = AllianceInfoSchema.parse(payload);
    await this.writeCache(cacheKey, allianceInfo, operationId);

    return allianceInfo;
  }

  /**
   * Get character portrait URL
   *
   * @param characterId - EVE character ID
   * @param size - Portrait size (32, 64, 128, 256, 512)
   * @returns URL to character portrait
   */
  getCharacterPortraitUrl(characterId: number, size: 32 | 64 | 128 | 256 | 512 = 128): string {
    return `https://images.evetech.net/characters/${characterId}/portrait?size=${size}`;
  }

  /**
   * Get corporation logo URL
   *
   * @param corporationId - EVE corporation ID
   * @param size - Logo size (32, 64, 128, 256)
   * @returns URL to corporation logo
   */
  getCorporationLogoUrl(corporationId: number, size: 32 | 64 | 128 | 256 = 128): string {
    return `https://images.evetech.net/corporations/${corporationId}/logo?size=${size}`;
  }

  /**
   * Get alliance logo URL
   *
   * @param allianceId - EVE alliance ID
   * @param size - Logo size (32, 64, 128, 256)
   * @returns URL to alliance logo
   */
  getAllianceLogoUrl(allianceId: number, size: 32 | 64 | 128 | 256 = 128): string {
    return `https://images.evetech.net/alliances/${allianceId}/logo?size=${size}`;
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const { operationId, method, path, body, headers = {} } = options;
    const relativePath = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(relativePath, this.baseUrl);
    url.searchParams.set('datasource', this.datasource);
    url.searchParams.set('compatibility_date', this.compatibilityDate);

    return tracer.startActiveSpan(`esi.${operationId}`, async (span) => {
      span.setAttribute(SemanticAttributes.HTTP_METHOD, method);
      span.setAttribute(SemanticAttributes.HTTP_URL, url.toString());
      span.setAttribute(SemanticAttributes.NET_PEER_NAME, url.hostname);
      span.setAttribute('esi.operation_id', operationId);
      span.setAttribute('esi.datasource', this.datasource);
      span.setAttribute('esi.compatibility_date', this.compatibilityDate);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const requestHeaders: Record<string, string> = {
        Accept: 'application/json',
        ...headers,
      };

      if (body !== undefined) {
        requestHeaders['Content-Type'] = 'application/json';
      }

      try {
        const token = this.getAccessToken ? await this.getAccessToken() : undefined;
        if (token) {
          requestHeaders.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        clearTimeout(timeout);
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      }

      const start = performance.now();

      try {
        const response = await request(url, {
          method,
          headers: requestHeaders,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });

        const raw = await response.body.text();
        const statusCode = response.statusCode;
        span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, statusCode);

        let parsed: unknown;
        if (raw.length > 0) {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
        }

        if (statusCode === 401 || statusCode === 403) {
          const error = new UnauthorizedAPIToken('ESI request requires a valid API token', {
            statusCode,
            operationId,
            url: url.toString(),
          });
          throw error;
        }

        if (statusCode < 200 || statusCode >= 300) {
          const error = new EsiHttpError(`ESI request failed with status ${statusCode}`, {
            statusCode,
            operationId,
            url: url.toString(),
            responseBody: parsed ?? raw,
          });
          throw error;
        }

        const duration = (performance.now() - start) / 1000;
        requestCounter.add(1, {
          operation: operationId,
          http_method: method,
          status_class: toStatusClass(statusCode),
          result: 'success',
        });
        requestDurationHistogram.record(duration, {
          operation: operationId,
          http_method: method,
          result: 'success',
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return (parsed ?? (undefined as unknown)) as T;
      } catch (error) {
        const duration = (performance.now() - start) / 1000;
        const statusCode =
          error instanceof EsiHttpError || error instanceof UnauthorizedAPIToken
            ? error.statusCode
            : error instanceof Error && error.name === 'AbortError'
              ? 408
              : undefined;

        requestCounter.add(1, {
          operation: operationId,
          http_method: method,
          status_class: toStatusClass(statusCode),
          result: 'error',
        });
        requestDurationHistogram.record(duration, {
          operation: operationId,
          http_method: method,
          result: 'error',
        });

        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        clearTimeout(timeout);
        span.end();
      }
    });
  }

  private async readCache<T>(key: string, operationId: string): Promise<T | undefined> {
    if (this.primaryCache) {
      try {
        const value = (await this.primaryCache.get(key)) as T | undefined;
        if (value !== undefined) {
          cacheHitCounter.add(1, { operation: operationId });
          return value;
        }
        cacheMissCounter.add(1, { operation: operationId });
      } catch {
        cacheDegradedCounter.add(1, { operation: operationId });
      }
    }

    return (await this.fallbackCache.get(key)) as T | undefined;
  }

  private async writeCache<T>(key: string, value: T, operationId: string): Promise<void> {
    if (this.primaryCache) {
      try {
        await this.primaryCache.set(key, value as unknown, this.cacheTtlMs);
      } catch {
        cacheDegradedCounter.add(1, { operation: operationId });
      }
    }

    await this.fallbackCache.set(key, value as unknown, this.cacheTtlMs);
  }
}

export const createEsiClient = (config: EsiClientConfig = {}): EsiClient => new EsiClient(config);
