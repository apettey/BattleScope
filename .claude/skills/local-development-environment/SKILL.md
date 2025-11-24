# Claude Skill: Local Development Environment

**Purpose**: Standardize local development setup with reproducible environments, easy service management, and comprehensive integration testing capabilities.

---

## Core Principle

**Developers MUST be able to spin up the entire system locally with a single command, run full integration tests, and reset state easily.**

**Rationale**:
- Consistent development environments reduce "works on my machine" issues
- Easy environment setup lowers onboarding friction
- Local integration testing catches issues before CI/CD
- Makefile provides discoverability and documentation
- Docker Compose ensures all dependencies are available

---

## Makefile as Primary Interface

### 1. Makefile Structure

**Rule**: ALL local environment operations MUST be accessible via `make` commands.

**Why Makefile**:
- Universal tool (available on all Unix systems)
- Self-documenting with `make help`
- Cross-service orchestration
- Consistent interface across services

**Example Root Makefile**:

```makefile
# Makefile
.PHONY: help
help: ## Show this help message
	@echo "BattleScope Development Environment"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help

# =============================================================================
# Local Development
# =============================================================================

.PHONY: install
install: ## Install all dependencies
	@echo "Installing dependencies..."
	pnpm install

.PHONY: dev
dev: ## Start all services in development mode
	@echo "Starting development environment..."
	docker-compose -f docker-compose.dev.yml up -d
	@echo "Waiting for services to be ready..."
	./scripts/wait-for-services.sh
	@echo "✅ Development environment ready!"
	@echo ""
	@echo "Services:"
	@echo "  - API Gateway:      http://localhost:3000"
	@echo "  - Clusterer:        http://localhost:3001"
	@echo "  - Enrichment:       http://localhost:3002"
	@echo "  - PostgreSQL:       localhost:5432"
	@echo "  - Kafka:            localhost:9092"
	@echo "  - Redis:            localhost:6379"

.PHONY: dev-services
dev-services: ## Start TypeScript services in watch mode
	@echo "Starting TypeScript services with hot reload..."
	pnpm run dev

.PHONY: stop
stop: ## Stop all services
	@echo "Stopping all services..."
	docker-compose -f docker-compose.dev.yml down

.PHONY: logs
logs: ## Show logs from all services
	docker-compose -f docker-compose.dev.yml logs -f

.PHONY: logs-%
logs-%: ## Show logs from specific service (e.g., make logs-clusterer)
	docker-compose -f docker-compose.dev.yml logs -f $*

# =============================================================================
# Database Management
# =============================================================================

.PHONY: db-reset
db-reset: ## Reset all databases (WARNING: deletes all data)
	@echo "⚠️  WARNING: This will delete all local data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		$(MAKE) db-reset-force; \
	else \
		echo "Cancelled."; \
	fi

.PHONY: db-reset-force
db-reset-force:
	@echo "Resetting databases..."
	docker-compose -f docker-compose.dev.yml down -v
	docker-compose -f docker-compose.dev.yml up -d postgres-ingestion postgres-enrichment postgres-battles postgres-notifications
	@echo "Waiting for databases..."
	sleep 5
	$(MAKE) db-migrate
	$(MAKE) db-seed
	@echo "✅ Databases reset complete"

.PHONY: db-migrate
db-migrate: ## Run database migrations
	@echo "Running migrations..."
	pnpm --filter @battlescope/database run migrate:latest
	@echo "✅ Migrations complete"

.PHONY: db-seed
db-seed: ## Seed databases with test data
	@echo "Seeding databases..."
	pnpm --filter @battlescope/database run seed
	@echo "✅ Seeding complete"

.PHONY: db-shell
db-shell: ## Open PostgreSQL shell for battles database
	docker-compose -f docker-compose.dev.yml exec postgres-battles psql -U battles_user -d battles_db

.PHONY: db-shell-%
db-shell-%: ## Open PostgreSQL shell for specific database (e.g., make db-shell-ingestion)
	docker-compose -f docker-compose.dev.yml exec postgres-$* psql -U $*_user -d $*_db

# =============================================================================
# Kafka Management
# =============================================================================

.PHONY: kafka-topics
kafka-topics: ## List all Kafka topics
	docker-compose -f docker-compose.dev.yml exec kafka kafka-topics --bootstrap-server localhost:9092 --list

.PHONY: kafka-create-topics
kafka-create-topics: ## Create required Kafka topics
	@echo "Creating Kafka topics..."
	docker-compose -f docker-compose.dev.yml exec kafka kafka-topics --bootstrap-server localhost:9092 --create --topic killmail.ingested --partitions 3 --replication-factor 1 --if-not-exists
	docker-compose -f docker-compose.dev.yml exec kafka kafka-topics --bootstrap-server localhost:9092 --create --topic killmail.enriched --partitions 3 --replication-factor 1 --if-not-exists
	docker-compose -f docker-compose.dev.yml exec kafka kafka-topics --bootstrap-server localhost:9092 --create --topic battle.created --partitions 3 --replication-factor 1 --if-not-exists
	docker-compose -f docker-compose.dev.yml exec kafka kafka-topics --bootstrap-server localhost:9092 --create --topic battle.updated --partitions 3 --replication-factor 1 --if-not-exists
	@echo "✅ Topics created"

.PHONY: kafka-reset
kafka-reset: ## Reset Kafka (delete all topics and data)
	@echo "⚠️  WARNING: This will delete all Kafka data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose -f docker-compose.dev.yml stop kafka; \
		docker-compose -f docker-compose.dev.yml rm -f kafka; \
		docker volume rm battlescope_kafka_data || true; \
		docker-compose -f docker-compose.dev.yml up -d kafka; \
		sleep 10; \
		$(MAKE) kafka-create-topics; \
		echo "✅ Kafka reset complete"; \
	else \
		echo "Cancelled."; \
	fi

# =============================================================================
# Redis Management
# =============================================================================

.PHONY: redis-cli
redis-cli: ## Open Redis CLI
	docker-compose -f docker-compose.dev.yml exec redis redis-cli

.PHONY: redis-flush
redis-flush: ## Flush all Redis data
	@echo "⚠️  WARNING: This will delete all Redis data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose -f docker-compose.dev.yml exec redis redis-cli FLUSHALL; \
		echo "✅ Redis flushed"; \
	else \
		echo "Cancelled."; \
	fi

# =============================================================================
# Testing
# =============================================================================

.PHONY: test
test: ## Run all tests
	pnpm run test

.PHONY: test-unit
test-unit: ## Run unit tests only
	pnpm run test:unit

.PHONY: test-integration
test-integration: ## Run integration tests
	pnpm run test:integration

.PHONY: test-e2e
test-e2e: test-e2e-setup ## Run end-to-end tests
	@echo "Running E2E tests..."
	pnpm run test:e2e
	$(MAKE) test-e2e-teardown

.PHONY: test-e2e-setup
test-e2e-setup: ## Setup E2E test environment
	@echo "Setting up E2E environment..."
	docker-compose -f docker-compose.test.yml up -d --build
	@echo "Waiting for services..."
	./scripts/wait-for-services.sh test
	$(MAKE) db-migrate
	@echo "✅ E2E environment ready"

.PHONY: test-e2e-teardown
test-e2e-teardown: ## Teardown E2E test environment
	@echo "Tearing down E2E environment..."
	docker-compose -f docker-compose.test.yml down -v

.PHONY: test-coverage
test-coverage: ## Run tests with coverage report
	pnpm run test:coverage

# =============================================================================
# Code Quality
# =============================================================================

.PHONY: lint
lint: ## Run linter
	pnpm run lint

.PHONY: lint-fix
lint-fix: ## Fix linting errors
	pnpm run lint:fix

.PHONY: format
format: ## Format code with Prettier
	pnpm run format

.PHONY: format-check
format-check: ## Check code formatting
	pnpm run format:check

.PHONY: typecheck
typecheck: ## Run TypeScript type checking
	pnpm run typecheck

.PHONY: ci
ci: install typecheck lint format-check test-coverage ## Run all CI checks locally
	@echo "✅ All CI checks passed!"

# =============================================================================
# Build
# =============================================================================

.PHONY: build
build: ## Build all services
	pnpm run build

.PHONY: build-docker
build-docker: ## Build Docker images for all services
	@echo "Building Docker images..."
	docker-compose -f docker-compose.test.yml build

.PHONY: clean
clean: ## Clean build artifacts and node_modules
	@echo "Cleaning build artifacts..."
	find . -name "dist" -type d -prune -exec rm -rf {} \;
	find . -name "node_modules" -type d -prune -exec rm -rf {} \;
	find . -name "coverage" -type d -prune -exec rm -rf {} \;
	@echo "✅ Clean complete"

# =============================================================================
# Utilities
# =============================================================================

.PHONY: ps
ps: ## Show running services
	docker-compose -f docker-compose.dev.yml ps

.PHONY: health
health: ## Check health of all services
	@echo "Checking service health..."
	@curl -sf http://localhost:3001/health/liveness > /dev/null && echo "✅ Clusterer: healthy" || echo "❌ Clusterer: unhealthy"
	@curl -sf http://localhost:3002/health/liveness > /dev/null && echo "✅ Enrichment: healthy" || echo "❌ Enrichment: unhealthy"
	@curl -sf http://localhost:3003/health/liveness > /dev/null && echo "✅ Ingest: healthy" || echo "❌ Ingest: unhealthy"

.PHONY: restart
restart: stop dev ## Restart all services

.PHONY: reset-all
reset-all: ## Reset entire environment (databases, Kafka, Redis)
	$(MAKE) stop
	$(MAKE) db-reset-force
	$(MAKE) kafka-reset
	$(MAKE) redis-flush
	$(MAKE) dev
	@echo "✅ Complete environment reset"
```

