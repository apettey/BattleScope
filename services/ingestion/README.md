# Ingestion Service

The Ingestion Service is responsible for polling ZKillboard's RedisQ API for new killmails, deduplicating them, storing them in the database, and publishing events to Redpanda for downstream processing.

## Features

- **ZKillboard RedisQ Polling**: Continuously polls ZKillboard for new killmails
- **Deduplication**: Ensures killmails are only processed once using database primary key constraints
- **Event Publishing**: Publishes `killmail.received` events to Redpanda for enrichment and clustering
- **REST API**: Provides endpoints for querying ingested killmails and statistics
- **Health Checks**: Database connectivity and service health monitoring
- **Graceful Shutdown**: Properly handles SIGTERM/SIGINT signals

## Tech Stack

- **Framework**: Fastify
- **Database**: PostgreSQL with Kysely query builder
- **Event Bus**: Redpanda (Kafka-compatible) with KafkaJS
- **Logging**: Pino structured logging
- **Language**: TypeScript

## Database Schema

### `killmail_events` Table

| Column                 | Type         | Description                                    |
| ---------------------- | ------------ | ---------------------------------------------- |
| killmail_id            | BIGINT       | Primary key, unique killmail ID                |
| system_id              | BIGINT       | Solar system where kill occurred               |
| occurred_at            | TIMESTAMPTZ  | When the kill occurred in-game                 |
| fetched_at             | TIMESTAMPTZ  | When we fetched from ZKillboard                |
| victim_alliance_id     | BIGINT       | Victim's alliance ID (nullable)                |
| attacker_alliance_ids  | BIGINT[]     | Array of attacker alliance IDs                 |
| isk_value              | BIGINT       | Total ISK value from ZKillboard                |
| zkb_url                | TEXT         | ZKillboard URL                                 |
| raw_data               | JSONB        | Complete raw killmail data                     |
| processed_at           | TIMESTAMPTZ  | When downstream services processed it          |
| battle_id              | UUID         | Associated battle ID (set by clusterer)        |

**Indexes**:
- `idx_killmail_events_occurred_at` - Time-based queries
- `idx_killmail_events_system_id` - System-based queries
- `idx_killmail_events_processed_at` - Finding unprocessed killmails
- `idx_killmail_events_battle_id` - Battle associations

## API Endpoints

### Health Check

```
GET /health
```

Returns service health status and database connectivity.

**Response**:
```json
{
  "status": "healthy",
  "service": "ingestion",
  "timestamp": "2025-11-25T12:00:00.000Z",
  "database": "connected"
}
```

### List Killmails

```
GET /api/killmails?limit=50&offset=0&systemId=30000142&unprocessedOnly=false
```

Returns paginated list of killmails.

**Query Parameters**:
- `limit` (number, 1-100, default: 50) - Number of results per page
- `offset` (number, default: 0) - Pagination offset
- `systemId` (number, optional) - Filter by solar system
- `unprocessedOnly` (boolean, default: false) - Only return unprocessed killmails

**Response**:
```json
{
  "data": [
    {
      "killmailId": 123456789,
      "systemId": 30000142,
      "occurredAt": "2025-11-25T12:00:00.000Z",
      "fetchedAt": "2025-11-25T12:00:01.000Z",
      "victimAllianceId": 99000001,
      "attackerAllianceIds": [99000002, 99000003],
      "iskValue": 1500000000,
      "zkbUrl": "https://zkillboard.com/kill/123456789/",
      "processedAt": "2025-11-25T12:00:05.000Z",
      "battleId": "uuid-here"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1234,
    "hasMore": true
  }
}
```

### Get Killmail Details

```
GET /api/killmails/:id
```

Returns detailed killmail data including raw JSONB data.

**Response**:
```json
{
  "killmailId": 123456789,
  "systemId": 30000142,
  "occurredAt": "2025-11-25T12:00:00.000Z",
  "fetchedAt": "2025-11-25T12:00:01.000Z",
  "victimAllianceId": 99000001,
  "attackerAllianceIds": [99000002, 99000003],
  "iskValue": 1500000000,
  "zkbUrl": "https://zkillboard.com/kill/123456789/",
  "rawData": { ... },
  "processedAt": "2025-11-25T12:00:05.000Z",
  "battleId": "uuid-here"
}
```

