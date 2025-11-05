# Observability Stack

This deployment includes a complete observability stack with OpenTelemetry, Jaeger, Prometheus, and Grafana.

## Components

### OpenTelemetry Collector
- **Purpose**: Receives telemetry data (traces and metrics) from all BattleScope services
- **Endpoint**: `http://otel-collector:4318` (OTLP HTTP)
- **Ports**:
  - 4317: OTLP gRPC
  - 4318: OTLP HTTP
  - 8888: Collector metrics

### Jaeger
- **Purpose**: Distributed tracing UI and storage
- **UI Access**: http://\<node-ip\>:30686
- **Features**:
  - View distributed traces across services
  - Service dependency graphs
  - Performance analysis

### Prometheus
- **Purpose**: Metrics storage and querying
- **UI Access**: http://\<node-ip\>:30090
- **Features**:
  - Time-series metrics storage
  - PromQL query language
  - Service metrics scraping

### Grafana
- **Purpose**: Visualization and dashboards
- **UI Access**: http://\<node-ip\>:30300
- **Default Credentials**: admin/admin
- **Pre-configured Datasources**:
  - Prometheus (default)
  - Jaeger

## Deployment

Deploy the observability stack:

```bash
# Deploy configuration
kubectl apply -f infra/k8s/prometheus-config.yaml
kubectl apply -f infra/k8s/grafana-config.yaml
kubectl apply -f infra/k8s/otel-collector-config.yaml

# Deploy services
kubectl apply -f infra/k8s/jaeger-deployment.yaml
kubectl apply -f infra/k8s/prometheus-deployment.yaml
kubectl apply -f infra/k8s/otel-collector-deployment.yaml
kubectl apply -f infra/k8s/grafana-deployment.yaml

# Update ConfigMap with OTEL settings (if not already done)
kubectl apply -f infra/k8s/configmap.yaml

# Restart application pods to pick up OTEL configuration
kubectl rollout restart deployment/api -n battlescope
kubectl rollout restart deployment/ingest -n battlescope
kubectl rollout restart deployment/enrichment -n battlescope
kubectl rollout restart deployment/clusterer -n battlescope
```

## Accessing the UIs

After deployment, access the observability tools via NodePort:

- **Jaeger UI**: http://\<node-ip\>:30686
- **Prometheus**: http://\<node-ip\>:30090
- **Grafana**: http://\<node-ip\>:30300

To get your node IP:
```bash
kubectl get nodes -o wide
```

## Configuration

### Application Telemetry

Each service is configured with:
- `OTEL_EXPORTER_OTLP_ENDPOINT`: http://otel-collector:4318
- `OTEL_SERVICE_NAME`: Service-specific name (e.g., battlescope-api)
- `OTEL_METRIC_EXPORT_INTERVAL`: 15000 (15 seconds)

### Data Flow

1. **Applications** → Send traces/metrics via OTLP → **OTEL Collector**
2. **OTEL Collector** → Forwards traces → **Jaeger**
3. **OTEL Collector** → Forwards metrics → **Prometheus**
4. **Grafana** → Queries data from → **Prometheus** & **Jaeger**

## Usage Examples

### View Traces in Jaeger

1. Open Jaeger UI: http://\<node-ip\>:30686
2. Select a service (e.g., battlescope-api)
3. Click "Find Traces"
4. Click on a trace to see the full span details

### Query Metrics in Prometheus

1. Open Prometheus: http://\<node-ip\>:30090
2. Navigate to Graph
3. Example queries:
   ```promql
   # Service uptime
   battlescope_service_up

   # Process uptime by service
   battlescope_process_uptime_seconds{service_name="battlescope-api"}

   # HTTP request rate (if instrumented)
   rate(http_requests_total[5m])
   ```

### Create Dashboards in Grafana

1. Open Grafana: http://\<node-ip\>:30300
2. Login with admin/admin (change password on first login)
3. Click "+" → "Dashboard" → "Add new panel"
4. Select Prometheus datasource
5. Enter a PromQL query
6. Configure visualization and save

### Example Grafana Dashboard Queries

**Service Health Panel:**
```promql
battlescope_service_up
```

**Service Uptime:**
```promql
battlescope_process_uptime_seconds
```

**Request Rate (if HTTP metrics are exported):**
```promql
rate(http_requests_total[5m])
```

## Troubleshooting

### Check OTEL Collector Status
```bash
kubectl logs -n battlescope deployment/otel-collector
kubectl get pods -n battlescope -l app=otel-collector
```

### Check if Services are Sending Telemetry
```bash
# Check service logs for OTEL warnings
kubectl logs -n battlescope deployment/api | grep -i otel
```

### Verify Prometheus is Scraping
1. Open Prometheus UI: http://\<node-ip\>:30090
2. Go to Status → Targets
3. Check that otel-collector and jaeger targets are "UP"

### Check Jaeger is Receiving Traces
```bash
kubectl logs -n battlescope deployment/jaeger
```

## Environment Variables

Applications use these environment variables for telemetry:

| Variable | Value | Description |
|----------|-------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | http://otel-collector:4318 | OTEL Collector endpoint |
| `OTEL_SERVICE_NAME` | battlescope-{service} | Service identifier |
| `OTEL_METRIC_EXPORT_INTERVAL` | 15000 | Metric export interval (ms) |

## Storage Considerations

Current setup uses `emptyDir` volumes for data storage, which means:
- ⚠️ Data is lost when pods restart
- Suitable for development/testing

For production, consider:
- Using PersistentVolumes for Prometheus
- External storage for Jaeger (Cassandra, Elasticsearch)
- Grafana with persistent storage for dashboards

## Customization

### Adding Custom Metrics

Add custom metrics in your application code:

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('my-service');
const counter = meter.createCounter('my_counter', {
  description: 'Counts something important'
});

counter.add(1, { label: 'value' });
```

### Adding Prometheus Scrape Annotations

To have Prometheus scrape your service directly (in addition to OTEL):

```yaml
metadata:
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "3000"
    prometheus.io/path: "/metrics"
```

## Architecture Diagram

```
┌─────────────┐
│ Application │
│  Services   │
└─────┬───────┘
      │ OTLP (HTTP/gRPC)
      ▼
┌─────────────────┐
│ OTEL Collector  │
└────┬────────┬───┘
     │        │
     │        └─────────────┐
     │ Traces              │ Metrics
     ▼                     ▼
┌────────┐          ┌────────────┐
│ Jaeger │          │ Prometheus │
└────┬───┘          └─────┬──────┘
     │                    │
     └──────┬─────────────┘
            │ Datasources
            ▼
       ┌─────────┐
       │ Grafana │
       └─────────┘
```
