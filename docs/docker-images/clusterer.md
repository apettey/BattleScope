# BattleScope Clusterer Service Docker Image

**Image Name**: `petdog/battlescope-clusterer:latest`

**Source**: `Dockerfile` with build args `SERVICE_SCOPE=@battlescope/clusterer` and `BUILD_TARGET=backend/clusterer`

## Purpose

Groups related enriched killmails into battles using temporal and spatial clustering algorithms. Runs periodically to process new killmails and create/update battle records.

## Features

- Sliding window clustering algorithm
- Temporal proximity detection (max gap between kills)
- Participant overlap analysis
- Battle metadata generation (ISK destroyed, participants, duration)
- zKillboard "related kills" URL generation
- Configurable clustering parameters
- Batch processing for efficiency

## Configuration

### Environment Variables

#### Core Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Health check HTTP port | `3003` | No |
| `LOG_LEVEL` | Logging level (trace, debug, info, warn, error) | `info` | No |

#### Clustering Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CLUSTER_WINDOW_MINUTES` | Time window for clustering (minutes) | `30` | No |
| `CLUSTER_GAP_MAX_MINUTES` | Max gap between consecutive kills (minutes) | `15` | No |
| `CLUSTER_MIN_KILLS` | Minimum kills per battle | `2` | No |
| `CLUSTER_PROCESSING_DELAY_MINUTES` | Delay before processing new killmails (minutes) | `90` | No |
| `CLUSTER_BATCH_SIZE` | Number of killmails to process per batch | `2000` | No |
| `CLUSTER_INTERVAL_MS` | Interval between clustering runs (ms) | `10000` | No |

#### Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |

#### Observability Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `http://otel-collector:4318` | No |
| `OTEL_SERVICE_NAME` | Service name for telemetry | `battlescope-clusterer` | No |
| `OTEL_METRIC_EXPORT_INTERVAL` | Metrics export interval (ms) | `15000` | No |

## Ports

| Port | Protocol | Description |
|------|----------|-------------|
| 3003 | HTTP | Health check endpoint |

## Health Checks

```bash
curl http://localhost:3003/healthz
```

Returns `200 OK` when healthy (database connected).

## Clustering Algorithm

### Parameters

- **Window**: 30 minutes (configurable)
- **Max Gap**: 15 minutes between consecutive kills (configurable)
- **Min Kills**: 2 kills minimum per battle (configurable)
- **Processing Delay**: 90 minutes delay before processing (allows late arrivals)

### Algorithm Steps

1. Query unprocessed killmails (enriched, older than processing delay)
2. Sort killmails by time
3. Apply sliding window algorithm:
   - Group killmails within window
   - Check for participant overlap
   - Verify max gap constraint
4. Create battle records for clusters
5. Calculate battle metadata:
   - Total ISK destroyed
   - Participant count (attackers vs defenders)
   - Battle duration (first kill to last kill)
   - Primary system
   - Space type (highsec, lowsec, nullsec, wormhole)
6. Generate zKillboard related URL
7. Update killmails with battle_id

### Correlation Detection

Killmails are correlated into a battle if:
- Time difference < window size
- Gap between consecutive kills < max gap
- Shared attackers/victims across killmails
- Same or nearby solar systems

## Example Usage

### Docker Run

```bash
docker run -d \
  --name battlescope-clusterer \
  -p 3003:3003 \
  -e DATABASE_URL=postgres://user:pass@postgres:5432/battlescope \
  -e CLUSTER_WINDOW_MINUTES=30 \
  -e CLUSTER_GAP_MAX_MINUTES=15 \
  -e CLUSTER_MIN_KILLS=2 \
  -e CLUSTER_PROCESSING_DELAY_MINUTES=90 \
  -e CLUSTER_BATCH_SIZE=2000 \
  -e CLUSTER_INTERVAL_MS=10000 \
  petdog/battlescope-clusterer:latest
```

### Docker Compose

```yaml
services:
  clusterer:
    image: petdog/battlescope-clusterer:latest
    ports:
      - "3003:3003"
    environment:
      PORT: 3003
      DATABASE_URL: postgres://battlescope:password@postgres:5432/battlescope
      CLUSTER_WINDOW_MINUTES: 30
      CLUSTER_GAP_MAX_MINUTES: 15
      CLUSTER_MIN_KILLS: 2
      CLUSTER_PROCESSING_DELAY_MINUTES: 90
      CLUSTER_BATCH_SIZE: 2000
      CLUSTER_INTERVAL_MS: 10000
      LOG_LEVEL: info
    depends_on:
      - postgres
    restart: unless-stopped
```

