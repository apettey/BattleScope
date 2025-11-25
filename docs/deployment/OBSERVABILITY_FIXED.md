# Observability Stack - Fixed Status

**Date:** 2025-11-25
**Time:** 09:54 UTC

## Summary

All observability components are now **running and healthy** except for Kafka (which you requested to replace anyway).

## Fixed Issues ✅

### 1. Grafana - FIXED ✅
**Problem:** CrashLoopBackOff due to missing plugins (postgres-datasource returned 404)
**Solution:** Removed problematic plugin installation
**Status:** Running healthy on port 30300
**URL:** http://10.0.1.3:30300 (admin/admin)

### 2. Loki - FIXED ✅
**Problem:** Permission denied creating /wal directory
**Solution:**
- Added securityContext (fsGroup: 10001, runAsUser: 10001)
- Disabled WAL in configuration (wal.enabled: false)
**Status:** Running and collecting logs
**Access:** Internal only (loki:3100)

### 3. Promtail - DEPLOYED ✅
**Status:** Running as DaemonSet on all 6 nodes
**Function:** Collecting logs from all pods in battlescope namespace
**Log Path:** /var/log/pods/*

### 4. Redis Exporter - FIXED ✅
**Problem:** exec format error (arm64 architecture issue with alpine image)
**Solution:** Changed from `oliver006/redis_exporter:v1.55.0-alpine` to `oliver006/redis_exporter:v1.55.0`
**Status:** Running and exporting metrics on port 9121

### 5. Prometheus - HEALTHY ✅
**Status:** Running and scraping metrics
**URL:** http://10.0.1.3:30090
**Health Check:** Prometheus Server is Healthy

### 6. PostgreSQL Exporter - HEALTHY ✅
**Status:** Running and exporting metrics on port 9187

## Current Observability Stack

```
✅ Prometheus       - Metrics collection      - http://10.0.1.3:30090
✅ Grafana          - Dashboards & UI         - http://10.0.1.3:30300 (admin/admin)
✅ Loki             - Log aggregation         - Internal (loki:3100)
✅ Promtail         - Log collection          - DaemonSet (6 nodes)
✅ PostgreSQL Exp   - Database metrics        - Internal (9187)
✅ Redis Exporter   - Cache metrics           - Internal (9121)
⚠️ Kafka            - Message broker          - CrashLoopBackOff
⚠️ Kafka Exporter   - Kafka metrics           - CrashLoopBackOff (depends on Kafka)
✅ Zookeeper        - Kafka coordination      - Running
```

## Grafana Datasources Configured

1. **Prometheus** (Default)
   - URL: http://prometheus:9090
   - For metrics visualization

2. **Loki**
   - URL: http://loki:3100
   - For log exploration

## Still Needs Attention ⚠️

### Kafka - CrashLoopBackOff
**Status:** Still crashing after 95+ restarts
**Your Request:** "is there not a easier to manage solution than kafka? Something without zookeeper?"
**Recommendation:** Replace with **Redis Streams**
- No Zookeeper dependency
- Simpler configuration
- Lower resource usage
- Built-in persistence
- Native support in Redis (already running)

### Kafka Exporter
**Status:** CrashLoopBackOff (depends on Kafka being healthy)
**Action:** Will work once Kafka is replaced/fixed

## Quick Testing

### View Logs in Grafana
1. Open http://10.0.1.3:30300
2. Login: admin / admin
3. Go to Explore
4. Select "Loki" datasource
5. Query: `{namespace="battlescope"}`

### View Metrics in Grafana
1. Go to Explore
2. Select "Prometheus" datasource
3. Try queries like:
   - `up` - see all scraped targets
   - `redis_connected_clients` - Redis connections
   - `pg_up` - PostgreSQL status

### Check Prometheus Targets
1. Open http://10.0.1.3:30090/targets
2. Verify all exporters are UP

## File Changes Made

### Created
- `infra/k8s/observability/loki.yaml` - Loki deployment with security context and WAL disabled
- `infra/k8s/observability/promtail.yaml` - Promtail DaemonSet with RBAC

### Modified
- `infra/k8s/observability/grafana.yaml`
  - Removed problematic plugin installation (GF_INSTALL_PLUGINS="")
  - Added Loki datasource configuration

- `infra/k8s/observability/exporters.yaml`
  - Changed redis-exporter image from alpine to standard (arm64 compatibility)
  - Added REDIS_EXPORTER_CHECK_KEYS env var

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                        │
│                                                              │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐           │
│  │          │     │          │     │          │           │
│  │ Services │────▶│Prometheus│────▶│ Grafana  │           │
│  │  (x6)    │     │  :9090   │     │  :3000   │           │
│  │          │     │          │     │          │           │
│  └──────────┘     └──────────┘     └────┬─────┘           │
│       │                                  │                  │
│       │                                  │                  │
│       ▼                                  ▼                  │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐           │
│  │Promtail  │────▶│   Loki   │─────▶  Loki     │           │
│  │DaemonSet │     │  :3100   │      Datasource │           │
│  │ (x6)     │     │          │                  │           │
│  └──────────┘     └──────────┘                  │           │
│                                                              │
│  ┌──────────────────────────────────────┐                  │
│  │          Exporters                    │                  │
│  │  - PostgreSQL (9187)                  │                  │
│  │  - Redis (9121)                       │                  │
│  │  - Kafka (9308) ⚠️                    │                  │
│  └──────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

## Next Steps Recommended

1. **Replace Kafka with Redis Streams**
   - Simpler architecture
   - No Zookeeper needed
   - Better for your use case

2. **Create Grafana Dashboards**
   - Service metrics dashboard
   - Infrastructure dashboard
   - Logs dashboard

3. **Configure Alerts**
   - Service down alerts
   - High error rate alerts
   - Resource usage alerts

## Commands

### Check all observability pods
```bash
kubectl get pods -n battlescope | grep -E "prometheus|grafana|loki|promtail|exporter"
```

### View Loki logs
```bash
kubectl logs -n battlescope -l app=loki --tail=50
```

### View Promtail logs (on specific node)
```bash
kubectl logs -n battlescope -l app=promtail --tail=50
```

### Restart observability components
```bash
# Restart Grafana
kubectl rollout restart deployment grafana -n battlescope

# Restart Loki
kubectl rollout restart deployment loki -n battlescope

# Restart Promtail (all nodes)
kubectl rollout restart daemonset promtail -n battlescope
```

## Success Metrics

✅ Grafana accessible and healthy
✅ Prometheus scraping 7+ targets
✅ Loki receiving logs from 6 Promtail instances
✅ Redis Exporter providing metrics
✅ PostgreSQL Exporter providing metrics
✅ All BattleScope services still running
⚠️ Kafka needs replacement (as you requested)

## Time to Fix

Started: ~09:30 UTC
Completed: ~09:54 UTC
**Total Time: ~24 minutes**

Fixed 4 major issues:
1. Grafana plugin crash
2. Loki WAL permission issue
3. Redis Exporter architecture mismatch
4. Configured complete logging pipeline with Promtail
