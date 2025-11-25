# Service Level Agreements and Objectives

**Version**: 1.0
**Last Updated**: 2025-11-12
**Status**: Production

---

## Table of Contents

1. [Overview](#overview)
2. [Availability Targets](#availability-targets)
3. [Performance Targets](#performance-targets)
4. [Reliability Targets](#reliability-targets)
5. [Scalability Targets](#scalability-targets)
6. [Recovery Targets](#recovery-targets)
7. [Monitoring and Alerting](#monitoring-and-alerting)
8. [SLO Budget Policy](#slo-budget-policy)

---

## Overview

This document defines the Service Level Objectives (SLOs) and Service Level Agreements (SLAs) for the BattleScope platform. These metrics guide operational decisions, infrastructure planning, and incident response.

### Definitions

- **SLI (Service Level Indicator)**: A quantitative measure of service behavior (e.g., request latency, error rate)
- **SLO (Service Level Objective)**: Target value or range for an SLI (internal goal)
- **SLA (Service Level Agreement)**: Contractual commitment with consequences for failure (external promise)
- **Error Budget**: Acceptable amount of downtime/errors within an SLO period

### Measurement Windows

- **Rolling 30-day window**: Primary measurement period for all SLOs
- **Rolling 7-day window**: Secondary window for faster feedback on degradations
- **Monthly reporting**: SLA compliance reported at the end of each calendar month

---

## Availability Targets

### System-Wide Availability

**SLO**: 99.5% uptime (monthly)
**SLA**: 99.0% uptime (monthly)
**Error Budget**: 3.6 hours/month

**Measurement**:
- Uptime calculated as percentage of successful health check probes
- Health checks run every 10 seconds from multiple monitoring locations
- Downtime = any period where health checks fail for >30 consecutive seconds

**Service Levels by Component**:

| Component | Target Availability | Max Downtime/Month | Critical Path |
|-----------|--------------------|--------------------|---------------|
| **API Service** | 99.5% | 3.6 hours | Yes |
| **Frontend** | 99.5% | 3.6 hours | Yes |
| **PostgreSQL** | 99.9% | 43 minutes | Yes |
| **Redis** | 99.5% | 3.6 hours | Yes |
| **Typesense** | 99.0% | 7.2 hours | No |
| **Ingest Service** | 99.0% | 7.2 hours | No |
| **Enrichment Service** | 98.0% | 14.4 hours | No |
| **Clusterer Service** | 98.0% | 14.4 hours | No |
| **Observability Stack** | 95.0% | 36 hours | No |

**Critical Path Components**:
- Components marked "Yes" directly impact user-facing functionality
- Failure of critical path components counts against system-wide SLO
- Non-critical components can fail without immediate user impact

---

## Performance Targets

### API Response Time

**SLO Targets**:
- **p50**: < 100ms
- **p95**: < 500ms
- **p99**: < 2000ms
- **p99.9**: < 5000ms

**Measurement**:
- Measured at API gateway level (Fastify)
- Includes authentication, authorization, and database queries
- Excludes client network latency

**By Endpoint Category**:

| Endpoint Type | p50 | p95 | p99 | Notes |
|--------------|-----|-----|-----|-------|
| **GET /battles** | <100ms | <300ms | <1000ms | List queries with filters |
| **GET /battles/:id** | <150ms | <400ms | <1500ms | Detail views with joins |
| **POST /search/battles** | <200ms | <500ms | <2000ms | Typesense queries |
| **GET /killmails/stream** | <50ms | <100ms | <200ms | SSE connection setup |
| **GET /me** | <50ms | <150ms | <500ms | Session validation |
| **GET /admin/accounts** | <200ms | <600ms | <2000ms | Admin queries |

### Battle Reconstruction Latency

**SLO**: 95% of killmails clustered into battles within 5 minutes of ingestion

**Measurement**:
- Time from killmail insertion to appearance in a battle
- Measured as: `battle.created_at - killmail.created_at`

**Target Distribution**:
- p50: < 2 minutes
- p95: < 5 minutes
- p99: < 10 minutes

### Search Query Response Time

**SLO Targets**:
- **Autocomplete (entities/systems)**: p95 < 100ms
- **Battle search**: p95 < 200ms
- **Global search**: p95 < 300ms

**Measurement**:
- Time from Typesense query initiation to result return
- Measured at API proxy level

### Data Ingestion Lag

**SLO**: p95 < 10 seconds from zKillboard publication to database insertion

**Measurement**:
- Time from killmail timestamp to successful database write
- Measured as: `killmail.created_at - killmail.timestamp`

**Pipeline Stages**:
- RedisQ poll latency: p95 < 2s
- Filter processing: p95 < 100ms
- Database insertion: p95 < 500ms
- Queue job creation: p95 < 200ms

---

## Reliability Targets

### Error Rates

**SLO**: < 1% error rate for user-facing requests (4xx/5xx responses)

**By Error Type**:
- **4xx (Client Errors)**: < 5% of total requests
- **5xx (Server Errors)**: < 1% of total requests
- **Authentication failures**: < 2% of auth attempts
- **Database query failures**: < 0.1% of queries

**Measurement**:
- HTTP status codes logged by API gateway
- Error rate = (error responses / total responses) * 100

### Data Consistency

**SLO**: 99.99% of battles correctly reference all associated killmails

**Measurement**:
- Periodic verification job checks referential integrity
- Verifies: battle_killmails → killmails, battle_participants → characters
- Runs: Every 6 hours

**Consistency Checks**:
- No orphaned battle_killmails (killmail_id references valid killmail)
- No orphaned battle_participants (character_id valid)
- Battle statistics match computed values (total_kills, total_isk_destroyed)
- All battles have at least min_kills (2) killmails

### Data Freshness

**SLO**: 95% of entity names resolved within 1 hour of first reference

**Measurement**:
- Time from entity appearing in battle to name resolution from ESI
- Measured by: `entity.name_resolved_at - entity.first_seen_at`

---

## Scalability Targets

### Concurrent Users

**SLO**: Support 1,000 concurrent active users without degradation

**Measurement**:
- Active WebSocket connections (SSE streams)
- Active sessions in last 5 minutes
- Request rate: 100 req/sec sustained, 500 req/sec burst

**Scaling Thresholds**:
- API pods: Scale when CPU > 70% or memory > 80%
- Database connections: Alert when pool > 80% utilized
- Redis memory: Alert when usage > 75%

### Battles Per Hour

**SLO**: Process and cluster 500 battles/hour during peak activity

**Measurement**:
- Battles created per hour (clusterer throughput)
- Measured during peak hours (typically 18:00-22:00 UTC)

**Pipeline Capacity**:
- Ingest: 2,000 killmails/hour
- Enrichment: 1,500 killmails/hour (zKillboard API rate limit)
- Clustering: 500 battles/hour
- Search indexing: 1,000 documents/hour

### Storage Growth

**SLO**: Handle 1TB of battle data with <10% query performance degradation

**Current Metrics**:
- Database size: ~5GB (estimated 100k battles)
- Growth rate: ~500MB/month (estimated)
- Index size: ~1GB
- Total storage: ~10GB

**Scaling Plan**:
- Partition battles table by date when >500k battles
- Archive battles older than 6 months to cold storage
- Implement database read replicas for analytics queries

---

## Recovery Targets

### Recovery Time Objective (RTO)

**Target**: Restore service within 4 hours of any component failure

**By Component**:

| Component | RTO | Recovery Procedure |
|-----------|-----|-------------------|
| **API Service** | 5 minutes | Kubernetes rollout restart |
| **PostgreSQL** | 30 minutes | Restore from automated backup |
| **Redis** | 10 minutes | Restore from AOF/RDB snapshot |
| **Frontend** | 2 minutes | Redeploy from CDN |
| **Typesense** | 1 hour | Reindex from PostgreSQL |
| **Enrichment Queue** | 15 minutes | Clear dead jobs, restart workers |

### Recovery Point Objective (RPO)

**Target**: Maximum 5 minutes of data loss for critical data

**By Data Type**:

| Data Type | RPO | Backup Strategy |
|-----------|-----|----------------|
| **Battle data** | 5 minutes | PostgreSQL continuous archiving (WAL) |
| **User accounts** | 5 minutes | PostgreSQL continuous archiving (WAL) |
| **Session state** | 1 hour | Redis AOF persistence (1s fsync) |
| **Search index** | 4 hours | Rebuild from PostgreSQL (CronJob) |
| **Metrics** | 15 days | Prometheus retention policy |
| **Logs** | 7 days | Loki retention policy |

### Backup Schedule

**PostgreSQL**:
- Full backup: Daily at 03:00 UTC
- Incremental backups: Every 6 hours
- WAL archiving: Continuous (5-minute segments)
- Retention: 30 days
- Storage: S3-compatible object storage

**Redis**:
- AOF persistence: Enabled (1-second fsync)
- RDB snapshots: Every 6 hours
- Retention: 7 days

**Configuration**:
- Git repository: All Kubernetes manifests
- ConfigMaps: Backed up with cluster state
- Secrets: Encrypted backups to secure vault

---

## Monitoring and Alerting

### SLO Tracking

**Dashboard**: Grafana SLO dashboard (`dashboards/slo-overview.json`)

**Metrics Tracked**:
1. Availability percentage (30-day rolling)
2. Error budget remaining
3. Request latency (p50, p95, p99)
4. Error rate percentage
5. Battle clustering lag
6. Search query latency

**Alerting Rules** (Prometheus):

```yaml
groups:
  - name: SLO Alerts
    interval: 1m
    rules:
      # Availability
      - alert: AvailabilitySLOBreach
        expr: avg_over_time(up[30d]) < 0.995
        for: 5m
        severity: critical
        annotations:
          summary: "System availability below 99.5% SLO"

      - alert: ErrorBudgetExhausted
        expr: (1 - avg_over_time(up[30d])) > 0.005
        for: 15m
        severity: critical
        annotations:
          summary: "Error budget exhausted for 30-day window"

      # Performance
      - alert: APILatencyP95High
        expr: histogram_quantile(0.95, http_request_duration_seconds_bucket) > 0.5
        for: 10m
        severity: warning
        annotations:
          summary: "API p95 latency above 500ms SLO"

      - alert: APILatencyP99High
        expr: histogram_quantile(0.99, http_request_duration_seconds_bucket) > 2.0
        for: 10m
        severity: critical
        annotations:
          summary: "API p99 latency above 2s SLO"

      # Reliability
      - alert: ErrorRateHigh
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
        for: 5m
        severity: critical
        annotations:
          summary: "5xx error rate above 1% SLO"

      - alert: ClusteringLagHigh
        expr: clustering_lag_seconds > 300
        for: 15m
        severity: warning
        annotations:
          summary: "Battle clustering lag above 5min SLO"
```

### Alert Severity Levels

**Critical** (Page immediately, 24/7):
- System availability < 99.5%
- Error budget exhausted
- Database unavailable
- API error rate > 5%
- p99 latency > 5s

**Warning** (Investigate during business hours):
- Error budget < 20% remaining
- p95 latency > 500ms
- Clustering lag > 5 minutes
- Search latency > 200ms
- Disk usage > 80%

**Info** (Track for trends):
- API request rate anomalies
- Slow query patterns
- Cache hit rate degradation
- Unusual user activity patterns

### On-Call Rotation

**Primary on-call**: 24/7 coverage
**Secondary on-call**: Backup escalation
**Escalation path**: Primary → Secondary → Engineering Manager → CTO

**Response Times**:
- Critical alerts: Acknowledge within 5 minutes, mitigate within 30 minutes
- Warning alerts: Acknowledge within 2 hours, resolve within 24 hours
- Info alerts: Review during next business day

---

## SLO Budget Policy

### Error Budget Calculation

**Formula**: `Error Budget = (1 - SLO) × Measurement Period`

**Example** (99.5% availability SLO):
- 30-day period = 43,200 minutes
- Error budget = 0.005 × 43,200 = 216 minutes = 3.6 hours

**Tracking**:
- Calculate daily error budget consumption
- Alert when 80% of budget consumed
- Report monthly on budget utilization

### Budget Exhaustion Policy

**When error budget is exhausted**:

1. **Freeze non-critical deployments**: Only security fixes and critical bugs
2. **Focus on reliability**: Dedicate 50% of engineering time to reliability work
3. **Root cause analysis**: Complete RCA for all budget-consuming incidents
4. **Postmortem review**: Document lessons learned and preventive measures

**When budget is healthy (>50% remaining)**:
- Normal deployment cadence
- 20% time for reliability improvements
- Feature development prioritized

### Quarterly SLO Review

**Review Process**:
1. Analyze 90-day SLO performance
2. Identify recurring issues
3. Adjust targets if consistently missed or exceeded
4. Update monitoring and alerting as needed
5. Present findings to leadership

**Adjustment Criteria**:
- If SLO missed for 2+ consecutive months: Increase error budget or improve reliability
- If SLO exceeded with >80% budget remaining for 3+ months: Consider tightening target
- Major architecture changes: Re-baseline SLOs

---

## Appendix: SLO Dashboard Queries

### Availability Query (Prometheus)

```promql
# 30-day availability percentage
avg_over_time(up{job="api"}[30d]) * 100

# Error budget remaining
(1 - (1 - avg_over_time(up{job="api"}[30d])) / (1 - 0.995)) * 100
```

### Latency Query (Prometheus)

```promql
# p95 API latency
histogram_quantile(0.95,
  rate(http_request_duration_seconds_bucket{job="api"}[5m])
)

# p99 API latency
histogram_quantile(0.99,
  rate(http_request_duration_seconds_bucket{job="api"}[5m])
)
```

### Error Rate Query (Prometheus)

```promql
# Overall error rate
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m])) * 100
```

### Clustering Lag Query (Prometheus)

```promql
# Battle clustering lag (seconds)
max(time() - battle_killmail_timestamp_seconds{clustered="false"})
```

---

## References

- [Architecture Documentation](/docs/architecture.md)
- [Observability Specification](/docs/technical-specifications/observability.md)
- [Infrastructure Specification](/docs/technical-specifications/infrastructure.md)
- [Incident Response Runbook](/docs/runbooks/incident-response.md)
- [Google SRE Book: Implementing SLOs](https://sre.google/sre-book/implementing-slos/)
