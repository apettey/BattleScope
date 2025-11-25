# Claude Skill: Database Migrations

**Purpose**: Ensure every service automatically applies database migrations on deployment using a consistent, reliable pattern.

---

## Core Principle

**Rule**: Every service with a database MUST apply migrations automatically before starting the application. Migrations must be idempotent, versioned, and tracked.

**Rationale**:
- **Zero Manual Steps**: No developer intervention required for schema updates
- **Deployment Safety**: Database schema is always in sync with application code
- **Rollback Support**: Failed migrations prevent application startup
- **Audit Trail**: Track which migrations ran when
- **Idempotency**: Safe to run multiple times
- **Consistency**: Same process across all services

---

## Migration Implementation Pattern

### 1. Migration File Structure

Each service stores migrations in `services/{service}/migrations/`:

```
services/authentication/
├── migrations/
│   ├── 001_init.sql
│   ├── 002_add_characters_table.sql
│   ├── 003_add_audit_logs.sql
│   └── README.md
├── src/
│   ├── database/
│   │   ├── client.ts
│   │   └── migrate.ts  ← Migration runner
│   └── server.ts
└── package.json
```

### 2. Migration Naming Convention

```
{version}_{description}.sql

Examples:
001_init.sql                    - Initial schema
002_add_users_table.sql         - Add new table
003_add_email_column.sql        - Add column
004_create_index_on_email.sql   - Performance improvement
005_partition_audit_logs.sql    - Schema optimization
```

**Rules**:
- **Sequential numbering**: 001, 002, 003...
- **Snake_case description**: `add_users_table` not `addUsersTable`
- **Descriptive names**: Clearly state what the migration does
- **Never modify existing migrations**: Always create new ones

### 3. Migration SQL Template

Each migration must be idempotent and safe to re-run:

```sql
-- Migration: 002_add_characters_table
-- Description: Add characters table with ESI token storage
-- Created: 2025-11-25

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create table (idempotent)
CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  eve_character_id BIGINT NOT NULL UNIQUE,
  eve_character_name TEXT NOT NULL,
  corp_id BIGINT NOT NULL,
  corp_name TEXT NOT NULL,
  alliance_id BIGINT,
  alliance_name TEXT,
  portrait_url TEXT,
  esi_access_token BYTEA,
  esi_refresh_token BYTEA,
  esi_token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_characters_account_id ON characters(account_id);
CREATE INDEX IF NOT EXISTS idx_characters_eve_character_id ON characters(eve_character_id);
CREATE INDEX IF NOT EXISTS idx_characters_corp_id ON characters(corp_id);
CREATE INDEX IF NOT EXISTS idx_characters_alliance_id ON characters(alliance_id);

-- Create trigger for updated_at (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_characters_updated_at ON characters;
CREATE TRIGGER update_characters_updated_at
  BEFORE UPDATE ON characters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert seed data (idempotent)
-- Use ON CONFLICT DO NOTHING for inserts
```

**Idempotency Patterns**:
- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `CREATE EXTENSION IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION`
- `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`
- `INSERT ... ON CONFLICT DO NOTHING` for seed data

### 4. Migration Tracking Table

Every database needs a `schema_migrations` table:

```sql
-- Should be in 001_init.sql for every service
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum TEXT NOT NULL,
  execution_time_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
  ON schema_migrations(applied_at DESC);
```

---

## Migration Runner Implementation

### 5. TypeScript Migration Runner

Create `src/database/migrate.ts` in every service:

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Kysely, sql } from 'kysely';
import { logger } from '../lib/logger';

interface Migration {
  version: string;
  filename: string;
  sql: string;
  checksum: string;
}

interface SchemaMigration {
  version: string;
  applied_at: Date;
  checksum: string;
  execution_time_ms: number;
}

export async function runMigrations(db: Kysely<any>): Promise<void> {
  const startTime = Date.now();
  logger.info('Starting database migrations...');

  try {
    // Ensure migrations table exists
    await ensureMigrationsTable(db);

    // Load migration files
    const migrations = await loadMigrations();
    logger.info(`Found ${migrations.length} migration files`);

    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations(db);
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));

    // Find pending migrations
    const pendingMigrations = migrations.filter(m => !appliedVersions.has(m.version));

    if (pendingMigrations.length === 0) {
      logger.info('All migrations up to date');
      return;
    }

    logger.info(`Applying ${pendingMigrations.length} pending migrations`);

    // Apply each pending migration
    for (const migration of pendingMigrations) {
      await applyMigration(db, migration);
    }

    const totalTime = Date.now() - startTime;
    logger.info(`All migrations completed successfully in ${totalTime}ms`);
  } catch (error) {
    logger.error('Migration failed:', error);
    throw new Error(`Database migration failed: ${error.message}`);
  }
}

