# {{SERVICE_NAME}} Docker Image

**Image**: `petdog/battlescope-{{SERVICE_NAME_LOWER}}`
**Docker Hub**: https://hub.docker.com/r/petdog/battlescope-{{SERVICE_NAME_LOWER}}
**Status**: {{STATUS}} <!-- Production / Beta / Alpha -->

## Overview

{{SERVICE_DESCRIPTION}}

### Key Features

- {{FEATURE_1}}
- {{FEATURE_2}}
- {{FEATURE_3}}

### Architecture Role

{{ARCHITECTURE_DESCRIPTION}}

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `{{VAR_1}}` | Yes | - | {{VAR_1_DESC}} |
| `{{VAR_2}}` | No | `{{VAR_2_DEFAULT}}` | {{VAR_2_DESC}} |
| `{{VAR_3}}` | No | `{{VAR_3_DEFAULT}}` | {{VAR_3_DESC}} |

#### Database Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `POSTGRES_HOST` | No | `localhost` | PostgreSQL host (alternative to DATABASE_URL) |
| `POSTGRES_PORT` | No | `5432` | PostgreSQL port |
| `POSTGRES_USER` | No | - | PostgreSQL username |
| `POSTGRES_PASSWORD` | No | - | PostgreSQL password |
| `POSTGRES_DB` | No | - | PostgreSQL database name |

#### Redis Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | Yes | - | Redis connection string |

#### Observability

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `info` | Logging level (trace, debug, info, warn, error, fatal) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | - | OpenTelemetry collector endpoint |
| `OTEL_SERVICE_NAME` | No | `{{SERVICE_NAME_LOWER}}` | Service name for tracing |
| `OTEL_METRIC_EXPORT_INTERVAL` | No | `60000` | Metrics export interval (ms) |

#### Application

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `production` | Node environment (development, production) |
| `PORT` | No | `{{DEFAULT_PORT}}` | HTTP server port |
| `HOST` | No | `0.0.0.0` | HTTP server host |

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| {{PORT_1}} | HTTP | {{PORT_1_DESC}} |
| {{PORT_2}} | {{PORT_2_PROTOCOL}} | {{PORT_2_DESC}} |

## Health Checks

### Liveness Probe
{{LIVENESS_DESCRIPTION}}

**Endpoint**: `{{LIVENESS_ENDPOINT}}`
**Expected Response**: {{LIVENESS_RESPONSE}}

### Readiness Probe
{{READINESS_DESCRIPTION}}

**Endpoint**: `{{READINESS_ENDPOINT}}`
**Expected Response**: {{READINESS_RESPONSE}}

## Usage

### Docker Run

```bash
docker run -d \
  --name battlescope-{{SERVICE_NAME_LOWER}} \
  -p {{EXPOSED_PORT}}:{{CONTAINER_PORT}} \
  -e DATABASE_URL="postgresql://user:pass@host:5432/dbname" \
  -e REDIS_URL="redis://host:6379" \
  -e LOG_LEVEL="info" \
  -e {{VAR_1}}="{{VAR_1_EXAMPLE}}" \
  petdog/battlescope-{{SERVICE_NAME_LOWER}}:latest
```

### Docker Compose

