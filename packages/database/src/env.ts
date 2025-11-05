import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const DatabaseEnvSchema = z
  .object({
    DATABASE_URL: z.string().url().optional(),
    POSTGRES_HOST: z.string().optional(),
    POSTGRES_PORT: z.preprocess(
      (val) => (val === '' || val === undefined ? undefined : val),
      z.coerce.number().int().optional(),
    ),
    POSTGRES_DB: z.string().optional(),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_SSL: z
      .enum(['true', 'false'])
      .optional()
      .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  })
  .superRefine((data, ctx) => {
    if (!data.DATABASE_URL) {
      const missing = ['POSTGRES_HOST', 'POSTGRES_DB', 'POSTGRES_USER'].filter(
        (key) => !(data as Record<string, unknown>)[key],
      );
      if (missing.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing required database configuration: ${missing.join(', ')}`,
        });
      }
    }
  });

export type DatabaseEnv = z.infer<typeof DatabaseEnvSchema>;

export interface DatabaseConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
}

export const loadDatabaseConfig = (env: NodeJS.ProcessEnv = process.env): DatabaseConfig => {
  const parsed = DatabaseEnvSchema.parse(env);

  if (parsed.DATABASE_URL) {
    return { connectionString: parsed.DATABASE_URL, ssl: parsed.POSTGRES_SSL };
  }

  return {
    host: parsed.POSTGRES_HOST!,
    port: parsed.POSTGRES_PORT ?? 5432,
    database: parsed.POSTGRES_DB!,
    user: parsed.POSTGRES_USER!,
    password: parsed.POSTGRES_PASSWORD,
    ssl: parsed.POSTGRES_SSL,
  };
};
