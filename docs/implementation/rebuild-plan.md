# BattleScope V3 Complete Rebuild Plan

**Date**: 2025-11-25
**Status**: In Progress
**Archived Previous**: `.archive/v3-old-20251125-121125/`

---

## Rebuild Objectives

1. ✅ **Follow all skills and proposals** - Use every documented pattern
2. ✅ **Proper authentication** - EVE SSO OAuth with multi-character support
3. ✅ **Database migrations** - Automatic on startup with init containers
4. ✅ **Service isolation** - Each service has own database
5. ✅ **Search indexes** - Typesense with proper schemas
6. ✅ **Frontend modules** - All 8 modules implemented
7. ✅ **Complete testing** - End-to-end flow working

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  - Auth Module  - Character Mgmt  - Dashboard  - Battles    │
│  - Intel  - Search  - Notifications  - Admin                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │   BFF Service (3006)   │
           │  - Aggregates APIs     │
           │  - Proxies Auth        │
           └─────────┬───────────────┘
                     │
        ┌────────────┼────────────────┬──────────────┐
        ▼            ▼                ▼              ▼
┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐
│ Auth (3007)  │ │ Ingest   │ │ Enrich   │ │ Battle (3003) │
│ - EVE SSO    │ │ (3001)   │ │ (3002)   │ │ - Clustering  │
│ - Multi-char │ │ - ZKill  │ │ - ESI    │ │ - Analysis    │
│ - RBAC       │ │          │ │          │ │               │
└──────┬───────┘ └────┬─────┘ └────┬─────┘ └───────┬───────┘
       │              │            │                │
       ▼              ▼            ▼                ▼
  auth_db      ingestion_db  enrichment_db    battles_db

┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│ Search (3004)│ │ Notify (3005)│ │ Analytics (GA4)  │
│ - Typesense  │ │ - WebSockets │ │ - External SaaS  │
│ - Indexes    │ │ - Webhooks   │ │                  │
└──────┬───────┘ └──────┬───────┘ └──────────────────┘
       │                │
       ▼                ▼
  search_index    notifications_db

