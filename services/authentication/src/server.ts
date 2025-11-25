import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { createLogger } from '@battlescope/logger';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
  });

  // Register plugins
  await app.register(cookie, {
    secret: process.env.SESSION_SECRET || 'development-secret-change-in-production',
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Health check
  app.get('/health', async () => {
    return {
      status: 'healthy',
      service: 'authentication',
      timestamp: new Date().toISOString(),
    };
  });

  // Register routes
  await app.register(authRoutes);
  await app.register(meRoutes);

  return app;
}