---

## Docker Compose Configurations

### 2. Development Environment

**Rule**: Development environment MUST support hot reloading and debugging.

**docker-compose.dev.yml**:

```yaml
version: '3.9'

services:
  # =============================================================================
  # Databases
  # =============================================================================

  postgres-ingestion:
    image: postgres:15-alpine
    container_name: battlescope-postgres-ingestion
    environment:
      POSTGRES_USER: ingestion_user
      POSTGRES_PASSWORD: ingestion_pass
      POSTGRES_DB: ingestion_db
    ports:
      - "5433:5432"
    volumes:
      - postgres_ingestion_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ingestion_user -d ingestion_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  postgres-enrichment:
    image: postgres:15-alpine
    container_name: battlescope-postgres-enrichment
    environment:
      POSTGRES_USER: enrichment_user
      POSTGRES_PASSWORD: enrichment_pass
      POSTGRES_DB: enrichment_db
    ports:
      - "5434:5432"
    volumes:
      - postgres_enrichment_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U enrichment_user -d enrichment_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  postgres-battles:
    image: postgres:15-alpine
    container_name: battlescope-postgres-battles
    environment:
      POSTGRES_USER: battles_user
      POSTGRES_PASSWORD: battles_pass
      POSTGRES_DB: battles_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_battles_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U battles_user -d battles_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  postgres-notifications:
    image: postgres:15-alpine
    container_name: battlescope-postgres-notifications
    environment:
      POSTGRES_USER: notifications_user
      POSTGRES_PASSWORD: notifications_pass
      POSTGRES_DB: notifications_db
    ports:
      - "5435:5432"
    volumes:
      - postgres_notifications_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U notifications_user -d notifications_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  # =============================================================================
  # Message Broker
  # =============================================================================

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    container_name: battlescope-zookeeper
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    volumes:
      - zookeeper_data:/var/lib/zookeeper/data
      - zookeeper_log:/var/lib/zookeeper/log

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    container_name: battlescope-kafka
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
    volumes:
      - kafka_data:/var/lib/kafka/data
    healthcheck:
      test: ["CMD", "kafka-broker-api-versions", "--bootstrap-server", "localhost:9092"]
      interval: 10s
      timeout: 10s
      retries: 5

  # =============================================================================
  # Cache & Session Store
  # =============================================================================

  redis:
    image: redis:7-alpine
    container_name: battlescope-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # =============================================================================
  # Search Engine
  # =============================================================================

  typesense:
    image: typesense/typesense:0.25.1
    container_name: battlescope-typesense
    ports:
      - "8108:8108"
    environment:
      TYPESENSE_DATA_DIR: /data
      TYPESENSE_API_KEY: dev_api_key
    volumes:
      - typesense_data:/data
    command: --data-dir /data --api-key=dev_api_key --enable-cors

volumes:
  postgres_ingestion_data:
  postgres_enrichment_data:
  postgres_battles_data:
  postgres_notifications_data:
  zookeeper_data:
  zookeeper_log:
  kafka_data:
  redis_data:
  typesense_data:
```

