# Infrastructure Specification

**Version**: 1.0
**Last Updated**: 2025-11-12
**Status**: Production

---

## Overview

BattleScope is deployed on Kubernetes with a cloud-native architecture designed for scalability, reliability, and maintainability.

---

## Compute Resources

### Service Resource Allocation

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit | Replicas |
|---------|-------------|-----------|----------------|--------------|----------|
| **API** | 50m | 250m | 128Mi | 256Mi | 1-3 (HPA) |
| **Frontend** | 50m | 200m | 64Mi | 256Mi | 2 |
| **Ingest** | 100m | 500m | 128Mi | 512Mi | 1 |
| **Enrichment** | 100m | 500m | 256Mi | 1Gi | 1 |
| **Clusterer** | 200m | 1000m | 512Mi | 2Gi | 1 |
| **Scheduler** | 50m | 200m | 64Mi | 256Mi | CronJob |
| **Search Sync** | 100m | 500m | 256Mi | 1Gi | 1 |
| **Verifier** | 50m | 200m | 128Mi | 512Mi | CronJob |
| **PostgreSQL** | 100m | 500m | 256Mi | 512Mi | 1 |
| **Redis** | 100m | 300m | 256Mi | 512Mi | 1 |
| **Typesense** | 200m | 1000m | 512Mi | 2Gi | 1 |
| **Prometheus** | 200m | 1000m | 512Mi | 2Gi | 1 |
| **Grafana** | 100m | 500m | 256Mi | 1Gi | 1 |
| **Jaeger** | 100m | 500m | 256Mi | 1Gi | 1 |
| **Loki** | 100m | 500m | 256Mi | 1Gi | 1 |
| **Promtail** | 50m | 200m | 64Mi | 256Mi | DaemonSet |
| **OTEL Collector** | 100m | 500m | 256Mi | 1Gi | 1 |

**Total Cluster Requirements**:
- **CPU**: ~2.0 cores requested, ~8.5 cores limit
- **Memory**: ~4.5GB requested, ~16GB limit
- **Recommended Node Size**: 4 vCPU, 16GB RAM (allows for ~2x headroom)

### Horizontal Pod Autoscaling (HPA)

**API Service**:
```yaml
minReplicas: 1
maxReplicas: 3
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 70
```

**Scaling Triggers**:
- Scale up: CPU > 60% or Memory > 70% for 2 minutes
- Scale down: CPU < 40% and Memory < 50% for 5 minutes

---

## Storage Requirements

### Persistent Volumes

| Component | Storage | Access Mode | Retention | Backup |
|-----------|---------|-------------|-----------|--------|
| **PostgreSQL** | 20Gi | ReadWriteOnce | Persistent | Daily |
| **Redis** | 5Gi | ReadWriteOnce | Persistent | Every 6h |
| **Typesense** | 10Gi | ReadWriteOnce | Persistent | Daily |
| **Prometheus** | 100Gi | ReadWriteOnce | 15 days | None |
| **Loki** | 50Gi | ReadWriteOnce | 7 days | None |
| **Grafana** | 5Gi | ReadWriteOnce | Persistent | Weekly |

**Total Storage**: ~190Gi

**Growth Projections**:
- PostgreSQL: +500MB/month (battle data)
- Prometheus: +5GB/month (metrics growth)
- Loki: +2GB/week (log volume)

### Database Size Estimates

**Current (100k battles)**:
- `battles`: ~50MB
- `battle_killmails`: ~2GB
- `battle_participants`: ~1GB
- `accounts` + auth tables: ~10MB
- **Total**: ~5GB

**Projected (1M battles)**:
- Database: ~50GB
- Indexes: ~15GB
- **Total**: ~65GB

---

## Network Requirements

### Bandwidth

**Ingress**:
- API traffic: ~5 Mbps average, 50 Mbps peak
- Frontend assets: ~2 Mbps average
- Total: ~10 Mbps average, 75 Mbps peak

**Egress**:
- zKillboard RedisQ: ~1 Mbps continuous
- ESI API calls: ~500 Kbps average
- Telemetry export: ~1 Mbps
- Total: ~3 Mbps average

**Intra-Cluster**:
- Database queries: ~10 Mbps
- Redis operations: ~5 Mbps
- Metrics collection: ~2 Mbps

### Latency Requirements

| Connection | Max Latency | Notes |
|------------|-------------|-------|
| **API ↔ Database** | <5ms | Same datacenter required |
| **API ↔ Redis** | <2ms | Same datacenter required |
| **API ↔ Typesense** | <10ms | Search queries |
| **Ingest ↔ zKillboard** | <500ms | External API |
| **User ↔ API** | <100ms | p95 global |

---

## High Availability

### Current Architecture (Single-Node)

**Limitations**:
- PostgreSQL: Single instance (SPOF)
- Redis: Single instance (cache/queue loss on failure)
- Stateless services: Single replica (some services)

**Mitigation**:
- Kubernetes restarts failed pods automatically
- Health checks trigger pod replacement
- Persistent volumes survive pod restarts
- Manual failover for database