Infrastructure:
- PostgreSQL (multi-database)
- Redis (sessions + caching)
- Redpanda (event streaming)
- Typesense (search)
- Prometheus + Grafana + Loki (observability)
```

---

## Phase 1: Foundation & Shared Code

### 1.1 Project Structure

```
battle-monitor/
├── services/
│   ├── authentication/          # NEW - EVE SSO auth service
│   ├── ingestion/               # Rebuild
│   ├── enrichment/              # Rebuild
│   ├── battle/                  # Rebuild (clusterer)
│   ├── search/                  # Rebuild with Typesense
│   ├── notification/            # Rebuild
│   └── bff/                     # Rebuild
├── frontend/                    # Complete rebuild
├── packages/                    # NEW - Shared code
│   ├── database/                # Kysely + migration runner
│   ├── logger/                  # Pino logger
│   ├── types/                   # Shared TypeScript types
│   └── events/                  # Event schemas
├── infra/
│   ├── k8s/
│   │   ├── infrastructure/      # Postgres, Redis, Redpanda, Typesense
│   │   ├── services/            # Service deployments
│   │   └── jobs/                # Database init jobs
│   └── docker-compose.yaml      # Local development
├── docs/                        # All proposals and specs
├── .claude/skills/              # All skills
└── Makefile                     # Build automation
```

### 1.2 Shared Packages

**packages/database**:
- Kysely query builder setup
- Migration runner (following migration skill)
- Database client factory
- Common types

**packages/logger**:
- Pino logger configuration
- Request ID tracking
- Structured logging

**packages/types**:
- Shared TypeScript interfaces
- Event payload types
- API response types

**packages/events**:
- Kafka/Redpanda event schemas
- Event producer/consumer utilities
- Event validation with Zod

---

## Phase 2: Authentication Service (Priority 1)

**Port**: 3007
**Database**: `battlescope_auth`
**Cache**: Redis

### Features:
- ✅ EVE Online SSO OAuth2 flow
- ✅ Multi-character management (primary + alts)
- ✅ Session management with Redis
- ✅ ESI token storage (encrypted with AES-256-GCM)
- ✅ Token refresh automation
- ✅ Corp/Alliance gating
- ✅ Feature-scoped RBAC (User/FC/Director/Admin/SuperAdmin)
- ✅ Audit logging
- ✅ `/me` endpoint for current user
- ✅ Character linking flow

### Database Schema:
- `accounts` - User accounts
- `characters` - EVE characters with ESI tokens (encrypted)
- `features` - Feature areas (battle-reports, battle-intel)
- `roles` - Role definitions
- `account_feature_roles` - Role assignments
- `feature_settings` - Feature configuration
- `auth_config` - Corp/Alliance allow/deny lists
- `audit_logs` - Audit trail
- `schema_migrations` - Migration tracking

### API Endpoints:
```
GET  /health
GET  /auth/login
GET  /auth/callback
POST /auth/logout
GET  /me
GET  /me/characters
POST /me/characters/link
POST /me/characters/primary
DELETE /me/characters/:id
POST /authorize
GET  /admin/accounts
PUT  /admin/accounts/:id
POST /admin/roles/grant
GET  /admin/config
PUT  /admin/config
GET  /admin/audit
```

---

## Phase 3: Core Services (Priority 2)

### 3.1 Ingestion Service

**Port**: 3001
**Database**: `battlescope_ingestion`

**Responsibilities**:
- Poll ZKillboard RedisQ
- Deduplicate killmails
- Publish `killmail.ingested` events
- Track processing status

**Schema**:
```sql
CREATE TABLE killmail_events (
  killmail_id BIGINT PRIMARY KEY,
  system_id BIGINT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  victim_alliance_id BIGINT,
  attacker_alliance_ids BIGINT[],
  isk_value BIGINT,
  zkb_url TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  battle_id UUID
);

CREATE INDEX idx_killmail_events_occurred_at ON killmail_events(occurred_at DESC);
CREATE INDEX idx_killmail_events_system_id ON killmail_events(system_id);
CREATE INDEX idx_killmail_events_processed_at ON killmail_events(processed_at) WHERE processed_at IS NULL;
```

### 3.2 Enrichment Service

**Port**: 3002
**Database**: `battlescope_enrichment`
**Cache**: Redis (ESI responses)

**Responsibilities**:
- Consume `killmail.ingested` events
- Enrich with ESI data (ship types, systems, characters)
- Cache ESI responses
- Publish `killmail.enriched` events

**Schema**:
```sql
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
  attacker_data JSONB NOT NULL,
  enriched_at TIMESTAMPTZ NOT NULL,
  version INT NOT NULL DEFAULT 1
);

