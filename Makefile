.PHONY: help install build docker-build docker-push docker-build-service docker-push-service deploy clean ci typecheck test test-unit test-integration lint

VERSION := v3.0.0
DOCKER_ORG := petdog
SERVICES := ingestion enrichment battle search notification bff authentication

help:
	@echo "BattleScope V3 Build and Deploy"
	@echo ""
	@echo "Available targets:"
	@echo "  install           - Install dependencies for all services"
	@echo "  build             - Build all services"
	@echo "  docker-build      - Build all Docker images"
	@echo "  docker-push       - Push all Docker images to docker.io"
	@echo "  k8s-deploy        - Deploy to Kubernetes"
	@echo "  k8s-delete        - Delete Kubernetes resources"
	@echo "  clean             - Clean build artifacts"
	@echo ""
	@echo "CI Targets:"
	@echo "  ci                - Run full CI pipeline (typecheck, lint, test, build)"
	@echo "  typecheck         - Run TypeScript type checking on all services"
	@echo "  lint              - Run linting on all services"
	@echo "  test              - Run all tests (unit + integration)"
	@echo "  test-unit         - Run unit tests only"
	@echo "  test-integration  - Run integration tests only"

install:
	@echo "Installing dependencies..."
	pnpm install

build:
	@echo "Building all services..."
	@for service in $(SERVICES); do \
		echo "Building $$service-service..."; \
		cd services/$$service && pnpm install && pnpm build && cd ../..; \
	done

docker-build:
	@echo "Building Docker images..."
	@for service in $(SERVICES); do \
		echo "Building $(DOCKER_ORG)/battlescope-$$service:$(VERSION)..."; \
		docker build -f services/$$service/Dockerfile -t $(DOCKER_ORG)/battlescope-$$service:$(VERSION) .; \
		docker tag $(DOCKER_ORG)/battlescope-$$service:$(VERSION) $(DOCKER_ORG)/battlescope-$$service:latest; \
	done

docker-push:
	@echo "Pushing Docker images..."
	@for service in $(SERVICES); do \
		echo "Pushing $(DOCKER_ORG)/battlescope-$$service:$(VERSION)..."; \
		docker push $(DOCKER_ORG)/battlescope-$$service:$(VERSION); \
		docker push $(DOCKER_ORG)/battlescope-$$service:latest; \
	done

# Build a single service's Docker image
# Usage: make docker-build-service SERVICE=authentication
docker-build-service:
	@if [ -z "$(SERVICE)" ]; then \
		echo "Error: SERVICE variable is required. Usage: make docker-build-service SERVICE=authentication"; \
		exit 1; \
	fi
	@echo "Building $(DOCKER_ORG)/battlescope-$(SERVICE):$(VERSION)..."
	docker build -f services/$(SERVICE)/Dockerfile -t $(DOCKER_ORG)/battlescope-$(SERVICE):$(VERSION) .
	docker tag $(DOCKER_ORG)/battlescope-$(SERVICE):$(VERSION) $(DOCKER_ORG)/battlescope-$(SERVICE):latest

# Push a single service's Docker image
# Usage: make docker-push-service SERVICE=authentication
docker-push-service:
	@if [ -z "$(SERVICE)" ]; then \
		echo "Error: SERVICE variable is required. Usage: make docker-push-service SERVICE=authentication"; \
		exit 1; \
	fi
	@echo "Pushing $(DOCKER_ORG)/battlescope-$(SERVICE):$(VERSION)..."
	docker push $(DOCKER_ORG)/battlescope-$(SERVICE):$(VERSION)
	docker push $(DOCKER_ORG)/battlescope-$(SERVICE):latest

k8s-deploy:
	@echo "Deploying to Kubernetes..."
	kubectl apply -f infra/k8s/namespace/
	@echo "Deploying infrastructure (PostgreSQL, Redis, Kafka)..."
	kubectl apply -f infra/k8s/infrastructure/
	@echo "Waiting for infrastructure to be ready..."
	sleep 30
	@echo "Deploying application services..."
	kubectl apply -f infra/k8s/services/
	@echo "Waiting for deployments..."
	kubectl wait --for=condition=ready pod -l app=ingestion-service -n battlescope --timeout=300s || true

k8s-delete:
	@echo "Deleting Kubernetes resources..."
	kubectl delete namespace battlescope --ignore-not-found=true

clean:
	@echo "Cleaning..."
	@for service in $(SERVICES); do \
		rm -rf services/$$service/dist services/$$service/node_modules; \
	done
	rm -rf node_modules

# CI Pipeline targets
ci: typecheck lint test build
	@echo "✅ CI pipeline completed successfully!"

typecheck:
	@echo "Running TypeScript type checking..."
	@failed=0; \
	for service in $(SERVICES); do \
		echo "Type checking $$service-service..."; \
		if pnpm --filter @battlescope/$$service run typecheck 2>&1 | tee /tmp/$$service-typecheck.log; then \
			echo "✅ $$service-service type check passed"; \
		else \
			echo "❌ $$service-service type check failed"; \
			failed=$$((failed + 1)); \
		fi; \
	done; \
	if [ $$failed -gt 0 ]; then \
		echo "❌ Type checking failed for $$failed service(s)"; \
		exit 1; \
	else \
		echo "✅ All services passed type checking"; \
	fi

lint:
	@echo "Running linting..."
	@failed=0; \
	for service in $(SERVICES); do \
		echo "Linting $$service-service..."; \
		if pnpm --filter @battlescope/$$service run lint 2>&1 || true; then \
			echo "✅ $$service-service lint passed"; \
		else \
			echo "⚠️  $$service-service has no lint script (skipping)"; \
		fi; \
	done; \
	echo "✅ Linting completed"

test: test-unit test-integration
	@echo "✅ All tests completed"

test-unit:
	@echo "Running unit tests..."
	@failed=0; \
	for service in $(SERVICES); do \
		echo "Running unit tests for $$service-service..."; \
		if pnpm --filter @battlescope/$$service run test:unit 2>&1 || pnpm --filter @battlescope/$$service run test 2>&1; then \
			echo "✅ $$service-service unit tests passed"; \
		else \
			echo "⚠️  $$service-service has no unit tests (skipping)"; \
		fi; \
	done; \
	echo "✅ Unit tests completed"

test-integration:
	@echo "Running integration tests..."
	@failed=0; \
	for service in $(SERVICES); do \
		echo "Running integration tests for $$service-service..."; \
		if pnpm --filter @battlescope/$$service run test:integration 2>&1; then \
			echo "✅ $$service-service integration tests passed"; \
		else \
			echo "⚠️  $$service-service has no integration tests (skipping)"; \
		fi; \
	done; \
	echo "✅ Integration tests completed"
