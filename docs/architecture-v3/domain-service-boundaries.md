# Claude Skill: Domain-Driven Service Boundaries

**Purpose**: Guide architectural decisions to maintain clean domain boundaries and prevent service responsibility sprawl.

---

## Core Principles

### 1. Domain Boundaries Are Sacred

**Rule**: No service shall cross domain boundaries or access another domain's data directly.

**Rationale**:
- Maintains clear separation of concerns
- Prevents tight coupling between services
- Enables independent evolution and scaling
- Reduces blast radius of failures
- Simplifies testing and deployment

**Examples**:

✅ **Correct**:
```
Clusterer Service owns "Battle" domain
  - Manages battle lifecycle
  - Stores battle data in its own database
  - Exposes battle data via its own API
  - Does NOT access killmail enrichment data directly
  - Does NOT expose search functionality
```

❌ **Incorrect**:
```
Clusterer Service crosses boundaries
  - Queries enrichment database directly
  - Exposes search endpoints
  - Manages notification subscriptions
  - Handles analytics events
```

---

## Domain-Driven Design Framework

### Domain Identification

Before creating or modifying a service, identify its **Bounded Context**:

1. **What is the core domain concept?**
   - Battle, Killmail, Search, Analytics, etc.

2. **What are the domain entities?**
   - Battle aggregate: Battle, BattleParticipant, BattleKillmail
   - Killmail aggregate: Killmail, Attacker, Victim, Item

3. **What are the domain operations?**
   - Battle domain: Create, Update, Query, Analyze
   - Killmail domain: Ingest, Enrich, Validate

4. **What are the domain events?**
   - Battle domain: BattleCreated, BattleUpdated, BattleClosed
   - Killmail domain: KillmailIngested, KillmailEnriched

### Service Responsibility Checklist

When creating or modifying a service, verify:

- [ ] **Single Domain**: Service operates within exactly ONE domain
- [ ] **Clear Purpose**: Service has a well-defined, focused responsibility
- [ ] **Data Ownership**: Service owns and exclusively manages its data
- [ ] **API Scope**: Service only exposes operations for its domain
- [ ] **No Leakage**: Service does NOT expose other domains' data
- [ ] **Event Publishing**: Service publishes domain events for others to consume
- [ ] **Event Consumption**: Service only consumes events relevant to its domain

---

## BattleScope Domain Map

### Domain: **Ingestion**
**Bounded Context**: Raw killmail data acquisition

**Service**: Ingest Service
- **Owns**: Raw killmail events from external sources
- **Database**: `ingestion_db` (killmail_events table)
- **API**: `/api/ingestion/*` (health, stats only - no data exposure)
- **Events Published**: `killmail.ingested`
- **Events Consumed**: None
- **Responsibilities**:
  - Poll zKillboard RedisQ
  - Validate killmail format
  - Store raw killmail data
  - Publish ingestion events
- **NOT Responsible For**:
  - Enrichment (different domain)
  - Battle clustering (different domain)
  - Search indexing (different domain)

---

### Domain: **Enrichment**
**Bounded Context**: Killmail data augmentation and caching

**Service**: Enrichment Service
- **Owns**: Enriched killmail data, ESI cache
- **Database**: None (uses Redis cache for ESI responses)
- **Database**: Optional `enrichment_db` for enriched killmail storage
- **API**: `/api/killmails/enriched/*` (query enriched data)
- **Events Published**: `killmail.enriched`
- **Events Consumed**: `killmail.ingested`
- **Responsibilities**:
  - Fetch ship types, solar systems, character names from ESI
  - Cache ESI responses
  - Augment killmail with human-readable names
  - Validate enriched data completeness
  - Publish enriched events
- **NOT Responsible For**:
  - Battle creation (different domain)
  - Raw killmail storage (different domain)
  - Search indexing (different domain)

---

### Domain: **Battle**
**Bounded Context**: Combat encounter aggregation and analysis

