# Typesense Deployment for BattleScope

This directory contains Kubernetes manifests for deploying Typesense search engine with full observability.

## Overview

Typesense is deployed as a 3-node StatefulSet with RAFT consensus for high availability. The deployment includes:

- **Metrics**: Exported to Prometheus via ServiceMonitor/PodMonitor
- **Logging**: JSON logs sent to stdout, collected by Loki via Promtail
- **Tracing**: Application-level tracing via OpenTelemetry in the search package

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Typesense Cluster                         │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │ typesense-0│  │ typesense-1│  │ typesense-2│           │
│  │            │  │            │  │            │           │
│  │  Leader    │◄─┤  Follower  │◄─┤  Follower  │           │
│  │  (RAFT)    │─►│            │─►│            │           │
│  └────────────┘  └────────────┘  └────────────┘           │
│        │               │               │                    │
│        └───────────────┴───────────────┘                    │
│                        │                                     │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         │ Port 8108
                         ▼
              ┌─────────────────────┐
              │  typesense-lb       │  ← ClusterIP Service
              │  (Load Balancer)    │
              └─────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   BattleScope API   │
              └─────────────────────┘
```

## Deployment

### Prerequisites

1. **Kubernetes cluster** with kubectl configured
2. **Prometheus Operator** installed (for ServiceMonitor)
3. **Loki** and **Promtail** installed for log aggregation
4. **StorageClass** named `fast-ssd` (or modify typesense-statefulset.yaml)

### 1. Create Namespace

```bash
kubectl create namespace battlescope
```

### 2. Deploy Typesense

```bash
# Navigate to the k8s directory
cd infra/k8s

# Create secret (IMPORTANT: Change the API key first!)
kubectl apply -f typesense-secret.yaml

# Deploy StatefulSet
kubectl apply -f typesense-statefulset.yaml

# Deploy monitoring (if Prometheus Operator is installed)
kubectl apply -f typesense-servicemonitor.yaml
kubectl apply -f typesense-podmonitor.yaml

# Deploy daily entity sync CronJob
kubectl apply -f typesense-entity-sync-cronjob.yaml
```

### 3. Verify Deployment

```bash
# Check StatefulSet status
kubectl get statefulset -n battlescope typesense

# Check pods
kubectl get pods -n battlescope -l app=typesense

# Check logs
kubectl logs -n battlescope typesense-0 -f

# Check cluster health
kubectl exec -n battlescope typesense-0 -- curl -s http://localhost:8108/health
```

## Configuration

### Environment Variables

The Typesense pods are configured with the following environment variables:

- `TYPESENSE_API_KEY`: API key for authentication (from secret)
- `POD_IP`: Pod IP address for peering
- `TYPESENSE_NODES`: Comma-separated list of peer nodes

### Resource Limits

**Requests:**

- CPU: 500m
- Memory: 512Mi

**Limits:**

- CPU: 2000m (2 cores)
- Memory: 2Gi

Adjust these based on your search load and available cluster resources.

### Storage

Each Typesense pod uses a 20Gi persistent volume. The data is stored in `/data` inside the container.

**Storage Class**: `fast-ssd` (modify if your cluster uses a different storage class)

## Observability

### Prometheus Metrics

Typesense exposes metrics at `/metrics` on port 8108. The following metrics are available:

- `typesense_requests_total` - Total number of search requests
- `typesense_search_latency_seconds` - Search request latency
- `typesense_index_size_bytes` - Size of indexed data
- `typesense_memory_usage_bytes` - Memory usage
- And more...

**Access Metrics:**

```bash
kubectl port-forward -n battlescope typesense-0 8108:8108
curl http://localhost:8108/metrics
```

**Prometheus Query Examples:**

```promql
# Request rate
rate(typesense_requests_total[5m])

# P95 latency
histogram_quantile(0.95, rate(typesense_search_latency_seconds_bucket[5m]))