CREATE TABLE esi_cache (
  cache_key TEXT PRIMARY KEY,
  cache_value JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_esi_cache_expires_at ON esi_cache(expires_at);
```

### 3.3 Battle/Clusterer Service

**Port**: 3003
**Database**: `battlescope_battles`

**Responsibilities**:
- Consume `killmail.enriched` events
- Cluster killmails into battles
- Track battle participants
- Publish `battle.created`, `battle.updated`, `battle.ended` events

**Schema**:
```sql
CREATE TABLE battles (
  id UUID PRIMARY KEY,
  system_id BIGINT NOT NULL,
  system_name TEXT NOT NULL,
  region_name TEXT NOT NULL,
  security_type TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  total_kills INT NOT NULL DEFAULT 0,
  total_isk_destroyed BIGINT NOT NULL DEFAULT 0,
  zkill_related_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE battle_killmails (
  battle_id UUID REFERENCES battles(id) ON DELETE CASCADE,
  killmail_id BIGINT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
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
  character_name TEXT,
  alliance_id BIGINT,
  alliance_name TEXT,
  corp_id BIGINT,
  corp_name TEXT,
  ship_type_id BIGINT,
  ship_type_name TEXT,
  side_id INT,
  is_victim BOOLEAN NOT NULL,
  PRIMARY KEY (battle_id, character_id)
);

CREATE TABLE pilot_ship_history (
  character_id BIGINT NOT NULL,
  ship_type_id BIGINT NOT NULL,
  ship_type_name TEXT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  kill_count INT NOT NULL,
  loss_count INT NOT NULL,
  PRIMARY KEY (character_id, ship_type_id)
);

CREATE INDEX idx_battles_start_time ON battles(start_time DESC);
CREATE INDEX idx_battles_system_id ON battles(system_id);
CREATE INDEX idx_battle_participants_character_id ON battle_participants(character_id);
```

### 3.4 Search Service

**Port**: 3004
**Storage**: Typesense

**Responsibilities**:
- Consume `battle.created`, `killmail.enriched` events
- Index in Typesense
- Provide search API
- Support autocomplete

**Typesense Collections**:

```typescript
// Battles collection
const battleSchema = {
  name: 'battles',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'system_name', type: 'string', facet: true },
    { name: 'region_name', type: 'string', facet: true },
    { name: 'security_type', type: 'string', facet: true },
    { name: 'start_time', type: 'int64', sort: true },
    { name: 'end_time', type: 'int64', sort: true, optional: true },
    { name: 'total_kills', type: 'int32', sort: true },
    { name: 'total_isk_destroyed', type: 'int64', sort: true },
    { name: 'alliance_names', type: 'string[]', facet: true },
    { name: 'participant_names', type: 'string[]' },
  ],
  default_sorting_field: 'start_time',
};

// Killmails collection
const killmailSchema = {
  name: 'killmails',
  fields: [
    { name: 'killmail_id', type: 'string' },
    { name: 'victim_name', type: 'string' },
    { name: 'victim_alliance', type: 'string', facet: true, optional: true },
    { name: 'ship_type_name', type: 'string', facet: true },
    { name: 'ship_group', type: 'string', facet: true },
    { name: 'system_name', type: 'string', facet: true },
    { name: 'region_name', type: 'string', facet: true },
    { name: 'occurred_at', type: 'int64', sort: true },
    { name: 'isk_value', type: 'int64', sort: true },
  ],
  default_sorting_field: 'occurred_at',
};

// Characters collection (for autocomplete)
const characterSchema = {
  name: 'characters',
  fields: [
    { name: 'character_id', type: 'string' },
    { name: 'character_name', type: 'string' },
    { name: 'corp_name', type: 'string' },
    { name: 'alliance_name', type: 'string', optional: true },
  ],
};

// Corporations collection
const corpSchema = {
  name: 'corporations',
  fields: [
    { name: 'corp_id', type: 'string' },
    { name: 'corp_name', type: 'string' },
    { name: 'alliance_name', type: 'string', optional: true },
    { name: 'member_count', type: 'int32', optional: true },
  ],
};

// Systems collection
const systemSchema = {
  name: 'systems',
  fields: [
    { name: 'system_id', type: 'string' },
    { name: 'system_name', type: 'string' },
    { name: 'region_name', type: 'string' },
    { name: 'security_status', type: 'float' },
  ],
};
```

### 3.5 Notification Service

**Port**: 3005
**Database**: `battlescope_notifications`
**Cache**: Redis (WebSocket connections)

**Responsibilities**:
- Manage user subscriptions
- Send WebSocket notifications
- Webhook delivery
- Email notifications (future)

**Schema**:
```sql
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  subscription_type TEXT NOT NULL,
  filter_value BIGINT,
  notification_channels TEXT[] NOT NULL,
  webhook_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

### 3.6 BFF Service

**Port**: 3006
**No Database** (stateless aggregator)

**Responsibilities**:
- Aggregate responses from multiple services
- Proxy authentication requests
- Simplify frontend API calls
- Add caching layer

---

## Phase 4: Frontend (Priority 3)

