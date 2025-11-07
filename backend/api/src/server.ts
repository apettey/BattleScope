import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type {
  BattleRepository,
  KillmailRepository,
  RulesetRepository,
  DashboardRepository,
  DatabaseClient,
} from '@battlescope/database';
import type { Redis } from 'ioredis';
import { registerBattleRoutes } from './routes/battles.js';
import { registerKillmailRoutes } from './routes/killmails.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerRulesRoutes } from './routes/rules.js';
import type { ApiConfig } from './config.js';
import { ensureCorsHeaders, type ResolveCorsOrigin } from './cors.js';
import type { NameEnricher } from './services/name-enricher.js';

interface BuildServerOptions {
  battleRepository: BattleRepository;
  killmailRepository: KillmailRepository;
  rulesetRepository: RulesetRepository;
  dashboardRepository: DashboardRepository;
  db: DatabaseClient;
  config: ApiConfig;
  nameEnricher: NameEnricher;
  redis?: Redis;
}

export const buildServer = ({
  battleRepository,
  killmailRepository,
  rulesetRepository,
  dashboardRepository,
  db,
  config,
  nameEnricher,
  redis,
}: BuildServerOptions) => {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  // Set up Zod validators
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Register Swagger for OpenAPI generation
  void app.register(swagger, {
    openapi: {
      info: {
        title: 'BattleScope API',
        version: '2.0.0',
        description: `BattleScope is a data intelligence platform that reconstructs and classifies battles in EVE Online by clustering related killmails from zKillboard.

## Key Features
- Battle reconstruction from killmail clustering
- Real-time killmail feed with Server-Sent Events
- Entity name resolution via ESI API
- Pre-filtered killmail ingestion based on database-configured rulesets

## Data Types
All EVE Online entity IDs (killmail, character, corporation, alliance, system, ship type) are transmitted as strings to support bigint values that exceed JavaScript's Number.MAX_SAFE_INTEGER.`,
        contact: {
          name: 'BattleScope Support',
        },
        license: {
          name: 'MIT',
        },
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Local development server',
        },
      ],
      tags: [
        { name: 'Battles', description: 'Battle reconstruction and querying' },
        { name: 'Killmails', description: 'Killmail feed and streaming' },
        { name: 'Dashboard', description: 'Statistical summaries' },
        { name: 'Rules', description: 'Ingestion ruleset configuration' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  // Register Swagger UI
  void app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  const allowedOrigins = new Set(config.corsAllowedOrigins);

  const isLocalhostOrigin = (origin: string) =>
    /^https?:\/\/localhost(:\d+)?$/i.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin);

  const resolveCorsOrigin: ResolveCorsOrigin = (origin) => {
    if (!origin) {
      return undefined;
    }

    if (config.developerMode && isLocalhostOrigin(origin)) {
      return origin;
    }

    if (allowedOrigins.size === 0) {
      return origin;
    }

    if (allowedOrigins.has(origin)) {
      return origin;
    }

    return false;
  };

  void app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      const resolved = resolveCorsOrigin(origin);
      if (resolved === false) {
        return callback(null, false);
      }

      return callback(null, resolved ?? origin);
    },
    credentials: true,
  });

  app.addHook('onSend', (request, reply, payload, done) => {
    if (!reply.hasHeader('access-control-allow-origin')) {
      ensureCorsHeaders(request, reply, resolveCorsOrigin);
    }
    done(null, payload);
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

  registerBattleRoutes(app, battleRepository, nameEnricher);
  registerKillmailRoutes(
    app,
    killmailRepository,
    rulesetRepository,
    resolveCorsOrigin,
    nameEnricher,
  );
  registerDashboardRoutes(app, dashboardRepository, nameEnricher);
  registerRulesRoutes(app, rulesetRepository, nameEnricher, redis);

  return app;
};
