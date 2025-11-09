import { z } from 'zod';

const ConfigSchema = z.object({
  // Database
  databaseUrl: z.string().url(),

  // Redis
  redisUrl: z.string().url(),

  // Encryption
  encryptionKey: z.string().min(32),

  // Verification settings
  batchSize: z.number().int().positive().default(50),
  delayBetweenBatches: z.number().int().nonnegative().default(1000), // milliseconds
  maxCharactersPerRun: z.number().int().positive().default(1000),
  verificationThresholdMinutes: z.number().int().positive().default(55),

  // Environment
  nodeEnv: z.enum(['development', 'production', 'test']).default('production'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const config = {
    // Database
    databaseUrl: process.env.DATABASE_URL,

    // Redis
    redisUrl: process.env.REDIS_URL,

    // Encryption
    encryptionKey: process.env.ENCRYPTION_KEY,

    // Verification settings
    batchSize: process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE, 10) : 50,
    delayBetweenBatches: process.env.DELAY_BETWEEN_BATCHES
      ? parseInt(process.env.DELAY_BETWEEN_BATCHES, 10)
      : 1000,
    maxCharactersPerRun: process.env.MAX_CHARACTERS_PER_RUN
      ? parseInt(process.env.MAX_CHARACTERS_PER_RUN, 10)
      : 1000,
    verificationThresholdMinutes: process.env.VERIFICATION_THRESHOLD_MINUTES
      ? parseInt(process.env.VERIFICATION_THRESHOLD_MINUTES, 10)
      : 55,

    // Environment
    nodeEnv: process.env.NODE_ENV || 'production',
  };

  return ConfigSchema.parse(config);
}
