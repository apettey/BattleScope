# Claude Skill: Makefile Standards and Conventions

**Purpose**: Standardize Makefile creation across all projects for consistent developer experience, comprehensive help documentation, and seamless CI/CD integration.

---

## Core Principle

**Every project MUST have a Makefile that serves as the single source of truth for all operations, is self-documenting, and works identically in local development and CI/CD.**

**Rationale**:
- Makefiles provide a universal interface (works on all Unix systems)
- Self-documenting help reduces onboarding time
- Consistent commands across all services reduce cognitive load
- CI/CD can use same commands as developers (no drift)
- Discoverability through `make help`

---

## Makefile Structure

### 1. Standard Template

**Rule**: ALL Makefiles MUST follow this structure.

**Template**:

```makefile
# =============================================================================
# Project Name - Makefile
# =============================================================================
# Description: Brief description of what this project does
# Usage: make [target]
# =============================================================================

# Shell configuration
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

# Disable built-in rules and variables
MAKEFLAGS += --no-builtin-rules
MAKEFLAGS += --no-builtin-variables

# Project variables
PROJECT_NAME := project-name
VERSION := $(shell cat VERSION 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Directories
SRC_DIR := src
BUILD_DIR := dist
COVERAGE_DIR := coverage

# Colors for output
COLOR_RESET := \033[0m
COLOR_BOLD := \033[1m
COLOR_GREEN := \033[32m
COLOR_YELLOW := \033[33m
COLOR_BLUE := \033[34m
COLOR_RED := \033[31m

# =============================================================================
# Help Target (MUST be first target)
# =============================================================================

.PHONY: help
help: ## Show this help message
	@echo "$(COLOR_BOLD)$(PROJECT_NAME)$(COLOR_RESET) - Version $(VERSION)"
	@echo ""
	@echo "$(COLOR_BOLD)Usage:$(COLOR_RESET) make [target]"
	@echo ""
	@echo "$(COLOR_BOLD)Available targets:$(COLOR_RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(COLOR_BLUE)%-20s$(COLOR_RESET) %s\n", $$1, $$2}' | \
		sort
	@echo ""
	@echo "$(COLOR_BOLD)Examples:$(COLOR_RESET)"
	@echo "  make dev              # Start development environment"
	@echo "  make test             # Run all tests"
	@echo "  make ci               # Run all CI checks"
	@echo ""

.DEFAULT_GOAL := help

# =============================================================================
# Dependencies
# =============================================================================

.PHONY: install
install: ## Install project dependencies
	@echo "$(COLOR_GREEN)Installing dependencies...$(COLOR_RESET)"
	pnpm install --frozen-lockfile
	@echo "$(COLOR_GREEN)✅ Dependencies installed$(COLOR_RESET)"

.PHONY: install-dev
install-dev: ## Install development dependencies (no frozen lockfile)
	@echo "$(COLOR_YELLOW)Installing dependencies (dev mode)...$(COLOR_RESET)"
	pnpm install
	@echo "$(COLOR_GREEN)✅ Dependencies installed$(COLOR_RESET)"

# =============================================================================
# Development
# =============================================================================

.PHONY: dev
dev: ## Start development server with hot reload
	@echo "$(COLOR_GREEN)Starting development server...$(COLOR_RESET)"
	pnpm run dev

.PHONY: build
build: ## Build project for production
	@echo "$(COLOR_GREEN)Building project...$(COLOR_RESET)"
	pnpm run build
	@echo "$(COLOR_GREEN)✅ Build complete$(COLOR_RESET)"

.PHONY: clean
clean: ## Remove build artifacts and dependencies
	@echo "$(COLOR_YELLOW)Cleaning build artifacts...$(COLOR_RESET)"
	rm -rf $(BUILD_DIR)
	rm -rf $(COVERAGE_DIR)
	rm -rf node_modules
	rm -rf .turbo
	@echo "$(COLOR_GREEN)✅ Clean complete$(COLOR_RESET)"

# =============================================================================
# Testing
# =============================================================================

.PHONY: test
test: ## Run all tests
	@echo "$(COLOR_GREEN)Running tests...$(COLOR_RESET)"
	pnpm run test

.PHONY: test-unit
test-unit: ## Run unit tests only
	@echo "$(COLOR_GREEN)Running unit tests...$(COLOR_RESET)"
	pnpm run test:unit

.PHONY: test-integration
test-integration: ## Run integration tests
	@echo "$(COLOR_GREEN)Running integration tests...$(COLOR_RESET)"
	pnpm run test:integration

.PHONY: test-watch
test-watch: ## Run tests in watch mode
	@echo "$(COLOR_GREEN)Running tests in watch mode...$(COLOR_RESET)"
	pnpm run test:watch

.PHONY: test-coverage
test-coverage: ## Run tests with coverage report
	@echo "$(COLOR_GREEN)Running tests with coverage...$(COLOR_RESET)"
	pnpm run test:coverage
	@echo ""
	@echo "$(COLOR_BOLD)Coverage Report:$(COLOR_RESET)"
	@cat $(COVERAGE_DIR)/coverage-summary.json | \
		jq -r '.total | "  Lines: \(.lines.pct)%\n  Functions: \(.functions.pct)%\n  Branches: \(.branches.pct)%\n  Statements: \(.statements.pct)%"'

.PHONY: coverage-check
coverage-check: test-coverage ## Check if coverage meets threshold (80%)
	@echo "$(COLOR_GREEN)Checking coverage threshold...$(COLOR_RESET)"
	@COVERAGE=$$(cat $(COVERAGE_DIR)/coverage-summary.json | jq '.total.lines.pct'); \
	if (( $$(echo "$$COVERAGE < 80" | bc -l) )); then \
		echo "$(COLOR_RED)❌ Coverage $$COVERAGE% is below 80% threshold$(COLOR_RESET)"; \
		exit 1; \
	else \
		echo "$(COLOR_GREEN)✅ Coverage $$COVERAGE% meets threshold$(COLOR_RESET)"; \
	fi

# =============================================================================
# Code Quality
# =============================================================================

.PHONY: lint
lint: ## Run linter
	@echo "$(COLOR_GREEN)Running linter...$(COLOR_RESET)"
	pnpm run lint

.PHONY: lint-fix
lint-fix: ## Fix linting errors automatically
	@echo "$(COLOR_GREEN)Fixing linting errors...$(COLOR_RESET)"
	pnpm run lint:fix
	@echo "$(COLOR_GREEN)✅ Linting complete$(COLOR_RESET)"

.PHONY: format
format: ## Format code with Prettier
	@echo "$(COLOR_GREEN)Formatting code...$(COLOR_RESET)"
	pnpm run format
	@echo "$(COLOR_GREEN)✅ Formatting complete$(COLOR_RESET)"

.PHONY: format-check
format-check: ## Check code formatting
	@echo "$(COLOR_GREEN)Checking code formatting...$(COLOR_RESET)"
	pnpm run format:check

.PHONY: typecheck
typecheck: ## Run TypeScript type checking
	@echo "$(COLOR_GREEN)Running type check...$(COLOR_RESET)"
	pnpm run typecheck
	@echo "$(COLOR_GREEN)✅ Type check passed$(COLOR_RESET)"

# =============================================================================
# CI/CD Targets
# =============================================================================

.PHONY: ci
ci: install typecheck lint format-check coverage-check ## Run all CI checks
	@echo ""
	@echo "$(COLOR_GREEN)$(COLOR_BOLD)✅ All CI checks passed!$(COLOR_RESET)"

.PHONY: ci-fast
ci-fast: typecheck lint format-check test ## Run CI checks without coverage
	@echo ""
	@echo "$(COLOR_GREEN)$(COLOR_BOLD)✅ Fast CI checks passed!$(COLOR_RESET)"

# =============================================================================
# Utility Targets
# =============================================================================

.PHONY: version
version: ## Show project version
	@echo "$(COLOR_BOLD)Project:$(COLOR_RESET) $(PROJECT_NAME)"
	@echo "$(COLOR_BOLD)Version:$(COLOR_RESET) $(VERSION)"
	@echo "$(COLOR_BOLD)Git Commit:$(COLOR_RESET) $(GIT_COMMIT)"
	@echo "$(COLOR_BOLD)Build Time:$(COLOR_RESET) $(BUILD_TIME)"

.PHONY: info
info: version ## Show project information
	@echo "$(COLOR_BOLD)Node Version:$(COLOR_RESET) $$(node --version)"
	@echo "$(COLOR_BOLD)pnpm Version:$(COLOR_RESET) $$(pnpm --version)"
	@echo "$(COLOR_BOLD)TypeScript Version:$(COLOR_RESET) $$(pnpm exec tsc --version)"

# =============================================================================
# Validation (internal targets)
# =============================================================================

.PHONY: validate-makefile
validate-makefile: ## Validate Makefile syntax and conventions
	@echo "$(COLOR_GREEN)Validating Makefile...$(COLOR_RESET)"
	@if ! grep -q '^.DEFAULT_GOAL := help' $(MAKEFILE_LIST); then \
		echo "$(COLOR_RED)❌ Missing .DEFAULT_GOAL := help$(COLOR_RESET)"; \
		exit 1; \
	fi
	@if ! grep -q '^help:.*## Show this help message' $(MAKEFILE_LIST); then \
		echo "$(COLOR_RED)❌ Missing help target$(COLOR_RESET)"; \
		exit 1; \
	fi
	@echo "$(COLOR_GREEN)✅ Makefile is valid$(COLOR_RESET)"
```

