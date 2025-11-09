# Logging Stack Setup Guide

## Overview

This guide covers the complete logging and observability stack for BattleScope using:

- **Loki** - Lightweight log aggregation (like Prometheus, but for logs)
- **Promtail** - Log collection agent (DaemonSet)
- **OTEL Collector** - Logs pipeline and forwarding
- **Grafana** - Unified UI for logs, metrics, and traces

### Configuration Profile: Maximum Capture, Short Retention

This setup is optimized for **real-time debugging** with:

- ✅ **1 hour retention** - Aggressive cleanup for minimal storage costs
- ✅ **Maximum log capture** - No rate limiting or sampling
- ✅ **High ingestion limits** - Capture everything your apps log
- ✅ **Fast compaction** - Cleanup runs every 5 minutes
- ✅ **Small storage footprint** - Only 2Gi needed

Perfect for development and real-time testing where you need full logs but don't need long-term storage.

## Architecture

```
Application Pods → stdout/stderr
         ↓
Promtail (DaemonSet) → scrapes container logs
         ↓
      Loki → stores logs with labels
         ↓
    Grafana → query and visualize
         ↑
   Jaeger (traces) ← correlated via trace IDs
```

## Initial Setup

### 1. Deploy Loki

```bash
kubectl apply -f infra/k8s/loki-deployment.yaml
```

This creates:

- Loki StatefulSet (with 10Gi persistent storage)
- Loki Service
- Loki ConfigMap with 7-day retention

**Resources**: 128Mi-512Mi RAM, 100m-500m CPU

### 2. Deploy Promtail

```bash
kubectl apply -f infra/k8s/promtail-daemonset.yaml
```

This creates:

- Promtail DaemonSet (runs on every node)
- ServiceAccount and RBAC permissions
- Promtail ConfigMap for log scraping

**Resources**: 64Mi-128Mi RAM per node, 50m-200m CPU

### 3. Update OTEL Collector Config

The OTEL collector config has been updated to include a logs pipeline.

```bash
# Apply the updated config
kubectl apply -f infra/k8s/otel-collector-config.yaml

# Restart OTEL collector to pick up changes
kubectl rollout restart deployment/otel-collector -n battlescope
```

### 4. Update Grafana Datasources

```bash
# Apply updated Grafana datasources config
kubectl apply -f infra/k8s/grafana-config.yaml

# Restart Grafana to pick up changes
kubectl rollout restart deployment/grafana -n battlescope
```

Or use the convenient Makefile command:

```bash
make k8s-restart-observability
```

## Verification

### Check Deployment Status

```bash
# Check all logging components
kubectl get pods -n battlescope | grep -E 'loki|promtail|otel'

# Check Loki logs
kubectl logs -n battlescope -l app=loki --tail=50

# Check Promtail logs
kubectl logs -n battlescope -l app=promtail --tail=50
```

### Access Grafana

1. Port-forward Grafana:

   ```bash
   kubectl port-forward -n battlescope svc/grafana 3001:3000
   ```

2. Open http://localhost:3001

3. Go to **Explore** → Select **Loki** datasource

4. Try a query:
   ```logql
   {app="api"} |= "error"
   ```

### Access Loki UI Directly (Optional)

If you need to access Loki directly (for debugging), you can port-forward:

```bash
kubectl port-forward -n battlescope svc/loki 3100:3100
```

Then access:

- **LogQL API**: http://localhost:3100/loki/api/v1/query_range
- **Metrics**: http://localhost:3100/metrics
- **Health**: http://localhost:3100/ready

Note: Loki's built-in UI is minimal. For querying logs, use Grafana's Explore view.

## Log Queries (LogQL)

### Basic Queries

```logql
# All logs from API service
{app="api"}

# Error logs only
{app="api"} |= "error"

# Logs from specific pod
{pod="api-6867c7fd4-8689s"}

# Last 5 minutes of ingest service logs
{app="ingest"} [5m]
```

### Filtering by Package and File

```logql
# All logs from auth package (across all services)
{package="auth"}

# Logs from a specific file
{file="backend/api/src/routes/auth.ts"}

# Auth package error logs
{package="auth"} | json | level >= 50

# Database package logs
{package="database"}

# All auth route logs
{file=~".*routes/auth.*"}
```

### Advanced Queries

```logql
# Count errors per minute by package
sum by (package) (rate({namespace="battlescope"} | json | level >= 50 [1m]))

# Filter by log level (Pino)
{app="api"} | json | level >= 50

# OAuth callback logs from specific file
{file="backend/api/src/routes/auth.ts"} |= "auth callback"

# Response time > 1s
{app="api"} | json | responseTime > 1000

# All database query logs
{package="database"} |= "query"

# ESI client errors
{package="esi-client"} | json | level >= 50
```

### Trace Correlation

When viewing a trace in Jaeger, you can click on a span and it will show you a link to related logs in Loki!

Similarly, in Loki, if your logs contain trace IDs, you can click to jump to the trace in Jaeger.

## Log Labels

Promtail automatically adds these labels to all logs:

- `namespace` - Kubernetes namespace (battlescope)
- `app` - Application name (api, ingest, enrichment, etc.)
- `pod` - Pod name
- `container` - Container name
- `package` - Source package (api, ingest, auth, database, etc.)
- `file` - Source file path (e.g., backend/api/src/routes/auth.ts)

Pino JSON logs also include:

