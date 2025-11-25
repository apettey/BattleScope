# Infrastructure-Level Database Migrations

## Overview

Migrations should run automatically when:
1. **Local environment spins up** (`make dev` or `docker-compose up`)
2. **K8s cluster deployment** (as part of `make k8s-deploy`)

This ensures the database is ALWAYS ready before services start.

---

## Pattern 1: Kubernetes Init Containers (Production)

Each service deployment uses an init container to run migrations:

```yaml
# infra/k8s/services/authentication-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: authentication
  namespace: battlescope
spec:
  replicas: 2
  template:
    spec:
      # Init container runs FIRST and MUST succeed
      initContainers:
        - name: migrate-db
          image: petdog/battlescope-authentication:v3.0.0
          command: ['node', 'dist/database/migrate.js']
          env:
            - name: DB_HOST
              value: "postgres"
            - name: DB_NAME
              value: "battlescope_auth"
            - name: DB_USER
              valueFrom:
                secretKeyRef:
                  name: auth-db-credentials
                  key: username
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: auth-db-credentials
                  key: password
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 200m
              memory: 256Mi

      # Main container starts ONLY after init container succeeds
      containers:
        - name: authentication
          image: petdog/battlescope-authentication:v3.0.0
          ports:
            - containerPort: 3007
          env:
            - name: DB_HOST
              value: "postgres"
            # ... same DB config as init container
```

**Benefits**:
- ✅ Migrations complete before ANY pod starts
- ✅ Failed migrations prevent deployment
- ✅ Multiple pods don't race to migrate (K8s waits for init)
- ✅ Clean separation: migration vs application logic

---

## Pattern 2: Kubernetes Job (One-Time Setup)

For initial database setup or major migrations:

```yaml
# infra/k8s/jobs/auth-db-init.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: auth-db-init
  namespace: battlescope
spec:
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: init-db
          image: postgres:15-alpine
          command:
            - /bin/sh
            - -c
            - |
              # Create database if it doesn't exist
              PGPASSWORD=$POSTGRES_PASSWORD psql -h $DB_HOST -U $DB_USER -tc "SELECT 1 FROM pg_database WHERE datname = 'battlescope_auth'" | grep -q 1 || \
              PGPASSWORD=$POSTGRES_PASSWORD psql -h $DB_HOST -U $DB_USER -c "CREATE DATABASE battlescope_auth"

              echo "Database battlescope_auth ready"
          env:
            - name: DB_HOST
              value: "postgres"
            - name: DB_USER
              value: "postgres"
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-credentials
                  key: password
```

**Usage**: Run once before deploying services:

```bash
kubectl apply -f infra/k8s/jobs/auth-db-init.yaml
kubectl wait --for=condition=complete job/auth-db-init -n battlescope --timeout=60s
kubectl apply -f infra/k8s/services/authentication-deployment.yaml
```

---

## Pattern 3: Makefile Automation

Update `Makefile` to ensure migrations run on deployment:

```makefile
# Makefile

.PHONY: k8s-deploy-auth
k8s-deploy-auth: ## Deploy authentication service with migrations
	@echo "📦 Deploying authentication service..."

	# Ensure database exists
	kubectl apply -f infra/k8s/jobs/auth-db-init.yaml
	kubectl wait --for=condition=complete job/auth-db-init -n battlescope --timeout=120s || true

	# Deploy service (init container will run migrations)
	kubectl apply -f infra/k8s/services/authentication-deployment.yaml

	# Wait for rollout
	kubectl rollout status deployment/authentication -n battlescope --timeout=300s

	@echo "✅ Authentication service deployed"

.PHONY: k8s-deploy
k8s-deploy: k8s-deploy-infrastructure k8s-deploy-auth k8s-deploy-services ## Deploy entire system
	@echo "✅ All services deployed"

.PHONY: local-dev-db
local-dev-db: ## Set up local databases with migrations
	@echo "🔧 Setting up local databases..."

	# Create databases
	docker-compose exec postgres psql -U battlescope -tc "SELECT 1 FROM pg_database WHERE datname = 'battlescope_auth'" | grep -q 1 || \
	docker-compose exec postgres psql -U battlescope -c "CREATE DATABASE battlescope_auth"

	# Run migrations for each service
	@for service in authentication ingestion enrichment battle search notification; do \
		echo "Running migrations for $$service..."; \
		docker-compose run --rm $$service npm run migrate || exit 1; \
	done

	@echo "✅ All databases initialized"

.PHONY: dev
dev: local-dev-db ## Start local development environment
	@echo "🚀 Starting development environment..."
	docker-compose up -d
	@echo "✅ Development environment ready"
```

**Usage**:
```bash
# Local development
make dev              # Spins up local env + runs migrations

# Kubernetes deployment
make k8s-deploy       # Deploys to K8s + runs migrations
make k8s-deploy-auth  # Deploy just auth service with migrations
```

---

## Pattern 4: Docker Compose with Depends On

For local development, use `docker-compose.yaml`:

```yaml
# docker-compose.yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: battlescope
      POSTGRES_PASSWORD: dev_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U battlescope"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Init job to create databases
  db-init:
    image: postgres:15-alpine
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      PGHOST: postgres
      PGUSER: battlescope
      PGPASSWORD: dev_password
    command: >
      sh -c "
        psql -tc \"SELECT 1 FROM pg_database WHERE datname = 'battlescope_auth'\" | grep -q 1 ||
        psql -c 'CREATE DATABASE battlescope_auth';

        psql -tc \"SELECT 1 FROM pg_database WHERE datname = 'battlescope_ingestion'\" | grep -q 1 ||
        psql -c 'CREATE DATABASE battlescope_ingestion';

        echo 'All databases created'
      "

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Authentication service - runs migrations on startup
  authentication:
    build:
      context: .
      dockerfile: services/authentication/Dockerfile
    depends_on:
      db-init:
        condition: service_completed_successfully
      redis:
        condition: service_healthy
    environment:
      DB_HOST: postgres
      DB_NAME: battlescope_auth
      DB_USER: battlescope
      DB_PASSWORD: dev_password
      REDIS_HOST: redis
    ports:
      - "3007:3007"
    volumes:
      - ./services/authentication:/app  # Live reload in dev

  # Other services follow same pattern...
```

**Key Points**:
- `db-init` service creates databases FIRST
- Services use `depends_on` with health checks
- Migrations run in application startup code
- Order is guaranteed: postgres → db-init → services

---

## Pattern 5: Migration Scripts

Each service has a standalone migration script:

```json
// services/authentication/package.json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "migrate": "tsx src/database/migrate-cli.ts",
    "migrate:create": "tsx scripts/create-migration.ts"
  }
}
```

```typescript
// services/authentication/src/database/migrate-cli.ts
import { createDatabase } from './client';
import { runMigrations } from './migrate';
import { logger } from '../lib/logger';

async function main() {
  try {
    const db = createDatabase();
    logger.info('Running migrations...');
    await runMigrations(db);
    logger.info('✅ Migrations complete');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
```

**Usage**:
```bash
# Run manually
npm run migrate

# In Docker
docker-compose run --rm authentication npm run migrate

# In K8s (init container)
kubectl run migrate-auth --rm -it --restart=Never \
  --image=petdog/battlescope-authentication:v3.0.0 \
  --command -- npm run migrate
```

---

## Pattern 6: Pre-Deploy Hook in CI/CD

In GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build Docker images
        run: make docker-build

      - name: Push images
        run: make docker-push

      - name: Create databases
        run: |
          kubectl apply -f infra/k8s/jobs/auth-db-init.yaml
          kubectl wait --for=condition=complete job/auth-db-init -n battlescope

      - name: Deploy services (with migration init containers)
        run: make k8s-deploy

      - name: Verify deployment
        run: make k8s-status
```

---

## Recommended Approach

**For BattleScope**, use a **hybrid approach**:

### 1. Database Creation (One-Time Setup)

```makefile
# Makefile
.PHONY: k8s-init-databases
k8s-init-databases: ## Create all service databases
	@echo "Creating service databases..."
	kubectl apply -f infra/k8s/jobs/create-databases.yaml
	kubectl wait --for=condition=complete job/create-databases -n battlescope --timeout=120s
	@echo "✅ Databases created"
```

```yaml
# infra/k8s/jobs/create-databases.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: create-databases
  namespace: battlescope
spec:
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: create-dbs
          image: postgres:15-alpine
          command:
            - /bin/sh
            - -c
            - |
              for db in battlescope_auth battlescope_ingestion battlescope_enrichment battlescope_battles; do
                echo "Creating database $db..."
                PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1 || \
                PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U postgres -c "CREATE DATABASE $db"
              done
              echo "✅ All databases ready"
          env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-credentials
                  key: password
```

### 2. Schema Migrations (Per-Service Init Container)

Every service deployment includes init container:

```yaml
# infra/k8s/services/authentication-deployment.yaml
initContainers:
  - name: migrate
    image: petdog/battlescope-authentication:v3.0.0
    command: ['npm', 'run', 'migrate']
    env: # Same as main container
```

### 3. Updated Deployment Flow

```makefile
.PHONY: k8s-deploy
k8s-deploy: ## Deploy to Kubernetes
	@echo "📦 Deploying BattleScope to Kubernetes..."

	# 1. Ensure databases exist
	@make k8s-init-databases

	# 2. Deploy infrastructure
	kubectl apply -f infra/k8s/infrastructure/

	# 3. Deploy services (init containers will migrate)
	kubectl apply -f infra/k8s/services/

	# 4. Wait for rollout
	@for svc in authentication ingestion enrichment battle search notification bff frontend; do \
		kubectl rollout status deployment/$$svc -n battlescope --timeout=300s || exit 1; \
	done

	@echo "✅ Deployment complete"
```

---

## Summary: Migration Execution Points

| Context | When Migrations Run | How |
|---------|-------------------|-----|
| **Local Dev** | `make dev` | Docker Compose `db-init` + app startup |
| **Manual** | `npm run migrate` | CLI script |
| **K8s Deploy** | `make k8s-deploy` | Init containers before pods start |
| **CI/CD** | On push to main | GitHub Actions → Job → Init containers |
| **New Service** | First deployment | Init container creates schema |
| **Schema Update** | Code deployment | Init container applies pending migrations |

---

## Implementation Checklist

For **authentication service**, implement:

- [ ] Create `infra/k8s/jobs/create-databases.yaml`
- [ ] Add init container to `authentication-deployment.yaml`
- [ ] Update `Makefile` with `k8s-init-databases` target
- [ ] Update `docker-compose.yaml` with `db-init` service
- [ ] Create `services/authentication/migrations/` directory
- [ ] Add `001_init.sql` migration
- [ ] Implement `src/database/migrate.ts` runner
- [ ] Add `migrate` script to `package.json`
- [ ] Test locally with `make dev`
- [ ] Test in K8s with `make k8s-deploy`

This ensures migrations ALWAYS run when:
- ✅ Developer runs `make dev`
- ✅ System deploys to K8s with `make k8s-deploy`
- ✅ CI/CD pipeline deploys automatically