**Service**: Clusterer Service
- **Owns**: Battles, battle participants, battle statistics
- **Database**: `battles_db` (battles, battle_participants, battle_killmails)
- **API**: `/api/battles/*` (CRUD operations for battles)
- **Events Published**: `battle.created`, `battle.updated`, `battle.closed`
- **Events Consumed**: `killmail.enriched`
- **Responsibilities**:
  - Cluster killmails into battles
  - Maintain battle lifecycle
  - Calculate battle statistics
  - Track participants and sides
  - Retroactive killmail attribution
  - Expose battle query API
- **NOT Responsible For**:
  - Killmail enrichment (different domain)
  - Search indexing (different domain)
  - Notifications (different domain)
  - Analytics (different domain)

---

### Domain: **Search**
**Bounded Context**: Full-text search and filtering

**Service**: Search Service
- **Owns**: Search indices, filters, facets
- **Database**: Typesense (search engine)
- **API**: `/api/search/*` (search queries)
- **Events Published**: None
- **Events Consumed**: `battle.created`, `battle.updated`, `killmail.enriched`
- **Responsibilities**:
  - Index battles for search
  - Index killmails for search
  - Provide full-text search API
  - Maintain search filters and facets
  - Handle search result ranking
- **NOT Responsible For**:
  - Battle creation (different domain)
  - Data storage (different domain)
  - Battle statistics calculation (different domain)

---

### Domain: **Analytics**
**Bounded Context**: Event tracking and user behavior analysis

**Service**: Analytics Service
- **Owns**: Analytics events, user behavior tracking
- **Database**: None (uses Google Analytics 4)
- **API**: None (internal only)
- **Events Published**: None
- **Events Consumed**: All events (`battle.*`, `killmail.*`, `user.*`)
- **Responsibilities**:
  - Forward events to Google Analytics 4
  - Track user interactions
  - Monitor system usage
  - Generate event batches
- **NOT Responsible For**:
  - Battle data storage (different domain)
  - Search functionality (different domain)
  - User notifications (different domain)

---

### Domain: **Notification**
**Bounded Context**: Real-time user notifications

**Service**: Notification Service
- **Owns**: User subscriptions, notification preferences, WebSocket connections
- **Database**: `notifications_db` or Redis for connection tracking
- **API**: `/api/notifications/*` (subscription management)
- **Events Published**: None
- **Events Consumed**: `battle.created`, `battle.updated` (filtered by user subscriptions)
- **Responsibilities**:
  - Manage user subscriptions
  - Maintain WebSocket connections
  - Push real-time notifications
  - Filter events by user preferences
- **NOT Responsible For**:
  - Battle creation (different domain)
  - Battle data storage (different domain)
  - Analytics (different domain)

---

### Domain: **API Gateway** (Optional)
**Bounded Context**: Request routing and authentication

**Service**: API Gateway (Kong/Traefik/Custom)
- **Owns**: Routes, authentication, rate limiting
- **Database**: None (or auth token cache)
- **API**: All public endpoints (routes to services)
- **Events Published**: None
- **Events Consumed**: None
- **Responsibilities**:
  - Route requests to appropriate services
  - Authentication and authorization
  - Rate limiting
  - Request logging
  - CORS handling
- **NOT Responsible For**:
  - Business logic (delegates to services)
  - Data storage (different domains)
  - Data aggregation (should be in services or BFF)

---

## Decision Framework

### When Creating a New Feature

**Question**: Where does this feature belong?

**Decision Tree**:

```
1. What domain concept does this feature relate to?
   └─> If Battle-related → Clusterer Service
   └─> If Killmail-related → Ingest/Enrichment Service
   └─> If Search-related → Search Service
   └─> If User-related → Notification/Auth Service

2. Does this feature require data from multiple domains?
   └─> YES → Create a new BFF (Backend-for-Frontend) endpoint
              OR use GraphQL federation
              OR client-side aggregation
   └─> NO → Add to the appropriate domain service

3. Does this feature create a new domain concept?
   └─> YES → Create a new service
   └─> NO → Extend existing service within its domain
```