---

### 3. Integration Test Environment

**Rule**: Test environment MUST use production-like Docker images.

**docker-compose.test.yml**:

```yaml
version: '3.9'

services:
  # =============================================================================
  # Databases (Same as dev, but isolated)
  # =============================================================================

  postgres-ingestion:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ingestion_user
      POSTGRES_PASSWORD: ingestion_pass
      POSTGRES_DB: ingestion_db_test
    tmpfs:
      - /var/lib/postgresql/data  # In-memory for faster tests
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]
      interval: 5s
      timeout: 3s
      retries: 3

  postgres-battles:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: battles_user
      POSTGRES_PASSWORD: battles_pass
      POSTGRES_DB: battles_db_test
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]
      interval: 5s
      timeout: 3s
      retries: 3

  redis:
    image: redis:7-alpine
    command: redis-server --save ""  # Disable persistence for tests
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 3

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
    depends_on:
      - zookeeper
    healthcheck:
      test: ["CMD", "kafka-broker-api-versions", "--bootstrap-server", "localhost:9092"]
      interval: 5s
      timeout: 5s
      retries: 5

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  # =============================================================================
  # Services (Built from source)
  # =============================================================================

  ingest:
    build:
      context: .
      dockerfile: backend/ingest/Dockerfile
    environment:
      DATABASE_URL: postgresql://ingestion_user:ingestion_pass@postgres-ingestion:5432/ingestion_db_test
      KAFKA_BROKERS: kafka:9092
      REDIS_URL: redis://redis:6379
      NODE_ENV: test
    depends_on:
      postgres-ingestion:
        condition: service_healthy
      kafka:
        condition: service_healthy
      redis:
        condition: service_healthy

  enrichment:
    build:
      context: .
      dockerfile: backend/enrichment/Dockerfile
    environment:
      KAFKA_BROKERS: kafka:9092
      REDIS_URL: redis://redis:6379
      ESI_BASE_URL: https://esi.evetech.net
      NODE_ENV: test
    depends_on:
      kafka:
        condition: service_healthy
      redis:
        condition: service_healthy

  clusterer:
    build:
      context: .
      dockerfile: backend/clusterer/Dockerfile
    environment:
      DATABASE_URL: postgresql://battles_user:battles_pass@postgres-battles:5432/battles_db_test
      KAFKA_BROKERS: kafka:9092
      NODE_ENV: test
    depends_on:
      postgres-battles:
        condition: service_healthy
      kafka:
        condition: service_healthy
    ports:
      - "3001:3000"  # Expose for E2E tests

  search:
    build:
      context: .
      dockerfile: backend/search/Dockerfile
    environment:
      KAFKA_BROKERS: kafka:9092
      TYPESENSE_HOST: typesense
      TYPESENSE_PORT: 8108
      TYPESENSE_API_KEY: dev_api_key
      NODE_ENV: test
    depends_on:
      - kafka
      - typesense
    ports:
      - "3004:3000"

  typesense:
    image: typesense/typesense:0.25.1
    environment:
      TYPESENSE_DATA_DIR: /data
      TYPESENSE_API_KEY: dev_api_key
    tmpfs:
      - /data
```

