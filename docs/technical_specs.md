# BattleScope Technical Specification (v3)

**Last Updated**: 2025-11-07

---

## 1. Technology Stack

- **Language:** TypeScript (Node.js 20 LTS)
- **Frameworks:**
  - **API:** Fastify (HTTP), Zod (validation), OpenAPI generator (typed client)
  - **Workers:** Bare Node.js or BullMQ (for background queues)
  - **Frontend:** React 18 + Vite SPA consuming typed clients from `@battlescope/shared`
- **Database:** PostgreSQL 15
- **Cache/Queue:** Redis 7 (BullMQ, cache, sessions)
- **Containerization:** Docker (multi-stage build)
- **Orchestration:** Kubernetes 1.27+
- **Ingress:** NGINX Ingress Controller
- **TLS:** cert-manager with Let's Encrypt
- **Observability:** Prometheus, Grafana, Loki, OpenTelemetry
- **Secrets Management:** Kubernetes Secrets (optionally backed by KMS)
- **CI/CD:** GitHub Actions for build, test, and deploy
- **Repository:** GitHub Monorepo (PNPM workspaces for shared types and feature packages)
- **Authentication:** EVE Online SSO (OAuth2/OIDC)
- **Authorization:** Feature-scoped RBAC (roles: user, fc, director, admin, superadmin)

---

## 2. Architecture Overview

### 2.1 Feature-Based Package Structure

BattleScope uses a modular architecture where each feature is a separate package with its own business logic:

```
backend/
├── api/                    # Fastify API service (routes, middleware)
├── ingest/                 # Killmail ingestion from zKillboard
├── enrichment/             # Killmail enrichment worker
├── database/               # Shared database client and schema
├── shared/                 # Shared types and utilities
├── battle-reports/         # Battle Reports feature package
│   ├── src/
│   │   ├── clustering/     # Clustering algorithm
│   │   ├── repositories/   # Data access
│   │   └── services/       # Business logic
│   └── package.json
└── battle-intel/           # Battle Intel feature package
    ├── src/
    │   ├── aggregators/    # Statistics computation
    │   ├── analyzers/      # Intelligence analysis
    │   ├── repositories/   # Data access
    │   └── services/       # Business logic
    └── package.json
```

**Key Principles**:

- **Separation of Concerns**: Each feature has its own package boundary
- **Dependency Direction**: Features depend on `@battlescope/database` and `@battlescope/shared`, not on each other
- **API Integration**: API service imports and registers routes from feature packages
- **Shared Infrastructure**: Common services (ingestion, enrichment, database) are shared across features

---

### 2.2 Service Architecture (Kubernetes-native)

| Service          | Type       | Responsibility                                               | Features                           |
| ---------------- | ---------- | ------------------------------------------------------------ | ---------------------------------- |
| **api**          | Deployment | Expose REST API with feature-scoped authorization            | Battle Reports, Battle Intel, Auth |
| **ingest**       | Deployment | Pull killmail data from zKillboard RedisQ                    | Shared                             |
| **enrichment**   | Deployment | Enrich killmails with full payload from zKillboard           | Shared                             |
| **clusterer**    | Deployment | Group kills into battles (Battle Reports feature logic)      | Battle Reports                     |
| **intel-worker** | CronJob    | Compute intelligence statistics (Battle Intel feature logic) | Battle Intel                       |
| **db**           | Stateful   | PostgreSQL (persistent)                                      | Shared                             |
| **redis**        | Stateful   | Cache, queue, sessions                                       | Shared                             |
| **frontend**     | Deployment | React/Vite UI with feature-based rendering                   | All                                |

Each service runs as its own Deployment with a ConfigMap for parameters and Secrets for credentials.

---

### 2.3 Frontend Architecture

The frontend adapts based on user's feature access:

- **Home:** Displays battle reports preview (if has `battle-reports` access) or intel summary (if has `battle-intel` access)
- **Battles:** Battle list and detail views (requires `battle-reports` access)
- **Recent Kills:** Live killmail feed (requires `battle-reports` access)
- **Intel Pages:** Alliance/Corp/Character intelligence (requires `battle-intel` access)
- **Entity Pages:** Composite view showing available sections based on feature access
- **Profile:** User account management, character linking, role viewing
- **Shared Types:** Consumes generated clients from `@battlescope/shared`
- **Authentication:** EVE Online SSO with HTTP-only secure cookies

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
    if (!cluster.length) {
      cluster.push(k);
      continue;
    }
    const contiguous = k.ts - cluster.at(-1)!.ts <= GAP_MAX;
    const correlated = overlaps(cluster, k);
    if (contiguous || correlated) cluster.push(k);
    else {
      flush(cluster);
      cluster = [k];
    }
  }
  flush(cluster);
}
```

---

## 5. API Endpoints & Authorization

### 5.1 Feature-Based Route Registration

Routes are registered in the API service from feature packages:

```typescript
// backend/api/src/server.ts
import { registerBattleReportsRoutes } from './routes/battle-reports.js';
import { registerBattleIntelRoutes } from './routes/battle-intel.js';
import { registerAuthRoutes } from './routes/auth.js';