# Memory usage
typesense_memory_usage_bytes
```

### Loki Logging

Typesense logs are written to stdout in plain text format and automatically collected by Promtail/Loki.

**View Logs in Grafana:**

```logql
{namespace="battlescope", app="typesense"}
```

**Filter by log level:**

```logql
{namespace="battlescope", app="typesense"} |= "ERROR"
```

### Jaeger Tracing

Application-level tracing is handled by the `@battlescope/search` package using OpenTelemetry. The search service automatically:

- Creates spans for all search operations
- Propagates trace context to Typesense
- Records exceptions and errors
- Exports traces to Jaeger

**View Traces:**

1. Open Jaeger UI
2. Select service: `battlescope.search.service`
3. Search for traces

**Example Traces:**

- `search.autocomplete_entities`
- `search.autocomplete_systems`
- `search.global_search`
- `search.battles`

## Health Checks

### Liveness Probe

Checks if Typesense is alive and responding:

- **Endpoint**: `GET /health`
- **Initial Delay**: 30s
- **Period**: 10s
- **Timeout**: 5s
- **Failure Threshold**: 3

### Readiness Probe

Checks if Typesense is ready to serve traffic:

- **Endpoint**: `GET /health`
- **Initial Delay**: 10s
- **Period**: 5s
- **Timeout**: 3s
- **Failure Threshold**: 3

### Manual Health Check

```bash
# Check individual pod
kubectl exec -n battlescope typesense-0 -- curl http://localhost:8108/health

# Check via service
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://typesense-lb.battlescope.svc.cluster.local:8108/health
```

## Scaling

### Vertical Scaling

To increase resources for individual pods:

```yaml
resources:
  requests:
    memory: '1Gi' # Increase memory
    cpu: '1000m' # Increase CPU
  limits:
    memory: '4Gi'
    cpu: '4000m'
```

### Horizontal Scaling

To add more Typesense nodes:

```bash
# Scale to 5 nodes
kubectl scale statefulset typesense -n battlescope --replicas=5
```

**Note**: You must also update the `TYPESENSE_NODES` environment variable to include the new nodes.

## Maintenance

### Backup

Typesense data is stored in PersistentVolumes. Back up using volume snapshots:

```bash
# Create snapshot of typesense-0 volume
kubectl get pvc -n battlescope
# Use your cloud provider's snapshot tool
```

### Rolling Update

```bash
# Update the image version
kubectl set image statefulset/typesense typesense=typesense/typesense:27.0 -n battlescope

# Watch the rollout
kubectl rollout status statefulset/typesense -n battlescope
```

### Restart

```bash
# Restart all pods (rolling restart)
kubectl rollout restart statefulset/typesense -n battlescope
```

## Troubleshooting

### Pod Won't Start

```bash
# Check pod events
kubectl describe pod -n battlescope typesense-0

# Check logs
kubectl logs -n battlescope typesense-0

# Common issues:
# - PVC not bound (check storage class)
# - Secret not found (create secret first)
# - Insufficient resources (check node capacity)
```

### Cluster Not Forming

```bash
# Check if pods can reach each other
kubectl exec -n battlescope typesense-0 -- \
  curl http://typesense-1.typesense.battlescope.svc.cluster.local:8107/health

# Check peering configuration
kubectl logs -n battlescope typesense-0 | grep peer
```

### High Memory Usage

```bash
# Check index sizes
kubectl exec -n battlescope typesense-0 -- \
  curl -H "X-TYPESENSE-API-KEY: your-api-key" \
  http://localhost:8108/collections

# Consider increasing memory limits or optimizing collection schemas
```

### Search Performance Issues

1. Check Prometheus metrics for latency spikes
2. Review slow queries in Loki logs
3. Check resource utilization (CPU/memory)
4. Consider adding more replicas
5. Review indexing strategy

## Security

### API Key Management

**IMPORTANT**: The default API key in `typesense-secret.yaml` is for development only. In production:

1. Generate a strong random key:

   ```bash
   openssl rand -base64 32
   ```

2. Create secret with the generated key:

   ```bash
   kubectl create secret generic typesense-secret \
     --from-literal=api-key='YOUR_STRONG_KEY' \
     -n battlescope
   ```

3. Never commit the production API key to version control

### Network Policies

Consider adding NetworkPolicy to restrict access to Typesense:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: typesense-network-policy
  namespace: battlescope
spec:
  podSelector:
    matchLabels:
      app: typesense
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api # Only allow API pods
      ports:
        - protocol: TCP
          port: 8108
```

## Useful Commands

```bash
# Navigate to k8s directory (from repo root)
cd infra/k8s

# Port forward to access Typesense locally
kubectl port-forward -n battlescope svc/typesense-lb 8108:8108

# Execute commands in a pod
kubectl exec -it -n battlescope typesense-0 -- sh

# View real-time logs
kubectl logs -f -n battlescope typesense-0

# Get all resources
kubectl get all -n battlescope -l app=typesense

# Delete everything (careful!)
kubectl delete -f .
```

## References

- [Typesense Documentation](https://typesense.org/docs/)
- [Typesense Clustering Guide](https://typesense.org/docs/guide/high-availability.html)
- [Kubernetes StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
- [Prometheus Operator](https://prometheus-operator.dev/)
