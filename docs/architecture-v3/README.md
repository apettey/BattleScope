# BattleScope V3: Service-Owned API Architecture

**Version**: 3.0
**Status**: Design Discussion
**Author**: Claude Code
**Date**: 2025-11-24

---

## Core Principle

**Each service exposes its own API for the data it owns and stores.**

### Service Ownership Model

| Service | Owns Data | Exposes API |
|---------|-----------|-------------|
| **Clusterer Service** | Battles | `/api/battles/*` |
| **Ingest Service** | Raw Killmails | `/api/killmails/raw/*` |
| **Enrichment Service** | Enriched Killmails | `/api/killmails/enriched/*` |
| **Search Service** | Search Indices | `/api/search/*` |

---

## Architecture Discussion

Please describe your vision for:

1. **API Exposure**: Should each service expose its own HTTP API directly?
2. **API Gateway**: Do we still need a unified gateway, or direct service access?
3. **Data Access**: Should frontend call multiple services, or through a BFF (Backend-for-Frontend)?
4. **Inter-Service Communication**:
   - HTTP APIs between services?
   - Or keep Kafka for async events + HTTP for sync queries?
5. **Database Access**: Can services query each other's databases, or only via APIs?

---

## Awaiting Further Requirements...

I'm ready to design the architecture once you provide more details about your preferred approach.
