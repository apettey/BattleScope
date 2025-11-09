import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
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
  AccountRepository,
  CharacterRepository,
  FeatureRepository,
  AuthConfigRepository,
  AuditLogRepository,
  DatabaseClient,
} from '@battlescope/database';
import type { Redis } from 'ioredis';
import type { EsiClient } from '@battlescope/esi-client';
import type {
  EVESSOService,
  SessionService,
  AuthorizationService,
  EncryptionService,
} from '@battlescope/auth';
import { registerBattleRoutes } from './routes/battles.js';
import { registerKillmailRoutes } from './routes/killmails.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerRulesRoutes } from './routes/rules.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerMeRoutes } from './routes/me.js';
import { registerAdminRoutes } from './routes/admin.js';
import type { ApiConfig } from './config.js';
import { ensureCorsHeaders, type ResolveCorsOrigin } from './cors.js';
import type { NameEnricher } from './services/name-enricher.js';
import { createLoggerConfig } from '@battlescope/shared';

// Extend Fastify types with custom decorators
declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseClient;
    config: ApiConfig;
  }
  interface FastifyRequest {
    account: {
      id: string;
      isSuperAdmin: boolean;
      roles: Map<string, number>;
    };
  }
}

interface BuildServerOptions {
  battleRepository: BattleRepository;
  killmailRepository: KillmailRepository;
  rulesetRepository: RulesetRepository;
  dashboardRepository: DashboardRepository;
  accountRepository: AccountRepository;
  characterRepository: CharacterRepository;
  featureRepository: FeatureRepository;
  authConfigRepository: AuthConfigRepository;
  auditLogRepository: AuditLogRepository;
  db: DatabaseClient;
  config: ApiConfig;
  nameEnricher: NameEnricher;
  esiClient: EsiClient;
  eveSSOService?: EVESSOService;
  sessionService?: SessionService;
  authorizationService?: AuthorizationService;
  encryptionService?: EncryptionService;
  redis?: Redis;
}

export const buildServer = ({
  battleRepository,
  killmailRepository,
  rulesetRepository,
  dashboardRepository,
  accountRepository,
  characterRepository,
  featureRepository,
  authConfigRepository,
  auditLogRepository,
  db,
  config,
  nameEnricher,
  esiClient,
  eveSSOService,
  sessionService,
  authorizationService,
  encryptionService,
  redis,
}: BuildServerOptions) => {
  const app = Fastify({ logger: createLoggerConfig() }).withTypeProvider<ZodTypeProvider>();

  // Decorate app with DB and config for middleware access
  app.decorate('db', db);
  app.decorate('config', config);

  // Set up Zod validators
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Register cookie plugin for session management
  void app.register(cookie, {
    secret: config.encryptionKey,
    parseOptions: {
      httpOnly: true,
      secure: !config.developerMode,
      sameSite: 'lax',
    },
  });

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
        { name: 'Auth', description: 'EVE Online SSO authentication' },
        { name: 'Me', description: 'Current user profile and character management' },
        { name: 'Admin', description: 'User and role management (Admin only)' },
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

  // Register auth routes (only if auth services are configured)
  if (eveSSOService && sessionService && authorizationService && encryptionService) {
    registerAuthRoutes(
      app,
      eveSSOService,
      sessionService,
      accountRepository,
      characterRepository,
      authConfigRepository,
      auditLogRepository,
      esiClient,
      encryptionService,
      config.frontendUrl,
    );
    registerMeRoutes(
      app,
      sessionService,
      accountRepository,
      characterRepository,
      featureRepository,
    );
    registerAdminRoutes(
      app,
      sessionService,
      authorizationService,
      accountRepository,
      featureRepository,
      auditLogRepository,
    );
  } else {
    app.log.warn('Auth routes not registered - authentication services not configured');
  }

  // Register feature routes
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
