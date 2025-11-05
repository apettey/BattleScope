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

1. **Applications** → Push traces/metrics via OTLP HTTP → **OTEL Collector** (port 4318)
2. **OTEL Collector** → Forwards traces → **Jaeger** (port 4317)
3. **OTEL Collector** → Pushes metrics via Remote Write → **Prometheus** (port 9090/api/v1/write)
4. **Grafana** → Queries data from → **Prometheus** & **Jaeger**

Note: This setup uses **push-based metrics** (OTLP → Remote Write), not pull-based scraping.

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

## How Metrics Work

### Metrics Flow Architecture

The metrics system uses OpenTelemetry's push-based approach with Prometheus remote write:

1. **Application Instrumentation**: Services use `@battlescope/shared` package which:
   - Initializes the OpenTelemetry SDK
   - Exports custom metrics like `battlescope_service_up` and `battlescope_process_uptime_seconds`
   - Pushes metrics to OTEL Collector via OTLP HTTP (port 4318)

2. **OTEL Collector**: Receives metrics and:
   - Processes them with batch and memory_limiter processors
   - Pushes them to Prometheus using the Remote Write API (`http://prometheus:9090/api/v1/write`)

3. **Prometheus**: Receives pushed metrics via the remote write receiver (enabled with `--web.enable-remote-write-receiver`)

### Available Metrics

Default metrics exported by all services:

- `battlescope_service_up{service_name="..."}` - Always 1 when service is running
- `battlescope_process_uptime_seconds{service_name="..."}` - Service uptime in seconds

## Troubleshooting

### No Metrics Appearing in Prometheus

1. **Verify Prometheus remote write receiver is enabled**:
```bash
# Check Prometheus args include --web.enable-remote-write-receiver
kubectl describe deployment/prometheus -n battlescope | grep enable-remote-write-receiver
```

2. **Check OTEL Collector is sending metrics**:
```bash
# Look for remote write logs in OTEL Collector
kubectl logs -n battlescope deployment/otel-collector | grep -i "remote\|metric"
```

3. **Check application is sending metrics**:
```bash
# Look for OTEL initialization in application logs
kubectl logs -n battlescope deployment/api | grep -i telemetry
```

4. **Verify environment variables are set**:
```bash
kubectl exec -n battlescope deployment/api -- env | grep OTEL
```

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

### Verify Metrics in Prometheus
1. Open Prometheus UI: http://\<node-ip\>:30090
2. Go to Graph
3. Query: `battlescope_service_up`
4. You should see metrics with labels like `service_name="battlescope-api"`

### Check Jaeger is Receiving Traces
```bash
kubectl logs -n battlescope deployment/jaeger
```

### Test Metrics End-to-End

```bash
# Query Prometheus for battlescope metrics
kubectl run -n battlescope curl-test --image=curlimages/curl --rm -it --restart=Never -- \
  curl -s 'http://prometheus:9090/api/v1/query?query=battlescope_service_up'
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

### Using Remote Write

The current setup uses **Prometheus Remote Write** instead of scraping. This means:

- ✅ Applications push metrics to OTEL Collector (no need to expose `/metrics` endpoints)
- ✅ OTEL Collector pushes metrics to Prometheus (no scraping configuration needed per service)
- ✅ Simplified configuration - just set OTEL environment variables
- ✅ Consistent telemetry pipeline (traces and metrics both use OTLP)

If you need to add direct scraping for a service, add these annotations to the pod template:

```yaml
metadata:
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "3000"
    prometheus.io/path: "/metrics"
```

And ensure the service exposes a `/metrics` endpoint in Prometheus format.

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│     Application Services                │
│  (api, ingest, enrichment, clusterer)   │
│         OpenTelemetry SDK               │
└─────────────┬───────────────────────────┘
              │ Push OTLP HTTP
              │ (port 4318)
              ▼
      ┌───────────────┐
      │ OTEL Collector│
      │  - Receives   │
      │  - Processes  │
      │  - Exports    │
      └───┬───────┬───┘
          │       │
   Traces │       │ Metrics
   (gRPC) │       │ (Remote Write)
          │       │
          ▼       ▼
     ┌────────┐  ┌────────────┐
     │ Jaeger │  │ Prometheus │
     │        │  │ (Remote    │
     │        │  │  Write RX) │
     └────┬───┘  └─────┬──────┘
          │            │
          └──────┬─────┘
           Query │ Datasources
                 ▼
            ┌─────────┐
            │ Grafana │
            └─────────┘
```
