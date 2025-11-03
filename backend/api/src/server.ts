import Fastify from 'fastify';
import { ZodError } from 'zod';
import type { BattleRepository, DatabaseClient } from '@battlescope/database';
import { registerBattleRoutes } from './routes/battles';

interface BuildServerOptions {
  battleRepository: BattleRepository;
  db: DatabaseClient;
}

export const buildServer = ({ battleRepository, db }: BuildServerOptions) => {
  const app = Fastify({ logger: true });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ message: 'Invalid request', issues: error.issues });
    }

    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.status(statusCode).send({ message: error.message });
  });

  app.get('/healthz', async () => {
    await db.selectFrom('battles').select('id').limit(1).execute();
    return { status: 'ok' };
  });

  registerBattleRoutes(app, battleRepository);

  return app;
};