---

## Standard Target Categories

### 2. Required Targets

**Rule**: ALL Makefiles MUST implement these targets.

**Required Targets**:

| Target | Description | Example Usage |
|--------|-------------|---------------|
| `help` | Show help (MUST be default) | `make` or `make help` |
| `install` | Install dependencies | `make install` |
| `build` | Build project | `make build` |
| `test` | Run all tests | `make test` |
| `lint` | Run linter | `make lint` |
| `format` | Format code | `make format` |
| `typecheck` | Type check | `make typecheck` |
| `ci` | Run all CI checks | `make ci` |
| `clean` | Clean artifacts | `make clean` |

**Implementation Example**:

```makefile
.PHONY: help
help: ## Show this help message
	@echo "Usage: make [target]"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

.DEFAULT_GOAL := help

.PHONY: install
install: ## Install project dependencies
	pnpm install --frozen-lockfile

.PHONY: build
build: ## Build project for production
	pnpm run build

.PHONY: test
test: ## Run all tests
	pnpm run test

.PHONY: lint
lint: ## Run linter
	pnpm run lint

.PHONY: format
format: ## Format code with Prettier
	pnpm run format

.PHONY: typecheck
typecheck: ## Run TypeScript type checking
	pnpm run typecheck

.PHONY: ci
ci: install typecheck lint format-check test-coverage ## Run all CI checks
	@echo "✅ All CI checks passed!"

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf dist coverage node_modules
```