- `level` - Log level (10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal)
- `msg` - Log message
- `reqId` - Request ID (for request tracking)
- `time` - Timestamp
- `caller` - Function/method name (when available)
- `package` - Package that generated the log
- `file` - File that generated the log

## Storage and Retention

### Current Settings

- **Retention**: 1 hour (aggressive cleanup)
- **Storage**: 2Gi PersistentVolume per Loki replica
- **Compaction**: Runs every 5 minutes
- **Deletion delay**: 5 minutes after expiry
- **Compression**: Automatic (Loki compresses old chunks)

### Why 1 Hour?

This configuration is optimized for:

1. **Real-time debugging** - Full logs available for recent activity
2. **Minimal storage costs** - Logs older than 1 hour are automatically deleted
3. **Maximum capture** - No rate limiting means you get ALL logs
4. **Development workflow** - Perfect for testing and debugging sessions

### Adjusting Retention

If you need longer retention, edit `infra/k8s/loki-deployment.yaml`:

```yaml
limits_config:
  retention_period: 3h # Or 6h, 12h, 24h, etc.
  max_query_lookback: 3h # Match retention period
  reject_old_samples_max_age: 3h # Match retention period

chunk_store_config:
  max_look_back_period: 3h # Match retention period

table_manager:
  retention_period: 3h # Match retention period
```

**Important**: If increasing retention beyond 6h, also increase storage:

```yaml
volumeClaimTemplates:
  resources:
    requests:
      storage: 5Gi # Or 10Gi for 24h+
```

Then restart Loki:

```bash
kubectl apply -f infra/k8s/loki-deployment.yaml
kubectl rollout restart statefulset/loki -n battlescope
```

### Storage Usage

Check current storage:

```bash
kubectl exec -n battlescope loki-0 -- df -h /loki
```

## Troubleshooting

### Loki Not Receiving Logs

1. Check Promtail is running:

   ```bash
   kubectl get ds promtail -n battlescope
   ```

2. Check Promtail logs for errors:

   ```bash
   kubectl logs -n battlescope -l app=promtail --tail=100
   ```

3. Verify Promtail can reach Loki:
   ```bash
   kubectl exec -n battlescope -l app=promtail -- wget -O- http://loki:3100/ready
   ```

### OTEL Logs Not Forwarding

1. Check OTEL collector logs:

   ```bash
   kubectl logs -n battlescope -l app=otel-collector --tail=100 | grep -i loki
   ```

2. Verify Loki endpoint is accessible:
   ```bash
   kubectl exec -n battlescope -l app=otel-collector -- wget -O- http://loki:3100/ready
   ```

### Grafana Not Showing Loki Datasource

1. Check Grafana logs:

   ```bash
   kubectl logs -n battlescope -l app=grafana --tail=100
   ```

2. Verify datasources config:

   ```bash
   kubectl get cm grafana-datasources -n battlescope -o yaml
   ```

3. Restart Grafana:
   ```bash
   kubectl rollout restart deployment/grafana -n battlescope
   ```

## Resource Usage

Expected resource consumption with **1-hour retention, maximum capture** configuration:

| Component           | Memory    | CPU      | Storage | Notes                            |
| ------------------- | --------- | -------- | ------- | -------------------------------- |
| Loki                | 128-512Mi | 100-500m | 2Gi     | May spike during high log volume |
| Promtail (per node) | 64-128Mi  | 50-200m  | None    | Scales with number of pods       |
| OTEL Collector      | 256-512Mi | 100-500m | None    | -                                |

Total additional overhead: ~500Mi-1Gi RAM, ~300m-1000m CPU, 2Gi storage

**Note**: With maximum capture enabled (no rate limiting), Loki may use more CPU/memory during high log volume. The configuration allows:

- Up to 100MB/s ingestion rate
- 200MB burst capacity
- Unlimited streams per service
- 1MB batches from Promtail

This ensures you capture **everything** your applications log during the 1-hour window.

## Complete Setup Script

```bash
#!/bin/bash

# Deploy logging stack
echo "Deploying Loki..."
kubectl apply -f infra/k8s/loki-deployment.yaml

echo "Deploying Promtail..."
kubectl apply -f infra/k8s/promtail-daemonset.yaml

echo "Updating OTEL Collector config..."
kubectl apply -f infra/k8s/otel-collector-config.yaml

echo "Updating Grafana datasources..."
kubectl apply -f infra/k8s/grafana-config.yaml

echo "Restarting observability stack..."
make k8s-restart-observability

echo "Waiting for pods to be ready..."
kubectl wait --for=condition=ready pod -l app=loki -n battlescope --timeout=120s
kubectl wait --for=condition=ready pod -l app=promtail -n battlescope --timeout=60s

echo "✅ Logging stack deployed successfully!"
echo ""
echo "Access Grafana UI:"
echo "  kubectl port-forward -n battlescope svc/grafana 3001:3000"
echo "  Then open: http://localhost:3001"
```

## Next Steps

1. **Create Dashboards**: Build Grafana dashboards for common log patterns
2. **Set Up Alerts**: Configure Loki alerting rules for errors and anomalies
3. **Add Trace IDs**: Ensure all logs include trace IDs for better correlation
4. **Log Sampling**: For high-volume services, consider log sampling in Promtail

## Resources

- [Loki Documentation](https://grafana.com/docs/loki/latest/)
- [LogQL Query Language](https://grafana.com/docs/loki/latest/logql/)
- [Promtail Configuration](https://grafana.com/docs/loki/latest/clients/promtail/)
