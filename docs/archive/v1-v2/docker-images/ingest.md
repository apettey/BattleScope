# BattleScope Ingest Service Docker Image

**Image Name**: `petdog/battlescope-ingest:latest`

**Source**: `Dockerfile` with build args `SERVICE_SCOPE=@battlescope/ingest` and `BUILD_TARGET=backend/ingest`

## Purpose

Continuously polls zKillboard RedisQ feed for new killmails and applies configurable ingestion filters. Accepted killmails are stored in the database and queued for enrichment.

## Features

- Poll zKillboard RedisQ at configurable intervals
- Apply ruleset filters (min pilots, alliances, corps, systems, security types)
- Store minimal killmail metadata in database
- Queue accepted killmails for enrichment via BullMQ
- Publish ingestion events via Redis pub/sub
- System security caching for efficient space type filtering
- Multi-instance support with RedisQ queue ID

## Configuration

### Environment Variables

#### Core Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Health check HTTP port | `3002` | No |
| `LOG_LEVEL` | Logging level (trace, debug, info, warn, error) | `info` | No |

#### Ingestion Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `INGEST_POLL_INTERVAL_MS` | Polling interval for RedisQ (ms) | `5000` | No |
| `ZKILLBOARD_REDISQ_URL` | zKillboard RedisQ endpoint | `https://zkillredisq.stream/listen.php` | Yes |
| `ZKILLBOARD_REDISQ_ID` | Queue ID for zKillboard RedisQ | `battlescope` | Yes |
| `ZKILL_USER_AGENT` | User-Agent header for zKillboard requests | `BattleScope/1.0` | No |

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
| `OTEL_SERVICE_NAME` | Service name for telemetry | `battlescope-ingest` | No |
| `OTEL_METRIC_EXPORT_INTERVAL` | Metrics export interval (ms) | `15000` | No |

## Ports

| Port | Protocol | Description |
|------|----------|-------------|
| 3002 | HTTP | Health check endpoint |

## Health Checks

```bash
curl http://localhost:3002/healthz
```

Returns `200 OK` when healthy (database connected).

## Ingestion Rulesets

Rulesets are configured via the database (`rulesets` table) and can be managed through the Admin UI or API.

### Ruleset Filters

- **Minimum Pilots**: Reject killmails with fewer pilots than specified
- **Alliances**: Whitelist or blacklist specific alliances
- **Corporations**: Whitelist or blacklist specific corporations
- **Systems**: Filter by specific solar systems
- **Security Types**: Filter by security type (highsec, lowsec, nullsec, wormhole)

### Ruleset Cache

Rulesets are cached in Redis with TTL of 5 minutes and auto-invalidate via pub/sub when updated through the API.

## Data Flow

1. Poll zKillboard RedisQ every 5 seconds
2. Receive killmail package
3. Load active rulesets from cache
4. Apply filters to killmail
5. If accepted:
   - Store killmail reference in database
   - Queue enrichment job in Redis
   - Publish event via Redis pub/sub
6. If rejected:
   - Log rejection reason
7. Repeat

## Example Usage

### Docker Run

```bash
docker run -d \
  --name battlescope-ingest \
  -p 3002:3002 \
  -e DATABASE_URL=postgres://user:pass@postgres:5432/battlescope \
  -e REDIS_URL=redis://redis:6379/0 \
  -e ZKILLBOARD_REDISQ_URL=https://zkillredisq.stream/listen.php \
  -e ZKILLBOARD_REDISQ_ID=battlescope-prod \
  -e INGEST_POLL_INTERVAL_MS=5000 \
  petdog/battlescope-ingest:latest
```

### Docker Compose

```yaml
services:
  ingest:
    image: petdog/battlescope-ingest:latest
    ports:
      - "3002:3002"
    environment:
      PORT: 3002
      DATABASE_URL: postgres://battlescope:password@postgres:5432/battlescope
      REDIS_URL: redis://redis:6379/0
      ZKILLBOARD_REDISQ_URL: https://zkillredisq.stream/listen.php
      ZKILLBOARD_REDISQ_ID: battlescope-dev
      INGEST_POLL_INTERVAL_MS: 5000
      LOG_LEVEL: info
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
```

### Kubernetes Deployment

See `infra/k8s/ingest-deployment.yaml` for the complete manifest.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ingest
  namespace: battlescope
spec:
  replicas: 4  # Multiple instances for redundancy
  selector:
    matchLabels:
      app: ingest
  template:
    metadata:
      labels:
        app: ingest
    spec:
      containers:
        - name: ingest
          image: petdog/battlescope-ingest:latest
          ports:
            - containerPort: 3002
              name: http
          env:
            - name: PORT
              value: "3002"
          envFrom:
            - secretRef:
                name: battlescope-secrets
            - configMapRef:
                name: battlescope-config
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
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
- **Memory**: 128Mi request, 512Mi limit

### Minimum

- **CPU**: 50m
- **Memory**: 64Mi

## Scaling

The ingest service can run multiple instances safely. Each instance uses the same `ZKILLBOARD_REDISQ_ID` to share the queue, ensuring killmails are distributed across instances and processed exactly once.

**Recommended**: 1-4 replicas depending on killmail volume

## Dependencies

### Required Services

- **PostgreSQL 15+**: Store killmail references
- **Redis 7+**: Queue enrichment jobs and cache rulesets
- **zKillboard RedisQ**: External data source (internet connection required)

### Optional Services

- **OpenTelemetry Collector**: For metrics and tracing

## Build Information

### Build Command

```bash
docker build \
  --build-arg SERVICE_SCOPE=@battlescope/ingest \
  --build-arg BUILD_TARGET=backend/ingest \
  -t petdog/battlescope-ingest:latest \
  -f Dockerfile \
  .
```

## Metrics

The ingest service exposes the following metrics:

- `killmail_ingestion_total` - Total killmails processed (accepted/rejected)
- `killmail_ingestion_duration_seconds` - Processing time per killmail
- `ruleset_evaluation_duration_seconds` - Time to evaluate rulesets
- `zkillboard_redisq_poll_duration_seconds` - RedisQ polling latency

## Troubleshooting

### No Killmails Being Ingested

1. Check zKillboard RedisQ connectivity: `curl https://zkillredisq.stream/listen.php?queueID=test`
2. Verify rulesets exist and are active in the database
3. Check logs for rejection reasons
4. Verify `ZKILLBOARD_REDISQ_ID` is unique per environment

### High Memory Usage

- Reduce ruleset complexity (fewer entries)
- Check for memory leaks in logs
- Restart service periodically

### Database Connection Errors

1. Verify `DATABASE_URL` is correct
2. Check network connectivity to PostgreSQL
3. Ensure database schema is up to date (run migrations)

## Security Considerations

- No sensitive data stored (only killmail IDs and metadata)
- Rulesets may contain sensitive alliance/corp information
- Use network policies to restrict access to database and Redis
- Monitor for abuse of zKillboard RedisQ API

## Best Practices

- Use a unique `ZKILLBOARD_REDISQ_ID` per environment (dev, staging, prod)
- Set reasonable `INGEST_POLL_INTERVAL_MS` (5000ms recommended)
- Monitor ingestion rate and adjust polling interval if needed
- Keep rulesets simple to minimize processing time
- Use Redis caching to reduce database load

## Version Information

- **Node.js**: 20 LTS
- **BullMQ**: 4.13
- **TypeScript**: 5.4.5

## Additional Resources

- [Ingest Service Source Code](../../backend/ingest)
- [Architecture Documentation](../architecture.md)
- [zKillboard RedisQ Documentation](https://github.com/zKillboard/RedisQ)
