import { metrics, ValueType } from '@opentelemetry/api';

const meter = metrics.getMeter('battlescope.esi-client');

export const requestCounter = meter.createCounter('battlescope_esi_requests_total', {
  valueType: ValueType.INT,
  description:
    'Counts ESI HTTP requests grouped by operation, method, status class, and result (success/error).',
});

export const requestDurationHistogram = meter.createHistogram(
  'battlescope_esi_request_duration_seconds',
  {
    description: 'Records latency for ESI HTTP requests.',
    unit: 's',
  },
);

export const cacheHitCounter = meter.createCounter('battlescope_esi_cache_hits_total', {
  valueType: ValueType.INT,
  description: 'Counts cache hits for ESI client lookups grouped by operation.',
});

export const cacheMissCounter = meter.createCounter('battlescope_esi_cache_misses_total', {
  valueType: ValueType.INT,
  description: 'Counts cache misses for ESI client lookups grouped by operation.',
});

export const cacheDegradedCounter = meter.createCounter('battlescope_esi_cache_degraded_total', {
  valueType: ValueType.INT,
  description: 'Counts occurrences where the primary cache backend was unavailable.',
});
