import { createLogger } from '@battlescope/logger';
import { getRedis } from './redis';

const logger = createLogger({ serviceName: 'esi-rate-limiter' });

/**
 * ESI Rate Limiter using Token Bucket algorithm with floating window
 * Implements ESI's rate limiting as documented at:
 * https://developers.eveonline.com/docs/services/esi/rate-limiting/#token-system
 *
 * Key features:
 * - Distributed coordination via Redis (works across multiple enricher instances)
 * - Token bucket with floating window (tokens released after window expires)
 * - Variable costs per status code (2XX=2, 3XX=1, 4XX=5, 5XX=0)
 * - Legacy error limit tracking (max 100 errors/minute globally)
 * - Per-route rate limit groups
 */

export interface RateLimitInfo {
  group: string;
  limit: number;
  remaining: number;
  used: number;
  retryAfter?: number;
}

export interface TokenCost {
  statusCode: number;
  cost: number;
}

export class ESIRateLimiter {
  private redis = getRedis();
  private readonly LEGACY_ERROR_LIMIT = 100;
  private readonly LEGACY_ERROR_WINDOW = 60; // 60 seconds

  /**
   * Calculate token cost based on HTTP status code
   * 2XX: 2 tokens (normal success)
   * 3XX: 1 token (cache validation encouraged)
   * 4XX: 5 tokens (client errors discouraged)
   * 5XX: 0 tokens (server errors, no penalty)
   * 429: 0 tokens (rate limit, no penalty)
   */
  private getTokenCost(statusCode: number): number {
    if (statusCode === 429) return 0;
    if (statusCode >= 500) return 0;
    if (statusCode >= 400) return 5;
    if (statusCode >= 300) return 1;
    if (statusCode >= 200) return 2;
    return 2; // default
  }

  /**
   * Wait for tokens to become available in the bucket
   * Uses Redis to coordinate across multiple instances
   *
   * @param group - Rate limit group (from X-Ratelimit-Group header)
   * @param limit - Token limit (from X-Ratelimit-Limit header, e.g., "150/15m")
   * @param requiredTokens - Number of tokens needed for this request
   * @returns Time waited in ms
   */
  async waitForTokens(
    group: string,
    limit: string,
    requiredTokens: number = 2,
    maxWaitMs: number = 60000 // Maximum 60 seconds wait
  ): Promise<number> {
    const startTime = Date.now();
    const [limitCount, windowStr] = limit.split('/');
    const limitNum = parseInt(limitCount, 10);
    const windowSeconds = this.parseWindow(windowStr);

    const redisKey = `esi:ratelimit:${group}`;

    while (true) {
      const now = Date.now();
      const elapsed = now - startTime;

      // Check timeout
      if (elapsed >= maxWaitMs) {
        logger.warn({
          msg: 'Rate limiter timeout exceeded, proceeding anyway',
          group,
          waitedMs: elapsed,
          maxWaitMs,
        });
        // Proceed without tokens - let ESI handle rate limiting with 429/420
        return elapsed;
      }
      // Get current bucket state from Redis
      const bucketState = await this.redis.get(redisKey);
      let currentTokens = limitNum;
      let tokens: Array<{ timestamp: number; cost: number }> = [];

      if (bucketState) {
        const parsed = JSON.parse(bucketState);
        tokens = parsed.tokens || [];

        // Remove expired tokens (older than window)
        const windowMs = windowSeconds * 1000;
        tokens = tokens.filter((t: any) => now - t.timestamp < windowMs);

        // Calculate current tokens
        const usedTokens = tokens.reduce((sum: number, t: any) => sum + t.cost, 0);
        currentTokens = limitNum - usedTokens;
      }

      // Check if we have enough tokens
      if (currentTokens >= requiredTokens) {
        // Reserve tokens by adding to bucket
        tokens.push({ timestamp: now, cost: requiredTokens });
        await this.redis.setex(
          redisKey,
          windowSeconds + 60, // TTL slightly longer than window
          JSON.stringify({ tokens })
        );

        const waitTime = Date.now() - startTime;
        if (waitTime > 1000) {
          logger.info({
            msg: 'Acquired tokens after waiting',
            group,
            waitTimeMs: waitTime,
            tokensUsed: requiredTokens,
            tokensRemaining: currentTokens - requiredTokens,
          });
        }

        return waitTime;
      }

      // Not enough tokens, calculate wait time
      // Find the oldest token that will expire soonest
      const oldestToken = tokens[0];
      if (oldestToken) {
        const windowMs = windowSeconds * 1000;
        const tokenAge = now - oldestToken.timestamp;
        const waitMs = Math.max(100, windowMs - tokenAge + 100); // Add 100ms buffer

        logger.debug({
          msg: 'Waiting for tokens to become available',
          group,
          currentTokens,
          requiredTokens,
          waitMs,
          tokensInBucket: tokens.length,
        });

        await this.sleep(Math.min(waitMs, 5000)); // Max 5s wait per iteration
      } else {
        // No tokens in bucket means we're at full capacity - wait for window to reset
        logger.warn({
          msg: 'Token bucket is empty, waiting for window reset',
          group,
          currentTokens,
          requiredTokens,
          windowSeconds,
        });
        await this.sleep(Math.min(windowSeconds * 1000, 5000));
      }
    }
  }

