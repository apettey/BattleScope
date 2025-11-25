import pino from 'pino';

export interface LoggerOptions {
  serviceName: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger(options: LoggerOptions) {
  const { serviceName, level = 'info', pretty = process.env.NODE_ENV !== 'production' } = options;

  const pinoConfig: pino.LoggerOptions = {
    name: serviceName,
    level: process.env.LOG_LEVEL || level,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (pretty) {
    return pino(
      pinoConfig,
      pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      })
    );
  }

  return pino(pinoConfig);
}

export type Logger = ReturnType<typeof createLogger>;
