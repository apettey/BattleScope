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
          totalKillmails: 0,
          processedKillmails: 0,
          unprocessedKillmails: 0,
          last24Hours: 0,
          lastHour: 0,
          totalIskDestroyed: 0,
          topSystems: [],
          timestamp: new Date().toISOString(),
        });
      }

      const hasKillmailTable = tableExists.some((t) => t.name === 'killmail_events');

      // Return empty stats if table doesn't exist yet
      if (!hasKillmailTable) {
        return reply.status(200).send({
          totalKillmails: 0,
          processedKillmails: 0,
          unprocessedKillmails: 0,
          last24Hours: 0,
          lastHour: 0,
          totalIskDestroyed: 0,
          topSystems: [],
          timestamp: new Date().toISOString(),
        });
      }

      // Total killmails
      const totalResult = await db
        .selectFrom('killmail_events')
        .select((eb) => eb.fn.countAll<number>().as('total'))
        .executeTakeFirst();

      // Processed killmails
      const processedResult = await db
        .selectFrom('killmail_events')
        .select((eb) => eb.fn.countAll<number>().as('processed'))
        .where('processed_at', 'is not', null)
        .executeTakeFirst();

      // Unprocessed killmails
      const unprocessedResult = await db
        .selectFrom('killmail_events')
        .select((eb) => eb.fn.countAll<number>().as('unprocessed'))
        .where('processed_at', 'is', null)
        .executeTakeFirst();

      // Killmails in last 24 hours
      const last24hResult = await db
        .selectFrom('killmail_events')
        .select((eb) => eb.fn.countAll<number>().as('last_24h'))
        .where('occurred_at', '>=', sql<Date>`NOW() - INTERVAL '24 hours'`)
        .executeTakeFirst();

      // Killmails in last hour
      const lastHourResult = await db
        .selectFrom('killmail_events')
        .select((eb) => eb.fn.countAll<number>().as('last_hour'))
        .where('occurred_at', '>=', sql<Date>`NOW() - INTERVAL '1 hour'`)
        .executeTakeFirst();

      // Total ISK destroyed
      const iskResult = await db
        .selectFrom('killmail_events')
        .select((eb) => eb.fn.sum<number>('isk_value').as('total_isk'))
        .executeTakeFirst();

      // Most active systems (top 10)
      const topSystems = await db
        .selectFrom('killmail_events')
        .select(['system_id', (eb) => eb.fn.countAll<number>().as('kill_count')])
        .where('occurred_at', '>=', sql<Date>`NOW() - INTERVAL '24 hours'`)
        .groupBy('system_id')
        .orderBy('kill_count', 'desc')
        .limit(10)
        .execute();

      return reply.status(200).send({
        totalKillmails: Number(totalResult?.total ?? 0),
        processedKillmails: Number(processedResult?.processed ?? 0),
        unprocessedKillmails: Number(unprocessedResult?.unprocessed ?? 0),
        last24Hours: Number(last24hResult?.last_24h ?? 0),
        lastHour: Number(lastHourResult?.last_hour ?? 0),
        totalIskDestroyed: Number(iskResult?.total_isk ?? 0),
        topSystems: topSystems.map((s) => ({
          systemId: s.system_id,
          killCount: Number(s.kill_count),
        })),
        timestamp: new Date().toISOString(),
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
