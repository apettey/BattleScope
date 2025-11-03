import pino from 'pino';

const logger = pino({ name: 'enrichment-worker', level: process.env.LOG_LEVEL ?? 'info' });

export const start = async (): Promise<void> => {
  logger.info('Enrichment worker bootstrap placeholder');
};

const run = async () => {
  try {
    await start();
  } catch (error) {
    logger.error({ err: error }, 'Enrichment worker failed to start');
    process.exitCode = 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  void run();
}
