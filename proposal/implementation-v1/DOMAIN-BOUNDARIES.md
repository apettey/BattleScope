# Domain Boundaries - BattleScope V3

**Version**: 1.0
**Date**: 2025-11-25

---

## Overview

This document defines the domain boundaries for BattleScope V3, applying Domain-Driven Design principles to ensure clean service separation and prevent coupling.

---

## Domain Map

### Domain 1: **Ingestion**

**Bounded Context**: Raw killmail event acquisition from external sources

**Core Concept**: Killmail events as they arrive from zKillboard

**Ubiquitous Language**:
- **Killmail Event**: Raw killmail metadata from RedisQ
- **Ruleset**: Configuration defining which killmails to accept
- **Ingestion Status**: Health and statistics tracking

**Responsibilities**:
- Poll zKillboard RedisQ endpoint
- Apply filtering rules (min pilots, tracked alliances/corps, systems, security types)
- Store accepted killmail events
- Publish ingestion events to Kafka
- Track ingestion statistics and health

**NOT Responsible For**:
- ❌ Enriching killmails with full data
- ❌ Clustering killmails into battles
- ❌ Searching killmails
- ❌ Displaying killmails to users

**Service**: Ingestion Service
**Database**: `ingestion_db`
**API**: `/api/ingestion/*`

---

### Domain 2: **Enrichment**

**Bounded Context**: Killmail data augmentation and caching

**Core Concept**: Transform minimal killmail references into fully enriched records

**Ubiquitous Language**:
- **Enriched Killmail**: Full killmail payload with ESI-resolved names
- **ESI Cache**: Cached responses from EVE ESI API
- **Enrichment Job**: Async processing task

**Responsibilities**:
- Consume `killmail.ingested` events
- Fetch full killmail payload from zKillboard API
- Resolve entity names from ESI (ships, systems, characters, corps, alliances)
- Cache ESI responses to reduce API calls
- Store enriched killmails
- Publish enrichment events to Kafka

**NOT Responsible For**:
- ❌ Deciding which killmails to ingest (Ingestion domain)
- ❌ Clustering killmails into battles (Battle domain)
- ❌ Indexing for search (Search domain)

**Service**: Enrichment Service
**Database**: `enrichment_db` + Redis cache
**API**: `/api/enrichment/*`

---

### Domain 3: **Battle**

**Bounded Context**: Combat encounter aggregation and lifecycle management

**Core Concept**: Battles as aggregations of related killmails

**Ubiquitous Language**:
- **Battle**: A combat encounter with start/end times, participants, and statistics
- **Battle Participant**: Character involved in a battle with side assignment
- **Battle Killmail**: Killmail that is part of a battle
- **Clustering**: Algorithm that groups related killmails
- **Battle Statistics**: Computed metrics (ISK destroyed, duration, pilot count)

**Responsibilities**:
- Consume `killmail.enriched` events
- Run clustering algorithm (temporal + spatial proximity, participant overlap)
- Create and update battle aggregates
- Assign participants to sides (attackers vs defenders)
- Calculate battle statistics
- Maintain battle lifecycle (open, closed, historical)
- Expose battle query API
- Publish battle events to Kafka

**NOT Responsible For**:
- ❌ Fetching raw killmails (Ingestion domain)
- ❌ Enriching killmails (Enrichment domain)
- ❌ Search indexing (Search domain)
- ❌ User notifications (Notification domain)

**Service**: Battle Service
**Database**: `battles_db`
**API**: `/api/battles/*`

---

### Domain 4: **Search**

**Bounded Context**: Full-text search and faceted filtering

**Core Concept**: Fast, typo-tolerant search across battles and entities

**Ubiquitous Language**:
- **Search Index**: Optimized data structure for fast lookups
- **Facet**: Filter dimension (alliance, corp, system, ship type)
- **Search Query**: User search request with filters
- **Search Result**: Ranked list of matches

**Responsibilities**:
- Consume events from multiple domains (battles, killmails)
- Transform domain events into search-optimized format
- Index data in Typesense
- Maintain facets for filtering
- Expose search API with typo tolerance
- Handle ranking and relevance scoring

**NOT Responsible For**:
- ❌ Creating battles (Battle domain)
- ❌ Storing authoritative data (only search indices)
- ❌ Real-time notifications (Notification domain)

**Service**: Search Service
**Database**: Typesense (search engine)
**API**: `/api/search/*`

---

### Domain 5: **Notification**

**Bounded Context**: Real-time user notifications and subscriptions

**Core Concept**: Push notifications to users based on their interests

**Ubiquitous Language**:
- **Subscription**: User's interest in specific entities/systems
- **Notification**: Message pushed to user about a relevant battle
- **WebSocket Connection**: Persistent connection for real-time push
- **Notification Preference**: User settings for notification frequency/types

**Responsibilities**:
- Maintain WebSocket connections with users
- Store user subscriptions (alliances, systems, etc.)
- Consume battle events from Kafka
- Filter events based on user subscriptions
- Push relevant notifications to connected users
- Handle reconnection and missed message recovery
- Expose subscription management API

**NOT Responsible For**:
- ❌ Creating battles (Battle domain)
- ❌ Storing battle data (Battle domain)
- ❌ User authentication (handled by API layer)

**Service**: Notification Service
**Database**: Redis (connections + subscriptions)
**API**: `/api/notifications/*` + WebSocket

---

### Domain 6: **Frontend Aggregation** (BFF)

**Bounded Context**: Frontend-specific data aggregation

**Core Concept**: Aggregate data from multiple services for optimized frontend consumption

