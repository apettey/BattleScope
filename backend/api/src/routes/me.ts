import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createAuthMiddleware, MeResponseSchema } from '@battlescope/auth';
import type {
  AccountRepository,
  CharacterRepository,
  FeatureRepository,
} from '@battlescope/database';
import type { SessionService } from '@battlescope/auth';

/**
 * Register /me routes for current user profile
 */
export function registerMeRoutes(
  app: FastifyInstance,
  sessionService: SessionService,
  accountRepository: AccountRepository,
  characterRepository: CharacterRepository,
  featureRepository: FeatureRepository,
): void {
  const appWithTypes = app.withTypeProvider<ZodTypeProvider>();
  const authMiddleware = createAuthMiddleware(sessionService);

  // Get current user profile
  appWithTypes.get(
    '/me',
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ['Me'],
        description: 'Get current account profile with characters and roles',
        response: {
          200: MeResponseSchema,
          401: z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const account = await accountRepository.getById(request.account.id);
      if (!account) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Account not found',
        });
      }

      const characters = await characterRepository.getByAccountId(account.id);
      const featureRoles = await featureRepository.getAccountFeatureRoles(account.id);

      const primaryCharacter = account.primaryCharacterId
        ? (characters.find((c) => c.id === account.primaryCharacterId) ?? null)
        : null;

      // Determine token status for each character
      const charactersWithStatus = characters.map((char) => {
        let tokenStatus: 'valid' | 'expiring' | 'invalid' = 'valid';
        if (!char.esiTokenExpiresAt) {
          tokenStatus = 'invalid';
        } else {
          const expiresIn = char.esiTokenExpiresAt.getTime() - Date.now();
          if (expiresIn <= 0) {
            tokenStatus = 'invalid';
          } else if (expiresIn < 5 * 60 * 1000) {
            // Less than 5 minutes
            tokenStatus = 'expiring';
          }
        }

        return {
          id: char.id,
          accountId: char.accountId,
          eveCharacterId: char.eveCharacterId.toString(),
          eveCharacterName: char.eveCharacterName,
          corpId: char.corpId.toString(),
          corpName: char.corpName,
          allianceId: char.allianceId?.toString() ?? null,
          allianceName: char.allianceName,
          portraitUrl: char.portraitUrl ?? '',
          scopes: char.scopes,
          tokenStatus,
          lastVerifiedAt: char.lastVerifiedAt?.toISOString() ?? new Date().toISOString(),
          createdAt: char.createdAt.toISOString(),
        };
      });

      const primaryWithStatus = primaryCharacter
        ? (charactersWithStatus.find((c) => c.id === primaryCharacter.id) ?? null)
        : null;

      return reply.send({
        accountId: account.id,
        displayName: account.displayName,
        email: account.email,
        isSuperAdmin: account.isSuperAdmin,
        primaryCharacter: primaryWithStatus,
        characters: charactersWithStatus,
        featureRoles: featureRoles.map((r) => ({
          featureKey: r.featureKey,
          roleKey: r.roleKey as 'user' | 'fc' | 'director' | 'admin',
          roleRank: r.roleRank,
        })),
      });
    },
  );
}