```yaml
version: '3.8'

services:
  {{SERVICE_NAME_LOWER}}:
    image: petdog/battlescope-{{SERVICE_NAME_LOWER}}:latest
    container_name: battlescope-{{SERVICE_NAME_LOWER}}
    restart: unless-stopped
    ports:
      - "{{EXPOSED_PORT}}:{{CONTAINER_PORT}}"
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/battlescope
      REDIS_URL: redis://redis:6379
      LOG_LEVEL: info
      {{VAR_1}}: "{{VAR_1_EXAMPLE}}"
    depends_on:
      - postgres
      - redis
    networks:
      - battlescope
    {{ADDITIONAL_COMPOSE_CONFIG}}

networks:
  battlescope:
    driver: bridge
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{SERVICE_NAME_LOWER}}
  namespace: battlescope
  labels:
    app: {{SERVICE_NAME_LOWER}}
    component: {{COMPONENT_TYPE}}
spec:
  replicas: {{REPLICA_COUNT}}
  selector:
    matchLabels:
      app: {{SERVICE_NAME_LOWER}}
  template:
    metadata:
      labels:
        app: {{SERVICE_NAME_LOWER}}
    spec:
      containers:
        - name: {{SERVICE_NAME_LOWER}}
          image: petdog/battlescope-{{SERVICE_NAME_LOWER}}:latest
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: {{CONTAINER_PORT}}
              protocol: TCP
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: redis-secret
                  key: url
            - name: LOG_LEVEL
              value: "info"
            - name: {{VAR_1}}
              value: "{{VAR_1_EXAMPLE}}"
          resources:
            requests:
              cpu: {{CPU_REQUEST}}
              memory: {{MEMORY_REQUEST}}
            limits:
              cpu: {{CPU_LIMIT}}
              memory: {{MEMORY_LIMIT}}
          livenessProbe:
            {{LIVENESS_PROBE_CONFIG}}
          readinessProbe:
            {{READINESS_PROBE_CONFIG}}
---
apiVersion: v1
kind: Service
metadata:
  name: {{SERVICE_NAME_LOWER}}
  namespace: battlescope
  labels:
    app: {{SERVICE_NAME_LOWER}}
spec:
  type: ClusterIP
  ports:
    - port: {{SERVICE_PORT}}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app: {{SERVICE_NAME_LOWER}}
```

## Resource Requirements

### Minimum
```yaml
resources:
  requests:
    cpu: {{MIN_CPU}}
    memory: {{MIN_MEMORY}}
```

### Recommended
```yaml
resources:
  requests:
    cpu: {{REC_CPU}}
    memory: {{REC_MEMORY}}
  limits:
    cpu: {{REC_CPU_LIMIT}}
    memory: {{REC_MEMORY_LIMIT}}
```

### High Load
```yaml
resources:
  requests:
    cpu: {{HIGH_CPU}}
    memory: {{HIGH_MEMORY}}
  limits:
    cpu: {{HIGH_CPU_LIMIT}}
    memory: {{HIGH_MEMORY_LIMIT}}
```

## Dependencies

### Required Services
- **PostgreSQL 15+**: {{POSTGRES_USAGE}}
- **Redis 7+**: {{REDIS_USAGE}}

### Optional Services
- **{{OPTIONAL_DEP_1}}**: {{OPTIONAL_DEP_1_DESC}}
- **{{OPTIONAL_DEP_2}}**: {{OPTIONAL_DEP_2_DESC}}

### External APIs
- **{{EXTERNAL_API_1}}**: {{EXTERNAL_API_1_DESC}}
- **{{EXTERNAL_API_2}}**: {{EXTERNAL_API_2_DESC}}

## Build Information

### Dockerfile
**Location**: `{{DOCKERFILE_PATH}}`

### Build Command

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  {{BUILD_ARGS}} \
  -t petdog/battlescope-{{SERVICE_NAME_LOWER}}:latest \
  -f {{DOCKERFILE_PATH}} \
  .
```

### Build Arguments
{{BUILD_ARGS_TABLE}}

### Multi-Stage Build
{{MULTISTAGE_DESCRIPTION}}

## Volumes

{{VOLUMES_DESCRIPTION}}

```yaml
volumes:
  - name: {{VOLUME_1_NAME}}
    mountPath: {{VOLUME_1_PATH}}
    description: {{VOLUME_1_DESC}}