  /**
   * Update rate limit state after receiving response
   * Adjusts token bucket based on actual response headers
   *
   * @param group - Rate limit group
   * @param limit - Token limit string (e.g., "150/15m")
   * @param remaining - Remaining tokens (from X-Ratelimit-Remaining header)
   * @param used - Tokens used by this request (from X-Ratelimit-Used header)
   * @param statusCode - HTTP status code
   */
  async updateRateLimitState(
    group: string,
    limit: string,
    remaining: number,
    used: number,
    statusCode: number
  ): Promise<void> {
    const redisKey = `esi:ratelimit:${group}`;
    const [limitCount, windowStr] = limit.split('/');
    const limitNum = parseInt(limitCount, 10);
    const windowSeconds = this.parseWindow(windowStr);
    const now = Date.now();

    // Get current state
    const bucketState = await this.redis.get(redisKey);
    let tokens: Array<{ timestamp: number; cost: number }> = [];

    if (bucketState) {
      const parsed = JSON.parse(bucketState);
      tokens = parsed.tokens || [];

      // Remove expired tokens
      const windowMs = windowSeconds * 1000;
      tokens = tokens.filter((t: any) => now - t.timestamp < windowMs);
    }

    // Sync with server's view of token usage
    // If server says we have fewer tokens remaining than we think, trust the server
    const ourView = tokens.reduce((sum: number, t: any) => sum + t.cost, 0);
    const serverView = limitNum - remaining;

    if (serverView > ourView) {
      // Server knows about more usage than we do - add phantom tokens
      const discrepancy = serverView - ourView;
      tokens.push({ timestamp: now, cost: discrepancy });

      logger.warn({
        msg: 'Rate limit state discrepancy detected',
        group,
        ourView,
        serverView,
        discrepancy,
      });
    }

    // Save updated state
    await this.redis.setex(
      redisKey,
      windowSeconds + 60,
      JSON.stringify({ tokens })
    );
  }

  /**
   * Track non-2xx/3xx responses for legacy error limit
   * ESI enforces max 100 errors per minute globally
   *
   * @param statusCode - HTTP status code
   * @returns Error count in current minute
   */
  async trackError(statusCode: number): Promise<number> {
    if (statusCode >= 200 && statusCode < 400) {
      return 0; // Not an error
    }

    const redisKey = 'esi:legacy:errors';
    const now = Date.now();

    // Get current errors
    const errorsData = await this.redis.get(redisKey);
    let errors: number[] = [];

    if (errorsData) {
      errors = JSON.parse(errorsData);
      // Remove errors older than 60 seconds
      errors = errors.filter((timestamp: number) => now - timestamp < 60000);
    }

    // Add this error
    errors.push(now);

    // Save updated errors
    await this.redis.setex(redisKey, 120, JSON.stringify(errors));

    const errorCount = errors.length;

    if (errorCount >= this.LEGACY_ERROR_LIMIT * 0.8) {
      logger.warn({
        msg: 'Approaching legacy error limit',
        errorCount,
        limit: this.LEGACY_ERROR_LIMIT,
        statusCode,
      });
    }

    if (errorCount >= this.LEGACY_ERROR_LIMIT) {
      logger.error({
        msg: 'Legacy error limit exceeded',
        errorCount,
        limit: this.LEGACY_ERROR_LIMIT,
      });

      // Wait for errors to expire
      const oldestError = errors[0];
      const waitMs = 60000 - (now - oldestError) + 1000; // Wait for oldest + 1s buffer

      logger.info({
        msg: 'Waiting for error limit window to reset',
        waitMs,
      });

      await this.sleep(waitMs);
    }

    return errorCount;
  }

  /**
   * Parse window string to seconds
   * Examples: "15m" -> 900, "1h" -> 3600
   */
  private parseWindow(windowStr: string | undefined): number {
    if (!windowStr || typeof windowStr !== 'string') {
      logger.warn(`Invalid window format: ${windowStr}, defaulting to 900s`);
      return 900; // Default 15 minutes
    }

    const match = windowStr.match(/^(\d+)([smh])$/);
    if (!match) {
      logger.warn(`Unknown window format: ${windowStr}, defaulting to 900s`);
      return 900; // Default 15 minutes
    }

    const [, value, unit] = match;
    const num = parseInt(value, 10);

    switch (unit) {
      case 's':
        return num;
      case 'm':
        return num * 60;
      case 'h':
        return num * 3600;
      default:
        return 900;
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Reset rate limit state (for testing or manual intervention)
   */
  async resetRateLimits(group?: string): Promise<void> {
    if (group) {
      await this.redis.del(`esi:ratelimit:${group}`);
      logger.info({ msg: 'Reset rate limit state', group });
    } else {
      const keys = await this.redis.keys('esi:ratelimit:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      await this.redis.del('esi:legacy:errors');
      logger.info({ msg: 'Reset all rate limit states', keyCount: keys.length });
    }
  }
}

// Singleton instance
let rateLimiter: ESIRateLimiter | null = null;

export function getRateLimiter(): ESIRateLimiter {
  if (!rateLimiter) {
    rateLimiter = new ESIRateLimiter();
  }
  return rateLimiter;
}
