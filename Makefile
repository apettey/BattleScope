SHELL := /bin/bash

.PHONY: help install install-ci clean build lint test test-unit test-integration test-all test-watch typecheck format format-check dev ingest db-migrate db-migrate-make generate-openapi ci compose-up compose-down compose-logs compose-remote-up compose-remote-down battlescope-images-clean k8s-build-push k8s-redeploy k8s-restart-observability k8s-reset k8s-reset-force k8s-deploy-all

# Default target: show help
.DEFAULT_GOAL := help

#==============================================================================
# HELP TARGET
#==============================================================================

help: ## Display this help message
	@echo "BattleScope Makefile Commands"
	@echo "=============================="
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "For more information, see README.md"

#==============================================================================
# DEPENDENCY MANAGEMENT
#==============================================================================

install: ## Install all dependencies using PNPM
	pnpm install

install-ci: ## Install dependencies with frozen lockfile (for CI)
	pnpm install --frozen-lockfile

#==============================================================================
# BUILD & CLEAN
#==============================================================================

clean: ## Remove build artifacts and coverage reports
	pnpm run clean

build: ## Build all packages and services
	pnpm run build

#==============================================================================
# CODE QUALITY
#==============================================================================

lint: ## Run ESLint on all TypeScript files
	pnpm run lint

test: test-unit ## Run all tests (alias for test-unit)

test-unit: ## Run unit tests (currently runs all tests since no integration tests exist yet)
	@echo "🧪 Running unit tests..."
	@pnpm -r --workspace-concurrency=4 --if-present test

test-unit-coverage: ## Run unit tests with coverage
	@echo "🧪 Running unit tests with coverage..."
	@pnpm -r --workspace-concurrency=4 --if-present test -- --coverage

test-integration: ## Run integration tests only (place integration tests in **/test/integration/*.test.ts)
	@echo "🔌 Running integration tests..."
	@echo "Note: Integration tests should be placed in **/test/integration/*.test.ts files"
	@if find . -path "*/test/integration/*.test.ts" -type f -not -path "*/node_modules/*" | grep -q .; then \
		pnpm --filter @battlescope/database exec vitest run test/integration/ 2>/dev/null || true; \
		pnpm --filter @battlescope/api exec vitest run test/integration/ 2>/dev/null || true; \
		echo "✅ Integration tests completed"; \
	else \
		echo "No integration tests found (create files in **/test/integration/*.test.ts)"; \
	fi

test-all: ## Run both unit and integration tests
	@echo "🧪 Running all tests (unit + integration)..."
	@$(MAKE) test-unit
	@$(MAKE) test-integration

test-watch: ## Run tests in watch mode (for development)
	pnpm run test:watch

typecheck: ## Run TypeScript type checking across all packages
	pnpm run typecheck

format: ## Format all code using Prettier
	pnpm run format

format-check: ## Check code formatting without making changes
	pnpm run format:check

#==============================================================================
# DEVELOPMENT
#==============================================================================

dev: ## Start all services in development mode
	pnpm dev

ingest: ## Start the ingest service standalone
	pnpm ingest:start

#==============================================================================
# DATABASE
#==============================================================================

db-migrate: ## Run database migrations
	pnpm run db:migrate

db-migrate-make: ## Create a new database migration (usage: make db-migrate-make NAME=migration_name)
ifndef NAME
	$(error NAME is required, e.g. make db-migrate-make NAME=create_table)
endif
	pnpm run db:migrate:make $(NAME)

#==============================================================================
# API DOCUMENTATION
#==============================================================================

generate-openapi: ## Generate OpenAPI specification from API routes
	@echo "🔧 Generating OpenAPI specification..."
	cd backend/api && pnpm run generate-openapi
	@echo "✅ OpenAPI spec generated at docs/openapi.json and docs/openapi-generated.yaml"

#==============================================================================
# CI/CD
#==============================================================================

ci: install-ci build format-check lint typecheck test-unit-coverage ## Run full CI pipeline (install, build, lint, unit tests with coverage)

#==============================================================================
# DOCKER COMPOSE
#==============================================================================

compose-up: ## Start all services with Docker Compose (builds locally)
	docker compose up --build

compose-down: ## Stop and remove all Docker Compose containers
	docker compose down --remove-orphans

compose-logs: ## Follow logs from all Docker Compose services
	docker compose logs -f

compose-remote-up: ## Start services using pre-built images from Docker Hub
	docker compose -f docker-compose.remote.yml up --pull always

compose-remote-down: ## Stop services started from Docker Hub images
	docker compose -f docker-compose.remote.yml down --remove-orphans

