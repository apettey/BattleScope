# BattleScope V3 Implementation Proposal

**Version**: 1.0
**Date**: 2025-11-25
**Status**: Draft for Review

---

## Executive Summary

This proposal outlines the complete Architecture V3 implementation for BattleScope, transforming it from a monolithic system into a distributed, event-driven microservices architecture following strict domain boundaries and code isolation principles.

**Key Changes from V2**:
- ❌ Remove shared `@battlescope/*` packages (no shared code between services)
- ✅ Each service owns its API (no API gateway)
- ✅ Each service has isolated storage (6 separate databases)
- ✅ Event-driven communication via Kafka/Redpanda
- ✅ Contract-first design with OpenAPI + JSON Schema
- ✅ Full distributed systems patterns (idempotency, retries, circuit breakers)

---

## Document Structure

### Core Documents

1. **[INDEX.md](./INDEX.md)** (this document)
   - Executive summary and navigation

2. **[ARCHITECTURE.md](./ARCHITECTURE.md)**
   - Complete system architecture overview
   - Service catalog with responsibilities
   - Technology stack and rationale

3. **[DOMAIN-BOUNDARIES.md](./DOMAIN-BOUNDARIES.md)**
   - Domain-driven design applied to BattleScope
   - Service boundary definitions
   - Anti-patterns and validation rules

4. **[DATA-ARCHITECTURE.md](./DATA-ARCHITECTURE.md)**
   - Database-per-service design
   - Data synchronization patterns
   - Event schemas and versioning

5. **[IMPLEMENTATION-ROADMAP.md](./IMPLEMENTATION-ROADMAP.md)**
   - Phase-by-phase implementation plan
   - Migration strategy from V1/V2
   - Risk assessment and mitigation

### Diagram Files

All diagrams are in `diagrams/` directory as `.mmd` files:

- **[01-system-overview.mmd](./diagrams/01-system-overview.mmd)**
  - Complete distributed system architecture
  - All 6 services with data stores and communication

- **[02-event-flow.mmd](./diagrams/02-event-flow.mmd)**
  - Event-driven data flow from ingestion to frontend
  - Kafka topics and consumer groups

- **[03-service-apis.mmd](./diagrams/03-service-apis.mmd)**
  - API ownership by service
  - HTTP and event-based APIs

- **[04-database-isolation.mmd](./diagrams/04-database-isolation.mmd)**
  - Six isolated PostgreSQL databases
  - No cross-database queries

- **[05-deployment-architecture.mmd](./diagrams/05-deployment-architecture.mmd)**
  - Kubernetes deployment structure
  - Infrastructure components

- **[06-sequence-killmail-ingestion.mmd](./diagrams/06-sequence-killmail-ingestion.mmd)**
  - Detailed sequence diagram for killmail flow

- **[07-sequence-battle-query.mmd](./diagrams/07-sequence-battle-query.mmd)**
  - Frontend querying battles from Battle Service

- **[08-historical-ingestion-flow.mmd](./diagrams/08-historical-ingestion-flow.mmd)**
  - Historical killmail backfill process via History API

### Service Specifications

Each service has a detailed specification in `services/`:

- **[ingestion-service.md](./services/ingestion-service.md)** - Includes historical ingestion feature
- **[enrichment-service.md](./services/enrichment-service.md)**
- **[battle-service.md](./services/battle-service.md)**
- **[search-service.md](./services/search-service.md)**
- **[notification-service.md](./services/notification-service.md)**
- **[frontend-bff.md](./services/frontend-bff.md)**

### Contract Specifications

API and event contracts in `contracts/`:

- **[http-apis.md](./contracts/http-apis.md)** - OpenAPI specs for all services
- **[kafka-events.md](./contracts/kafka-events.md)** - JSON schemas for all events
- **[contract-testing.md](./contracts/contract-testing.md)** - Contract test strategy

---

## Key Principles (from V3 Skills)

### 1. Domain Boundaries
- Each service owns ONE domain
- No cross-domain data access
- Events for inter-service communication

### 2. Storage Isolation
- 6 separate PostgreSQL databases
- No shared tables or foreign keys across services
- Denormalization via event consumption

### 3. Code Isolation
- **NO shared `@battlescope/common` package**
- Each service has its own models, types, utilities
- Patterns documented, not shared as libraries

### 4. Service-Owned APIs
- Each service exposes its own HTTP API
- No API gateway (or thin routing layer only)
- Frontend calls services directly (or via BFF)

### 5. Distributed Systems Patterns
- Idempotency for all operations
- At-least-once delivery with deduplication
- Circuit breakers and retries
- Health checks and graceful degradation

### 6. Testing & Quality
- 80% minimum test coverage
- Contract tests for all APIs and events
- TypeScript strict mode everywhere
- Max complexity: 10

---

## Services Overview

