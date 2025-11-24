# Claude Skill: Service Storage Isolation

**Purpose**: Ensure each service has its own isolated storage that is never shared with other services.

---

## Core Principle

**Rule**: Each service MUST have its own isolated storage. No service shall access another service's storage directly.

**Rationale**:
- **Independence**: Services can evolve their schemas without coordinating with other teams
- **Fault Isolation**: Database failures are contained to a single service
- **Scalability**: Each service can scale its storage independently
- **Security**: Data access is controlled at the service boundary
- **Testing**: Services can be tested in isolation with their own test databases
- **Deployment**: Schema migrations happen independently per service

---

## Storage Isolation Rules

### Rule 1: One Database Per Service

Each service owns exactly ONE database (or database instance) that no other service can access.

✅ **Correct Architecture**:
```
Ingest Service → ingestion_db (PostgreSQL)
Enrichment Service → enrichment_db (PostgreSQL)
Clusterer Service → battles_db (PostgreSQL)
Search Service → search_db (Typesense)
Notification Service → notifications_db (PostgreSQL/Redis)
```

❌ **Incorrect Architecture**:
```
All Services → shared_battlescope_db (PostgreSQL)
  ├─ killmail_events (accessed by Ingest + Enrichment)
  ├─ battles (accessed by Clusterer + Search)
  └─ users (accessed by Auth + Notification)
```

### Rule 2: No Direct Database Access Across Services

Services MUST NOT query another service's database directly.

✅ **Correct**:
```typescript
// In Clusterer Service - consume events from Enrichment
consumer.on('killmail.enriched', async (event) => {
  // Use data from the event
  await this.battleDb.insertInto('battle_killmails')
    .values({
      killmailId: event.data.killmailId,
      enrichedData: event.data.enrichedFields,
    })
    .execute();
});
```

❌ **Incorrect**:
```typescript
// In Clusterer Service - directly querying Enrichment's database
const enrichedData = await enrichmentDb
  .selectFrom('enriched_killmails')
  .where('killmailId', '=', id)
  .executeTakeFirst();
```

### Rule 3: No Shared Database Connections

Services MUST NOT share database connection strings, connection pools, or credentials.

✅ **Correct**:
```yaml
# Clusterer Service
env:
  - name: DATABASE_URL
    value: postgresql://battles_user:pwd@postgresql-battles/battles_db

# Enrichment Service
env:
  - name: DATABASE_URL
    value: postgresql://enrich_user:pwd@postgresql-enrichment/enrichment_db
```

❌ **Incorrect**:
```yaml
# Both services sharing same database
env:
  - name: DATABASE_URL
    value: postgresql://shared_user:pwd@postgresql-shared/battlescope_db
```

### Rule 4: No Foreign Keys Across Service Boundaries

Database foreign keys MUST NOT reference tables in other services' databases.

✅ **Correct**:
```sql
-- In battles_db
CREATE TABLE battle_killmails (
  battle_id UUID REFERENCES battles(id),  -- Same database ✓
  killmail_id BIGINT NOT NULL,            -- Just an ID, no FK ✓
  enriched_data JSONB                     -- Denormalized data ✓
);
```

❌ **Incorrect**:
```sql
-- In battles_db
CREATE TABLE battle_killmails (
  battle_id UUID REFERENCES battles(id),
  killmail_id BIGINT REFERENCES enrichment_db.enriched_killmails(id)  -- Cross-database FK ✗
);
```

### Rule 5: Data Must Be Denormalized Across Service Boundaries

When a service needs data from another domain, it MUST store its own copy (denormalized).

✅ **Correct**:
```typescript
// Clusterer Service stores its own copy of enriched data
interface BattleKillmail {
  killmailId: bigint;
  battleId: string;
  // Denormalized data from enrichment
  shipTypeName: string;
  systemName: string;
  victimName: string;
}

// Consume event and store denormalized data
consumer.on('killmail.enriched', async (event) => {
  await this.db.insertInto('battle_killmails').values({
    killmailId: event.data.killmailId,
    shipTypeName: event.data.ship.name,      // Denormalized
    systemName: event.data.system.name,      // Denormalized
    victimName: event.data.victim.name,      // Denormalized
  });
});
```