```

## Networking

### Ingress Requirements
{{INGRESS_REQUIREMENTS}}

### Network Policies
{{NETWORK_POLICY_DESCRIPTION}}

## Monitoring

### Metrics Exposed

| Metric | Type | Description |
|--------|------|-------------|
| `{{METRIC_1}}` | {{METRIC_1_TYPE}} | {{METRIC_1_DESC}} |
| `{{METRIC_2}}` | {{METRIC_2_TYPE}} | {{METRIC_2_DESC}} |

### Logs

**Format**: JSON (structured logging with Pino)
**Level**: Configurable via `LOG_LEVEL` environment variable

Example log entry:
```json
{
  "level": 30,
  "time": 1699999999999,
  "pid": 1,
  "hostname": "{{SERVICE_NAME_LOWER}}-xyz",
  "msg": "{{EXAMPLE_LOG_MESSAGE}}"
}
```

### Tracing

**Format**: OpenTelemetry
**Sampling**: {{SAMPLING_STRATEGY}}

## Troubleshooting

### Service Won't Start

**Symptoms**: Container exits immediately or crashes on startup

**Common Causes**:
1. Missing required environment variables
2. Cannot connect to PostgreSQL
3. Cannot connect to Redis
4. {{CUSTOM_ISSUE_1}}

**Solution**:
```bash
# Check logs
docker logs battlescope-{{SERVICE_NAME_LOWER}}

# Or in Kubernetes
kubectl logs -n battlescope deployment/{{SERVICE_NAME_LOWER}} --tail=100

# Verify environment variables
kubectl get deployment {{SERVICE_NAME_LOWER}} -n battlescope -o yaml | grep -A 50 "env:"
```

### {{ISSUE_2}}

**Symptoms**: {{ISSUE_2_SYMPTOMS}}

**Solution**: {{ISSUE_2_SOLUTION}}

### {{ISSUE_3}}

**Symptoms**: {{ISSUE_3_SYMPTOMS}}

**Solution**: {{ISSUE_3_SOLUTION}}

## Performance Tuning

### {{PERF_AREA_1}}

{{PERF_AREA_1_DESCRIPTION}}

**Recommendations**:
- {{PERF_REC_1}}
- {{PERF_REC_2}}

### {{PERF_AREA_2}}

{{PERF_AREA_2_DESCRIPTION}}

**Recommendations**:
- {{PERF_REC_3}}
- {{PERF_REC_4}}

## Security

### Secrets Management
{{SECRETS_DESCRIPTION}}

### Network Security
{{NETWORK_SECURITY_DESCRIPTION}}

### Container Security
- Runs as non-root user (`node`)
- Minimal base image (node:20-slim)
- No unnecessary capabilities
- Read-only root filesystem: {{RO_FILESYSTEM}}

### Vulnerability Scanning
Images are automatically scanned with Trivy in CI/CD pipeline.

## Scaling

### Horizontal Scaling
{{HORIZONTAL_SCALING_DESCRIPTION}}

**Recommended**:
```yaml
spec:
  replicas: {{RECOMMENDED_REPLICAS}}
```

**Maximum**:
```yaml
spec:
  replicas: {{MAX_REPLICAS}}
```

### Vertical Scaling
{{VERTICAL_SCALING_DESCRIPTION}}

## Maintenance

### Backup Requirements
{{BACKUP_REQUIREMENTS}}

### Update Strategy
```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

### Graceful Shutdown
{{GRACEFUL_SHUTDOWN_DESCRIPTION}}

## Related Documentation

- **Architecture**: [System Architecture](../architecture.md)
- **API Documentation**: {{API_DOCS_LINK}}
- **Source Code**: `{{SOURCE_PATH}}`
- **Kubernetes Manifests**: `infra/k8s/{{SERVICE_NAME_LOWER}}-deployment.yaml`

## Changelog

### Latest ({{LATEST_VERSION}})
- {{CHANGE_1}}
- {{CHANGE_2}}
- {{CHANGE_3}}

## Support

For issues or questions:
- **GitHub Issues**: https://github.com/YOUR_ORG/battle-monitor/issues
- **Documentation**: https://github.com/YOUR_ORG/battle-monitor/tree/main/docs

---

**Last Updated**: {{LAST_UPDATED}}
**Maintained By**: BattleScope Team
**License**: {{LICENSE}}