---

## Support Scripts

### 4. Wait for Services Script

**Rule**: Scripts MUST wait for services to be healthy before proceeding.

**scripts/wait-for-services.sh**:

```bash
#!/bin/bash

# Wait for services to be healthy
# Usage: ./scripts/wait-for-services.sh [environment]
#   environment: dev (default) or test

set -e

ENVIRONMENT="${1:-dev}"
COMPOSE_FILE="docker-compose.${ENVIRONMENT}.yml"
MAX_WAIT=120  # 2 minutes
INTERVAL=2

echo "Waiting for services to be healthy..."

wait_for_service() {
  local service=$1
  local url=$2
  local elapsed=0

  echo -n "  $service: "

  while [ $elapsed -lt $MAX_WAIT ]; do
    if curl -sf "$url" > /dev/null 2>&1; then
      echo "✅ ready"
      return 0
    fi

    echo -n "."
    sleep $INTERVAL
    elapsed=$((elapsed + INTERVAL))
  done

  echo "❌ timeout"
  return 1
}

wait_for_postgres() {
  local service=$1
  local container="battlescope-${service}"
  local elapsed=0

  echo -n "  $service: "

  while [ $elapsed -lt $MAX_WAIT ]; do
    if docker-compose -f "$COMPOSE_FILE" exec -T "$service" pg_isready > /dev/null 2>&1; then
      echo "✅ ready"
      return 0
    fi

    echo -n "."
    sleep $INTERVAL
    elapsed=$((elapsed + INTERVAL))
  done

  echo "❌ timeout"
  return 1
}

wait_for_kafka() {
  local elapsed=0

  echo -n "  kafka: "

  while [ $elapsed -lt $MAX_WAIT ]; do
    if docker-compose -f "$COMPOSE_FILE" exec -T kafka kafka-broker-api-versions --bootstrap-server localhost:9092 > /dev/null 2>&1; then
      echo "✅ ready"
      return 0
    fi

    echo -n "."
    sleep $INTERVAL
    elapsed=$((elapsed + INTERVAL))
  done

  echo "❌ timeout"
  return 1
}

# Wait for infrastructure services
wait_for_postgres "postgres-battles"
wait_for_kafka
wait_for_service "redis" "http://localhost:6379"

# Wait for application services (if running)
if [ "$ENVIRONMENT" = "test" ]; then
  wait_for_service "clusterer" "http://localhost:3001/health/liveness"
  wait_for_service "search" "http://localhost:3004/health/liveness"
fi

echo ""
echo "✅ All services are ready!"
```

