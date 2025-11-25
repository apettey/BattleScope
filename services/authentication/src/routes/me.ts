import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { getDatabase } from '../database/client';
import { requireAuth } from '../middleware/auth';
import * as esi from '../lib/esi';
import * as session from '../lib/session';
import { encryptToken } from '../lib/crypto';

export async function meRoutes(app: FastifyInstance) {
  const db = getDatabase();

  // All routes require authentication
  app.addHook('onRequest', requireAuth);

  // GET /me - Get current user with characters
  app.get('/me', async (request, reply) => {
    const { accountId } = request.user;

    const account = await db
      .selectFrom('accounts')
      .leftJoin('characters as primary_char', 'accounts.primary_character_id', 'primary_char.id')
      .select([
        'accounts.id',
        'accounts.email',
        'accounts.display_name',
        'accounts.is_super_admin',
        'accounts.last_login_at',
        'primary_char.id as primary_character_id',
        'primary_char.eve_character_name as primary_character_name',
        'primary_char.eve_character_id as primary_character_eve_id',
        'primary_char.corp_id as primary_character_corp_id',
        'primary_char.corp_name as primary_character_corp_name',
        'primary_char.portrait_url as primary_character_portrait_url',
      ])
      .where('accounts.id', '=', accountId)
      .executeTakeFirst();

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    const characters = await db
      .selectFrom('characters')
      .select([
        'id',
        'eve_character_id',
        'eve_character_name',
        'corp_id',
        'corp_name',
        'alliance_id',
        'alliance_name',
        'portrait_url',
        'last_verified_at',
      ])
      .where('account_id', '=', accountId)
      .execute();

    // Get roles for the account
    const roles = await db
      .selectFrom('account_feature_roles')
      .innerJoin('roles', 'account_feature_roles.role_id', 'roles.id')
      .select(['roles.key'])
      .where('account_feature_roles.account_id', '=', accountId)
      .execute();

    // Extract unique role keys
    const roleKeys = [...new Set(roles.map((r) => r.key))];

    return {
      account: {
        id: account.id,
        email: account.email,
        display_name: account.display_name,
        is_super_admin: account.is_super_admin,
        last_login_at: account.last_login_at,
        primary_character_id: account.primary_character_id,
      },
      characters: characters.map((c) => ({
        id: c.id,
        character_id: c.eve_character_id,
        character_name: c.eve_character_name,
        corp_id: c.corp_id,
        corp_name: c.corp_name,
        alliance_id: c.alliance_id,
        alliance_name: c.alliance_name,
        portrait_url: c.portrait_url,
        is_primary: c.id === account.primary_character_id,
        created_at: c.last_verified_at?.toISOString() || new Date().toISOString(),
      })),
      primary_character: account.primary_character_id
        ? {
            id: account.primary_character_id,
            character_id: account.primary_character_eve_id!,
            character_name: account.primary_character_name!,
            corp_id: account.primary_character_corp_id!,
            corp_name: account.primary_character_corp_name!,
            portrait_url: account.primary_character_portrait_url!,
            is_primary: true,
            created_at: new Date().toISOString(),
          }
        : undefined,
      roles: roleKeys,
      permissions: [], // Empty for now, can be populated later if needed
    };
  });

  // GET /me/characters - List all characters
  app.get('/me/characters', async (request, reply) => {
    const { accountId } = request.user;

    const account = await db
      .selectFrom('accounts')
      .select('primary_character_id')
      .where('id', '=', accountId)
      .executeTakeFirst();

    const characters = await db
      .selectFrom('characters')
      .select([
        'id',
        'eve_character_id',
        'eve_character_name',
        'corp_id',
        'corp_name',
        'alliance_id',
        'alliance_name',
        'portrait_url',
        'last_verified_at',
      ])
      .where('account_id', '=', accountId)
      .execute();

    return {
      characters: characters.map((c) => ({
        id: c.id,
        character_id: c.eve_character_id,
        character_name: c.eve_character_name,
        corp_id: c.corp_id,
        corp_name: c.corp_name,
        alliance_id: c.alliance_id,
        alliance_name: c.alliance_name,
        portrait_url: c.portrait_url,
        is_primary: c.id === account?.primary_character_id,
        created_at: c.last_verified_at?.toISOString() || new Date().toISOString(),
      })),
    };
  });

  // POST /me/characters/primary - Set primary character
  app.post<{
    Body: { characterId: string };
  }>('/me/characters/primary', async (request, reply) => {
    const { accountId } = request.user;
    const { characterId } = request.body;

    // Verify character belongs to account
    const character = await db
      .selectFrom('characters')
      .select('id')
      .where('id', '=', characterId)
      .where('account_id', '=', accountId)
      .executeTakeFirst();

    if (!character) {
      return reply.code(404).send({ error: 'Character not found or does not belong to your account' });
    }

    // Update primary character
    await db
      .updateTable('accounts')
      .set({ primary_character_id: characterId })
      .where('id', '=', accountId)
      .execute();

    return { success: true };
  });

  // DELETE /me/characters/:id - Unlink character
  app.delete<{
    Params: { id: string };
  }>('/me/characters/:id', async (request, reply) => {
    const { accountId } = request.user;
    const { id: characterId } = request.params;

    // Check if this is the last character
    const characterCount = await db
      .selectFrom('characters')
      .select(db.fn.count('id').as('count'))
      .where('account_id', '=', accountId)
      .executeTakeFirst();

    if (Number(characterCount?.count) <= 1) {
      return reply.code(400).send({
        error: 'Cannot remove last character from account',
      });
    }

    // Check if this is the primary character
    const account = await db
      .selectFrom('accounts')
      .select('primary_character_id')
      .where('id', '=', accountId)
      .executeTakeFirst();

    if (account?.primary_character_id === characterId) {
      return reply.code(400).send({
        error: 'Cannot remove primary character. Set another character as primary first.',
      });
    }

    // Delete character
    const result = await db
      .deleteFrom('characters')
      .where('id', '=', characterId)
      .where('account_id', '=', accountId)
      .execute();

    if (result[0].numDeletedRows === BigInt(0)) {
      return reply.code(404).send({ error: 'Character not found or does not belong to your account' });
    }

    return { success: true };
  });

  // GET /me/roles - Get user roles across all features
  app.get('/me/roles', async (request, reply) => {
    const { accountId } = request.user;

    const roles = await db
      .selectFrom('account_feature_roles')
      .innerJoin('features', 'account_feature_roles.feature_id', 'features.id')
      .innerJoin('roles', 'account_feature_roles.role_id', 'roles.id')
      .select([
        'features.key as feature_key',
        'features.name as feature_name',
        'roles.key as role_key',
        'roles.rank as role_rank',
      ])
      .where('account_feature_roles.account_id', '=', accountId)
      .execute();

    return {
      roles: roles.map((r) => ({
        feature: {
          key: r.feature_key,
          name: r.feature_name,
        },
        role: {
          key: r.role_key,
          rank: r.role_rank,
        },
      })),
    };
  });

  // GET /me/permissions - Get user permissions
  app.get('/me/permissions', async (request, reply) => {
    const { accountId } = request.user;

    // Check if super admin
    const account = await db
      .selectFrom('accounts')
      .select('is_super_admin')
      .where('id', '=', accountId)
      .executeTakeFirst();

    if (account?.is_super_admin) {
      return {
        isSuperAdmin: true,
        permissions: {}, // Super admins have all permissions
      };
    }

    // Get feature-specific permissions
    const roles = await db
      .selectFrom('account_feature_roles')
      .innerJoin('features', 'account_feature_roles.feature_id', 'features.id')
      .innerJoin('roles', 'account_feature_roles.role_id', 'roles.id')
      .select(['features.key as feature_key', 'roles.key as role_key', 'roles.rank'])
      .where('account_feature_roles.account_id', '=', accountId)
      .execute();

    const permissions: Record<string, { role: string; rank: number }> = {};
    for (const role of roles) {
      permissions[role.feature_key] = {
        role: role.role_key,
        rank: role.rank,
      };
    }

    return {
      isSuperAdmin: false,
      permissions,
    };
  });

  // GET /me/characters/link - Initiate character linking (SSO redirect)
  app.get('/me/characters/link', async (request, reply) => {
    const { accountId } = request.user;

    // Generate state with account ID encoded
    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = esi.getAuthorizationUrl(state);

    // Store state with account ID in Redis for verification (expires in 10 minutes)
    await session.storeOAuthState(state, { accountId, linking: true });

    return reply.redirect(authUrl);
  });

  // GET /me/characters/link/callback - Handle character linking callback
  app.get<{
    Querystring: { code?: string; state?: string };
  }>('/me/characters/link/callback', async (request, reply) => {
    const { code, state } = request.query;

    // Validate state
    if (!code || !state) {
      return reply.code(400).send({ error: 'Invalid OAuth callback: missing code or state' });
    }

    // Verify state exists in Redis and get the stored data
    const stateData = await session.verifyAndGetOAuthState(state);
    if (!stateData || !stateData.linking || !stateData.accountId) {
      return reply.code(400).send({ error: 'Invalid OAuth callback: state mismatch or expired' });
    }

    try {
      // Exchange code for tokens
      const tokens = await esi.exchangeCodeForTokens(code);

      // Get character info from ESI
      const charInfo = await esi.getFullCharacterInfo(tokens.access_token);

      // Check if character is already linked to any account
      const existingChar = await db
        .selectFrom('characters')
        .select('account_id')
        .where('eve_character_id', '=', charInfo.characterId)
        .executeTakeFirst();

      if (existingChar) {
        return reply.code(400).send({
          error: 'This character is already linked to an account',
        });
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
    } catch (error) {
      app.log.error({ err: error }, 'Character linking failed');
      return reply.code(500).send({ error: 'Character linking failed' });
    }
  });
}