**Ubiquitous Language**:
- **Aggregated View**: Combined data from multiple services
- **BFF Endpoint**: Frontend-optimized API endpoint
- **Cached Response**: Temporarily stored aggregated data

**Responsibilities**:
- Receive frontend requests
- Call multiple backend services in parallel
- Aggregate responses into frontend-friendly format
- Cache aggregated results
- Handle partial failures gracefully
- Transform backend data structures for UI needs

**NOT Responsible For**:
- ❌ Business logic (delegates to domain services)
- ❌ Authoritative data storage (only caches)
- ❌ Event publishing (read-only from frontend perspective)

**Service**: Frontend BFF
**Database**: Redis (cache only)
**API**: `/api/bff/*`

---

## Domain Interaction Rules

### Rule 1: No Direct Database Access Across Domains

❌ **Wrong**:
```typescript
// Battle Service accessing Enrichment database
const killmail = await enrichmentDb
  .selectFrom('enriched_killmails')
  .where('id', '=', killmailId)
  .executeTakeFirst();
```

✅ **Correct**:
```typescript
// Battle Service consuming event from Enrichment
consumer.on('killmail.enriched', async (event) => {
  // Event contains all needed data
  await storeBattleKillmail(event.data);
});
```

### Rule 2: Events for Inter-Domain Communication

Services communicate via Kafka events, not HTTP calls:

```
Ingestion --[event]--> Enrichment --[event]--> Battle --[event]--> Search
```

**Exception**: BFF can call services via HTTP for read queries (not writes).

### Rule 3: Each Domain Owns Its Data Model

Services have different representations of the same concept:

```typescript
// Battle Service's Battle model
interface Battle {
  id: string;
  systemId: bigint;
  participants: Map<string, ParticipantInfo>; // Graph structure for clustering
  clusteringMetadata: ClusteringData;
}

// Search Service's Battle model
interface Battle {
  id: string;
  systemId: string;
  systemName: string;
  participantNames: string[]; // Flattened for search
  searchText: string; // Full-text search field
}
```

**Both are correct** - each service has its own view optimized for its domain.

### Rule 4: Service APIs Reflect Domain Operations

Service APIs should only expose operations relevant to their domain:

✅ **Battle Service API** (correct domain):
```
GET  /api/battles
GET  /api/battles/:id
GET  /api/battles/stats
```

❌ **Battle Service API** (wrong domains):
```
GET  /api/search/battles        # Wrong! This is Search domain
GET  /api/enrichment/killmail   # Wrong! This is Enrichment domain
POST /api/notifications/subscribe  # Wrong! This is Notification domain
```

---

## Validation Checklist

Before implementing any feature, verify:

### Domain Ownership
- [ ] Feature belongs to exactly ONE domain
- [ ] No cross-domain data access required
- [ ] Domain concept has clear ownership

### Data Ownership
- [ ] Service has exclusive write access to this data
- [ ] No other service queries this database
- [ ] Data synchronization via events only

### API Design
- [ ] All endpoints relate to service's domain
- [ ] No endpoints exposing other domains' operations
- [ ] API follows domain's ubiquitous language

### Event Design
- [ ] Events published represent domain state changes
- [ ] Events consumed are relevant to this domain
- [ ] Event schemas use domain terminology

---

## Common Anti-Patterns

### Anti-Pattern 1: God Service

❌ **Wrong**:
```
BattleScopeService:
  - Ingests killmails
  - Enriches killmails
  - Clusters battles
  - Provides search
  - Sends notifications
```

This violates single responsibility and creates a distributed monolith.

### Anti-Pattern 2: Shared Database

❌ **Wrong**:
```
Battle Service → shared_db ← Search Service
```

This creates tight coupling and prevents independent evolution.

### Anti-Pattern 3: Synchronous Service-to-Service Calls for Data

❌ **Wrong**:
```typescript
// Battle Service calling Enrichment Service
const enriched = await http.get('http://enrichment/api/killmails/' + id);
```

This creates runtime coupling and cascading failures.

### Anti-Pattern 4: Domain Leakage in APIs

❌ **Wrong**:
```typescript
// Battle Service exposing Search functionality
app.get('/api/battles/search', searchHandler); // Should be in Search Service
```

This blurs domain boundaries and creates confusion.

---

## Decision Framework

When adding a feature, ask:

1. **What domain concept does this feature relate to?**
   - Killmail acquisition? → Ingestion
   - Killmail augmentation? → Enrichment
   - Battle aggregation? → Battle
   - Search/filtering? → Search
   - User notifications? → Notification

2. **Does this feature require data from multiple domains?**
   - YES → Use BFF to aggregate, OR client-side aggregation
   - NO → Add to appropriate domain service

3. **Does this feature create a new domain concept?**
   - YES → Consider new service
   - NO → Extend existing service within its domain

4. **Can I describe this feature using only terms from one domain?**
   - YES → Belongs to that domain
   - NO → Needs aggregation or domain refinement

---

## Summary

**6 Domains, 6 Services, 6 Databases**

Each service:
- Owns ONE domain
- Has ONE database
- Exposes ONE API
- Publishes domain events
- Consumes relevant events
- Operates independently

**No cross-domain data access. Events for inter-service communication.**

---

## References

- [Architecture V3 Skills: Domain Service Boundaries](../../architecture-v3/domain-service-boundaries.md)
- [Architecture V3 Skills: Code Isolation and Duplication](../../architecture-v3/code-isolation-and-duplication.md)
- Domain-Driven Design (Eric Evans)
- Building Microservices (Sam Newman)
