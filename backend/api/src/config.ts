import { z } from 'zod';

const ConfigSchema = z.object({
  port: z.number().int().min(0).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
  developerMode: z.boolean().default(false),
  corsAllowedOrigins: z.array(z.string().url()).default([]),
});

export type ApiConfig = z.infer<typeof ConfigSchema>;

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (/^(true|1|yes|y|on)$/i.test(value)) {
    return true;
  }

  if (/^(false|0|no|n|off)$/i.test(value)) {
    return false;
  }

  throw new Error(`Invalid boolean value "${value}" for DEVELOPER_MODE`);
};

const parseOrigins = (value: string | undefined): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): ApiConfig =>
  ConfigSchema.parse({
    port: env.PORT ? Number(env.PORT) : undefined,
    host: env.HOST,
    developerMode: parseBoolean(env.DEVELOPER_MODE),
    corsAllowedOrigins: parseOrigins(env.CORS_ALLOWED_ORIGINS),
  });