❌ **Incorrect**:
```typescript
// Clusterer Service querying enrichment service for every request
async getBattle(id: string) {
  const battle = await this.db.selectFrom('battles').where('id', '=', id);

  // Wrong: Synchronous call to another service for each killmail
  for (const km of battle.killmails) {
    km.enrichedData = await http.get(`http://enrichment/api/killmails/${km.id}`);
  }
}
```

---

## BattleScope Storage Map

### Service: Ingest Service
**Database**: `ingestion_db` (PostgreSQL)

**Schema Ownership**:
```sql
-- Tables owned by Ingest Service
CREATE TABLE killmail_events (
  killmail_id BIGINT PRIMARY KEY,
  system_id BIGINT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  victim_alliance_id BIGINT,
  attacker_alliance_ids BIGINT[],
  isk_value BIGINT,
  zkb_url TEXT NOT NULL,
  processed_at TIMESTAMPTZ,  -- For processing tracking
  battle_id UUID              -- Nullable, set by Clusterer via events
);
```

**Access Control**:
- ✅ Ingest Service: Full read/write access
- ❌ Enrichment Service: No access (consumes `killmail.ingested` events)
- ❌ Clusterer Service: No access (consumes `killmail.enriched` events)
- ❌ All other services: No access

**Storage Configuration**:
```yaml
postgresql-ingestion:
  replicas: 1
  resources:
    memory: 1Gi
    cpu: 500m
    storage: 20Gi SSD
  database: ingestion_db
  user: ingestion_user
  schema: managed by Ingest Service migrations only
```

---

### Service: Enrichment Service
**Database**: `enrichment_db` (PostgreSQL) + Redis Cache

**Schema Ownership**:
```sql
-- Tables owned by Enrichment Service
CREATE TABLE enriched_killmails (
  killmail_id BIGINT PRIMARY KEY,
  ship_type_id BIGINT NOT NULL,
  ship_type_name TEXT NOT NULL,
  ship_group_name TEXT NOT NULL,
  system_id BIGINT NOT NULL,
  system_name TEXT NOT NULL,
  region_name TEXT NOT NULL,
  security_status DECIMAL NOT NULL,
  victim_character_id BIGINT,
  victim_character_name TEXT,
  victim_corp_name TEXT,
  victim_alliance_name TEXT,
  attacker_names JSONB,           -- Denormalized attacker data
  enriched_at TIMESTAMPTZ NOT NULL,
  version INT NOT NULL DEFAULT 1   -- Schema version for evolution
);