### Get Statistics

```
GET /api/stats
```

Returns ingestion statistics.

**Response**:
```json
{
  "totalKillmails": 50000,
  "processedKillmails": 49500,
  "unprocessedKillmails": 500,
  "last24Hours": 1234,
  "lastHour": 56,
  "totalIskDestroyed": 500000000000,
  "topSystems": [
    { "systemId": 30000142, "killCount": 234 },
    { "systemId": 30002187, "killCount": 189 }
  ],
  "timestamp": "2025-11-25T12:00:00.000Z"
}
```

## Events Published

### `killmail.received`

Published to Redpanda topic: `killmails`

**Schema**:
```typescript
{
  type: 'killmail.received',
  timestamp: Date,
  data: {
    killmailId: number,
    killmailHash: string,
    killmailTime: Date,
    solarSystemId: number,
    victim: {
      characterId?: number,
      corporationId: number,
      allianceId?: number,
      shipTypeId: number,
      damageTaken: number
    },
    attackers: Array<{
      characterId?: number,
      corporationId?: number,
      allianceId?: number,
      shipTypeId?: number,
      weaponTypeId?: number,
      damageDone: number,
      finalBlow: boolean
    }>,
    zkb: {
      totalValue: number,
      points: number,
      npc: boolean,
      solo: boolean,
      awox: boolean
    }
  }
}
```

## Development

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL 15+
- Redpanda or Kafka

### Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Copy environment file:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Run migrations:
   ```bash
   pnpm migrate
   ```

4. Start development server:
   ```bash
   pnpm dev
   ```

### Building

```bash
pnpm build
```

### Running in Production

```bash
pnpm start
```

## Docker

### Build Image

```bash
docker build -t battlescope/ingestion:latest -f services/ingestion/Dockerfile .
```

Note: Must be run from repository root to include shared packages.

### Run Container

```bash
docker run -d \
  --name battlescope-ingestion \
  -p 3001:3001 \
  -e DB_HOST=postgres \
  -e DB_NAME=battlescope_ingestion \
  -e KAFKA_BROKERS=redpanda:9092 \
  battlescope/ingestion:latest
```

## Configuration

All configuration is done via environment variables. See `.env.example` for available options.

### Key Configuration Options

- `PORT` - HTTP server port (default: 3001)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - PostgreSQL connection
- `KAFKA_BROKERS` - Redpanda/Kafka broker addresses
- `ZKILL_POLL_INTERVAL_MS` - Polling interval in milliseconds (default: 1000)
- `ZKILL_MAX_RETRIES` - Max retries before exponential backoff (default: 5)

## Monitoring

### Health Check

```bash
curl http://localhost:3001/health
```

### Metrics

The service provides comprehensive statistics via the `/api/stats` endpoint.

### Logging

Structured JSON logs are written to stdout. In development, logs are prettified for readability.

## Architecture

```
┌─────────────────────────────────────────────┐
│           ZKillboard RedisQ API             │
└─────────────────┬───────────────────────────┘
                  │ HTTP Polling (1s interval)
                  ▼
┌─────────────────────────────────────────────┐
│          ZKillboardPoller                   │
│  - Polls RedisQ                             │
│  - Handles retries & backoff                │
│  - Deduplicates killmails                   │
└─────────────┬──────────────┬────────────────┘
              │              │
              ▼              ▼
┌──────────────────┐  ┌──────────────────────┐
│   PostgreSQL     │  │     Redpanda         │
│ killmail_events  │  │ killmails topic      │
└──────────────────┘  └──────────┬───────────┘
                                 │
                                 ▼
                      ┌──────────────────────┐
                      │ Enrichment Service   │
                      │ (consumes events)    │
                      └──────────────────────┘
```

## License

Copyright 2025 BattleScope
