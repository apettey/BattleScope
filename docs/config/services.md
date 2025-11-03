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
