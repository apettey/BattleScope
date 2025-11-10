import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { trace } from '@opentelemetry/api';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { z } from 'zod';
import type { BattleRepository, BattleFilters, BattleCursor } from '@battlescope/database';
import type { NameEnricher } from '../services/name-enricher.js';
import {
  BattleListQuerySchema,
  BattleIdParamSchema,
  EntityIdParamSchema,
  BattleListResponseSchema,
  BattleDetailSchema,
  ErrorResponseSchema,
  AllianceDetailSchema,
  CorporationDetailSchema,
  CharacterDetailSchema,
} from '../schemas.js';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const tracer = trace.getTracer('battlescope.api.battles');

const DEFAULT_LIMIT = 20;

const ListQuerySchema = BattleListQuerySchema;
const AllianceParamsSchema = EntityIdParamSchema;
const CorpParamsSchema = EntityIdParamSchema;
const CharacterParamsSchema = EntityIdParamSchema;
const BattleParamsSchema = BattleIdParamSchema;

const encodeCursor = (cursor: BattleCursor): string =>
  Buffer.from(
    JSON.stringify({
      startTime: cursor.startTime.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64');

const decodeCursor = (value: string): BattleCursor | null => {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as {
      startTime: string;
      id: string;
    };
    const startTime = new Date(decoded.startTime);
    if (Number.isNaN(startTime.getTime()) || typeof decoded.id !== 'string') {
      return null;
    }
    return { startTime, id: decoded.id };
  } catch {
    return null;
  }
};

const buildFilters = (
  query: z.infer<typeof ListQuerySchema>,
  overrides: Partial<BattleFilters> = {},
): BattleFilters => {
  let characterId: bigint | undefined;
  if (query.characterId) {
    characterId = BigInt(query.characterId);
  }

  let systemId: bigint | undefined;
  if (query.systemId) {
    systemId = BigInt(query.systemId);
  }

  let allianceId: bigint | undefined;
  if (query.allianceId) {
    allianceId = BigInt(query.allianceId);
  }

  let corpId: bigint | undefined;
  if (query.corpId) {
    corpId = BigInt(query.corpId);
  }

  return {
    securityType: query.securityType,
    systemId,
    allianceId,
    corpId,
    characterId,
    since: query.since,
    until: query.until,
    ...overrides,
  };
};

const handleListRequest = async (
  repository: BattleRepository,
  request: FastifyRequest,
  reply: FastifyReply,
  nameEnricher: NameEnricher,
  overrides: Partial<BattleFilters> = {},
) => {
  const query = ListQuerySchema.parse(request.query);

  let cursor: BattleCursor | undefined;
  if (query.cursor) {
    cursor = decodeCursor(query.cursor) ?? undefined;
    if (!cursor) {
      return reply.status(400).send({ message: 'Invalid cursor' });
    }
  }

  let filters: BattleFilters;
  try {
    filters = buildFilters(query, overrides);
  } catch {
    return reply.status(400).send({ message: 'Invalid character id' });
  }

  const limit = query.limit ?? DEFAULT_LIMIT;

  const battles = await tracer.startActiveSpan('listBattles', async (span) => {
    try {
      return await repository.listBattles(filters, limit, cursor);
    } finally {
      span.end();
    }
  });

  const enriched = await nameEnricher.enrichBattleSummaries(battles);

  const nextCursor =
    battles.length === limit
      ? encodeCursor({
          startTime: battles[battles.length - 1].startTime,
          id: battles[battles.length - 1].id,
        })
      : null;

  return reply.send({
    items: enriched,
    nextCursor,
  });
};

export const registerBattleRoutes = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: FastifyInstance<any, any, any, any, ZodTypeProvider>,
  repository: BattleRepository,
  nameEnricher: NameEnricher,
): void => {
  app.get('/battles', {
    schema: {
      tags: ['Battles'],
      summary: 'List battles',
      description:
        'Returns a paginated list of battles with optional filtering by space type, system, alliance, corporation, character, or time range.',
      querystring: BattleListQuerySchema,
      response: {
        200: BattleListResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      return handleListRequest(repository, request, reply, nameEnricher);
    },
  });

  app.get('/alliances/:id/battles', {
    schema: {
      tags: ['Battles'],
      summary: 'List battles for an alliance',
      description: 'Returns battles where the specified alliance participated',
      params: EntityIdParamSchema,
      querystring: BattleListQuerySchema,
      response: {
        200: BattleListResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const params = AllianceParamsSchema.parse(request.params);
      return handleListRequest(repository, request, reply, nameEnricher, {
        allianceId: BigInt(params.id),
      });
    },
  });

  app.get('/corporations/:id/battles', {
    schema: {
      tags: ['Battles'],
      summary: 'List battles for a corporation',
      description: 'Returns battles where the specified corporation participated',
      params: EntityIdParamSchema,
      querystring: BattleListQuerySchema,
      response: {
        200: BattleListResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const params = CorpParamsSchema.parse(request.params);
      return handleListRequest(repository, request, reply, nameEnricher, {
        corpId: BigInt(params.id),
      });
    },
  });

  app.get('/characters/:id/battles', {
    schema: {
      tags: ['Battles'],
      summary: 'List battles for a character',
      description: 'Returns battles where the specified character participated',
      params: EntityIdParamSchema,
      querystring: BattleListQuerySchema,
      response: {
        200: BattleListResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const params = CharacterParamsSchema.parse(request.params);
      try {
        return handleListRequest(repository, request, reply, nameEnricher, {
          characterId: BigInt(params.id),
        });
      } catch {
        return reply.status(400).send({ message: 'Invalid character id' });
      }
    },
  });

  app.get('/battles/:id', {
    schema: {
      tags: ['Battles'],
      summary: 'Get battle details',
      description:
        'Returns detailed information about a specific battle including all killmails and participants',
      params: BattleIdParamSchema,
      response: {
        200: BattleDetailSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const params = BattleParamsSchema.parse(request.params);
      const battle = await tracer.startActiveSpan('getBattle', async (span) => {
        try {
          return await repository.getBattleById(params.id);
        } finally {
          span.end();
        }
      });

      if (!battle) {
        return reply.status(404).send({ message: 'Battle not found' });
      }

      const response = await nameEnricher.enrichBattleDetail(battle);
      return reply.send(response);
    },
  });

  app.get('/alliances/:id', {
    schema: {
      tags: ['Entities'],
      summary: 'Get alliance details',
      description: 'Returns detailed statistics and information about a specific alliance',
      params: EntityIdParamSchema,
      response: {
        200: AllianceDetailSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const params = AllianceParamsSchema.parse(request.params);
      const allianceId = BigInt(params.id);

      const statistics = await tracer.startActiveSpan('getAllianceStatistics', async (span) => {
        try {
          return await repository.getAllianceStatistics(allianceId);
        } finally {
          span.end();
        }
      });

      if (!statistics) {
        return reply.status(404).send({ message: 'Alliance not found or no battles recorded' });
      }

      // Collect IDs for name resolution
      const idsToResolve = new Set<string>();
      idsToResolve.add(params.id);
      statistics.topOpponents.forEach((o) => idsToResolve.add(o.allianceId.toString()));
      statistics.mostUsedShips.forEach((s) => idsToResolve.add(s.shipTypeId.toString()));
      statistics.topSystems.forEach((s) => idsToResolve.add(s.systemId.toString()));

      const names = await nameEnricher.lookupNames(Array.from(idsToResolve).map(Number));

      const totalIsk = statistics.totalIskDestroyed + statistics.totalIskLost;
      const iskEfficiency =
        totalIsk > 0n ? Number((statistics.totalIskDestroyed * 10000n) / totalIsk) / 100 : 0;

      return reply.send({
        allianceId: params.id,
        allianceName: names.get(params.id) ?? null,
        ticker: null,
        statistics: {
          totalBattles: statistics.totalBattles,
          totalKillmails: statistics.totalKillmails,
          totalIskDestroyed: statistics.totalIskDestroyed.toString(),
          totalIskLost: statistics.totalIskLost.toString(),
          iskEfficiency,
          averageParticipants: statistics.averageParticipants,
          mostUsedShips: statistics.mostUsedShips.map((s) => ({
            shipTypeId: s.shipTypeId.toString(),
            shipTypeName: names.get(s.shipTypeId.toString()) ?? null,
            count: s.count,
          })),
          topOpponents: statistics.topOpponents.map((o) => ({
            allianceId: o.allianceId.toString(),
            allianceName: names.get(o.allianceId.toString()) ?? null,
            battleCount: o.battleCount,
          })),
          topSystems: statistics.topSystems.map((s) => ({
            systemId: s.systemId.toString(),
            systemName: names.get(s.systemId.toString()) ?? null,
            battleCount: s.battleCount,
          })),
        },
      });
    },
  });

  app.get('/corporations/:id', {
    schema: {
      tags: ['Entities'],
      summary: 'Get corporation details',
      description: 'Returns detailed statistics and information about a specific corporation',
      params: EntityIdParamSchema,
      response: {
        200: CorporationDetailSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const params = CorpParamsSchema.parse(request.params);
      const corpId = BigInt(params.id);

      const statistics = await tracer.startActiveSpan('getCorporationStatistics', async (span) => {
        try {
          return await repository.getCorporationStatistics(corpId);
        } finally {
          span.end();
        }
      });

      if (!statistics) {
        return reply.status(404).send({ message: 'Corporation not found or no battles recorded' });
      }

      // Get corp info to find alliance
      const idsToResolve = new Set<string>();
      idsToResolve.add(params.id);
      statistics.topOpponents.forEach((o) => idsToResolve.add(o.allianceId.toString()));
      statistics.mostUsedShips.forEach((s) => idsToResolve.add(s.shipTypeId.toString()));
      statistics.topPilots.forEach((p) => idsToResolve.add(p.characterId.toString()));

      const names = await nameEnricher.lookupNames(Array.from(idsToResolve).map(Number));

      const totalIsk = statistics.totalIskDestroyed + statistics.totalIskLost;
      const iskEfficiency =
        totalIsk > 0n ? Number((statistics.totalIskDestroyed * 10000n) / totalIsk) / 100 : 0;

      return reply.send({
        corpId: params.id,
        corpName: names.get(params.id) ?? null,
        ticker: null,
        allianceId: null,
        allianceName: null,
        statistics: {
          totalBattles: statistics.totalBattles,
          totalKillmails: statistics.totalKillmails,
          totalIskDestroyed: statistics.totalIskDestroyed.toString(),
          totalIskLost: statistics.totalIskLost.toString(),
          iskEfficiency,
          averageParticipants: statistics.averageParticipants,
          mostUsedShips: statistics.mostUsedShips.map((s) => ({
            shipTypeId: s.shipTypeId.toString(),
            shipTypeName: names.get(s.shipTypeId.toString()) ?? null,
            count: s.count,
          })),
          topOpponents: statistics.topOpponents.map((o) => ({
            allianceId: o.allianceId.toString(),
            allianceName: names.get(o.allianceId.toString()) ?? null,
            battleCount: o.battleCount,
          })),
          topPilots: statistics.topPilots.map((p) => ({
            characterId: p.characterId.toString(),
            characterName: names.get(p.characterId.toString()) ?? null,
            battleCount: p.battleCount,
          })),
        },
      });
    },
  });

  app.get('/characters/:id', {
    schema: {
      tags: ['Entities'],
      summary: 'Get character details',
      description: 'Returns detailed statistics and information about a specific character',
      params: EntityIdParamSchema,
      response: {
        200: CharacterDetailSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const params = CharacterParamsSchema.parse(request.params);
      const characterId = BigInt(params.id);

      const statistics = await tracer.startActiveSpan('getCharacterStatistics', async (span) => {
        try {
          return await repository.getCharacterStatistics(characterId);
        } finally {
          span.end();
        }
      });

      if (!statistics) {
        return reply.status(404).send({ message: 'Character not found or no battles recorded' });
      }

      const idsToResolve = new Set<string>();
      idsToResolve.add(params.id);
      statistics.topOpponents.forEach((o) => idsToResolve.add(o.allianceId.toString()));
      statistics.mostUsedShips.forEach((s) => idsToResolve.add(s.shipTypeId.toString()));
      statistics.favoriteSystems.forEach((s) => idsToResolve.add(s.systemId.toString()));

      const names = await nameEnricher.lookupNames(Array.from(idsToResolve).map(Number));

      const totalIsk = statistics.totalIskDestroyed + statistics.totalIskLost;
      const iskEfficiency =
        totalIsk > 0n ? Number((statistics.totalIskDestroyed * 10000n) / totalIsk) / 100 : 0;

      return reply.send({
        characterId: params.id,
        characterName: names.get(params.id) ?? null,
        corpId: null,
        corpName: null,
        allianceId: null,
        allianceName: null,
        statistics: {
          totalBattles: statistics.totalBattles,
          totalKills: statistics.totalKills,
          totalLosses: statistics.totalLosses,
          totalIskDestroyed: statistics.totalIskDestroyed.toString(),
          totalIskLost: statistics.totalIskLost.toString(),
          iskEfficiency,
          mostUsedShips: statistics.mostUsedShips.map((s) => ({
            shipTypeId: s.shipTypeId.toString(),
            shipTypeName: names.get(s.shipTypeId.toString()) ?? null,
            count: s.count,
          })),
          topOpponents: statistics.topOpponents.map((o) => ({
            allianceId: o.allianceId.toString(),
            allianceName: names.get(o.allianceId.toString()) ?? null,
            battleCount: o.battleCount,
          })),
          favoriteSystems: statistics.favoriteSystems.map((s) => ({
            systemId: s.systemId.toString(),
            systemName: names.get(s.systemId.toString()) ?? null,
            battleCount: s.battleCount,
          })),
        },
      });
    },
  });
};
