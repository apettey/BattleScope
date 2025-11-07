import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { trace } from '@opentelemetry/api';
import type { KillmailRepository, RulesetRepository, SpaceType } from '@battlescope/database';
import { ensureCorsHeaders, type ResolveCorsOrigin } from '../cors.js';
import type { NameEnricher } from '../services/name-enricher.js';
import { RulesetFilter } from '../services/ruleset-filter.js';
import {
  KillmailRecentQuerySchema,
  KillmailStreamQuerySchema,
  KillmailFeedResponseSchema,
  ErrorResponseSchema,
} from '../schemas.js';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const tracer = trace.getTracer('battlescope.api.killmails');

const DEFAULT_LIMIT = 25;
const DEFAULT_STREAM_INTERVAL = 5000;

const RecentQuerySchema = KillmailRecentQuerySchema;
const StreamQuerySchema = KillmailStreamQuerySchema;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: FastifyInstance<any, any, any, any, ZodTypeProvider>,
  repository: KillmailRepository,
  rulesetRepository: RulesetRepository,
  resolveCorsOrigin: ResolveCorsOrigin,
  nameEnricher: NameEnricher,
): void => {
  app.get('/killmails/recent', {
    schema: {
      tags: ['Killmails'],
      summary: 'Get recent killmails',
      description: 'Returns a list of recent killmails with optional filtering by space type',
      querystring: KillmailRecentQuerySchema,
      response: {
        200: KillmailFeedResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const query = RecentQuerySchema.parse(request.query);
      const limit = query.limit ?? DEFAULT_LIMIT;
      const trackedOnly = query.trackedOnly ?? false;
      const spaceTypes = normalizeSpaceTypes(query.spaceType);

      const [ruleset, rawItems] = await Promise.all([
        rulesetRepository.getActiveRuleset(),
        tracer.startActiveSpan('fetchRecentKillmails', async (span) => {
          try {
            // Fetch more items than needed to account for filtering
            return await repository.fetchRecentFeed({
              limit: limit * 3,
            });
          } finally {
            span.end();
          }
        }),
      ]);

      // Apply all filtering in the service layer
      const filtered = RulesetFilter.filterAll(rawItems, {
        ruleset,
        enforceTracked: trackedOnly,
        spaceTypes,
      });
      const items = filtered.slice(0, limit);

      const enriched = await nameEnricher.enrichKillmailFeed(items);

      return reply.send({
        items: enriched,
        count: enriched.length,
      });
    },
  });

  app.get('/killmails/stream', async (request, reply) => {
    const query = StreamQuerySchema.parse(request.query);
    const limit = query.limit ?? DEFAULT_LIMIT;
    const pollIntervalMs = query.pollIntervalMs ?? DEFAULT_STREAM_INTERVAL;
    const spaceTypes = normalizeSpaceTypes(query.spaceType);
    const trackedOnly = query.trackedOnly ?? false;

    const [ruleset, rawInitialItems] = await Promise.all([
      rulesetRepository.getActiveRuleset(),
      repository.fetchRecentFeed({
        limit: limit * 3,
      }),
    ]);

    ensureCorsHeaders(request, reply, resolveCorsOrigin);
    setSseHeaders(reply);

    // Apply all filtering in the service layer
    const filteredInitialItems = RulesetFilter.filterAll(rawInitialItems, {
      ruleset,
      enforceTracked: trackedOnly,
      spaceTypes,
    });
    const initialItems = filteredInitialItems.slice(0, limit);

    const snapshot = await nameEnricher.enrichKillmailFeed(initialItems);
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
        const rawUpdates = await repository.fetchFeedSince({
          limit: limit * 3,
          after: cursor,
          since: cursor ? undefined : fallbackSince,
        });

        // Apply all filtering in the service layer
        const filtered = RulesetFilter.filterAll(rawUpdates, {
          ruleset,
          enforceTracked: trackedOnly,
          spaceTypes,
        });
        const updates = filtered.slice(0, limit);

        if (updates.length > 0) {
          const responses = await nameEnricher.enrichKillmailFeed(updates);
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
