import type { FastifyInstance } from 'fastify';
import { trace } from '@opentelemetry/api';
import type { PilotShipHistoryRepository } from '@battlescope/database';
import type { NameEnricher } from '../services/name-enricher.js';
import {
  EntityIdParamSchema,
  CharacterShipsQuerySchema,
  CharacterLossesQuerySchema,
  CharacterShipsResponseSchema,
  CharacterLossesResponseSchema,
  ErrorResponseSchema,
} from '../schemas.js';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const tracer = trace.getTracer('battlescope.api.intel');

const encodeCursor = (date: Date): string =>
  Buffer.from(date.toISOString(), 'utf8').toString('base64');

const decodeCursor = (value: string): Date | null => {
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const date = new Date(decoded);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date;
  } catch {
    return null;
  }
};

export const registerIntelRoutes = (
  app: FastifyInstance,
  shipHistoryRepository: PilotShipHistoryRepository,
  nameEnricher: NameEnricher,
) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  // GET /intel/characters/:id/ships - Get character's ship history
  typedApp.get(
    '/intel/characters/:id/ships',
    {
      schema: {
        tags: ['Intel'],
        summary: 'Get character ship history',
        description:
          'Returns aggregated ship statistics for a character including kills, losses, and ISK values per ship type.',
        params: EntityIdParamSchema,
        querystring: CharacterShipsQuerySchema,
        response: {
          200: CharacterShipsResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      return tracer.startActiveSpan('intel.getCharacterShips', async (span) => {
        try {
          const { id } = request.params;
          const { limit } = request.query;
          const characterId = BigInt(id);

          span.setAttribute('characterId', id);
          span.setAttribute('limit', limit);

          // Get ship summary from repository
          const shipSummary = await shipHistoryRepository.getCharacterShipSummary(
            characterId,
            limit,
          );

          // Get ISK totals
          const iskTotals = await shipHistoryRepository.getCharacterIskTotals(characterId);

          // Enrich ship names
          const shipTypeIds = shipSummary.map((s) => s.shipTypeId);
          const shipNames = await nameEnricher.enrichShipTypeIds(shipTypeIds);

          // Enrich character name
          const characterNames = await nameEnricher.enrichCharacterIds([characterId]);
          const characterName = characterNames.get(characterId) ?? null;

          // Calculate ISK efficiency
          const totalIsk = iskTotals.totalIskDestroyed + iskTotals.totalIskLost;
          const iskEfficiency =
            totalIsk > 0n ? Number((iskTotals.totalIskDestroyed * 10000n) / totalIsk) / 100 : 0;

          const response = {
            characterId: id,
            characterName,
            totalIskDestroyed: iskTotals.totalIskDestroyed.toString(),
            totalIskLost: iskTotals.totalIskLost.toString(),
            iskEfficiency,
            ships: shipSummary.map((ship) => ({
              shipTypeId: ship.shipTypeId.toString(),
              shipTypeName: shipNames.get(ship.shipTypeId) ?? null,
              timesFlown: ship.timesFlown,
              kills: ship.kills,
              losses: ship.losses,
              iskDestroyed: ship.iskDestroyed.toString(),
              iskLost: ship.iskLost.toString(),
            })),
            updatedAt: new Date().toISOString(),
          };

          span.setAttribute('shipCount', response.ships.length);
          return reply.send(response);
        } finally {
          span.end();
        }
      });
    },
  );

  // GET /intel/characters/:id/losses - Get character's loss history
  typedApp.get(
    '/intel/characters/:id/losses',
    {
      schema: {
        tags: ['Intel'],
        summary: 'Get character losses',
        description:
          'Returns paginated list of character losses with ship details and zkillboard links.',
        params: EntityIdParamSchema,
        querystring: CharacterLossesQuerySchema,
        response: {
          200: CharacterLossesResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      return tracer.startActiveSpan('intel.getCharacterLosses', async (span) => {
        try {
          const { id } = request.params;
          const { limit, cursor } = request.query;
          const characterId = BigInt(id);

          span.setAttribute('characterId', id);
          span.setAttribute('limit', limit);

          // Decode cursor if provided
          const cursorDate = cursor ? decodeCursor(cursor) : undefined;

          // Get losses from repository
          const losses = await shipHistoryRepository.getCharacterLosses(
            characterId,
            limit + 1, // Fetch one extra to determine if there's more
            cursorDate ?? undefined,
          );

          // Determine if there are more results
          const hasMore = losses.length > limit;
          const resultLosses = hasMore ? losses.slice(0, limit) : losses;

          // Get ISK totals for total loss count
          const iskTotals = await shipHistoryRepository.getCharacterIskTotals(characterId);

          // Enrich names
          const shipTypeIds = resultLosses.map((l) => l.shipTypeId);
          const systemIds = resultLosses.map((l) => l.systemId);
          const [shipNames, systemNames, characterNames] = await Promise.all([
            nameEnricher.enrichShipTypeIds(shipTypeIds),
            nameEnricher.enrichSystemIds(systemIds),
            nameEnricher.enrichCharacterIds([characterId]),
          ]);

          const characterName = characterNames.get(characterId) ?? null;

          // Calculate next cursor
          const nextCursor =
            hasMore && resultLosses.length > 0
              ? encodeCursor(resultLosses[resultLosses.length - 1].occurredAt)
              : null;

          const response = {
            characterId: id,
            characterName,
            totalLosses: iskTotals.totalLosses,
            totalIskLost: iskTotals.totalIskLost.toString(),
            losses: resultLosses.map((loss) => ({
              killmailId: loss.killmailId.toString(),
              zkbUrl: loss.zkbUrl,
              shipTypeId: loss.shipTypeId.toString(),
              shipTypeName: shipNames.get(loss.shipTypeId) ?? null,
              shipValue: loss.shipValue?.toString() ?? null,
              systemId: loss.systemId.toString(),
              systemName: systemNames.get(loss.systemId) ?? null,
              occurredAt: loss.occurredAt.toISOString(),
            })),
            nextCursor,
            updatedAt: new Date().toISOString(),
          };

          span.setAttribute('lossCount', response.losses.length);
          span.setAttribute('hasMore', hasMore);
          return reply.send(response);
        } finally {
          span.end();
        }
      });
    },
  );
};
