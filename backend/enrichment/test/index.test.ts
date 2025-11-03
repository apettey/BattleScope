import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@battlescope/database';
import type { Redis } from 'ioredis';
import { createHealthServer } from '../src/health.js';

const responseOk = { ok: true } as unknown as Response;
const responseError = { ok: false } as unknown as Response;

describe('createHealthServer', () => {
  it.skip('reports ok when dependencies are healthy', async () => {
    const dbExecute = vi.fn().mockResolvedValue({ rows: [] });
    const redisPing = vi.fn().mockResolvedValue('PONG');
    const fetchFn = vi.fn().mockResolvedValue(responseOk);

    const mockDb = {
      getExecutor: () => ({
        executeQuery: dbExecute,
      }),
    };

    const server = createHealthServer({
      db: mockDb as unknown as DatabaseClient,
      redis: { ping: redisPing } as unknown as Redis,
      fetchFn,
    });

    const result = await server.inject({ method: 'GET', url: '/healthz' });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({
      status: 'ok',
      checks: {
        database: 'ok',
        redis: 'ok',
        external: 'ok',
      },
    });

    await server.close();
  });

  it('reports degraded when any dependency is unhealthy', async () => {
    const dbExecute = vi.fn().mockRejectedValue(new Error('db down'));
    const redisPing = vi.fn().mockRejectedValue(new Error('redis down'));
    const fetchFn = vi.fn().mockResolvedValue(responseError);

    const mockDb = {
      getExecutor: () => ({
        executeQuery: dbExecute,
      }),
    };

    const server = createHealthServer({
      db: mockDb as unknown as DatabaseClient,
      redis: { ping: redisPing } as unknown as Redis,
      fetchFn,
    });

    const result = await server.inject({ method: 'GET', url: '/healthz' });

    expect(result.statusCode).toBe(503);
    expect(result.json()).toEqual({
      status: 'degraded',
      checks: {
        database: 'error',
        redis: 'error',
        external: 'error',
      },
    });

    await server.close();
  });
});
