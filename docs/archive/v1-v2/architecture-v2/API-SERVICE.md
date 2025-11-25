# API Service Architecture

## Summary

**Yes, the mermaid diagrams correctly show the API Service!**

The architecture has been updated to clearly separate:

1. **API Service** - The unified gateway that the frontend talks to
2. **Query Service** - The background event consumer that rebuilds the Query Database

## Key Diagrams

### 1. System Overview
See: [diagrams/01-system-overview.mmd](./diagrams/01-system-overview.mmd)

**Shows**:
- **API Domain** (separate from Query Domain)
  - API Service (2-3 replicas) - Unified Gateway
  - Redis Cache (shared instance)

- **Query Domain** (separate from API Domain)
  - Query Service (1 replica) - Event Consumer
  - Query Database (PostgreSQL) - Read-Optimized

**Data Flow**:
```
Frontend → API Service → Query Database ← Query Service ← Kafka
```

### 2. Frontend Data Flow
See: [diagrams/02-frontend-data-flow.mmd](./diagrams/02-frontend-data-flow.mmd)

**Shows**:
- Frontend makes HTTP requests to API Service only
- API Service checks Redis cache first
- API Service reads from Query Database (not other services' databases)
- Query Database is updated by consuming Kafka events (CQRS pattern)

## Where Does the API Live?

### Physical Location
The API Service runs as **a separate microservice** in the Kubernetes cluster:

```
Kubernetes Cluster
├── api-service (Deployment, 2-3 pods)
├── query-service (Deployment, 1 pod)
├── ingest-service (Deployment, 1-2 pods)
├── enrichment-service (Deployment, 2-5 pods)
├── clusterer-service (Deployment, 1 pod)
└── ... other services
```

### Network Architecture

```
Internet
   ↓
Load Balancer / Ingress
   ↓
api-service (ClusterIP Service)
   ↓
api-service pods (2-3 replicas)
   ↓
Query Database (PostgreSQL) + Redis Cache
```

### Code Structure

```
battle-monitor/
├── backend/
│   ├── api/                    ← NEW: API Service
│   │   ├── src/
│   │   │   ├── routes/         ← REST endpoints
│   │   │   │   ├── battles.ts
│   │   │   │   ├── killmails.ts
│   │   │   │   └── intel.ts
│   │   │   ├── middleware/
│   │   │   │   ├── cache.ts
│   │   │   │   └── auth.ts
│   │   │   └── index.ts        ← Express/Fastify server
│   │   └── Dockerfile
│   │
│   ├── query/                  ← NEW: Query Service
│   │   ├── src/
│   │   │   ├── consumers/      ← Kafka event consumers
│   │   │   └── index.ts        ← Rebuilds Query DB
│   │   └── Dockerfile
│   │
│   ├── ingest/                 ← Existing services
│   ├── enrichment/
│   ├── clusterer/
│   └── verifier/
```

## What Each Service Exposes

| Service | Exposes API? | Database Access | Purpose |
|---------|-------------|-----------------|---------|
| **API Service** | ✅ **YES** - Public REST API | Query DB (read-only) | Frontend gateway |
| **Query Service** | ❌ NO | Query DB (write) | Rebuilds views from Kafka |
| Ingest Service | ❌ NO | Ingestion DB | Writes to Kafka only |
| Enrichment Service | ❌ NO | None (uses Redis cache) | Kafka events only |
| Clusterer Service | ❌ NO | Battles DB | Kafka events only |

## Data Flow Example

### User Requests Battle List

```
1. Frontend → API Service
   GET /api/battles?limit=20

2. API Service → Redis Cache
   GET battles:list:recent
   (Cache miss)

3. API Service → Query Database
   SELECT * FROM battle_summaries
   ORDER BY start_time DESC
   LIMIT 20

4. API Service → Redis Cache
   SET battles:list:recent (TTL: 60s)

5. API Service → Frontend
   200 OK { battles: [...] }
```

### Background: How Query DB Gets Data

```
1. Clusterer Service → Battles Database
   INSERT INTO battles (...)

2. Clusterer Service → Kafka
   PUBLISH battle.created event

3. Query Service ← Kafka
   CONSUME battle.created event

4. Query Service → Query Database
   REFRESH MATERIALIZED VIEW battle_summaries
```

## Key Architectural Points

### ✅ Correct Implementation

1. **Single API Endpoint**: Frontend only talks to API Service
2. **Database Isolation**: API Service NEVER accesses other services' databases
3. **CQRS Pattern**: Separate write (Battles DB) and read (Query DB) models
4. **Event-Driven**: All inter-service communication via Kafka events
5. **Caching Layer**: Redis reduces database load
6. **Eventually Consistent**: Query DB lags ~5 minutes (acceptable)

### ❌ What We DON'T Do

1. ~~Frontend → Multiple Service APIs~~ (tight coupling)
2. ~~API Service → Clusterer Service API~~ (no service-to-service calls)
3. ~~API Service → Battles Database~~ (wrong database)
4. ~~Clusterer Service exposes API~~ (only Kafka events)

## Resource Allocation

```yaml
api-service:
  replicas: 2-3 (with HPA based on RPS)
  resources:
    memory: 512Mi per pod
    cpu: 250m per pod
  total: ~1.5Gi RAM, 750m CPU

query-service:
  replicas: 1
  resources:
    memory: 512Mi
    cpu: 250m

query-database:
  replicas: 1
  resources:
    memory: 1Gi
    cpu: 500m
    storage: 20Gi SSD
```

## Conclusion

**The mermaid diagrams have been updated and now correctly show:**

1. ✅ **API Service** exists as a separate service in the "API Domain"
2. ✅ **Query Service** exists separately in the "Query Domain"
3. ✅ **Frontend → API Service → Query DB** flow is clearly shown
4. ✅ **Kafka → Query Service → Query DB** background rebuild is shown
5. ✅ All diagram files are now in `docs/architecture-v2/diagrams/`

The architecture properly implements the **API Gateway + CQRS** pattern where the API Service is a thin HTTP wrapper around the Query Database, with all data coming from Kafka events.