---

### 3. Optional but Recommended Targets

**Service-Specific Targets**:

```makefile
# For services with databases
.PHONY: db-migrate
db-migrate: ## Run database migrations
	pnpm run migrate:latest

.PHONY: db-reset
db-reset: ## Reset database (WARNING: deletes all data)
	@echo "⚠️  WARNING: This will delete all data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		pnpm run migrate:rollback --all; \
		pnpm run migrate:latest; \
		pnpm run seed; \
	fi

.PHONY: db-seed
db-seed: ## Seed database with test data
	pnpm run seed

# For services with Docker
.PHONY: docker-build
docker-build: ## Build Docker image
	docker build -t $(PROJECT_NAME):$(VERSION) .

.PHONY: docker-run
docker-run: ## Run Docker container
	docker run -p 3000:3000 $(PROJECT_NAME):$(VERSION)

# For services with contracts
.PHONY: contract-validate
contract-validate: ## Validate API contracts
	pnpm run contract:validate

.PHONY: contract-test
contract-test: ## Run contract tests
	pnpm run test:contract
```

---

## Root Makefile for Monorepo

### 4. Monorepo Pattern

**Rule**: Root Makefile MUST orchestrate all services.

**Root Makefile**:

```makefile
# =============================================================================
# BattleScope - Root Makefile
# =============================================================================

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

# Services
SERVICES := clusterer enrichment ingest search

# Colors
COLOR_RESET := \033[0m
COLOR_GREEN := \033[32m
COLOR_BLUE := \033[34m

.PHONY: help
help: ## Show this help message
	@echo "BattleScope Monorepo - Root Makefile"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(COLOR_BLUE)%-20s$(COLOR_RESET) %s\n", $$1, $$2}' | \
		sort
	@echo ""
	@echo "Service-specific targets:"
	@echo "  make <service>-<target>  # Run target for specific service"
	@echo "  Example: make clusterer-test"
	@echo ""

.DEFAULT_GOAL := help

# =============================================================================
# Global Targets
# =============================================================================

.PHONY: install
install: ## Install all dependencies
	@echo "$(COLOR_GREEN)Installing dependencies...$(COLOR_RESET)"
	pnpm install --frozen-lockfile

.PHONY: build
build: ## Build all services
	@echo "$(COLOR_GREEN)Building all services...$(COLOR_RESET)"
	pnpm --recursive run build

.PHONY: test
test: ## Run tests for all services
	@echo "$(COLOR_GREEN)Running tests for all services...$(COLOR_RESET)"
	pnpm --recursive run test

.PHONY: test-unit
test-unit: ## Run unit tests for all services
	pnpm --recursive run test:unit

.PHONY: test-integration
test-integration: ## Run integration tests for all services
	pnpm --recursive run test:integration

.PHONY: lint
lint: ## Lint all services
	pnpm --recursive run lint

.PHONY: lint-fix
lint-fix: ## Fix linting errors in all services
	pnpm --recursive run lint:fix

.PHONY: format
format: ## Format all code
	prettier --write '**/*.{ts,tsx,json,md}'

.PHONY: format-check
format-check: ## Check formatting
	prettier --check '**/*.{ts,tsx,json,md}'

.PHONY: typecheck
typecheck: ## Type check all services
	pnpm --recursive run typecheck

.PHONY: ci
ci: install typecheck lint format-check test ## Run all CI checks
	@echo "$(COLOR_GREEN)✅ All CI checks passed!$(COLOR_RESET)"

.PHONY: clean
clean: ## Clean all build artifacts
	pnpm --recursive run clean
	rm -rf node_modules

# =============================================================================
# Development Environment
# =============================================================================

.PHONY: dev
dev: ## Start all services in development mode
	docker-compose -f docker-compose.dev.yml up -d
	./scripts/wait-for-services.sh
	@echo "$(COLOR_GREEN)✅ Development environment ready!$(COLOR_RESET)"

.PHONY: dev-services
dev-services: ## Start TypeScript services with hot reload
	pnpm --parallel --filter './backend/*' run dev

.PHONY: stop
stop: ## Stop all services
	docker-compose -f docker-compose.dev.yml down

.PHONY: logs
logs: ## Show logs from all services
	docker-compose -f docker-compose.dev.yml logs -f

.PHONY: restart
restart: stop dev ## Restart all services

# =============================================================================
# Service-Specific Targets (Dynamic)
# =============================================================================

# Pattern rule for service-specific targets
# Usage: make <service>-<target>
# Example: make clusterer-test
define service-target
.PHONY: $(1)-%
$(1)-%: ## Run target for $(1) service
	@echo "$(COLOR_GREEN)Running $$* for $(1)...$(COLOR_RESET)"
	@$(MAKE) -C backend/$(1) $$*
endef

$(foreach service,$(SERVICES),$(eval $(call service-target,$(service))))

# =============================================================================
# Database Management
# =============================================================================

.PHONY: db-reset
db-reset: ## Reset all databases
	@echo "⚠️  WARNING: This will delete all data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose -f docker-compose.dev.yml down -v; \
		docker-compose -f docker-compose.dev.yml up -d postgres-ingestion postgres-battles; \
		sleep 5; \
		$(MAKE) db-migrate; \
		$(MAKE) db-seed; \
	fi

.PHONY: db-migrate
db-migrate: ## Run database migrations
	pnpm --filter @battlescope/database run migrate:latest

.PHONY: db-seed
db-seed: ## Seed databases with test data
	pnpm --filter @battlescope/database run seed

# =============================================================================
# Kafka Management
# =============================================================================

.PHONY: kafka-topics
kafka-topics: ## List all Kafka topics
	docker-compose -f docker-compose.dev.yml exec kafka \
		kafka-topics --bootstrap-server localhost:9092 --list

.PHONY: kafka-create-topics
kafka-create-topics: ## Create required Kafka topics
	@echo "$(COLOR_GREEN)Creating Kafka topics...$(COLOR_RESET)"
	@for topic in killmail.ingested killmail.enriched battle.created battle.updated; do \
		docker-compose -f docker-compose.dev.yml exec kafka \
			kafka-topics --bootstrap-server localhost:9092 \
			--create --topic $$topic --partitions 3 --replication-factor 1 \
			--if-not-exists; \
	done

.PHONY: kafka-reset
kafka-reset: ## Reset Kafka (delete all topics)
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
	fi

# =============================================================================
# Testing Infrastructure
# =============================================================================

.PHONY: test-e2e
test-e2e: test-e2e-setup ## Run end-to-end tests
	pnpm run test:e2e
	$(MAKE) test-e2e-teardown

.PHONY: test-e2e-setup
test-e2e-setup: ## Setup E2E test environment
	docker-compose -f docker-compose.test.yml up -d --build
	./scripts/wait-for-services.sh test
	$(MAKE) db-migrate

.PHONY: test-e2e-teardown
test-e2e-teardown: ## Teardown E2E test environment
	docker-compose -f docker-compose.test.yml down -v

# =============================================================================
# Utility Targets
# =============================================================================

.PHONY: health
health: ## Check health of all services
	@echo "$(COLOR_GREEN)Checking service health...$(COLOR_RESET)"
	@for service in $(SERVICES); do \
		PORT=$$(grep "PORT=" backend/$$service/.env 2>/dev/null | cut -d= -f2 || echo "3000"); \
		curl -sf http://localhost:$$PORT/health/liveness > /dev/null && \
			echo "  ✅ $$service: healthy" || \
			echo "  ❌ $$service: unhealthy"; \
	done

.PHONY: ps
ps: ## Show running services
	docker-compose -f docker-compose.dev.yml ps

.PHONY: list-services
list-services: ## List all services in monorepo
	@echo "$(COLOR_GREEN)Services:$(COLOR_RESET)"
	@for service in $(SERVICES); do \
		echo "  - $$service"; \
	done
```

