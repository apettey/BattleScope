import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { DB } from '../database/types';

const ListBattlesQuerySchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
  systemId: z.string().optional().transform((v) => (v ? Number(v) : undefined)),
  securityType: z.enum(['highsec', 'lowsec', 'nullsec', 'wormhole']).optional(),
  minKills: z.string().optional().transform((v) => (v ? Number(v) : undefined)),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const battleRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db as DB;

  // GET /api/battles - List battles with pagination and filters
  fastify.get('/api/battles', async (request) => {
    const query = ListBattlesQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    let battlesQuery = db
      .selectFrom('battles')
      .selectAll()
      .orderBy('start_time', 'desc')
      .limit(query.limit)
      .offset(offset);

    // Apply filters
    if (query.systemId) {
      battlesQuery = battlesQuery.where('system_id', '=', query.systemId);
    }
    if (query.securityType) {
      battlesQuery = battlesQuery.where('security_type', '=', query.securityType);
    }
    if (query.minKills) {
      battlesQuery = battlesQuery.where('total_kills', '>=', query.minKills);
    }
    if (query.startDate) {
      battlesQuery = battlesQuery.where('start_time', '>=', new Date(query.startDate));
    }
    if (query.endDate) {
      battlesQuery = battlesQuery.where('start_time', '<=', new Date(query.endDate));
    }

    const battles = await battlesQuery.execute();

    // Get total count for pagination
    let countQuery = db.selectFrom('battles').select(db.fn.count('id').as('count'));

    if (query.systemId) {
      countQuery = countQuery.where('system_id', '=', query.systemId);
    }
    if (query.securityType) {
      countQuery = countQuery.where('security_type', '=', query.securityType);
    }
    if (query.minKills) {
      countQuery = countQuery.where('total_kills', '>=', query.minKills);
    }
    if (query.startDate) {
      countQuery = countQuery.where('start_time', '>=', new Date(query.startDate));
    }
    if (query.endDate) {
      countQuery = countQuery.where('start_time', '<=', new Date(query.endDate));
    }

    const countResult = await countQuery.executeTakeFirst();
    const total = Number(countResult?.count || 0);

    return {
      data: battles.map((b) => ({
        ...b,
        total_isk_destroyed: b.total_isk_destroyed.toString(),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  // GET /api/battles/:id - Get battle details
  fastify.get<{ Params: { id: string } }>('/api/battles/:id', async (request, reply) => {
    const { id } = request.params;

    const battle = await db
      .selectFrom('battles')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!battle) {
      return reply.status(404).send({ error: 'Battle not found' });
    }

    // Get participant stats
    const participantStats = await db
      .selectFrom('battle_participants')
      .select([
        'side_id',
        db.fn.count('character_id').as('participant_count'),
        db.fn.countAll().as('total'),
      ])
      .where('battle_id', '=', id)
      .groupBy('side_id')
      .execute();

    // Get alliance breakdown
    const allianceStats = await db
      .selectFrom('battle_participants')
      .select([
        'alliance_name',
        'side_id',
        db.fn.count('character_id').as('count'),
      ])
      .where('battle_id', '=', id)
      .where('alliance_name', 'is not', null)
      .groupBy(['alliance_name', 'side_id'])
      .orderBy('count', 'desc')
      .limit(10)
      .execute();

    return {
      ...battle,
      total_isk_destroyed: battle.total_isk_destroyed.toString(),
      stats: {
        participants: participantStats,
        topAlliances: allianceStats,
      },
    };
  });

  // GET /api/battles/:id/participants - Get battle participants
  fastify.get<{ Params: { id: string } }>('/api/battles/:id/participants', async (request, reply) => {
    const { id } = request.params;

    // Check if battle exists
    const battle = await db
      .selectFrom('battles')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();

    if (!battle) {
      return reply.status(404).send({ error: 'Battle not found' });
    }

    const participants = await db
      .selectFrom('battle_participants')
      .selectAll()
      .where('battle_id', '=', id)
      .orderBy('alliance_name')
      .orderBy('character_name')
      .execute();

    return {
      battleId: id,
      participants: participants.map((p) => ({
        ...p,
        alliance_id: p.alliance_id?.toString(),
        corp_id: p.corp_id?.toString(),
      })),
    };
  });

  // GET /api/battles/:id/timeline - Get battle timeline (killmails in chronological order)
  fastify.get<{ Params: { id: string } }>('/api/battles/:id/timeline', async (request, reply) => {
    const { id } = request.params;

    // Check if battle exists
    const battle = await db
      .selectFrom('battles')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();

    if (!battle) {
      return reply.status(404).send({ error: 'Battle not found' });
    }

    const timeline = await db
      .selectFrom('battle_killmails')
      .selectAll()
      .where('battle_id', '=', id)
      .orderBy('occurred_at', 'asc')
      .execute();

    return {
      battleId: id,
      timeline: timeline.map((t) => ({
        ...t,
        isk_value: t.isk_value?.toString(),
      })),
    };
  });
};

export default battleRoutes;
