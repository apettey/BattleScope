# Battle/Clusterer Service

The Battle/Clusterer service is responsible for consuming enriched killmail events, clustering them into battles based on temporal and spatial proximity, tracking participants, and maintaining ship history for intelligence purposes.

## Features

- **Battle Clustering**: Groups killmails into battles using a time-window algorithm (5-minute proximity, 30-minute inactivity timeout)
- **Participant Tracking**: Tracks all participants in each battle with side assignment
- **Ship History**: Maintains a complete history of which ships each pilot has flown
- **REST API**: Provides endpoints for querying battles, participants, and intel data
- **Event-Driven**: Consumes `killmail.enriched` events from Redpanda

## Configuration

Environment variables:

```bash
# Server
PORT=3003
HOST=0.0.0.0
CORS_ORIGIN=*

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=battlescope_battles
DB_USER=postgres
DB_PASSWORD=postgres

# Event Bus (Redpanda/Kafka)
EVENT_BUS_BROKERS=localhost:9092
EVENT_BUS_CLIENT_ID=battle-service
```

## API Endpoints

### Health Check
- `GET /health` - Service health status

### Battles
- `GET /api/battles` - List battles with pagination and filters
  - Query params: `page`, `limit`, `systemId`, `securityType`, `minKills`, `startDate`, `endDate`
- `GET /api/battles/:id` - Get battle details
- `GET /api/battles/:id/participants` - Get battle participants
- `GET /api/battles/:id/timeline` - Get battle timeline (killmails in chronological order)

### Intel
- `GET /api/intel/characters/:characterId/ships` - Get ship history for a character
- `GET /api/intel/characters/:characterId/battles` - Get battles a character participated in

## Database Schema

### battles
Stores battle metadata including system, time range, total kills, and ISK destroyed.

### battle_killmails
Associates killmails with battles, tracking victim, ship type, and side.

### battle_participants
Tracks unique participants per battle with their alliance, corp, ship, and side.

### pilot_ship_history
Maintains historical record of which ships each pilot has flown, with kill/loss counts.

## Battle Clustering Algorithm

1. **Time Window**: Killmails within 5 minutes of each other in the same system are grouped together
2. **Inactivity Timeout**: A battle ends after 30 minutes of no killmail activity
3. **Side Assignment**: Participants are assigned to sides based on alliance/corporation
4. **Ship History**: Each participant's ship usage is tracked and updated

## Development

```bash
# Install dependencies
pnpm install

# Run migrations
pnpm migrate

# Start in development mode
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test
```

## Docker

```bash
# Build image
docker build -t battlescope-battle:latest .

# Run container
docker run -p 3003:3003 \
  -e DB_HOST=postgres \
  -e EVENT_BUS_BROKERS=redpanda:9092 \
  battlescope-battle:latest
```

## Architecture

```
┌─────────────────────────────────────────┐
│          Redpanda (Event Bus)           │
│      Topic: killmail.enriched           │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│       KillmailConsumer                  │
│  - Subscribes to enriched events        │
│  - Passes to BattleClusterer            │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│       BattleClusterer                   │
│  - Groups killmails into battles        │
│  - Tracks active battles in memory      │
│  - Assigns participants to sides        │
│  - Updates ship history                 │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│     PostgreSQL Database                 │
│  - battles                              │
│  - battle_killmails                     │
│  - battle_participants                  │
│  - pilot_ship_history                   │
└─────────────────────────────────────────┘
               ▲
               │
┌──────────────┴──────────────────────────┐
│       REST API (Fastify)                │
│  - Battle queries                       │
│  - Participant queries                  │
│  - Intel queries                        │
└─────────────────────────────────────────┘
```

## Migration

Database migrations are run automatically on service startup. To run manually:

```bash
pnpm migrate
```

## License

MIT
