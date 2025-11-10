# Typesense Implementation Summary

## Quick Start

Typesense has been selected as the search engine for BattleScope. This document provides implementation highlights.

### Why Typesense?

- ✅ **Fast**: <50ms search response times
- ✅ **Clustering support**: Unlike Meilisearch, Typesense supports horizontal scaling
- ✅ **Easy to deploy**: Single binary, low resource usage (~50-100MB RAM)
- ✅ **Great typo tolerance**: Industry-leading fuzzy matching
- ✅ **Cost-effective**: Open source (GPLv3) with optional commercial license
- ✅ **Quick to implement**: Simple REST API, excellent documentation

### Installation

```bash
# Install Typesense client
pnpm --filter @battlescope/search add typesense

# Start Typesense (Docker)
docker run -p 8108:8108 -v /tmp/typesense-data:/data typesense/typesense:26.0 \
  --data-dir /data --api-key=your-api-key --enable-cors
```

### Client Initialization

```typescript
import Typesense from 'typesense';

const client = new Typesense.Client({
  nodes: [
    {
      host: process.env.TYPESENSE_HOST || 'localhost',
      port: Number(process.env.TYPESENSE_PORT) || 8108,
      protocol: process.env.TYPESENSE_PROTOCOL || 'http',
    },
  ],
  apiKey: process.env.TYPESENSE_API_KEY!,
  connectionTimeoutSeconds: 2,
});
```

### Creating Collections

```typescript
await client.collections().create({
  name: 'battles',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'systemName', type: 'string' },
    { name: 'spaceType', type: 'string', facet: true },
    { name: 'startTime', type: 'int64' },
    { name: 'totalKills', type: 'int32' },
    { name: 'totalIskDestroyed', type: 'int64' },
    { name: 'allianceNames', type: 'string[]' },
    { name: 'battleScore', type: 'int32' },
  ],
  default_sorting_field: 'startTime',
});
```

### Indexing Documents

```typescript
// Upsert single document
await client.collections('battles').documents().upsert({
  id: 'battle-123',
  systemName: 'M-OEE8',
  spaceType: 'kspace',
  startTime: 1731254400,
  totalKills: 87,
  totalIskDestroyed: 42300000000,
  allianceNames: ['Test Alliance', 'Brave Collective'],
  battleScore: 1250,
});

// Batch import
await client.collections('battles').documents().import(battles, { action: 'upsert' });
```

### Searching

```typescript
// Simple search
const results = await client.collections('battles').documents().search({
  q: 'pandemic',
  query_by: 'systemName,allianceNames',
  num_typos: 2,
  prefix: true,
});

// Advanced search with filters
const results = await client.collections('battles').documents().search({
  q: '*', // Match all
  filter_by: 'spaceType:kspace && totalKills:>=10',
  sort_by: 'startTime:desc',
  per_page: 20,
});

// Autocomplete
const results = await client.collections('entities').documents().search({
  q: 'pand',
  query_by: 'name,ticker',
  prefix: true, // Enable prefix matching
  per_page: 10,
});
```

### Performance Tips

1. **Use faceted filters**: Mark fields with `facet: true` for fast filtering
2. **Batch imports**: Use `documents().import()` for bulk indexing (1000+ docs)
3. **Prefix search**: Always enable `prefix: true` for autocomplete
4. **Tune typos**: Use `num_typos: 2` for general search, `num_typos: 1` for precise queries
5. **Connection pooling**: Reuse Typesense client instance
6. **Caching**: Cache search results for 30-60 seconds on frequently accessed queries

### Deployment

**Development (Docker Compose)**:
```yaml
services:
  typesense:
    image: typesense/typesense:26.0
    ports:
      - "8108:8108"
    volumes:
      - typesense-data:/data
    environment:
      TYPESENSE_DATA_DIR: /data
      TYPESENSE_API_KEY: ${TYPESENSE_API_KEY}
      TYPESENSE_ENABLE_CORS: true
```

