# BattleScope ESI Client Package Specification

## 1. Summary
- Provide dedicated backend package `@battlescope/esi-client` for communicating with EVE Swagger Interface (ESI) OpenAPI (compatibility date 2025-09-30).
- Deliver generated TypeScript types and strongly typed request helpers covering all ESI endpoints used by BattleScope.
- Instrument all calls with Prometheus metrics and OpenTelemetry spans to track attempt counts, success/error rates, latency, and request metadata.
- Support optional OAuth API token: attach when provided, surface `UnauthorizedAPIToken` error when 401/403 occurs without/with invalid token.
- Power on-demand enrichment flows so user-facing APIs can swap IDs for human-readable names without persisting the enriched data; rely on short-lived Redis-backed response caching to contain ESI load.

## 2. Problem Statement
Existing backend services make ad-hoc HTTP calls without typed contracts or consistent observability. ESI endpoints evolve; lacking generated types risks runtime failures and regressions. Without uniform metrics/tracing, it's difficult to diagnose latency, throttling, or auth issues. We need a reusable client package aligning with BattleScope observability standards and error semantics.

## 3. Goals
- Centralize ESI access behind reusable package consumable by any backend service.
- Generate and ship TypeScript types from ESI OpenAPI (compatibility date 2025-09-30).
- Expose ergonomic client methods with automatic request/response validation.
- Emit Prometheus metrics (`battlescope_esi_requests_total`, `battlescope_esi_request_duration_seconds`) with labels for operation, status class, result, region.
- Emit OpenTelemetry spans per call using shared OTEL configuration.
- Support optional bearer token authentication and surface `UnauthorizedAPIToken` on 401/403 responses.
- Provide robust retry/backoff for transient failures while propagating non-retryable errors.
- Enable on-demand enrichment of alliance/corporation/character metadata at request time with optional Redis caching rather than storing enriched entities in PostgreSQL.
- Deliver testing and CI automation to keep generated types and mocks in sync.

## 4. Non-Goals
- Implement ESI polling schedulers or caching layers (handled by consuming services).
- Model authorization flows or token refresh logic (token acquisition remains external).
- Build frontend bindings (frontend will import typed contracts if needed later).
- Replace service-specific domain logic (package focuses on transport concerns).

## 5. Functional Requirements

### 5.1 Package Layout
- Location: `packages/esi-client`.
- Entry point: `src/index.ts` exporting `createEsiClient`, error classes, and typed request interfaces.
- Generated assets: `src/generated/esi-schema.json` (OpenAPI snapshot) and `src/generated/types.ts`.
- Provide re-export `src/errors.ts` for `UnauthorizedAPIToken` and base `EsiHttpError`.
- Include README documenting usage, env vars, metrics, and tracing behavior.

### 5.2 API Coverage
- Auto-generate types for entire ESI spec (future proof) but expose curated client surface grouped by domain (e.g., `/universe`, `/characters`, `/corporations`).
- Each method should map to OpenAPI `operationId`, ensuring compatibility with `compatibility_date=2025-09-30`.
- Support path/query parameter typing and response validation via Zod schemas generated from OpenAPI (use `openapi-zod-client` or `@anatine/zod-openapi` + `openapi-typescript` as needed).
- Provide fallback generic `request(operationId, params)` for endpoints not yet wrapped.

### 5.3 Type Generation Workflow
- Add scripts:
  - `pnpm esi:download-openapi` -> fetch `https://esi.evetech.net/meta/openapi.yaml?compatibility_date=2025-09-30` to `packages/esi-client/openapi/openapi.yaml`.
  - `pnpm esi:generate-types` -> run `openapi-typescript openapi/openapi.yaml --output src/generated/types.ts`.
  - `pnpm esi:generate-schemas` -> convert to Zod schema for runtime validation (fails CI if generation differs).
- Enforce generated files committed and included in linting. Add CI check to ensure `git diff` clean after generation.

### 5.4 HTTP Client Implementation
- Base URL default: `https://esi.evetech.net/latest`.
- Append `?datasource=tranquility&compatibility_date=2025-09-30` to all requests (use URL builder).
- Underlying transport: `undici` (Node 20 native), wrapped by `@battlescope/shared/http` utilities if available.
- Provide configurable timeout (default 10s) and concurrency limiter.
- Support conditional decompression, Accept/Content-Type `application/json`.

### 5.5 Authentication Flow
- Client accepts optional `getAccessToken(): Promise<string | undefined>` in config.
- Include `Authorization: Bearer <token>` header when token present.
- On 401/403 responses:
  - Throw `UnauthorizedAPIToken` with context (operationId, endpoint, correlationId).
  - Do not retry (mark as permanent failure).
- Surface remaining errors via `EsiHttpError` containing status, response body, operationId, spanId for logging.

### 5.6 On-Demand Enrichment Use Cases
- Primary consumer scenario: REST endpoints enrich stored killmail/battle records by resolving identifiers (alliances, corporations, characters, systems, item types) into display names when users request data.
- Package must provide helper methods (`resolveAllianceName`, `resolveCorporation`, etc.) that wrap the generic client and normalize downstream DTOs.
- Responses should never be persisted to PostgreSQL; instead, consumers rely on Redis as a shared HTTP response cache (default TTL 300 seconds) for public, unauthenticated ESI endpoints where caching is safe.
- Authenticated or token-sensitive endpoints must bypass shared caching to avoid leaking scoped data or returning stale authorization-dependent payloads.
- Include optional Redis cache adapter interface so services can plug in their existing Redis clients; fallback to in-memory LRU for local development.
- Cache key format: `esi:<operationId>:<hash(params)>`; include metadata about expiry and last fetch.
- Expose cache hit/miss counts as Prometheus metrics (`battlescope_esi_cache_hits_total`, `battlescope_esi_cache_misses_total`).

