# Observability Standards - BattleScope V3

**Version**: 1.0
**Date**: 2025-11-25

---

## Overview

This document defines comprehensive observability standards for all BattleScope V3 services, including metrics, SLOs, logging, tracing, and alerting requirements.

---

## Table of Contents

1. [Metrics Standards](#metrics-standards)
2. [Service Level Objectives (SLOs)](#service-level-objectives-slos)
3. [Logging Standards](#logging-standards)
4. [Distributed Tracing](#distributed-tracing)
5. [Alerting Rules](#alerting-rules)
6. [Service-Specific Observability](#service-specific-observability)

---

## Metrics Standards

### General Principles

- **All metrics use Prometheus format**
- **Metric naming convention**: `<service>_<subsystem>_<metric>_<unit>`
- **Labels**: Use labels for dimensions, not metric names
- **Cardinality**: Keep label cardinality low (<1000 unique combinations per metric)

### Standard Metrics (All Services)

Every service MUST expose these baseline metrics:

#### HTTP Server Metrics

```prometheus
# Request duration histogram
http_request_duration_seconds{service="<service>", method="<method>", route="<route>", status_code="<code>"}

# Request count
http_requests_total{service="<service>", method="<method>", route="<route>", status_code="<code>"}

# Active requests gauge
http_requests_active{service="<service>", route="<route>"}

# Request size histogram
http_request_size_bytes{service="<service>", route="<route>"}

# Response size histogram
http_response_size_bytes{service="<service>", route="<route>"}
```

**Histogram buckets** (duration): `[.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10]`

#### Database Metrics

```prometheus
# Query duration histogram
db_query_duration_seconds{service="<service>", operation="<select|insert|update|delete>", table="<table>"}

# Query count
db_queries_total{service="<service>", operation="<operation>", table="<table>", status="<success|error>"}

# Active connections gauge
db_connections_active{service="<service>"}

# Connection pool metrics
db_connection_pool_size{service="<service>", state="<idle|active|waiting>"}

# Transaction duration
db_transaction_duration_seconds{service="<service>"}
```

#### Kafka Consumer/Producer Metrics

```prometheus
# Messages consumed
kafka_messages_consumed_total{service="<service>", topic="<topic>", consumer_group="<group>"}

# Messages produced
kafka_messages_produced_total{service="<service>", topic="<topic>", status="<success|error>"}

# Consumer lag (CRITICAL)
kafka_consumer_lag_seconds{service="<service>", topic="<topic>", partition="<partition>"}

# Processing duration
kafka_message_processing_duration_seconds{service="<service>", topic="<topic>", handler="<handler>"}

# Processing errors
kafka_message_processing_errors_total{service="<service>", topic="<topic>", error_type="<type>"}

# Batch size
kafka_consumer_batch_size{service="<service>", topic="<topic>"}
```

#### Cache Metrics (Redis)

```prometheus
# Cache operations
cache_operations_total{service="<service>", operation="<get|set|del>", result="<hit|miss|error>"}

# Cache hit rate (derived)
cache_hit_rate{service="<service>"} = rate(cache_operations_total{result="hit"}) / rate(cache_operations_total{operation="get"})

# Cache operation duration
cache_operation_duration_seconds{service="<service>", operation="<operation>"}

# Cache size gauge
cache_size_bytes{service="<service>"}

# Cache evictions
cache_evictions_total{service="<service>", reason="<ttl|maxmemory|explicit>"}
```

#### Application Health Metrics

```prometheus
# Service uptime
service_uptime_seconds{service="<service>"}

# Process metrics
process_cpu_seconds_total{service="<service>"}
process_resident_memory_bytes{service="<service>"}
process_open_fds{service="<service>"}

# Node.js specific
nodejs_heap_size_total_bytes{service="<service>"}
nodejs_heap_size_used_bytes{service="<service>"}
nodejs_eventloop_lag_seconds{service="<service>"}
nodejs_gc_duration_seconds{service="<service>", gc_type="<type>"}
```

---

## Service Level Objectives (SLOs)

### SLO Framework

All services define SLOs across three dimensions:
1. **Availability** - Service is responding to requests
2. **Latency** - Requests complete within acceptable time
3. **Quality** - Requests complete successfully without errors

### SLO Targets

| Service | Availability | Latency (p95) | Error Rate | Data Freshness |
|---------|-------------|---------------|------------|----------------|
| **Ingestion** | 99.5% | N/A (async) | <1% | Real-time |
| **Enrichment** | 99.5% | N/A (async) | <2% | <30s lag |
| **Battle** | 99.9% | <500ms | <0.5% | <60s lag |
| **Search** | 99.9% | <100ms | <0.5% | <5min lag |
| **Notification** | 99.5% | <100ms (WS delivery) | <1% | <10s lag |
| **Frontend BFF** | 99.9% | <200ms (cached), <1s (uncached) | <1% | N/A |

### SLO Metrics

#### Availability SLO

```prometheus
# Service availability (1 = healthy, 0 = unhealthy)
service_available{service="<service>"}

# SLO: Percentage of time service is available over 30-day window
availability_slo = avg_over_time(service_available[30d]) >= 0.999
```

#### Latency SLO

```prometheus
# Request duration p95
histogram_quantile(0.95, http_request_duration_seconds{service="<service>"}) < 0.5

# SLO: 95% of requests complete within latency target over 7-day window
latency_slo = histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[7d])) < <target>
```

#### Error Rate SLO

```prometheus
# Error rate
error_rate = sum(rate(http_requests_total{service="<service>", status_code=~"5.."}[5m]))
           / sum(rate(http_requests_total{service="<service>"}[5m]))

# SLO: Error rate below threshold over 7-day window
error_rate_slo = error_rate < 0.005  # 0.5%
```

#### Data Freshness SLO (Event-Driven Services)

```prometheus
# Kafka consumer lag in seconds
kafka_consumer_lag_seconds{service="<service>", topic="<topic>"}

# SLO: Consumer lag below threshold
freshness_slo = kafka_consumer_lag_seconds < 60  # 1 minute
```

---

## Logging Standards

### Log Levels

Use standard log levels appropriately:

| Level | Usage | Examples |
|-------|-------|----------|
| **ERROR** | Errors that require immediate attention | Database connection lost, Kafka publish failed, External API errors |
| **WARN** | Potentially harmful situations | High queue lag, Cache miss rate high, Circuit breaker open |
| **INFO** | Informational messages about normal operations | Service started, Battle created, Killmail enriched |
| **DEBUG** | Detailed information for debugging | Function entry/exit, Query details, Cache lookups |
| **TRACE** | Very detailed diagnostic information | Full request/response payloads, Variable values |

### Structured Logging Format

All logs MUST be structured JSON with consistent fields:

```json
{
  "timestamp": "2025-11-25T10:00:00.123Z",
  "level": "info",
  "service": "battle-service",
  "version": "1.2.3",
  "environment": "production",
  "trace_id": "a1b2c3d4e5f6",
  "span_id": "f6e5d4c3b2a1",
  "file": "src/services/clustering.ts",
  "line": 125,
  "function": "clusterKillmail",
  "message": "Battle created successfully",
  "context": {
    "battle_id": "uuid",
    "killmail_id": 123456789,
    "proximity_score": 0.87,
    "candidates_evaluated": 5,
    "duration_ms": 125
  },
  "user_id": "uuid",
  "request_id": "uuid"
}
```

### Required Log Fields

**Mandatory for all logs**:
- `timestamp` - ISO 8601 format with milliseconds
- `level` - Log level
- `service` - Service name
- `version` - Service version (from package.json or git commit)
- `environment` - production, staging, development
- `message` - Human-readable message
- `file` - Source file path
- `line` - Line number
- `function` - Function/method name

**Mandatory for request-scoped logs**:
- `trace_id` - Distributed trace ID (from OpenTelemetry)
- `span_id` - Span ID
- `request_id` - Unique request ID
- `user_id` - Authenticated user ID (if applicable)

**Optional context fields**:
- `error` - Error object with stack trace (for ERROR level)
- `duration_ms` - Operation duration
- `context` - Operation-specific data (battle_id, killmail_id, etc.)

### What to Log (by Operation)

#### Database Operations

```typescript
// SUCCESS (DEBUG level)
logger.debug({
  operation: 'db_query',
  table: 'battles',
  query_type: 'select',
  duration_ms: 45,
  rows_returned: 25
}, 'Database query completed');

// ERROR (ERROR level)
logger.error({
  operation: 'db_query',
  table: 'battles',
  query_type: 'insert',
  error: {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: error.code
  }
}, 'Database query failed');
```

#### Kafka Events

```typescript
// EVENT CONSUMED (INFO level)
logger.info({
  operation: 'kafka_consume',
  topic: 'killmail.enriched',
  partition: 3,
  offset: 123456,
  event_id: event.eventId,
  event_type: event.eventType,
  lag_ms: Date.now() - new Date(event.timestamp).getTime()
}, 'Event consumed from Kafka');

// EVENT PROCESSED (INFO level)
logger.info({
  operation: 'event_processed',
  event_id: event.eventId,
  event_type: 'killmail.enriched',
  handler: 'BattleClusterer',
  duration_ms: 125,
  result: 'battle_created',
  battle_id: 'uuid'
}, 'Event processed successfully');

// PROCESSING ERROR (ERROR level)
logger.error({
  operation: 'event_processing',
  event_id: event.eventId,
  event_type: 'killmail.enriched',
  handler: 'BattleClusterer',
  retry_count: 2,
  will_retry: true,
  error: errorObject
}, 'Event processing failed, will retry');
```

#### HTTP Requests

```typescript
// REQUEST START (DEBUG level)
logger.debug({
  operation: 'http_request_start',
  method: 'GET',
  path: '/api/battles/:id',
  params: { id: 'uuid' },
  query: { includeParticipants: true },
  user_id: 'uuid',
  user_agent: 'Mozilla/5.0...'
}, 'HTTP request received');

// REQUEST COMPLETE (INFO level)
logger.info({
  operation: 'http_request_complete',
  method: 'GET',
  path: '/api/battles/:id',
  status_code: 200,
  duration_ms: 45,
  response_size_bytes: 15234,
  cache_hit: true
}, 'HTTP request completed');

// REQUEST ERROR (ERROR level)
logger.error({
  operation: 'http_request_error',
  method: 'GET',
  path: '/api/battles/:id',
  status_code: 500,
  duration_ms: 125,
  error: errorObject
}, 'HTTP request failed');
```

#### Business Operations

```typescript
// BATTLE CREATED (INFO level)
logger.info({
  operation: 'battle_created',
  battle_id: 'uuid',
  killmail_id: 123456789,
  system_id: 30000142,
  system_name: 'Jita',
  proximity_score: 0.87,
  candidates_evaluated: 5,
  initial_pilots: 25,
  duration_ms: 125
}, 'Battle created from killmail');

// KILLMAIL ENRICHED (INFO level)
logger.info({
  operation: 'killmail_enriched',
  killmail_id: 123456789,
  esi_cache_hits: 45,
  esi_cache_misses: 5,
  esi_cache_hit_rate: 0.9,
  duration_ms: 250
}, 'Killmail enriched successfully');

// HISTORICAL JOB PROGRESS (INFO level - logged every 100 killmails)
logger.info({
  operation: 'historical_job_progress',
  job_id: 'uuid',
  current_date: '2025-01-15',
  processed_dates: 15,
  total_dates: 31,
  killmails_processed: 125000,
  accepted_killmails: 45000,
  percent_complete: 48.4,
  current_rate: 1250
}, 'Historical ingestion job progress');
```

#### External API Calls

```typescript
// API CALL SUCCESS (DEBUG level)
logger.debug({
  operation: 'external_api_call',
  api: 'esi',
  endpoint: '/characters/123456/',
  method: 'GET',
  status_code: 200,
  duration_ms: 125,
  cache_hit: false,
  rate_limit_remaining: 150
}, 'ESI API call completed');

// API CALL ERROR (WARN for retryable, ERROR for fatal)
logger.warn({
  operation: 'external_api_call',
  api: 'esi',
  endpoint: '/characters/123456/',
  method: 'GET',
  status_code: 429,
  retry_after_seconds: 60,
  retry_count: 1,
  will_retry: true
}, 'ESI API rate limited, will retry');
```

### Log Sampling

For high-volume operations (>1000 ops/sec), implement sampling:

```typescript
// Sample 1% of debug logs
if (Math.random() < 0.01 || level === 'error' || level === 'warn') {
  logger.log(level, message, context);
}
```

---

## Distributed Tracing

### Tracing Standards

- **Use OpenTelemetry** for all tracing
- **Trace 100% of requests** (use sampling in storage, not collection)
- **Propagate context** across service boundaries (HTTP headers, Kafka message headers)

### Trace Context Propagation

#### HTTP Headers

```
traceparent: 00-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6-q7r8s9t0u1v2w3x4-01
tracestate: battlescope=t=1700000000
```

#### Kafka Message Headers

```json
{
  "headers": {
    "traceparent": "00-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6-q7r8s9t0u1v2w3x4-01",
    "tracestate": "battlescope=t=1700000000"
  }
}
```

### Span Standards

#### Span Naming Convention

Format: `<service>.<operation>`

Examples:
- `battle-service.cluster_killmail`
- `enrichment-service.fetch_esi_names`
- `search-service.index_battle`

#### Required Span Attributes

```typescript
{
  // Service identification
  "service.name": "battle-service",
  "service.version": "1.2.3",
  "service.environment": "production",

  // Operation details
  "operation.name": "cluster_killmail",
  "operation.duration_ms": 125,

  // Business context
  "battle.id": "uuid",
  "killmail.id": "123456789",
  "killmail.system_id": "30000142",

  // HTTP context (if applicable)
  "http.method": "GET",
  "http.route": "/api/battles/:id",
  "http.status_code": 200,

  // Database context (if applicable)
  "db.system": "postgresql",
  "db.operation": "select",
  "db.table": "battles",

  // Kafka context (if applicable)
  "messaging.system": "kafka",
  "messaging.destination": "killmail.enriched",
  "messaging.operation": "receive",

  // Error context (if error)
  "error": true,
  "error.type": "DatabaseConnectionError",
  "error.message": "Connection timeout"
}
```

### Critical Traces to Implement

1. **End-to-End Killmail Processing**:
   - Span: Ingestion → Enrichment → Battle → Search → Notification
   - Should show complete pipeline latency

2. **Battle Query Flow**:
   - Span: Frontend BFF → Battle Service → Database
   - Should show cache hits/misses

3. **Historical Ingestion Job**:
   - Span: Job creation → Date processing → Event publishing
   - Should show batch processing performance

---

## Alerting Rules

### Critical Alerts (Page immediately)

#### Service Down

```yaml
- alert: ServiceDown
  expr: up{job=~".*-service"} == 0
  for: 1m
  severity: critical
  annotations:
    summary: "Service {{ $labels.job }} is down"
    description: "{{ $labels.job }} has been down for more than 1 minute"
```

#### High Error Rate

```yaml
- alert: HighErrorRate
  expr: |
    sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (service)
    /
    sum(rate(http_requests_total[5m])) by (service)
    > 0.05
  for: 5m
  severity: critical
  annotations:
    summary: "High error rate on {{ $labels.service }}"
    description: "Error rate is {{ $value | humanizePercentage }} (threshold: 5%)"
```

#### Database Connection Pool Exhausted

```yaml
- alert: DatabaseConnectionPoolExhausted
  expr: db_connection_pool_size{state="waiting"} > 0
  for: 2m
  severity: critical
  annotations:
    summary: "Database connection pool exhausted on {{ $labels.service }}"
    description: "{{ $value }} connections waiting for pool"
```

#### Kafka Consumer Lag Critical

```yaml
- alert: KafkaConsumerLagCritical
  expr: kafka_consumer_lag_seconds > 300
  for: 5m
  severity: critical
  annotations:
    summary: "Critical Kafka consumer lag on {{ $labels.service }}"
    description: "Consumer lag is {{ $value }}s on topic {{ $labels.topic }} (threshold: 300s)"
```

### Warning Alerts (Notify, no page)

#### High Latency

```yaml
- alert: HighLatency
  expr: |
    histogram_quantile(0.95,
      rate(http_request_duration_seconds_bucket[5m])
    ) > 1
  for: 10m
  severity: warning
  annotations:
    summary: "High latency on {{ $labels.service }}"
    description: "P95 latency is {{ $value }}s (threshold: 1s)"
```

#### Low Cache Hit Rate

```yaml
- alert: LowCacheHitRate
  expr: |
    sum(rate(cache_operations_total{result="hit"}[5m])) by (service)
    /
    sum(rate(cache_operations_total{operation="get"}[5m])) by (service)
    < 0.7
  for: 15m
  severity: warning
  annotations:
    summary: "Low cache hit rate on {{ $labels.service }}"
    description: "Cache hit rate is {{ $value | humanizePercentage }} (threshold: 70%)"
```

#### Event Loop Lag

```yaml
- alert: NodeJSEventLoopLag
  expr: nodejs_eventloop_lag_seconds > 0.1
  for: 5m
  severity: warning
  annotations:
    summary: "High event loop lag on {{ $labels.service }}"
    description: "Event loop lag is {{ $value }}s (threshold: 100ms)"
```

#### Memory Usage High

```yaml
- alert: MemoryUsageHigh
  expr: |
    process_resident_memory_bytes /
    container_spec_memory_limit_bytes
    > 0.85
  for: 10m
  severity: warning
  annotations:
    summary: "High memory usage on {{ $labels.service }}"
    description: "Memory usage is {{ $value | humanizePercentage }} (threshold: 85%)"
```

---

## Service-Specific Observability

### Ingestion Service

**Critical Metrics**:
```prometheus
# RedisQ polling health
ingestion_redisq_consecutive_failures

# Historical job stuck
ingestion_historical_job_duration_seconds > 86400

# Data retention cleanup failures
ingestion_retention_cleanup_failures_total
```

**Key Logs**:
- Every killmail accepted/rejected (INFO)
- Historical job progress every 100 killmails (INFO)
- Daily verification results (INFO)
- Retention cleanup results (INFO)

### Enrichment Service

**Critical Metrics**:
```prometheus
# ESI API errors
enrichment_esi_errors_total{status_code="5xx"}

# Cache hit rate too low
enrichment_esi_cache_hit_rate < 0.7

# Enrichment backlog
enrichment_queue_depth > 1000
```

**Key Logs**:
- Every killmail enriched (INFO)
- ESI cache hits/misses per batch (DEBUG)
- ESI rate limit hits (WARN)
- Enrichment failures with retry info (ERROR)

### Battle Service

**Critical Metrics**:
```prometheus
# Clustering performance degradation
battle_clustering_duration_seconds > 1.0

# Battle creation rate drop
rate(battle_battles_created_total[5m]) < 0.5

# Re-clustering job stuck
battle_reclustering_job_duration_seconds > 3600
```

**Key Logs**:
- Every battle created/updated (INFO)
- Clustering scores and decisions (DEBUG)
- Re-clustering triggers and results (INFO)
- Team assignment changes (DEBUG)

### Search Service

**Critical Metrics**:
```prometheus
# Typesense cluster unhealthy
search_typesense_nodes_healthy < 3

# Indexing lag
search_indexing_lag_seconds > 300

# Query latency spike
histogram_quantile(0.95, search_query_duration_seconds_bucket) > 0.1
```

**Key Logs**:
- Every battle indexed (INFO)
- Search queries with performance (DEBUG)
- Facet aggregations (DEBUG)
- Typesense errors (ERROR)

### Notification Service

**Critical Metrics**:
```prometheus
# WebSocket connection drops
rate(notification_ws_disconnections_total[5m]) > 10

# Notification delivery lag
notification_delivery_lag_seconds > 10

# Pending queue buildup
notification_pending_queue_depth > 100
```

**Key Logs**:
- WebSocket connections/disconnections (INFO)
- Every notification sent (DEBUG)
- Subscription matches (DEBUG)
- Notification filtering decisions (DEBUG)
- Queue overflow warnings (WARN)

### Frontend BFF

**Critical Metrics**:
```prometheus
# Backend service circuit breaker open
bff_circuit_breaker_state{state="open"} == 1

# High backend call failures
rate(bff_backend_calls_total{status="error"}[5m]) > 0.1

# Cache ineffective
bff_cache_hit_rate < 0.6
```

**Key Logs**:
- Aggregation requests (INFO)
- Backend service calls and responses (DEBUG)
- Cache hits/misses (DEBUG)
- Circuit breaker state changes (WARN)
- Partial failure handling (WARN)

---

## Dashboards

Each service MUST have a Grafana dashboard with the following panels:

### Overview Dashboard (Per Service)

1. **Traffic Panel**: Request rate, active requests
2. **Latency Panel**: P50, P95, P99 latency
3. **Error Panel**: Error rate, error count by type
4. **SLO Panel**: Availability, latency SLO, error rate SLO
5. **Resource Panel**: CPU, memory, connections

### Detailed Dashboard (Per Service)

6. **Database Panel**: Query rate, query duration, connection pool
7. **Kafka Panel**: Consumer lag, messages consumed/produced, processing duration
8. **Cache Panel**: Hit rate, operation duration, evictions
9. **Business Metrics**: Service-specific KPIs (battles created, killmails enriched, etc.)

---

## Implementation Checklist

For each service, ensure:

- [ ] All standard metrics exposed at `/metrics` endpoint
- [ ] Structured JSON logging implemented
- [ ] Log levels used appropriately (ERROR for errors, INFO for operations, DEBUG for details)
- [ ] File, line, function automatically added to all logs
- [ ] Trace context propagated in HTTP headers and Kafka messages
- [ ] OpenTelemetry spans created for all operations >10ms
- [ ] Critical and warning alerts defined in Prometheus rules
- [ ] Grafana dashboard created with all required panels
- [ ] SLOs defined and tracked
- [ ] On-call runbook references log queries and metric queries

---

## References

- [OpenTelemetry Specification](https://opentelemetry.io/docs/reference/specification/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [Google SRE Book - SLIs, SLOs, and SLAs](https://sre.google/sre-book/service-level-objectives/)
- [The Twelve-Factor App - Logs](https://12factor.net/logs)
