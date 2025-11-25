import type { FastifyPluginAsync } from 'fastify';
import type { DB } from '../database/types';

const intelRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db as DB;

  // GET /api/intel/characters/:characterId/ships - Get ship history for a character
  fastify.get<{ Params: { characterId: string } }>(
    '/api/intel/characters/:characterId/ships',
    async (request, reply) => {
      const { characterId } = request.params;
      const characterIdNum = Number(characterId);

      if (isNaN(characterIdNum)) {
        return reply.status(400).send({ error: 'Invalid character ID' });
      }

      const shipHistory = await db
        .selectFrom('pilot_ship_history')
        .selectAll()
        .where('character_id', '=', characterIdNum)
        .orderBy('last_seen', 'desc')
        .execute();

      if (shipHistory.length === 0) {
        return reply.status(404).send({ error: 'No ship history found for this character' });
      }

      return {
        characterId: characterIdNum,
        ships: shipHistory,
        totalShipTypes: shipHistory.length,
        totalKills: shipHistory.reduce((sum, ship) => sum + ship.kill_count, 0),
        totalLosses: shipHistory.reduce((sum, ship) => sum + ship.loss_count, 0),
      };
    }
  );

  // GET /api/intel/characters/:characterId/battles - Get battles a character participated in
  fastify.get<{ Params: { characterId: string } }>(
    '/api/intel/characters/:characterId/battles',
    async (request, reply) => {
      const { characterId } = request.params;
      const characterIdNum = Number(characterId);

      if (isNaN(characterIdNum)) {
        return reply.status(400).send({ error: 'Invalid character ID' });
      }

      const battles = await db
        .selectFrom('battle_participants')
        .innerJoin('battles', 'battles.id', 'battle_participants.battle_id')
        .select([
          'battles.id',
          'battles.system_name',
          'battles.region_name',
          'battles.start_time',
          'battles.end_time',
          'battles.total_kills',
          'battles.total_isk_destroyed',
          'battle_participants.ship_type_name',
          'battle_participants.side_id',
          'battle_participants.is_victim',
        ])
        .where('battle_participants.character_id', '=', characterIdNum)
        .orderBy('battles.start_time', 'desc')
        .limit(50)
        .execute();

      return {
        characterId: characterIdNum,
        battles: battles.map((b) => ({
          ...b,
          total_isk_destroyed: b.total_isk_destroyed.toString(),
        })),
        totalBattles: battles.length,
      };
    }
  );
};

export default intelRoutes;
