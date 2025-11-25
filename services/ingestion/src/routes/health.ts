import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../database/schema';

export async function healthRoutes(
  fastify: FastifyInstance,
  db: Kysely<Database>
): Promise<void> {
  fastify.get('/health', async (request, reply) => {
    try {
      // Check database connectivity
      await db.selectFrom('killmail_events').select('killmail_id').limit(1).execute();

      return reply.status(200).send({
        status: 'healthy',
        service: 'ingestion',
        timestamp: new Date().toISOString(),
        database: 'connected',
      });
    } catch (error) {
      request.log.error({ error }, 'Health check failed');
      return reply.status(503).send({
        status: 'unhealthy',
        service: 'ingestion',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
