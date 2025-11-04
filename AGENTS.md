# BattleScope Agents Specification

## 1. Overview

BattleScope will leverage **AI coding and operations agents** to accelerate development, automate routine tasks, and maintain high engineering standards across all services.

These agents are designed to function similarly to *Claude Code* or *GitHub Copilot Workspace*, but implemented via **OpenAI’s GPT-5** models, **MCP connectors**, and **GitHub Actions** workflows.

They are fully integrated into our **Kubernetes-first**, **TypeScript-based** stack and operate with **least privilege** principles.

All application code lives in a single repository, with the React frontend under `/frontend` and backend services under `/backend`.

---

## 2. Agent Types

| Agent | Purpose | Primary Tools | Deployment Context |
|--------|----------|----------------|--------------------|
| **Code Agent** | Pro-level code generation, refactoring, documentation, and review | GPT-5 + MCP (filesystem, GitHub, shell) | Developer-facing (CLI or ChatGPT Developer Mode) |
| **Ops Agent** | CI/CD pipeline integration, deployment automation, Helm updates | GPT-5 + GitHub Actions + K8s API | Runs within GitHub Actions |
| **Data Agent (future)** | Data ingestion and anomaly detection in killmail feeds | GPT-5 + Postgres + RedisQ + Prometheus | Runs as a scheduled job |
| **Analysis Agent (future)** | Battle pattern analytics and doctrine inference | GPT-5 + internal data API | Cloud job or offline worker |

---

## 3. Code Agent Specification

### 3.1 Role Definition

> “You are a Staff+ level TypeScript and infrastructure engineer working on the BattleScope project.
> You produce production-quality, secure, and tested code.
> Your changes must follow existing coding standards, linting rules, and CI policies.
> Output minimal diffs before rewriting full files. Ask clarifying questions only when requirements are ambiguous.”

### 3.2 Capabilities
- **Language model:** GPT-5
- **Tools:**
  - `code_interpreter` (for sandboxed execution)
  - Remote **MCP connectors**:
    - `fs.read` / `fs.write` (scoped to repo)
    - `git.commit`, `git.push`, `git.branch`
    - `shell.run` (non-destructive commands)
- **Tasks:**
  - Implement features in `/packages/*`
  - Edit Helm/K8s manifests under `/infra/`
  - Maintain `pnpm` workspace configuration
  - Generate docstrings and Markdown documentation
  - Review PRs and provide inline comments
  - Maintain the React-based frontend housed in `/frontend`
  - Maintain backend services and workers grouped under `/backend`, keeping the single-repo architecture cohesive

### 3.3 Policies
- Never commit directly to `main`; always use feature branches.
- Always propose a patch (diff) before applying file edits.
- Include tests for new modules and utilities.
- Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Validate code against ESLint and Prettier.
- Run `make ci` after applying changes and confirm it passes so the pipeline stays green.
- **OpenAPI Specification Updates**: Whenever API routes, schemas, or request/response types change in `backend/api`, regenerate the OpenAPI specification by running `make generate-openapi` and commit the updated spec files (`docs/openapi.json` and `docs/openapi-generated.yaml`) in the same changeset to maintain API documentation accuracy.

### 3.4 Testability
- **Backend coverage first:** treat backend modules as critical path and require unit and integration tests that cover happy paths, edge cases, and failure handling before merging.
- **Contract tests for frontend-facing APIs:** every API that drives the frontend must ship with contract tests that lock down request/response schemas to guarantee compatibility while the frontend lacks direct tests.
- **Frontend deferral:** defer comprehensive UI test suites until the MVP search/traversal flows stabilize, but maintain lightweight smoke checks backed by API contract fixtures to catch broken builds quickly.
- **Regression safeguards:** when backend changes alter API shape or behaviour, update the contract tests in the same change set to prevent accidental regressions.

### 3.5 Schema Stewardship
- **Migration ownership:** when changing the Postgres schema, generate a versioned migration (`pnpm db:migrate:make <name>`) and commit it alongside the code change; never rely on ad-hoc SQL.
- **Local validation:** apply migrations locally (`pnpm db:migrate`) and run the relevant service test suites before submitting a PR to guarantee compatibility.
- **Type synchronization:** update shared TypeScript models (e.g. `/packages/shared`) when schemas evolve, regenerate OpenAPI/Zod bindings as needed, and ensure downstream services compile against the new types.
- **Drift checks:** block merges if migrations are missing or shared types fall out of sync with the database definitions highlighted in the product and technical specs.

