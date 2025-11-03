import { assertEnv } from '@battlescope/shared';
import { z } from 'zod';

const ConfigSchema = z.object({
  pollIntervalMs: z.number().int().min(500).default(5000),
  redisqUrl: z.string().url().default('https://zkillredisq.stream/listen.php'),
  redisqQueueId: z.string().optional(),
  port: z.number().int().min(0).max(65535).default(3002),
});

export type IngestConfig = z.infer<typeof ConfigSchema>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): IngestConfig =>
  ConfigSchema.parse({
    pollIntervalMs: env.INGEST_POLL_INTERVAL_MS ? Number(env.INGEST_POLL_INTERVAL_MS) : undefined,
    redisqUrl: env.ZKILLBOARD_REDISQ_URL,
    redisqQueueId: env.ZKILLBOARD_REDISQ_ID ?? env.ZKILLBOARD_QUEUE_ID,
    port: env.PORT ? Number(env.PORT) : undefined,
  });

export const requireDatabaseUrl = (env: NodeJS.ProcessEnv = process.env): string =>
  assertEnv('DATABASE_URL', env.DATABASE_URL);
