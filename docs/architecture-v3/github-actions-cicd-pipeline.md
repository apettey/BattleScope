# Claude Skill: GitHub Actions CI/CD Pipeline

**Purpose**: Standardize CI/CD pipelines with proper job breakdown, multi-architecture builds, efficient caching, and fast feedback loops.

---

## Core Principle

**CI/CD pipelines MUST be fast, reliable, and provide early feedback through proper job parallelization, efficient caching, and multi-architecture Docker builds.**

**Rationale**:
- Fast pipelines reduce developer waiting time
- Parallel jobs maximize CI efficiency
- Early failure detection saves CI minutes
- Multi-architecture builds (amd64/arm64) support diverse deployment targets
- Makefile integration ensures local/CI parity
- Proper caching reduces build times significantly

---

## Pipeline Architecture

### 1. Job Breakdown Strategy

**Rule**: Pipelines MUST be broken into logical, parallelizable jobs with fail-fast behavior.

**Standard Job Structure**:

```
┌─────────────────────────────────────────────────────────────┐
│                     Pull Request / Push                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
  ┌──────────┐         ┌──────────┐         ┌──────────┐
  │  Lint    │         │Typecheck │         │ Format   │
  │  Check   │         │          │         │  Check   │
  └──────────┘         └──────────┘         └──────────┘
        ↓                     ↓                     ↓
        └─────────────────────┼─────────────────────┘
                              ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
              ┌──────────┐        ┌──────────┐
              │   Unit   │        │Integration│
              │   Tests  │        │   Tests   │
              └──────────┘        └──────────┘
                    ↓                   ↓
                    └─────────┬─────────┘
                              ↓
                        ┌──────────┐
                        │ Contract │
                        │  Tests   │
                        └──────────┘
                              ↓
                        ┌──────────┐
                        │   E2E    │
                        │  Tests   │
                        └──────────┘
                              ↓
                        ┌──────────┐
                        │  Build   │
                        │  Images  │
                        │(amd64 +  │
                        │ arm64)   │
                        └──────────┘
                              ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
              ┌──────────┐        ┌──────────┐
              │  Deploy  │        │  Deploy  │
              │ Staging  │        │Production│
              │(auto)    │        │(manual)  │
              └──────────┘        └──────────┘
```

---

### 2. Main CI Pipeline

**Rule**: Use Makefile targets to ensure local/CI parity.

**.github/workflows/ci.yml**:

```yaml
name: CI Pipeline

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

# Cancel in-progress runs for same PR/branch
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '8'

jobs:
  # =============================================================================
  # Phase 1: Fast Checks (Run in Parallel, Fail Fast)
  # =============================================================================

  lint:
    name: Lint
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Cache pnpm dependencies
        uses: actions/cache@v3
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-

      - name: Install dependencies
        run: make install

      - name: Run linter
        run: make lint

  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: $(pnpm store path)
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

      - name: Install dependencies
        run: make install

      - name: Run type check
        run: make typecheck

  format-check:
    name: Format Check
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: $(pnpm store path)
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

      - name: Install dependencies
        run: make install

      - name: Check formatting
        run: make format-check

  # =============================================================================
  # Phase 2: Unit Tests (Run in Parallel per Service)
  # =============================================================================

  unit-tests:
    name: Unit Tests - ${{ matrix.service }}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: [lint, typecheck, format-check]
    strategy:
      fail-fast: false
      matrix:
        service:
          - clusterer
          - enrichment
          - ingest
          - search
          - database
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: $(pnpm store path)
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

      - name: Install dependencies
        run: make install

      - name: Run unit tests with coverage
        run: make ${{ matrix.service }}-test-coverage

      - name: Check coverage threshold
        run: make ${{ matrix.service }}-coverage-check

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/${{ matrix.service }}/coverage/coverage-final.json
          flags: ${{ matrix.service }}
          name: ${{ matrix.service }}-coverage

  # =============================================================================
  # Phase 3: Integration Tests
  # =============================================================================

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: [unit-tests]
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: $(pnpm store path)
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

      - name: Install dependencies
        run: make install

      - name: Run integration tests
        run: make test-integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
          REDIS_URL: redis://localhost:6379

  # =============================================================================
  # Phase 4: Contract Tests
  # =============================================================================

  contract-tests:
    name: Contract Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: [unit-tests]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: $(pnpm store path)
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

      - name: Install dependencies
        run: make install

      - name: Validate OpenAPI contracts
        run: |
          for contract in backend/*/contracts/openapi.yaml; do
            npx @redocly/cli lint "$contract"
          done

      - name: Validate JSON schemas
        run: |
          for schema in backend/*/contracts/events/*.schema.json; do
            npx ajv validate -s "$schema" --spec=draft7 --strict=true
          done

      - name: Run contract tests
        run: make test-contract

  # =============================================================================
  # Phase 5: E2E Tests
  # =============================================================================

  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: [integration-tests, contract-tests]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: $(pnpm store path)
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

      - name: Install dependencies
        run: make install

      - name: Setup E2E environment
        run: make test-e2e-setup

      - name: Run E2E tests
        run: pnpm run test:e2e

      - name: Teardown E2E environment
        if: always()
        run: make test-e2e-teardown

      - name: Upload E2E logs
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: e2e-logs
          path: |
            logs/
            docker-compose-logs.txt

  # =============================================================================
  # Phase 6: Build Summary
  # =============================================================================

  ci-success:
    name: CI Success
    runs-on: ubuntu-latest
    needs: [lint, typecheck, format-check, unit-tests, integration-tests, contract-tests, e2e-tests]
    if: success()
    steps:
      - name: CI passed
        run: echo "✅ All CI checks passed!"

  ci-failure:
    name: CI Failure
    runs-on: ubuntu-latest
    needs: [lint, typecheck, format-check, unit-tests, integration-tests, contract-tests, e2e-tests]
    if: failure()
    steps:
      - name: CI failed
        run: |
          echo "❌ CI checks failed"
          exit 1
```