export const buildServer = (options) => {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  // Core routes
  registerAuthRoutes(app, ...);
  app.get('/healthz', async () => ({ status: 'ok' }));

  // Feature routes (with authorization middleware)
  registerBattleReportsRoutes(app, ...);
  registerBattleIntelRoutes(app, ...);

  return app;
};
```

---

### 5.2 Authorization Middleware

All feature routes use authorization middleware:

```typescript
app.get('/battles', {
  preHandler: [
    authMiddleware, // Validates session, attaches request.account
    requireFeatureRole('battle-reports', 'user'), // Checks feature access
  ],
  handler: async (request, reply) => {
    /* ... */
  },
});
```

**Authorization Levels**:

- `user` (rank 10): View content
- `fc` (rank 20): Create content
- `director` (rank 30): Edit any content, manage settings
- `admin` (rank 40): Manage roles, block users
- `superadmin` (global): Bypass all checks

---

### 5.3 API Route Summary

**Authentication Routes** (No authorization required):

- `GET /auth/login` - Initiate EVE SSO login
- `GET /auth/callback` - OAuth callback handler
- `GET /me` - Get current user (requires auth)
- `POST /auth/logout` - Logout (requires auth)
- `GET /healthz` - Health probe

**Battle Reports Routes** (Requires `battle-reports` access):

- `GET /battles` - List battles with filters
- `GET /battles/{id}` - Get battle details
- `GET /killmails/recent` - Recent killmails feed
- `GET /killmails/stream` - SSE stream of killmails

**Battle Intel Routes** (Requires `battle-intel` access):

- `GET /intel/summary` - Global intelligence summary
- `GET /intel/alliances/{id}` - Alliance intelligence
- `GET /intel/corporations/{id}` - Corporation intelligence
- `GET /intel/characters/{id}` - Character intelligence
- `GET /intel/alliances/{id}/opponents` - Opponent analysis
- `GET /intel/alliances/{id}/ships` - Ship usage analysis

**Admin Routes** (Requires `admin` role):

- `GET /admin/accounts` - List accounts
- `POST /admin/accounts/{id}/block` - Block account
- `PUT /admin/accounts/{id}/feature-roles` - Assign roles

**Complete API documentation**: See feature specs:

- [Battle Reports API](../features/battle-reports-spec.md#5-api-endpoints)
- [Battle Intel API](../features/battle-intel-spec.md#5-api-endpoints)
- [Authentication API](../authenication-authorization-spec/README.md#7-api-surface-fastify-routes)

---

### 5.4 Response Format

All responses are JSON with:

- **Cursor-based pagination** for lists
- **Zod validation** on requests and responses
- **OpenAPI generation** from Zod schemas
- **Entity names** included (not just IDs)
- **IDs as strings** (bigint support)

---

### 5.5 SSE Streaming

Battle Reports provides a Server-Sent Events stream for real-time killmails:

- **Protocol**: `text/event-stream`
- **Endpoint**: `GET /killmails/stream?space_type={type}`
- **Authorization**: Requires `battle-reports` feature access
- **Event types**: `killmail`, `heartbeat`
- **Fallback**: UI polls `GET /killmails/recent` if stream fails

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
/battle-monitor/
  backend/
    api/                  # Fastify API service
    ingest/               # Killmail ingestion
    enrichment/           # Killmail enrichment worker
    database/             # Shared database client
    shared/               # Shared types and utilities
    battle-reports/       # Battle Reports feature package
    battle-intel/         # Battle Intel feature package
  frontend/               # React/Vite UI
  docs/                   # Documentation
    features/
      battle-reports-spec.md
      battle-intel-spec.md
    authenication-authorization-spec/
    product_specs.md
    technical_specs.md
  infra/
    k8s/                  # Kubernetes manifests
  .github/
    workflows/            # GitHub Actions
  pnpm-workspace.yaml     # PNPM workspace config
  package.json            # Root package
```

**PNPM Workspace Configuration** (`pnpm-workspace.yaml`):

```yaml
packages:
  - 'backend/*'
  - 'frontend'
```

**Package Dependencies**:

```
@battlescope/api
  ├─→ @battlescope/database
  ├─→ @battlescope/shared
  ├─→ @battlescope/battle-reports
  └─→ @battlescope/battle-intel

@battlescope/battle-reports
  ├─→ @battlescope/database
  └─→ @battlescope/shared

@battlescope/battle-intel
  ├─→ @battlescope/database
  └─→ @battlescope/shared
  └─→ @battlescope/battle-reports (read-only for data access)

@battlescope/ingest
  └─→ @battlescope/database

@battlescope/enrichment
  └─→ @battlescope/database
```

### GitHub Actions Workflow

`.github/workflows/ci.yml`

