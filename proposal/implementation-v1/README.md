# BattleScope V3 Implementation Proposal

**Version**: 1.0
**Date**: 2025-11-25
**Status**: Draft for Review

---

## Quick Start

This is the complete Architecture V3 implementation proposal for BattleScope, transforming it from a monolithic system with shared packages into a truly distributed, event-driven microservices architecture.

### What's Inside

📄 **Core Documents**:
- **[INDEX.md](./INDEX.md)** - Executive summary and navigation (start here!)
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete system architecture
- **[DOMAIN-BOUNDARIES.md](./DOMAIN-BOUNDARIES.md)** - Domain-driven design applied

📊 **Diagrams** (`diagrams/`):
- 8 comprehensive Mermaid diagrams showing system overview, data flow, APIs, databases, deployment, sequences, and historical ingestion

📁 **Service Specs** (`services/`):
- Detailed specifications for each of the 6 services

📋 **Contracts** (`contracts/`):
- API and event contract specifications

---

## Executive Summary

### The Problem

BattleScope V2 has:
- ❌ Shared `@battlescope/*` packages creating tight coupling
- ❌ Monolithic API Gateway owning all endpoints
- ❌ Shared PostgreSQL database
- ❌ Mixed communication patterns (HTTP + Events)
- ❌ Coordinated deployments required

### The Solution

BattleScope V3 implements:
- ✅ **No shared code** - Each service owns its types, models, and logic
- ✅ **Service-owned APIs** - Each service exposes its own HTTP API
- ✅ **Database-per-service** - 6 isolated databases
- ✅ **Event-driven** - Kafka/Redpanda for all inter-service communication
- ✅ **Independent deployment** - Services deploy without coordination
- ✅ **Distributed systems patterns** - Idempotency, retries, circuit breakers

---

## Architecture at a Glance

### 6 Services, 6 Domains, 6 Databases

| Service | Domain | Database | Events Published |
|---------|--------|----------|------------------|
| **Ingestion** | Raw killmail acquisition (real-time + historical) | `ingestion_db` (PostgreSQL) | `killmail.ingested` |
| **Enrichment** | Killmail augmentation | `enrichment_db` (PostgreSQL) | `killmail.enriched` |
| **Battle** | Combat encounter aggregation | `battles_db` (PostgreSQL) | `battle.created`, `battle.updated` |
| **Search** | Full-text search | Typesense | None |
| **Notification** | Real-time notifications | Redis | None |
| **Frontend BFF** | Frontend aggregation | Redis (cache) | None |

### Data Flow

**Real-Time Path**:
```
zKillboard RedisQ → Ingestion → [Kafka] → Enrichment → [Kafka] → Battle → [Kafka] → Search
                                                                              ↓
                                                                      Notification (WebSocket)
```

**Historical Backfill Path**:
```
Admin triggers job → Ingestion fetches from History API → [Kafka] → (same downstream processing)
```

Frontend calls BFF → BFF aggregates from Battle + Search services

---

## Key Architectural Principles

### 1. Domain-Driven Design
Each service owns ONE domain with clear boundaries. No cross-domain data access.

### 2. Code Isolation
**NO shared `@battlescope/common` package**. Each service has its own models, types, and utilities. Patterns are documented, not shared as libraries.

### 3. Storage Isolation
6 separate databases. No cross-database queries. Data synchronization via Kafka events only.

### 4. Service-Owned APIs
Each service exposes its own HTTP API. No central API gateway (or thin routing layer only).

### 5. Event-Driven Communication
Kafka for all inter-service communication. Idempotent event handlers with at-least-once delivery.

### 6. Distributed Systems Patterns
Circuit breakers, exponential backoff, dead letter queues, health checks, and graceful degradation.

---

## New Feature: Historical Killmail Ingestion

V3 adds the ability to backfill historical killmail data using zKillboard's History API.

