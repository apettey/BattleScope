import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { getDatabase } from '../database/client';
import * as esi from '../lib/esi';
import * as session from '../lib/session';
import { encryptToken, decryptToken } from '../lib/crypto';

export async function authRoutes(app: FastifyInstance) {
  const db = getDatabase();

  // GET /auth/login - Initiate EVE SSO login
  app.get('/auth/login', async (request, reply) => {
    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = esi.getAuthorizationUrl(state);

    // Store state in Redis for verification (expires in 10 minutes)
    await session.storeOAuthState(state);

    return reply.redirect(authUrl);
  });

  // GET /auth/callback - OAuth callback handler
  app.get<{
    Querystring: { code?: string; state?: string };
  }>('/auth/callback', async (request, reply) => {
    const { code, state } = request.query;

    // Validate state
    if (!code || !state) {
      return reply.code(400).send({ error: 'Invalid OAuth callback: missing code or state' });
    }

    // Verify state exists in Redis and get the stored data
    const stateData = await session.verifyAndGetOAuthState(state);
    if (!stateData) {
      return reply.code(400).send({ error: 'Invalid OAuth callback: state mismatch or expired' });
    }

    try {
      // Exchange code for tokens
      const tokens = await esi.exchangeCodeForTokens(code);

      // Get character info from ESI
      const charInfo = await esi.getFullCharacterInfo(tokens.access_token);

      // Check corp/alliance membership if required
      const authConfig = await db
        .selectFrom('auth_config')
        .selectAll()
        .where('id', '=', true)
        .executeTakeFirst();

      if (authConfig?.require_membership) {
        const isAllowed = checkMembership(charInfo, authConfig);
        if (!isAllowed) {
          return reply.code(403).send({
            error: 'Your corp/alliance is not authorized to access this system',
          });
        }
      }

      // Check if this is a character linking flow
      if (stateData.linking && stateData.accountId) {
        // CHARACTER LINKING FLOW
        // Check if character is already linked to any account
        const existingChar = await db
          .selectFrom('characters')
          .select('account_id')
          .where('eve_character_id', '=', charInfo.characterId)
          .executeTakeFirst();

        if (existingChar) {
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
          return reply.redirect(`${frontendUrl}/characters?error=already_linked`);
        }

        // Link character to the account
        await db
          .insertInto('characters')
          .values({
            account_id: stateData.accountId,
            eve_character_id: charInfo.characterId,
            eve_character_name: charInfo.characterName,
            corp_id: charInfo.corpId,
            corp_name: charInfo.corpName,
            alliance_id: charInfo.allianceId || null,
            alliance_name: charInfo.allianceName || null,
            portrait_url: await esi.getCharacterPortrait(charInfo.characterId),
            esi_access_token: encryptToken(tokens.access_token),
            esi_refresh_token: encryptToken(tokens.refresh_token),
            esi_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
            scopes: ['publicData'],
            last_verified_at: new Date(),
          })
          .execute();

        // Redirect back to characters page
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return reply.redirect(`${frontendUrl}/characters`);
      }

      // NORMAL LOGIN FLOW
      // Find or create account
      let account = await db
        .selectFrom('characters')
        .innerJoin('accounts', 'characters.account_id', 'accounts.id')
        .select(['accounts.id as account_id'])
        .where('characters.eve_character_id', '=', charInfo.characterId)
        .executeTakeFirst();

      let accountId: string;
      let characterId: string;

      if (account) {
        // Existing character - update account
        accountId = account.account_id;

        // Update character info and tokens
        const result = await db
          .updateTable('characters')
          .set({
            eve_character_name: charInfo.characterName,
            corp_id: charInfo.corpId,
            corp_name: charInfo.corpName,
            alliance_id: charInfo.allianceId || null,
            alliance_name: charInfo.allianceName || null,
            portrait_url: await esi.getCharacterPortrait(charInfo.characterId),
            esi_access_token: encryptToken(tokens.access_token),
            esi_refresh_token: encryptToken(tokens.refresh_token),
            esi_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
            scopes: tokens.access_token ? ['publicData'] : [],
            last_verified_at: new Date(),
          })
          .where('eve_character_id', '=', charInfo.characterId)
          .returning('id')
          .executeTakeFirst();

        characterId = result!.id;

        // Update last login
        await db
          .updateTable('accounts')
          .set({ last_login_at: new Date() })
          .where('id', '=', accountId)
          .execute();
      } else {
        // New character - create account
        const newAccount = await db
          .insertInto('accounts')
          .values({
            display_name: charInfo.characterName,
            last_login_at: new Date(),
            is_blocked: false,
            is_deleted: false,
            is_super_admin: false,
          })
          .returning('id')
          .executeTakeFirst();

        accountId = newAccount!.id;

        // Create character
        const newCharacter = await db
          .insertInto('characters')
          .values({
            account_id: accountId,
            eve_character_id: charInfo.characterId,
            eve_character_name: charInfo.characterName,
            corp_id: charInfo.corpId,
            corp_name: charInfo.corpName,
            alliance_id: charInfo.allianceId || null,
            alliance_name: charInfo.allianceName || null,
            portrait_url: await esi.getCharacterPortrait(charInfo.characterId),
            esi_access_token: encryptToken(tokens.access_token),
            esi_refresh_token: encryptToken(tokens.refresh_token),
            esi_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
            scopes: ['publicData'],
            last_verified_at: new Date(),
          })
          .returning('id')
          .executeTakeFirst();

        characterId = newCharacter!.id;

        // Set as primary character
        await db
          .updateTable('accounts')
          .set({ primary_character_id: characterId })
          .where('id', '=', accountId)
          .execute();

        // Grant default "user" role for all features
        const userRole = await db
          .selectFrom('roles')
          .select('id')
          .where('key', '=', 'user')
          .executeTakeFirst();

        const features = await db.selectFrom('features').select('id').execute();

        if (userRole) {
          for (const feature of features) {
            await db
              .insertInto('account_feature_roles')
              .values({
                account_id: accountId,
                feature_id: feature.id,
                role_id: userRole.id,
              })
              .onConflict((oc) => oc.doNothing())
              .execute();
          }
        }
      }

      // Clear old sessions for this account (single session policy)
      await session.deleteAccountSessions(accountId);

      // Create new session
      const sessionId = session.generateSessionId();
      await session.createSession(sessionId, {
        accountId,
        characterId,
        createdAt: new Date(),
      });

      // Set session cookie
      const cookieName = process.env.SESSION_COOKIE_NAME || 'battlescope_session';
      const secure = process.env.COOKIE_SECURE === 'true' || process.env.COOKIE_SECURE === '1';
      reply.setCookie(cookieName, sessionId, {
        path: '/',
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge: parseInt(process.env.SESSION_TTL_SECONDS || '28800', 10),
      });

      // Redirect to dashboard
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return reply.redirect(`${frontendUrl}/dashboard`);
    } catch (error) {
      app.log.error({ err: error }, 'OAuth callback failed');
      return reply.code(500).send({ error: 'Authentication failed' });
    }
  });

  // POST /auth/logout - Logout and clear session
  app.post('/auth/logout', async (request, reply) => {
    const cookieName = process.env.SESSION_COOKIE_NAME || 'battlescope_session';
    const sessionId = request.cookies[cookieName];

    if (sessionId) {
      await session.deleteSession(sessionId);
    }

    reply.clearCookie(cookieName);
    return { success: true };
  });
}

function checkMembership(
  charInfo: esi.EveCharacter,
  config: {
    allowed_corp_ids: number[];
    allowed_alliance_ids: number[];
    denied_corp_ids: number[];
    denied_alliance_ids: number[];
  }
): boolean {
  // Check deny lists first
  if (config.denied_corp_ids.includes(charInfo.corpId)) {
    return false;
  }
  if (charInfo.allianceId && config.denied_alliance_ids.includes(charInfo.allianceId)) {
    return false;
  }

  // If allow lists are empty, allow all (except denied)
  const hasAllowLists =
    config.allowed_corp_ids.length > 0 || config.allowed_alliance_ids.length > 0;

  if (!hasAllowLists) {
    return true;
  }

  // Check allow lists
  if (config.allowed_corp_ids.includes(charInfo.corpId)) {
    return true;
  }
  if (charInfo.allianceId && config.allowed_alliance_ids.includes(charInfo.allianceId)) {
    return true;
  }

  return false;
}
