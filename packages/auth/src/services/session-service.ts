import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { trace } from '@opentelemetry/api';
import { SessionSchema, type Session } from '../schemas/index.js';

const tracer = trace.getTracer('@battlescope/auth');

export interface SessionServiceConfig {
  sessionTtl: number; // seconds, default 8 hours (configurable via SESSION_TTL_SECONDS)
  cookieName: string;
}

export interface CreateSessionOptions {
  accountId: string;
  isSuperAdmin: boolean;
  roles: Map<string, number>; // featureKey -> rank
}

/**
 * Session management service using Redis
 *
 * Sessions are stored in Redis with TTL and cached for fast access.
 * Session tokens are random 32-byte values encoded as base64url.
 */
export class SessionService {
  private readonly sessionTtl: number;
  private readonly cookieName: string;
  private readonly keyPrefix = 'battlescope:session:';
  private readonly accountSessionPrefix = 'battlescope:account-session:';

  constructor(
    private readonly redis: Redis | undefined,
    config: SessionServiceConfig,
  ) {
    this.sessionTtl = config.sessionTtl;
    this.cookieName = config.cookieName;
  }

  /**
   * Create a new session
   *
   * NOTE: This enforces single-session-per-user. Any existing session for this account
   * will be invalidated when a new session is created.
   *
   * @param options - Session creation options
   * @returns Session token
   */
  async createSession(options: CreateSessionOptions): Promise<string> {
    return tracer.startActiveSpan('session.create', async (span) => {
      try {
        // Check for existing session and invalidate it (single-session-per-user)
        if (this.redis) {
          const existingToken = await this.redis.get(this.getAccountSessionKey(options.accountId));
          if (existingToken) {
            await this.redis.del(this.getRedisKey(existingToken));
            span.setAttribute('previous.session.invalidated', true);
          }
        }

        const token = this.generateToken();
        const expiresAt = Date.now() + this.sessionTtl * 1000;

        const session: Session = {
          accountId: options.accountId,
          isSuperAdmin: options.isSuperAdmin,
          roles: Object.fromEntries(options.roles),
          expiresAt,
        };

        // Store in Redis if available
        if (this.redis) {
          // Store session data
          await this.redis.setex(this.getRedisKey(token), this.sessionTtl, JSON.stringify(session));
          // Track current session token for this account
          await this.redis.setex(
            this.getAccountSessionKey(options.accountId),
            this.sessionTtl,
            token,
          );
        }

        span.setAttribute('account.id', options.accountId);
        span.setAttribute('session.ttl', this.sessionTtl);

        return token;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Validate a session token
   *
   * @param token - Session token
   * @returns Session data or null if invalid/expired
   */
  async validateSession(token: string): Promise<Session | null> {
    return tracer.startActiveSpan('session.validate', async (span) => {
      try {
        if (!this.redis) {
          span.setAttribute('error', 'redis_unavailable');
          return null;
        }

        const data = await this.redis.get(this.getRedisKey(token));
        if (!data) {
          span.setAttribute('result', 'not_found');
          return null;
        }

        const session = SessionSchema.parse(JSON.parse(data));

        // Check expiry
        if (session.expiresAt < Date.now()) {
          span.setAttribute('result', 'expired');
          await this.destroySession(token);
          return null;
        }

        span.setAttribute('account.id', session.accountId);
        span.setAttribute('result', 'valid');

        return session;
      } catch (error) {
        span.recordException(error as Error);
        return null;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Destroy a session
   *
   * @param token - Session token to destroy
   */
  async destroySession(token: string): Promise<void> {
    return tracer.startActiveSpan('session.destroy', async (span) => {
      try {
        if (this.redis) {
          // Get session to find accountId
          const data = await this.redis.get(this.getRedisKey(token));
          if (data) {
            try {
              const session = SessionSchema.parse(JSON.parse(data));
              // Remove account-session mapping if this is the current session
              const currentToken = await this.redis.get(
                this.getAccountSessionKey(session.accountId),
              );
              if (currentToken === token) {
                await this.redis.del(this.getAccountSessionKey(session.accountId));
              }
            } catch {
              // Invalid session data, continue with deletion anyway
            }
          }
          // Delete session data
          await this.redis.del(this.getRedisKey(token));
        }
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Destroy all sessions for an account
   *
   * @param accountId - Account ID
   */
  async destroyAllSessionsForAccount(accountId: string): Promise<void> {
    return tracer.startActiveSpan('session.destroy-all', async (span) => {
      try {
        if (!this.redis) {
          return;
        }

        // Scan for all sessions for this account
        const pattern = `${this.keyPrefix}*`;
        let cursor = '0';
        const keysToDelete: string[] = [];

        do {
          const [newCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
          cursor = newCursor;

          // Check each session
          for (const key of keys) {
            const data = await this.redis.get(key);
            if (data) {
              try {
                const session = SessionSchema.parse(JSON.parse(data));
                if (session.accountId === accountId) {
                  keysToDelete.push(key);
                }
              } catch {
                // Invalid session data, skip
              }
            }
          }
        } while (cursor !== '0');

        // Delete all matching sessions
        if (keysToDelete.length > 0) {
          await this.redis.del(...keysToDelete);
        }

        span.setAttribute('account.id', accountId);
        span.setAttribute('sessions.deleted', keysToDelete.length);
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Refresh session TTL
   *
   * @param token - Session token
   */
  async refreshSession(token: string): Promise<void> {
    return tracer.startActiveSpan('session.refresh', async (span) => {
      try {
        if (this.redis) {
          await this.redis.expire(this.getRedisKey(token), this.sessionTtl);
        }
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Generate a random session token
   */
  private generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Get Redis key for session
   */
  private getRedisKey(token: string): string {
    return `${this.keyPrefix}${token}`;
  }

  /**
   * Get Redis key for account's current session
   */
  private getAccountSessionKey(accountId: string): string {
    return `${this.accountSessionPrefix}${accountId}`;
  }

  /**
   * Get cookie name
   */
  getCookieName(): string {
    return this.cookieName;
  }
}

/**
 * Create a session service instance
 */
export function createSessionService(
  redis: Redis | undefined,
  config: SessionServiceConfig,
): SessionService {
  return new SessionService(redis, config);
}