-- ESI cache table
CREATE TABLE esi_cache (
  cache_key TEXT PRIMARY KEY,
  cache_value JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
```

**Access Control**:
- ✅ Enrichment Service: Full read/write access
- ❌ Ingest Service: No access
- ❌ Clusterer Service: No access (consumes `killmail.enriched` events)
- ❌ All other services: No access

**Storage Configuration**:
```yaml
postgresql-enrichment:
  replicas: 1
  resources:
    memory: 2Gi
    cpu: 1000m
    storage: 50Gi SSD
  database: enrichment_db
  user: enrichment_user

redis-enrichment:
  purpose: ESI response caching
  databases:
    0: esi-cache         # Ship types, systems, characters
    1: killmail-cache    # Enriched killmail payloads
  maxmemory: 1Gi
  eviction: allkeys-lru
```

---

### Service: Clusterer Service
**Database**: `battles_db` (PostgreSQL)

**Schema Ownership**:
```sql
-- Tables owned by Clusterer Service
CREATE TABLE battles (
  id UUID PRIMARY KEY,
  system_id BIGINT NOT NULL,
  system_name TEXT NOT NULL,        -- Denormalized from enrichment
  security_type TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  total_kills BIGINT NOT NULL,
  total_isk_destroyed BIGINT NOT NULL,
  zkill_related_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE battle_killmails (
  battle_id UUID REFERENCES battles(id) ON DELETE CASCADE,
  killmail_id BIGINT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  zkb_url TEXT NOT NULL,
  -- Denormalized data from enrichment (no foreign keys!)
  ship_type_name TEXT,
  victim_name TEXT,
  victim_alliance_name TEXT,
  isk_value BIGINT,
  side_id INT,
  PRIMARY KEY (battle_id, killmail_id)
);

CREATE TABLE battle_participants (
  battle_id UUID REFERENCES battles(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL,
  character_name TEXT,              -- Denormalized
  alliance_id BIGINT,
  alliance_name TEXT,               -- Denormalized
  corp_id BIGINT,
  corp_name TEXT,                   -- Denormalized
  ship_type_id BIGINT,
  ship_type_name TEXT,              -- Denormalized
  side_id INT,
  is_victim BOOLEAN NOT NULL,
  PRIMARY KEY (battle_id, character_id)
);

CREATE TABLE pilot_ship_history (
  character_id BIGINT NOT NULL,
  ship_type_id BIGINT NOT NULL,
  ship_type_name TEXT NOT NULL,    -- Denormalized
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  kill_count INT NOT NULL,
  loss_count INT NOT NULL,
  PRIMARY KEY (character_id, ship_type_id)
);
```

**Access Control**:
- ✅ Clusterer Service: Full read/write access
- ❌ Ingest Service: No access
- ❌ Enrichment Service: No access
- ❌ Search Service: No access (consumes `battle.created` events)
- ❌ All other services: No access

**Storage Configuration**:
```yaml
postgresql-battles:
  replicas: 1
  resources:
    memory: 2Gi
    cpu: 1000m
    storage: 50Gi SSD
  database: battles_db
  user: battles_user
  schema: managed by Clusterer Service migrations only
  partitioning: battles table by start_time (monthly)
```

---

### Service: Search Service
**Database**: `search_index` (Typesense)

**Schema Ownership**:
```typescript
// Search index schemas owned by Search Service
const battleSearchSchema = {
  name: 'battles',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'system_name', type: 'string', facet: true },
    { name: 'security_type', type: 'string', facet: true },
    { name: 'start_time', type: 'int64', sort: true },
    { name: 'total_kills', type: 'int32', sort: true },
    { name: 'total_isk_destroyed', type: 'int64', sort: true },
    { name: 'alliance_names', type: 'string[]', facet: true },
    { name: 'participant_names', type: 'string[]' },
  ],
};

const killmailSearchSchema = {
  name: 'killmails',
  fields: [
    { name: 'killmail_id', type: 'string' },
    { name: 'victim_name', type: 'string' },
    { name: 'ship_type_name', type: 'string', facet: true },
    { name: 'system_name', type: 'string', facet: true },
    { name: 'occurred_at', type: 'int64', sort: true },
  ],
};
```

**Access Control**:
- ✅ Search Service: Full read/write access to Typesense
- ❌ Clusterer Service: No access (publishes `battle.created` events)
- ❌ Enrichment Service: No access
- ❌ All other services: No access (query via Search Service API)

**Storage Configuration**:
```yaml
typesense:
  replicas: 1
  resources:
    memory: 2Gi
    cpu: 1000m
    storage: 30Gi SSD
  collections:
    - battles (indexed from battle.created events)
    - killmails (indexed from killmail.enriched events)
  schema_management: Search Service only
```

---

### Service: Notification Service
**Database**: `notifications_db` (PostgreSQL) + Redis

**Schema Ownership**:
```sql
-- Tables owned by Notification Service
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  subscription_type TEXT NOT NULL,  -- 'alliance', 'system', 'character'
  filter_value BIGINT NOT NULL,     -- alliance_id, system_id, character_id
  notification_channel TEXT NOT NULL, -- 'websocket', 'webhook', 'email'
  webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (user_id, subscription_type, filter_value)
);

