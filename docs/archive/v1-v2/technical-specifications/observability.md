# Observability Strategy

**Version**: 1.0
**Last Updated**: 2025-11-12
**Status**: Production

---

## Table of Contents

1. [Overview](#overview)
2. [Logging Strategy](#logging-strategy)
3. [Metrics Strategy](#metrics-strategy)
4. [Tracing Strategy](#tracing-strategy)
5. [Dashboards](#dashboards)
6. [Alert Rules](#alert-rules)
7. [Troubleshooting Workflows](#troubleshooting-workflows)

---

## Overview

BattleScope implements comprehensive observability using the "three pillars" approach: **Logging**, **Metrics**, and **Tracing**. All observability data is collected, correlated, and visualized through a unified Grafana interface.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BattleScope Services                        │
│  (API, Ingest, Enrichment, Clusterer, Search Sync, etc.)        │
└────────────┬──────────────────┬───────────────────┬─────────────┘
             │                  │                   │
        Logs │                  │ Metrics           │ Traces
     (stdout)│                  │ (OTLP)            │ (OTLP)
             │                  │                   │
             ▼                  ▼                   ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │   Promtail   │   │     OTEL     │   │     OTEL     │
    │  (DaemonSet) │   │  Collector   │   │  Collector   │
    └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
           │                  │                   │
           │                  │                   │
           ▼                  ▼                   ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │     Loki     │   │  Prometheus  │   │    Jaeger    │
    │ (Log Store)  │   │  (Metrics)   │   │  (Traces)    │
    └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
           │                  │                   │
           └──────────────────┴───────────────────┘
                              │
                              ▼
                      ┌──────────────┐
                      │   Grafana    │
                      │  (Unified    │
                      │   Observe)   │
                      └──────────────┘
```

### Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Logging** | Pino + Loki + Promtail | 8.17.0 / 2.9+ | Structured JSON logs |
| **Metrics** | OpenTelemetry + Prometheus | 1.9.0 / 2.45+ | Time-series metrics |
| **Tracing** | OpenTelemetry + Jaeger | 1.9.0 / 1.50+ | Distributed tracing |
| **Visualization** | Grafana | 10+ | Unified dashboards |
| **Collection** | OTEL Collector | 0.88+ | Telemetry pipeline |

---

## Logging Strategy

### Log Format

**Standard**: Structured JSON logs using Pino

**Base Fields** (all logs):
```json
{
  "level": 30,
  "time": 1699876543210,
  "pid": 1234,
  "hostname": "api-7d8f9-abcd",
  "file": "backend/api/src/routes/battles.ts",
  "package": "api",
  "caller": "listBattles",
  "msg": "Fetching battles with filters"
}
```

**Context Fields** (added per log):
```json
{
  "requestId": "req_abc123",
  "userId": "550e8400-e29b...",
  "duration": 142,
  "status": 200,
  "method": "GET",
  "path": "/battles",
  "query": { "space_type": "jspace", "limit": 20 }
}
```

### Log Levels

**Level Guide**:

| Level | Value | When to Use | Examples |
|-------|-------|-------------|----------|
| **fatal** | 60 | Application crash | Database connection lost, unrecoverable error |
| **error** | 50 | Operation failed | API request failed, database query error |
| **warn** | 40 | Unexpected but handled | Slow query, cache miss, retry triggered |
| **info** | 30 | Normal operation | Request handled, job completed, service started |
| **debug** | 20 | Development info | Function called, variable values, logic branches |
| **trace** | 10 | Verbose debugging | Loop iterations, detailed state changes |

**Production Log Levels**:
- Default: `info` (30)
- Database queries: `warn` (40) if > 1s
- External API calls: `info` (30)
- Authentication: `info` (30) for success, `warn` (40) for failures
- Authorization: `warn` (40) for denials

### Collection Pipeline

**Promtail Configuration** (`infra/k8s/promtail-daemonset.yaml`):
- Runs as DaemonSet on all nodes
- Tails container logs from `/var/log/pods`
- Adds Kubernetes metadata (pod, namespace, labels)
- Forwards to Loki via HTTP

**Loki Configuration** (`infra/k8s/loki-deployment.yaml`):
- Retention: 7 days (configurable)
- Chunk target size: 1.5MB
- Max query length: 12h
- Compression: gzip
- Storage: Local volume (persistent)

### Log Retention Policy

| Log Type | Retention | Rationale |
|----------|-----------|-----------|
| **Application logs** | 7 days | Troubleshooting recent issues |
| **Error logs** | 14 days | Extended error analysis |
| **Audit logs** | 90 days | Compliance and security |
| **Access logs** | 3 days | Performance analysis |

**Archival Strategy**:
- Export audit logs to S3-compatible storage after 90 days
- Compress archived logs with gzip
- Retention in archive: 1 year

### Query Patterns

**LogQL Examples**:

```logql
# All API errors in last hour
{app="api"} | json | level >= 50 | __error__=""

# Slow queries (>1s)
{app="api"} | json | duration > 1000

# Authentication failures
{app="api"} | json | caller="authenticate" | status != 200

# Errors for specific request
{app="api"} | json | requestId="req_abc123" | level >= 50

# Battle clustering errors
{app="clusterer"} | json | level = 50 | msg =~ "cluster"

# Top error messages (last 24h)
topk(10,
  sum by (msg) (
    count_over_time({app="api"} | json | level >= 50 [24h])
  )
)
```

### Structured Logging Best Practices

**DO**:
```typescript
logger.info({ userId, battleId, duration: endTime - startTime },
  'Battle details fetched successfully');
```

**DON'T**:
```typescript
logger.info(`Battle ${battleId} fetched by user ${userId} in ${duration}ms`);
```

**Context Binding**:
```typescript
// Bind context at request level
const reqLogger = logger.child({ requestId: req.id, userId: req.user?.id });

// Use throughout request lifecycle
reqLogger.info('Processing battle query');
reqLogger.warn({ cacheHit: false }, 'Cache miss, querying database');
reqLogger.info({ results: battles.length }, 'Query completed');
```

---

## Metrics Strategy

### Metric Naming Conventions

**Format**: `<namespace>_<subsystem>_<metric>_<unit>`

**Examples**:
- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - HTTP request duration
- `database_query_duration_seconds` - Database query duration
- `battle_clustering_lag_seconds` - Battle clustering lag
- `killmail_ingestion_total` - Total killmails ingested

### Standard Metrics (Auto-Instrumented)

**HTTP Metrics** (via OpenTelemetry Fastify plugin):
```
http_requests_total{method, route, status}
http_request_duration_seconds{method, route, status}
http_request_size_bytes{method, route}
http_response_size_bytes{method, route}
```

**Database Metrics** (via Kysely plugin):
```
database_queries_total{operation, table}
database_query_duration_seconds{operation, table}
database_connections_active
database_connections_idle
database_query_errors_total{operation, table, error_type}
```

**Redis Metrics** (via ioredis plugin):
```
redis_commands_total{command}
redis_command_duration_seconds{command}
redis_connections_active
redis_errors_total{command, error_type}
```

### Custom Metrics

**Application-Specific**:

```typescript
// Counter: Total killmails ingested
const killmailsIngested = new promClient.Counter({
  name: 'killmail_ingestion_total',
  help: 'Total number of killmails ingested',
  labelNames: ['space_type', 'accepted']
});

// Histogram: Battle clustering duration
const clusteringDuration = new promClient.Histogram({
  name: 'battle_clustering_duration_seconds',
  help: 'Time to cluster killmails into battles',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});

// Gauge: Current queue depth
const queueDepth = new promClient.Gauge({
  name: 'enrichment_queue_depth',
  help: 'Number of jobs in enrichment queue'
});
```

**Metric Export**:
```typescript
// Export via OTLP to OTEL Collector
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

const meterProvider = new MeterProvider({
  readers: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: 'http://otel-collector:4318/v1/metrics'
      }),
      exportIntervalMillis: 15000 // 15 seconds
    })
  ]
});
```

### Metrics Collection

**OTEL Collector Configuration** (`infra/k8s/otel-collector-config.yaml`):

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:4317

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024

exporters:
  prometheus:
    endpoint: 0.0.0.0:8889
    namespace: battlescope

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus]
```

**Prometheus Configuration** (`infra/k8s/prometheus-config.yaml`):
- Scrape interval: 15 seconds
- Evaluation interval: 15 seconds
- Retention: 15 days
- Storage: Local volume (100GB)

### Database Metrics (PostgreSQL Exporter)

**Exported Metrics** (port 9187):
```
pg_up - PostgreSQL availability
pg_stat_database_* - Database statistics
pg_stat_bgwriter_* - Background writer stats
pg_locks_* - Lock statistics
pg_stat_replication_* - Replication lag
```

**Custom Queries** (`infra/k8s/postgres-exporter-config.yaml`):
```yaml
- battles_count:
    query: "SELECT COUNT(*) FROM battles"
    master: true
    metrics:
      - battles_total:
          usage: "GAUGE"
          description: "Total number of battles"

- killmails_last_hour:
    query: "SELECT COUNT(*) FROM killmails WHERE created_at > NOW() - INTERVAL '1 hour'"
    master: true
    metrics:
      - killmails_ingested_last_hour:
          usage: "GAUGE"
          description: "Killmails ingested in last hour"
```

### Redis Metrics (Redis Exporter)

**Exported Metrics** (port 9121):
```
redis_up - Redis availability
redis_memory_used_bytes - Memory usage
redis_connected_clients - Active clients
redis_commands_processed_total - Total commands
redis_keyspace_hits_total - Cache hits
redis_keyspace_misses_total - Cache misses
```

### Aggregation and Recording Rules

**Prometheus Recording Rules**:

```yaml
groups:
  - name: api_aggregations
    interval: 1m
    rules:
      # Request rate per minute
      - record: api:http_requests:rate1m
        expr: rate(http_requests_total[1m])

      # Error rate percentage
      - record: api:http_errors:ratio
        expr: |
          rate(http_requests_total{status=~"5.."}[5m])
          /
          rate(http_requests_total[5m])

      # p95 latency by route
      - record: api:http_request_duration:p95
        expr: |
          histogram_quantile(0.95,
            rate(http_request_duration_seconds_bucket[5m])
          )

  - name: database_aggregations
    interval: 1m
    rules:
      # Query rate
      - record: database:queries:rate1m
        expr: rate(database_queries_total[1m])

      # Slow query rate (>1s)
      - record: database:slow_queries:rate1m
        expr: |
          rate(database_query_duration_seconds_count{duration > 1}[1m])
```

### Cardinality Management

**Label Guidelines**:
- Keep label cardinality < 100 values per label
- Avoid high-cardinality labels: user IDs, request IDs, timestamps
- Use label aggregation for dashboards

**Example - Bad**:
```typescript
// DON'T: userId creates unbounded cardinality
httpRequests.inc({ userId: req.user.id, route: req.route });
```

**Example - Good**:
```typescript
// DO: Use bounded labels, add userId to traces/logs
httpRequests.inc({ route: req.route, status: res.status });
```

---

## Tracing Strategy

### Distributed Tracing Architecture

**Trace Propagation**:
- W3C Trace Context standard
- Context propagated via HTTP headers: `traceparent`, `tracestate`
- Automatic context injection/extraction in Fastify

**Span Hierarchy**:
```
HTTP Request (root span)
  ├─ Auth Middleware
  │   └─ Session Validation (Redis)
  ├─ Authorization Check
  │   └─ Role Lookup (PostgreSQL)
  ├─ Business Logic
  │   ├─ Database Query (PostgreSQL)
  │   ├─ Cache Lookup (Redis)
  │   └─ External API Call (ESI)
  └─ Response Serialization
```

### Key Spans to Instrument

**Automatically Instrumented** (OpenTelemetry plugins):
- HTTP server requests (Fastify)
- HTTP client requests (node-fetch, axios)
- Database queries (Kysely via pg driver)
- Redis operations (ioredis)

**Manual Instrumentation**:

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('battlescope-api');

// Span for business logic
async function clusterBattles(killmails: Killmail[]) {
  return await tracer.startActiveSpan('cluster_battles', async (span) => {
    span.setAttribute('killmail.count', killmails.length);

    try {
      const battles = await runClusteringAlgorithm(killmails);

      span.setAttribute('battles.created', battles.length);
      span.setStatus({ code: SpanStatusCode.OK });

      return battles;
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Sampling Strategy

**Development**:
- Sample rate: 100% (all traces)
- Rationale: Full debugging capability

**Production**:
- Sample rate: 10% (1 in 10 traces)
- Head-based sampling: Decision made at trace start
- Always sample: Errors (status >= 400)
- Rationale: Balance between visibility and overhead

**Sampling Configuration**:
```typescript
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

const sampler = new TraceIdRatioBasedSampler(0.1); // 10%

// Always sample errors
import { ParentBasedSampler } from '@opentelemetry/sdk-trace-base';

const errorSampler = {
  shouldSample(context, traceId, spanName, spanKind, attributes, links) {
    // Always sample if previous span had error
    const parentSpan = trace.getSpan(context);
    if (parentSpan?.status?.code === SpanStatusCode.ERROR) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Otherwise use ratio sampler
    return sampler.shouldSample(context, traceId, spanName, spanKind, attributes, links);
  }
};
```

### Trace Context Propagation

**HTTP Headers**:
```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
tracestate: battlescope=session_id:abc123,user_id:550e8400
```

**Inter-Service Communication**:
```typescript
// Fastify automatic propagation
app.get('/battles/:id', async (req, reply) => {
  // Trace context automatically extracted from req.headers

  // Context automatically injected when making external calls
  const esiData = await esiClient.getSystem(systemId);

  return battleData;
});
```

### Performance Impact Considerations

**Overhead**:
- CPU: ~1-2% with 10% sampling
- Memory: ~10MB per service instance
- Network: ~1KB per trace exported

**Mitigation**:
- Use batch span processor (export every 5s or 512 spans)
- Compress exports with gzip
- Export asynchronously (non-blocking)
- Rate limit span creation in hot paths

---

## Dashboards

### Grafana Dashboard Organization

**Location**: `/docs/dashboards/` (JSON exports)

**Dashboard Hierarchy**:
1. **System Overview** - High-level health
2. **Service Dashboards** - Per-service deep dives
3. **SLO Tracking** - SLO metrics and error budgets
4. **Infrastructure** - Kubernetes, database, Redis
5. **Business Metrics** - Battles created, users active

### Required Dashboards

#### 1. System Overview

**Panels**:
- System health status (up/down indicators)
- Request rate (req/sec)
- Error rate percentage
- p95/p99 latency
- Active users
- Resource utilization (CPU, memory)

**Queries**:
```promql
# Request rate
sum(rate(http_requests_total[5m])) by (app)

# Error rate
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))

# p95 latency
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)
```

#### 2. API Performance

**Panels**:
- Request rate by endpoint
- Latency by endpoint (p50, p95, p99)
- Error rate by endpoint
- Request duration heatmap
- Top slow endpoints
- Cache hit rate

**Queries**:
```promql
# Requests per endpoint
topk(10, sum(rate(http_requests_total[5m])) by (route))

# p95 latency per endpoint
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (route, le)
)

# Cache hit rate
rate(redis_keyspace_hits_total[5m])
/
(rate(redis_keyspace_hits_total[5m]) + rate(redis_keyspace_misses_total[5m]))
```

#### 3. Ingestion Pipeline

**Panels**:
- Killmails ingested per minute
- Enrichment queue depth
- Clustering lag
- Success/failure rates
- zKillboard API latency

**Queries**:
```promql
# Ingestion rate
rate(killmail_ingestion_total[5m])

# Queue depth
enrichment_queue_depth

# Clustering lag
max(time() - battle_killmail_timestamp_seconds{clustered="false"})
```

#### 4. Database Performance

**Panels**:
- Query rate
- Query duration (p50, p95, p99)
- Connection pool utilization
- Slow queries (>1s)
- Table sizes
- Index hit rate

**Queries**:
```promql
# Query rate
rate(database_queries_total[5m])

# Connection pool usage
database_connections_active / (database_connections_active + database_connections_idle)

# Slow queries
rate(database_query_duration_seconds_count{duration > 1}[5m])
```

#### 5. Redis Performance

**Panels**:
- Commands per second
- Memory usage
- Connected clients
- Cache hit rate
- Evicted keys

**Queries**:
```promql
# Commands per second
rate(redis_commands_processed_total[5m])

# Memory usage
redis_memory_used_bytes / redis_memory_max_bytes

# Cache hit rate
rate(redis_keyspace_hits_total[5m])
/
(rate(redis_keyspace_hits_total[5m]) + rate(redis_keyspace_misses_total[5m]))
```

#### 6. Typesense Search

**Panels**:
- Search queries per minute
- Search latency (p50, p95, p99)
- Index size
- Memory usage

#### 7. SLO Tracking

**Panels**:
- Availability percentage (30-day)
- Error budget remaining
- Error budget burn rate
- SLO compliance per service
- Incidents affecting SLOs

**Reference**: See `/docs/technical-specifications/sla-slo.md`

### Dashboard Variables

**Standard Variables**:
```
$namespace: battlescope (Kubernetes namespace)
$environment: production|staging|development
$service: api|ingest|enrichment|clusterer|search-sync
$interval: 5m|15m|1h|6h|1d
```

---

## Alert Rules

### Alert Organization

**Prometheus Alerts** (`infra/k8s/prometheus-config.yaml`):

```yaml
groups:
  - name: system_health
    interval: 1m
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"

      - alert: HighMemoryUsage
        expr: container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.pod }}"

  - name: api_alerts
    interval: 1m
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "API error rate above 5%"

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "API p95 latency above 1s"

  - name: database_alerts
    interval: 1m
    rules:
      - alert: DatabaseDown
        expr: pg_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL is down"

      - alert: HighConnectionUsage
        expr: pg_stat_database_numbackends / pg_settings_max_connections > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL connection pool > 80%"

      - alert: SlowQueries
        expr: rate(database_query_duration_seconds_count{duration > 1}[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High rate of slow database queries (>1s)"

  - name: ingestion_alerts
    interval: 1m
    rules:
      - alert: IngestionStalled
        expr: rate(killmail_ingestion_total[10m]) == 0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Killmail ingestion has stalled"

      - alert: HighClusteringLag
        expr: max(time() - battle_killmail_timestamp_seconds{clustered="false"}) > 600
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Battle clustering lag > 10 minutes"

      - alert: EnrichmentQueueBacklog
        expr: enrichment_queue_depth > 1000
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Enrichment queue has large backlog"
```

### Alert Routing (Alertmanager)

**Severity-Based Routing**:
```yaml
route:
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'default'
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true

    - match:
        severity: warning
      receiver: 'slack'
      continue: true

receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://alerting-service:8080/alerts'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '<key>'

  - name: 'slack'
    slack_configs:
      - api_url: '<webhook>'
        channel: '#battlescope-alerts'
```

---

## Troubleshooting Workflows

### Common Scenarios

#### 1. High API Latency

**Steps**:
1. Check Grafana API Performance dashboard
2. Identify slow endpoints
3. View traces in Jaeger for slow requests
4. Check database slow query log
5. Review cache hit rates

**Queries**:
```logql
# Find slow requests
{app="api"} | json | duration > 1000 | line_format "{{.method}} {{.path}} {{.duration}}ms"
```

```promql
# Slow endpoints
topk(10, histogram_quantile(0.95,
  rate(http_request_duration_seconds_bucket[5m])
) by (route))
```

#### 2. Database Performance Issues

**Steps**:
1. Check PostgreSQL dashboard
2. Review pg_stat_statements for slow queries
3. Check connection pool utilization
4. Review query plans with EXPLAIN ANALYZE
5. Check for missing indexes

**Queries**:
```sql
-- Top slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Connection count
SELECT count(*) FROM pg_stat_activity;

-- Lock contention
SELECT * FROM pg_locks WHERE NOT granted;
```

#### 3. Ingestion Pipeline Stalled

**Steps**:
1. Check ingest service logs
2. Review enrichment queue depth
3. Test zKillboard API availability
4. Check Redis connection health
5. Review clustering lag metric

**Queries**:
```logql
# Ingest service errors
{app="ingest"} | json | level >= 50
```

```promql
# Queue depth trend
enrichment_queue_depth[1h]
```

---

## References

- [SLA/SLO Specification](/docs/technical-specifications/sla-slo.md)
- [Infrastructure Specification](/docs/technical-specifications/infrastructure.md)
- [Pino Documentation](https://getpino.io/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/best-practices/)
