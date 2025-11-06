import { z } from 'zod';

const ConfigSchema = z.object({
  windowMinutes: z.number().int().min(1).default(30),
  gapMaxMinutes: z.number().int().min(1).default(15),
  minKills: z.number().int().min(1).default(2),
  processingDelayMinutes: z.number().int().min(0).default(30),
  batchSize: z.number().int().min(1).max(2000).default(500),
  intervalMs: z.number().int().min(500).default(10000),
  port: z.number().int().min(0).max(65535).default(3003),
});

export type ClustererConfig = z.infer<typeof ConfigSchema>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): ClustererConfig =>
  ConfigSchema.parse({
    windowMinutes: env.CLUSTER_WINDOW_MINUTES ? Number(env.CLUSTER_WINDOW_MINUTES) : undefined,
    gapMaxMinutes: env.CLUSTER_GAP_MAX_MINUTES ? Number(env.CLUSTER_GAP_MAX_MINUTES) : undefined,
    minKills: env.CLUSTER_MIN_KILLS ? Number(env.CLUSTER_MIN_KILLS) : undefined,
    processingDelayMinutes: env.CLUSTER_PROCESSING_DELAY_MINUTES
      ? Number(env.CLUSTER_PROCESSING_DELAY_MINUTES)
      : undefined,
    batchSize: env.CLUSTER_BATCH_SIZE ? Number(env.CLUSTER_BATCH_SIZE) : undefined,
    intervalMs: env.CLUSTER_INTERVAL_MS ? Number(env.CLUSTER_INTERVAL_MS) : undefined,
    port: env.PORT ? Number(env.PORT) : undefined,
  });
