import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createAuthMiddleware,
  createRequireRoleMiddleware,
  AccountListQuerySchema,
} from '@battlescope/auth';
import type { AccountRepository, FeatureRepository, AuditLogRepository } from '@battlescope/database';
import type { SessionService, AuthorizationService } from '@battlescope/auth';

const AccountIdParamSchema = z.object({
  id: z.string().uuid(),
});

const BlockAccountResponseSchema = z.null();

const AssignRolesBodySchema = z.object({
  roles: z.array(
    z.object({
      featureKey: z.string(),
      roleKey: z.enum(['user', 'fc', 'director', 'admin']),
    }),
  ),
});

/**
 * Register admin routes for user management
 */
export function registerAdminRoutes(
  app: FastifyInstance,
  sessionService: SessionService,
  authorizationService: AuthorizationService,
  accountRepository: AccountRepository,
  featureRepository: FeatureRepository,
  auditLogRepository: AuditLogRepository,
): void {
  const appWithTypes = app.withTypeProvider<ZodTypeProvider>();
  const authMiddleware = createAuthMiddleware(sessionService);
  const requireAdmin = createRequireRoleMiddleware('admin');

  // List accounts
  appWithTypes.get(
    '/admin/accounts',
    {
      preHandler: [authMiddleware, requireAdmin],
      schema: {
        tags: ['Admin'],
        description: 'List/search accounts (Admin only)',
        querystring: AccountListQuerySchema,
        response: {
          200: z.object({
            accounts: z.array(
              z.object({
                id: z.string().uuid(),
                displayName: z.string(),
                email: z.string().email().nullable(),
                isBlocked: z.boolean(),
                isSuperAdmin: z.boolean(),
                lastLoginAt: z.string().datetime().nullable(),
              }),
            ),
            total: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { query, limit, offset } = request.query;

      const result = await accountRepository.list({
        query,
        limit,
        offset,
      });

      return reply.send({
        accounts: result.accounts.map((acc) => ({
          id: acc.id,
          displayName: acc.displayName,
          email: acc.email,
          isBlocked: acc.isBlocked,
          isSuperAdmin: acc.isSuperAdmin,
          lastLoginAt: acc.lastLoginAt?.toISOString() ?? null,
        })),
        total: result.total,
      });
    },
  );

  // Get account details
  appWithTypes.get(
    '/admin/accounts/:id',
    {
      preHandler: [authMiddleware, requireAdmin],
      schema: {
        tags: ['Admin'],
        description: 'Get account details (Admin only)',
        params: AccountIdParamSchema,
        response: {
          200: z.object({
            id: z.string().uuid(),
            displayName: z.string(),
            email: z.string().email().nullable(),
            isBlocked: z.boolean(),
            isSuperAdmin: z.boolean(),
            lastLoginAt: z.string().datetime().nullable(),
            featureRoles: z.array(
              z.object({
                featureKey: z.string(),
                featureName: z.string(),
                roleKey: z.string(),
                roleName: z.string(),
                roleRank: z.number(),
              }),
            ),
          }),
          404: z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const account = await accountRepository.getById(request.params.id);
      if (!account) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Account not found',
        });
      }

      const featureRoles = await featureRepository.getAccountFeatureRoles(account.id);

      return reply.send({
        id: account.id,
        displayName: account.displayName,
        email: account.email,
        isBlocked: account.isBlocked,
        isSuperAdmin: account.isSuperAdmin,
        lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
        featureRoles,
      });
    },
  );

  // Block account
  appWithTypes.post(
    '/admin/accounts/:id/block',
    {
      preHandler: [authMiddleware, requireAdmin],
      schema: {
        tags: ['Admin'],
        description: 'Block an account (Admin only)',
        params: AccountIdParamSchema,
        response: {
          204: BlockAccountResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await accountRepository.block(request.params.id);

      // Invalidate all sessions for the account
      await sessionService.destroyAllSessionsForAccount(request.params.id);

      // Audit log
      await auditLogRepository.create({
        actorAccountId: request.account.id,
        action: 'account.blocked',
        targetType: 'account',
        targetId: request.params.id,
      });

      return reply.status(204).send();
    },
  );

  // Unblock account
  appWithTypes.post(
    '/admin/accounts/:id/unblock',
    {
      preHandler: [authMiddleware, requireAdmin],
      schema: {
        tags: ['Admin'],
        description: 'Unblock an account (Admin only)',
        params: AccountIdParamSchema,
        response: {
          204: BlockAccountResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await accountRepository.unblock(request.params.id);

      // Audit log
      await auditLogRepository.create({
        actorAccountId: request.account.id,
        action: 'account.unblocked',
        targetType: 'account',
        targetId: request.params.id,
      });

      return reply.status(204).send();
    },
  );

  // Assign feature roles
  appWithTypes.put(
    '/admin/accounts/:id/roles',
    {
      preHandler: [authMiddleware, requireAdmin],
      schema: {
        tags: ['Admin'],
        description: 'Assign feature roles to account (Admin only)',
        params: AccountIdParamSchema,
        body: AssignRolesBodySchema,
        response: {
          204: BlockAccountResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { roles } = request.body;

      // Bulk assign roles
      await featureRepository.bulkAssignRoles(request.params.id, roles, request.account.id);

      // Invalidate authorization cache for the account
      await authorizationService.invalidateCache(request.params.id);

      // Audit log
      await auditLogRepository.create({
        actorAccountId: request.account.id,
        action: 'roles.updated',
        targetType: 'account',
        targetId: request.params.id,
        metadata: { roles },
      });

      return reply.status(204).send();
    },
  );
}
