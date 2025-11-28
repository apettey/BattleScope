import type { FastifyInstance } from 'fastify';
import { getDatabase } from '../database/client';
import { decryptToken, encryptToken } from '../lib/crypto';
import * as esi from '../lib/esi';

export interface ESIToken {
  characterId: number;
  characterName: string;
  accessToken: string;
  expiresAt: Date;
  scopes: string[];
}

/**
 * Internal routes for service-to-service communication
 * These endpoints should only be accessible from within the cluster
 */
export async function internalRoutes(app: FastifyInstance) {
  const db = getDatabase();

  /**
   * GET /internal/esi-tokens
   * Returns all available ESI access tokens for the enrichment service
   *
   * Token Management:
   * - Returns only active characters with valid tokens
   * - Automatically refreshes expired tokens before returning
   * - Enrichment service should call this periodically or when tokens fail
   *
   * Response:
   * {
   *   tokens: [
   *     {
   *       characterId: number,
   *       characterName: string,
   *       accessToken: string,
   *       expiresAt: Date,
   *       scopes: string[]
   *     }
   *   ],
   *   count: number
   * }
   */
  app.get('/internal/esi-tokens', async (request, reply) => {
    try {
      // Fetch all characters with ESI tokens
      const characters = await db
        .selectFrom('characters')
        .select([
          'id',
          'eve_character_id',
          'eve_character_name',
          'esi_access_token',
          'esi_refresh_token',
          'esi_token_expires_at',
          'scopes',
        ])
        .where('esi_access_token', 'is not', null)
        .where('esi_refresh_token', 'is not', null)
        .execute();

      if (characters.length === 0) {
        return reply.send({
          tokens: [],
          count: 0,
        });
      }

      const tokens: ESIToken[] = [];
      const now = new Date();

      for (const char of characters) {
        try {
          let accessToken = decryptToken(char.esi_access_token!);
          let expiresAt = char.esi_token_expires_at!;

          // Check if token is expired or expiring soon (within 5 minutes)
          const expiryThreshold = new Date(now.getTime() + 5 * 60 * 1000);

          if (expiresAt < expiryThreshold) {
            app.log.info({
              msg: 'Refreshing expired ESI token',
              characterId: char.eve_character_id,
              characterName: char.eve_character_name,
              expiresAt,
            });

            // Refresh the token
            const refreshToken = decryptToken(char.esi_refresh_token!);
            const newTokens = await esi.refreshAccessToken(refreshToken);

            // Update database with new tokens
            await db
              .updateTable('characters')
              .set({
                esi_access_token: encryptToken(newTokens.access_token),
                esi_refresh_token: encryptToken(newTokens.refresh_token),
                esi_token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000),
              })
              .where('id', '=', char.id)
              .execute();

            accessToken = newTokens.access_token;
            expiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

            app.log.info({
              msg: 'Successfully refreshed ESI token',
              characterId: char.eve_character_id,
              characterName: char.eve_character_name,
              newExpiresAt: expiresAt,
            });
          }

          tokens.push({
            characterId: char.eve_character_id,
            characterName: char.eve_character_name,
            accessToken,
            expiresAt,
            scopes: char.scopes || [],
          });
        } catch (error) {
          app.log.error({
            err: error,
            characterId: char.eve_character_id,
            characterName: char.eve_character_name,
            msg: 'Failed to process ESI token',
          });
          // Continue with other tokens even if one fails
        }
      }

      return reply.send({
        tokens,
        count: tokens.length,
      });
    } catch (error) {
      app.log.error({ err: error }, 'Failed to fetch ESI tokens');
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to fetch ESI tokens',
      });
    }
  });

  /**
   * GET /internal/health
   * Health check for internal service communication
   */
  app.get('/internal/health', async () => {
    return {
      status: 'healthy',
      service: 'authentication-internal',
      timestamp: new Date().toISOString(),
    };
  });
}
