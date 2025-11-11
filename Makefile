SHELL := /bin/bash

.PHONY: install install-ci clean build lint test test-watch typecheck format format-check dev ingest db-migrate db-migrate-make generate-openapi ci compose-up compose-down compose-logs compose-remote-up compose-remote-down battlescope-images-clean k8s-build-push k8s-redeploy k8s-restart-observability k8s-reset k8s-reset-force k8s-deploy-all

install:
	pnpm install

install-ci:
	pnpm install --frozen-lockfile

clean:
	pnpm run clean

build:
	pnpm run build

lint:
	pnpm run lint

test:
	pnpm run test

test-watch:
	pnpm run test:watch

typecheck:
	pnpm run typecheck

format:
	pnpm run format

format-check:
	pnpm run format:check

dev:
	pnpm dev

ingest:
	pnpm ingest:start

db-migrate:
	pnpm run db:migrate

db-migrate-make:
ifndef NAME
	$(error NAME is required, e.g. make db-migrate-make NAME=create_table)
endif
	pnpm run db:migrate:make $(NAME)

generate-openapi:
	@echo "🔧 Generating OpenAPI specification..."
	cd backend/api && pnpm run generate-openapi
	@echo "✅ OpenAPI spec generated at docs/openapi.json and docs/openapi-generated.yaml"

ci: install-ci build format-check lint typecheck test

compose-up:
	docker compose up --build

compose-down:
	docker compose down --remove-orphans

compose-logs:
	docker compose logs -f

compose-remote-up:
	docker compose -f docker-compose.remote.yml up --pull always

compose-remote-down:
	docker compose -f docker-compose.remote.yml down --remove-orphans

battlescope-images-clean:
	@set -e; \
	images=$$(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep 'battlescope' || true); \
	if [ -n "$$images" ]; then \
		echo "Removing Battlescope images:"; \
		echo "$$images"; \
		docker image rm -f $$images; \
	else \
		echo "No Battlescope images found."; \
	fi

k8s-build-push:
	@echo "Building and pushing all k8s images for arm64..."
	@echo "Building frontend..."
	docker buildx build --platform linux/arm64 --push \
		-t docker.io/petdog/battlescope-frontend:latest \
		-f frontend/Dockerfile .
	@echo "Building api..."
	docker buildx build --platform linux/arm64 --push \
		--build-arg SERVICE_SCOPE=@battlescope/api \
		--build-arg BUILD_TARGET=backend/api \
		-t docker.io/petdog/battlescope-api:latest \
		-f Dockerfile .
	@echo "Building ingest..."
	docker buildx build --platform linux/arm64 --push \
		--build-arg SERVICE_SCOPE=@battlescope/ingest \
		--build-arg BUILD_TARGET=backend/ingest \
		-t docker.io/petdog/battlescope-ingest:latest \
		-f Dockerfile .
	@echo "Building enrichment..."
	docker buildx build --platform linux/arm64 --push \
		--build-arg SERVICE_SCOPE=@battlescope/enrichment \
		--build-arg BUILD_TARGET=backend/enrichment \
		-t docker.io/petdog/battlescope-enrichment:latest \
		-f Dockerfile .
	@echo "Building clusterer..."
	docker buildx build --platform linux/arm64 --push \
		--build-arg SERVICE_SCOPE=@battlescope/clusterer \
		--build-arg BUILD_TARGET=backend/clusterer \
		-t docker.io/petdog/battlescope-clusterer:latest \
		-f Dockerfile .
	@echo "Building scheduler..."
	docker buildx build --platform linux/arm64 --push \
		--build-arg SERVICE_SCOPE=@battlescope/scheduler \
		--build-arg BUILD_TARGET=backend/scheduler \
		-t docker.io/petdog/battlescope-scheduler:latest \
		-f Dockerfile .
	@echo "Building db-migrate..."
	docker buildx build --platform linux/arm64 --push \
		--build-arg SERVICE_SCOPE=@battlescope/database \
		--build-arg BUILD_TARGET=packages/database \
		-t docker.io/petdog/battlescope-db-migrate:latest \
		-f Dockerfile .
		@echo "Building verifier..."
		docker buildx build --platform linux/arm64 --push \
			--build-arg SERVICE_SCOPE=@battlescope/verifier \
			--build-arg BUILD_TARGET=packages/verifier \
			-t docker.io/petdog/battlescope-verifier:latest \
			-f Dockerfile .
	@echo "All images built and pushed successfully!"

k8s-redeploy:
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

k8s-restart-observability:
	@echo "🔄 Restarting observability stack to pick up config changes..."
	@echo "Restarting OTEL Collector..."
	kubectl rollout restart deployment/otel-collector -n battlescope
	@echo "Restarting Grafana..."
	kubectl rollout restart deployment/grafana -n battlescope
	@echo "Restarting Loki..."
	kubectl rollout restart statefulset/loki -n battlescope
	@echo "✅ Observability stack restarted successfully!"

k8s-deploy-all:
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

k8s-reset-force:
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

k8s-reset:
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
