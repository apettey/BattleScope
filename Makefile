SHELL := /bin/bash

.PHONY: install install-ci clean build lint test test-watch typecheck format format-check dev ingest db-migrate db-migrate-make generate-openapi ci compose-up compose-down compose-logs compose-remote-up compose-remote-down battlescope-images-clean

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