**Examples**:

**Feature**: "Show battle participants with their ship names"
- **Domain**: Battle (primary) + Enrichment (secondary)
- **Decision**:
  - Clusterer Service stores participant IDs
  - Clusterer Service API returns participant IDs
  - Frontend calls Enrichment Service API to get ship names
  - OR: Clusterer Service includes enriched data when storing (denormalized)
- **Rationale**: Battle service should not query enrichment database directly

**Feature**: "Search battles by alliance name"
- **Domain**: Search (primary) + Battle (secondary)
- **Decision**:
  - Search Service indexes alliance names from `battle.created` events
  - Search Service exposes `/api/search/battles?alliance=...`
  - Search Service does NOT query battles database directly
- **Rationale**: Search has its own indexed data model

**Feature**: "Calculate alliance battle statistics"
- **Domain**: Battle (primary)
- **Decision**:
  - Clusterer Service adds `/api/battles/statistics/alliance/{id}`
  - Clusterer Service calculates from its own battles database
  - Clusterer Service does NOT query killmail database
- **Rationale**: Statistics are derived from battle data (owned domain)

---

## Anti-Patterns to Avoid

### ❌ Cross-Domain Database Queries

**Bad**:
```typescript
// In Clusterer Service
const killmail = await enrichmentDb
  .selectFrom('enriched_killmails')
  .where('killmailId', '=', id)
  .executeTakeFirst();
```

**Good**:
```typescript
// In Clusterer Service
const event = await consumeKafkaEvent('killmail.enriched');
// Store what we need from the event in our own database
await battlesDb
  .insertInto('battle_killmails')
  .values({ enrichedData: event.data })
  .execute();
```

### ❌ Service Implementing Multiple Domains

**Bad**:
```typescript
// Clusterer Service exposing search endpoints
app.get('/api/search/battles', ...);  // Wrong domain!
app.get('/api/battles/:id', ...);     // Correct domain
app.post('/api/notifications/subscribe', ...); // Wrong domain!
```

**Good**:
```typescript
// Clusterer Service only exposes Battle domain
app.get('/api/battles', ...);
app.get('/api/battles/:id', ...);
app.put('/api/battles/:id', ...);
app.get('/api/battles/statistics/alliance/:id', ...);
```

### ❌ Synchronous Service-to-Service Calls for Data

**Bad**:
```typescript
// In Clusterer Service
const enrichedData = await http.get('http://enrichment-service/api/killmails/enriched/' + id);
```

**Good**:
```typescript
// In Clusterer Service - consume from Kafka event
consumer.on('killmail.enriched', async (event) => {
  // Event already contains enriched data
  await storeBattleKillmail(event.data);
});
```

**Exception**: Synchronous calls acceptable for:
- Real-time queries where eventual consistency is not acceptable
- BFF aggregating data for frontend
- Inter-service health checks

### ❌ God Service / Monolith in Disguise

**Bad**:
```
BattleScopeService:
  - Ingests killmails
  - Enriches killmails
  - Clusters battles
  - Provides search
  - Sends notifications
  - Tracks analytics
```

**Good**:
```
IngestService: Ingests killmails
EnrichmentService: Enriches killmails
ClustererService: Clusters battles
SearchService: Provides search
NotificationService: Sends notifications
AnalyticsService: Tracks analytics
```

---

## Validation Questions

Before implementing any feature, ask:

### 1. Domain Clarity
- [ ] Can I describe this feature using only concepts from a single domain?
- [ ] Does this feature require knowledge of multiple domain internals?
- [ ] Am I importing types/models from another service's domain?

### 2. Data Ownership
- [ ] Does this service have exclusive write access to this data?
- [ ] Am I querying another service's database directly?
- [ ] Am I caching data that belongs to another domain?