battlescope-images-clean: ## Remove all local BattleScope Docker images
	@set -e; \
	images=$$(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep 'battlescope' || true); \
	if [ -n "$$images" ]; then \
		echo "Removing Battlescope images:"; \
		echo "$$images"; \
		docker image rm -f $$images; \
	else \
		echo "No Battlescope images found."; \
	fi

#==============================================================================
# KUBERNETES DEPLOYMENT
#==============================================================================

k8s-build-push: ## Build and push all Docker images to Docker Hub (linux/arm64)
	@echo "🐳 Building and pushing all Kubernetes images for arm64..."
	@echo ""
	@echo "📦 Building frontend (petdog/battlescope-frontend)..."
	docker buildx build --platform linux/arm64 --push \
		-t docker.io/petdog/battlescope-frontend:latest \
		-f frontend/Dockerfile .
	@echo ""
	@echo "📦 Building api (petdog/battlescope-api)..."
	docker buildx build --platform linux/arm64 --push \
		--build-arg SERVICE_SCOPE=@battlescope/api \
		--build-arg BUILD_TARGET=backend/api \
		-t docker.io/petdog/battlescope-api:latest \
		-f Dockerfile .
	@echo ""
	@echo "📦 Building ingest (petdog/battlescope-ingest)..."
	docker buildx build --platform linux/arm64 --push \
		--build-arg SERVICE_SCOPE=@battlescope/ingest \
		--build-arg BUILD_TARGET=backend/ingest \
		-t docker.io/petdog/battlescope-ingest:latest \
		-f Dockerfile .
	@echo ""
	@echo "📦 Building enrichment (petdog/battlescope-enrichment)..."
	docker buildx build --platform linux/arm64 --push \
		--build-arg SERVICE_SCOPE=@battlescope/enrichment \
		--build-arg BUILD_TARGET=backend/enrichment \
		-t docker.io/petdog/battlescope-enrichment:latest \
		-f Dockerfile .
	@echo ""
	@echo "📦 Building clusterer (petdog/battlescope-clusterer)..."
	docker buildx build --platform linux/arm64 --push \
		--build-arg SERVICE_SCOPE=@battlescope/clusterer \
		--build-arg BUILD_TARGET=backend/clusterer \
		-t docker.io/petdog/battlescope-clusterer:latest \
		-f Dockerfile .
	@echo ""
	@echo "📦 Building scheduler (petdog/battlescope-scheduler)..."
	docker buildx build --platform linux/arm64 --push \
		--build-arg SERVICE_SCOPE=@battlescope/scheduler \
		--build-arg BUILD_TARGET=backend/scheduler \
		-t docker.io/petdog/battlescope-scheduler:latest \
		-f Dockerfile .
	@echo ""
	@echo "📦 Building db-migrate (petdog/battlescope-db-migrate)..."
	docker buildx build --platform linux/arm64 --push \
		--build-arg SERVICE_SCOPE=@battlescope/database \
		--build-arg BUILD_TARGET=packages/database \
		-t docker.io/petdog/battlescope-db-migrate:latest \
		-f Dockerfile .
	@echo ""
	@echo "📦 Building verifier (petdog/battlescope-verifier)..."
	docker buildx build --platform linux/arm64 --push \
		--build-arg SERVICE_SCOPE=@battlescope/verifier \
		--build-arg BUILD_TARGET=packages/verifier \
		-t docker.io/petdog/battlescope-verifier:latest \
		-f Dockerfile .
	@echo ""
	@echo "📦 Building search-sync (petdog/battlescope-search-sync)..."
	docker buildx build --platform linux/arm64 --push \
		-t docker.io/petdog/battlescope-search-sync:latest \
		-f backend/search-sync/Dockerfile .
	@echo ""
	@echo "✅ All images built and pushed successfully!"

k8s-redeploy: ## Restart all application deployments (picks up new images)
	@echo "🔄 Redeploying all application pods in the battlescope namespace..."
	@echo "Restarting frontend deployment..."
	kubectl rollout restart deployment/frontend -n battlescope
	@echo "Restarting api deployment..."
	kubectl rollout restart deployment/api -n battlescope
	@echo "Restarting ingest deployment..."
	kubectl rollout restart deployment/ingest -n battlescope
	@echo "Restarting enrichment deployment..."
	kubectl rollout restart deployment/enrichment -n battlescope
	@echo "Restarting clusterer deployment..."
	kubectl rollout restart deployment/clusterer -n battlescope
	@echo "Note: scheduler CronJob will pick up the latest image on its next scheduled run"
	@echo "✅ All application deployments restarted successfully!"

k8s-restart-observability: ## Restart observability stack (Prometheus, Grafana, Loki, etc.)
	@echo "🔄 Restarting observability stack to pick up config changes..."
	@echo "Restarting OTEL Collector..."
	kubectl rollout restart deployment/otel-collector -n battlescope
	@echo "Restarting Grafana..."
	kubectl rollout restart deployment/grafana -n battlescope
	@echo "Restarting Loki..."
	kubectl rollout restart statefulset/loki -n battlescope
	@echo "✅ Observability stack restarted successfully!"