---

## GitHub Actions Integration

### 5. CI/CD Usage Pattern

**Rule**: GitHub Actions MUST use Makefile targets (not duplicate logic).

**Good CI Workflow**:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      # Use Makefile targets (not duplicate commands)
      - name: Run CI checks
        run: make ci

  service-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [clusterer, enrichment, ingest, search]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      # Use service-specific Makefile targets
      - name: Install dependencies
        run: make ${{ matrix.service }}-install

      - name: Run tests
        run: make ${{ matrix.service }}-test-coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/${{ matrix.service }}/coverage/coverage-final.json
          flags: ${{ matrix.service }}

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v2

      # Use Makefile for E2E setup
      - name: Setup E2E environment
        run: make test-e2e-setup

      - name: Run E2E tests
        run: make test-e2e

      - name: Teardown E2E environment
        if: always()
        run: make test-e2e-teardown
```

**Bad CI Workflow (Don't Do This)**:

```yaml
# ❌ BAD: Duplicates logic from Makefile
jobs:
  quality:
    steps:
      - name: Install
        run: pnpm install --frozen-lockfile  # Duplicate of "make install"

      - name: Type check
        run: pnpm run typecheck  # Duplicate of "make typecheck"

      - name: Lint
        run: pnpm run lint  # Duplicate of "make lint"

      # This creates drift between local and CI!
