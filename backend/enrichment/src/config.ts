import { z } from 'zod';

const ConfigSchema = z.object({
  host: z.string().default('0.0.0.0'),
  port: z.number().int().min(0).max(65535).default(3004),
  redisUrl: z.string().url().default('redis://localhost:6379'),
  concurrency: z.number().int().min(1).max(20).default(5),
  throttleMs: z.number().int().min(0).default(0),
});

export type EnrichmentConfig = z.infer<typeof ConfigSchema>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): EnrichmentConfig =>
  ConfigSchema.parse({
    host: env.HOST,
    port: env.PORT ? Number(env.PORT) : undefined,
    redisUrl: env.REDIS_URL,
    concurrency: env.ENRICHMENT_CONCURRENCY ? Number(env.ENRICHMENT_CONCURRENCY) : undefined,
    throttleMs: env.ENRICHMENT_THROTTLE_MS ? Number(env.ENRICHMENT_THROTTLE_MS) : undefined,
  });
