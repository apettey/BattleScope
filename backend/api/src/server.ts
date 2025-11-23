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
import { createAuthMiddleware } from '@battlescope/auth';
import { registerBattleRoutes } from './routes/battles.js';
import { registerKillmailRoutes } from './routes/killmails.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerMeRoutes } from './routes/me.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAdminBattleReportsRoutes } from './routes/admin-battle-reports.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerRulesetRoutes } from './routes/rulesets.js';
import type { ApiConfig } from './config.js';
import { ensureCorsHeaders, type ResolveCorsOrigin } from './cors.js';
import type { NameEnricher } from './services/name-enricher.js';
import type { SearchService } from '@battlescope/search';
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
  searchService: SearchService;
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
  searchService,
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
        { name: 'Profile', description: 'User self-service account management' },
        { name: 'Admin', description: 'User and role management (Admin only)' },
        { name: 'Battles', description: 'Battle reconstruction and querying' },
        { name: 'Killmails', description: 'Killmail feed and streaming' },
        { name: 'Dashboard', description: 'Statistical summaries' },
        {
          name: 'Search',
          description: 'Typesense-powered search for battles, entities, and systems',
        },
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

    // Log error for debugging
    request.log.error(
      {
        err: error,
        url: request.url,
        method: request.method,
        statusCode,
      },
      'Request error',
    );

    return reply.status(statusCode).send({ message: error.message });
  });

  app.get('/healthz', async (request, reply) => {
    // Check database connectivity
    await db.selectFrom('battles').select('id').limit(1).execute();

    // Check session Redis connectivity (critical for auth)
    if (sessionService) {
      const sessionHealth = await sessionService.isHealthy();
      if (!sessionHealth.healthy) {
        request.log.error({ reason: sessionHealth.reason }, 'Session Redis health check failed');
        return reply.status(503).send({
          status: 'unhealthy',
          reason: sessionHealth.reason,
        });
      }
    }

    return { status: 'ok' };
  });

  // Public routes that don't require authentication
  const PUBLIC_ROUTES = new Set([
    '/healthz',
    '/auth/login',
    '/auth/callback',
    '/docs',
    '/docs/static/*',
    '/docs/json',
  ]);

  // Apply global auth middleware to all routes except public ones
  if (sessionService) {
    const authMiddleware = createAuthMiddleware(sessionService);

    app.addHook('preHandler', async (request, reply) => {
      // Extract pathname without query parameters
      const pathname = request.url.split('?')[0];

      // Skip auth for public routes
      if (PUBLIC_ROUTES.has(pathname) || pathname.startsWith('/docs/')) {
        return;
      }

      // Skip auth for exact pattern matches
      for (const route of PUBLIC_ROUTES) {
        if (route.endsWith('*') && pathname.startsWith(route.slice(0, -1))) {
          return;
        }
      }

      // Apply auth middleware
      await authMiddleware(request, reply);
    });

    app.log.info('Global auth middleware enabled');
  } else {
    app.log.warn('Global auth middleware not enabled - session service not configured');
  }

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
    registerProfileRoutes(
      app,
      sessionService,
      accountRepository,
      characterRepository,
      featureRepository,
      auditLogRepository,
    );
    registerAdminRoutes(
      app,
      sessionService,
      authorizationService,
      accountRepository,
      characterRepository,
      featureRepository,
      auditLogRepository,
    );
    registerAdminBattleReportsRoutes(
      app,
      sessionService,
      featureRepository,
      rulesetRepository,
      killmailRepository,
      battleRepository,
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
  registerRulesetRoutes(app, rulesetRepository, nameEnricher);

  // Register search routes
  registerSearchRoutes(app, searchService);

  return app;
};
