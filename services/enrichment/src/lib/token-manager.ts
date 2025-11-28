import axios from 'axios';
import { createLogger } from '@battlescope/logger';
import { getRedis } from './redis';

const logger = createLogger({ serviceName: 'token-manager' });

export interface ESIToken {
  characterId: number;
  characterName: string;
  accessToken: string;
  expiresAt: Date;
  scopes: string[];
}

/**
 * Token Manager for fetching and managing ESI access tokens
 * from the authentication service
 *
 * Features:
 * - Fetches tokens from authentication service (single source of truth)
 * - Implements round-robin token selection for load distribution
 * - Caches tokens in Redis with automatic refresh
 * - Tracks token usage for rate limiting
 * - Re-fetches tokens when they fail or expire
 */
export class TokenManager {
  private redis = getRedis();
  private authServiceUrl: string;
  private tokenCacheTTL: number = 300; // Cache tokens for 5 minutes
  private currentTokenIndex: number = 0;

  constructor() {
    this.authServiceUrl =
      process.env.AUTH_SERVICE_URL || 'http://authentication-service:3007';
  }

  /**
   * Fetch tokens from authentication service
   * Authentication service handles token refresh automatically
   */
  async fetchTokens(): Promise<ESIToken[]> {
    try {
      logger.info('Fetching ESI tokens from authentication service');

      const response = await axios.get<{ tokens: ESIToken[]; count: number }>(
        `${this.authServiceUrl}/internal/esi-tokens`,
        {
          timeout: 10000,
        }
      );

      const tokens = response.data.tokens.map((token) => ({
        ...token,
        expiresAt: new Date(token.expiresAt),
      }));

      logger.info({
        msg: 'Fetched ESI tokens from authentication service',
        count: tokens.length,
        characters: tokens.map((t) => ({
          characterId: t.characterId,
          characterName: t.characterName,
          expiresAt: t.expiresAt,
        })),
      });

      // Cache tokens in Redis
      await this.cacheTokens(tokens);

      return tokens;
    } catch (error: any) {
      logger.error({
        err: error,
        msg: 'Failed to fetch ESI tokens from authentication service',
        errorMessage: error.message,
        authServiceUrl: this.authServiceUrl,
      });
      throw error;
    }
  }

  /**
   * Cache tokens in Redis
   */
  private async cacheTokens(tokens: ESIToken[]): Promise<void> {
    try {
      await this.redis.setex(
        'esi:tokens',
        this.tokenCacheTTL,
        JSON.stringify(
          tokens.map((t) => ({
            ...t,
            expiresAt: t.expiresAt.toISOString(),
          }))
        )
      );

      logger.debug({
        msg: 'Cached ESI tokens in Redis',
        count: tokens.length,
        ttl: this.tokenCacheTTL,
      });
    } catch (error) {
      logger.error({
        err: error,
        msg: 'Failed to cache tokens in Redis',
      });
    }
  }

  /**
   * Get cached tokens from Redis
   */
  private async getCachedTokens(): Promise<ESIToken[] | null> {
    try {
      const cached = await this.redis.get('esi:tokens');
      if (!cached) {
        return null;
      }

      const tokens = JSON.parse(cached);
      return tokens.map((t: any) => ({
        ...t,
        expiresAt: new Date(t.expiresAt),
      }));
    } catch (error) {
      logger.error({
        err: error,
        msg: 'Failed to get cached tokens from Redis',
      });
      return null;
    }
  }

  /**
   * Get all available tokens (from cache or fetch from auth service)
   */
  async getTokens(): Promise<ESIToken[]> {
    // Try cache first
    const cached = await this.getCachedTokens();
    if (cached && cached.length > 0) {
      logger.debug({
        msg: 'Using cached ESI tokens',
        count: cached.length,
      });
      return cached;
    }

    // Fetch from authentication service
    return await this.fetchTokens();
  }

  /**
   * Get next token using round-robin selection
   * This distributes API calls across all available tokens
   */
  async getNextToken(): Promise<ESIToken | null> {
    const tokens = await this.getTokens();

    if (tokens.length === 0) {
      logger.warn('No ESI tokens available');
      return null;
    }

    // Round-robin token selection
    const token = tokens[this.currentTokenIndex % tokens.length];
    this.currentTokenIndex = (this.currentTokenIndex + 1) % tokens.length;

    logger.debug({
      msg: 'Selected token for ESI request',
      characterId: token.characterId,
      characterName: token.characterName,
      expiresAt: token.expiresAt,
    });

    return token;
  }

  /**
   * Mark a token as failed and re-fetch tokens from auth service
   * Called when a token returns 401/403 or other authentication errors
   */
  async markTokenFailed(characterId: number, error: string): Promise<void> {
    logger.warn({
      msg: 'Token failed, refreshing token pool',
      characterId,
      error,
    });

    // Invalidate cache
    await this.redis.del('esi:tokens');

    // Fetch fresh tokens
    await this.fetchTokens();
  }

  /**
   * Force refresh of tokens from authentication service
   */
  async refreshTokens(): Promise<ESIToken[]> {
    logger.info('Forcing refresh of ESI tokens');

    // Invalidate cache
    await this.redis.del('esi:tokens');

    // Fetch fresh tokens
    return await this.fetchTokens();
  }

  /**
   * Get token count
   */
  async getTokenCount(): Promise<number> {
    const tokens = await this.getTokens();
    return tokens.length;
  }
}

// Singleton instance
let tokenManager: TokenManager | null = null;

export function getTokenManager(): TokenManager {
  if (!tokenManager) {
    tokenManager = new TokenManager();
  }
  return tokenManager;
}