async function ensureMigrationsTable(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum TEXT NOT NULL,
      execution_time_ms INTEGER NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
    ON schema_migrations(applied_at DESC)
  `.execute(db);
}

async function loadMigrations(): Promise<Migration[]> {
  const migrationsDir = path.join(__dirname, '../../migrations');

  try {
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort(); // Alphabetical = numerical order

    const migrations: Migration[] = [];

    for (const filename of sqlFiles) {
      const filePath = path.join(migrationsDir, filename);
      const sqlContent = await fs.readFile(filePath, 'utf-8');
      const version = filename.replace('.sql', '');
      const checksum = crypto
        .createHash('sha256')
        .update(sqlContent)
        .digest('hex')
        .substring(0, 16);

      migrations.push({
        version,
        filename,
        sql: sqlContent,
        checksum,
      });
    }

    return migrations;
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      logger.warn('Migrations directory not found, skipping migrations');
      return [];
    }
    throw error;
  }
}

async function getAppliedMigrations(db: Kysely<any>): Promise<SchemaMigration[]> {
  const result = await sql<SchemaMigration>`
    SELECT version, applied_at, checksum, execution_time_ms
    FROM schema_migrations
    ORDER BY version ASC
  `.execute(db);

  return result.rows;
}

async function applyMigration(db: Kysely<any>, migration: Migration): Promise<void> {
  const startTime = Date.now();
  logger.info(`Applying migration: ${migration.filename}`);

  try {
    // Execute migration SQL
    await sql.raw(migration.sql).execute(db);

    // Record in migrations table
    const executionTime = Date.now() - startTime;
    await sql`
      INSERT INTO schema_migrations (version, checksum, execution_time_ms)
      VALUES (${migration.version}, ${migration.checksum}, ${executionTime})
    `.execute(db);

    logger.info(`✓ Migration ${migration.filename} applied in ${executionTime}ms`);
  } catch (error) {
    logger.error(`✗ Migration ${migration.filename} failed:`, error);
    throw error;
  }
}
```

### 6. Integration in Server Startup

In `src/server.ts` or `src/index.ts`:

```typescript
import { createDatabase } from './database/client';
import { runMigrations } from './database/migrate';
import { buildServer } from './server';
import { logger } from './lib/logger';

async function start() {
  try {
    // Create database connection
    const db = createDatabase();
    logger.info('Database connection established');

    // Run migrations BEFORE starting server
    await runMigrations(db);

    // Build and start server
    const server = buildServer({ db });
    await server.listen({ port: 3007, host: '0.0.0.0' });
    logger.info('Server started on port 3007');
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1); // Exit if migrations fail
  }
}

start();
```

**Critical**: Migrations run BEFORE the server starts. If migrations fail, the application MUST NOT start.

---

## Dockerfile Integration

### 7. Include Migrations in Docker Image

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

# Copy source AND migrations
COPY src ./src
COPY migrations ./migrations  ← Include migrations in image
COPY tsconfig.json ./

RUN pnpm build

# Production image
FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/migrations ./migrations  ← Copy to production image

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

**Rule**: Migrations MUST be in the Docker image so they can run on container startup.

---

## Kubernetes Init Container Pattern (Alternative)

For more complex scenarios, use an init container:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: authentication
spec:
  template:
    spec:
      initContainers:
        - name: migrate
          image: petdog/battlescope-authentication:v3.0.0
          command: ['node', 'dist/migrate.js']  # Separate migration script
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: auth-db-credentials
                  key: url
      containers:
        - name: authentication
          image: petdog/battlescope-authentication:v3.0.0
          # Application starts only after init container succeeds
```

**Benefit**: Ensures migrations complete before any application pods start.

---

## Migration Best Practices

### DO ✅

1. **Make migrations idempotent**: Use `IF NOT EXISTS`, `CREATE OR REPLACE`
2. **Version sequentially**: 001, 002, 003...
3. **Never edit existing migrations**: Always create new ones
4. **Test migrations locally**: Before pushing to production
5. **Keep migrations small**: One logical change per migration
6. **Add comments**: Explain WHY, not just WHAT
7. **Use transactions**: Wrap in BEGIN/COMMIT when possible
8. **Handle rollback**: Document how to undo if needed

### DON'T ❌

1. **Never modify applied migrations**: Checksum will mismatch
2. **Don't skip versions**: Keep numbering sequential
3. **Don't use application code in migrations**: SQL only
4. **Don't assume order**: Use IF NOT EXISTS, not "add column"
5. **Don't delete migrations**: They're part of history
6. **Don't use environment-specific logic**: Migrations run everywhere
7. **Don't make breaking changes**: Add columns as nullable first
8. **Don't forget indexes**: Performance matters

---

## Migration Patterns

### Adding a Column (Safe)

```sql
-- Add column as nullable first
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Backfill data if needed
UPDATE accounts SET phone_number = 'unknown' WHERE phone_number IS NULL;

-- Add constraint in separate migration if needed
-- ALTER TABLE accounts ALTER COLUMN phone_number SET NOT NULL;
```

### Renaming a Column (Multi-Step)

```sql
-- Migration 1: Add new column
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS display_name TEXT;
UPDATE accounts SET display_name = username WHERE display_name IS NULL;

-- Migration 2 (deploy code that uses both columns)
-- Migration 3: Drop old column
-- ALTER TABLE accounts DROP COLUMN IF EXISTS username;
```

### Creating an Index (Safe, Concurrent)

```sql
-- Use CONCURRENTLY to avoid locking (PostgreSQL)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_characters_corp_id
ON characters(corp_id);
```

### Seed Data (Idempotent)

```sql
-- Use ON CONFLICT for upserts
INSERT INTO roles (id, key, rank, name) VALUES
  ('550e8400-e29b-41d4-a716-446655440000', 'user', 10, 'User'),
  ('550e8400-e29b-41d4-a716-446655440001', 'admin', 40, 'Admin')
ON CONFLICT (key) DO UPDATE SET
  rank = EXCLUDED.rank,
  name = EXCLUDED.name;
```

---

## Environment-Specific Migrations

**Rule**: Migrations should work in ALL environments (dev, staging, production).

**Anti-Pattern**:
```sql
-- DON'T do this
DO $$
BEGIN
  IF current_database() = 'production' THEN
    -- Production-only logic
  END IF;
END $$;
```

**Better**:
```sql
-- Use feature flags or app config, not database logic
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE
);
```

---

## Validation Checklist

Before committing a migration:

- [ ] Migration file is numbered sequentially
- [ ] File name is descriptive
- [ ] SQL is idempotent (IF NOT EXISTS, CREATE OR REPLACE)
- [ ] Tested locally (ran twice successfully)
- [ ] No breaking changes (columns nullable, indexes concurrent)
- [ ] Comments explain WHY
- [ ] Checksum will be recorded
- [ ] Rollback plan documented

---

## How Claude Should Use This Skill

When I (Claude) am:

- **Creating a new service**: Add migrations directory and runner
- **Adding database tables**: Create a new migration file
- **Modifying schema**: Create a NEW migration (never edit existing)
- **Deploying service**: Ensure migrations run before app starts
- **Building Dockerfile**: Include migrations directory
- **Writing startup code**: Call `runMigrations()` before `server.listen()`
- **Reviewing code**: Check that migrations are idempotent

**If I forget to create migrations, I should STOP and create them.**

---

## Example: Complete Service Setup

```bash
services/authentication/
├── migrations/
│   ├── 001_init.sql                    # Initial schema
│   ├── 002_add_characters.sql          # Characters table
│   └── 003_add_audit_logs.sql          # Audit logging
├── src/
│   ├── database/
│   │   ├── client.ts                   # Database connection
│   │   ├── migrate.ts                  # Migration runner
│   │   └── types.ts                    # Kysely types
│   ├── server.ts                       # Fastify app
│   └── index.ts                        # Entry point (runs migrations)
├── Dockerfile                           # Includes migrations
└── package.json
```

**Startup Flow**:
1. Container starts
2. `index.ts` runs
3. Create database connection
4. Run migrations (reads from `./migrations`)
5. Migrations tracked in `schema_migrations` table
6. Start Fastify server
7. Health check passes

---

## Summary: Migration Golden Rules

1. **Migrations Run Automatically** - On every deployment
2. **Sequential Versioning** - 001, 002, 003...
3. **Idempotent SQL** - Safe to run multiple times
4. **Never Edit Existing** - Always create new migrations
5. **Track in Database** - `schema_migrations` table
6. **Fail Fast** - App doesn't start if migrations fail
7. **Include in Docker** - Migrations bundled with code
8. **Test Locally First** - Run migrations before pushing

---

**Next time we create a service, we MUST include migration infrastructure from day one.**