```

---

## Help Documentation

### 6. Self-Documenting Makefiles

**Rule**: ALL targets MUST have help text using `##` comments.

**Help Target Implementation**:

```makefile
.PHONY: help
help: ## Show this help message
	@echo "Project Name - Makefile Help"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}' | \
		sort
	@echo ""

.DEFAULT_GOAL := help
```

**Example Output**:

```
$ make
Project Name - Makefile Help

Usage: make [target]

Available targets:
  build                Build project for production
  ci                   Run all CI checks
  clean                Remove build artifacts
  dev                  Start development server
  format               Format code with Prettier
  help                 Show this help message
  install              Install project dependencies
  lint                 Run linter
  test                 Run all tests
  typecheck            Run TypeScript type checking
```

---

### 7. Enhanced Help with Categories

**Advanced Help Target**:

```makefile
.PHONY: help
help: ## Show this help message
	@echo "$(COLOR_BOLD)$(PROJECT_NAME)$(COLOR_RESET) - Version $(VERSION)"
	@echo ""
	@echo "$(COLOR_BOLD)Usage:$(COLOR_RESET) make [target]"
	@echo ""
	@$(MAKE) -s help-targets
	@echo ""
	@echo "$(COLOR_BOLD)Examples:$(COLOR_RESET)"
	@echo "  make dev              # Start development environment"
	@echo "  make test             # Run all tests"
	@echo "  make ci               # Run all CI checks"
	@echo "  make db-reset         # Reset all databases"
	@echo ""

.PHONY: help-targets
help-targets:
	@echo "$(COLOR_BOLD)Development:$(COLOR_RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		grep -E 'dev|build|install|clean' | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(COLOR_BLUE)%-20s$(COLOR_RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(COLOR_BOLD)Testing:$(COLOR_RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		grep -E 'test' | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(COLOR_BLUE)%-20s$(COLOR_RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(COLOR_BOLD)Code Quality:$(COLOR_RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		grep -E 'lint|format|typecheck' | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(COLOR_BLUE)%-20s$(COLOR_RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(COLOR_BOLD)Database:$(COLOR_RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		grep -E 'db-' | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(COLOR_BLUE)%-20s$(COLOR_RESET) %s\n", $$1, $$2}'
```

