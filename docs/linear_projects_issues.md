# Linear Project & Issues

## Project: BattleScope MVP Product Features
- **Linear URL:** https://linear.app/battlescope/project/battlescope-mvp-product-features-8b57df0a742a
- **Summary:** Deliver the core BattleScope MVP product capabilities outlined in `docs/product_specs.md` while adhering to the technical foundations in `docs/technical_specs.md`.
- **Product Focus Areas:** Battle Reconstruction, Reference-First Storage, Queryable Metadata, Efficient Enrichment, Publicly Verifiable Insights.

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

