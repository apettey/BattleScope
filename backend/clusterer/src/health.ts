import Fastify from 'fastify';
import { sql } from 'kysely';
import type { DatabaseClient } from '@battlescope/database';

export const createHealthServer = (db: DatabaseClient) => {
  const app = Fastify({ logger: false });

  app.get('/healthz', async () => {
    await sql<number>`select 1`.execute(db);
    return { status: 'ok' };
  });

  return app;
};
