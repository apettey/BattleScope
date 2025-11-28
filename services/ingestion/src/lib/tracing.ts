import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';
import { createLogger } from '@battlescope/logger';

const logger = createLogger({ serviceName: 'tracing' });

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK for distributed tracing
 *
 * This sets up:
 * - Automatic instrumentation for HTTP, Redis, PostgreSQL, Kafka via auto-instrumentations
 * - OTLP HTTP exporter for sending traces to a collector (Grafana Tempo, Jaeger, etc.)
 * - Service resource metadata
 */
export function initializeTracing(): NodeSDK | null {
  // Only initialize once
  if (sdk) {
    logger.warn('Tracing SDK already initialized');
    return sdk;
  }

  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://tempo:4318/v1/traces';
  const serviceName = process.env.OTEL_SERVICE_NAME || 'ingestion-service';
  const serviceVersion = process.env.OTEL_SERVICE_VERSION || '1.0.0';
  const tracingEnabled = process.env.OTEL_TRACING_ENABLED !== 'false';

  if (!tracingEnabled) {
    logger.info('Tracing is disabled via OTEL_TRACING_ENABLED=false');
    return null;
  }

  try {
    logger.info({
      msg: 'Initializing OpenTelemetry tracing',
      otlpEndpoint,
      serviceName,
      serviceVersion,
    });

    // Create OTLP exporter
    const traceExporter = new OTLPTraceExporter({
      url: otlpEndpoint,
    });

    // Create SDK - service name and version are set via environment variables
    sdk = new NodeSDK({
      traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Auto-instrument HTTP clients (axios)
          '@opentelemetry/instrumentation-http': {
            enabled: true,
          },
          // Auto-instrument Redis
          '@opentelemetry/instrumentation-ioredis': {
            enabled: true,
          },
          // Auto-instrument PostgreSQL
          '@opentelemetry/instrumentation-pg': {
            enabled: true,
          },
          // Auto-instrument Kafka
          '@opentelemetry/instrumentation-kafkajs': {
            enabled: true,
          },
        }),
      ],
    });

    // Start the SDK
    sdk.start();

    logger.info('OpenTelemetry tracing initialized successfully');

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down OpenTelemetry SDK');
      sdk
        ?.shutdown()
        .then(() => logger.info('OpenTelemetry SDK shut down successfully'))
        .catch((error) => logger.error('Error shutting down OpenTelemetry SDK', error));
    });

    return sdk;
  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry tracing', error);
    return null;
  }
}

/**
 * Get the configured tracer
 */
export function getTracer() {
  const serviceName = process.env.OTEL_SERVICE_NAME || 'ingestion-service';
  return trace.getTracer(serviceName, process.env.OTEL_SERVICE_VERSION || '1.0.0');
}

/**
 * Create a span and execute a function within its context
 * This is a helper for manual instrumentation
 *
 * @example
 * const result = await withSpan('pollZkillboard', async (span) => {
 *   span.setAttribute('package.count', packageCount);
 *   const killmails = await poller.poll();
 *   return killmails;
 * });
 */
export async function withSpan<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(spanName, {
    attributes,
  });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: any) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Get the active span from the current context
 * Useful for adding attributes to the current span
 */
export function getActiveSpan(): Span | undefined {
  return trace.getSpan(context.active());
}

/**
 * Set attributes on the active span
 */
export function setSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = getActiveSpan();
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }
}
