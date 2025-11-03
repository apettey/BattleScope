import Fastify from 'fastify';
import { sql } from 'kysely';
import type { DatabaseClient } from '@battlescope/database';

export const createHealthServer = (db: DatabaseClient) => {
  const app = Fastify({ logger: false });

  app.get('/healthz', async () => {
    await db.executeQuery(sql`select 1`);
    return { status: 'ok' };
  });

  return app;
};
