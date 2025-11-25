import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { createLogger } from '@battlescope/logger';
import { notificationsRoutes, subscriptionsRoutes } from './routes';
import {
  SubscriptionsRepository,
  NotificationsRepository,
  WebhookDeliveriesRepository,
} from './database';

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
      service: 'notification',
      timestamp: new Date().toISOString(),
    };
  });

  // Initialize repositories
  const subscriptionsRepo = new SubscriptionsRepository();
  const notificationsRepo = new NotificationsRepository();
  const webhookDeliveriesRepo = new WebhookDeliveriesRepository();

  // Register routes
  await app.register(notificationsRoutes, { notificationsRepo });
  await app.register(subscriptionsRoutes, { subscriptionsRepo });

  return app;
}
