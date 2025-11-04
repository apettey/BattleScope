import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { trace } from '@opentelemetry/api';
import { z } from 'zod';
import type { KillmailRepository, RulesetRepository, SpaceType } from '@battlescope/database';
import { SpaceTypeSchema } from '@battlescope/database';
import { toKillmailFeedItemResponse } from '../types.js';
import { ensureCorsHeaders, type ResolveCorsOrigin } from '../cors.js';

const tracer = trace.getTracer('battlescope.api.killmails');

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const DEFAULT_STREAM_INTERVAL = 5000;

const SpaceTypeQuerySchema = z
  .union([SpaceTypeSchema, z.array(SpaceTypeSchema)])
  .optional()
  .transform((value) => {
    if (!value) {
      return undefined;
    }
    return Array.isArray(value) ? [...new Set(value)] : [value];
  });

const RecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  spaceType: SpaceTypeQuerySchema,
  trackedOnly: z.coerce.boolean().optional(),
});

const StreamQuerySchema = RecentQuerySchema.extend({
  once: z.coerce.boolean().optional(),
  pollIntervalMs: z.coerce.number().int().min(1000).max(60000).optional(),
});

const setSseHeaders = (reply: FastifyReply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.flushHeaders?.();
};

const sendEvent = (reply: FastifyReply, event: string, payload: unknown) => {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const normalizeSpaceTypes = (
  spaceTypes: readonly SpaceType[] | undefined,
): readonly SpaceType[] | undefined =>
  spaceTypes && spaceTypes.length > 0 ? spaceTypes : undefined;

export const registerKillmailRoutes = (
  app: FastifyInstance,
  repository: KillmailRepository,
  rulesetRepository: RulesetRepository,
  resolveCorsOrigin: ResolveCorsOrigin,
): void => {
  app.get('/killmails/recent', async (request, reply) => {
    const query = RecentQuerySchema.parse(request.query);
    const limit = query.limit ?? DEFAULT_LIMIT;

    const ruleset = await rulesetRepository.getActiveRuleset();
    const items = await tracer.startActiveSpan('fetchRecentKillmails', async (span) => {
      try {
        return await repository.fetchRecentFeed({
          limit,
          spaceTypes: normalizeSpaceTypes(query.spaceType),
          ruleset,
          enforceTracked: query.trackedOnly ?? false,
        });
      } finally {
        span.end();
      }
    });

    return reply.send({
      items: items.map(toKillmailFeedItemResponse),
      count: items.length,
    });
  });

  app.get('/killmails/stream', async (request, reply) => {
    const query = StreamQuerySchema.parse(request.query);
    const limit = query.limit ?? DEFAULT_LIMIT;
    const pollIntervalMs = query.pollIntervalMs ?? DEFAULT_STREAM_INTERVAL;
    const ruleset = await rulesetRepository.getActiveRuleset();

    ensureCorsHeaders(request, reply, resolveCorsOrigin);
    setSseHeaders(reply);

    const spaceTypes = normalizeSpaceTypes(query.spaceType);
    const trackedOnly = query.trackedOnly ?? false;

    const initialItems = await repository.fetchRecentFeed({
      limit,
      spaceTypes,
      ruleset,
      enforceTracked: trackedOnly,
    });
    const snapshot = initialItems.map(toKillmailFeedItemResponse);
    sendEvent(reply, 'snapshot', snapshot);

    if (query.once) {
      reply.raw.end();
      return reply;
    }

    let cursor =
      initialItems.length > 0
        ? {
            occurredAt: initialItems[0].occurredAt,
            killmailId: initialItems[0].killmailId,
          }
        : undefined;

    const fallbackSince = cursor ? undefined : new Date();

    let heartbeatTimer: NodeJS.Timeout | null = null;
    let stopped = false;

    const pollUpdates = async () => {
      try {
        const updates = await repository.fetchFeedSince({
          limit,
          spaceTypes,
          ruleset,
          enforceTracked: trackedOnly,
          after: cursor,
          since: cursor ? undefined : fallbackSince,
        });

        if (updates.length > 0) {
          const responses = updates.map(toKillmailFeedItemResponse);
          for (const payload of responses) {
            sendEvent(reply, 'killmail', payload);
          }
          const latest = updates[updates.length - 1];
          cursor = { occurredAt: latest.occurredAt, killmailId: latest.killmailId };
        } else {
          reply.raw.write(': keep-alive\n\n');
        }
      } catch (error) {
        (request as FastifyRequest).log.error(
          { err: error },
          'Failed to poll killmail feed; keeping stream alive',
        );
      } finally {
        if (!stopped) {
          scheduleNext();
        }
      }
    };

    const scheduleNext = () => {
      if (stopped) {
        return;
      }
      heartbeatTimer = setTimeout(() => {
        void pollUpdates();
      }, pollIntervalMs);
    };

    scheduleNext();

    reply.raw.on('close', () => {
      stopped = true;
      if (heartbeatTimer) {
        clearTimeout(heartbeatTimer);
      }
    });

    return reply;
  });
};
