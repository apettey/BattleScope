# BattleScope Technical Specification (v1)

## 1. Technology Stack

- **Language:** TypeScript (Node.js 20 LTS)
- **Frameworks:**
  - **API:** Fastify (HTTP), Zod (validation), OpenAPI generator (typed client)
  - **Workers:** Bare Node.js or BullMQ (for background queues)
  - **Frontend:** React 18 + Vite SPA consuming typed clients from `@battlescope/shared`
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
| **frontend** | Deployment | React/Vite UI for statistics, real-time kill feed, and rules configuration |

Each service runs as its own Deployment with a ConfigMap for parameters and Secrets for credentials.

### Frontend Client

- **Home:** Displays total battle reports, recent battle delta, and top alliances/corps derived from the aggregated stats endpoint.
- **Recent Kills:** Streams killmail summaries partitioned by space type (kspace, jspace, pochven) over Server-Sent Events with automatic reconnection and a timed polling fallback.
- **Rules:** Presents form controls for minimum pilot thresholds, tracked alliance/corp allowlists, and ignore-unlisted toggles; persists through ruleset APIs with optimistic UI feedback.
- **Shared Types:** Consumes generated clients from `@battlescope/shared` to stay aligned with backend schemas.
- **Authentication:** Deliberately deferred—UI must signal that access is currently open and that login will arrive in the next iteration.

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

**rulesets**
- `id` (uuid, pk)
- `min_pilots` (int, default configurable via env)
- `tracked_alliance_ids` (int[] nullable)
- `tracked_corp_ids` (int[] nullable)
- `ignore_unlisted` (bool, default false)
- `created_at`, `updated_at` (timestamptz)
- `updated_by` (text, optional human identifier until auth lands)

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
| `GET /stats/summary` | Aggregated totals for battles, alliances, and corporations powering the homepage |
| `GET /killmails/recent` | Pollable recent killmail list filtered by space type |
| `GET /killmails/stream` | Server-Sent Events stream pushing killmail summaries by space type |
| `GET /rulesets/current` | Fetch the active ruleset controlling ingestion focus and UI defaults |
| `PUT /rulesets/current` | Update the ruleset (validated via Zod, audited for future auth) |
| `GET /healthz` | Health probe |

All responses are JSON with cursor-based pagination.  
Schemas validated via Zod and auto-exported to OpenAPI.

### Streaming Endpoint

- Protocol: Server-Sent Events under `text/event-stream` with retry hints.
- Message payload: compact killmail summary (`killmail_id`, `space_type`, `timestamp`, tracked alliance/corp hits).
- Filters: query params `space_type` (multi-value) and optional `tracked_only=true` to respect active ruleset.
- Fallback: UI should downgrade to `GET /killmails/recent` if the stream disconnects repeatedly.

### Ruleset API Notes

- Requests must pass schema validation (min pilots ≥ 1, allowlists capped to 250 entries each).
- Until authentication is shipped, write operations remain unauthenticated but must surface clear UI warnings and produce structured audit logs for every change.
- Persist audit metadata (timestamp, client tag, diff) so future RBAC can reference historical changes.

---

## 6. Kubernetes Manifests Overview

### Namespace
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: battlescope
```
 
### Deployments & Stateful Workloads
- `k8s/deployments.yaml` captures every controller that runs pods. Draft replicas stay minimal (two for user-facing API/frontend, one for workers) so we can validate scheduling pressure before scaling up.
- Stateful services (Postgres, Redis) sit in the same file while we prototype. This keeps storage plumbing visible next to the consumers and avoids introducing Helm or Kustomize before we prove the baseline cluster boot.
- Readiness and liveness probes are wired to `/healthz` so our OTEL + probe checks stay aligned from the first deploy.
- Images reference `docker.io/petdog/battlescope-*` tags (defaulting to `:latest`) until CI publishes signed digests; pinning is called out with inline TODOs to make the follow-up obvious.

### Services
- `k8s/services.yaml` exposes ClusterIP endpoints per workload so internal callers stay decoupled from pod DNS and we can bolt on an Ingress later without rewriting manifests.
- Ports normalise on `:80` for HTTP services and native ports for stateful dependencies to simplify ConfigMap/Secret wiring when we add them.

### Secrets
- `k8s/secrets.yaml` declares placeholder `Secret` objects for every component with `stringData` keys mapped to environment variables so we can inject values at apply time.
- Operators export the required variables (for example `export API_DATABASE_URL=...`) and run `envsubst < k8s/secrets.yaml | kubectl apply -f -`, keeping sensitive values out of git while preserving the contract in code review.
- The same approach works for CI pipelines or SOPS decrypt hooks because we only rely on standard shell expansion.

### Why this layout
- Keeping manifests grouped by resource type (`deployments`, `services`, `secrets`) shortens the feedback loop while we iterate in the monorepo-driven workflow and mirrors how we discuss responsibilities across teams.
- Drafting everything in plain YAML ensures GitHub Actions and Ops tooling can consume the same source without templating indirection—once the spec stabilises we can promote these files into Helm charts inside `infra/`.
- Documented probes, resources, and namespace scoping establish the guardrails we expect in production, preventing rework when observability policies land.

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
- **DockerHub publishing:** the `publish-images` job (main branch only) builds the `api`, `ingest`, `clusterer`, and `scheduler` containers from the shared `Dockerfile`, tagging each as `${GITHUB_SHA}` and `latest` under `docker.io/<DOCKERHUB_USERNAME>/battlescope-<service>`. Configure repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` with your Docker Hub credentials before enabling deploys.

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
