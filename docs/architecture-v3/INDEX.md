# BattleScope Architecture V3 - Skill Index

**Version**: 3.0
**Purpose**: Service-owned API architecture with clean domain boundaries, distributed systems best practices, and comprehensive testing.
**Date**: 2025-11-24

---

## Overview

Architecture V3 is a complete redesign of BattleScope as a distributed, event-driven microservices system. These skill documents guide all architectural and implementation decisions.

**Core Architectural Principles**:
1. Each service owns its domain and exposes its own API
2. Each service has isolated storage (no shared databases)
3. Services communicate via contracts (OpenAPI + JSON Schema)
4. Distributed systems patterns ensure reliability (idempotency, retries, etc.)
5. High code quality standards (TypeScript strict, 80% coverage)
6. Easy local development (make dev → entire system running)
7. Fast CI/CD with multi-architecture builds (amd64 + arm64)

---

## Skill Documents

### 1. Domain Service Boundaries
**File**: `domain-service-boundaries.md`
**Purpose**: Maintain clean domain boundaries and prevent service sprawl

**Key Concepts**:
- One service, one domain (no boundary crossing)
- Complete BattleScope domain map (Ingestion, Enrichment, Battle, Search, Analytics, Notification)
- Decision framework for feature placement
- Events over RPC for inter-service communication

**When to use**: Before creating any service, adding any feature, or modifying service responsibilities

---

### 2. Service Storage Isolation
**File**: `service-storage-isolation.md`
**Purpose**: Ensure each service has isolated storage

**Key Concepts**:
- One database per service (ingestion_db, battles_db, enrichment_db, etc.)
- No direct database access across services
- No foreign keys across service boundaries
- Data synchronization via events (denormalization patterns)

**When to use**: When designing data models, migrations, or cross-service data access

---

### 3. Service Contracts and Testing
**File**: `service-contracts-and-testing.md`
**Purpose**: Define and test all inter-service communication contracts

**Key Concepts**:
- OpenAPI 3.x for HTTP APIs
- JSON Schema for Kafka events
- Contract testing (Pact for HTTP, schema validation for events)
- Semantic versioning with breaking change detection

**When to use**: When creating APIs, publishing events, or modifying existing contracts

---

### 4. Distributed Systems Design
**File**: `distributed-systems-design.md`
**Purpose**: Build reliable, repeatable distributed systems

**Key Concepts**:
- 15 core principles (idempotency, at-least-once delivery, eventual consistency)
- Retry strategies with exponential backoff
- Circuit breakers and dead letter queues
- Health checks and graceful degradation
- Distributed tracing and observability

**When to use**: When designing service interactions, event handlers, or failure scenarios

---

### 5. Code Standards and Quality
**File**: `code-standards-and-quality.md`
**Purpose**: Maintain consistent, high-quality code

**Key Concepts**:
- TypeScript everywhere with strict mode
- Max cyclomatic complexity: 10
- Prettier formatting (zero configuration)
- Clear naming conventions
- Typed error handling

**When to use**: When writing any code, reviewing PRs, or setting up new projects

---

### 6. Testing Standards and Coverage
**File**: `testing-standards-and-coverage.md`
**Purpose**: Ensure comprehensive test coverage

**Key Concepts**:
- Minimum 80% coverage (lines, functions, statements)
- Unit tests (fast, isolated)
- Integration tests (real dependencies)
- Contract tests (API/event validation)
- E2E tests (full system)

**When to use**: When writing features, fixing bugs, or validating system behavior

---

### 7. Local Development Environment
**File**: `local-development-environment.md`
**Purpose**: Standardize local development setup

**Key Concepts**:
- Makefile as primary interface
- Docker Compose for all dependencies
- `make dev` → entire system running
- Database/Kafka/Redis management commands
- Easy state reset (`make db-reset`, `make kafka-reset`)

**When to use**: When onboarding developers, creating new services, or debugging locally

---

### 8. Makefile Standards and Conventions
**File**: `makefile-standards-and-conventions.md`
**Purpose**: Standardize Makefile structure across all projects

**Key Concepts**:
- Standard template with required targets
- Self-documenting (`make help` is default)
- GitHub Actions MUST use Makefile targets
- Root Makefile orchestrates services
- Color output and error handling

**When to use**: When creating any project, adding commands, or writing CI/CD