### Kubernetes Deployment

See `infra/k8s/clusterer-deployment.yaml` for the complete manifest.

## Resource Requirements

### Recommended

- **CPU**: 200m request, 1000m limit
- **Memory**: 512Mi request, 2Gi limit

### Minimum

- **CPU**: 50m
- **Memory**: 128Mi

## Scaling

**Important**: Only run ONE instance of the clusterer service. Multiple instances will cause conflicts and duplicate battles.

Use Kubernetes `replicas: 1` or Docker Compose with single container.

## Dependencies

### Required Services

- **PostgreSQL 15+**: Read enriched killmails, write battles

### Optional Services

- **OpenTelemetry Collector**: For metrics and tracing

## Build Information

### Build Command

```bash
docker build \
  --build-arg SERVICE_SCOPE=@battlescope/clusterer \
  --build-arg BUILD_TARGET=backend/clusterer \
  -t petdog/battlescope-clusterer:latest \
  -f Dockerfile \
  .
```

## Metrics

The clusterer service exposes the following metrics:

- `clustering_runs_total` - Total clustering runs
- `clustering_duration_seconds` - Clustering run duration
- `battles_created_total` - Total battles created
- `killmails_processed_total` - Total killmails processed
- `clustering_backlog` - Number of unprocessed killmails

## Troubleshooting

### No Battles Being Created

1. Check if enrichment service is running and processing killmails
2. Verify killmails exist in database with `enriched_at IS NOT NULL`
3. Check `CLUSTER_PROCESSING_DELAY_MINUTES` - killmails must be older than this
4. Review `CLUSTER_MIN_KILLS` setting - may be too high
5. Check logs for clustering errors

### Too Many Small Battles

- Increase `CLUSTER_MIN_KILLS` to 3-5
- Increase `CLUSTER_GAP_MAX_MINUTES` to capture more kills
- Adjust `CLUSTER_WINDOW_MINUTES` to wider range

### Battles Missing Killmails

- Decrease `CLUSTER_GAP_MAX_MINUTES`
- Check for gaps in killmail ingestion
- Verify enrichment is completing successfully

### High CPU/Memory Usage

- Reduce `CLUSTER_BATCH_SIZE`
- Increase `CLUSTER_INTERVAL_MS` (run less frequently)
- Check for database query performance issues

## Performance Tuning

### High Volume (1000+ killmails/hour)

- `CLUSTER_BATCH_SIZE`: 5000
- `CLUSTER_INTERVAL_MS`: 5000 (5 seconds)
- CPU: 500m-1000m
- Memory: 1Gi-2Gi

### Low Volume (<100 killmails/hour)

- `CLUSTER_BATCH_SIZE`: 1000
- `CLUSTER_INTERVAL_MS`: 60000 (1 minute)
- CPU: 100m-200m
- Memory: 256Mi-512Mi

### Balanced (Default)

- `CLUSTER_BATCH_SIZE`: 2000
- `CLUSTER_INTERVAL_MS`: 10000 (10 seconds)
- CPU: 200m-1000m
- Memory: 512Mi-2Gi

## Algorithm Tuning

### Small Skirmishes (2-10 pilots)

```
CLUSTER_WINDOW_MINUTES=15
CLUSTER_GAP_MAX_MINUTES=5
CLUSTER_MIN_KILLS=2
```

### Large Fleet Battles (50+ pilots)

```
CLUSTER_WINDOW_MINUTES=60
CLUSTER_GAP_MAX_MINUTES=30
CLUSTER_MIN_KILLS=5
```

### General Purpose (Default)

```
CLUSTER_WINDOW_MINUTES=30
CLUSTER_GAP_MAX_MINUTES=15
CLUSTER_MIN_KILLS=2
```

## Security Considerations

- No external network access required
- Read/write access to database (use least privilege)
- Processing delay prevents manipulation via late killmail submission

## Best Practices

- Monitor clustering backlog
- Tune parameters based on killmail volume
- Run only ONE instance (no horizontal scaling)
- Use database indexes for performance
- Monitor memory usage during clustering runs
- Keep `CLUSTER_PROCESSING_DELAY_MINUTES` at 90+ to allow late arrivals

## Version Information

- **Node.js**: 20 LTS
- **TypeScript**: 5.4.5
- **@battlescope/battle-reports**: Custom clustering engine

## Additional Resources

- [Clusterer Service Source Code](../../backend/clusterer)
- [Battle Reports Package](../../packages/battle-reports)
- [Architecture Documentation](../architecture.md)