---

## Advanced Patterns

### 8. Conditional Targets

**Pattern: Environment-Specific Behavior**:

```makefile
# Detect environment
ENV ?= development
IS_CI := $(if $(CI),true,false)

.PHONY: install
install: ## Install dependencies
ifeq ($(IS_CI),true)
	@echo "CI environment detected, using frozen lockfile"
	pnpm install --frozen-lockfile
else
	@echo "Local environment, allowing lockfile updates"
	pnpm install
endif

.PHONY: test
test: ## Run tests
ifeq ($(ENV),production)
	@echo "Production environment, running full test suite"
	pnpm run test:all
else
	@echo "Development environment, running fast tests"
	pnpm run test:unit
endif
```

---

### 9. Prerequisite Checking

**Pattern: Verify Required Tools**:

```makefile
# Check for required commands
REQUIRED_COMMANDS := node pnpm docker docker-compose

.PHONY: check-prereqs
check-prereqs: ## Check if all prerequisites are installed
	@echo "Checking prerequisites..."
	@for cmd in $(REQUIRED_COMMANDS); do \
		if ! command -v $$cmd &> /dev/null; then \
			echo "  ❌ $$cmd is not installed"; \
			exit 1; \
		else \
			echo "  ✅ $$cmd is installed"; \
		fi; \
	done
	@echo "All prerequisites are installed!"

# Make other targets depend on prereqs
install: check-prereqs
dev: check-prereqs
```

---

### 10. Parallel Execution

**Pattern: Run Independent Tasks in Parallel**:

```makefile
.PHONY: test-all-parallel
test-all-parallel: ## Run all tests in parallel
	@echo "Running tests in parallel..."
	@$(MAKE) -j4 test-unit test-integration test-contract test-e2e

.PHONY: lint-all-parallel
lint-all-parallel: ## Run all linters in parallel
	@$(MAKE) -j3 lint format-check typecheck
```

---

## Best Practices

### 11. Makefile Do's and Don'ts

**Do's**:

✅ Use `.PHONY` for all non-file targets
✅ Add `##` help text for all targets
✅ Use `--frozen-lockfile` in CI
✅ Add color to output for better UX
✅ Use variables for repeated values
✅ Make `help` the default target
✅ Use `-C` to run make in subdirectories
✅ Add confirmation prompts for destructive operations
✅ Use `.SHELLFLAGS := -eu -o pipefail -c` for safety
✅ Disable built-in rules with `MAKEFLAGS += --no-builtin-rules`

**Don'ts**:

❌ Don't use shell-specific syntax (must work in `/bin/sh`)
❌ Don't duplicate logic that's in `package.json`
❌ Don't hide errors with `|| true` without good reason
❌ Don't use hardcoded paths (use variables)
❌ Don't forget to quote variables with spaces
❌ Don't use tabs for indentation in shell commands (use spaces after recipe prefix)
❌ Don't create targets without help text
❌ Don't use Make for complex logic (use shell scripts instead)

---

### 12. Error Handling

**Pattern: Safe Destructive Operations**:

```makefile
.PHONY: db-reset
db-reset: ## Reset database (WARNING: deletes all data)
	@echo "$(COLOR_RED)⚠️  WARNING: This will delete all data!$(COLOR_RESET)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ ! $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "$(COLOR_YELLOW)Operation cancelled.$(COLOR_RESET)"; \
		exit 1; \
	fi
	@$(MAKE) db-reset-force

.PHONY: db-reset-force
db-reset-force:
	@echo "Resetting database..."
	docker-compose down -v
	docker-compose up -d postgres
	sleep 5
	$(MAKE) db-migrate
	@echo "$(COLOR_GREEN)✅ Database reset complete$(COLOR_RESET)"
```

---

## Validation

### 13. Makefile Validation Target

**Self-Validation**:

```makefile
.PHONY: validate-makefile
validate-makefile: ## Validate Makefile follows conventions
	@echo "Validating Makefile..."
	@ERRORS=0; \
	\
	if ! grep -q '^.DEFAULT_GOAL := help' $(MAKEFILE_LIST); then \
		echo "  ❌ Missing .DEFAULT_GOAL := help"; \
		ERRORS=$$((ERRORS + 1)); \
	fi; \
	\
	if ! grep -q '^help:.*## Show this help message' $(MAKEFILE_LIST); then \
		echo "  ❌ Missing help target"; \
		ERRORS=$$((ERRORS + 1)); \
	fi; \
	\
	if ! grep -q '^.PHONY: help' $(MAKEFILE_LIST); then \
		echo "  ❌ help target not marked as .PHONY"; \
		ERRORS=$$((ERRORS + 1)); \
	fi; \
	\
	REQUIRED_TARGETS="install build test lint format typecheck ci clean"; \
	for target in $$REQUIRED_TARGETS; do \
		if ! grep -q "^.PHONY: $$target" $(MAKEFILE_LIST); then \
			echo "  ❌ Missing required target: $$target"; \
			ERRORS=$$((ERRORS + 1)); \
		fi; \
	done; \
	\
	if [ $$ERRORS -eq 0 ]; then \
		echo "  ✅ Makefile is valid"; \
	else \
		echo ""; \
		echo "  Found $$ERRORS error(s)"; \
		exit 1; \
	fi
```

---

## Summary: The Golden Rules

1. **Help First** - `help` target MUST be default, show all targets
2. **Self-Documenting** - ALL targets MUST have `##` help text
3. **CI/CD Integration** - GitHub Actions MUST use Makefile targets
4. **Standard Targets** - Implement all required targets consistently
5. **Color Output** - Use colors for better UX
6. **Error Handling** - Confirm destructive operations
7. **No Duplication** - Don't duplicate package.json scripts
8. **Phony Targets** - Mark all non-file targets as `.PHONY`
9. **Monorepo Pattern** - Root Makefile orchestrates services
10. **Always Up-to-Date** - Keep help text current with changes

---

## How Claude Should Use This Skill

When I (Claude) am:

- **Creating projects**: Generate Makefile from standard template
- **Adding features**: Add corresponding Makefile targets with help text
- **Writing CI/CD**: Use Makefile targets, don't duplicate logic
- **Documenting**: Reference Makefile commands in README
- **Reviewing code**: Check for missing targets or help text
- **Debugging CI**: Verify local `make ci` matches CI behavior

**If `make help` doesn't show a target, that target shouldn't exist.**

---

## References

- **GNU Make Manual** - https://www.gnu.org/software/make/manual/
- **Makefile Tutorial** - https://makefiletutorial.com/
- **Self-Documenting Makefiles** - https://marmelab.com/blog/2016/02/29/auto-documented-makefile.html
