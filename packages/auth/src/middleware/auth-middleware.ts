import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SessionService } from '../services/session-service.js';
import type { AuthorizationService } from '../services/authorization-service.js';
import { ROLE_RANKS, type AuthAction } from '../schemas/index.js';

// Import cookie types (installed by consumer of this package)
import '@fastify/cookie';

/**
 * Extended request with authenticated account
 */
export interface AuthenticatedRequest extends FastifyRequest {
  account: {
    id: string;
    isSuperAdmin: boolean;
    roles: Map<string, number>; // featureKey -> rank
  };
}

/**
 * Create auth middleware that validates session and attaches account to request
 *
 * @param sessionService - Session service instance
 * @returns Fastify preHandler hook
 */
export function createAuthMiddleware(sessionService: SessionService) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = request.cookies[sessionService.getCookieName()];

    if (!token) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const session = await sessionService.validateSession(token);

    if (!session) {
      void reply.clearCookie(sessionService.getCookieName());
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or expired session',
      });
    }

    // Attach account to request
    (request as AuthenticatedRequest).account = {
      id: session.accountId,
      isSuperAdmin: session.isSuperAdmin,
      roles: new Map(Object.entries(session.roles)),
    };
  };
}

/**
 * Create middleware that requires a minimum role across any feature
 *
 * @param minRole - Minimum role key required
 * @returns Fastify preHandler hook
 */
export function createRequireRoleMiddleware(minRole: string) {
  const minRank = ROLE_RANKS[minRole as keyof typeof ROLE_RANKS] ?? 999;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authReq = request as AuthenticatedRequest;

    if (!authReq.account) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // SuperAdmin bypasses all checks
    if (authReq.account.isSuperAdmin) {
      return;
    }

    // Check if user has required rank in ANY feature
    const hasRole = Array.from(authReq.account.roles.values()).some((rank) => rank >= minRank);

    if (!hasRole) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    }
  };
}

/**
 * Create middleware that requires a minimum role in a specific feature
 *
 * @param minRole - Minimum role key required
 * @param featureKey - Optional feature key (if not provided, extracted from params)
 * @returns Fastify preHandler hook
 */
export function createRequireFeatureRoleMiddleware(minRole: string, featureKey?: string) {
  const minRank = ROLE_RANKS[minRole as keyof typeof ROLE_RANKS] ?? 999;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authReq = request as AuthenticatedRequest;

    if (!authReq.account) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // SuperAdmin bypasses all checks
    if (authReq.account.isSuperAdmin) {
      return;
    }

    // Get feature key from parameter or route params
    const targetFeatureKey = featureKey ?? (request.params as { featureKey?: string }).featureKey;

    if (!targetFeatureKey) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Feature key required',
      });
    }

    const userRank = authReq.account.roles.get(targetFeatureKey) ?? 0;

    if (userRank < minRank) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Insufficient permissions for this feature',
      });
    }
  };
}

/**
 * Create middleware that requires a specific action authorization
 *
 * @param action - Required action
 * @param authorizationService - Authorization service instance
 * @param featureKey - Optional feature key (if not provided, extracted from params)
 * @returns Fastify preHandler hook
 */
export function createRequireActionMiddleware(
  action: AuthAction,
  authorizationService: AuthorizationService,
  featureKey?: string,
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authReq = request as AuthenticatedRequest;

    if (!authReq.account) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // Get feature key from parameter or route params
    const targetFeatureKey = featureKey ?? (request.params as { featureKey?: string }).featureKey;

    const result = await authorizationService.authorize(
      {
        subject: {
          accountId: authReq.account.id,
          superAdmin: authReq.account.isSuperAdmin,
        },
        action,
        resource: {
          featureKey: targetFeatureKey,
        },
      },
      authReq.account.roles,
    );

    if (!result.allow) {
      request.log.warn(
        {
          accountId: authReq.account.id,
          action,
          featureKey: targetFeatureKey,
          reason: result.reason,
        },
        'Authorization denied',
      );

      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Insufficient permissions',
        reason: result.reason,
      });
    }
  };
}