### 3.6 Observability Integration
- **OpenTelemetry first:** instrument API, ingest, clusterer, and scheduler services with OpenTelemetry traces, metrics, and logs; use the shared OTEL exporter configuration (`/packages/shared/otel`) rather than bespoke wiring.
- **Semantic conventions:** adopt OTEL semantic attributes for HTTP, database, and queue operations so Prometheus and Grafana dashboards receive consistent labels.
- **Health endpoints:** expose and maintain `/healthz` for readiness/liveness probes across all services, including dependency checks (database, Redis, external APIs) with deterministic status codes.
- **Guardrails:** add tests or smoke scripts that fail fast when `/healthz` degrades or when OTEL exporters are misconfigured to prevent silent observability regressions.

### 3.7 Frontend MVP Ownership
- **Scope:** deliver a minimal React UI that enables searching, filtering, and traversing battle data, matching the MVP expectations in the product and technical specs.
- **Styling:** build the MVP with Tailwind CSS, keeping components extremely basic yet usable so the team can iterate quickly without heavy design overhead.
- **Scaffolding:** maintain the React (e.g., Next.js or Remix) frontend workspace inside `/frontend`, wiring shared types and API client generation so UI components consume the same contracts verified by backend tests.
- **Contract-driven mocks:** build fixtures from API contract tests (`/packages/api` snapshots) and expose them to the frontend for local development and smoke testing while the backend evolves.
- **Future test criteria:** define acceptance criteria for promoting the UI from smoke checks to automated component/e2e suites once the search/traversal flows stabilize, and record the plan in `docs/frontend_mvp.md`.

### 3.8 Package Boundaries
- **Repository layout:** keep the React frontend in `/frontend` and all backend services/workers in `/backend`; any additional tooling or infra code should reference these roots explicitly.
- **Published shared libraries:** when functionality must be reused, extract it into a versioned package and publish it to the designated registry; do not depend on unpublished workspace shortcuts so frontend and backend stay loosely coupled.
- **Decoupling:** design shared packages with explicit APIs and semantic versioning so frontend and backend can evolve independently while sharing stable contracts.

### 3.9 Configuration Management
- **Environment variables only:** configure every service via environment variables loaded at runtime; avoid hardcoding secrets or service URLs in code.
- **Documentation by domain:** keep configuration reference files per domain (e.g., `docs/config/otel.md`, `docs/config/grafana.md`, `docs/config/logging.md`, `docs/config/services.md`) detailing required env vars, default values, and sample `.env.example` snippets.
- **Runtime validation:** add schema validation (e.g., Zod) on startup to fail fast when required environment variables are missing or malformed.
- **Local orchestration:** whenever services or dependencies change, update the root `docker-compose.yml` to ensure all components required for local development (databases, Redis, workers, API, frontend) start together with sane defaults.

### 3.10 API Documentation & OpenAPI Workflow
- **Automatic generation:** the OpenAPI 3.1.0 specification is automatically generated from code using `@fastify/swagger` with Zod schemas, ensuring documentation always reflects the actual implementation.
- **Schema-first approach:** all API routes must include schema definitions in their route configuration using Zod schemas from `backend/api/src/schemas.ts` for request/response validation and documentation.
- **Mandatory regeneration:** after any change to API routes, parameters, request bodies, response types, or schemas:
  1. Update or create Zod schemas in `backend/api/src/schemas.ts`
  2. Add/update schema annotations in route handlers (`backend/api/src/routes/*.ts`)
  3. Run `make generate-openapi` to regenerate `docs/openapi.json` and `docs/openapi-generated.yaml`
  4. Commit all changes (code + generated specs) in the same PR
- **CI validation:** the CI pipeline should verify that OpenAPI specs are up-to-date by running generation and checking for uncommitted changes.
- **Documentation location:** 
  - Generated specs: `docs/openapi.json`, `docs/openapi-generated.yaml`
  - Generation guide: `docs/openapi-generation.md`
  - Interactive UI: Available at `/docs` when the API server runs