### High Availability Roadmap

**Phase 1: Service Redundancy**
- Scale API to 2+ replicas
- Add Frontend redundancy (already 2 replicas)
- Multiple OTEL collectors

**Phase 2: Database HA**
- PostgreSQL streaming replication (primary + 2 replicas)
- Automatic failover with Patroni or Stolon
- Connection pooling with PgBouncer
- Read replicas for analytics queries

**Phase 3: Redis HA**
- Redis Sentinel (3 nodes: 1 primary, 2 replicas)
- Automatic failover on primary failure
- Session state replicated across nodes

**Phase 4: Multi-Zone Deployment**
- Spread pods across availability zones
- Zone-aware pod scheduling
- Cross-zone database replication

---

## Disaster Recovery

### Backup Strategy

**PostgreSQL**:
- **Full Backup**: Daily at 03:00 UTC via pg_dump
- **Incremental**: WAL archiving every 5 minutes
- **Retention**: 30 days full, 7 days WAL
- **Storage**: S3-compatible object storage
- **Verification**: Monthly restore test

**Redis**:
- **AOF Persistence**: Enabled (1-second fsync)
- **RDB Snapshots**: Every 6 hours
- **Retention**: 7 days
- **Storage**: Persistent volume + daily backup to S3

**Configuration**:
- Kubernetes manifests: Git repository
- ConfigMaps/Secrets: Encrypted backups to vault

### Restore Procedures

**Database Restore**:
1. Stop API and dependent services
2. Restore PostgreSQL from latest backup
3. Replay WAL logs to desired point in time
4. Verify data integrity
5. Restart services
**RTO**: 30 minutes, **RPO**: 5 minutes

**Redis Restore**:
1. Stop Redis pod
2. Restore AOF or RDB snapshot
3. Restart Redis
4. Verify connectivity
**RTO**: 10 minutes, **RPO**: 1 hour

**Full System Recovery**:
1. Provision new Kubernetes cluster
2. Restore persistent volumes from backups
3. Apply Kubernetes manifests
4. Restore database
5. Verify service health
**RTO**: 4 hours, **RPO**: 1 hour

---

## Scaling Strategy

### Vertical Scaling

**When to Scale Up**:
- CPU consistently > 70% of limits
- Memory consistently > 80% of limits
- Frequent OOM kills
- Database query timeouts

**Components to Scale First**:
1. PostgreSQL (bottleneck for most operations)
2. API service (handles user traffic)
3. Clusterer (CPU-intensive)

### Horizontal Scaling

**Stateless Services** (easy to scale):
- API: Add replicas via HPA
- Frontend: Add replicas
- Enrichment: Add workers (tune concurrency)

**Stateful Services** (requires planning):
- PostgreSQL: Implement read replicas, then sharding
- Redis: Implement clustering or Sentinel
- Typesense: Multi-node cluster (already supported)

**Scaling Limits**:
- Current architecture: 5,000 concurrent users
- With HA improvements: 25,000 concurrent users
- With sharding: 100,000+ concurrent users

---

## Cost Optimization

### Resource Rightsizing

**Monthly Review**:
- Analyze actual CPU/memory usage
- Adjust requests/limits to 80% of peak usage
- Identify underutilized pods

**Current Recommendations**:
- API: Reduce memory limit to 256Mi (currently over-provisioned)
- Frontend: Running efficiently
- Observability: Consider managed services to reduce overhead

### Storage Optimization

**Strategies**:
- Archive battles older than 6 months to cold storage
- Compress Prometheus metrics (already enabled)
- Reduce log retention from 7 to 3 days (non-audit logs)
- Implement database table partitioning

**Estimated Savings**: 30% storage costs

### Compute Optimization

**Strategies**:
- Use spot/preemptible instances for non-critical workloads
- Schedule CronJobs during off-peak hours
- Implement pod disruption budgets
- Use cluster autoscaler

**Estimated Savings**: 20-30% compute costs

---

## Kubernetes Configuration

### Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: battlescope
```

### Resource Quotas

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: battlescope-quota
  namespace: battlescope
spec:
  hard:
    requests.cpu: "4"
    requests.memory: "8Gi"
    limits.cpu: "12"
    limits.memory: "24Gi"
    persistentvolumeclaims: "10"
```

### Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: battlescope
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
---
# Allow API to access database
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-to-database
spec:
  podSelector:
    matchLabels:
      app: postgres
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api
      ports:
        - protocol: TCP
          port: 5432
```

---

## Monitoring Infrastructure Health

**Key Metrics**:
- Node CPU/memory utilization
- Pod restart counts
- Persistent volume usage
- Network throughput
- Container image pull times

**Alerts**:
- Node CPU > 80%
- Node memory > 90%
- Pod crash loop detected
- PV usage > 85%
- Image pull failures

---

## References

- [SLA/SLO Specification](/docs/technical-specifications/sla-slo.md)
- [Observability Specification](/docs/technical-specifications/observability.md)
- [Security Specification](/docs/technical-specifications/security.md)
- [Kubernetes Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)
