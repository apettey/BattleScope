export const config = {
  port: parseInt(process.env.PORT || '3003', 10),
  database: {
    host: process.env.DATABASE_HOST || 'battle-db',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    database: process.env.DATABASE_NAME || 'battle_db',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
    clientId: 'battle-service',
  },
};
