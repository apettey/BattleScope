SHELL := /bin/bash

.PHONY: install install-ci clean build lint test test-watch typecheck format format-check dev ingest db-migrate db-migrate-make generate-openapi ci compose-up compose-down compose-logs compose-remote-up compose-remote-down battlescope-images-clean k8s-build-push k8s-redeploy

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
