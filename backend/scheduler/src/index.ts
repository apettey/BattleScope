import { pino } from 'pino';
import { startTelemetry, stopTelemetry } from '@battlescope/shared';

const logger = pino({ name: 'scheduler-service', level: process.env.LOG_LEVEL ?? 'info' });

export const start = async (): Promise<void> => {
  await startTelemetry();
  logger.info('Scheduler service bootstrap placeholder');

  const shutdown = async () => {
    logger.info('Shutting down scheduler service');
    await stopTelemetry();
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
};

const run = async () => {
  try {
    await start();
  } catch (error) {
    logger.error({ err: error }, 'Scheduler service failed to start');
    await stopTelemetry();
    process.exitCode = 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  void run();
}