---

### 5. Database Seed Script

**Rule**: Seed data MUST be representative and useful for development.

**packages/database/src/seeds/dev-seed.ts**:

```typescript
// packages/database/src/seeds/dev-seed.ts
import { Kysely } from 'kysely';
import type { Database } from '../types';

export async function seed(db: Kysely<Database>): Promise<void> {
  console.log('Seeding development data...');

  // Clear existing data
  await db.deleteFrom('battle_participants').execute();
  await db.deleteFrom('battle_killmails').execute();
  await db.deleteFrom('battles').execute();

  // Seed battles
  const jitaBattle = await db
    .insertInto('battles')
    .values({
      id: 'battle-jita-001',
      systemId: 30000142n, // Jita
      startTime: new Date('2024-05-01T12:00:00Z'),
      endTime: new Date('2024-05-01T14:30:00Z'),
      totalKills: 42n,
      totalIskDestroyed: 15000000000n,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  const amarrBattle = await db
    .insertInto('battles')
    .values({
      id: 'battle-amarr-001',
      systemId: 30002187n, // Amarr
      startTime: new Date('2024-05-01T18:00:00Z'),
      endTime: new Date('2024-05-01T19:15:00Z'),
      totalKills: 23n,
      totalIskDestroyed: 8000000000n,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Seed participants
  await db
    .insertInto('battle_participants')
    .values([
      {
        battleId: jitaBattle.id,
        characterId: 12345n,
        side: 1,
        kills: 5n,
        losses: 1n,
      },
      {
        battleId: jitaBattle.id,
        characterId: 67890n,
        side: 2,
        kills: 3n,
        losses: 2n,
      },
      {
        battleId: amarrBattle.id,
        characterId: 11111n,
        side: 1,
        kills: 10n,
        losses: 0n,
      },
    ])
    .execute();

  console.log('✅ Seeding complete');
}
```

**package.json script**:

```json
{
  "scripts": {
    "seed": "tsx src/seeds/dev-seed.ts"
  }
}
```

---

## pnpm Workspace Configuration

### 6. Monorepo Setup

**Rule**: Use pnpm workspaces for monorepo management.

**pnpm-workspace.yaml**:

```yaml
packages:
  - 'backend/*'
  - 'packages/*'
  - 'frontend'
```

**Root package.json**:

```json
{
  "name": "battlescope",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "pnpm --parallel --filter './backend/*' run dev",
    "build": "pnpm --recursive run build",
    "test": "pnpm --recursive run test",
    "test:unit": "pnpm --recursive run test:unit",
    "test:integration": "pnpm --recursive run test:integration",
    "test:e2e": "vitest run --config vitest.e2e.config.ts",
    "test:coverage": "pnpm --recursive run test:coverage",
    "lint": "pnpm --recursive run lint",
    "lint:fix": "pnpm --recursive run lint:fix",
    "format": "prettier --write '**/*.{ts,tsx,json,md}'",
    "format:check": "prettier --check '**/*.{ts,tsx,json,md}'",
    "typecheck": "pnpm --recursive run typecheck",
    "clean": "pnpm --recursive run clean"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "prettier": "^3.1.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

---

## VS Code Configuration

### 7. Workspace Settings

**Rule**: Provide VS Code configuration for consistent developer experience.

**.vscode/settings.json**:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.turbo": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/coverage": true
  },
  "jest.autoRun": "off",
  "vitest.enable": true,
  "vitest.commandLine": "pnpm exec vitest"
}
```

