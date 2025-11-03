# Service Configuration Overview

## Database

The persistence layer relies on PostgreSQL 15. Configure one of the following environment setups for local development and production:

- `DATABASE_URL`: Full connection string including credentials and optional SSL parameters.
- or granular settings:
  - `POSTGRES_HOST` (required)
  - `POSTGRES_PORT` (defaults to `5432`)
  - `POSTGRES_DB` (required)
  - `POSTGRES_USER` (required)
  - `POSTGRES_PASSWORD` (optional if peer auth is enabled)
- `POSTGRES_SSL` (`true` / `false`, default `false`)

Environment variables are validated on startup via Zod; missing required values will prevent services from booting. Apply migrations with `pnpm db:migrate` after updating configuration.

## Ingest Service

- `INGEST_POLL_INTERVAL_MS` (default `5000`): Delay between RedisQ polling attempts.
- `ZKILLBOARD_REDISQ_URL` (default `https://zkillredisq.stream/listen.php`)
- `ZKILLBOARD_REDISQ_ID` / `ZKILLBOARD_QUEUE_ID` (optional queue affinity)
- `PORT` (default `3002`): Health endpoint port when the ingest service runs standalone.

## Clusterer Service

- `CLUSTER_WINDOW_MINUTES` (default `30`)
- `CLUSTER_GAP_MAX_MINUTES` (default `15`)
- `CLUSTER_MIN_KILLS` (default `2`)
- `CLUSTER_BATCH_SIZE` (default `500`)
- `CLUSTER_INTERVAL_MS` (default `10000`)
- `PORT` (default `3003`): Health endpoint port when the clusterer service runs standalone.

## Enrichment Service

- `REDIS_URL` (required): Connection string for the BullMQ queue backend.
- `ENRICHMENT_CONCURRENCY` (default `5`): Max concurrent jobs processed per worker.
- `ENRICHMENT_THROTTLE_MS` (default `0`): Delay applied between upstream zKillboard fetches.
- `HOST` (default `0.0.0.0`) and `PORT` (default `3004`): HTTP listener for `/healthz`.
- `LOG_LEVEL` (default `info`): Pino log level shared across backend services.
