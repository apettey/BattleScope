# Database Metrics Exporters

_Last Updated: 2025-11-10_

## Overview

BattleScope uses Prometheus exporters to collect and expose metrics from PostgreSQL and Redis databases. These exporters run as sidecar containers alongside the database containers, making metrics available for Prometheus to scrape and Grafana to visualize.

---

## Architecture

### Sidecar Pattern

Both database exporters use the **sidecar container pattern**:
- Exporters run in the same pod as the database
- Connect to the database via `localhost`
- Expose metrics on a dedicated port
- Share the same lifecycle as the database

### Metrics Flow

```
┌─────────────────────────────────────┐
│         Database Pod                │
│                                     │
│  ┌──────────┐    ┌──────────────┐  │
│  │          │    │              │  │
│  │ Database │◄───┤   Exporter   │  │
│  │          │    │              │  │
│  └──────────┘    └──────┬───────┘  │
│                         │          │
└─────────────────────────┼──────────┘
                          │
                    Expose /metrics
                          │
                          ▼
                  ┌───────────────┐
                  │  Prometheus   │
                  │   (Scrape)    │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │    Grafana    │
                  │  (Visualize)  │
                  └───────────────┘
```

---

## Redis Exporter

### Configuration

**Image**: `oliver006/redis_exporter:v1.55.0-alpine`
**Port**: `9121`
**Metrics Path**: `/metrics`

### Environment Variables

```yaml
- name: REDIS_ADDR
  value: "localhost:6379"
- name: REDIS_PASSWORD
  valueFrom:
    secretKeyRef:
      name: redis-secret
      key: REDIS_PASSWORD
```

### Key Metrics Exposed

| Metric | Type | Description |
|--------|------|-------------|
| `redis_connected_clients` | Gauge | Number of client connections |
| `redis_blocked_clients` | Gauge | Number of clients pending on blocking call |
| `redis_used_memory_bytes` | Gauge | Total bytes allocated by Redis |
| `redis_used_memory_rss_bytes` | Gauge | Resident set size in bytes |
| `redis_used_memory_peak_bytes` | Gauge | Peak memory consumed by Redis |
| `redis_mem_fragmentation_ratio` | Gauge | Memory fragmentation ratio |
| `redis_connected_slaves` | Gauge | Number of connected replicas |
| `redis_keyspace_hits_total` | Counter | Total number of successful key lookups |
| `redis_keyspace_misses_total` | Counter | Total number of failed key lookups |
| `redis_commands_processed_total` | Counter | Total number of commands processed |
| `redis_commands_duration_seconds_total` | Counter | Total time spent executing commands |
| `redis_db_keys` | Gauge | Number of keys in each database |
| `redis_db_keys_expiring` | Gauge | Number of keys with expiration set |
| `redis_evicted_keys_total` | Counter | Number of keys evicted due to maxmemory limit |
| `redis_expired_keys_total` | Counter | Number of keys expired |
| `redis_instantaneous_ops_per_sec` | Gauge | Current operations per second |
| `redis_rdb_last_save_timestamp_seconds` | Gauge | Unix timestamp of last successful RDB save |

### Resource Allocation

```yaml
resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 100m
    memory: 128Mi
```

### Prometheus Configuration

```yaml
- job_name: 'redis'
  static_configs:
    - targets: ['redis:9121']
  scrape_interval: 30s
```

---

## PostgreSQL Exporter

### Configuration

**Image**: `prometheuscommunity/postgres-exporter:v0.15.0`
**Port**: `9187`
**Metrics Path**: `/metrics`

### Environment Variables

```yaml
- name: DATA_SOURCE_USER
  valueFrom:
    secretKeyRef:
      name: postgres-secret
      key: POSTGRES_USER
- name: DATA_SOURCE_PASS
  valueFrom:
    secretKeyRef:
      name: postgres-secret
      key: POSTGRES_PASSWORD
- name: DATA_SOURCE_DB
  valueFrom:
    secretKeyRef:
      name: postgres-secret
      key: POSTGRES_DB
- name: DATA_SOURCE_URI
  value: "localhost:5432/$(DATA_SOURCE_DB)?sslmode=disable"
- name: PG_EXPORTER_EXTEND_QUERY_PATH
  value: "/etc/postgres_exporter/queries.yaml"
```

### Key Metrics Exposed

