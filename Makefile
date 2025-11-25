.PHONY: help install build docker-build docker-push deploy clean

VERSION := v3.0.0
DOCKER_ORG := battlescope
SERVICES := ingestion enrichment battle search notification bff

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
		echo "Building $(DOCKER_ORG)/$$service-service:$(VERSION)..."; \
		docker build -f services/$$service/Dockerfile -t $(DOCKER_ORG)/$$service-service:$(VERSION) .; \
		docker tag $(DOCKER_ORG)/$$service-service:$(VERSION) $(DOCKER_ORG)/$$service-service:latest; \
	done

docker-push:
	@echo "Pushing Docker images..."
	@for service in $(SERVICES); do \
		echo "Pushing $(DOCKER_ORG)/$$service-service:$(VERSION)..."; \
		docker push $(DOCKER_ORG)/$$service-service:$(VERSION); \
		docker push $(DOCKER_ORG)/$$service-service:latest; \
	done

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