---

### 3. Multi-Architecture Docker Builds

**Rule**: ALL Docker images MUST be built for both amd64 and arm64 architectures.

**.github/workflows/build-images.yml**:

```yaml
name: Build Docker Images

on:
  push:
    branches: [main, develop]
    tags:
      - 'v*'
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ghcr.io/${{ github.repository_owner }}

jobs:
  build-matrix:
    name: Build ${{ matrix.service }}
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        service:
          - clusterer
          - enrichment
          - ingest
          - search
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3
        with:
          platforms: linux/amd64,linux/arm64

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
        with:
          driver-opts: |
            image=moby/buildkit:latest

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_PREFIX }}/${{ matrix.service }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}}
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./backend/${{ matrix.service }}/Dockerfile
          platforms: linux/amd64,linux/arm64
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            VERSION=${{ steps.meta.outputs.version }}
            COMMIT_SHA=${{ github.sha }}
            BUILD_TIME=${{ github.event.head_commit.timestamp }}

      - name: Image digest
        run: echo ${{ steps.meta.outputs.digest }}

  # =============================================================================
  # Build Summary
  # =============================================================================

  build-success:
    name: Build Success
    runs-on: ubuntu-latest
    needs: [build-matrix]
    if: success()
    steps:
      - name: All images built
        run: echo "✅ All Docker images built successfully for amd64 and arm64!"

  build-failure:
    name: Build Failure
    runs-on: ubuntu-latest
    needs: [build-matrix]
    if: failure()
    steps:
      - name: Build failed
        run: |
          echo "❌ Docker image build failed"
          exit 1
```

---

### 4. Optimized Dockerfile for Multi-Architecture

**Rule**: Dockerfiles MUST support multi-stage builds with layer caching.

**backend/clusterer/Dockerfile**:

```dockerfile
# =============================================================================
# Stage 1: Dependencies (cached layer)
# =============================================================================
FROM node:20-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8 --activate

WORKDIR /app

# Copy dependency files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/clusterer/package.json ./backend/clusterer/
COPY packages/database/package.json ./packages/database/

# Install dependencies (cached)
RUN pnpm install --frozen-lockfile --filter clusterer...

# =============================================================================
# Stage 2: Build (source code changes)
# =============================================================================
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@8 --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/clusterer/node_modules ./backend/clusterer/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules

# Copy source code
COPY . .

# Build the service
WORKDIR /app/backend/clusterer
RUN pnpm run build

# =============================================================================
# Stage 3: Production (minimal runtime)
# =============================================================================
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built artifacts
COPY --from=builder --chown=nodejs:nodejs /app/backend/clusterer/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/backend/clusterer/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/backend/clusterer/node_modules ./node_modules

# Build arguments
ARG VERSION=dev
ARG COMMIT_SHA=unknown
ARG BUILD_TIME=unknown

# Labels
LABEL org.opencontainers.image.title="BattleScope Clusterer"
LABEL org.opencontainers.image.description="Battle clustering service"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${COMMIT_SHA}"
LABEL org.opencontainers.image.created="${BUILD_TIME}"

# Environment
ENV NODE_ENV=production
ENV VERSION=${VERSION}
ENV COMMIT_SHA=${COMMIT_SHA}

USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/liveness', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

---

### 5. Dependency Caching Strategy

**Rule**: Use GitHub Actions cache for maximum efficiency.

**Caching Pattern**:

```yaml
# Shared cache setup (reusable)
- name: Get pnpm store directory
  id: pnpm-cache
  shell: bash
  run: echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

