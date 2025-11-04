import type { FastifyInstance } from 'fastify';
import { trace } from '@opentelemetry/api';
import type { DashboardRepository } from '@battlescope/database';
import type { NameEnricher } from '../services/name-enricher.js';

const tracer = trace.getTracer('battlescope.api.dashboard');

export const registerDashboardRoutes = (
  app: FastifyInstance,
  repository: DashboardRepository,
  nameEnricher: NameEnricher,
): void => {
  app.get('/stats/summary', async (_, reply) => {
    const summary = await tracer.startActiveSpan('getDashboardSummary', async (span) => {
      try {
        return await repository.getSummary();
      } finally {
        span.end();
      }
    });

    const enriched = await nameEnricher.enrichDashboardSummary(summary);
    return reply.send(enriched);
  });
};