## 6. Observability

### 6.1 Prometheus Metrics
- Use `@battlescope/shared/otel/metrics` registry:
  - Counter `battlescope_esi_requests_total` with labels `{operation, http_method, status_class, result, retry}`.
  - Histogram `battlescope_esi_request_duration_seconds` (buckets: 0.1,0.25,0.5,1,2,5,10) with labels `{operation, http_method, result}`.
- Increment counters before request (status `pending`), finalize after completion with success/error flag.
- Ensure metrics registered once (use singleton registry guard).
- Cache metrics:
  - Counter `battlescope_esi_cache_hits_total` and `battlescope_esi_cache_misses_total` with labels `{operation}`.
  - Counter `battlescope_esi_cache_degraded_total` increments when Redis unavailable and client falls back to in-memory mode.

### 6.2 OpenTelemetry Tracing
- Use shared tracer `@battlescope/shared/otel/tracing`.
- Span naming: `esi.<operationId>`; parent to caller span.
- Inject attributes:
  - `http.method`, `http.url`, `http.status_code`
  - `esi.operation_id`, `esi.compatibility_date`, `esi.datasource`
  - `net.peer.name` (esi.evetech.net)
- Record duration via span end; set span status to error with code/message when request fails.
- Propagate trace context through retries; annotate attempts with event `retry` including delay and reason.

## 7. Configuration
- `ESI_BASE_URL` (default `https://esi.evetech.net/latest`).
- `ESI_TIMEOUT_MS` (default 10000).
- `ESI_MAX_RETRIES` (default 2) with exponential backoff (250ms * 2^attempt).
- `ESI_PROMETHEUS_PREFIX` (optional) for multi-tenant metrics separation.
- `ESI_REDIS_CACHE_URL` (optional) to enable cross-service caching; absence falls back to in-memory cache with short TTL.
- `ESI_CACHE_TTL_SECONDS` (default 300) controlling Redis/in-memory cache expiry for enrichment responses.
- Validate env via Zod schema when client constructed.
- Document config in `docs/config/services.md` after implementation.

## 8. Resilience
- Retry policy: retry on 429, 500-504 with jittered backoff; respect `Retry-After` header.
- Circuit breaker: optional degrade mode toggled via config to prevent flooding (open after N consecutive failures).
- Rate limit headers: capture `x-esi-error-limit-*` values and expose via metrics/gauges.
- Cache resilience: detect Redis outages and automatically fall back to in-memory cache with warning log + metric (`battlescope_esi_cache_degraded_total`).

## 9. Error Semantics
- `UnauthorizedAPIToken extends Error` with fields `operationId`, `statusCode`, `requestedUrl`.
- `EsiHttpError extends Error` for non-2xx responses, carrying parsed error body and classification.
- Distinguish `ValidationError` when response fails schema validation; log and throw to caller.

## 10. Testing Strategy
- Unit tests using Vitest covering:
  - Header construction with/without tokens.
  - Retry/backoff logic (mock undici).
  - Metrics/trace emission (use in-memory exporter).
- Contract tests:
  - Validate generated Zod schemas against fixture responses captured from production (store sanitized JSON under `packages/esi-client/tests/fixtures`).
  - Use `pnpm esi:record <operationId>` script to record responses via configurable `ESI_RECORD_TOKEN`.
- Integration smoke test hitting live ESI (skipped in CI, run in nightly workflow) verifying compatibility date and instrumentation wiring.
- Snapshot tests ensuring generated types match expected (fail if OpenAPI spec changes).

## 11. Tooling & CI
- Update `pnpm-workspace.yaml` to include `packages/esi-client`.
- Add lint/test targets to `Makefile` and `make ci`.
- Extend GitHub Actions to run `pnpm esi:generate-types` and `pnpm --filter esi-client test`.
- Add changeset entry for publishing when package reaches v0.1.0.

## 12. Rollout Plan
1. Scaffold package with boilerplate and generation scripts.
2. Implement client core, metrics, tracing, error classes.
3. Land unit tests and contract fixtures.
4. Implement Redis cache adapter and document integration guidelines.
5. Wire package into first consumer (likely `backend/api` service) replacing existing ESI calls, updating endpoints to resolve identifiers on read.
6. Update docs/config to include new env vars.
7. Monitor metrics post-deploy; add dashboards for request volume, latency, unauthorized errors, cache hit ratio.
8. Iterate on additional domain-specific helper methods as consumption expands.

## 13. Open Questions
- Which services are first adopters (api vs. ingest)? Need alignment with service teams.
- Do we require caching or coalescing for high-frequency endpoints (e.g., universe static data)?
- Should we export typed WebSocket/SSE clients if ESI introduces them? Not in scope but monitor roadmap.
- Confirm whether to support proxy configuration for ESI (corporate network constraints).
