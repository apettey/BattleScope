import { getDatabaseConfigFromEnv } from '@battlescope/database';
import { getEventBusConfigFromEnv } from '@battlescope/events';

export interface Config {
  service: {
    name: string;
    port: number;
    env: string;
  };
  database: ReturnType<typeof getDatabaseConfigFromEnv>;
  eventBus: ReturnType<typeof getEventBusConfigFromEnv>;
  zkillboard: {
    redisqUrl: string;
    pollIntervalMs: number;
    maxRetries: number;
    retryDelayMs: number;
  };
}

export function getConfig(): Config {
  return {
    service: {
      name: 'ingestion',
      port: parseInt(process.env.PORT || '3001', 10),
      env: process.env.NODE_ENV || 'development',
    },
    database: getDatabaseConfigFromEnv(),
    eventBus: getEventBusConfigFromEnv(),
    zkillboard: {
      redisqUrl: process.env.ZKILL_REDISQ_URL || 'https://redisq.zkillboard.com/listen.php',
      pollIntervalMs: parseInt(process.env.ZKILL_POLL_INTERVAL_MS || '1000', 10),
      maxRetries: parseInt(process.env.ZKILL_MAX_RETRIES || '5', 10),
      retryDelayMs: parseInt(process.env.ZKILL_RETRY_DELAY_MS || '5000', 10),
    },
  };
}