CREATE TABLE notification_history (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  subscription_id UUID REFERENCES user_subscriptions(id),
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Access Control**:
- ✅ Notification Service: Full read/write access
- ❌ All other services: No access

**Storage Configuration**:
```yaml
postgresql-notifications:
  replicas: 1
  resources:
    memory: 512Mi
    cpu: 250m
    storage: 10Gi SSD

redis-notifications:
  purpose: WebSocket connection tracking
  databases:
    0: active-connections  # user_id -> websocket connection
    1: rate-limiting       # notification throttling
```

---

## Storage Technology Selection Per Service

Each service chooses the BEST storage technology for its domain needs:

| Service | Storage | Why This Technology? |
|---------|---------|---------------------|
| **Ingest** | PostgreSQL | ACID transactions, deduplication, time-series queries |
| **Enrichment** | PostgreSQL + Redis | Relational enriched data + fast ESI cache |
| **Clusterer** | PostgreSQL | Complex queries, joins, battle aggregation |
| **Search** | Typesense | Full-text search, faceted search, ranking |
| **Analytics** | None (GA4) | External SaaS, no local storage needed |
| **Notification** | PostgreSQL + Redis | Subscriptions + ephemeral connections |

**Rule**: Service chooses its own storage technology. No mandate from central authority.

---

## Data Synchronization Patterns

When services need data from other domains, use these patterns:

### Pattern 1: Event-Driven Denormalization

Service consumes events and stores what it needs locally.

```typescript
// In Clusterer Service
consumer.on('killmail.enriched', async (event) => {
  const { killmailId, shipTypeName, victimName, systemName } = event.data;

  // Store denormalized copy in battles_db
  await this.db.insertInto('battle_killmails').values({
    killmailId,
    shipTypeName,    // Denormalized from enrichment
    victimName,      // Denormalized from enrichment
    systemName,      // Denormalized from enrichment
  });
});
```

**Trade-offs**:
- ✅ No runtime dependencies on other services
- ✅ Fast queries (no joins across services)
- ✅ Resilient to other service failures
- ❌ Data duplication (storage cost)
- ❌ Eventual consistency (acceptable for most cases)

### Pattern 2: API Aggregation (for real-time needs)

Service exposes API that includes references to other domains. Frontend calls multiple APIs.

```typescript
// Clusterer Service API returns battle with killmail IDs
GET /api/battles/{id}
{
  "id": "battle-123",
  "totalKills": 47,
  "killmails": [
    { "killmailId": 123456, "occurredAt": "..." },
    { "killmailId": 123457, "occurredAt": "..." }
  ]
}

// Frontend calls Enrichment Service to get details
GET /api/killmails/enriched/123456
{
  "killmailId": 123456,
  "shipTypeName": "Titan",
  "victimName": "Player123"
}
```

**Trade-offs**:
- ✅ No data duplication
- ✅ Always up-to-date
- ❌ Multiple API calls from frontend
- ❌ Runtime dependency on other services
- ❌ Higher latency (network calls)

### Pattern 3: Backend-for-Frontend (BFF)

Dedicated aggregation service for frontend needs.

```typescript
// BFF Service (separate from domain services)
GET /api/bff/battles/{id}/full
{
  "battle": { /* from Clusterer API */ },
  "enrichedKillmails": [ /* from Enrichment API */ ],
  "searchLink": { /* from Search Service */ }
}

// BFF internally calls multiple services
async getBattleFull(id: string) {
  const [battle, killmails, searchData] = await Promise.all([
    http.get(`http://clusterer/api/battles/${id}`),
    http.get(`http://enrichment/api/killmails/enriched?battleId=${id}`),
    http.get(`http://search/api/search/related?battleId=${id}`)
  ]);

  return { battle, enrichedKillmails, searchLink };
}
```

**Trade-offs**:
- ✅ Single frontend API call
- ✅ Domain services stay pure
- ✅ Can add caching/optimization in BFF
- ❌ Additional service to maintain
- ❌ Runtime dependencies on multiple services

---

## Schema Migration Independence

Each service manages its own schema migrations independently.

### Clusterer Service Migrations

```
backend/clusterer/migrations/
├── 001_create_battles_table.sql
├── 002_add_battle_participants.sql
├── 003_add_pilot_ship_history.sql
└── 004_partition_battles_by_month.sql
```

**Rule**: Clusterer Service can deploy schema changes without coordinating with Enrichment or Ingest services.

### Enrichment Service Migrations

```
backend/enrichment/migrations/
├── 001_create_enriched_killmails.sql
├── 002_add_esi_cache_table.sql
└── 003_add_version_column.sql
```

**Rule**: Enrichment Service can deploy schema changes without coordinating with Clusterer or Search services.

---

## Database Credentials and Security

### Rule: Separate Credentials Per Service

```yaml
# Clusterer Service Credentials
apiVersion: v1
kind: Secret
metadata:
  name: battles-db-credentials
