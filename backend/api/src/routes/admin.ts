import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createAuthMiddleware,
  createRequireRoleMiddleware,
  createRequireSuperAdminMiddleware,
  AccountListQuerySchema,
} from '@battlescope/auth';
import type {
  AccountRepository,
  CharacterRepository,
  FeatureRepository,
  AuditLogRepository,
} from '@battlescope/database';
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
  characterRepository: CharacterRepository,
  featureRepository: FeatureRepository,
  auditLogRepository: AuditLogRepository,
): void {
  const appWithTypes = app.withTypeProvider<ZodTypeProvider>();
  const authMiddleware = createAuthMiddleware(sessionService);
  const requireAdmin = createRequireRoleMiddleware('admin');
  const requireSuperAdmin = createRequireSuperAdminMiddleware();

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

  // Get account details with characters grouped by corp/alliance (View User Page)
  appWithTypes.get(
    '/admin/accounts/:id',
    {
      preHandler: [authMiddleware, requireAdmin],
      schema: {
        tags: ['Admin'],
        description:
          'Get detailed account view with all characters grouped by corporation and alliance',
        params: AccountIdParamSchema,
        response: {
          200: z.object({
            account: z.object({
              id: z.string().uuid(),
              displayName: z.string(),
              email: z.string().email().nullable(),
              isBlocked: z.boolean(),
              isSuperAdmin: z.boolean(),
              lastLoginAt: z.string().datetime().nullable(),
              createdAt: z.string().datetime(),
            }),
            primaryCharacter: z
              .object({
                id: z.string().uuid(),
                eveCharacterId: z.string(),
                eveCharacterName: z.string(),
                portraitUrl: z.string(),
                corpId: z.string(),
                corpName: z.string(),
                allianceId: z.string().nullable(),
                allianceName: z.string().nullable(),
                isPrimary: z.boolean(),
                tokenStatus: z.enum(['valid', 'expiring', 'expired']),
              })
              .nullable(),
            charactersGrouped: z.array(
              z.object({
                allianceId: z.string().nullable(),
                allianceName: z.string().nullable(),
                corporations: z.array(
                  z.object({
                    corpId: z.string(),
                    corpName: z.string(),
                    characters: z.array(
                      z.object({
                        id: z.string().uuid(),
                        eveCharacterId: z.string(),
                        eveCharacterName: z.string(),
                        portraitUrl: z.string(),
                        corpId: z.string(),
                        corpName: z.string(),
                        allianceId: z.string().nullable(),
                        allianceName: z.string().nullable(),
                        isPrimary: z.boolean(),
                        scopes: z.array(z.string()),
                        tokenExpiresAt: z.string().datetime(),
                        tokenStatus: z.enum(['valid', 'expiring', 'expired']),
                        lastVerifiedAt: z.string().datetime(),
                        createdAt: z.string().datetime(),
                      }),
                    ),
                  }),
                ),
              }),
            ),
            featureRoles: z.array(
              z.object({
                featureKey: z.string(),
                featureName: z.string(),
                roleKey: z.string(),
                roleName: z.string(),
                roleRank: z.number(),
              }),
            ),
            stats: z.object({
              totalCharacters: z.number(),
            }),
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
      const accountDetail = await accountRepository.getDetailWithCharactersGrouped(
        request.params.id,
      );
      if (!accountDetail) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Account not found',
        });
      }

      const featureRoles = await featureRepository.getAccountFeatureRoles(accountDetail.account.id);

      // Map response to camelCase for API
      return reply.send({
        account: {
          id: accountDetail.account.id,
          displayName: accountDetail.account.displayName,
          email: accountDetail.account.email,
          isBlocked: accountDetail.account.isBlocked,
          isSuperAdmin: accountDetail.account.isSuperAdmin,
          lastLoginAt: accountDetail.account.lastLoginAt?.toISOString() ?? null,
          createdAt: accountDetail.account.createdAt.toISOString(),
        },
        primaryCharacter: accountDetail.primaryCharacter
          ? {
              id: accountDetail.primaryCharacter.id,
              eveCharacterId: accountDetail.primaryCharacter.eveCharacterId,
              eveCharacterName: accountDetail.primaryCharacter.eveCharacterName,
              portraitUrl: accountDetail.primaryCharacter.portraitUrl,
              corpId: accountDetail.primaryCharacter.corpId,
              corpName: accountDetail.primaryCharacter.corpName,
              allianceId: accountDetail.primaryCharacter.allianceId,
              allianceName: accountDetail.primaryCharacter.allianceName,
              isPrimary: accountDetail.primaryCharacter.isPrimary,
              tokenStatus: accountDetail.primaryCharacter.tokenStatus,
            }
          : null,
        charactersGrouped: accountDetail.charactersGrouped.map((alliance) => ({
          allianceId: alliance.allianceId,
          allianceName: alliance.allianceName,
          corporations: alliance.corporations.map((corp) => ({
            corpId: corp.corpId,
            corpName: corp.corpName,
            characters: corp.characters.map((char) => ({
              id: char.id,
              eveCharacterId: char.eveCharacterId,
              eveCharacterName: char.eveCharacterName,
              portraitUrl: char.portraitUrl,
              corpId: char.corpId,
              corpName: char.corpName,
              allianceId: char.allianceId,
              allianceName: char.allianceName,
              isPrimary: char.isPrimary,
              scopes: char.scopes,
              tokenExpiresAt: char.tokenExpiresAt.toISOString(),
              tokenStatus: char.tokenStatus,
              lastVerifiedAt: char.lastVerifiedAt.toISOString(),
              createdAt: char.createdAt.toISOString(),
            })),
          })),
        })),
        featureRoles,
        stats: accountDetail.stats,
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

  // Promote to SuperAdmin (SuperAdmin only)
  appWithTypes.post(
    '/admin/accounts/:id/superadmin',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        tags: ['Admin'],
        description: 'Promote account to SuperAdmin (SuperAdmin only)',
        params: AccountIdParamSchema,
        response: {
          204: BlockAccountResponseSchema,
          404: z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      // Check if account exists
      const account = await accountRepository.getById(request.params.id);
      if (!account) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Account not found',
        });
      }

      // Check if already SuperAdmin
      if (account.isSuperAdmin) {
        return reply.status(204).send();
      }

      // Promote to SuperAdmin
      await accountRepository.promoteToSuperAdmin(request.params.id);

      // Invalidate session cache (forces re-auth with new privileges)
      await sessionService.destroyAllSessionsForAccount(request.params.id);

      // Audit log
      await auditLogRepository.create({
        actorAccountId: request.account.id,
        action: 'account.superadmin.promoted',
        targetType: 'account',
        targetId: request.params.id,
        metadata: {
          promotedBy: request.account.id,
        },
      });

      return reply.status(204).send();
    },
  );

  // Demote from SuperAdmin (SuperAdmin only)
  appWithTypes.delete(
    '/admin/accounts/:id/superadmin',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        tags: ['Admin'],
        description: 'Demote account from SuperAdmin (SuperAdmin only)',
        params: AccountIdParamSchema,
        response: {
          204: BlockAccountResponseSchema,
          400: z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string(),
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
      // Check if account exists
      const account = await accountRepository.getById(request.params.id);
      if (!account) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Account not found',
        });
      }

      // Cannot demote yourself
      if (request.params.id === request.account.id) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cannot demote yourself from SuperAdmin',
        });
      }

      // Check if this is the last SuperAdmin
      const superAdminCount = await accountRepository.countSuperAdmins();
      if (superAdminCount <= 1) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cannot demote the last SuperAdmin',
        });
      }

      // Check if not already SuperAdmin
      if (!account.isSuperAdmin) {
        return reply.status(204).send();
      }

      // Demote from SuperAdmin
      await accountRepository.demoteFromSuperAdmin(request.params.id);

      // Invalidate session cache (forces re-auth with reduced privileges)
      await sessionService.destroyAllSessionsForAccount(request.params.id);

      // Audit log
      await auditLogRepository.create({
        actorAccountId: request.account.id,
        action: 'account.superadmin.demoted',
        targetType: 'account',
        targetId: request.params.id,
        metadata: {
          demotedBy: request.account.id,
        },
      });

      return reply.status(204).send();
    },
  );

  // Delete account (soft delete, SuperAdmin only)
  appWithTypes.delete(
    '/admin/accounts/:id',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        tags: ['Admin'],
        description: 'Delete account (soft delete, SuperAdmin only)',
        params: AccountIdParamSchema,
        response: {
          204: BlockAccountResponseSchema,
          400: z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string(),
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
      // Check if account exists
      const account = await accountRepository.getById(request.params.id);
      if (!account) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Account not found',
        });
      }

      // Cannot delete yourself
      if (request.params.id === request.account.id) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cannot delete your own account',
        });
      }

      // Cannot delete SuperAdmin if it's the last one
      if (account.isSuperAdmin) {
        const superAdminCount = await accountRepository.countSuperAdmins();
        if (superAdminCount <= 1) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Cannot delete the last SuperAdmin',
          });
        }
      }

      // Soft delete the account
      await accountRepository.delete(request.params.id);

      // Invalidate all sessions
      await sessionService.destroyAllSessionsForAccount(request.params.id);

      // Audit log
      await auditLogRepository.create({
        actorAccountId: request.account.id,
        action: 'account.deleted',
        targetType: 'account',
        targetId: request.params.id,
        metadata: {
          deletedBy: request.account.id,
        },
      });

      return reply.status(204).send();
    },
  );

  // Set primary character for account (SuperAdmin only)
  appWithTypes.post(
    '/admin/accounts/:id/primary-character',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        tags: ['Admin'],
        description:
          'Set primary character for an account (SuperAdmin only - useful when user cannot log in)',
        params: AccountIdParamSchema,
        body: z.object({
          characterId: z.string().uuid(),
        }),
        response: {
          204: z.null(),
          400: z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string(),
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
      const { id: accountId } = request.params;
      const { characterId } = request.body;

      request.log.info(
        { accountId, characterId, adminId: request.account.id },
        'SuperAdmin changing primary character for account',
      );

      // Verify account exists
      const account = await accountRepository.getById(accountId);
      if (!account) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Account not found',
        });
      }

      // Verify character exists and belongs to account
      const character = await characterRepository.getById(characterId);
      if (!character) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Character not found',
        });
      }

      if (character.accountId !== accountId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Character does not belong to this account',
        });
      }

      // Set primary character
      await accountRepository.setPrimaryCharacter(accountId, characterId);

      // Audit log
      await auditLogRepository.create({
        actorAccountId: request.account.id,
        action: 'account.primary_character_changed_by_admin',
        targetType: 'account',
        targetId: accountId,
        metadata: {
          characterId,
          characterName: character.eveCharacterName,
          adminId: request.account.id,
        },
      });

      request.log.info(
        {
          accountId,
          characterId,
          characterName: character.eveCharacterName,
          adminId: request.account.id,
        },
        'Primary character changed by SuperAdmin',
      );

      return reply.status(204).send();
    },
  );
}
