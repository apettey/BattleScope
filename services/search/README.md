# BattleScope V3 - Search Service

The Search service provides full-text search and indexing capabilities using Typesense for BattleScope V3.

## Features

- **Typesense Integration**: Fast, typo-tolerant search engine
- **Event-Driven Indexing**: Automatic indexing from Kafka events
- **Multiple Collections**: Battles, killmails, characters, corporations, systems
- **Advanced Search**: Filtering, faceting, autocomplete support
- **REST API**: Comprehensive search endpoints
- **Admin Endpoints**: Collection management and reindexing

## Technology Stack

- **Runtime**: Node.js 22
- **Framework**: Fastify 4
- **Search Engine**: Typesense
- **Event Bus**: Kafka/Redpanda
- **Language**: TypeScript
- **Validation**: Zod

## Port

3004

## Environment Variables

See `.env.example` for all required environment variables.

Key variables:
- `TYPESENSE_HOST`: Typesense server host (default: typesense)
- `TYPESENSE_PORT`: Typesense server port (default: 8108)
- `TYPESENSE_API_KEY`: Typesense API key (required)
- `TYPESENSE_PROTOCOL`: http or https (default: http)
- `KAFKA_BROKERS`: Comma-separated Kafka brokers (default: redpanda:9092)

## Typesense Collections

### 1. Battles
Indexes battle cluster data for searching battle reports.

Fields:
- `id` (string): Battle UUID
- `system_name` (string, facet): System where battle occurred
- `region_name` (string, facet): Region name
- `security_type` (string, facet): highsec/lowsec/nullsec/wormhole
- `start_time` (int64, sort): Battle start timestamp
- `end_time` (int64, sort, optional): Battle end timestamp
- `total_kills` (int32, sort): Total killmails in battle
- `total_isk_destroyed` (int64, sort): Total ISK destroyed
- `alliance_names` (string[], facet): Participating alliances
- `participant_names` (string[]): Participant character names

### 2. Killmails
Indexes individual killmails for detailed search.

Fields:
- `killmail_id` (string): Killmail ID
- `victim_name` (string): Victim character name
- `victim_alliance` (string, facet, optional): Victim alliance
- `ship_type_name` (string, facet): Ship type destroyed
- `ship_group` (string, facet): Ship group (Frigate, Cruiser, etc.)
- `system_name` (string, facet): System name
- `region_name` (string, facet): Region name
- `occurred_at` (int64, sort): Killmail timestamp
- `isk_value` (int64, sort): Killmail ISK value

### 3. Characters
Character name autocomplete and search.

Fields:
- `character_id` (string): Character ID
- `character_name` (string): Character name
- `corp_name` (string): Corporation name
- `alliance_name` (string, optional): Alliance name

### 4. Corporations
Corporation search and autocomplete.

Fields:
- `corp_id` (string): Corporation ID
- `corp_name` (string): Corporation name
- `alliance_name` (string, optional): Alliance name
- `member_count` (int32, optional): Member count

### 5. Systems
System search and autocomplete.

Fields:
- `system_id` (string): System ID
- `system_name` (string): System name
- `region_name` (string): Region name
- `security_status` (float): Security status

## API Endpoints

### Health
- `GET /health`: Service health status

### Search
- `GET /api/search`: Universal search across all collections
  - Query params: `q`, `type`, `page`, `per_page`
- `GET /api/search/suggest`: Autocomplete suggestions
  - Query params: `q`, `type`, `limit`
- `GET /api/search/battles`: Battle-specific search with filters
  - Query params: `q`, `system`, `region`, `security_type`, `min_kills`, `min_isk`, `page`, `per_page`, `sort_by`
- `GET /api/search/killmails`: Killmail-specific search with filters
  - Query params: `q`, `system`, `region`, `ship_type`, `ship_group`, `victim`, `alliance`, `min_isk`, `page`, `per_page`, `sort_by`
- `GET /api/search/characters`: Character search
  - Query params: `q`, `page`, `per_page`

### Admin
- `POST /api/admin/reindex`: Trigger reindexing of collections
  - Body: `{ "collection": "all|battles|killmails|...", "clear_existing": boolean }`
- `GET /api/admin/stats`: Get collection statistics
- `DELETE /api/admin/:collection/:id`: Delete a document by ID
- `GET /api/admin/schema/:collection`: Get collection schema
- `GET /api/admin/health`: Admin health check

## Event Consumption

The service consumes events from Kafka/Redpanda:

### Topics
- `killmails-enriched`: Enriched killmail data
  - Indexes killmails
  - Indexes character entities
- `battles`: Battle cluster events
  - `battle.detected`: New battle detected
  - `battle.updated`: Battle data updated

### Consumer Groups
- `battlescope-search-killmails`: Killmail consumer
- `battlescope-search-battles`: Battle consumer

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build
pnpm build

# Run production build
pnpm start

# Type check
pnpm typecheck

# Run tests
pnpm test
```

## Docker

```bash
# Build image
docker build -t battlescope-search:latest .

# Run container
docker run -p 3004:3004 \
  -e TYPESENSE_HOST=typesense \
  -e TYPESENSE_API_KEY=your-key \
  -e KAFKA_BROKERS=redpanda:9092 \
  battlescope-search:latest
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Search Service (3004)                  │
├─────────────────────────────────────────────────────────┤
│  Fastify HTTP Server                                     │
│  ├─ Health Routes                                        │
│  ├─ Search Routes (GET /api/search/*)                   │
│  └─ Admin Routes (POST /api/admin/*)                    │
├─────────────────────────────────────────────────────────┤
│  Event Consumer (Kafka)                                  │
│  ├─ Killmail Enriched Consumer                          │
│  └─ Battle Events Consumer                              │
├─────────────────────────────────────────────────────────┤
│  Indexer                                                 │
│  ├─ Index Battles                                        │
│  ├─ Index Killmails                                      │
│  ├─ Index Characters                                     │
│  ├─ Index Corporations                                   │
│  └─ Index Systems                                        │
├─────────────────────────────────────────────────────────┤
│  Typesense Client                                        │
│  ├─ Collection Management                               │
│  ├─ Document Upsert/Delete                              │
│  └─ Search Operations                                    │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │    Typesense     │
              │     (8108)       │
              └──────────────────┘
```

## Notes

- Collections are automatically created on startup if they don't exist
- The service uses upsert operations to avoid duplicate documents
- Failed indexing operations are logged but don't crash the consumer
- System/region name lookups are currently placeholder implementations
- Ship group extraction uses simple heuristics based on ship names

## Future Enhancements

- ESI integration for system/region data
- Proper ship group taxonomy from SDE
- Real-time search result updates via WebSockets
- Search analytics and query logging
- Synonym support for common search terms
- Geographical search for wormhole systems
