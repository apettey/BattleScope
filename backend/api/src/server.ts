import Fastify from 'fastify';
import { ZodError } from 'zod';
import type {
  BattleRepository,
  KillmailRepository,
  RulesetRepository,
  DashboardRepository,
  DatabaseClient,
} from '@battlescope/database';
import { registerBattleRoutes } from './routes/battles.js';
import { registerRulesRoutes } from './routes/rules.js';
import { registerKillmailRoutes } from './routes/killmails.js';
import { registerDashboardRoutes } from './routes/dashboard.js';

interface BuildServerOptions {
  battleRepository: BattleRepository;
  killmailRepository: KillmailRepository;
  rulesetRepository: RulesetRepository;
  dashboardRepository: DashboardRepository;
  db: DatabaseClient;
}

export const buildServer = ({
  battleRepository,
  killmailRepository,
  rulesetRepository,
  dashboardRepository,
  db,
}: BuildServerOptions) => {
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
  registerRulesRoutes(app, rulesetRepository);
  registerKillmailRoutes(app, killmailRepository, rulesetRepository);
  registerDashboardRoutes(app, dashboardRepository);

  return app;
};