type: Opaque
data:
  username: YmF0dGxlc191c2Vy        # battles_user
  password: <encrypted>
  database: YmF0dGxlc19kYg==        # battles_db

---
# Enrichment Service Credentials (completely separate)
apiVersion: v1
kind: Secret
metadata:
  name: enrichment-db-credentials
type: Opaque
data:
  username: ZW5yaWNobWVudF91c2Vy    # enrichment_user
  password: <encrypted>
  database: ZW5yaWNobWVudF9kYg==    # enrichment_db
```

### Rule: Principle of Least Privilege

Each database user has ONLY the permissions needed for its service:

```sql
-- battles_user can ONLY access battles_db
CREATE USER battles_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE battles_db TO battles_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO battles_user;
REVOKE CONNECT ON DATABASE enrichment_db FROM battles_user;
REVOKE CONNECT ON DATABASE ingestion_db FROM battles_user;

-- enrichment_user can ONLY access enrichment_db
CREATE USER enrichment_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE enrichment_db TO enrichment_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO enrichment_user;
REVOKE CONNECT ON DATABASE battles_db FROM enrichment_user;
REVOKE CONNECT ON DATABASE ingestion_db FROM enrichment_user;
```

---

## Backup and Recovery Independence

Each service manages its own backup strategy based on its domain needs.

```yaml
# Clusterer Service: High value data, frequent backups
postgresql-battles:
  backup:
    schedule: "0 */4 * * *"  # Every 4 hours
    retention: 30 days
    destination: s3://battlescope-backups/battles/

# Ingest Service: Transient data, less frequent backups
postgresql-ingestion:
  backup:
    schedule: "0 0 * * *"  # Daily
    retention: 7 days
    destination: s3://battlescope-backups/ingestion/

# Enrichment Service: Can be rebuilt from ESI, minimal backups
postgresql-enrichment:
  backup:
    schedule: "0 0 * * 0"  # Weekly
    retention: 14 days
    destination: s3://battlescope-backups/enrichment/
```

**Rule**: Service failure in one database does NOT affect other services.

---

## Anti-Patterns to Avoid

### ❌ Shared Database Instance with Multiple Schemas

**Bad**:
```
PostgreSQL Instance (shared)
├── ingestion schema (Ingest Service)
├── enrichment schema (Enrichment Service)
└── battles schema (Clusterer Service)
```

**Problem**:
- Database failure affects all services
- Scaling limits shared across services
- Schema migrations require coordination
- Resource contention between services

**Good**:
```
PostgreSQL Instance 1 → ingestion_db (Ingest Service only)
PostgreSQL Instance 2 → enrichment_db (Enrichment Service only)
PostgreSQL Instance 3 → battles_db (Clusterer Service only)
```

### ❌ Service Querying Another Service's Database

**Bad**:
```typescript
// In Clusterer Service
const db = createConnection({
  host: 'postgresql-enrichment',  // Wrong database!
  database: 'enrichment_db',
});

