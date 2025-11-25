import { z } from 'zod';

const ConfigSchema = z.object({
  port: z.number().int().positive().default(3004),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  typesense: z.object({
    host: z.string().default('typesense'),
    port: z.number().int().positive().default(8108),
    protocol: z.enum(['http', 'https']).default('http'),
    apiKey: z.string().min(1),
    connectionTimeoutSeconds: z.number().int().positive().default(10),
  }),

  kafka: z.object({
    brokers: z.array(z.string()).min(1),
    clientId: z.string().default('battlescope-search'),
    groupId: z.string().default('search-service'),
  }),

  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const rawConfig = {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3004,
    nodeEnv: process.env.NODE_ENV || 'development',

    typesense: {
      host: process.env.TYPESENSE_HOST || 'typesense',
      port: process.env.TYPESENSE_PORT ? parseInt(process.env.TYPESENSE_PORT, 10) : 8108,
      protocol: (process.env.TYPESENSE_PROTOCOL as 'http' | 'https') || 'http',
      apiKey: process.env.TYPESENSE_API_KEY || '',
      connectionTimeoutSeconds: process.env.TYPESENSE_TIMEOUT ? parseInt(process.env.TYPESENSE_TIMEOUT, 10) : 10,
    },

    kafka: {
      brokers: process.env.KAFKA_BROKERS?.split(',') || ['redpanda:9092'],
      clientId: process.env.KAFKA_CLIENT_ID || 'battlescope-search',
      groupId: process.env.KAFKA_GROUP_ID || 'search-service',
    },

    logging: {
      level: (process.env.LOG_LEVEL as Config['logging']['level']) || 'info',
    },
  };

  return ConfigSchema.parse(rawConfig);
}
