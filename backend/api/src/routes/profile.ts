import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createAuthMiddleware } from '@battlescope/auth';
import type {
  AccountRepository,
  CharacterRepository,
  FeatureRepository,
  AuditLogRepository,
} from '@battlescope/database';
import type { SessionService } from '@battlescope/auth';

const SetPrimaryCharacterBodySchema = z.object({
  characterId: z.string().uuid(),
});

const CharacterIdParamSchema = z.object({
  characterId: z.string().uuid(),
});

/**
 * Register profile routes for user self-service
 */
export function registerProfileRoutes(
  app: FastifyInstance,
  sessionService: SessionService,
  accountRepository: AccountRepository,
  characterRepository: CharacterRepository,
  featureRepository: FeatureRepository,
  auditLogRepository: AuditLogRepository,
): void {
  const appWithTypes = app.withTypeProvider<ZodTypeProvider>();
  const authMiddleware = createAuthMiddleware(sessionService);

  // Get user profile
  appWithTypes.get(
    '/me/profile',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Profile'],
        description: 'Get current user profile with all characters and feature roles',
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
              uniqueAlliances: z.number(),
              uniqueCorporations: z.number(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      request.log.info({ accountId: request.account.id }, 'Fetching profile for user');

      const accountDetail = await accountRepository.getDetailWithCharactersGrouped(
        request.account.id,
      );

      if (!accountDetail) {
        request.log.error({ accountId: request.account.id }, 'Account not found for authenticated user');
        throw new Error('Account not found - this should never happen for authenticated users');
      }

      const featureRoles = await featureRepository.getAccountFeatureRoles(request.account.id);

      request.log.info(
        {
          accountId: request.account.id,
          characterCount: accountDetail.stats.totalCharacters,
          featureRoleCount: featureRoles.length,
        },
        'Profile fetched successfully',
      );

      // Calculate unique alliances and corps
      const uniqueAlliances = new Set<string>();
      const uniqueCorporations = new Set<string>();

      accountDetail.charactersGrouped.forEach((alliance) => {
        if (alliance.allianceId) {
          uniqueAlliances.add(alliance.allianceId);
        }
        alliance.corporations.forEach((corp) => {
          uniqueCorporations.add(corp.corpId);
        });
      });

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
        stats: {
          totalCharacters: accountDetail.stats.totalCharacters,
          uniqueAlliances: uniqueAlliances.size,
          uniqueCorporations: uniqueCorporations.size,
        },
      });
    },
  );

  // Set primary character
  appWithTypes.post(
    '/me/profile/primary-character',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Profile'],
        description: 'Change the primary character for the current user',
        body: SetPrimaryCharacterBodySchema,
        response: {
          204: z.null(),
          400: z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { characterId } = request.body;

      request.log.info(
        { accountId: request.account.id, characterId },
        'Setting primary character',
      );

      // Verify character belongs to user
      const character = await characterRepository.getById(characterId);
      if (!character || character.accountId !== request.account.id) {
        request.log.warn(
          { accountId: request.account.id, characterId },
          'Attempted to set primary character that does not belong to account',
        );
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Character not found or does not belong to this account',
        });
      }

      // Update primary character
      await accountRepository.setPrimaryCharacter(request.account.id, characterId);

      // Audit log
      await auditLogRepository.create({
        actorAccountId: request.account.id,
        action: 'account.primary_character_changed',
        targetType: 'character',
        targetId: characterId,
        metadata: {
          characterName: character.eveCharacterName,
        },
      });

      request.log.info(
        { accountId: request.account.id, characterId, characterName: character.eveCharacterName },
        'Primary character changed successfully',
      );

      return reply.status(204).send();
    },
  );

  // Remove character
  appWithTypes.delete(
    '/me/profile/characters/:characterId',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Profile'],
        description: 'Remove a character from the current user account',
        params: CharacterIdParamSchema,
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
      const { characterId } = request.params;

      request.log.info(
        { accountId: request.account.id, characterId },
        'Attempting to remove character',
      );

      // Verify character belongs to user
      const character = await characterRepository.getById(characterId);
      if (!character) {
        request.log.warn({ accountId: request.account.id, characterId }, 'Character not found');
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Character not found',
        });
      }

      if (character.accountId !== request.account.id) {
        request.log.warn(
          { accountId: request.account.id, characterId },
          'Attempted to remove character from another account',
        );
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Character does not belong to this account',
        });
      }

      // Check if this is the only character
      const allCharacters = await characterRepository.getByAccountId(request.account.id);
      if (allCharacters.length <= 1) {
        request.log.warn(
          { accountId: request.account.id, characterId },
          'Attempted to remove only character',
        );
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cannot remove your only character',
        });
      }

      // Get account to check if this is primary
      const account = await accountRepository.getById(request.account.id);
      const isPrimary = account?.primaryCharacterId === characterId;

      // Delete the character
      await characterRepository.delete(characterId);

      let newPrimaryCharacterId: string | undefined;

      // If was primary, set oldest remaining character as new primary
      if (isPrimary) {
        const remainingCharacters = await characterRepository.getByAccountId(request.account.id);
        if (remainingCharacters.length > 0) {
          // Sort by createdAt and pick oldest
          const oldestCharacter = remainingCharacters.sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          )[0];
          await accountRepository.setPrimaryCharacter(request.account.id, oldestCharacter.id);
          newPrimaryCharacterId = oldestCharacter.id;
        }
      }

      // Audit log
      await auditLogRepository.create({
        actorAccountId: request.account.id,
        action: 'character.removed',
        targetType: 'character',
        targetId: characterId,
        metadata: {
          characterName: character.eveCharacterName,
          wasPrimary: isPrimary,
          newPrimaryCharacterId,
        },
      });

      request.log.info(
        {
          accountId: request.account.id,
          characterId,
          characterName: character.eveCharacterName,
          wasPrimary: isPrimary,
          newPrimaryCharacterId,
        },
        'Character removed successfully',
      );

      return reply.status(204).send();
    },
  );

  // Refresh character token (redirects to EVE SSO)
  appWithTypes.get(
    '/me/profile/characters/:characterId/refresh',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Profile'],
        description: 'Initiate EVE SSO flow to refresh character ESI token',
        params: CharacterIdParamSchema,
      },
    },
    async (request, reply) => {
      const { characterId } = request.params;

      // Verify character belongs to user
      const character = await characterRepository.getById(characterId);
      if (!character || character.accountId !== request.account.id) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Character not found',
        });
      }

      // Redirect to EVE SSO with refresh_character parameter
      const redirectUrl = `/auth/login?refresh_character=${characterId}`;
      return reply.redirect(302, redirectUrl);
    },
  );
}
