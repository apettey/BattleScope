# BattleScope Database Migration Docker Image

**Image Name**: `petdog/battlescope-db-migrate:latest`

**Source**: `Dockerfile` with build args `SERVICE_SCOPE=@battlescope/database` and `BUILD_TARGET=packages/database`

## Purpose

Runs database migrations to create and update the PostgreSQL database schema. This is typically run as a Kubernetes Job before deploying other services.

## Features

- Run pending database migrations
- Create database schema from scratch
- Idempotent (safe to run multiple times)
- Tracks migration history in database
- Supports rollback (manual)

## Configuration

### Environment Variables

#### Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |
| `POSTGRES_HOST` | PostgreSQL host | `localhost` | If no DATABASE_URL |
| `POSTGRES_PORT` | PostgreSQL port | `5432` | No |
| `POSTGRES_DB` | Database name | `battlescope` | No |
| `POSTGRES_USER` | Database user | - | If no DATABASE_URL |
| `POSTGRES_PASSWORD` | Database password | - | If no DATABASE_URL |
| `POSTGRES_SSL` | Enable SSL connection | `false` | No |

## Database Schema

### Tables Created

**Core Tables**:
- `killmails` - Killmail references from ingestion
- `battle_killmails` - Enriched killmail data
- `battle_participants` - Participant details
- `battles` - Battle records with metadata
- `rulesets` - Ingestion filter configuration

**Authentication Tables**:
- `accounts` - User accounts
- `characters` - Linked EVE characters
- `features` - Feature definitions
- `roles` - Role hierarchy
- `account_feature_roles` - User role assignments
- `feature_settings` - Feature configuration
- `auth_config` - Organization gating rules
- `audit_logs` - Audit trail

**Metadata Tables**:
- `migration_history` - Migration tracking

## Example Usage

### Kubernetes Job (Recommended)

See `infra/k8s/db-migrate-job.yaml` for the complete manifest.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
  namespace: battlescope
spec:
  template:
    metadata:
      labels:
        app: db-migrate
    spec:
      restartPolicy: OnFailure
      containers:
        - name: db-migrate
          image: petdog/battlescope-db-migrate:latest
          command:
            - node
            - dist/packages/database/src/cli/migrate.js
          envFrom:
            - secretRef:
                name: battlescope-secrets
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
```

### Docker Run

```bash
docker run --rm \
  -e DATABASE_URL=postgres://user:pass@postgres:5432/battlescope \
  petdog/battlescope-db-migrate:latest \
  node dist/packages/database/src/cli/migrate.js
```

### Docker Compose

```yaml
services:
  db-migrate:
    image: petdog/battlescope-db-migrate:latest
    environment:
      DATABASE_URL: postgres://battlescope:password@postgres:5432/battlescope
    command: ["node", "dist/packages/database/src/cli/migrate.js"]
    depends_on:
      - postgres
```

### Local Development

```bash
# From repository root
pnpm run db:migrate

# Or using make
make db-migrate
```

## Migration Process

1. Connect to PostgreSQL database
2. Check for existing `migration_history` table
3. If not exists, create migration tracking table
4. Query applied migrations
5. Compare with available migration files
6. Run pending migrations in order
7. Record each migration in `migration_history`
8. Commit transaction
9. Exit with status code 0 (success) or 1 (failure)

## Creating New Migrations

### Using Make

```bash
make db-migrate-make NAME=add_user_preferences
```

### Using PNPM

```bash
pnpm run db:migrate:make add_user_preferences
```

This creates a new migration file in `packages/database/migrations/` with timestamp prefix.

### Migration File Format

```typescript
import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Migration logic here
  await db.schema
    .createTable('new_table')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Rollback logic here
  await db.schema.dropTable('new_table').execute();
}
```

## Resource Requirements

### Recommended

- **CPU**: 100m request, 500m limit
- **Memory**: 128Mi request, 512Mi limit

### Minimum

- **CPU**: 50m
- **Memory**: 64Mi

## Execution Time

Typical execution time:
- **Initial schema creation**: 5-30 seconds
- **Incremental migrations**: 1-10 seconds

## Dependencies

### Required Services

- **PostgreSQL 15+**: Target database

## Build Information

### Build Command

```bash
docker build \
  --build-arg SERVICE_SCOPE=@battlescope/database \
  --build-arg BUILD_TARGET=packages/database \
  -t petdog/battlescope-db-migrate:latest \
  -f Dockerfile \
  .
```

## Exit Codes

- `0` - Success (all migrations applied)
- `1` - Failure (migration error or database connection failed)

## Troubleshooting

### Migration Fails

1. Check database connectivity: `psql $DATABASE_URL`
2. Verify database user has CREATE/ALTER permissions
3. Review migration SQL for syntax errors
4. Check migration history for partial failures

### Database Already Exists

Migrations are idempotent. Running migrations multiple times is safe - they will only apply pending migrations.

### Permission Denied

Ensure database user has sufficient privileges:

```sql
GRANT CREATE, ALTER, DROP ON DATABASE battlescope TO battlescope_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO battlescope_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO battlescope_user;
```

### Connection Timeout

1. Verify PostgreSQL is running
2. Check network connectivity
3. Verify `DATABASE_URL` format
4. Increase connection timeout (code change required)

## Rollback Procedure

Migrations support rollback, but must be done manually:

1. Identify migration to rollback
2. Run rollback command (not yet implemented in CLI)
3. Or manually execute `down()` function from migration file

**Example Manual Rollback**:

```typescript
import { createDb } from '@battlescope/database';
import { down } from './migrations/20240101000000_migration_name.js';

const db = createDb();
await down(db);
```

## Best Practices

- **Always run migrations before deploying services**
- Use Kubernetes Job with `restartPolicy: OnFailure`
- Wait for job completion before starting pods:
  ```yaml
  kubectl wait --for=condition=complete job/db-migrate -n battlescope --timeout=300s
  ```
- Test migrations in development before production
- Keep migrations small and focused
- Never modify existing migrations (create new ones)
- Always provide both `up()` and `down()` functions
- Use transactions in migrations when possible

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run Database Migrations
  run: |
    kubectl apply -f infra/k8s/db-migrate-job.yaml
    kubectl wait --for=condition=complete job/db-migrate -n battlescope --timeout=300s
    kubectl logs -n battlescope job/db-migrate
```

### GitLab CI Example

```yaml
migrate:
  stage: deploy
  script:
    - kubectl apply -f infra/k8s/db-migrate-job.yaml
    - kubectl wait --for=condition=complete job/db-migrate -n battlescope --timeout=300s
  only:
    - main
```

## Security Considerations

- Use least privilege database user for migrations
- Store `DATABASE_URL` in Kubernetes Secrets
- Audit migration changes before applying
- Test migrations in staging environment
- Consider backup before major schema changes

## Version Information

- **Node.js**: 20 LTS
- **Kysely**: 0.27
- **TypeScript**: 5.4.5

## Additional Resources

- [Database Package Source Code](../../packages/database)
- [Migration Files](../../packages/database/migrations)
- [Kysely Documentation](https://kysely.dev/)
- [Architecture Documentation](../architecture.md)
