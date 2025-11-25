# BattleScope Enrichment Service Docker Image

**Image Name**: `petdog/battlescope-enrichment:latest`

**Source**: `Dockerfile` with build args `SERVICE_SCOPE=@battlescope/enrichment` and `BUILD_TARGET=backend/enrichment`

## Purpose

BullMQ worker that consumes enrichment jobs from Redis queue, fetches full killmail payloads from zKillboard API, and stores enriched data in the database.

## Features

- Consume enrichment jobs from BullMQ queue
- Fetch full killmail JSON from zKillboard API
- Extract participant details (characters, corps, alliances, ships)
- Store enriched data in database (battle_killmails, battle_participants)
- Respect zKillboard rate limits with configurable throttling
- Automatic retry on failure
- Job prioritization support

## Configuration

### Environment Variables

#### Core Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Health check HTTP port | `3004` | No |
| `HOST` | Host to bind to | `0.0.0.0` | No |
| `LOG_LEVEL` | Logging level (trace, debug, info, warn, error) | `info` | No |

#### Enrichment Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENRICHMENT_CONCURRENCY` | Number of concurrent workers | `5` | No |
| `ENRICHMENT_THROTTLE_MS` | Delay between jobs (ms) | `0` | No |

#### Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |

#### Redis Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `REDIS_URL` | Redis connection string | - | Yes |

#### Observability Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `http://otel-collector:4318` | No |
| `OTEL_SERVICE_NAME` | Service name for telemetry | `battlescope-enrichment` | No |
| `OTEL_METRIC_EXPORT_INTERVAL` | Metrics export interval (ms) | `15000` | No |

## Ports

| Port | Protocol | Description |
|------|----------|-------------|
| 3004 | HTTP | Health check endpoint |

## Health Checks

```bash
curl http://localhost:3004/healthz
```

Returns `200 OK` when healthy (database and Redis connected).

## Job Processing

### Job Payload

```json
{
  "killmailId": "123456789"
}
```

### Processing Flow

1. Consume job from `enrichment:queue`
2. Fetch killmail JSON from `https://zkillboard.com/api/killID/{killmailId}/`
3. Parse victim data (character, corp, alliance, ship)
4. Parse attacker data (all participants)
5. Calculate ISK values
6. Write to `battle_killmails` table
7. Write participants to `battle_participants` table
8. Mark job as completed

### Error Handling

- **HTTP 404**: Killmail not found on zKillboard (mark as failed, no retry)
- **HTTP 429**: Rate limit exceeded (retry with exponential backoff)
- **HTTP 5xx**: Server error (retry up to 3 times)
- **Network error**: Retry with exponential backoff

## Example Usage

### Docker Run

```bash
docker run -d \
  --name battlescope-enrichment \
  -p 3004:3004 \
  -e DATABASE_URL=postgres://user:pass@postgres:5432/battlescope \
  -e REDIS_URL=redis://redis:6379/0 \
  -e ENRICHMENT_CONCURRENCY=5 \
  -e ENRICHMENT_THROTTLE_MS=100 \
  petdog/battlescope-enrichment:latest
```

### Docker Compose

```yaml
services:
  enrichment:
    image: petdog/battlescope-enrichment:latest
    ports:
      - "3004:3004"
    environment:
      PORT: 3004
      HOST: 0.0.0.0
      DATABASE_URL: postgres://battlescope:password@postgres:5432/battlescope
      REDIS_URL: redis://redis:6379/0
      ENRICHMENT_CONCURRENCY: 5
      ENRICHMENT_THROTTLE_MS: 100
      LOG_LEVEL: info
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
```

### Kubernetes Deployment

See `infra/k8s/enrichment-deployment.yaml` for the complete manifest.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: enrichment
  namespace: battlescope
spec:
  replicas: 1
  selector:
    matchLabels:
      app: enrichment
  template:
    metadata:
      labels:
        app: enrichment
    spec:
      containers:
        - name: enrichment
          image: petdog/battlescope-enrichment:latest
          ports:
            - containerPort: 3004
              name: http
          env:
            - name: PORT
              value: "3004"
            - name: HOST
              value: "0.0.0.0"
          envFrom:
            - secretRef:
                name: battlescope-secrets
            - configMapRef:
                name: battlescope-config
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 1Gi
          readinessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 60
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 60
            periodSeconds: 20
```

## Resource Requirements

### Recommended

- **CPU**: 100m request, 500m limit
- **Memory**: 256Mi request, 1Gi limit

### Minimum

- **CPU**: 50m
- **Memory**: 128Mi

## Scaling

The enrichment service can run multiple instances safely. All instances consume from the same BullMQ queue, distributing work automatically.

**Recommended**: 1-3 replicas depending on enrichment backlog

## Dependencies

### Required Services

- **PostgreSQL 15+**: Store enriched killmail data
- **Redis 7+**: BullMQ queue backend
- **zKillboard API**: External data source (internet connection required)

### Optional Services

- **OpenTelemetry Collector**: For metrics and tracing

## Build Information

### Build Command

```bash
docker build \
  --build-arg SERVICE_SCOPE=@battlescope/enrichment \
  --build-arg BUILD_TARGET=backend/enrichment \
  -t petdog/battlescope-enrichment:latest \
  -f Dockerfile \
  .
```

## Metrics

The enrichment service exposes the following metrics:

- `enrichment_jobs_total` - Total jobs processed (succeeded/failed)
- `enrichment_duration_seconds` - Job processing time
- `enrichment_queue_depth` - Current queue depth
- `zkillboard_api_requests_total` - API requests to zKillboard
- `zkillboard_api_errors_total` - API errors by type

## Troubleshooting

### High Queue Depth

1. Increase `ENRICHMENT_CONCURRENCY` (max 10 recommended)
2. Scale up replicas
3. Check for zKillboard API rate limiting
4. Monitor job failure rate

### Jobs Failing

1. Check logs for error details
2. Verify zKillboard API connectivity: `curl https://zkillboard.com/api/killID/1/`
3. Check database connectivity
4. Verify `REDIS_URL` is correct

### Memory Leaks

1. Reduce `ENRICHMENT_CONCURRENCY`
2. Add `ENRICHMENT_THROTTLE_MS` delay
3. Check for large killmails (high participant count)
4. Restart service periodically

## Performance Tuning

### High Throughput

- Increase `ENRICHMENT_CONCURRENCY` to 10
- Remove `ENRICHMENT_THROTTLE_MS` (set to 0)
- Scale to 2-3 replicas
- Ensure database can handle write load

### Rate Limit Friendly

- Set `ENRICHMENT_CONCURRENCY` to 1-3
- Add `ENRICHMENT_THROTTLE_MS` of 100-200ms
- Use single replica

### Balanced

- `ENRICHMENT_CONCURRENCY`: 5
- `ENRICHMENT_THROTTLE_MS`: 0
- Replicas: 1

## Security Considerations

- No authentication required for zKillboard API
- Validate killmail data before database insertion
- Use prepared statements to prevent SQL injection (handled by Kysely)
- Monitor for malformed killmail payloads

## Best Practices

- Monitor queue depth and adjust concurrency
- Set reasonable throttle delay to respect zKillboard API
- Use database connection pooling
- Implement dead letter queue for failed jobs
- Log all enrichment failures for debugging

## Version Information

- **Node.js**: 20 LTS
- **BullMQ**: 4.13
- **TypeScript**: 5.4.5

## Additional Resources

- [Enrichment Service Source Code](../../backend/enrichment)
- [Architecture Documentation](../architecture.md)
- [zKillboard API Documentation](https://github.com/zKillboard/zKillboard/wiki/API-(Statistics))
