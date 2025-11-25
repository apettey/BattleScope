# Archive: V1 & V2 Documentation

**Status**: 📚 Historical Reference Only
**Date Archived**: 2025-11-25

---

## ⚠️ Important Notice

**This directory contains legacy documentation from BattleScope V1 and V2 architectures.**

**DO NOT use this documentation for new development or implementation.**

**Current architecture**: See [../../architecture-v3/](../../architecture-v3/) and [../../../proposal/implementation-v1/](../../../proposal/implementation-v1/)

---

## What's Archived Here

### V2 Architecture (`architecture-v2/`)
- V2 architecture overview and design documents
- V2 architecture diagrams
- V2 API service specifications

### Docker Images (`docker-images/`)
- V1/V2 Docker image specifications
- Service-specific Docker configurations
- Legacy deployment documentation

### Legacy Configuration (`config/`)
- V1/V2 service configuration documentation
- Old configuration patterns

### ESI Specifications (`esi-spec/`)
- EVE Swagger Interface client specifications (V1/V2)

### Legacy Technical Docs
- `architecture.md` - Original architecture document (V1)
- `openapi-generation.md` - Old OpenAPI generation guide
- `LOGGING_IMPLEMENTATION_SUMMARY.md` - V1/V2 logging implementation
- `LOGGING_VERIFICATION.md` - V1/V2 logging verification
- `DOCUMENTATION_SUMMARY.md` - Old documentation summary

---

## Why These Were Archived

### V1 → V2 → V3 Evolution

**V1 (Monolithic)**:
- Single application with all features
- Shared database
- No clear domain boundaries

**V2 (Modular Monolith)**:
- Feature-based packages (`@battlescope/battle-reports`, `@battlescope/battle-intel`)
- Shared `@battlescope/common` package
- Shared PostgreSQL database
- Central API gateway
- Mixed communication (HTTP + some events)

**V3 (Distributed Microservices)** ← **CURRENT**:
- 6 independent services
- NO shared packages (code duplication > coupling)
- 6 isolated databases (database-per-service)
- Service-owned APIs
- Fully event-driven (Kafka)
- Distributed systems patterns (circuit breakers, retries, idempotency)

---

## Key Changes in V3

| Aspect | V1/V2 | V3 |
|--------|-------|-----|
| **Architecture** | Monolith / Modular Monolith | Distributed Microservices |
| **Shared Code** | `@battlescope/common` | ❌ NO shared packages |
| **Database** | Shared PostgreSQL | 6 isolated databases |
| **APIs** | Central gateway | Each service owns its API |
| **Communication** | HTTP (+ some events in V2) | Event-driven via Kafka |
| **Deployment** | Single deployment | Independent service deployments |
| **Observability** | Basic logging | Full stack (Prometheus, Grafana, Loki, Jaeger) |

---

## What To Use Instead

### For Architecture
- **Current**: [../../architecture-v3/INDEX.md](../../architecture-v3/INDEX.md)
- **Proposal**: [../../../proposal/implementation-v1/](../../../proposal/implementation-v1/)

### For Service Specifications
- **Current**: [../../../proposal/implementation-v1/services/](../../../proposal/implementation-v1/services/)
  - ingestion-service.md
  - enrichment-service.md
  - battle-service.md
  - search-service.md
  - notification-service.md
  - frontend-bff-service.md

### For Deployment
- **Kubernetes Infrastructure**: [../../../.claude/skills/kubernetes-infrastructure/SKILL.md](../../../.claude/skills/kubernetes-infrastructure/SKILL.md)
- **Observability Stack**: [../../../proposal/implementation-v1/OBSERVABILITY-INFRASTRUCTURE.md](../../../proposal/implementation-v1/OBSERVABILITY-INFRASTRUCTURE.md)

### For Development Patterns
- **Domain Boundaries**: [../../architecture-v3/domain-service-boundaries.md](../../architecture-v3/domain-service-boundaries.md)
- **Code Standards**: [../../architecture-v3/code-standards-and-quality.md](../../architecture-v3/code-standards-and-quality.md)
- **Testing Standards**: [../../architecture-v3/testing-standards-and-coverage.md](../../architecture-v3/testing-standards-and-coverage.md)

---

## When To Reference This Archive

### ✅ Good Reasons to Look Here

1. **Historical Context** - Understanding why certain decisions were made
2. **Migration Reference** - Comparing V2 patterns to V3 patterns
3. **Legacy Code Maintenance** - If still running V1/V2 in production during migration
4. **Architecture Evolution** - Learning from past designs

### ❌ Bad Reasons to Look Here

1. **Implementing New Features** - Use V3 patterns instead
2. **Writing New Code** - Use V3 service specifications
3. **Deployment Configuration** - Use V3 Kubernetes infrastructure
4. **API Design** - Use V3 service-owned API patterns

---

## Contents Inventory

```
v1-v2/
├── README.md                              # This file
├── architecture-v2/                       # V2 architecture docs
│   ├── README.md
│   ├── INDEX.md
│   ├── API-SERVICE.md
│   └── diagrams/
├── architecture.md                        # V1 architecture
├── config/                                # V1/V2 configuration docs
│   └── services.md
├── docker-images/                         # V1/V2 Docker specs
│   ├── README.md
│   ├── TEMPLATE.md
│   ├── api.md
│   ├── clusterer.md
│   ├── db-migrate.md
│   ├── enrichment.md
│   ├── frontend.md
│   ├── ingest.md
│   ├── scheduler.md
│   ├── search-sync.md
│   └── verifier.md
├── esi-spec/                              # V1/V2 ESI client specs
├── services/                              # V1/V2 service docs
├── technical-specifications/              # V1/V2 technical specs
├── user-profile-spec/                     # V1/V2 user profile specs
├── DOCUMENTATION_SUMMARY.md               # Old doc summary
├── LOGGING_IMPLEMENTATION_SUMMARY.md      # V1/V2 logging
├── LOGGING_VERIFICATION.md                # V1/V2 logging verification
└── openapi-generation.md                  # Old OpenAPI generation guide
```

---

## Migration Notes

If you're migrating from V2 to V3, key changes to be aware of:

### 1. No More Shared Packages
```typescript
// V2 (DON'T DO THIS IN V3)
import { Battle } from '@battlescope/common';

// V3 (DO THIS)
// Each service has its own Battle type definition
// Types are NOT shared between services
```

### 2. Database Access
```typescript
// V2 (DON'T DO THIS IN V3)
// Services directly querying other services' tables
const battles = await db.selectFrom('battles').execute();

// V3 (DO THIS)
// Services only access their own database
// Get data from other services via Kafka events or HTTP APIs
const battles = await fetch('http://battle-service/api/battles');
```

### 3. Communication Patterns
```typescript
// V2 (Mixed)
// Some HTTP, some events, inconsistent patterns

// V3 (Consistent)
// All inter-service communication via Kafka events
// HTTP APIs only for client-to-service communication
```

---

## Questions?

If you need to reference V1/V2 documentation for historical context or migration, but have questions about V3:

1. Check the V3 documentation first: [../../architecture-v3/](../../architecture-v3/)
2. Review the V3 proposal: [../../../proposal/implementation-v1/](../../../proposal/implementation-v1/)
3. Consult the V3 skills: [../../../.claude/skills/](../../../.claude/skills/)
4. Create a GitHub issue if unclear

---

**Remember**: This is archived documentation. Always use V3 patterns for new development!

**Last Archived**: 2025-11-25
**Archived By**: Claude Code (Documentation Cleanup)