**Use Cases**:
- **Data Recovery**: Backfill killmails after service outages
- **New Alliance Tracking**: Populate historical data when adding new alliances
- **Historical Analysis**: Reconstruct past battles for trend analysis
- **Initial Population**: Bootstrap new installations with historical data

**How It Works**:
1. Admin creates historical ingestion job via UI (specify date range)
2. Ingestion Service fetches killmail IDs from History API (batch by date)
3. Same filtering rules applied as real-time ingestion
4. Publishes to same Kafka topic (`killmail.ingested`)
5. Downstream services process identically to real-time killmails
6. Battles reconstructed retroactively from historical data

**Performance**:
- Throughput: ~1,000-2,000 killmails/minute
- 30-day backfill: ~4-8 hours
- 90-day backfill: ~12-24 hours
- Rate limited to respect zKillboard API limits

**Admin UI**:
- Job creation with date range selector
- Real-time progress monitoring
- Job status tracking (pending, running, completed, failed)
- Per-date progress breakdown
- Retry failed jobs

See [services/ingestion-service.md](./services/ingestion-service.md) and [Historical Ingestion Feature Spec](../../docs/features/historical-ingestion/feature-spec.md) for complete details.

---

## Data Retention Policy

BattleScope maintains a **rolling 60-month (5-year) window** of all data.

**Key Points**:
- All killmails and battles older than 60 months are automatically deleted
- Deletion runs daily at 02:00 UTC
- Cascading deletes ensure referential integrity across all services
- Audit trail maintained for compliance

**Daily Verification**:
- Runs daily at 03:00 UTC (after retention cleanup)
- Verifies yesterday's killmails are complete
- Compares local database with zKillboard History API
- Automatically re-queues missing killmails
- Notifies Battle Service to re-cluster affected dates

**Gap Detection**:
- Runs on Ingestion Service startup
- Detects missing data in last 60 months
- Automatically creates historical ingestion jobs to fill gaps
- Ensures data completeness after outages or initial deployment

**Re-clustering**:
- Battle Service re-clusters when new killmails added to historical dates
- Triggered by: daily verification, gap detection, retention cleanup, manual admin request
- Updates existing battles, creates new ones, removes invalid ones
- Search Service automatically re-indexes updated battles

See [Data Retention Policy](../../docs/features/data-retention-policy.md) for complete details.

---

## Technology Stack

**Backend**: Node.js 20 LTS, TypeScript 5.4+ (strict), Fastify, Kysely, KafkaJS, Vitest

**Data**: PostgreSQL 15, Typesense, Redis, Kafka/Redpanda

**Infrastructure**: Kubernetes 1.27+, Docker (multi-arch: amd64 + arm64), Prometheus + Grafana + Loki + Jaeger

**CI/CD**: GitHub Actions with Makefile integration

---

## Diagrams

All diagrams are in `diagrams/` as Mermaid (`.mmd`) files:

1. **[01-system-overview.mmd](./diagrams/01-system-overview.mmd)** - Complete distributed system architecture (with historical ingestion)
2. **[02-event-flow.mmd](./diagrams/02-event-flow.mmd)** - Event-driven data flow through services
3. **[03-service-apis.mmd](./diagrams/03-service-apis.mmd)** - API ownership by service
4. **[04-database-isolation.mmd](./diagrams/04-database-isolation.mmd)** - Six isolated databases
5. **[05-deployment-architecture.mmd](./diagrams/05-deployment-architecture.mmd)** - Kubernetes deployment structure
6. **[06-sequence-killmail-ingestion.mmd](./diagrams/06-sequence-killmail-ingestion.mmd)** - Detailed sequence: zKillboard → Battle (real-time)
7. **[07-sequence-battle-query.mmd](./diagrams/07-sequence-battle-query.mmd)** - Frontend querying battles
8. **[08-historical-ingestion-flow.mmd](./diagrams/08-historical-ingestion-flow.mmd)** - Historical killmail backfill process

