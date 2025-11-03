import { z } from 'zod';

const ConfigSchema = z.object({
  port: z.number().int().min(0).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
});

export type ApiConfig = z.infer<typeof ConfigSchema>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): ApiConfig =>
  ConfigSchema.parse({
    port: env.PORT ? Number(env.PORT) : undefined,
    host: env.HOST,
  });
