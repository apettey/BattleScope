export const config = {
  port: parseInt(process.env.PORT || '3005', 10),
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
    clientId: 'notification-service',
  },
};
