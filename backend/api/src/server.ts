import Fastify from 'fastify';
import cors from '@fastify/cors';
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
import type { ApiConfig } from './config.js';

interface BuildServerOptions {
  battleRepository: BattleRepository;
  killmailRepository: KillmailRepository;
  rulesetRepository: RulesetRepository;
  dashboardRepository: DashboardRepository;
  db: DatabaseClient;
  config: ApiConfig;
}

export const buildServer = ({
  battleRepository,
  killmailRepository,
  rulesetRepository,
  dashboardRepository,
  db,
  config,
}: BuildServerOptions) => {
  const app = Fastify({ logger: true });

  const allowedOrigins = new Set(config.corsAllowedOrigins);

  const isLocalhostOrigin = (origin: string) =>
    /^https?:\/\/localhost(:\d+)?$/i.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin);

  void app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (config.developerMode && isLocalhostOrigin(origin)) {
        return callback(null, origin);
      }

      if (allowedOrigins.size === 0) {
        return callback(null, origin);
      }

      if (allowedOrigins.has(origin)) {
        return callback(null, origin);
      }

      return callback(null, false);
    },
    credentials: true,
  });

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