| Service | Domain | Database | API Exposed | Events Published |
|---------|--------|----------|-------------|------------------|
| **Ingestion** | Raw killmail acquisition (real-time + historical) | `ingestion_db` | `/api/ingestion/*` | `killmail.ingested` |
| **Enrichment** | Killmail data augmentation | `enrichment_db` | `/api/enrichment/*` | `killmail.enriched` |
| **Battle** | Combat encounter aggregation | `battles_db` | `/api/battles/*` | `battle.created`, `battle.updated` |
| **Search** | Full-text search & filtering | `search_db` (Typesense) | `/api/search/*` | None |
| **Notification** | Real-time user notifications | `notifications_db` | `/api/notifications/*` | None |
| **Frontend BFF** | Frontend aggregation layer | None (cache only) | `/api/bff/*` | None |

**Note**: Ingestion Service supports both real-time streaming (RedisQ) and historical backfill (History API) through the same event pipeline.

---

## Technology Stack

### Backend Services
- **Runtime**: Node.js 20 LTS
- **Language**: TypeScript 5.4+ (strict mode)
- **HTTP Framework**: Fastify 4.x
- **Validation**: Zod 3.x
- **Database Client**: Kysely 0.27 (type-safe SQL)
- **Event Streaming**: KafkaJS with Redpanda
- **Testing**: Vitest with 80% coverage

### Data Layer
- **Databases**: PostgreSQL 15 (6 separate instances)
- **Search**: Typesense 0.25
- **Cache**: Redis 7
- **Event Bus**: Kafka/Redpanda

### Infrastructure
- **Orchestration**: Kubernetes 1.27+
- **Containerization**: Docker with multi-arch builds (amd64 + arm64)
- **Observability**: Prometheus + Grafana + Loki + Jaeger
- **CI/CD**: GitHub Actions with Makefile integration

---

## Implementation Phases

### Phase 1: Infrastructure Setup (Week 1-2)
- Set up 6 PostgreSQL instances
- Configure Kafka/Redpanda cluster
- Deploy Typesense for search
- Set up observability stack

### Phase 2: Service Contracts (Week 2-3)
- Define OpenAPI specs for all HTTP APIs
- Define JSON schemas for all Kafka events
- Set up contract testing framework
- Version control for schemas

### Phase 3: Core Services (Week 3-6)
- Implement Ingestion Service
- Implement Enrichment Service
- Implement Battle Service
- Test event flow end-to-end

### Phase 4: Query Services (Week 6-8)
- Implement Search Service
- Implement Notification Service
- Implement Frontend BFF

### Phase 5: Frontend Migration (Week 8-10)
- Update frontend to call service APIs
- Remove dependency on shared types
- Implement error handling and retries

### Phase 6: Testing & Deployment (Week 10-12)
- End-to-end testing
- Load testing
- Migration from V1/V2
- Production deployment

---

## Success Criteria

### Technical
- [ ] All services have 80%+ test coverage
- [ ] All services pass contract tests
- [ ] No cross-database queries exist
- [ ] No shared code packages between services
- [ ] All APIs have OpenAPI specs
- [ ] All events have JSON schemas
- [ ] `make dev` starts entire system locally
- [ ] `make ci` runs all checks and tests

### Operational
- [ ] Services can be deployed independently
- [ ] Each service has health checks
- [ ] Distributed tracing works end-to-end
- [ ] Logs include file/package/caller context
- [ ] Metrics collected for all services
- [ ] Circuit breakers and retries implemented

### Business
- [ ] Killmail ingestion rate maintained (10k+/hour)
- [ ] Battle clustering accuracy maintained
- [ ] API response times < 500ms p95
- [ ] No data loss during migration
- [ ] Feature parity with V2

---

## Risks & Mitigation

### Risk 1: Increased Operational Complexity
**Mitigation**:
- Comprehensive observability from day 1
- Automated health checks and alerts
- Makefile simplifies local development
- Detailed runbooks for each service

### Risk 2: Event Ordering and Consistency
**Mitigation**:
- Kafka partition keys for ordering
- Idempotent event handlers
- Event version control and migration strategy
- Dead letter queues for failed events

### Risk 3: Data Migration from V2
**Mitigation**:
- Blue-green deployment strategy
- Dual-write period for validation
- Rollback plan documented
- Staged migration with validation gates

### Risk 4: Learning Curve for Team
**Mitigation**:
- Comprehensive documentation
- Claude Code skills for guidance
- Pair programming for first services
- Clear patterns to follow

---

## Next Steps

1. **Review this proposal** with team
2. **Validate assumptions** about domain boundaries
3. **Approve Phase 1** infrastructure setup
4. **Begin implementation** following roadmap
5. **Iterate** based on feedback and learnings

---

## References

- [Architecture V3 Skills Index](../../architecture-v3/INDEX.md)
- [Domain Service Boundaries](../../architecture-v3/domain-service-boundaries.md)
- [Code Isolation and Duplication](../../architecture-v3/code-isolation-and-duplication.md)
- [V2 Architecture (baseline)](../../architecture-v2/INDEX.md)
- [Product Specifications](../../product_specs.md)
- [Technical Specifications](../../technical_specs.md)