### 3. API Surface
- [ ] Do all my endpoints relate to my domain's core entity?
- [ ] Am I exposing operations that belong to another domain?
- [ ] Would a domain expert understand my API without knowing other services?

### 4. Event Boundaries
- [ ] Am I publishing events that other domains need?
- [ ] Am I consuming events only to build my domain's view of the world?
- [ ] Are my event schemas describing my domain entities, not others'?

---

## Service Refactoring Checklist

If a service is violating boundaries, refactor using these steps:

1. **Identify the violated boundary**
   - Which domain is being crossed?
   - What data or operation doesn't belong?

2. **Extract the responsibility**
   - Create a new service for the crossed domain
   - OR move the operation to the correct existing service

3. **Replace direct calls with events**
   - Publish domain events instead of exposing internal data
   - Consume events instead of querying other databases

4. **Migrate data ownership**
   - Move data to the correct service's database
   - Remove foreign keys across service boundaries

5. **Update APIs**
   - Remove endpoints that don't belong to the domain
   - Add new endpoints in the correct service

---

## Code Isolation Between Services

### No Shared Code, Types, or Libraries

**Rule**: Services MUST NOT share business logic, domain models, or types through shared libraries.

**Rationale**:
- Shared code creates tight coupling between services
- Changes to shared code require coordinating deployments across services
- Services cannot evolve independently
- Versioning shared libraries becomes a bottleneck
- Testing becomes complex (need to test combinations of library versions)

**What IS Allowed to Share**:
- ✅ **Infrastructure patterns**: Logging setup, OTEL configuration, migration patterns
- ✅ **Standard tools**: ESLint configs, TypeScript configs, testing utilities
- ✅ **Documentation**: Shared documentation, ADRs, architecture diagrams

**What is NOT Allowed to Share**:
- ❌ **Domain models**: Battle types, Killmail types, etc.
- ❌ **Business logic**: Clustering algorithms, validation rules, calculations
- ❌ **Database schemas**: Kysely types, repository implementations
- ❌ **API clients**: HTTP clients for other services
- ❌ **Utilities with business logic**: Date formatting with domain rules, etc.

### Anti-Pattern: Shared Packages

❌ **Bad - Shared Package**:
```
packages/
├── common/                    # ANTI-PATTERN
│   ├── types/
│   │   ├── battle.ts         # Shared between services
│   │   ├── killmail.ts       # Shared between services
│   │   └── participant.ts    # Shared between services
│   ├── utils/
│   │   ├── battle-calculator.ts  # Business logic shared
│   │   └── killmail-validator.ts # Business logic shared
│   └── repositories/
│       └── base-repository.ts    # Shared DB logic
```

**Why this is bad**:
- Clusterer and Search both import `Battle` type from common
- Change to `Battle` type requires updating both services simultaneously
- Cannot deploy Clusterer independently
- Tight coupling masked as "code reuse"

✅ **Good - Duplicated Code**:
```
backend/
├── clusterer/
│   ├── src/
│   │   ├── models/
│   │   │   └── battle.ts     # Clusterer's own Battle model
│   │   └── utils/
│   │       └── battle-calculator.ts  # Clusterer's logic
│
└── search/
    ├── src/
    │   ├── models/
    │   │   └── battle.ts     # Search's own Battle model (different!)
    │   └── utils/
    │       └── battle-formatter.ts   # Search's logic
```

**Why this is good**:
- Each service has its own Battle representation
- Clusterer's Battle has fields needed for clustering
- Search's Battle has fields needed for search indexing
- Services can evolve independently
- No coordination needed for deployments

### What About Consistency?

**Q**: "Won't we have inconsistent logging across services?"
**A**: Use **patterns**, not shared code.

