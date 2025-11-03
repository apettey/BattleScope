import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { trace } from '@opentelemetry/api';
import { z } from 'zod';
import { SpaceTypeSchema } from '@battlescope/database';
import type { BattleRepository, BattleFilters, BattleCursor } from '@battlescope/database';
import { toBattleDetailResponse, toBattleSummaryResponse } from '../types.js';

const tracer = trace.getTracer('battlescope.api.battles');

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  cursor: z.string().optional(),
  spaceType: SpaceTypeSchema.optional(),
  systemId: z.coerce.number().int().optional(),
  allianceId: z.coerce.number().int().optional(),
  corpId: z.coerce.number().int().optional(),
  characterId: z.string().optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
});

const AllianceParamsSchema = z.object({ id: z.coerce.number().int() });
const CorpParamsSchema = z.object({ id: z.coerce.number().int() });
const CharacterParamsSchema = z.object({ id: z.string() });
const BattleParamsSchema = z.object({ id: z.string() });

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

  return {
    spaceType: query.spaceType,
    systemId: query.systemId,
    allianceId: query.allianceId,
    corpId: query.corpId,
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

  const nextCursor =
    battles.length === limit
      ? encodeCursor({
          startTime: battles[battles.length - 1].startTime,
          id: battles[battles.length - 1].id,
        })
      : null;

  return reply.send({
    items: battles.map(toBattleSummaryResponse),
    nextCursor,
  });
};

export const registerBattleRoutes = (app: FastifyInstance, repository: BattleRepository): void => {
  app.get('/battles', async (request, reply) => {
    return handleListRequest(repository, request, reply);
  });

  app.get('/alliances/:id/battles', async (request, reply) => {
    const params = AllianceParamsSchema.parse(request.params);
    return handleListRequest(repository, request, reply, { allianceId: params.id });
  });

  app.get('/corporations/:id/battles', async (request, reply) => {
    const params = CorpParamsSchema.parse(request.params);
    return handleListRequest(repository, request, reply, { corpId: params.id });
  });

  app.get('/characters/:id/battles', async (request, reply) => {
    const params = CharacterParamsSchema.parse(request.params);
    try {
      return handleListRequest(repository, request, reply, { characterId: BigInt(params.id) });
    } catch {
      return reply.status(400).send({ message: 'Invalid character id' });
    }
  });

  app.get('/battles/:id', async (request, reply) => {
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

    return reply.send(toBattleDetailResponse(battle));
  });
};