**Port**: 3000 (NodePort 30000)
**Technology**: Next.js 15 + React 19 + TypeScript + Tailwind

### Modules:

1. **Authentication Module** (`/`, `/auth/callback`)
   - EVE SSO login button
   - OAuth callback handler
   - Session persistence

2. **Character Management** (`/characters`)
   - List all linked characters
   - Set primary character
   - Link new characters
   - Unlink characters

3. **Dashboard** (`/dashboard`)
   - Service health cards
   - Statistics overview
   - Recent activity feed

4. **Battle Reports** (`/battles`, `/battles/:id`)
   - Battle list with filters
   - Battle detail with timeline
   - Participant analysis
   - Ship type breakdown

5. **Battle Intel** (`/intel`)
   - Live killmail feed
   - Filters and search
   - Watchlists
   - Real-time WebSocket updates

6. **Search** (`/search`)
   - Universal search
   - Autocomplete
   - Type filters
   - Entity detail pages

7. **Notifications** (`/notifications`)
   - Notification list
   - Mark as read
   - Notification settings

8. **Admin** (`/admin/*`)
   - User management
   - Role assignment
   - Corp/Alliance config
   - Audit logs

---

## Phase 5: Infrastructure & Deployment

### 5.1 Database Init Job

```yaml
# infra/k8s/jobs/create-databases.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: create-databases
  namespace: battlescope
spec:
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: create-dbs
          image: postgres:15-alpine
          command: ["/bin/sh", "-c"]
          args:
            - |
              for db in battlescope_auth battlescope_ingestion battlescope_enrichment battlescope_battles battlescope_notifications; do
                echo "Creating database $db..."
                PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1 || \
                PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U postgres -c "CREATE DATABASE $db"
              done
```

### 5.2 Service Deployments with Init Containers

Each service deployment includes migration init container:

```yaml
initContainers:
  - name: migrate
    image: petdog/battlescope-{service}:v3.0.0
    command: ['npm', 'run', 'migrate']
    env: # Same DB config as main container
```

### 5.3 Makefile Updates

```makefile
.PHONY: k8s-init
k8s-init: ## Initialize databases
	kubectl apply -f infra/k8s/jobs/create-databases.yaml
	kubectl wait --for=condition=complete job/create-databases -n battlescope --timeout=120s

.PHONY: k8s-deploy
k8s-deploy: k8s-init ## Deploy complete system
	kubectl apply -f infra/k8s/infrastructure/
	kubectl apply -f infra/k8s/services/
	@echo "✅ Deployment complete"
```

---

## Implementation Order

1. ✅ Archive old code
2. 🔄 Create shared packages (database, logger, types, events)
3. 🔄 Implement authentication service FIRST (blocks everything)
4. 🔄 Implement core services (ingestion → enrichment → battle)
5. 🔄 Implement search service with Typesense indexes
6. 🔄 Implement notification service
7. 🔄 Implement BFF service
8. 🔄 Implement frontend (all 8 modules)
9. 🔄 Set up infrastructure (K8s jobs, init containers)
10. 🔄 Deploy and test end-to-end

---

## Success Criteria

- [ ] User can log in with EVE Online SSO
- [ ] User can link multiple characters
- [ ] Killmails flow through all services
- [ ] Battles are clustered correctly
- [ ] Search works across all entity types
- [ ] Frontend displays real data
- [ ] All services have automatic migrations
- [ ] System deploys with `make k8s-deploy`
- [ ] All observability metrics working
- [ ] Documentation complete

---

## Estimated Timeline

- **Shared Packages**: 1 hour
- **Authentication Service**: 4 hours
- **Core Services (3x)**: 6 hours
- **Search Service**: 2 hours
- **Notification Service**: 2 hours
- **BFF Service**: 2 hours
- **Frontend**: 6 hours
- **Infrastructure**: 2 hours
- **Testing & Debugging**: 3 hours

**Total**: ~28 hours of focused work
