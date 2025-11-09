import type { PinoLoggerOptions } from 'fastify/types/logger';
import type pino from 'pino';

/**
 * Extract file path and class/function name from stack trace
 */
function getCallerInfo(): { file: string; package: string; caller?: string } {
  const originalPrepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = (_, stack) => stack;

  const err = new Error();
  const stack = err.stack as unknown as NodeJS.CallSite[];

  Error.prepareStackTrace = originalPrepareStackTrace;

  // Skip the first few frames (this function, the mixin, pino internals)
  // Find the first frame that's not from pino or this logger file
  for (let i = 0; i < stack.length; i++) {
    const fileName = stack[i].getFileName();
    if (
      fileName &&
      !fileName.includes('node_modules/pino') &&
      !fileName.includes('logger.ts') &&
      !fileName.includes('node:internal')
    ) {
      const functionName = stack[i].getFunctionName();
      const methodName = stack[i].getMethodName();

      // Extract relative path from workspace
      let file = fileName.replace(/^.*\/workspace\//, '');
      // Or from project root
      file = file.replace(/^.*\/battle-monitor\//, '');

      // Determine package from file path
      let pkg = 'unknown';
      if (file.startsWith('backend/api/')) {
        pkg = 'api';
      } else if (file.startsWith('backend/ingest/')) {
        pkg = 'ingest';
      } else if (file.startsWith('backend/enrichment/')) {
        pkg = 'enrichment';
      } else if (file.startsWith('backend/clusterer/')) {
        pkg = 'clusterer';
      } else if (file.startsWith('backend/scheduler/')) {
        pkg = 'scheduler';
      } else if (file.startsWith('packages/auth/')) {
        pkg = 'auth';
      } else if (file.startsWith('packages/database/')) {
        pkg = 'database';
      } else if (file.startsWith('packages/esi-client/')) {
        pkg = 'esi-client';
      } else if (file.startsWith('packages/battle-reports/')) {
        pkg = 'battle-reports';
      } else if (file.startsWith('packages/battle-intel/')) {
        pkg = 'battle-intel';
      } else if (file.startsWith('packages/shared/')) {
        pkg = 'shared';
      } else if (file.startsWith('packages/')) {
        const match = file.match(/^packages\/([^/]+)\//);
        if (match) {
          pkg = match[1];
        }
      }

      return {
        file,
        package: pkg,
        caller: methodName || functionName || undefined,
      };
    }
  }

  return { file: 'unknown', package: 'unknown' };
}

/**
 * Create Pino logger configuration with automatic file/class tracking
 * Works with both Fastify and standalone Pino
 */
export function createLoggerConfig(): PinoLoggerOptions | pino.LoggerOptions {
  return {
    level: process.env.LOG_LEVEL || 'info',
    // Add caller information to every log
    mixin() {
      return getCallerInfo();
    },
    // Serialize errors properly
    serializers: {
      error: (err: Error) => ({
        type: err.name,
        message: err.message,
        stack: err.stack,
      }),
      req: (req: any) => ({
        method: req.method,
        url: req.url,
        headers: req.headers,
        remoteAddress: req.ip,
      }),
      res: (res: any) => ({
        statusCode: res.statusCode,
      }),
    },
    // Format timestamps consistently
    timestamp: () => `,"time":${Date.now()}`,
  };
}
