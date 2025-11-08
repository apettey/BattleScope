import type { Redis } from 'ioredis';
import { trace } from '@opentelemetry/api';
import { ROLE_RANKS, AUTH_ACTIONS, type AuthzRequest, type AuthzResponse } from '../schemas/index.js';

const tracer = trace.getTracer('@battlescope/auth');

export interface AuthorizationServiceConfig {
  cacheTtl: number; // seconds, default 60
}

export interface RoleCache {
  featureKey: string;
  rank: number;
}

/**
 * Authorization service implementing feature-scoped RBAC
 *
 * Provides policy decisions for actions based on account roles and feature context.
 * Results are cached in Redis for performance.
 */
export class AuthorizationService {
  private readonly cacheTtl: number;
  private readonly cacheKeyPrefix = 'battlescope:authz:';

  constructor(
    private readonly redis: Redis | undefined,
    config: AuthorizationServiceConfig,
  ) {
    this.cacheTtl = config.cacheTtl;
  }

  /**
   * Authorize an action for a subject
   *
   * @param request - Authorization request
   * @param roles - Account's feature roles (Map<featureKey, rank>)
   * @returns Authorization decision
   */
  async authorize(request: AuthzRequest, roles: Map<string, number>): Promise<AuthzResponse> {
    return tracer.startActiveSpan('authorization.check', async (span) => {
      try {
        // SuperAdmin bypasses all checks
        if (request.subject.superAdmin) {
          span.setAttribute('result', 'allow');
          span.setAttribute('reason', 'superadmin');
          return {
            allow: true,
            reason: 'superadmin',
            cacheTtlSeconds: this.cacheTtl,
          };
        }

        const { action, resource } = request;
        const featureKey = resource.featureKey;

        span.setAttribute('action', action);
        span.setAttribute('feature.key', featureKey ?? 'none');

        // Check cache first
        const cached = await this.getCachedDecision(request.subject.accountId, action, featureKey);
        if (cached !== null) {
          span.setAttribute('cache', 'hit');
          return cached;
        }

        span.setAttribute('cache', 'miss');

        // Make authorization decision
        const decision = this.makeDecision(action, featureKey, roles);

        // Cache the decision
        await this.cacheDecision(request.subject.accountId, action, featureKey, decision);

        span.setAttribute('result', decision.allow ? 'allow' : 'deny');
        span.setAttribute('reason', decision.reason);

        return decision;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Make authorization decision based on action and roles
   */
  private makeDecision(
    action: string,
    featureKey: string | undefined,
    roles: Map<string, number>,
  ): AuthzResponse {
    // Global actions (not feature-scoped)
    if (action === AUTH_ACTIONS.userManage || action === AUTH_ACTIONS.userBlock) {
      // Requires admin role in ANY feature
      const maxRank = Math.max(...roles.values(), 0);
      if (maxRank >= ROLE_RANKS.admin) {
        return { allow: true, reason: 'role.admin', cacheTtlSeconds: this.cacheTtl };
      }
      return { allow: false, reason: 'insufficient_permissions', cacheTtlSeconds: this.cacheTtl };
    }

    if (action === AUTH_ACTIONS.authConfigUpdate) {
      // Only SuperAdmin can update auth config
      return { allow: false, reason: 'superadmin_only', cacheTtlSeconds: this.cacheTtl };
    }

    // Feature-scoped actions require featureKey
    if (!featureKey) {
      return { allow: false, reason: 'missing_feature_key', cacheTtlSeconds: this.cacheTtl };
    }

    const rank = roles.get(featureKey) ?? 0;

    // Feature-scoped actions
    switch (action) {
      case AUTH_ACTIONS.featureView:
        return rank >= ROLE_RANKS.user
          ? { allow: true, reason: 'role.user', cacheTtlSeconds: this.cacheTtl }
          : { allow: false, reason: 'insufficient_permissions', cacheTtlSeconds: this.cacheTtl };

      case AUTH_ACTIONS.featureCreate:
        return rank >= ROLE_RANKS.fc
          ? { allow: true, reason: 'role.fc', cacheTtlSeconds: this.cacheTtl }
          : { allow: false, reason: 'insufficient_permissions', cacheTtlSeconds: this.cacheTtl };

      case AUTH_ACTIONS.featureEditAny:
        return rank >= ROLE_RANKS.director
          ? { allow: true, reason: 'role.director', cacheTtlSeconds: this.cacheTtl }
          : { allow: false, reason: 'insufficient_permissions', cacheTtlSeconds: this.cacheTtl };

      case AUTH_ACTIONS.featureSettingsRead:
      case AUTH_ACTIONS.featureSettingsUpdate:
        return rank >= ROLE_RANKS.director
          ? { allow: true, reason: 'role.director', cacheTtlSeconds: this.cacheTtl }
          : { allow: false, reason: 'insufficient_permissions', cacheTtlSeconds: this.cacheTtl };

      case AUTH_ACTIONS.featureRolesManage:
        return rank >= ROLE_RANKS.admin
          ? { allow: true, reason: 'role.admin', cacheTtlSeconds: this.cacheTtl }
          : { allow: false, reason: 'insufficient_permissions', cacheTtlSeconds: this.cacheTtl };

      default:
        return { allow: false, reason: 'unknown_action', cacheTtlSeconds: this.cacheTtl };
    }
  }

  /**
   * Get cached authorization decision
   */
  private async getCachedDecision(
    accountId: string,
    action: string,
    featureKey: string | undefined,
  ): Promise<AuthzResponse | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const key = this.getCacheKey(accountId, action, featureKey);
      const cached = await this.redis.get(key);

      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as AuthzResponse;
    } catch {
      return null;
    }
  }

  /**
   * Cache authorization decision
   */
  private async cacheDecision(
    accountId: string,
    action: string,
    featureKey: string | undefined,
    decision: AuthzResponse,
  ): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      const key = this.getCacheKey(accountId, action, featureKey);
      await this.redis.setex(key, this.cacheTtl, JSON.stringify(decision));
    } catch {
      // Ignore cache errors
    }
  }

  /**
   * Invalidate all cached decisions for an account
   */
  async invalidateCache(accountId: string): Promise<void> {
    return tracer.startActiveSpan('authorization.invalidate-cache', async (span) => {
      try {
        if (!this.redis) {
          return;
        }

        const pattern = `${this.cacheKeyPrefix}${accountId}:*`;
        let cursor = '0';
        const keysToDelete: string[] = [];

        do {
          const [newCursor, keys] = await this.redis.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100,
          );
          cursor = newCursor;
          keysToDelete.push(...keys);
        } while (cursor !== '0');

        if (keysToDelete.length > 0) {
          await this.redis.del(...keysToDelete);
        }

        span.setAttribute('account.id', accountId);
        span.setAttribute('keys.deleted', keysToDelete.length);
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get cache key for authorization decision
   */
  private getCacheKey(accountId: string, action: string, featureKey: string | undefined): string {
    return `${this.cacheKeyPrefix}${accountId}:${action}:${featureKey ?? 'global'}`;
  }
}

/**
 * Create an authorization service instance
 */
export function createAuthorizationService(
  redis: Redis | undefined,
  config: AuthorizationServiceConfig,
): AuthorizationService {
  return new AuthorizationService(redis, config);
}