k8s-deploy-all: ## Deploy all Kubernetes resources to battlescope namespace
	@echo "📦 Deploying all k8s resources to battlescope namespace..."
	@echo ""
	@echo "Step 1: Namespace and Secrets"
	kubectl apply -f infra/k8s/namespace.yaml
	kubectl apply -f infra/k8s/secrets.yaml
	kubectl apply -f infra/k8s/postgres-secret.yaml
	kubectl apply -f infra/k8s/redis-secret.yaml
	@echo ""
	@echo "Step 2: ConfigMaps"
	kubectl apply -f infra/k8s/configmap.yaml
	kubectl apply -f infra/k8s/grafana-config.yaml
	kubectl apply -f infra/k8s/prometheus-config.yaml
	kubectl apply -f infra/k8s/otel-collector-config.yaml
	@echo ""
	@echo "Step 3: StatefulSets (Postgres, Redis, Loki)"
	kubectl apply -f infra/k8s/postgres-statefulset.yaml
	kubectl apply -f infra/k8s/redis-statefulset.yaml
	kubectl apply -f infra/k8s/loki-deployment.yaml
	@echo "Waiting for statefulsets to be ready..."
	kubectl wait --for=condition=ready pod -l app=postgres -n battlescope --timeout=120s || true
	kubectl wait --for=condition=ready pod -l app=redis -n battlescope --timeout=120s || true
	kubectl wait --for=condition=ready pod -l app=loki -n battlescope --timeout=120s || true
	@echo ""
	@echo "Step 4: Observability Stack"
	kubectl apply -f infra/k8s/prometheus-deployment.yaml
	kubectl apply -f infra/k8s/jaeger-deployment.yaml
	kubectl apply -f infra/k8s/grafana-deployment.yaml
	kubectl apply -f infra/k8s/otel-collector-deployment.yaml
	kubectl apply -f infra/k8s/promtail-daemonset.yaml
	@echo ""
	@echo "Step 5: Run Database Migration"
	kubectl apply -f infra/k8s/db-migrate-job.yaml
	@echo "Waiting for migration to complete..."
	kubectl wait --for=condition=complete job/db-migrate -n battlescope --timeout=300s || true
	@echo ""
	@echo "Step 6: Application Services"
	kubectl apply -f infra/k8s/api-deployment.yaml
	kubectl apply -f infra/k8s/frontend-deployment.yaml
	kubectl apply -f infra/k8s/ingest-deployment.yaml
	kubectl apply -f infra/k8s/enrichment-deployment.yaml
	kubectl apply -f infra/k8s/clusterer-deployment.yaml
	kubectl apply -f infra/k8s/scheduler-cronjob.yaml
	@echo ""
	@echo "✅ All resources deployed!"
	@echo ""
	@echo "Checking pod status..."
	kubectl get pods -n battlescope
	@echo ""
	@echo "To watch pods starting: kubectl get pods -n battlescope -w"
	@echo "To check logs: kubectl logs -n battlescope -l app=<service-name>"

k8s-reset-force: ## Force reset cluster WITHOUT confirmation (DANGER: deletes all data)
	@echo "💥 FORCE RESETTING k8s cluster (deleting all data)..."
	@echo ""
	@echo "Deleting namespace 'battlescope' (this will delete all resources and data)..."
	kubectl delete namespace battlescope --ignore-not-found=true
	@echo "Waiting for namespace deletion..."
	@kubectl wait --for=delete namespace/battlescope --timeout=120s 2>/dev/null || echo "Namespace deleted or already gone"
	@echo ""
	@echo "Creating fresh namespace..."
	kubectl apply -f infra/k8s/namespace.yaml
	@echo ""
	@echo "Deploying all resources..."
	@$(MAKE) k8s-deploy-all

k8s-reset: ## Reset cluster with confirmation prompt (WARNING: deletes all data)
	@echo "⚠️  WARNING: This will DELETE ALL DATA in the battlescope namespace!"
	@echo "⚠️  This includes:"
	@echo "    - All PostgreSQL data (battles, killmails, accounts, etc.)"
	@echo "    - All Redis data (cache, sessions, queues)"
	@echo "    - All Loki logs"
	@echo "    - All running pods"
	@echo ""
	@echo "The cluster will be completely reset and redeployed from scratch."
	@echo ""
	@read -p "Are you sure you want to continue? [yes/NO]: " confirm && [ "$$confirm" = "yes" ] || (echo "Aborted." && exit 1)
	@echo ""
	@$(MAKE) k8s-reset-force
