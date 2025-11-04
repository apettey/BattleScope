# Linear Project & Issues

## Project: BattleScope MVP Product Features
- **Linear URL:** https://linear.app/battlescope/project/battlescope-mvp-product-features-8b57df0a742a
- **Summary:** Deliver the core BattleScope MVP product capabilities outlined in `docs/product_specs.md` while adhering to the technical foundations in `docs/technical_specs.md`.
- **Product Focus Areas:** Battle Reconstruction, Reference-First Storage, Queryable Metadata, Efficient Enrichment, Publicly Verifiable Insights, Frontend Operational Awareness.

## Linked Issues

- **BAT-5 – Implement battle reconstruction ingestion and clustering pipeline**
  - Product scope: Docs §§2 & 6 (F1, F2, F10) to automatically build battle entities from killmails.
  - Technical anchors: `docs/technical_specs.md` §§2-4 for ingest/clusterer services, clustering algorithm parameters, Kubernetes deployments, OTEL instrumentation.
  - Acceptance highlights: RedisQ ingestion deduplication, clustering window logic, `/healthz` coverage, OTEL metrics.

- **BAT-6 – Establish reference-first storage schema and persistence layer**
  - Product scope: Docs §§2 & 5 for minimal metadata storage and battle composition.
  - Technical anchors: `docs/technical_specs.md` §3 schema definitions, migration workflow, shared TypeScript models, Postgres deployment guidance.
  - Acceptance highlights: Versioned migrations, idempotent persistence, OTEL DB metrics, documented configuration.

- **BAT-7 – Expose queryable metadata API for battles**
  - Product scope: Docs §§2, 6 & 8 for filtering by alliance/corp/character/system/space type and detailed battle payloads.
  - Technical anchors: `docs/technical_specs.md` §§1, 2 & 5 covering Fastify API, Zod validation, OpenAPI generation, Kubernetes deployment updates.
  - Acceptance highlights: Contract-tested filters, `/healthz` behaviour, published OpenAPI schema, shared client/types.

- **BAT-8 – Build on-demand killmail enrichment workflow**
  - Product scope: Docs §§2, 4.1 & 10 emphasizing lazy enrichment without bloating storage.
  - Technical anchors: `docs/technical_specs.md` §§1-2 & §8 for worker patterns, queue/cache usage, observability expectations.
  - Acceptance highlights: Queue resiliency, rate-limited fetches, enrichment status surfacing, `/healthz` checks for external APIs.

- **BAT-9 – Guarantee publicly verifiable battle references**
  - Product scope: Docs §§2, 4, 5 & 7 ensuring canonical zKillboard/ESI linkage.
  - Technical anchors: `docs/technical_specs.md` §5 and observability guidelines for URL generation, validation, and telemetry.
  - Acceptance highlights: Deterministic URL utilities, contract tests guarding references, observability alerts for missing links, frontend fixture alignment.

- **BAT-10 – Surface operational dashboard metrics on the home view**
  - Product scope: Docs §§2, 3 & 6 (Goal 6, F11) outlining homepage statistics for battle counts and alliance/corp activity.
  - Technical anchors: `docs/technical_specs.md` §§1-2 & 5 describing the frontend deployment, dashboard repository, and summary endpoint.
  - Acceptance highlights: `/stats/summary` API with aggregation tests, React home view with auto-refresh, shared DTO usage, linted frontend tests.

- **BAT-11 – Stream recent killmails by space type**
  - Product scope: Docs §§3 & 6 (F12) detailing the Recent Kills experience and streaming behaviour.
  - Technical anchors: `docs/technical_specs.md` §§2 & 5 for SSE endpoint design, killmail repository helpers, and frontend client wiring.
  - Acceptance highlights: `/killmails/stream` SSE with polling fallback, filtered recent feed API, React grouping by space type, contract/unit tests.

- **BAT-12 – Provide self-service ruleset management**
  - Product scope: Docs §§3 & 6 (F13) and new ruleset concept supporting tracked alliances/corps and minimum pilot thresholds.
  - Technical anchors: `docs/technical_specs.md` §§3 & 5 adding the `rulesets` table, repository, validation, and frontend form flows.
  - Acceptance highlights: Versioned migration, Zod schemas, Fastify GET/PUT routes with audit metadata, React form with optimistic updates and tests.
