import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    host: process.env.DATABASE_HOST || 'ingestion-db',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    database: process.env.DATABASE_NAME || 'ingestion_db',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
    clientId: 'ingestion-service',
  },
  zkillboard: {
    redisqUrl: process.env.ZKILLBOARD_REDISQ_URL || 'https://zkillboard.com/api/redisq.php',
    historyUrl: process.env.ZKILLBOARD_HISTORY_URL || 'https://zkillboard.com/api/history',
  },
};
