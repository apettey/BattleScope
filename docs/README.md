# BattleScope Documentation

**Version**: 3.0
**Last Updated**: 2025-11-25

---

## Quick Navigation

| Documentation Type | Location | Description |
|--------------------|----------|-------------|
| **🏗️ Architecture V3** | [architecture-v3/](./architecture-v3/) | Complete V3 distributed architecture, patterns, and standards |
| **📋 V3 Implementation Proposal** | [../proposal/implementation-v1/](../proposal/implementation-v1/) | Detailed V3 implementation proposal with service specs |
| **✨ Features** | [features/](./features/) | Feature specifications and implementation guides |
| **🔐 Authentication** | [authenication-authorization-spec/](./authenication-authorization-spec/) | EVE SSO auth and RBAC specification |
| **📊 Observability** | [observability/](./observability/) | Metrics, logging, tracing, and alerting standards |
| **📦 Product Specs** | [product_specs.md](./product_specs.md) | High-level product vision and requirements |
| **🗂️ Archive** | [archive/v1-v2/](./archive/v1-v2/) | Legacy V1 and V2 documentation (reference only) |

---

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Observability](#observability)
- [Product & Technical Specifications](#product--technical-specifications)
- [Authentication & Authorization](#authentication--authorization)
- [API Documentation](#api-documentation)
- [Quick Start Guides](#quick-start-guides)
- [Archive](#archive)

---

## Architecture

### Architecture V3 (Current)

**Location**: [architecture-v3/](./architecture-v3/)

BattleScope V3 is a **distributed, event-driven microservices architecture** with strict domain boundaries and no shared code between services.

**Key Documents**:
- **[INDEX.md](./architecture-v3/INDEX.md)** - Complete navigation guide for all V3 architecture docs
- **[Domain Service Boundaries](./architecture-v3/domain-service-boundaries.md)** - Domain-driven design applied to BattleScope
- **[Service Storage Isolation](./architecture-v3/service-storage-isolation.md)** - Database-per-service pattern
- **[Code Isolation and Duplication](./architecture-v3/code-isolation-and-duplication.md)** - Why NO shared packages
- **[Distributed Systems Design](./architecture-v3/distributed-systems-design.md)** - Resilience patterns (circuit breakers, retries, idempotency)
- **[Service Contracts and Testing](./architecture-v3/service-contracts-and-testing.md)** - API and event contract standards
- **[Testing Standards and Coverage](./architecture-v3/testing-standards-and-coverage.md)** - 80% coverage requirement and testing patterns
- **[Code Standards and Quality](./architecture-v3/code-standards-and-quality.md)** - TypeScript, linting, formatting standards
- **[Makefile Standards](./architecture-v3/makefile-standards-and-conventions.md)** - Development workflow automation
- **[GitHub Actions CI/CD](./architecture-v3/github-actions-cicd-pipeline.md)** - Automated testing and deployment
- **[Local Development Environment](./architecture-v3/local-development-environment.md)** - Setting up local dev environment

### V3 Implementation Proposal

**Location**: [../proposal/implementation-v1/](../proposal/implementation-v1/)

Complete implementation specification for V3 migration:
- **[INDEX.md](../proposal/implementation-v1/INDEX.md)** - Executive summary and navigation
- **[README.md](../proposal/implementation-v1/README.md)** - Overview, timeline, success criteria
- **[ARCHITECTURE.md](../proposal/implementation-v1/ARCHITECTURE.md)** - Technical architecture details
- **[DOMAIN-BOUNDARIES.md](../proposal/implementation-v1/DOMAIN-BOUNDARIES.md)** - Service domain definitions
- **[OBSERVABILITY.md](../proposal/implementation-v1/OBSERVABILITY.md)** - Metrics, logging, tracing, SLO standards
- **[OBSERVABILITY-INFRASTRUCTURE.md](../proposal/implementation-v1/OBSERVABILITY-INFRASTRUCTURE.md)** - Kubernetes observability stack (Prometheus, Grafana, Loki, Jaeger)
- **[services/](../proposal/implementation-v1/services/)** - Detailed service specifications (6 services)
- **[diagrams/](../proposal/implementation-v1/diagrams/)** - 8 Mermaid architecture diagrams

**6 Services**:
1. **Ingestion Service** - Raw killmail acquisition (RedisQ + History API)
2. **Enrichment Service** - Killmail augmentation with ESI data
3. **Battle Service** - Clustering killmails into battles
4. **Search Service** - Full-text search (Typesense)
5. **Notification Service** - Real-time WebSocket notifications
6. **Frontend BFF** - Backend-for-Frontend aggregation layer

### Architecture Principles

**Domain-Driven Design**:
- 6 bounded contexts, each with ONE service
- No cross-domain data access
- Event-driven communication via Kafka

**Code Isolation**:
- **NO shared packages** (`@battlescope/common` removed in V3)
- Each service owns its types, models, and utilities
- Duplication > coupling

**Storage Isolation**:
- 6 databases (PostgreSQL + Typesense + Redis)
- No cross-database queries
- Data synchronization via Kafka events only

**Service-Owned APIs**:
- Each service exposes its own HTTP API
- No central API gateway (or thin routing only)

---

## Features

**Location**: [features/](./features/)

### Implemented Features

#### Battle Reports
**Directory**: [features/battle-reports/](./features/battle-reports/)
- Killmail collection and filtering
- Battle clustering algorithm
- Battle reconstruction and statistics

**Documents**:
- [feature-spec.md](./features/battle-reports/feature-spec.md) - Complete feature specification
- [frontend-spec.md](./features/battle-reports/frontend-spec.md) - UI/UX specification
- [openapi-spec.md](./features/battle-reports/openapi-spec.md) - API specification

#### Battle Intel
**Directory**: [features/battle-intel/](./features/battle-intel/)
- Statistical analysis and trends
- Opponent tracking
- Combat intelligence

**Documents**:
- [feature-spec.md](./features/battle-intel/feature-spec.md) - Complete feature specification
- [frontend-spec.md](./features/battle-intel/frontend-spec.md) - UI/UX specification
- [openapi-spec.md](./features/battle-intel/openapi-spec.md) - API specification

#### Search
**Directory**: [features/search/](./features/search/)
- Full-text search across battles and entities
- Faceted filtering
- Autocomplete

**Documents**:
- [feature-spec.md](./features/search/feature-spec.md) - Search feature specification
- [frontend-spec.md](./features/search/frontend-spec.md) - Search UI specification
- [openapi-spec.md](./features/search/openapi-spec.md) - Search API specification
- [IMPLEMENTATION_SUMMARY.md](./features/search/IMPLEMENTATION_SUMMARY.md) - Implementation status

#### Admin Panel
**Directory**: [features/admin-panel/](./features/admin-panel/)
- System configuration
- User management
- Ruleset configuration

**Documents**:
- [feature-spec.md](./features/admin-panel/feature-spec.md) - Admin feature specification
- [frontend-spec.md](./features/admin-panel/frontend-spec.md) - Admin UI specification
- [openapi-spec.md](./features/admin-panel/openapi-spec.md) - Admin API specification

### New V3 Features

#### Historical Killmail Ingestion
**Document**: [features/historical-ingestion/feature-spec.md](./features/historical-ingestion/feature-spec.md)

Backfill historical killmail data using zKillboard History API:
- Date range selection
- Batch processing
- Progress tracking
- Job management UI

**Use Cases**:
- Data recovery after outages
- New alliance tracking (populate historical data)
- Historical analysis and trends
- Initial installation bootstrap

#### Data Retention Policy
**Document**: [features/data-retention-policy.md](./features/data-retention-policy.md)

Automatic 60-month (5-year) rolling window:
- Daily retention cleanup (02:00 UTC)
- Daily verification (03:00 UTC)
- Gap detection on startup
- Battle re-clustering when data changes

---

## Observability

**Location**: [observability/](./observability/)

### V3 Observability Standards

**Proposal Documents**:
- **[OBSERVABILITY.md](../proposal/implementation-v1/OBSERVABILITY.md)** - Complete observability standards
- **[OBSERVABILITY-INFRASTRUCTURE.md](../proposal/implementation-v1/OBSERVABILITY-INFRASTRUCTURE.md)** - Kubernetes observability stack

### Stack Components

| Component | Purpose | Retention | Access |
|-----------|---------|-----------|--------|
| **Prometheus** | Metrics collection and alerting | 30 days | NodePort 30500 |
| **Grafana** | Dashboards and visualization | N/A | NodePort 30501 |
| **Loki** | Log aggregation | 7 days | Internal (via Grafana) |
| **Jaeger** | Distributed tracing | 7 days | NodePort 30502 |
| **AlertManager** | Alert routing (Slack, PagerDuty) | N/A | Internal |

### Observability Features

**Metrics**:
- Standard HTTP, database, Kafka, and cache metrics
- Business metrics (battles created, killmails ingested, etc.)
- SLO tracking (availability, latency, error rate)

**Logging**:
- Structured JSON logs with trace context
- File/line/function automatically added
- Log levels: ERROR, WARN, INFO, DEBUG, TRACE

**Tracing**:
- OpenTelemetry distributed tracing
- End-to-end killmail processing traces
- Database query tracing
- External API call tracing

**Alerting**:
- 15+ predefined alerts (critical + warning + SLO)
- Slack notifications for all alerts
- PagerDuty for critical alerts only
- Alert inhibition rules

### SLO Targets

| Service | Availability | Latency (p95) | Error Rate |
|---------|-------------|---------------|------------|
| Ingestion | 99.5% | N/A (async) | <1% |
| Enrichment | 99.5% | N/A (async) | <2% |
| Battle | 99.9% | <500ms | <0.5% |
| Search | 99.9% | <100ms | <0.5% |
| Notification | 99.5% | <100ms | <1% |
| Frontend BFF | 99.9% | <200ms (cached) | <1% |

---

## Product & Technical Specifications

### Product Specifications

**[product_specs.md](./product_specs.md)** - Platform-level product specification and feature overview

**[product-specifications/](./product-specifications/)**:
- [requirements.md](./product-specifications/requirements.md) - Functional and non-functional requirements
- [user-stories.md](./product-specifications/user-stories.md) - User stories and acceptance criteria
- [features.md](./product-specifications/features.md) - Feature list and priorities
- [roadmap.md](./product-specifications/roadmap.md) - Development roadmap

### Technical Specifications

**[technical_specs.md](./technical_specs.md)** - Legacy technical architecture (V1/V2 reference)

**Ruleset Configuration**:
**[ruleset_configuration_spec.md](./ruleset_configuration_spec.md)** - Ingestion ruleset configuration

Supported filters:
- Minimum pilots (e.g., only track battles with 5+ participants)
- Tracked alliances (allowlist)
- Tracked corporations (allowlist)
- Tracked systems (specific solar system IDs)
- Security types (highsec, lowsec, nullsec, wormhole, pochven)

---

## Authentication & Authorization

**Location**: [authenication-authorization-spec/](./authenication-authorization-spec/)

**Status**: ⏳ Planned (not yet implemented)

### Features

- **EVE Online SSO** - OAuth2/OIDC authentication
- **Multi-character support** - Link multiple EVE characters to one account
- **Feature-scoped RBAC** - Roles per feature: `user`, `fc`, `director`, `admin`, `superadmin`
- **Graceful UI degradation** - UI adapts based on feature access

### Current State

All endpoints are currently public (no authentication required).

---

## API Documentation

### OpenAPI Specifications

| File | Description | Source of Truth |
|------|-------------|-----------------|
| [openapi.json](./openapi.json) | Auto-generated from code | ✅ Yes |
| [openapi-generated.yaml](./openapi-generated.yaml) | YAML version of auto-generated spec | ✅ Yes |
| [openapi.yaml](./openapi.yaml) | Original hand-crafted spec | ❌ Reference only |

### Viewing API Documentation

**Swagger UI** (when server running):
```bash
cd backend/api
pnpm run dev
# Open: http://localhost:3000/docs
```

**Redoc**:
```bash
npx redoc-cli serve docs/openapi.json
```

### Generating OpenAPI Specs

```bash
cd backend/api
pnpm run generate-openapi
```

This updates:
- `docs/openapi.json`
- `docs/openapi-generated.yaml`

### API Response Format

All API responses follow these conventions:
- **IDs as Strings**: `"killmailId": "12345678"` (supports BigInt)
- **Nullable Names**: `"allianceName": "Pandemic Legion"` or `null`
- **ISO Timestamps**: `"2025-11-25T18:43:00Z"`
- **Consistent Errors**: `{ "message": "Error description" }`

---

## Quick Start Guides

### For Developers

1. **Architecture Overview**: Start with [architecture-v3/INDEX.md](./architecture-v3/INDEX.md)
2. **Service Specs**: Read service specifications in [proposal/implementation-v1/services/](../proposal/implementation-v1/services/)
3. **Local Setup**: Follow [architecture-v3/local-development-environment.md](./architecture-v3/local-development-environment.md)
4. **Coding Standards**: Review [architecture-v3/code-standards-and-quality.md](./architecture-v3/code-standards-and-quality.md)
5. **Testing**: Follow [architecture-v3/testing-standards-and-coverage.md](./architecture-v3/testing-standards-and-coverage.md)

### For Architects

1. **Executive Summary**: Read [proposal/implementation-v1/README.md](../proposal/implementation-v1/README.md)
2. **Architecture Details**: Review [proposal/implementation-v1/ARCHITECTURE.md](../proposal/implementation-v1/ARCHITECTURE.md)
3. **Domain Boundaries**: Study [proposal/implementation-v1/DOMAIN-BOUNDARIES.md](../proposal/implementation-v1/DOMAIN-BOUNDARIES.md)
4. **Diagrams**: Review all 8 diagrams in [proposal/implementation-v1/diagrams/](../proposal/implementation-v1/diagrams/)
5. **Observability**: Check [proposal/implementation-v1/OBSERVABILITY.md](../proposal/implementation-v1/OBSERVABILITY.md)

### For Product/Business

1. **Executive Summary**: Read [proposal/implementation-v1/README.md](../proposal/implementation-v1/README.md) executive summary
2. **Product Specs**: Review [product_specs.md](./product_specs.md)
3. **Features**: Check [features/](./features/) for feature specifications
4. **Success Criteria**: Review success criteria in [proposal/implementation-v1/README.md](../proposal/implementation-v1/README.md)
5. **Timeline**: Check implementation phases in [proposal/implementation-v1/README.md](../proposal/implementation-v1/README.md)

---

## Archive

**Location**: [archive/v1-v2/](./archive/v1-v2/)

Legacy V1 and V2 documentation moved to archive:
- V2 architecture documentation
- Docker image specifications (V1/V2)
- Legacy service configurations
- Old technical specifications
- Historical logging documentation

**Note**: This is for reference only. Use V3 architecture docs for current implementation.

---

## Documentation Standards

### Creating New Documentation

1. **Use Markdown format** with proper heading hierarchy
2. **Include tables** for structured data
3. **Provide code examples** in JSON/YAML/TypeScript
4. **Add diagrams** using Mermaid when helpful
5. **Cross-reference** related documents
6. **Update this README** when adding new sections

### Updating Documentation

**When code changes**:
1. Update route schemas in code
2. Update route handlers
3. Run `pnpm run generate-openapi`
4. Commit code and generated specs together

**When requirements change**:
1. Update product specifications
2. Update feature specifications
3. Implement code changes
4. Update service specifications
5. Regenerate OpenAPI specs

**Adding new features**:
1. Create feature specification in `features/<feature-name>/`
2. Update service specifications in proposal
3. Create API schemas and routes
4. Generate OpenAPI specs
5. Update this README's feature list

---

## Contributing

1. **Keep docs in sync with code** - Documentation should reflect reality
2. **Use clear language** - Avoid jargon, explain acronyms
3. **Provide examples** - Show, don't just tell
4. **Update navigation** - Add new docs to README and INDEX files
5. **Review before committing** - Check for broken links and formatting
6. **Link related sections** - Help readers discover related content

---

## Tools & Resources

### Documentation Tools

- **Swagger UI**: Built-in at `/docs` when API server running
- **Redoc**: `npx redoc-cli serve docs/openapi.json`
- **Mermaid**: Diagram rendering in GitHub and VS Code
- **OpenAPI Generator**: Generate client libraries

### Generating Client Libraries

**TypeScript**:
```bash
npx @openapitools/openapi-generator-cli generate \
  -i docs/openapi.json \
  -g typescript-axios \
  -o clients/typescript
```

**Python**:
```bash
npx @openapitools/openapi-generator-cli generate \
  -i docs/openapi.json \
  -g python \
  -o clients/python
```

### Testing API

- **Postman**: Import `docs/openapi.json`
- **Insomnia**: Import OpenAPI spec
- **curl**: Copy examples from Swagger UI
- **VS Code REST Client**: Use `.http` files

---

## Support & Feedback

**Questions or issues**:
1. Check existing documentation first
2. Review API examples in specs
3. Consult observability standards
4. Create GitHub issue for doc bugs

**Documentation feedback**:
- Create GitHub issue
- Tag with `documentation` label
- Suggest improvements or corrections

---

**Last Updated**: 2025-11-25
**Architecture Version**: V3
**Status**: Implementation in progress