```yaml
name: CI/CD

on:
  push:
    branches: [main]
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
- Images are published as multi-arch manifests covering `linux/amd64` and `linux/arm64` via Buildx + QEMU, so both x86 and Apple/Graviton nodes run the same tags.

---

## 8. Observability & Ops

### 8.1 Logging Standards

**All application logs MUST include the originating file and package information:**

```typescript
// Example log entry
{
  "level": 30,
  "time": 1762707623232,
  "pid": 66800,
  "hostname": "api-6867c7fd4-8689s",
  "file": "backend/api/src/routes/auth.ts",      // ✅ REQUIRED: Source file path
  "package": "api",                               // ✅ REQUIRED: Package name
  "caller": "exchangeCodeForToken",               // ✅ REQUIRED: Function/method name
  "msg": "Token exchange successful",
  "characterId": 12345678
}
```

**Requirements:**

- ✅ **`file`**: Relative path from project root (e.g., `backend/api/src/routes/auth.ts`)
- ✅ **`package`**: Package name derived from path (e.g., `api`, `ingest`, `auth`, `database`)
- ✅ **`caller`**: Function or method name that invoked the log (when available)
- ✅ Automatic capture via Pino mixin - no manual logging required

**Implementation:**

```typescript
// All services use createLoggerConfig() from @battlescope/shared
import { createLoggerConfig } from '@battlescope/shared';
import Fastify from 'fastify';

const app = Fastify({ logger: createLoggerConfig() });

// Logs automatically include file, package, and caller
app.log.info('Server starting'); // ✅ Automatic context
request.log.error({ error }, 'Request failed'); // ✅ Automatic context
```

**Package Detection:**

- `backend/api/**` → `api`
- `backend/ingest/**` → `ingest`
- `backend/enrichment/**` → `enrichment`
- `backend/clusterer/**` → `clusterer`
- `backend/scheduler/**` → `scheduler`
- `packages/auth/**` → `auth`
- `packages/database/**` → `database`
- `packages/esi-client/**` → `esi-client`
- `packages/battle-reports/**` → `battle-reports`
- `packages/battle-intel/**` → `battle-intel`
- `packages/shared/**` → `shared`

**Log Collection Pipeline:**

```
Application (Pino) → stdout → Promtail → Loki → Grafana
                                  ↓
                          Extracts: file, package, caller
                                  ↓
                          Labels for filtering
```

**Querying Logs in Grafana:**

```logql
# All logs from a specific file
{file="backend/api/src/routes/auth.ts"}

# All logs from a package
{package="auth"}

# Error logs from database package
{package="database"} | json | level >= 50

# All route handlers
{file=~".*routes/.*"}
```

### 8.2 Metrics & Tracing

- **Metrics:** OpenTelemetry → Prometheus
- **Logs:** Pino JSON → Promtail → Loki → Grafana
- **Traces:** OpenTelemetry → OTEL Collector → Jaeger
- **Log-Trace Correlation:** Trace IDs in logs link to Jaeger spans
- **Dashboards:** Grafana (API latency, ingestion rate, cluster size, logs)

### 8.3 Operations

- **Health Checks:** `/healthz` endpoint for readiness/liveness probes
- **Auto-scaling:** HPA on CPU 60% target
- **Backups:** Managed PostgreSQL snapshots
- **Rolling Updates:** Kubernetes rolling deployments
- **Security:** TLS via cert-manager, API rate limiting via Fastify
- **Log Retention:** 1 hour (configurable in Loki)

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

### Core Platform

- [ ] EVE Online SSO authentication with multi-character support
- [ ] Feature-scoped RBAC (roles: user, fc, director, admin, superadmin)
- [ ] Authorization middleware protecting all feature routes
- [ ] User profile page with character management
- [ ] Graceful UI degradation based on feature access

### Battle Reports Feature

- [ ] Ingest zKillboard data (killmail references only)
- [ ] Enrich killmails with full payload from zKillboard
- [ ] Cluster kills into battles via sliding window algorithm
- [ ] Compute battle metadata (start/end time, ISK destroyed, participants)
- [ ] Battle list API with filtering (space type, time, entities)
- [ ] Battle detail API with killmails and participants
- [ ] Real-time killmail feed via Server-Sent Events
- [ ] Recent killmails polling endpoint as fallback

### Battle Intel Feature

- [ ] Compute alliance/corporation/character statistics
- [ ] Opponent analysis (who fights whom)
- [ ] Ship composition analysis
- [ ] Geographic activity heatmaps
- [ ] Intelligence summary API for homepage
- [ ] Entity intelligence pages (alliance, corp, character)
- [ ] Caching strategy for computed statistics

### Infrastructure

- [ ] Deploy via GitHub Actions to Kubernetes
- [ ] Instrument metrics and health checks
- [ ] OpenTelemetry tracing across all services
- [ ] Pino structured logging with file/package/caller context (via @battlescope/shared)
- [ ] Loki log aggregation with 1-hour retention
- [ ] Promtail log collection from all pods
- [ ] Redis caching for sessions and statistics
- [ ] PostgreSQL with proper indexes and constraints

### Frontend

- [ ] Home page with feature-based content
- [ ] Battles page (Battle Reports feature)
- [ ] Recent Kills page with SSE stream (Battle Reports feature)
- [ ] Intel pages for entities (Battle Intel feature)
- [ ] Entity pages with composite views based on access
- [ ] User profile with character management
- [ ] Header navigation adapts to feature access