- name: Setup pnpm cache
  uses: actions/cache@v3
  with:
    path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
    key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
    restore-keys: |
      ${{ runner.os }}-pnpm-

# Docker layer caching
- name: Build with cache
  uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

---

### 6. Release Pipeline

**Rule**: Releases MUST be automated with semantic versioning.

**.github/workflows/release.yml**:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  release:
    name: Create Release
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate changelog
        id: changelog
        run: |
          # Extract version from tag
          VERSION=${GITHUB_REF#refs/tags/v}
          echo "version=$VERSION" >> $GITHUB_OUTPUT

          # Generate changelog since last tag
          PREVIOUS_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
          if [ -n "$PREVIOUS_TAG" ]; then
            CHANGELOG=$(git log $PREVIOUS_TAG..HEAD --pretty=format:"- %s" --no-merges)
          else
            CHANGELOG=$(git log --pretty=format:"- %s" --no-merges)
          fi

          echo "changelog<<EOF" >> $GITHUB_OUTPUT
          echo "$CHANGELOG" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release v${{ steps.changelog.outputs.version }}
          body: |
            ## Changes in v${{ steps.changelog.outputs.version }}

            ${{ steps.changelog.outputs.changelog }}

            ## Docker Images

            All images are available for `linux/amd64` and `linux/arm64`:

            ```bash
            docker pull ghcr.io/${{ github.repository_owner }}/clusterer:${{ steps.changelog.outputs.version }}
            docker pull ghcr.io/${{ github.repository_owner }}/enrichment:${{ steps.changelog.outputs.version }}
            docker pull ghcr.io/${{ github.repository_owner }}/ingest:${{ steps.changelog.outputs.version }}
            docker pull ghcr.io/${{ github.repository_owner }}/search:${{ steps.changelog.outputs.version }}
            ```
          draft: false
          prerelease: false

  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: [release]
    environment:
      name: staging
      url: https://staging.battlescope.dev
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to staging
        run: |
          # Deployment logic here
          echo "Deploying to staging..."

  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: [deploy-staging]
    environment:
      name: production
      url: https://battlescope.dev
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to production
        run: |
          # Deployment logic here
          echo "Deploying to production..."
```

---

## Pipeline Optimization

### 7. Job Parallelization

**Rule**: Run independent jobs in parallel for maximum speed.

**Parallelization Strategy**:

```yaml
# ✅ GOOD: Parallel jobs (runs simultaneously)
jobs:
  lint:
    runs-on: ubuntu-latest
  typecheck:
    runs-on: ubuntu-latest
  format-check:
    runs-on: ubuntu-latest

# ✅ GOOD: Matrix strategy for services
jobs:
  test:
    strategy:
      matrix:
        service: [clusterer, enrichment, ingest, search]
    runs-on: ubuntu-latest

# ❌ BAD: Sequential jobs (unnecessary waiting)
jobs:
  lint:
    runs-on: ubuntu-latest
  typecheck:
    needs: [lint]  # Unnecessary dependency
    runs-on: ubuntu-latest
```

---

### 8. Fast Failure Detection

**Rule**: Fast checks MUST run before slow checks.

**Ordering Strategy**:

```yaml
# Phase 1: Fast checks (1-3 minutes)
lint → typecheck → format-check
           ↓
# Phase 2: Unit tests (5-10 minutes)
    unit-tests (parallel)
           ↓
# Phase 3: Integration tests (10-15 minutes)
   integration-tests
           ↓
# Phase 4: Contract tests (5-10 minutes)
    contract-tests
           ↓
# Phase 5: E2E tests (15-20 minutes)
       e2e-tests
           ↓
# Phase 6: Build images (20-30 minutes)
    build-images (parallel)
```

---

### 9. Conditional Execution

**Rule**: Skip unnecessary jobs based on changed files.

**Path Filtering**:

```yaml
name: CI

on:
  pull_request:
    paths:
      - 'backend/**'
      - 'packages/**'
      - 'pnpm-lock.yaml'
      - '.github/workflows/ci.yml'

jobs:
  # Only run if backend code changed
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Get changed files
        id: changed-files
        uses: tj-actions/changed-files@v40
        with:
          files: backend/**

      - name: Run backend tests
        if: steps.changed-files.outputs.any_changed == 'true'
        run: make test

  # Only run if specific service changed
  clusterer-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check if clusterer changed
        id: changed
        uses: tj-actions/changed-files@v40
        with:
          files: |
            backend/clusterer/**
            packages/database/**

      - name: Run clusterer tests
        if: steps.changed.outputs.any_changed == 'true'
        run: make clusterer-test
```

---

## Best Practices

### 10. Workflow Do's and Don'ts

**Do's**:

✅ Use Makefile targets (ensures local/CI parity)
✅ Cache dependencies aggressively
✅ Run independent jobs in parallel
✅ Use matrix strategy for similar jobs
✅ Add timeouts to all jobs
✅ Use `fail-fast: false` for test matrices
✅ Build multi-architecture images (amd64 + arm64)
✅ Use GitHub Container Registry for images
✅ Add health checks to Dockerfiles
✅ Use multi-stage builds for smaller images

**Don'ts**:

❌ Don't duplicate Makefile logic in workflows
❌ Don't run slow tests before fast checks
❌ Don't build images on every PR (only on merge)
❌ Don't forget to cache Docker layers
❌ Don't use `latest` tag in production
❌ Don't run deployment jobs without approval
❌ Don't ignore security vulnerabilities
❌ Don't skip architecture-specific testing

---

### 11. Security Best Practices

**Rule**: Pipelines MUST follow security best practices.

**Security Checklist**:

```yaml
# ✅ Use pinned action versions
- uses: actions/checkout@v4  # Good
- uses: actions/checkout@main  # Bad (unpredictable)

# ✅ Use GITHUB_TOKEN with minimal permissions
permissions:
  contents: read
  packages: write

# ✅ Scan Docker images for vulnerabilities
- name: Scan image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ${{ env.IMAGE_PREFIX }}/${{ matrix.service }}:${{ github.sha }}
    format: 'sarif'
    output: 'trivy-results.sarif'

- name: Upload scan results
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: 'trivy-results.sarif'

# ✅ Never commit secrets
# Use GitHub Secrets instead
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

---

### 12. Monitoring and Notifications

**Rule**: Pipeline failures MUST be visible and actionable.

**Notification Strategy**:

```yaml
# Add to workflow
jobs:
  notify-failure:
    name: Notify on Failure
    runs-on: ubuntu-latest
    needs: [ci-success]
    if: failure()
    steps:
      - name: Send Slack notification
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "❌ CI failed for ${{ github.repository }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*CI Failed*\n\n*Repository:* ${{ github.repository }}\n*Branch:* ${{ github.ref }}\n*Commit:* ${{ github.sha }}\n*Author:* ${{ github.actor }}\n\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Workflow Run>"
                  }
                }
              ]
            }
```

---

## Summary: The Golden Rules

1. **Use Makefile Targets** - Never duplicate logic between local and CI
2. **Multi-Architecture Builds** - Always build for amd64 and arm64
3. **Parallel Execution** - Run independent jobs simultaneously
4. **Fast Failure** - Run quick checks before slow tests
5. **Aggressive Caching** - Cache dependencies and Docker layers
6. **Proper Job Breakdown** - Logical separation with clear dependencies
7. **Matrix Strategy** - Use for similar jobs across services
8. **Security First** - Pin versions, scan images, minimal permissions
9. **Timeout All Jobs** - Prevent stuck workflows
10. **Monitor Failures** - Notifications and clear error messages

---

## How Claude Should Use This Skill

When I (Claude) am:

- **Creating workflows**: Use standard templates from this skill
- **Adding jobs**: Ensure proper parallelization and dependencies
- **Building images**: Always include multi-architecture support
- **Writing steps**: Use Makefile targets, not raw commands
- **Optimizing pipelines**: Check caching and parallelization
- **Debugging failures**: Verify local `make ci` reproduces issue

**If local `make ci` passes but GitHub Actions fails, the pipeline is WRONG.**

---

## References

- **GitHub Actions Documentation** - https://docs.github.com/en/actions
- **Docker Buildx** - https://docs.docker.com/buildx/working-with-buildx/
- **Multi-Architecture Builds** - https://docs.docker.com/build/building/multi-platform/
- **GitHub Container Registry** - https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
