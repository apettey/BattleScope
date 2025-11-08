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
  // Auth configuration
  eveClientId: z.string(),
  eveClientSecret: z.string(),
  eveCallbackUrl: z.string().url(),
  eveScopes: z.array(z.string()).default(['publicData']),
  encryptionKey: z.string().min(32),
  sessionRedisUrl: z.string().url().optional(),
  sessionTtlSeconds: z.number().int().min(60).max(2_592_000).default(2_592_000), // 30 days default
  sessionCookieName: z.string().default('battlescope_session'),
  authzCacheTtlSeconds: z.number().int().min(10).max(3600).default(60),
  frontendUrl: z.string().url().default('http://localhost:5173'),
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

const parseArray = (value: string | undefined, delimiter: string = ','): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  return value
    .split(delimiter)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
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
    // Auth config
    eveClientId: env.EVE_CLIENT_ID,
    eveClientSecret: env.EVE_CLIENT_SECRET,
    eveCallbackUrl: env.EVE_CALLBACK_URL,
    eveScopes: parseArray(env.EVE_SCOPES, ' '),
    encryptionKey: env.ENCRYPTION_KEY,
    sessionRedisUrl: parseUrl(env.SESSION_REDIS_URL),
    sessionTtlSeconds: parseInteger(env.SESSION_TTL_SECONDS),
    sessionCookieName: env.SESSION_COOKIE_NAME,
    authzCacheTtlSeconds: parseInteger(env.AUTHZ_CACHE_TTL_SECONDS),
    frontendUrl: env.FRONTEND_URL,
  });
