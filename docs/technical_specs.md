# BattleScope Technical Specification (v1)

## 1. Technology Stack

- **Language:** TypeScript (Node.js 20 LTS)
- **Frameworks:**
  - **API:** Fastify (HTTP), Zod (validation), OpenAPI generator (typed client)
  - **Workers:** Bare Node.js or BullMQ (for background queues)
- **Database:** PostgreSQL 15
- **Cache/Queue (optional):** Redis 7 (BullMQ, cache)
- **Containerization:** Docker (multi-stage build)
- **Orchestration:** Kubernetes 1.27+
- **Ingress:** NGINX Ingress Controller
- **TLS:** cert-manager with Let’s Encrypt
- **Observability:** Prometheus, Grafana, Loki, OpenTelemetry
- **Secrets Management:** Kubernetes Secrets (optionally backed by KMS)
- **CI/CD:** GitHub Actions for build, test, and deploy
- **Repository:** GitHub Monorepo (PNPM workspaces for shared types)

---

## 2. Service Architecture (Kubernetes-native)

| Service | Type | Responsibility |
|----------|------|----------------|
| **api** | Deployment | Expose REST API, filters, battle listings |
| **ingest** | Deployment | Pull killmail data from zKillboard RedisQ |
| **clusterer** | Deployment | Group kills into battles and compute summaries |
| **scheduler** | CronJob | Maintenance, re-clustering, indexing |
| **db** | Stateful | PostgreSQL (persistent) |
| **redis** | Stateful | Optional cache/queue |
| **frontend** | Deployment | Optional Next.js UI |

Each service runs as its own Deployment with a ConfigMap for parameters and Secrets for credentials.

---

## 3. Data Model

**battles**
- `id` (uuid, pk)
- `system_id` (int)
- `space_type` (enum: kspace, jspace, pochven)
- `start_time` (timestamptz)
- `end_time` (timestamptz)
- `total_kills` (int)
- `total_isk_destroyed` (bigint)
- `zkill_related_url` (text)
- `created_at` (timestamptz)

**battle_killmails**
- `(battle_id, killmail_id)` composite pk
- `zkb_url` (text)
- `timestamp` (timestamptz)
- `system_id` (int)
- `victim_alliance_id` (int)
- `attacker_alliance_ids` (int[])
- `isk_value` (bigint)
- `side_id` (smallint)

**battle_participants**
- `(battle_id, character_id, ship_type_id)` pk
- `corp_id`, `alliance_id`
- `side_id`
- `is_victim` (bool)

---

## 4. Clustering Algorithm

**Parameters**
- `WINDOW_MINUTES` = 30
- `GAP_MAX` = 15
- `MIN_KILLS` = 2

**Logic**
1. Group killmails by system.
2. Sort by timestamp.
3. Start a cluster when kills occur within `GAP_MAX` and share attacker/victim overlaps.
4. End cluster when no more correlated kills.
5. Compute totals and derive `space_type` and `zkill_related_url`.

**Pseudocode**
```ts
for (const system of systems) {
  const kills = getKills(system, windowStart, windowEnd).sort(byTime);
  let cluster = [];
  for (const k of kills) {
    if (!cluster.length) { cluster.push(k); continue; }
    const contiguous = k.ts - cluster.at(-1)!.ts <= GAP_MAX;
    const correlated = overlaps(cluster, k);
    if (contiguous || correlated) cluster.push(k);
    else { flush(cluster); cluster = [k]; }
  }
  flush(cluster);
}
```

---

## 5. API Endpoints

| Endpoint | Description |
|-----------|--------------|
| `GET /battles` | Filter by space, time, corp, alliance, character |
| `GET /battles/{id}` | Get detailed battle info |
| `GET /characters/{id}/battles` | Battles involving a character |
| `GET /alliances/{id}/battles` | Battles involving an alliance |
| `GET /healthz` | Health probe |

All responses are JSON with cursor-based pagination.  
Schemas validated via Zod and auto-exported to OpenAPI.

---

## 6. Kubernetes Manifests Overview

### Namespace
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: battlescope
```

### Secrets and ConfigMap
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: battlescope-secrets
  namespace: battlescope
type: Opaque
data:
  DB_URL: <base64>
  REDIS_URL: <base64>
  ZKB_USERAGENT: <base64>
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: battlescope-config
  namespace: battlescope
data:
  WINDOW_MINUTES: "30"
  GAP_MAX_MINUTES: "15"
  MIN_KILLS: "2"
```

### API Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: battlescope
spec:
  replicas: 2
  selector:
    matchLabels: { app: api }
  template:
    metadata:
      labels: { app: api }
    spec:
      containers:
        - name: api
          image: ghcr.io/you/battlescope-api:{{ .Chart.AppVersion }}
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef: { name: battlescope-secrets }
            - configMapRef: { name: battlescope-config }
```

### Ingest Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ingest
  namespace: battlescope
spec:
  replicas: 1
  selector:
    matchLabels: { app: ingest }
  template:
    metadata:
      labels: { app: ingest }
    spec:
      containers:
        - name: ingest
          image: ghcr.io/you/battlescope-ingest:{{ .Chart.AppVersion }}
          envFrom:
            - secretRef: { name: battlescope-secrets }
            - configMapRef: { name: battlescope-config }
```

---

## 7. GitHub & CI/CD Integration

### GitHub Repository Layout
```
/battlescope/
  packages/
    api/
    ingest/
    clusterer/
    shared/
  infra/
    helm/
    k8s/
```

### GitHub Actions Workflow
`.github/workflows/ci.yml`
```yaml
name: CI/CD

on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 8 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test

      - name: Build and push Docker images
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}-api:${{ github.sha }}

      - name: Deploy to Kubernetes
        uses: azure/k8s-deploy@v4
        with:
          manifests: |
            infra/k8s/api-deployment.yaml
            infra/k8s/ingest-deployment.yaml
          images: |
            ghcr.io/${{ github.repository }}-api:${{ github.sha }}
          namespace: battlescope
```

---

## 8. Observability & Ops

- **Metrics:** OpenTelemetry → Prometheus
- **Logs:** Pino JSON → Loki
- **Dashboards:** Grafana (API latency, ingestion rate, cluster size)
- **Health Checks:** `/healthz` endpoint for readiness/liveness probes
- **Auto-scaling:** HPA on CPU 60% target
- **Backups:** Managed PostgreSQL snapshots
- **Rolling Updates:** Kubernetes rolling deployments
- **Security:** TLS via cert-manager, API rate limiting via Fastify

---

## 9. Local Development

- Docker Compose for Postgres and Redis
- PNPM for local monorepo management
- Commands:
  ```bash
  pnpm dev          # start API locally
  pnpm ingest:start # run ingestion service
  pnpm db:migrate   # apply migrations
  ```

---

## 10. MVP Acceptance Criteria

- [ ] Ingest zKillboard data (references only)
- [ ] Cluster kills into battles
- [ ] Compute totals and metadata
- [ ] Expose REST API with filters
- [ ] Deploy via GitHub Actions to Kubernetes
- [ ] Instrument metrics and health checks
