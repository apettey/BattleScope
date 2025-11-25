import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../database/schema';
import { z } from 'zod';

// Request schemas
const ListKillmailsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  systemId: z.coerce.number().optional(),
  unprocessedOnly: z.coerce.boolean().default(false),
});

export async function killmailRoutes(
  fastify: FastifyInstance,
  db: Kysely<Database>
): Promise<void> {
  // List recent killmails with pagination
  fastify.get('/api/killmails', async (request, reply) => {
    const query = ListKillmailsQuerySchema.parse(request.query);

    try {
      let dbQuery = db
        .selectFrom('killmail_events')
        .selectAll()
        .orderBy('occurred_at', 'desc')
        .limit(query.limit)
        .offset(query.offset);

      // Filter by system if provided
      if (query.systemId !== undefined) {
        dbQuery = dbQuery.where('system_id', '=', query.systemId);
      }

      // Filter unprocessed only if requested
      if (query.unprocessedOnly) {
        dbQuery = dbQuery.where('processed_at', 'is', null);
      }

      const killmails = await dbQuery.execute();

      // Get total count for pagination
      let countQuery = db
        .selectFrom('killmail_events')
        .select((eb) => eb.fn.countAll<number>().as('count'));

      if (query.systemId !== undefined) {
        countQuery = countQuery.where('system_id', '=', query.systemId);
      }

      if (query.unprocessedOnly) {
        countQuery = countQuery.where('processed_at', 'is', null);
      }

      const countResult = await countQuery.executeTakeFirst();
      const total = countResult?.count ?? 0;

      return reply.status(200).send({
        data: killmails.map((km) => ({
          killmailId: km.killmail_id,
          systemId: km.system_id,
          occurredAt: km.occurred_at,
          fetchedAt: km.fetched_at,
          victimAllianceId: km.victim_alliance_id,
          attackerAllianceIds: km.attacker_alliance_ids,
          iskValue: km.isk_value,
          zkbUrl: km.zkb_url,
          processedAt: km.processed_at,
          battleId: km.battle_id,
        })),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: Number(total),
          hasMore: query.offset + query.limit < total,
        },
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to fetch killmails');
      return reply.status(500).send({
        error: 'Failed to fetch killmails',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get killmail details by ID
  fastify.get<{ Params: { id: string } }>('/api/killmails/:id', async (request, reply) => {
    const killmailId = parseInt(request.params.id, 10);

    if (isNaN(killmailId)) {
      return reply.status(400).send({
        error: 'Invalid killmail ID',
        message: 'Killmail ID must be a number',
      });
    }

    try {
      const killmail = await db
        .selectFrom('killmail_events')
        .selectAll()
        .where('killmail_id', '=', killmailId)
        .executeTakeFirst();

      if (!killmail) {
        return reply.status(404).send({
          error: 'Killmail not found',
          message: `Killmail with ID ${killmailId} not found`,
        });
      }

      return reply.status(200).send({
        killmailId: killmail.killmail_id,
        systemId: killmail.system_id,
        occurredAt: killmail.occurred_at,
        fetchedAt: killmail.fetched_at,
        victimAllianceId: killmail.victim_alliance_id,
        attackerAllianceIds: killmail.attacker_alliance_ids,
        iskValue: killmail.isk_value,
        zkbUrl: killmail.zkb_url,
        rawData: killmail.raw_data,
        processedAt: killmail.processed_at,
        battleId: killmail.battle_id,
      });
    } catch (error) {
      request.log.error({ killmailId, error }, 'Failed to fetch killmail');
      return reply.status(500).send({
        error: 'Failed to fetch killmail',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
