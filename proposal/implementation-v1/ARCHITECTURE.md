# BattleScope V3 Architecture

**Version**: 1.0
**Date**: 2025-11-25
**Status**: Draft for Review

---

## Table of Contents

1. [Overview](#overview)
2. [Architectural Principles](#architectural-principles)
3. [Service Catalog](#service-catalog)
4. [Technology Stack](#technology-stack)
5. [Data Architecture](#data-architecture)
6. [Communication Patterns](#communication-patterns)
7. [Deployment Architecture](#deployment-architecture)
8. [Observability](#observability)

---

## Overview

BattleScope V3 is a complete architectural redesign from a monolithic system with shared packages into a truly distributed microservices architecture. Each service owns its domain, exposes its own API, and has isolated storage.

### Key Changes from V2

| Aspect | V2 | V3 |
|--------|----|----|
| **Shared Code** | `@battlescope/common`, `@battlescope/database`, etc. | ❌ No shared packages |
| **API Ownership** | API Gateway service | ✅ Each service exposes own API |
| **Database** | Shared PostgreSQL | ✅ 6 isolated databases |
| **Communication** | Mixed (HTTP + Events) | ✅ Event-driven via Kafka |
| **Deployment** | Coordinated | ✅ Independent per service |
| **Testing** | Variable coverage | ✅ 80% minimum + contract tests |

### System Overview

See [diagrams/01-system-overview.mmd](./diagrams/01-system-overview.mmd) for complete architecture.

**6 Core Services**:
1. **Ingestion Service** - Raw killmail acquisition from zKillboard
2. **Enrichment Service** - Killmail data augmentation with ESI
3. **Battle Service** - Combat encounter aggregation and clustering
4. **Search Service** - Full-text search and filtering
5. **Notification Service** - Real-time WebSocket notifications
6. **Frontend BFF** - Frontend aggregation layer

---

## Architectural Principles

### 1. Domain-Driven Design

Each service represents a **Bounded Context** from Domain-Driven Design:

```
Ingestion Domain: Raw killmail events
Enrichment Domain: Killmail augmentation
Battle Domain: Combat encounters
Search Domain: Full-text indexing
Notification Domain: Real-time pushes
```

**Golden Rule**: No service crosses domain boundaries or accesses another service's data directly.

### 2. Code Isolation

**NO shared packages between services**. Each service has its own:
- Models and types
- Business logic
- Database access code
- Utilities

**What can be shared**: Documented patterns (logging, OTEL, migrations) that each service implements independently.

See [code-isolation-and-duplication skill](../../architecture-v3/code-isolation-and-duplication.md).

### 3. Storage Isolation

Each service has its own database instance:

```
Ingestion Service → ingestion_db (PostgreSQL)
Enrichment Service → enrichment_db (PostgreSQL)
Battle Service → battles_db (PostgreSQL)
Search Service → search indices (Typesense)
Notification Service → notifications_db (Redis)
Frontend BFF → cache (Redis)
```

**No cross-database queries**. Data synchronization via Kafka events only.

See [diagrams/04-database-isolation.mmd](./diagrams/04-database-isolation.mmd).

### 4. Service-Owned APIs

Each service exposes its own HTTP API:

```
Ingestion:    /api/ingestion/*
Enrichment:   /api/enrichment/*
Battle:       /api/battles/*
Search:       /api/search/*
Notification: /api/notifications/* + WebSocket
Frontend BFF: /api/bff/*
```

Frontend can call services directly or via BFF for aggregation.

See [diagrams/03-service-apis.mmd](./diagrams/03-service-apis.mmd).

### 5. Event-Driven Communication

Services communicate via Kafka events, not synchronous HTTP calls:

```
Ingestion → publishes → killmail.ingested
Enrichment → consumes → killmail.ingested
Enrichment → publishes → killmail.enriched
Battle → consumes → killmail.enriched
Battle → publishes → battle.created, battle.updated
Search → consumes → battle.created, battle.updated, killmail.enriched
Notification → consumes → battle.created (filtered by subscriptions)
```

See [diagrams/02-event-flow.mmd](./diagrams/02-event-flow.mmd).

### 6. Distributed Systems Patterns

Every service implements:
- **Idempotency** - All operations can be retried safely
- **At-least-once delivery** - Events may be delivered multiple times
- **Circuit breakers** - Fail fast on downstream failures
- **Exponential backoff** - Retry with increasing delays
- **Health checks** - Kubernetes readiness/liveness probes
- **Graceful degradation** - Continue operating with reduced functionality

See [distributed-systems-design skill](../../architecture-v3/distributed-systems-design.md).

---

## Service Catalog

### 1. Ingestion Service

**Domain**: Raw killmail acquisition
**Responsibility**: Poll zKillboard RedisQ, apply filters, store raw events

| Aspect | Details |
|--------|---------|
| **Database** | `ingestion_db` (PostgreSQL) |
| **API** | `/api/ingestion/health`, `/api/ingestion/stats` |
| **Events Published** | `killmail.ingested` |
| **Events Consumed** | None |
| **Replicas** | 1-2 (only one polls, others standby) |

**Key Tables**:
- `killmail_events` - Raw killmail metadata
- `rulesets` - Filtering configuration
- `ingestion_status` - Health tracking

**Key Operations**:
1. Poll zKillboard RedisQ every 5 seconds
2. Apply ruleset filters (min pilots, alliances, systems)
3. Insert accepted killmails (idempotent on killmail_id)
4. Publish `killmail.ingested` event
5. Track ingestion statistics

**Technologies**: Node.js, Fastify, Kysely, KafkaJS

See [services/ingestion-service.md](./services/ingestion-service.md).

---

### 2. Enrichment Service

**Domain**: Killmail data augmentation
**Responsibility**: Fetch full killmail payload, resolve ESI names, cache

| Aspect | Details |
|--------|---------|
| **Database** | `enrichment_db` (PostgreSQL) + Redis cache |
| **API** | `/api/enrichment/killmails/:id` |
| **Events Published** | `killmail.enriched` |
| **Events Consumed** | `killmail.ingested` |
| **Replicas** | 2-5 (consumer group for parallelism) |

**Key Tables**:
- `enriched_killmails` - Full killmail data with ESI names
- `esi_cache` - Cached ESI responses (ship types, systems, etc.)
- `enrichment_queue` - Processing queue

**Key Operations**:
1. Consume `killmail.ingested` event from Kafka
2. Check if already enriched (idempotency)
3. Fetch full killmail from zKillboard API
4. Resolve entity names from ESI (with caching)
5. Store enriched killmail
6. Publish `killmail.enriched` event

**Technologies**: Node.js, Fastify, Kysely, KafkaJS, Redis

See [services/enrichment-service.md](./services/enrichment-service.md).

---

### 3. Battle Service

**Domain**: Combat encounter aggregation
**Responsibility**: Cluster killmails into battles, maintain battle lifecycle

| Aspect | Details |
|--------|---------|
| **Database** | `battles_db` (PostgreSQL) |
| **API** | `/api/battles/*` (full CRUD) |
| **Events Published** | `battle.created`, `battle.updated` |
| **Events Consumed** | `killmail.enriched` |
| **Replicas** | 2-3 (active-active for API, single consumer for clustering) |

**Key Tables**:
- `battles` - Battle aggregates
- `battle_killmails` - Killmails in each battle
- `battle_participants` - Participants with sides
- `battle_statistics` - Computed stats (ISK, duration, etc.)

**Key Operations**:
1. Consume `killmail.enriched` events
2. Run clustering algorithm (sliding window, 30min, participant overlap)
3. Create or update battles
4. Calculate statistics
5. Publish `battle.created` or `battle.updated` events
6. Expose HTTP API for battle queries

**Clustering Algorithm**:
- **Window**: 30 minutes
- **Max Gap**: 15 minutes between consecutive kills
- **Correlation**: Shared attackers/victims
- **Min Size**: 2 kills minimum

**Technologies**: Node.js, Fastify, Kysely, KafkaJS

See [services/battle-service.md](./services/battle-service.md).

---

### 4. Search Service

**Domain**: Full-text search and filtering
**Responsibility**: Index battles and entities for fast search

| Aspect | Details |
|--------|---------|
| **Database** | Typesense (search engine) |
| **API** | `/api/search/*` |
| **Events Published** | None |
| **Events Consumed** | `battle.created`, `battle.updated`, `killmail.enriched` |
| **Replicas** | 2-3 (active-active) |

**Key Collections**:
- `battles` - Battle search index
- `entities` - Alliance/corp/character index
- `killmails` - Killmail search index

**Key Operations**:
1. Consume events from Kafka
2. Transform into search-optimized format
3. Index in Typesense with facets
4. Expose search API with filtering
5. Handle typo tolerance and fuzzy matching

**Technologies**: Node.js, Fastify, Typesense client, KafkaJS

See [services/search-service.md](./services/search-service.md).

---

### 5. Notification Service

**Domain**: Real-time user notifications
**Responsibility**: WebSocket connections, subscription management

| Aspect | Details |
|--------|---------|
| **Database** | Redis (connection tracking + subscriptions) |
| **API** | `/api/notifications/*` + WebSocket |
| **Events Published** | None |
| **Events Consumed** | `battle.created` (filtered by user subscriptions) |
| **Replicas** | 2-3 (sticky sessions for WebSocket) |

**Key Redis Keys**:
- `subscriptions:{userId}` - User subscriptions (alliances, systems, etc.)
- `connections:{userId}` - Active WebSocket connections
- `preferences:{userId}` - Notification preferences

**Key Operations**:
1. Maintain WebSocket connections with users
2. Store user subscriptions
3. Consume `battle.created` events
4. Filter events by subscriptions
5. Push notifications to connected users
6. Handle reconnection logic

**Technologies**: Node.js, Fastify, ws (WebSocket), Redis, KafkaJS

See [services/notification-service.md](./services/notification-service.md).

---

### 6. Frontend BFF (Backend-for-Frontend)

**Domain**: Frontend aggregation
**Responsibility**: Aggregate data from multiple services for frontend

| Aspect | Details |
|--------|---------|
| **Database** | Redis (cache only) |
| **API** | `/api/bff/*` |
| **Events Published** | None |
| **Events Consumed** | None |
| **Replicas** | 2-5 (active-active, scales with frontend load) |

**Key Endpoints**:
- `/api/bff/battles` - Aggregates from Battle + Search services
- `/api/bff/dashboard` - Aggregates statistics from multiple services
- `/api/bff/battle/:id` - Battle detail with enrichments

**Key Operations**:
1. Receive frontend requests
2. Call multiple backend services in parallel
3. Aggregate responses
4. Cache results (TTL 60-300s)
5. Return to frontend

**Technologies**: Node.js, Fastify, Redis, HTTP client (undici)

See [services/frontend-bff.md](./services/frontend-bff.md).

---

## Technology Stack

### Backend Services

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Runtime** | Node.js | 20 LTS | Stable, proven ecosystem |
| **Language** | TypeScript | 5.4+ | Type safety, developer productivity |
| **HTTP Framework** | Fastify | 4.x | High performance, plugin ecosystem |
| **Validation** | Zod | 3.x | Runtime type checking, schema generation |
| **Database Client** | Kysely | 0.27 | Type-safe SQL without ORM magic |
| **Event Streaming** | KafkaJS | 2.x | Native Kafka client for Node.js |
| **Testing** | Vitest | 1.x | Fast, Vite-compatible test runner |

### Data Layer

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| **Relational DB** | PostgreSQL | 15 | ACID, JSON support, mature |
| **Search Engine** | Typesense | 0.25 | Fast, simple, typo-tolerant |
| **Cache/Sessions** | Redis | 7 | In-memory speed, pub/sub |
| **Event Bus** | Redpanda | Latest | Kafka-compatible, easier ops |

### Infrastructure

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| **Orchestration** | Kubernetes | 1.27+ | Industry standard, portable |
| **Containerization** | Docker | 24+ | Multi-arch builds (amd64 + arm64) |
| **Observability** | Prometheus + Grafana + Loki + Jaeger | Latest | Complete stack for metrics, logs, traces |
| **CI/CD** | GitHub Actions | N/A | Integrated with repo, Makefile-driven |

---

## Data Architecture

See [DATA-ARCHITECTURE.md](./DATA-ARCHITECTURE.md) for complete details.

### Database-Per-Service Pattern

Each service has exclusive ownership of its database:

```
+-------------------+      +-------------------+      +-------------------+
| Ingestion Service |      | Enrichment Service|      | Battle Service    |
+-------------------+      +-------------------+      +-------------------+
         |                          |                          |
         v                          v                          v
+-------------------+      +-------------------+      +-------------------+
|  ingestion_db     |      |  enrichment_db    |      |  battles_db       |
| (PostgreSQL)      |      | (PostgreSQL)      |      | (PostgreSQL)      |
+-------------------+      +-------------------+      +-------------------+
```

**No foreign keys across services**. Data synchronization via events.

### Event Schemas

All events use JSON Schema for validation:

**Example: killmail.ingested**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["eventId", "eventType", "timestamp", "data"],
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "eventType": { "type": "string", "const": "killmail.ingested" },
    "timestamp": { "type": "string", "format": "date-time" },
    "data": {
      "type": "object",
      "required": ["killmailId", "killmailTime", "systemId"],
      "properties": {
        "killmailId": { "type": "string" },
        "killmailTime": { "type": "string", "format": "date-time" },
        "systemId": { "type": "string" },
        "victimAllianceId": { "type": "string" },
        "attackerAllianceIds": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

See [contracts/kafka-events.md](./contracts/kafka-events.md).

---

## Communication Patterns

### 1. Event-Driven (Primary)

**Used for**: Service-to-service asynchronous communication

```
Ingestion --[killmail.ingested]--> Enrichment
Enrichment --[killmail.enriched]--> Battle
Battle --[battle.created]--> Search
Battle --[battle.created]--> Notification
```

**Benefits**:
- Loose coupling
- Independent scaling
- Replay capability
- Audit trail

See [diagrams/02-event-flow.mmd](./diagrams/02-event-flow.mmd).

### 2. HTTP (Secondary)

**Used for**: Frontend queries, service health checks

```
Frontend --> BFF --> Battle Service
Frontend --> BFF --> Search Service
Kubernetes Probes --> Service /health endpoints
```

**All HTTP APIs use OpenAPI 3.x specs** for documentation and contract testing.

See [contracts/http-apis.md](./contracts/http-apis.md).

### 3. WebSocket (Specific Use Case)

**Used for**: Real-time notifications to frontend

```
Frontend <--WebSocket--> Notification Service
```

**Benefits**:
- Real-time push
- Lower latency than polling
- Bidirectional communication

---

## Deployment Architecture

See [diagrams/05-deployment-architecture.mmd](./diagrams/05-deployment-architecture.mmd).

### Kubernetes Resources

| Resource Type | Components | Purpose |
|---------------|-----------|---------|
| **Deployments** | Ingestion, Enrichment, Battle, Search, Notification, BFF, Frontend | Stateless applications |
| **StatefulSets** | PostgreSQL (3x), Typesense, Redis (2x), Kafka (3x) | Stateful data stores |
| **Services** | One per deployment/statefulset | Internal networking |
| **Ingress** | NGINX Ingress with TLS | External access |
| **ConfigMaps** | Per-service configuration | Non-sensitive config |
| **Secrets** | Database credentials, API keys | Sensitive data |

### Resource Allocation

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit |
|---------|-------------|-----------|----------------|--------------|
| Ingestion | 100m | 500m | 128Mi | 512Mi |
| Enrichment | 200m | 1000m | 256Mi | 1Gi |
| Battle | 200m | 1000m | 512Mi | 2Gi |
| Search | 200m | 1000m | 256Mi | 1Gi |
| Notification | 100m | 500m | 256Mi | 1Gi |
| BFF | 200m | 1000m | 256Mi | 1Gi |
| Frontend | 100m | 500m | 128Mi | 512Mi |

### Horizontal Pod Autoscaling

| Service | Min | Max | Target CPU |
|---------|-----|-----|------------|
| BFF | 2 | 10 | 60% |
| Battle | 2 | 5 | 70% |
| Search | 2 | 5 | 70% |
| Notification | 2 | 5 | 60% |

---

## Observability

### Metrics (Prometheus)

**Key Metrics**:
- `http_requests_total` - Request count by service, endpoint, status
- `http_request_duration_seconds` - Request latency histogram
- `kafka_messages_consumed_total` - Event consumption rate
- `kafka_messages_produced_total` - Event production rate
- `database_query_duration_seconds` - Query performance
- `cache_hit_ratio` - Cache effectiveness

**Grafana Dashboards**:
1. System Overview - All services health
2. Service Detail - Per-service metrics
3. Event Flow - Kafka topic lag and throughput
4. Database Performance - Query latency and connection pools

### Logs (Loki)

**Structured Logging with Pino**:
```json
{
  "level": 30,
  "time": 1699876543210,
  "file": "backend/battle/src/services/clustering.ts",
  "package": "battle",
  "caller": "runClusteringAlgorithm",
  "msg": "Clustering 1523 killmails",
  "systemId": "30000142"
}
```

**Log Collection**: Promtail DaemonSet → Loki → Grafana

### Traces (Jaeger)

**OpenTelemetry instrumentation** on:
- HTTP requests (auto-instrumented)
- Database queries (custom spans)
- Kafka message handling (custom spans)
- External API calls (auto-instrumented)

**Trace Propagation**: W3C Trace Context headers across service boundaries

---

## Next Steps

1. Review this architecture with team
2. Validate service boundaries and responsibilities
3. Approve technology stack choices
4. Begin Phase 1: Infrastructure setup

See [IMPLEMENTATION-ROADMAP.md](./IMPLEMENTATION-ROADMAP.md) for detailed plan.
