import pino from 'pino';

const logger = pino({ name: 'ingest-service', level: process.env.LOG_LEVEL ?? 'info' });

export const start = async (): Promise<void> => {
  logger.info('Ingest service bootstrap placeholder');
};

const run = async () => {
  try {
    await start();
  } catch (error) {
    logger.error({ err: error }, 'Ingest service failed to start');
    process.exitCode = 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  void run();
}
