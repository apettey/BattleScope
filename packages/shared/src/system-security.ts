import type { SecurityType } from '@battlescope/database';
import type { Redis } from 'ioredis';
import { pino } from 'pino';
import { deriveSpaceType, type SpaceType } from './space-type.js';

const logger = pino({ name: 'system-security', level: process.env.LOG_LEVEL ?? 'info' });

const SYSTEM_SECURITY_CACHE_KEY_PREFIX = 'battlescope:system:security:';
const SYSTEM_SECURITY_CACHE_TTL = 24 * 60 * 60; // 24 hours

export interface SystemInfo {
  systemId: bigint;
  securityStatus: number;
  securityType: SecurityType;
  spaceType: SpaceType;
}

/**
 * Derives security type from security status and space type
 */
export function deriveSecurityType(systemId: bigint, securityStatus?: number): SecurityType {
  const spaceType = deriveSpaceType(systemId);

  // Wormhole and Pochven systems don't have traditional security status
  if (spaceType === 'jspace') return 'wormhole';
  if (spaceType === 'pochven') return 'pochven';

  // K-space systems require security status
  if (securityStatus === undefined) {
    throw new Error(`Security status required for k-space system ${systemId}`);
  }

  if (securityStatus >= 0.5) return 'highsec';
  if (securityStatus >= 0.1) return 'lowsec';
  return 'nullsec';
}

/**
 * System security resolver with ESI integration and Redis caching
 */
export class SystemSecurityResolver {
  constructor(
    private readonly esiClient: {
      getSystemInfo(systemId: number): Promise<{ security_status: number }>;
    },
    private readonly redis?: Redis,
  ) {}

  private getCacheKey(systemId: bigint): string {
    return `${SYSTEM_SECURITY_CACHE_KEY_PREFIX}${systemId}`;
  }

  /**
   * Get system security type with caching
   */
  async getSecurityType(systemId: bigint): Promise<SecurityType> {
    const spaceType = deriveSpaceType(systemId);

    // Wormhole and Pochven systems don't need ESI lookup
    if (spaceType === 'jspace') return 'wormhole';
    if (spaceType === 'pochven') return 'pochven';

    // Try Redis cache first
    if (this.redis) {
      try {
        const cached = await this.redis.get(this.getCacheKey(systemId));
        if (cached) {
          logger.debug({ systemId: systemId.toString() }, 'System security cache hit');
          return cached as SecurityType;
        }
      } catch (error) {
        logger.warn({ err: error, systemId: systemId.toString() }, 'Redis cache read failed');
      }
    }

    // Fetch from ESI
    try {
      const systemInfo = await this.esiClient.getSystemInfo(Number(systemId));
      const securityType = deriveSecurityType(systemId, systemInfo.security_status);

      // Cache the result
      if (this.redis) {
        try {
          await this.redis.setex(
            this.getCacheKey(systemId),
            SYSTEM_SECURITY_CACHE_TTL,
            securityType,
          );
          logger.debug({ systemId: systemId.toString(), securityType }, 'Cached system security');
        } catch (error) {
          logger.warn({ err: error, systemId: systemId.toString() }, 'Redis cache write failed');
        }
      }

      return securityType;
    } catch (error) {
      logger.error(
        { err: error, systemId: systemId.toString() },
        'Failed to fetch system info from ESI',
      );
      // Fallback: derive from space type only
      if (spaceType === 'kspace') {
        // Conservative fallback for k-space
        return 'nullsec';
      }
      throw error;
    }
  }

  /**
   * Get system security types for multiple systems (batch operation)
   */
  async getSecurityTypes(systemIds: readonly bigint[]): Promise<Map<bigint, SecurityType>> {
    const results = new Map<bigint, SecurityType>();

    // Process in parallel
    await Promise.all(
      systemIds.map(async (systemId) => {
        try {
          const securityType = await this.getSecurityType(systemId);
          results.set(systemId, securityType);
        } catch (error) {
          logger.error(
            { err: error, systemId: systemId.toString() },
            'Failed to resolve system security type',
          );
          // Skip failed lookups
        }
      }),
    );

    return results;
  }

  /**
   * Invalidate cache for a system
   */
  async invalidateCache(systemId: bigint): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.del(this.getCacheKey(systemId));
      logger.debug({ systemId: systemId.toString() }, 'Invalidated system security cache');
    } catch (error) {
      logger.warn({ err: error, systemId: systemId.toString() }, 'Failed to invalidate cache');
    }
  }
}