---

### 9. GitHub Actions CI/CD Pipeline
**File**: `github-actions-cicd-pipeline.md`
**Purpose**: Fast, reliable CI/CD with multi-architecture builds

**Key Concepts**:
- Proper job breakdown (lint → typecheck → tests → build)
- Parallel execution (matrix strategy for services)
- Multi-architecture builds (amd64 + arm64)
- Aggressive caching (pnpm + Docker layers)
- Makefile integration (local/CI parity)

**When to use**: When creating workflows, optimizing pipelines, or adding build steps

---

## Skill Relationships

These skills are designed to work together:

```
Domain Boundaries + Storage Isolation
         ↓
    Service Contracts
         ↓
  Distributed Systems Design
         ↓
    Code Standards + Testing Standards
         ↓
  Local Dev Environment + Makefile
         ↓
    GitHub Actions CI/CD
```

**Example Flow**:
1. Use **Domain Boundaries** to decide where a feature belongs
2. Use **Storage Isolation** to design the data model
3. Use **Service Contracts** to define the API/events
4. Use **Distributed Systems** to handle failures and retries
5. Use **Code Standards** to write the implementation
6. Use **Testing Standards** to verify behavior
7. Use **Local Dev** to test the entire flow locally
8. Use **Makefile** to define commands
9. Use **GitHub Actions** to automate CI/CD

---

## Quick Reference

### For New Features
1. Read: Domain Boundaries → decide which service
2. Read: Storage Isolation → design data model
3. Read: Service Contracts → define API/events
4. Read: Code Standards → write implementation
5. Read: Testing Standards → write tests
6. Verify: Run `make ci` locally

### For New Services
1. Read: Domain Boundaries → verify single domain
2. Read: Storage Isolation → create isolated database
3. Read: Service Contracts → define contracts
4. Read: Distributed Systems → implement patterns
5. Read: Code Standards → set up project
6. Read: Local Dev → add to docker-compose
7. Read: Makefile → create Makefile
8. Read: GitHub Actions → add to CI/CD

### For Refactoring
1. Read: Domain Boundaries → check for violations
2. Read: Storage Isolation → verify no shared storage
3. Read: Service Contracts → check breaking changes
4. Read: Testing Standards → ensure coverage maintained
5. Verify: All tests pass, coverage threshold met

---

## Validation Checklist

Before merging any PR, verify:

- [ ] **Domain Boundaries**: Feature belongs to single domain
- [ ] **Storage Isolation**: No cross-database queries
- [ ] **Service Contracts**: Contracts validated and tested
- [ ] **Distributed Systems**: Idempotency and retries implemented
- [ ] **Code Standards**: Passes lint, typecheck, format check
- [ ] **Testing Standards**: 80%+ coverage, all tests pass
- [ ] **Local Dev**: `make dev` and `make test` work
- [ ] **Makefile**: Commands documented with `##` help text
- [ ] **GitHub Actions**: CI passes, images build for both architectures

---

## Version History

- **v3.0** (2025-11-24) - Initial Architecture V3 skill documents
  - Service-owned API architecture
  - Complete distributed systems patterns
  - Multi-architecture builds
  - Comprehensive testing standards

---

## Next Steps

To implement Architecture V3:

1. **Phase 1**: Infrastructure Setup
   - Set up separate PostgreSQL instances per service
   - Configure Kafka/Redpanda for event streaming
   - Set up Typesense for search

2. **Phase 2**: Service Contracts
   - Define OpenAPI specs for all services
   - Define JSON schemas for all events
   - Set up contract testing

3. **Phase 3**: Service Implementation
   - Implement services following domain boundaries
   - Add distributed systems patterns (retries, circuit breakers)
   - Ensure 80% test coverage

4. **Phase 4**: CI/CD Setup
   - Create Makefiles for all services
   - Set up GitHub Actions workflows
   - Configure multi-architecture builds

5. **Phase 5**: Deployment
   - Deploy to staging with docker-compose
   - Run full E2E test suite
   - Deploy to production with monitoring

---

## References

All skills reference industry-standard books and patterns:
- Domain-Driven Design (Eric Evans)
- Building Microservices (Sam Newman)
- Designing Data-Intensive Applications (Martin Kleppmann)
- Release It! (Michael Nygard)
- Clean Code (Robert C. Martin)