**Production (Kubernetes - 3 node cluster)**:
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: typesense
spec:
  replicas: 3
  serviceName: typesense
  selector:
    matchLabels:
      app: typesense
  template:
    metadata:
      labels:
        app: typesense
    spec:
      containers:
      - name: typesense
        image: typesense/typesense:26.0
        args:
          - "--data-dir=/data"
          - "--api-key=$(TYPESENSE_API_KEY)"
          - "--peering-address=$(POD_IP)"
          - "--nodes=$(TYPESENSE_NODES)"
        env:
        - name: TYPESENSE_API_KEY
          valueFrom:
            secretKeyRef:
              name: typesense-secret
              key: api-key
        - name: POD_IP
          valueFrom:
            fieldRef:
              fieldPath: status.podIP
        - name: TYPESENSE_NODES
          value: "typesense-0.typesense:8107,typesense-1.typesense:8107,typesense-2.typesense:8107"
        ports:
        - containerPort: 8108
          name: http
        - containerPort: 8107
          name: peering
        volumeMounts:
        - name: data
          mountPath: /data
        resources:
          requests:
            memory: "256Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "2000m"
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 10Gi
```

### Cost Estimate

**Typesense Software**: **FREE** (open source, GPLv3 license)

**Infrastructure Options**:

1. **Deploy on Existing K8s Cluster** (Recommended):
   - Typesense cost: **$0**
   - Infrastructure cost: **$0 extra** (uses existing cluster resources)
   - Resource usage: ~50-100MB RAM per node, minimal CPU
   - **Total additional cost: $0**

2. **New Cloud Infrastructure** (if you don't have existing infra):
   - Typesense: **$0** (still free)
   - 3 VMs on AWS/GCP: ~$150-300/month
   - Storage: ~$1/GB/month
   - Total: ~$200-350/month (but this is for the VMs, not Typesense)

3. **Typesense Cloud** (managed service - optional):
   - They host and manage Typesense for you
   - ~$300/month
   - **NOT RECOMMENDED** - easy to self-host

**For BattleScope**: Since you're already running Kubernetes, just deploy Typesense as a StatefulSet in your cluster. **No additional cost.**

### Implementation Time Estimate

- ✅ Collection schemas: **1 hour**
- ✅ Indexing pipeline: **2-3 hours**
- ✅ Search API endpoints: **2-3 hours**
- ✅ Frontend components: **3-4 hours** (using pre-built components from spec)
- ✅ Testing & optimization: **2-3 hours**

**Total: 10-14 hours** for complete implementation

### Architecture Notes

**API as Proxy**:
- API service proxies all search requests to Typesense
- Never expose Typesense directly to frontend
- Enables auth, rate limiting, logging, and transformation

**Entity Indexing Rules**:
- ✅ Only index entities **referenced in battles** (participated in at least one battle)
- ✅ Real-time updates when battles are created
- ✅ Daily CronJob syncs all entity metadata from PostgreSQL
- ✅ Garbage collection removes stale entities (not in any battles)

**Daily Sync CronJob**:
- Runs daily at 3:00 AM UTC
- Refreshes entity metadata (names, tickers, relationships)
- Updates activity metrics (battleCount, lastSeenAt)
- Removes entities no longer referenced in battles
- See `feature-spec.md` Section 4.3 for full implementation

---

### Next Steps

1. Deploy Typesense to K8s cluster (StatefulSet with 3 replicas)
2. Run collection setup: `pnpm --filter @battlescope/search run setup-collections`
3. Initial data indexing: `pnpm --filter @battlescope/search run reindex`
4. Deploy daily sync CronJob: `kubectl apply -f infra/k8s/typesense-entity-sync-cronjob.yaml`
5. Implement search API endpoints as proxy (see `openapi-spec.md`)
6. Integrate frontend components (see `frontend-spec.md`)
7. Test and optimize

### Resources

- [Typesense Documentation](https://typesense.org/docs/)
- [Typesense API Reference](https://typesense.org/docs/api/)
- [Typesense GitHub](https://github.com/typesense/typesense)
- [Typesense Discord Community](https://typesense.org/community)

