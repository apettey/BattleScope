# Enrichment Service

The Enrichment Service consumes `killmail.ingested` events from Redpanda, enriches them with data from EVE Online ESI API, and publishes `killmail.enriched` events.

## Features

- **Event-driven architecture**: Consumes killmail events from Redpanda
- **ESI integration**: Fetches ship types, systems, regions, characters, corporations, and alliances from ESI
- **Multi-tier caching**: Redis + PostgreSQL for ESI responses
- **Rate limiting**: Respects ESI rate limits (150 requests/second)
- **REST API**: Query enriched killmails and cache statistics
- **Automatic cleanup**: Removes expired cache entries hourly

## Architecture

```
┌─────────────┐
│  Redpanda   │
│  (Kafka)    │
└──────┬──────┘
       │ killmail.ingested
       ▼
┌─────────────────┐
│   Consumer      │
│  (KafkaJS)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────┐
│    Enricher     │─────▶│ ESI API  │
│                 │      └──────────┘
└────────┬────────┘
         │                ┌──────────┐
         ├───────────────▶│  Redis   │
         │                └──────────┘
         │                ┌──────────┐
         └───────────────▶│PostgreSQL│
                          └──────────┘
```

## Environment Variables

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=battlescope_enrichment
DB_USER=postgres
DB_PASSWORD=postgres

# Redis
REDIS_URL=redis://localhost:6379

# Kafka/Redpanda
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=enrichment-service

# Service
PORT=3002
HOST=0.0.0.0
NODE_ENV=production
```

## Database Schema

### enriched_killmails
Stores fully enriched killmail data with all names resolved.

### esi_cache
Persistent cache for ESI API responses.

### enrichment_stats
Daily statistics for monitoring and metrics.

## API Endpoints

### Health Checks
- `GET /health` - Overall health status
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

### Enriched Killmails
- `GET /api/enriched/:killmailId` - Get enriched killmail by ID
- `GET /api/cache/stats` - Get cache statistics and processing metrics

## Development

```bash
# Install dependencies
pnpm install

# Run migrations
pnpm migrate

# Start development server
pnpm dev

# Build
pnpm build

# Run in production
pnpm start
```

## Docker

```bash
# Build image
docker build -t battlescope-enrichment:latest .

# Run container
docker run -d \
  --name enrichment \
  -p 3002:3002 \
  -e DB_HOST=postgres \
  -e REDIS_URL=redis://redis:6379 \
  -e KAFKA_BROKERS=redpanda:9092 \
  battlescope-enrichment:latest
```

## Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

## ESI Caching Strategy

1. **Redis (L1 Cache)**:
   - TTL: 1 hour
   - Fast in-memory access
   - Volatile - survives pod restarts

2. **PostgreSQL (L2 Cache)**:
   - TTL: 24 hours for static data, 1 hour for dynamic data
   - Persistent storage
   - Automatic cleanup of expired entries

3. **Cache Keys**:
   - `ship_type:{typeId}`
   - `group:{groupId}`
   - `system:{systemId}`
   - `constellation:{constellationId}`
   - `region:{regionId}`
   - `character:{characterId}`
   - `corporation:{corpId}`
   - `alliance:{allianceId}`

## Rate Limiting

The service implements rate limiting to stay under ESI's 150 requests/second limit:

- Request queue with 10ms minimum interval (100 req/s)
- Exponential backoff on 420 errors
- Automatic retry with backoff

## Monitoring

Daily statistics tracked:
- Killmails processed
- ESI API calls made
- Cache hits/misses
- Error count
- Average processing time

Access via `/api/cache/stats` endpoint.

## Events

### Consumes
- **Topic**: `killmails`
- **Event Type**: `killmail.received`
- **Format**: See `@battlescope/events` package

### Publishes
- **Topic**: `killmails-enriched`
- **Event Type**: `killmail.enriched`
- **Format**: Original killmail + enriched fields (names, locations, etc.)