const enrichedData = await db.query('SELECT * FROM enriched_killmails WHERE id = $1', [id]);
```

**Good**:
```typescript
// In Clusterer Service - consume from events
consumer.on('killmail.enriched', async (event) => {
  await this.battlesDb.insertInto('battle_killmails')
    .values({ enrichedData: event.data })
    .execute();
});
```

### ❌ Foreign Keys Across Service Databases

**Bad**:
```sql
-- In battles_db trying to reference enrichment_db
CREATE TABLE battle_killmails (
  battle_id UUID REFERENCES battles(id),
  killmail_id BIGINT REFERENCES enrichment_db.public.enriched_killmails(id)  -- ✗ Cross-DB FK
);
```

**Good**:
```sql
-- In battles_db with just the ID (no FK constraint)
CREATE TABLE battle_killmails (
  battle_id UUID REFERENCES battles(id),
  killmail_id BIGINT NOT NULL,  -- ✓ Just an ID, data denormalized
  ship_type_name TEXT,          -- ✓ Denormalized from enrichment
  victim_name TEXT              -- ✓ Denormalized from enrichment
);
```

### ❌ Sharing Connection Pools

**Bad**:
```typescript
// Shared database client used by multiple services
export const sharedDb = createDatabase({
  host: 'postgresql-shared',
  database: 'battlescope',
});

// Ingest Service uses shared client
await sharedDb.insertInto('killmail_events').values(...);

// Clusterer Service uses same client
await sharedDb.selectFrom('battles').where(...);
```

**Good**:
```typescript
// Ingest Service has its own client
export const ingestDb = createDatabase({
  host: 'postgresql-ingestion',
  database: 'ingestion_db',
});

// Clusterer Service has completely separate client
export const battlesDb = createDatabase({
  host: 'postgresql-battles',
  database: 'battles_db',
});
```

---

## Validation Checklist

Before implementing storage, verify:

### Database Isolation
- [ ] Service has its own dedicated database instance
- [ ] Database credentials are unique to this service
- [ ] No other service can access this database
- [ ] Database is in service's namespace/network segment

### Schema Independence
- [ ] Service owns all tables in its database
- [ ] No foreign keys reference other services' tables
- [ ] Schema migrations managed by this service only
- [ ] No shared migration scripts across services

### Data Access Patterns
- [ ] Service never queries another service's database
- [ ] Cross-domain data comes from events (denormalized)
- [ ] OR cross-domain data fetched via API calls (real-time)
- [ ] No shared connection pools or clients

### Technology Choice
- [ ] Storage technology chosen for domain needs
- [ ] Not forced to use same tech as other services
- [ ] Can optimize for service-specific workload

---

## How Claude Should Use This Skill

When I (Claude) am:

- **Designing storage**: Create separate database per service
- **Writing queries**: Verify we're only accessing our own database
- **Adding tables**: Confirm they belong to this service's domain
- **Creating foreign keys**: Ensure they're within same database
- **Implementing features**: Use events for cross-service data, not direct DB access
- **Reviewing code**: Flag any shared database access or cross-DB queries

**If I detect storage boundary violations, I should STOP and ask for clarification.**

---

## Summary: Storage Isolation Golden Rules

1. **One Database Per Service** - Never share databases
2. **Own Your Schema** - Service exclusively manages its schema
3. **No Cross-Database Queries** - Use events or APIs instead
4. **No Foreign Keys Across Services** - Denormalize data instead
5. **Separate Credentials** - Each service has unique DB user
6. **Independent Scaling** - Each database scales independently
7. **Independent Backups** - Each service manages its own backup strategy
8. **Technology Freedom** - Choose best storage for your domain

---

## References

- Database per Service pattern (Chris Richardson)
- CQRS and Event Sourcing (Greg Young)
- Microservices Data Management (Sam Newman)
- The Saga pattern for distributed transactions
