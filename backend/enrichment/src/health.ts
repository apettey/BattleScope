import Fastify from 'fastify';
import { sql } from 'kysely';
import type { DatabaseClient } from '@battlescope/database';
import type { Redis } from 'ioredis';

const DEFAULT_EXTERNAL_URL = 'https://zkillboard.com/api/history/';
const DEFAULT_TIMEOUT_MS = 2_000;

export interface HealthServerOptions {
  db: DatabaseClient;
  redis: Redis;
  fetchFn?: typeof fetch;
  externalUrl?: string;
  externalTimeoutMs?: number;
}

export const createHealthServer = ({
  db,
  redis,
  fetchFn = fetch,
  externalUrl = DEFAULT_EXTERNAL_URL,
  externalTimeoutMs = DEFAULT_TIMEOUT_MS,
}: HealthServerOptions) => {
  const app = Fastify({ logger: false });

  app.get('/healthz', async (_request, reply) => {
    const checks: Record<'database' | 'redis' | 'external', 'ok' | 'error'> = {
      database: 'ok',
      redis: 'ok',
      external: 'ok',
    };

    try {
      await sql<number>`select 1`.execute(db);
    } catch (error) {
      checks.database = 'error';
    }

    try {
      await redis.ping();
    } catch (error) {
      checks.redis = 'error';
    }

    if (fetchFn) {
      const controller = new AbortController();
      let timeout: NodeJS.Timeout | undefined;

      try {
        timeout = setTimeout(() => controller.abort(), externalTimeoutMs);
        const response = await fetchFn(externalUrl, {
          method: 'HEAD',
          signal: controller.signal,
        });
        if (!response.ok) {
          checks.external = 'error';
        }
      } catch (error) {
        checks.external = 'error';
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
        await Promise.resolve(controller.abort());
      }
    }

    const status = Object.values(checks).every((value) => value === 'ok') ? 'ok' : 'degraded';
    if (status !== 'ok') {
      void reply.status(503);
    }

    return { status, checks };
  });

  return app;
};
