# BattleScope V2 Architecture Documentation

## Quick Links

### Main Documentation
- **[README.md](./README.md)** - Complete architecture specification
- **[API-SERVICE.md](./API-SERVICE.md)** - API Service architecture explained

### Diagrams
All Mermaid diagrams are in `diagrams/` folder:

1. **[01-system-overview.mmd](./diagrams/01-system-overview.mmd)**
   - Complete distributed system architecture
   - Shows all services, databases, and data flows
   - Kafka/Redpanda event bus topology
   - PostgreSQL database separation

2. **[02-frontend-data-flow.mmd](./diagrams/02-frontend-data-flow.mmd)**
   - How frontend requests flow through API Service
   - CQRS pattern (Query Database rebuilt from Kafka)
   - Redis caching strategy
   - Eventually consistent data model

## Architecture Summary

### Core Principles
- **Event-Driven**: All inter-service communication via Kafka
- **Database-Per-Service**: 4 separate PostgreSQL instances
- **CQRS**: Separate write (Battles DB) and read (Query DB) models
- **API Gateway**: Single unified frontend interface
- **Eventually Consistent**: 5-minute materialized view refresh

### Services

| Service | Type | Replicas | Database | Exposes API? |
|---------|------|----------|----------|--------------|
| **API Service** | Gateway | 2-3 | Query DB (read) | ✅ Public REST |
| **Query Service** | Consumer | 1 | Query DB (write) | ❌ Internal |
| Ingest Service | Producer | 1-2 | Ingestion DB | ❌ Internal |
| Enrichment Service | Worker | 2-5 | None (cache) | ❌ Internal |
| Clusterer Service | Consumer/Producer | 1 | Battles DB | ❌ Internal |

### Data Flow

```
Frontend
   ↓
API Service (REST API)
   ↓
Query Database (PostgreSQL)
   ↑
Query Service (Kafka Consumer)
   ↑
Kafka Event Bus
   ↑
Clusterer Service
   ↑
Battles Database (PostgreSQL)
```

### Key Questions Answered

**Q: Where does the API live?**
A: Separate microservice in K8s cluster (`backend/api/`)

**Q: How does data reach the frontend?**
A: Frontend → API Service → Query Database (CQRS read model)

**Q: Do services talk to each other directly?**
A: No, all communication via Kafka events (event-driven)

**Q: Why separate databases?**
A: Service isolation, independent scaling, fault tolerance

**Q: Is data real-time?**
A: Eventually consistent (~5min lag), real-time via WebSocket for critical updates

## Deployment

### Kubernetes Resources
- **3-5 nodes** (DigitalOcean/Linode/Hetzner)
- **16-32GB RAM** total cluster
- **4 PostgreSQL instances** (separate StatefulSets)
- **1 Redpanda node** (Kafka-compatible)
- **1 Redis instance** (shared caching)

### Total Cost
- **$120-250/month** (depending on provider and node count)
- Hetzner: ~$42/month (cheapest)
- Linode: ~$108/month
- DigitalOcean: ~$144/month

## Next Steps

1. Review [README.md](./README.md) for complete architecture
2. Check [API-SERVICE.md](./API-SERVICE.md) for frontend integration
3. Review diagrams in `diagrams/` folder
4. See implementation roadmap in README (Migration Strategy section)

## Version History

- **v2.0** (2025-11-24) - Distributed architecture with Kafka + separate DBs
- **v1.0** (2024) - Monolithic microservices with shared PostgreSQL
