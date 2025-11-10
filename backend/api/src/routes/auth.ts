import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { EVESSOService, SessionService, EncryptionService } from '@battlescope/auth';
import type {
  AccountRepository,
  CharacterRepository,
  AuthConfigRepository,
  AuditLogRepository,
} from '@battlescope/database';
import type { EsiClient } from '@battlescope/esi-client';

const AuthLoginQuerySchema = z.object({
  redirectUri: z.string().url().optional(),
  add_character: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
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
      const { redirectUri, add_character } = request.query;

      // If adding character, get current user's account ID from session
      let existingAccountId: string | undefined;
      if (add_character) {
        try {
          // Check if user is authenticated
          const sessionToken = request.cookies.battlescope_session;
          if (sessionToken) {
            const session = await sessionService.validateSession(sessionToken);
            if (session) {
              existingAccountId = session.accountId;
              request.log.info(
                { accountId: existingAccountId },
                'Adding character to existing account',
              );
            }
          }
        } catch (error) {
          request.log.warn('Failed to get session for add_character flow');
        }

        if (!existingAccountId) {
          // User is not logged in but trying to add character - redirect to error
          return reply.redirect(302, `${frontendUrl}?error=not_authenticated`);
        }
      }

      const { url } = eveSSOService.generateAuthorizationUrl(redirectUri ?? frontendUrl, {
        isAddingCharacter: add_character,
        existingAccountId,
      });

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

      request.log.info({ code: code.substring(0, 10) + '...', state }, 'Starting auth callback');

      try {
        // Exchange code for tokens and verify character
        request.log.info('Exchanging code for token');
        const result = await eveSSOService.exchangeCodeForToken(code, state);
        const { character, accessToken, refreshToken, expiresIn, oauthState } = result;
        request.log.info(
          {
            characterId: character.CharacterID,
            characterName: character.CharacterName,
            hasRefreshToken: !!refreshToken,
            expiresIn,
          },
          'Token exchange successful',
        );

        // Get character info from ESI
        request.log.info(
          { characterId: character.CharacterID },
          'Fetching character info from ESI',
        );
        const characterInfo = await esiClient.getCharacterInfo(character.CharacterID);
        request.log.info(
          {
            characterId: character.CharacterID,
            corpId: characterInfo.corporation_id,
            allianceId: characterInfo.alliance_id,
          },
          'Character info retrieved',
        );

        request.log.info({ corpId: characterInfo.corporation_id }, 'Fetching corporation info');
        const corpInfo = await esiClient.getCorporationInfo(characterInfo.corporation_id);
        request.log.info(
          { corpId: characterInfo.corporation_id, corpName: corpInfo.name },
          'Corporation info retrieved',
        );

        const allianceInfo = characterInfo.alliance_id
          ? await esiClient.getAllianceInfo(characterInfo.alliance_id)
          : null;
        if (characterInfo.alliance_id) {
          request.log.info(
            { allianceId: characterInfo.alliance_id, allianceName: allianceInfo?.name },
            'Alliance info retrieved',
          );
        } else {
          request.log.info('Character has no alliance');
        }

        // Handle add_character flow differently
        if (oauthState.isAddingCharacter && oauthState.existingAccountId) {
          request.log.info(
            {
              accountId: oauthState.existingAccountId,
              characterId: character.CharacterID,
            },
            'Adding character to existing account',
          );

          // Check if character already exists on a different account
          const existingCharacter = await characterRepository.getByEveCharacterId(
            BigInt(character.CharacterID),
          );

          if (existingCharacter && existingCharacter.accountId !== oauthState.existingAccountId) {
            request.log.warn(
              {
                characterId: character.CharacterID,
                existingAccountId: existingCharacter.accountId,
                requestedAccountId: oauthState.existingAccountId,
              },
              'Character already exists on different account',
            );
            return reply.redirect(302, `${frontendUrl}?error=character_exists#profile`);
          }

          if (existingCharacter) {
            // Character exists on same account - just update tokens
            request.log.info(
              { characterId: existingCharacter.id },
              'Character already on account, updating tokens',
            );
            const expiresAt = new Date(Date.now() + expiresIn * 1000);
            await characterRepository.update(existingCharacter.id, {
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
            // Add new character to existing account (skip org gating for alts)
            request.log.info(
              { accountId: oauthState.existingAccountId },
              'Creating new alt character',
            );
            const expiresAt = new Date(Date.now() + expiresIn * 1000);
            const newCharacter = await characterRepository.create({
              accountId: oauthState.existingAccountId,
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

            // Audit log
            await auditLogRepository.create({
              actorAccountId: oauthState.existingAccountId,
              action: 'character.added',
              targetType: 'character',
              targetId: newCharacter.id,
              metadata: {
                characterId: character.CharacterID,
                characterName: character.CharacterName,
                corpId: characterInfo.corporation_id,
                corpName: corpInfo.name,
                allianceId: characterInfo.alliance_id,
                allianceName: allianceInfo?.name,
              },
            });

            request.log.info(
              {
                characterId: newCharacter.id,
                characterName: character.CharacterName,
              },
              'Alt character added successfully',
            );
          }

          // Redirect back to profile (don't create new session)
          return reply.redirect(302, `${frontendUrl}?character_added=true#profile`);
        }

        // Check org gating (only for primary character login)
        request.log.info(
          {
            corpId: characterInfo.corporation_id,
            allianceId: characterInfo.alliance_id,
          },
          'Checking org gating',
        );
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
        request.log.info('Org gating check passed');

        // Check if character already exists
        request.log.info({ characterId: character.CharacterID }, 'Checking if character exists');
        const existingCharacter = await characterRepository.getByEveCharacterId(
          BigInt(character.CharacterID),
        );
        request.log.info(
          { characterId: character.CharacterID, exists: !!existingCharacter },
          'Character existence check complete',
        );

        let accountId: string;
        let characterId: string;

        if (existingCharacter) {
          // Character exists - use existing account
          request.log.info(
            {
              characterId: existingCharacter.id,
              accountId: existingCharacter.accountId,
            },
            'Existing character found, updating info',
          );
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
          request.log.info({ characterId }, 'Character info updated');
        } else {
          // New character - create account and character
          request.log.info(
            { characterName: character.CharacterName },
            'Creating new account for character',
          );
          const account = await accountRepository.create({
            displayName: character.CharacterName,
          });
          accountId = account.id;
          request.log.info({ accountId }, 'New account created');

          request.log.info({ accountId }, 'Creating new character');
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
          request.log.info({ characterId }, 'Character created');

          // Set as primary character
          request.log.info({ accountId, characterId }, 'Setting as primary character');
          await accountRepository.update(accountId, {
            primaryCharacterId: characterId,
          });
          request.log.info({ accountId, characterId }, 'Primary character set');
        }

        // Update last login
        request.log.info({ accountId }, 'Updating last login');
        await accountRepository.updateLastLogin(accountId);

        // Get account with roles
        request.log.info({ accountId }, 'Fetching account with roles');
        const account = await accountRepository.getById(accountId);
        if (!account) {
          request.log.error({ accountId }, 'Account not found after creation');
          throw new Error('Account not found after creation');
        }
        request.log.info({ accountId, isSuperAdmin: account.isSuperAdmin }, 'Account retrieved');

        // Get feature roles
        request.log.info({ accountId }, 'Fetching feature roles');
        const featureRepository = await import('@battlescope/database').then(
          (m) => new m.FeatureRepository(request.server.db),
        );
        const roles = await featureRepository.getAccountFeatureRoles(accountId);
        request.log.info({ accountId, roleCount: roles.length }, 'Feature roles retrieved');

        // Create session
        request.log.info({ accountId }, 'Creating session');
        const roleMap = new Map(roles.map((r) => [r.featureKey, r.roleRank]));
        const sessionToken = await sessionService.createSession({
          accountId,
          isSuperAdmin: account.isSuperAdmin,
          roles: roleMap,
        });
        request.log.info({ accountId }, 'Session created successfully');

        // Set cookie
        request.log.info('Setting session cookie');
        // Extract hostname from request (strip port if present)
        // This allows the cookie to be shared between API and frontend on different ports
        const hostname = request.hostname.split(':')[0];
        void reply.setCookie(sessionService.getCookieName(), sessionToken, {
          httpOnly: true,
          secure: request.server.config.sessionCookieSecure,
          sameSite: 'lax',
          path: '/',
          domain: hostname,
          maxAge: request.server.config.sessionTtlSeconds,
        });

        // Audit log
        request.log.info({ accountId }, 'Creating audit log entry');
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
        request.log.info(
          { accountId, redirectUri, characterName: character.CharacterName },
          'Auth callback successful, redirecting to frontend',
        );
        return reply.redirect(302, redirectUri);
      } catch (error) {
        request.log.error(
          {
            error,
            code: code.substring(0, 10) + '...',
            state,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          },
          'OAuth callback failed',
        );
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

      void reply.clearCookie(sessionService.getCookieName());
      return reply.status(204).send();
    },
  );
}
