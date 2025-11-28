import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../database/schema';

export async function statsRoutes(
  fastify: FastifyInstance,
  db: Kysely<Database>
): Promise<void> {
  // Get ingestion statistics
  fastify.get('/api/stats', async (request, reply) => {
    try {
      // Check if table exists first
      let tableExists;
      try {
        tableExists = await db.introspection.getTables();
      } catch (dbError) {
        // Database or connection error - return empty stats
        request.log.warn({ error: dbError }, 'Database not available, returning empty stats');
        return reply.status(200).send({
          total_battles: 0,
          total_killmails: 0,
          active_users: 0,
          recent_activity: 0,
        });
      }

      const hasKillmailTable = tableExists.some((t) => t.name === 'killmail_events');

      // Return empty stats if table doesn't exist yet
      if (!hasKillmailTable) {
        return reply.status(200).send({
          total_battles: 0,
          total_killmails: 0,
          active_users: 0,
          recent_activity: 0,
        });
      }

      // Total killmails
      const totalResult = await db
        .selectFrom('killmail_events')
        .select((eb) => eb.fn.countAll<number>().as('total'))
        .executeTakeFirst();

      // Killmails in last 24 hours (recent activity)
      const last24hResult = await db
        .selectFrom('killmail_events')
        .select((eb) => eb.fn.countAll<number>().as('last_24h'))
        .where('occurred_at', '>=', sql<Date>`NOW() - INTERVAL '24 hours'`)
        .executeTakeFirst();

      return reply.status(200).send({
        total_battles: 0, // TODO: Implement when battle service is ready
        total_killmails: Number(totalResult?.total ?? 0),
        active_users: 0, // TODO: Implement when auth service tracking is ready
        recent_activity: Number(last24hResult?.last_24h ?? 0),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      request.log.error({ error, errorMessage, errorStack }, 'Failed to fetch stats');
      return reply.status(500).send({
        error: 'Failed to fetch stats',
        message: errorMessage,
      });
    }
  });
}