#### Default Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `pg_up` | Gauge | Whether the PostgreSQL server is up (1) or down (0) |
| `pg_stat_database_numbackends` | Gauge | Number of backends currently connected |
| `pg_stat_database_xact_commit` | Counter | Number of transactions committed |
| `pg_stat_database_xact_rollback` | Counter | Number of transactions rolled back |
| `pg_stat_database_blks_read` | Counter | Number of disk blocks read |
| `pg_stat_database_blks_hit` | Counter | Number of buffer hits (cached) |
| `pg_stat_database_tup_returned` | Counter | Number of rows returned by queries |
| `pg_stat_database_tup_fetched` | Counter | Number of rows fetched by queries |
| `pg_stat_database_tup_inserted` | Counter | Number of rows inserted |
| `pg_stat_database_tup_updated` | Counter | Number of rows updated |
| `pg_stat_database_tup_deleted` | Counter | Number of rows deleted |
| `pg_stat_database_conflicts` | Counter | Number of queries canceled due to conflicts |
| `pg_stat_database_deadlocks` | Counter | Number of deadlocks detected |
| `pg_locks_count` | Gauge | Number of active locks by mode |
| `pg_stat_bgwriter_*` | Counter | Background writer statistics |

#### Custom Extended Metrics

The exporter uses a ConfigMap (`postgres-exporter-queries`) to collect additional metrics:

**Database Sizes**:
- `pg_database_size_bytes`: Disk space used by each database

**Table Statistics** (`pg_stat_user_tables`):
- `pg_stat_user_tables_seq_scan`: Sequential scans initiated
- `pg_stat_user_tables_idx_scan`: Index scans initiated
- `pg_stat_user_tables_n_tup_ins`: Rows inserted
- `pg_stat_user_tables_n_tup_upd`: Rows updated
- `pg_stat_user_tables_n_tup_del`: Rows deleted
- `pg_stat_user_tables_n_live_tup`: Estimated live rows
- `pg_stat_user_tables_n_dead_tup`: Estimated dead rows
- `pg_stat_user_tables_vacuum_count`: Manual vacuums performed
- `pg_stat_user_tables_autovacuum_count`: Autovacuums performed

**Query Statistics** (`pg_stat_statements`):
- `pg_stat_statements_calls`: Number of times each query executed
- `pg_stat_statements_total_exec_time_seconds`: Total execution time
- `pg_stat_statements_mean_exec_time_seconds`: Average execution time
- `pg_stat_statements_rows`: Total rows affected
- `pg_stat_statements_shared_blks_hit`: Buffer cache hits
- `pg_stat_statements_shared_blks_read`: Disk reads

**Replication Status**:
- `pg_replication_is_replica`: Whether instance is a replica (1) or primary (0)
- `pg_replication_lag_seconds`: Replication lag in seconds

### Resource Allocation

```yaml
resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 200m
    memory: 128Mi
```

### Prometheus Configuration

```yaml
- job_name: 'postgres'
  static_configs:
    - targets: ['postgres:9187']
  scrape_interval: 30s
```

---

## Kubernetes Configuration

### Service Updates

Both database services expose metrics ports:

**Redis Service**:
```yaml
ports:
  - name: redis
    port: 6379
    targetPort: 6379
  - name: metrics
    port: 9121
    targetPort: 9121
```

**PostgreSQL Service**:
```yaml
ports:
  - name: postgres
    port: 5432
    targetPort: 5432
  - name: metrics
    port: 9187
    targetPort: 9187
```

### Prometheus Annotations

Both StatefulSets include Prometheus scrape annotations:

```yaml
metadata:
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "<exporter-port>"
    prometheus.io/path: "/metrics"
```

This enables automatic discovery via Prometheus's `kubernetes-pods` scrape config.

---

## Verification

### Check Exporter Health

**Redis Exporter**:
```bash
# Port-forward to Redis pod
kubectl port-forward -n battlescope redis-0 9121:9121

# Curl metrics endpoint
curl http://localhost:9121/metrics
```

**PostgreSQL Exporter**:
```bash
# Port-forward to PostgreSQL pod
kubectl port-forward -n battlescope postgres-0 9187:9187

# Curl metrics endpoint
curl http://localhost:9187/metrics
```

### Check Prometheus Targets

```bash
# Port-forward to Prometheus
kubectl port-forward -n battlescope svc/prometheus 9090:9090

# Open in browser
http://localhost:9090/targets
```

Look for:
- `redis` job showing UP
- `postgres` job showing UP
- Pods with `prometheus.io/scrape: "true"` annotation

### Sample PromQL Queries

**Redis**:
```promql
# Memory usage
redis_used_memory_bytes

# Commands per second
rate(redis_commands_processed_total[5m])

# Cache hit rate
rate(redis_keyspace_hits_total[5m]) / (rate(redis_keyspace_hits_total[5m]) + rate(redis_keyspace_misses_total[5m]))
```

