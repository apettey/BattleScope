import type { CacheAdapter } from '@battlescope/esi-client';
import type { Redis as RedisClient } from 'ioredis';

export const createRedisCacheAdapter = (client: RedisClient): CacheAdapter<unknown> => {
  const adapter: CacheAdapter<unknown> = {
    async get(key: string) {
      const payload = await client.get(key);
      if (!payload) {
        return undefined;
      }

      try {
        return JSON.parse(payload) as unknown;
      } catch {
        return undefined;
      }
    },
    async set(key: string, value: unknown, ttlMs: number) {
      const serialized = JSON.stringify(value);
      await client.set(key, serialized, 'PX', ttlMs);
    },
  };
  return adapter;
};