---

## Implementation Phases

### Phase 1: Infrastructure (Week 1-2)
- Set up 6 PostgreSQL instances
- Configure Kafka/Redpanda cluster
- Deploy Typesense
- Set up observability (Prometheus, Grafana, Loki, Jaeger)

### Phase 2: Contracts (Week 2-3)
- Define OpenAPI specs for all HTTP APIs
- Define JSON schemas for all Kafka events
- Set up contract testing framework

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
- ✅ All services have 80%+ test coverage
- ✅ No cross-database queries exist
- ✅ No shared code packages between services
- ✅ All APIs have OpenAPI specs
- ✅ All events have JSON schemas
- ✅ `make dev` starts entire system locally

### Operational
- ✅ Services can be deployed independently
- ✅ Distributed tracing works end-to-end
- ✅ Logs include file/package/caller context
- ✅ Circuit breakers and retries implemented

### Business
- ✅ Killmail ingestion rate maintained (10k+/hour)
- ✅ Battle clustering accuracy maintained
- ✅ API response times < 500ms p95
- ✅ Feature parity with V2

---

## What Makes This Different from V2?

| Aspect | V2 | V3 |
|--------|----|----|
| **Shared Code** | ✓ `@battlescope/common` with types/utils | ❌ NO shared packages |
| **API Design** | Central API Gateway | ✅ Each service owns its API |
| **Database** | Shared PostgreSQL | ✅ 6 isolated databases |
| **Communication** | Mixed (HTTP + Events) | ✅ Event-driven via Kafka |
| **Deployment** | Coordinated | ✅ Independent per service |
| **Code Isolation** | Tight coupling via shared libs | ✅ Duplicated code > coupling |
| **Domain Boundaries** | Blurred | ✅ Strictly enforced |
| **Testing** | Variable coverage | ✅ 80% minimum + contract tests |

---

## How to Use This Proposal

### For Architects
1. Read [INDEX.md](./INDEX.md) for overview
2. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details
3. Review [DOMAIN-BOUNDARIES.md](./DOMAIN-BOUNDARIES.md) for service boundaries
4. Review all diagrams in `diagrams/`

### For Developers
1. Start with [INDEX.md](./INDEX.md)
2. Read service specifications in `services/` for your service
3. Review contract specifications in `contracts/`
4. Reference [Architecture V3 Skills](../../docs/architecture-v3/INDEX.md) for patterns

### For Product/Business
1. Read the "Executive Summary" section above
2. Review "Success Criteria" for business outcomes
3. Check "Implementation Phases" for timeline

---

## Questions & Feedback

This proposal should be reviewed and discussed before implementation begins. Key questions to address:

1. **Domain Boundaries**: Are the 6 domains correctly scoped?
2. **Technology Stack**: Any concerns with chosen technologies?
3. **Timeline**: Is 12-week implementation realistic?
4. **Migration Strategy**: How to migrate from V2 without downtime?
5. **Team Structure**: How to organize teams around services?

---

## References

- [Architecture V3 Skills Index](../../docs/architecture-v3/INDEX.md) - All V3 architectural patterns
- [Domain Service Boundaries Skill](../../docs/architecture-v3/domain-service-boundaries.md)
- [Code Isolation and Duplication Skill](../../docs/architecture-v3/code-isolation-and-duplication.md)
- [V2 Architecture Baseline](../../docs/architecture-v2/INDEX.md)
- [Product Specifications](../../docs/product_specs.md)
- [Technical Specifications](../../docs/technical_specs.md)

---

## Next Steps

1. **Team Review** - Schedule review meeting with all stakeholders
2. **Validate Assumptions** - Confirm domain boundaries and tech choices
3. **Approve Phases** - Get sign-off on implementation phases
4. **Begin Phase 1** - Start infrastructure setup
5. **Iterate** - Refine based on feedback and learnings

---

**Let's build the future of BattleScope! 🚀**