**PostgreSQL**:
```promql
# Number of connections
pg_stat_database_numbackends

# Transaction rate
rate(pg_stat_database_xact_commit[5m])

# Cache hit ratio
sum(rate(pg_stat_database_blks_hit[5m])) / (sum(rate(pg_stat_database_blks_hit[5m])) + sum(rate(pg_stat_database_blks_read[5m])))

# Slow queries (requires pg_stat_statements)
pg_stat_statements_mean_exec_time_seconds > 1
```

---

## Grafana Dashboards

### Official Dashboards

**Redis**:
- [Redis Dashboard by oliver006](https://grafana.com/grafana/dashboards/763)
- Dashboard ID: 763

**PostgreSQL**:
- [PostgreSQL Database by wrouesnel](https://grafana.com/grafana/dashboards/9628)
- Dashboard ID: 9628

### Importing Dashboards

1. Navigate to Grafana: `kubectl port-forward -n battlescope svc/grafana 3000:3000`
2. Go to Dashboards → Import
3. Enter Dashboard ID (763 or 9628)
4. Select Prometheus as data source
5. Click Import

---

## Troubleshooting

### Exporter Not Running

**Check pod status**:
```bash
kubectl get pods -n battlescope redis-0 -o jsonpath='{.status.containerStatuses[*].name}'
kubectl get pods -n battlescope postgres-0 -o jsonpath='{.status.containerStatuses[*].name}'
```

Should show both main container and exporter sidecar.

**Check logs**:
```bash
# Redis exporter logs
kubectl logs -n battlescope redis-0 -c redis-exporter

# PostgreSQL exporter logs
kubectl logs -n battlescope postgres-0 -c postgres-exporter
```

### Authentication Issues

**Redis**:
- Verify `REDIS_PASSWORD` secret exists and is correct
- Test connection: `kubectl exec -it redis-0 -n battlescope -c redis -- redis-cli -a <password> PING`

**PostgreSQL**:
- Verify `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` secrets exist
- Test connection: `kubectl exec -it postgres-0 -n battlescope -c postgres -- psql -U <user> -d <db> -c "SELECT 1"`

### Missing Metrics

**PostgreSQL pg_stat_statements**:

If query statistics metrics are missing, enable `pg_stat_statements` extension:

```bash
kubectl exec -it postgres-0 -n battlescope -c postgres -- psql -U <user> -d <db>
```

```sql
-- Install extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Verify
SELECT * FROM pg_stat_statements LIMIT 1;
```

Update PostgreSQL configuration to load extension on startup:
```sql
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
```

Restart PostgreSQL pod:
```bash
kubectl delete pod -n battlescope postgres-0
```

### Prometheus Not Scraping

**Check Prometheus configuration**:
```bash
kubectl get configmap -n battlescope prometheus-config -o yaml
```

Verify scrape configs include `redis` and `postgres` jobs.

**Reload Prometheus configuration**:
```bash
kubectl rollout restart deployment/prometheus -n battlescope
```

---

## Security Considerations

1. **Credentials**: Database passwords are read from Kubernetes Secrets
2. **Network**: Exporters only accessible within cluster (ClusterIP services)
3. **Least Privilege**: Exporters use read-only database connections
4. **Metrics Exposure**: Metrics do not include sensitive data (passwords, query parameters)

---

## Performance Impact

### Resource Overhead

- **Redis Exporter**: ~50-100m CPU, ~64-128Mi memory
- **PostgreSQL Exporter**: ~50-200m CPU, ~64-128Mi memory

### Database Impact

- **Redis**: Minimal impact, uses INFO command
- **PostgreSQL**: Queries system tables (pg_stat_*), negligible overhead

### Scrape Frequency

Default: 30 seconds
Recommended: 15-60 seconds depending on monitoring requirements

---

## Future Enhancements

1. **Alerting Rules**: Create Prometheus alerting rules for critical metrics
2. **Custom Dashboards**: Build BattleScope-specific dashboards showing correlations between app and database metrics
3. **Query Performance**: Add slow query tracking and alerting
4. **Backup Metrics**: Monitor backup completion and size
5. **Connection Pooling**: Add metrics for PgBouncer or similar if implemented
6. **Redis Cluster**: Add cluster-specific metrics if Redis Cluster is deployed

---

## References

- [Redis Exporter Documentation](https://github.com/oliver006/redis_exporter)
- [PostgreSQL Exporter Documentation](https://github.com/prometheus-community/postgres_exporter)
- [Prometheus Configuration](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
