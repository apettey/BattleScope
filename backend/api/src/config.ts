import { z } from 'zod';

const ConfigSchema = z.object({
  port: z.number().int().min(0).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
  developerMode: z.boolean().default(false),
  corsAllowedOrigins: z.array(z.string().url()).default([]),
  esiBaseUrl: z.string().url().default('https://esi.evetech.net/latest/'),
  esiDatasource: z.string().default('tranquility'),
  esiCompatibilityDate: z.string().default('2025-09-30'),
  esiTimeoutMs: z.number().int().min(100).max(120000).default(10_000),
  esiCacheTtlSeconds: z.number().int().min(1).max(86_400).default(300),
  esiRedisCacheUrl: z.string().url().optional(),
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

const parseInteger = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value "${value}" provided`);
  }
  return parsed;
};

const parseUrl = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  return value;
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): ApiConfig =>
  ConfigSchema.parse({
    port: env.PORT ? Number(env.PORT) : undefined,
    host: env.HOST,
    developerMode: parseBoolean(env.DEVELOPER_MODE),
    corsAllowedOrigins: parseOrigins(env.CORS_ALLOWED_ORIGINS),
    esiBaseUrl: env.ESI_BASE_URL,
    esiDatasource: env.ESI_DATASOURCE,
    esiCompatibilityDate: env.ESI_COMPATIBILITY_DATE,
    esiTimeoutMs: parseInteger(env.ESI_TIMEOUT_MS),
    esiCacheTtlSeconds: parseInteger(env.ESI_CACHE_TTL_SECONDS),
    esiRedisCacheUrl: parseUrl(env.ESI_REDIS_CACHE_URL),
  });
