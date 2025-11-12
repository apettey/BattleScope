# BattleScope Search Sync Service Docker Image

**Image Name**: `petdog/battlescope-search-sync:latest`

**Source**: `backend/search-sync/Dockerfile`

## Purpose

Synchronizes database records to Typesense search engine. Manages search schema, indexes battles and entities, and keeps the search index consistent with the database.

## Features

- Index battles in Typesense
- Index entities (characters, corporations, alliances)
- Resolve entity names via ESI
- Full reindex and incremental updates
- Schema management and collection creation
- Batch indexing for performance

## Configuration

### Environment Variables

#### Core Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `LOG_LEVEL` | Logging level (trace, debug, info, warn, error) | `info` | No |

#### Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |

#### Typesense Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TYPESENSE_HOST` | Typesense server host | `localhost` | Yes |
| `TYPESENSE_PORT` | Typesense server port | `8108` | No |
| `TYPESENSE_PROTOCOL` | Typesense protocol (http/https) | `http` | No |
| `TYPESENSE_API_KEY` | Typesense API key | - | Yes |

## Usage Modes

### Full Sync (Default)

Runs a complete reindex of all entities from the database to Typesense.

```bash
docker run --rm \
  -e DATABASE_URL=postgres://user:pass@postgres:5432/battlescope \
  -e TYPESENSE_HOST=typesense \
  -e TYPESENSE_API_KEY=your-api-key \
  petdog/battlescope-search-sync:latest
```

### Kubernetes CronJob

Run as a periodic job to keep search index up to date.

See `infra/k8s/typesense-entity-sync-cronjob.yaml` for the complete manifest.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: typesense-entity-sync
  namespace: battlescope
spec:
  schedule: "0 */6 * * *"  # Every 6 hours
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 3
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        metadata:
          labels:
            app: search-sync
        spec:
          restartPolicy: OnFailure
          containers:
            - name: search-sync
              image: petdog/battlescope-search-sync:latest
              envFrom:
                - secretRef:
                    name: battlescope-secrets
                - secretRef:
                    name: typesense-secret
                - configMapRef:
                    name: battlescope-config
              resources:
                requests:
                  cpu: 100m
                  memory: 256Mi
                limits:
                  cpu: 500m
                  memory: 1Gi
```

## Sync Strategy

### Collections Synced

1. **Entities Collection**
   - Characters
   - Corporations
   - Alliances
   - Solar systems
   - Ship types

### Sync Process

1. Query all unique entities from database
2. Batch entities (1000 per batch)
3. Resolve entity names via ESI (with caching)
4. Create/update Typesense collection schema
5. Index documents in batches
6. Handle errors and retry failed documents

### Schema

#### Entity Document

```json
{
  "id": "character:123456",
  "name": "Character Name",
  "type": "character",
  "category_id": 1,
  "category_name": "Character"
}
```

## Example Usage

### Docker Run (One-time Sync)

```bash
docker run --rm \
  -e DATABASE_URL=postgres://user:pass@postgres:5432/battlescope \
  -e TYPESENSE_HOST=typesense \
  -e TYPESENSE_PORT=8108 \
  -e TYPESENSE_PROTOCOL=http \
  -e TYPESENSE_API_KEY=your-api-key \
  petdog/battlescope-search-sync:latest
```

### Docker Compose

```yaml
services:
  search-sync:
    image: petdog/battlescope-search-sync:latest
    environment:
      DATABASE_URL: postgres://battlescope:password@postgres:5432/battlescope
      TYPESENSE_HOST: typesense
      TYPESENSE_PORT: 8108
      TYPESENSE_PROTOCOL: http
      TYPESENSE_API_KEY: ${TYPESENSE_API_KEY}
      LOG_LEVEL: info
    depends_on:
      - postgres
      - typesense
    command: ["node", "dist/backend/search-sync/src/index.js"]
```

## Resource Requirements

### Recommended

- **CPU**: 100m request, 500m limit
- **Memory**: 256Mi request, 1Gi limit

### Minimum

- **CPU**: 50m
- **Memory**: 128Mi

## Execution Time

Typical execution time:
- **Small dataset** (<10k entities): 1-5 minutes
- **Medium dataset** (10k-100k entities): 5-30 minutes
- **Large dataset** (>100k entities): 30+ minutes

## Dependencies

### Required Services

- **PostgreSQL 15+**: Read entity data
- **Typesense**: Index entities
- **EVE ESI API**: Resolve entity names (internet connection required)

## Build Information

### Build Command

```bash
docker build \
  -t petdog/battlescope-search-sync:latest \
  -f backend/search-sync/Dockerfile \
  .
```

## Metrics

The search-sync service logs the following metrics:

- Total entities processed
- Entities indexed successfully
- Entities failed
- Sync duration
- API calls to ESI

## Troubleshooting

### Sync Failing

1. Verify Typesense is running: `curl http://typesense:8108/health`
2. Check `TYPESENSE_API_KEY` is correct
3. Verify database connectivity
4. Check logs for specific errors

### Slow Sync Performance

1. Check ESI API rate limiting
2. Verify Typesense performance
3. Increase batch size (code change required)
4. Scale up resources (CPU/Memory)

### Missing Entities in Search

1. Check if entities exist in database
2. Verify Typesense collection schema
3. Run full reindex
4. Check for sync errors in logs

### Memory Issues

1. Reduce batch size (code change required)
2. Increase memory limits
3. Process entities in smaller chunks

## Sync Frequency

### Recommendations

- **High activity**: Every 1-2 hours
- **Medium activity**: Every 6 hours
- **Low activity**: Daily

### Current Default

Every 6 hours (`0 */6 * * *`)

## Security Considerations

- Typesense API key should be kept secret
- ESI API calls are public (no authentication)
- Read-only database access sufficient
- Consider rate limiting for ESI API calls

## Best Practices

- Run as Kubernetes CronJob for automation
- Set `concurrencyPolicy: Forbid` to prevent overlaps
- Monitor sync success/failure rates
- Keep execution time reasonable (<30 minutes)
- Use ESI caching to reduce API calls
- Alert on sync failures

## Future Enhancements

Planned features:

- [ ] Incremental sync (only changed entities)
- [ ] Battle indexing
- [ ] Real-time sync via database triggers
- [ ] Parallel processing for faster sync
- [ ] Configurable sync strategy
- [ ] Support for multiple Typesense collections

## Version Information

- **Node.js**: 20 LTS
- **TypeScript**: 5.4.5
- **Typesense Client**: Latest

## Additional Resources

- [Search Sync Source Code](../../backend/search-sync)
- [Typesense Documentation](https://typesense.org/docs/)
- [Architecture Documentation](../architecture.md)