**.vscode/extensions.json**:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "vitest.explorer",
    "ms-azuretools.vscode-docker",
    "mikestead.dotenv"
  ]
}
```

**.vscode/launch.json**:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Clusterer Service",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/backend/clusterer/src/index.ts",
      "preLaunchTask": "tsc: build - backend/clusterer/tsconfig.json",
      "outFiles": ["${workspaceFolder}/backend/clusterer/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development",
        "DATABASE_URL": "postgresql://battles_user:battles_pass@localhost:5432/battles_db",
        "KAFKA_BROKERS": "localhost:9092"
      }
    }
  ]
}
```

---

## Environment Variables

### 8. .env File Management

**Rule**: Use .env files for local configuration, never commit secrets.

**.env.example**:

```bash
# =============================================================================
# BattleScope Development Environment Configuration
# =============================================================================

# Copy this file to .env and fill in your values
# Never commit .env to version control!

# =============================================================================
# Databases
# =============================================================================

DATABASE_URL_INGESTION=postgresql://ingestion_user:ingestion_pass@localhost:5433/ingestion_db
DATABASE_URL_ENRICHMENT=postgresql://enrichment_user:enrichment_pass@localhost:5434/enrichment_db
DATABASE_URL_BATTLES=postgresql://battles_user:battles_pass@localhost:5432/battles_db
DATABASE_URL_NOTIFICATIONS=postgresql://notifications_user:notifications_pass@localhost:5435/notifications_db

# =============================================================================
# Message Broker
# =============================================================================

KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=battlescope-dev

# =============================================================================
# Cache & Session Store
# =============================================================================

REDIS_URL=redis://localhost:6379

# =============================================================================
# Search Engine
# =============================================================================

TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_API_KEY=dev_api_key

# =============================================================================
# External APIs
# =============================================================================

ESI_BASE_URL=https://esi.evetech.net
ESI_USER_AGENT=BattleScope/1.0 (development)

# =============================================================================
# Application
# =============================================================================

NODE_ENV=development
LOG_LEVEL=debug
PORT=3000

# =============================================================================
# Feature Flags (for development)
# =============================================================================

ENABLE_DEBUG_ENDPOINTS=true
ENABLE_SEED_DATA=true
```

**.gitignore**:

```gitignore
# Environment
.env
.env.local
.env.*.local

# Dependencies
node_modules/
.pnpm-store/

# Build artifacts
dist/
build/
*.tsbuildinfo

# Testing
coverage/
.nyc_output/

# Logs
logs/
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo
```

---

## Summary: The Golden Rules

1. **Makefile First** - All operations accessible via `make` commands
2. **Single Command Setup** - `make dev` starts entire environment
3. **Easy Reset** - `make db-reset` and `make kafka-reset` for clean state
4. **Docker Compose** - All dependencies in containers
5. **Isolated Test Environment** - Separate docker-compose.test.yml
6. **Fast Feedback** - Hot reload in development mode
7. **Health Checks** - Wait for services before proceeding
8. **Seed Data** - Representative data for development
9. **.env.example** - Document all configuration options
10. **Self-Documenting** - `make help` shows all commands

---

## How Claude Should Use This Skill

When I (Claude) am:

- **Setting up projects**: Create Makefile with all required targets
- **Adding services**: Update docker-compose.dev.yml and docker-compose.test.yml
- **Writing documentation**: Reference Makefile commands
- **Creating migrations**: Add `db-migrate` step to setup
- **Adding environment variables**: Update .env.example
- **Troubleshooting**: Use `make health` and `make logs`

**If setup requires more than `make dev`, the environment is TOO COMPLEX.**

---

## References

- **Make Documentation** - https://www.gnu.org/software/make/manual/
- **Docker Compose** - https://docs.docker.com/compose/
- **pnpm Workspaces** - https://pnpm.io/workspaces
- **The Twelve-Factor App** - https://12factor.net/
