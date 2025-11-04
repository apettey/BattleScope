import type { FastifyInstance } from 'fastify';
import { trace } from '@opentelemetry/api';
import type { DashboardRepository } from '@battlescope/database';
import type { NameEnricher } from '../services/name-enricher.js';
import { DashboardSummarySchema, ErrorResponseSchema } from '../schemas.js';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const tracer = trace.getTracer('battlescope.api.dashboard');

export const registerDashboardRoutes = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: FastifyInstance<any, any, any, any, ZodTypeProvider>,
  repository: DashboardRepository,
  nameEnricher: NameEnricher,
): void => {
  app.get('/stats/summary', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get dashboard summary statistics',
      description:
        'Returns aggregated statistics including battle counts, top alliances, and top corporations',
      response: {
        200: DashboardSummarySchema,
        500: ErrorResponseSchema,
      },
    },
    handler: async (_, reply) => {
      const summary = await tracer.startActiveSpan('getDashboardSummary', async (span) => {
        try {
          return await repository.getSummary();
        } finally {
          span.end();
        }
      });

      const enriched = await nameEnricher.enrichDashboardSummary(summary);
      return reply.send(enriched);
    },
  });
};
