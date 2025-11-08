import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { EVESSOService } from '@battlescope/auth';
import type { SessionService } from '@battlescope/auth';
import type {
  AccountRepository,
  CharacterRepository,
  AuthConfigRepository,
  AuditLogRepository,
} from '@battlescope/database';
import type { EsiClient } from '@battlescope/esi-client';
import type { EncryptionService } from '@battlescope/auth';

const AuthLoginQuerySchema = z.object({
  redirectUri: z.string().url().optional(),
});

const AuthCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
});

/**
 * Register auth routes for EVE SSO login/logout
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  eveSSOService: EVESSOService,
  sessionService: SessionService,
  accountRepository: AccountRepository,
  characterRepository: CharacterRepository,
  authConfigRepository: AuthConfigRepository,
  auditLogRepository: AuditLogRepository,
  esiClient: EsiClient,
  encryptionService: EncryptionService,
  frontendUrl: string,
): void {
  const appWithTypes = app.withTypeProvider<ZodTypeProvider>();

  // EVE SSO login initiation
  appWithTypes.get(
    '/auth/login',
    {
      schema: {
        tags: ['Auth'],
        description: 'Initiate EVE Online SSO login flow',
        querystring: AuthLoginQuerySchema,
        response: {
          302: z.object({ location: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { redirectUri } = request.query;

      const { url } = eveSSOService.generateAuthorizationUrl(redirectUri ?? frontendUrl);

      return reply.redirect(302, url);
    },
  );

  // OAuth callback
  appWithTypes.get(
    '/auth/callback',
    {
      schema: {
        tags: ['Auth'],
        description: 'OAuth2 callback from EVE SSO',
        querystring: AuthCallbackQuerySchema,
      },
    },
    async (request, reply) => {
      const { code, state } = request.query;

      try {
        // Exchange code for tokens and verify character
        const result = await eveSSOService.exchangeCodeForToken(code, state);
        const { character, accessToken, refreshToken, expiresIn } = result;

        // Get character info from ESI
        const characterInfo = await esiClient.getCharacterInfo(character.CharacterID);
        const corpInfo = await esiClient.getCorporationInfo(characterInfo.corporation_id);
        const allianceInfo = characterInfo.alliance_id
          ? await esiClient.getAllianceInfo(characterInfo.alliance_id)
          : null;

        // Check org gating
        const isAllowed = await authConfigRepository.isCharacterAllowed(
          BigInt(characterInfo.corporation_id),
          characterInfo.alliance_id ? BigInt(characterInfo.alliance_id) : null,
        );

        if (!isAllowed) {
          request.log.warn(
            {
              characterId: character.CharacterID,
              corpId: characterInfo.corporation_id,
              allianceId: characterInfo.alliance_id,
            },
            'Character not allowed due to org gating',
          );
          return reply.redirect(302, `${frontendUrl}?error=org_not_allowed`);
        }

        // Check if character already exists
        const existingCharacter = await characterRepository.getByEveCharacterId(
          BigInt(character.CharacterID),
        );

        let accountId: string;
        let characterId: string;

        if (existingCharacter) {
          // Character exists - use existing account
          accountId = existingCharacter.accountId;
          characterId = existingCharacter.id;

          // Update character info and tokens
          const expiresAt = new Date(Date.now() + expiresIn * 1000);
          await characterRepository.update(characterId, {
            corpId: BigInt(characterInfo.corporation_id),
            corpName: corpInfo.name,
            allianceId: characterInfo.alliance_id ? BigInt(characterInfo.alliance_id) : null,
            allianceName: allianceInfo?.name ?? null,
            portraitUrl: esiClient.getCharacterPortraitUrl(character.CharacterID, 128),
            esiAccessToken: encryptionService.encryptToBuffer(accessToken),
            esiRefreshToken: refreshToken ? encryptionService.encryptToBuffer(refreshToken) : null,
            esiTokenExpiresAt: expiresAt,
            scopes: character.Scopes.split(' '),
            lastVerifiedAt: new Date(),
          });
        } else {
          // New character - create account and character
          const account = await accountRepository.create({
            displayName: character.CharacterName,
          });
          accountId = account.id;

          const expiresAt = new Date(Date.now() + expiresIn * 1000);
          const newCharacter = await characterRepository.create({
            accountId,
            eveCharacterId: BigInt(character.CharacterID),
            eveCharacterName: character.CharacterName,
            corpId: BigInt(characterInfo.corporation_id),
            corpName: corpInfo.name,
            allianceId: characterInfo.alliance_id ? BigInt(characterInfo.alliance_id) : null,
            allianceName: allianceInfo?.name ?? null,
            portraitUrl: esiClient.getCharacterPortraitUrl(character.CharacterID, 128),
            esiAccessToken: encryptionService.encryptToBuffer(accessToken),
            esiRefreshToken: refreshToken ? encryptionService.encryptToBuffer(refreshToken) : null,
            esiTokenExpiresAt: expiresAt,
            scopes: character.Scopes.split(' '),
          });
          characterId = newCharacter.id;

          // Set as primary character
          await accountRepository.update(accountId, {
            primaryCharacterId: characterId,
          });
        }

        // Update last login
        await accountRepository.updateLastLogin(accountId);

        // Get account with roles
        const account = await accountRepository.getById(accountId);
        if (!account) {
          throw new Error('Account not found after creation');
        }

        // Get feature roles
        const featureRepository = await import('@battlescope/database').then(
          (m) => new m.FeatureRepository(request.server.db),
        );
        const roles = await featureRepository.getAccountFeatureRoles(accountId);

        // Create session
        const roleMap = new Map(roles.map((r) => [r.featureKey, r.roleRank]));
        const sessionToken = await sessionService.createSession({
          accountId,
          isSuperAdmin: account.isSuperAdmin,
          roles: roleMap,
        });

        // Set cookie
        reply.setCookie(sessionService.getCookieName(), sessionToken, {
          httpOnly: true,
          secure: !request.server.config.developerMode,
          sameSite: 'lax',
          path: '/',
          maxAge: request.server.config.sessionTtlSeconds,
        });

        // Audit log
        await auditLogRepository.create({
          actorAccountId: accountId,
          action: 'account.login',
          targetType: 'account',
          targetId: accountId,
          metadata: {
            characterId: character.CharacterID,
            characterName: character.CharacterName,
          },
        });

        // Redirect to frontend
        const redirectUri = eveSSOService.getRedirectUri(state) ?? frontendUrl;
        return reply.redirect(302, redirectUri);
      } catch (error) {
        request.log.error({ error }, 'OAuth callback failed');
        return reply.redirect(302, `${frontendUrl}?error=auth_failed`);
      }
    },
  );

  // Logout
  appWithTypes.post(
    '/auth/logout',
    {
      schema: {
        tags: ['Auth'],
        description: 'Logout current session',
        response: {
          204: z.null(),
        },
      },
    },
    async (request, reply) => {
      const token = request.cookies[sessionService.getCookieName()];

      if (token) {
        await sessionService.destroySession(token);
      }

      reply.clearCookie(sessionService.getCookieName());
      return reply.status(204).send();
    },
  );
}
