export const config = {
  port: parseInt(process.env.PORT || '3006', 10),
  services: {
    ingestion: process.env.INGESTION_SERVICE_URL || 'http://ingestion-service:3001',
    enrichment: process.env.ENRICHMENT_SERVICE_URL || 'http://enrichment-service:3002',
    battle: process.env.BATTLE_SERVICE_URL || 'http://battle-service:3003',
    search: process.env.SEARCH_SERVICE_URL || 'http://search-service:3004',
    notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3005',
  },
};
