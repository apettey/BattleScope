import os from 'node:os';
import { diag, DiagConsoleLogger, DiagLogLevel, metrics } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

type AwaitableNodeSdk = Promise<NodeSDK | undefined>;

const DEFAULT_EXPORT_INTERVAL_MS = 15000;

let sdk: NodeSDK | undefined;
let startup: AwaitableNodeSdk | null = null;
let telemetryEnabled = false;

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

const normalizeEndpoint = (endpoint: string): string => endpoint.replace(/\/+$/, '');

const buildSignalUrl = (endpoint: string, signal: 'traces' | 'metrics'): string =>
  `${normalizeEndpoint(endpoint)}/v1/${signal}`;

const parseHeaders = (value: string | undefined): Record<string, string> => {
  if (!value) {
    return {};
  }
  return value.split(',').reduce<Record<string, string>>((acc, pair) => {
    const [rawKey, rawVal = ''] = pair.split('=');
    const key = rawKey?.trim();
    if (key) {
      acc[key] = rawVal.trim();
    }
    return acc;
  }, {});
};

const getMetricInterval = (): number => {
  const raw = process.env.OTEL_METRIC_EXPORT_INTERVAL;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXPORT_INTERVAL_MS;
};

const registerProcessMetrics = (): void => {
  if (!telemetryEnabled) {
    return;
  }

  const meter = metrics.getMeter('battlescope.telemetry');
  const attributes = {
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'unknown',
  };

  const serviceUpGauge = meter.createObservableGauge('battlescope_service_up', {
    description: 'Reports 1 when the Battlescope service is running locally.',
  });
  serviceUpGauge.addCallback((observableResult) => {
    observableResult.observe(1, attributes);
  });

  const uptimeGauge = meter.createObservableGauge('battlescope_process_uptime_seconds', {
    description: 'Exposes Node.js process uptime to verify exporter health.',
  });
  uptimeGauge.addCallback((observableResult) => {
    observableResult.observe(process.uptime(), attributes);
  });
};

const createSdk = (
  endpoint: string,
  serviceName: string,
  headers: Record<string, string>,
  metricReader: PeriodicExportingMetricReader,
): NodeSDK => {
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'battlescope',
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]:
      process.env.SERVICE_INSTANCE_ID ?? os.hostname(),
    [SemanticResourceAttributes.SERVICE_VERSION]:
      process.env.SERVICE_VERSION ?? process.env.npm_package_version ?? '0.0.0',
  });

  return new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: buildSignalUrl(endpoint, 'traces'),
      headers,
    }),
    // @ts-expect-error - MetricReader type mismatch due to pnpm dependency hoisting
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable instrumentations that might cause issues or are not needed
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
      }),
    ],
  });
};

const createMetricReader = (
  endpoint: string,
  headers: Record<string, string>,
): PeriodicExportingMetricReader =>
  new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: buildSignalUrl(endpoint, 'metrics'),
      headers,
    }),
    exportIntervalMillis: getMetricInterval(),
  });

export const startTelemetry = async (): AwaitableNodeSdk => {
  if (process.env.NODE_ENV === 'test') {
    return undefined;
  }

  if (sdk) {
    return sdk;
  }

  if (startup) {
    return startup;
  }

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const serviceName = process.env.OTEL_SERVICE_NAME;

  if (!endpoint || !serviceName) {
    diag.warn(
      'Telemetry disabled: missing OTEL_EXPORTER_OTLP_ENDPOINT or OTEL_SERVICE_NAME environment variables.',
    );
    telemetryEnabled = false;
    return undefined;
  }

  telemetryEnabled = true;
  const headers = parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);
  const metricReader = createMetricReader(endpoint, headers);
  const telemetrySdk = createSdk(endpoint, serviceName, headers, metricReader);

  const startPromise: AwaitableNodeSdk = (async () => {
    try {
      telemetrySdk.start();
      sdk = telemetrySdk;
      registerProcessMetrics();
      return sdk;
    } catch (error) {
      diag.error('Failed to start telemetry SDK', error);
      telemetryEnabled = false;
      return undefined;
    } finally {
      startup = null;
    }
  })();

  startup = startPromise;
  return startPromise;
};

export const stopTelemetry = async (): Promise<void> => {
  if (!sdk) {
    return;
  }

  try {
    await sdk.shutdown();
  } catch (error) {
    diag.error('Failed to shutdown telemetry SDK', error);
  } finally {
    sdk = undefined;
    telemetryEnabled = false;
  }
};