- **Type safety:** Zod schemas provide both TypeScript types (via inference) and runtime validation, eliminating drift between types and actual request/response handling.
- **Breaking changes:** when making breaking API changes, update the version in `backend/api/src/server.ts` following semantic versioning (major.minor.patch) and document migration steps.

---

## 4. Ops Agent Specification

### 4.1 Role Definition

> “You are a Release and Platform Engineering Agent responsible for deploying, maintaining, and monitoring the BattleScope system in Kubernetes.
> You manage Docker images, Helm charts, GitHub Actions workflows, and monitor deployments.”

### 4.2 Responsibilities
- Trigger GitHub Actions on merges to `main`
- Build and push Docker images for `api`, `ingest`, `clusterer`, and `scheduler` workloads to GHCR
- Apply updated Deployments and CronJobs via Helm or `kubectl apply`, covering API, ingestion, clustering, and scheduled jobs
- Monitor deployment health through `/healthz` endpoints
- Roll back failed releases automatically
- Maintain secrets and ConfigMaps in Kubernetes
- Document image tags and rollout status for traceability across all workloads
- Continuously evaluate CPU and memory utilization of pods and tune Horizontal/Vertical Pod Autoscalers accordingly

### 4.3 GitHub Integration

The Ops Agent relies on the following workflow:

```yaml
# .github/workflows/deploy.yml
name: Build & Deploy BattleScope
on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 8 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push images
        uses: docker/build-push-action@v5
        with:
          context: .
          platforms: linux/arm64
          push: true
          tags: |
            ghcr.io/${{ github.repository }}-api:${{ github.sha }}
            ghcr.io/${{ github.repository }}-clusterer:${{ github.sha }}
            ghcr.io/${{ github.repository }}-ingest:${{ github.sha }}
            ghcr.io/${{ github.repository }}-scheduler:${{ github.sha }}

      - name: Deploy to Kubernetes
        uses: azure/k8s-deploy@v4
        with:
          manifests: |
            infra/k8s/api-deployment.yaml
            infra/k8s/clusterer-deployment.yaml
            infra/k8s/ingest-deployment.yaml
            infra/k8s/scheduler-cronjob.yaml
          images: |
            ghcr.io/${{ github.repository }}-api:${{ github.sha }}
            ghcr.io/${{ github.repository }}-clusterer:${{ github.sha }}
            ghcr.io/${{ github.repository }}-ingest:${{ github.sha }}
            ghcr.io/${{ github.repository }}-scheduler:${{ github.sha }}
          namespace: battlescope

### 4.4 Rollback Procedures
- **Deployments:** use `kubectl rollout undo deployment/<workload>` (api, ingest, clusterer) targeting the last stable revision and monitor until pods report ready.
- **CronJobs:** patch `infra/k8s/scheduler-cronjob.yaml` to the last known-good image tag and reapply; delete any failed Jobs to unblock retries.
- **Image tracking:** maintain a release log mapping Git SHAs to published tags so emergency rollbacks can pin a specific digest.
- **Post-rollback verification:** rerun smoke tests against `/healthz` and critical API endpoints to confirm service recovery.

### 4.5 Observability & Monitoring
- **OpenTelemetry pipeline:** manage the OTEL Collector configuration (`infra/otel/collector.yaml`), ensure exporters forward traces/metrics/logs to Prometheus and Loki, and roll out collector updates in lockstep with service instrumentation changes.
- **Prometheus integration:** maintain scrape configs for all workloads, verify new metrics are discoverable, and configure alert rules for ingestion lag, API latency, `/healthz` failures, and collector outages.
- **Grafana dashboards:** publish and version dashboards (API latency, ingestion throughput, clusterer workload, scheduler success rates) in `infra/grafana/` so they remain reproducible; align panels with Prometheus queries and OTEL semantic labels.
- **Health checks:** wire Kubernetes readiness/liveness probes to `/healthz`, monitor probe failures, and escalate when services exceed agreed error budgets.
- **Resource scaling:** track CPU and memory saturation, adjust HPA/VPA targets before throttling or OOMs occur, and document scaling decisions for future tuning.
- **Documentation:** keep runbooks and on-call guidance in `docs/observability.md` covering dashboard URLs, alert routing, and manual verification steps when instrumentation changes land.