✅ **Correct Approach - Documented Pattern**:
```typescript
// Each service implements its own logger following a documented pattern

// backend/clusterer/src/utils/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Service-specific fields
  base: {
    service: 'clusterer',
    version: process.env.VERSION,
  },
});

// backend/search/src/utils/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Service-specific fields
  base: {
    service: 'search',
    version: process.env.VERSION,
  },
});
```

**Pattern is documented in**: `/docs/patterns/logging.md`

**Why this works**:
- Each service has its own logger implementation
- Pattern ensures consistency (same structure, same library)
- Services can customize as needed (different log levels, different fields)
- No shared code dependency

### Acceptable Shared Patterns

**Logging Pattern**:
- Document: "Use pino with ISO timestamps and service name in base fields"
- Each service implements its own logger
- Pattern documented in `/docs/patterns/logging.md`

**Database Migration Pattern**:
- Document: "Use Kysely Migrator with timestamp-based filenames"
- Each service has its own migrations
- Pattern documented in `/docs/patterns/database-migrations.md`

**OpenTelemetry Pattern**:
- Document: "Initialize OTEL with service name, version, and Jaeger exporter"
- Each service implements its own OTEL setup
- Pattern documented in `/docs/patterns/observability.md`

**Testing Pattern**:
- Document: "Use Vitest with 80% coverage threshold"
- Each service has its own test setup
- Pattern documented in `/docs/patterns/testing.md`

### Exception: Contract Validation

**Q**: "What about validating event contracts?"
**A**: Use **schema files**, not shared TypeScript types.

✅ **Correct**:
```typescript
// backend/clusterer/contracts/events/battle.created.schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "battleId": { "type": "string" },
    "systemId": { "type": "string" }
  }
}

// backend/clusterer/src/events/publisher.ts
import Ajv from 'ajv';
import battleCreatedSchema from '../../contracts/events/battle.created.schema.json';

const ajv = new Ajv();
const validate = ajv.compile(battleCreatedSchema);

// Validate at runtime
if (!validate(event)) {
  throw new Error('Invalid event schema');
}

// backend/search/src/events/consumer.ts
import Ajv from 'ajv';
// Search imports the schema from Clusterer's published contract
import battleCreatedSchema from '../../../clusterer/contracts/events/battle.created.schema.json';

const ajv = new Ajv();
const validate = ajv.compile(battleCreatedSchema);

// Validate at runtime
if (!validate(event)) {
  throw new Error('Invalid event schema');
}
```

**Why this works**:
- Schema is the contract (not TypeScript types)
- Each service validates independently
- Schema can be versioned independently
- No code sharing, only contract sharing

---

## Summary: The Golden Rules

1. **One Service, One Domain** - Never cross domain boundaries
2. **Data Ownership** - Each service exclusively owns its data
3. **No Shared Code** - Services do NOT share code, types, or libraries (except standards like logging patterns, migration patterns, OTEL setup)
4. **Events Over RPC** - Communicate via events, not synchronous calls (when possible)
5. **API Reflects Domain** - API endpoints should only expose domain operations
6. **No Database Sharing** - Each service has its own database
7. **Domain Events** - Publish events when your domain changes
8. **Consume Selectively** - Only consume events relevant to your domain
9. **No God Services** - If a service does "everything", it's wrong

---

## How Claude Should Use This Skill

When I (Claude) am:

- **Creating a new service**: Verify it has a single, clear domain
- **Adding a feature**: Confirm it belongs to the service's domain
- **Writing API endpoints**: Ensure they only expose domain operations
- **Accessing data**: Check that we're not crossing domain boundaries
- **Designing databases**: Verify each service owns its data exclusively
- **Proposing architecture changes**: Validate against domain boundaries
- **Reviewing code**: Flag any cross-domain violations

**If unclear about domain ownership, I should ASK before implementing.**

---

## References

- Domain-Driven Design (Eric Evans)
- Microservices Patterns (Chris Richardson)
- Building Microservices (Sam Newman)
- The Bounded Context pattern (Martin Fowler)
