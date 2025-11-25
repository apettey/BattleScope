/**
 * BFF Service Configuration
 * Environment variables and service URLs
 */

export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '3006', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Backend service URLs
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://authentication:3007',
    battle: process.env.BATTLE_SERVICE_URL || 'http://battle:3003',
    ingestion: process.env.INGESTION_SERVICE_URL || 'http://ingestion:3001',
    search: process.env.SEARCH_SERVICE_URL || 'http://search:3004',
    notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification:3005',
  },

  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },

  // Cache configuration
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '300', 10), // 5 minutes default
    enabled: process.env.CACHE_ENABLED !== 'false',
  },

  // Request timeout
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10), // 30 seconds
};
