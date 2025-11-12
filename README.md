# BattleScope

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4.5-blue.svg)

**BattleScope** is a modular data intelligence platform for EVE Online that provides real-time battle reconstruction and combat intelligence through automated killmail ingestion, clustering, and analysis.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

BattleScope automatically ingests killmails from zKillboard, clusters them into battles using intelligent algorithms, and provides a web interface for viewing and analyzing combat activities in EVE Online. The system is designed with a microservices architecture for scalability and runs on Kubernetes.

### Core Capabilities

**Battle Reports** (`@battlescope/battle-reports`)
- Automated killmail ingestion from zKillboard RedisQ
- Intelligent clustering of related killmails into battles
- Real-time battle reconstruction and visualization
- Configurable ingestion filters (alliances, systems, security types)

**Battle Intel** (`@battlescope/battle-intel`)
- Statistical analysis of combat activities
- Opponent tracking and relationship analysis
- Ship composition and doctrine detection
- Geographic activity heatmaps

### Design Principles

- **Feature-Based Architecture**: Business logic separated at package level for modularity
- **Reference-First Storage**: Minimal data footprint by storing only essential metadata
- **Microservices Pattern**: Independent, scalable services with clear responsibilities
- **Event-Driven Processing**: Asynchronous job queues for data enrichment
- **Cloud-Native**: Kubernetes-first deployment with horizontal scaling
- **Observable**: Comprehensive logging, metrics, and tracing

---

## Features

- **Automated Killmail Ingestion**: Pull killmails from zKillboard RedisQ in real-time
- **Intelligent Battle Clustering**: Group related killmails using temporal and spatial algorithms
- **Full-Text Search**: Fast search across battles and entities using Typesense
- **Real-Time Feed**: Server-Sent Events (SSE) stream for live killmail updates
- **EVE SSO Authentication**: Secure authentication via EVE Online SSO (OAuth2)
- **Admin Dashboard**: Configure ingestion rules, manage users, and view statistics
- **Observability**: Built-in logging (Loki), metrics (Prometheus), and tracing (Jaeger)
- **Horizontal Scaling**: Auto-scaling for API and frontend services
- **Docker Images**: All services published to Docker Hub for easy deployment

---

## Architecture

BattleScope consists of 8 microservices and 7 shared packages in a monorepo structure:

### Services

1. **API Service** - REST API gateway (Fastify)
2. **Frontend** - React SPA with Vite
3. **Ingest Service** - zKillboard RedisQ poller
4. **Enrichment Service** - BullMQ worker for killmail enrichment
5. **Clusterer Service** - Battle reconstruction engine
6. **Scheduler Service** - Kubernetes CronJob for periodic tasks
7. **Search Sync Service** - Typesense indexer
8. **Verifier Service** - Data integrity validation

### Technology Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20 LTS |
| **Language** | TypeScript 5.4.5 |
| **API Framework** | Fastify 4.26 |
| **Frontend** | React 18, Vite 5, TailwindCSS 3 |
| **Database** | PostgreSQL 15 |
| **Query Builder** | Kysely 0.27 |
| **Cache/Queue** | Redis 7, BullMQ 4.13 |
| **Search** | Typesense 0.25 |
| **Orchestration** | Kubernetes 1.27+ |
| **Observability** | Prometheus, Loki, Jaeger, Grafana |

For a detailed architecture overview, see [docs/architecture.md](docs/architecture.md).

---

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- PNPM >= 8.0.0
- Docker and Docker Compose (for local development)
- Kubernetes cluster (for production deployment)

### Local Development with Docker Compose

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/battle-monitor.git
   cd battle-monitor
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Start infrastructure services**:
   ```bash
   docker compose up -d postgres redis typesense
   ```

4. **Run database migrations**:
   ```bash
   pnpm run db:migrate
   ```

5. **Start services**:
   ```bash
   # Terminal 1: API server
   pnpm --filter @battlescope/api dev

   # Terminal 2: Frontend
   pnpm --filter frontend dev

   # Terminal 3: Ingest service
   pnpm --filter @battlescope/ingest dev
   ```

6. **Access the application**:
   - Frontend: http://localhost:5173
   - API: http://localhost:3000
   - API Docs: http://localhost:3000/docs

### Using Pre-built Docker Images

All services are available on Docker Hub under the `petdog/battlescope-*` namespace:

```bash
# Pull all images
docker pull petdog/battlescope-api:latest
docker pull petdog/battlescope-frontend:latest
docker pull petdog/battlescope-ingest:latest
docker pull petdog/battlescope-enrichment:latest
docker pull petdog/battlescope-clusterer:latest
docker pull petdog/battlescope-scheduler:latest
docker pull petdog/battlescope-search-sync:latest
docker pull petdog/battlescope-verifier:latest
docker pull petdog/battlescope-db-migrate:latest
```

See [Docker Images Documentation](#docker-images) for detailed configuration.

---

## Development Setup

### Repository Structure

```
battle-monitor/
├── backend/               # Backend microservices
│   ├── api/              # REST API service
│   ├── ingest/           # Killmail ingestion service
│   ├── enrichment/       # Killmail enrichment worker
│   ├── clusterer/        # Battle clustering service
│   ├── scheduler/        # Periodic job scheduler
│   └── search-sync/      # Typesense sync service
├── frontend/             # React frontend application
├── packages/             # Shared packages
│   ├── database/         # Database client and schema
│   ├── esi-client/       # EVE API client
│   ├── auth/             # Authentication system
│   ├── search/           # Typesense client
│   ├── shared/           # Common utilities
│   ├── battle-reports/   # Clustering engine
│   └── battle-intel/     # Analytics engine
├── infra/                # Infrastructure configuration
│   └── k8s/              # Kubernetes manifests
├── docs/                 # Documentation
├── Makefile              # Common development tasks
└── pnpm-workspace.yaml   # PNPM workspace config
```

### Common Commands

```bash
# Install dependencies
make install

# Build all packages and services
make build

# Run linter
make lint

# Run tests
make test

# Run tests in watch mode
make test-watch

# Type checking
make typecheck

# Format code
make format

# Check formatting
make format-check

# Create database migration
make db-migrate-make NAME=create_table

# Run database migrations
make db-migrate

# Generate OpenAPI spec
make generate-openapi

# Run full CI suite
make ci
```

### Environment Variables

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Key environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@localhost:5432/battlescope` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379/0` |
| `ZKILLBOARD_REDISQ_URL` | zKillboard RedisQ endpoint | `https://zkillredisq.stream/listen.php` |
| `EVE_CLIENT_ID` | EVE Online OAuth client ID | (required for auth) |
| `EVE_CLIENT_SECRET` | EVE Online OAuth client secret | (required for auth) |
| `ENCRYPTION_KEY` | 32-byte encryption key (base64) | (required for auth) |

See [Configuration](#configuration) for complete environment variable documentation.

---

## Deployment

### Kubernetes Deployment

BattleScope is designed to run on Kubernetes. All manifests are in the `infra/k8s/` directory.

#### Prerequisites

- Kubernetes 1.27+
- kubectl configured
- Docker images built and pushed (or use pre-built images from Docker Hub)

#### Deploy to Kubernetes

1. **Build and push images** (optional if using Docker Hub images):
   ```bash
   make k8s-build-push
   ```

2. **Configure secrets**:
   ```bash
   cp infra/k8s/secrets.example.yaml infra/k8s/secrets.yaml
   # Edit secrets.yaml with your configuration
   vim infra/k8s/secrets.yaml
   ```

3. **Deploy all resources**:
   ```bash
   make k8s-deploy-all
   ```

4. **Check deployment status**:
   ```bash
   kubectl get pods -n battlescope
   kubectl get svc -n battlescope
   ```

5. **Access services**:
   - API: http://NODE_IP:30000
   - Frontend: http://NODE_IP:30001
   - Grafana: http://NODE_IP:30003

#### Update Services

To redeploy services after changes:

```bash
# Build and push new images
make k8s-build-push

# Restart deployments
make k8s-redeploy
```

#### Reset Cluster (WARNING: Deletes all data)

```bash
make k8s-reset
```

### Docker Compose Deployment

For simpler deployments without Kubernetes:

```bash
# Start all services with local build
make compose-up

# Stop all services
make compose-down

# View logs
make compose-logs

# Use pre-built images from Docker Hub
make compose-remote-up
```

---

## Configuration

### Service Configuration

Each service can be configured via environment variables. See the service-specific documentation:

- [API Service Configuration](docs/docker-images/api.md)
- [Ingest Service Configuration](docs/docker-images/ingest.md)
- [Enrichment Service Configuration](docs/docker-images/enrichment.md)
- [Clusterer Service Configuration](docs/docker-images/clusterer.md)
- [Scheduler Service Configuration](docs/docker-images/scheduler.md)
- [Search Sync Service Configuration](docs/docker-images/search-sync.md)
- [Verifier Service Configuration](docs/docker-images/verifier.md)
- [Frontend Configuration](docs/docker-images/frontend.md)

### Database Configuration

PostgreSQL 15 is required. Configure via:

- `DATABASE_URL`: Full connection string
- OR individual variables: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `POSTGRES_SSL`: Enable SSL connection (default: false)

### Redis Configuration

Redis 7 is required for caching, sessions, and job queues:

- `REDIS_URL`: Main Redis connection (queue and cache)
- `ESI_REDIS_CACHE_URL`: ESI API caching (separate DB recommended)
- `SESSION_REDIS_URL`: Session storage (separate DB recommended)

### Authentication Configuration

EVE Online SSO authentication requires:

1. **Create EVE application** at https://developers.eveonline.com/
2. **Configure environment variables**:
   ```bash
   EVE_CLIENT_ID=your-client-id
   EVE_CLIENT_SECRET=your-client-secret
   EVE_CALLBACK_URL=http://your-domain/auth/callback
   ENCRYPTION_KEY=$(openssl rand -base64 32)
   ```

### Ingestion Rules

Configure killmail ingestion filters via the Admin UI:

- Minimum pilots per killmail
- Allowed/blocked alliances
- Allowed/blocked corporations
- System filters (specific systems or security types)
- Time-based rules

---

## Documentation

### Core Documentation

- [Architecture Overview](docs/architecture.md) - Complete system architecture
- [Documentation Summary](docs/DOCUMENTATION_SUMMARY.md) - Project documentation overview
- [Product Specifications](docs/product_specs.md) - Product requirements
- [Technical Specifications](docs/technical_specs.md) - Technical implementation details

### Feature Documentation

- [Battle Reports Feature](docs/features/battle-reports/feature-spec.md)
- [Battle Intel Feature](docs/features/battle-intel/feature-spec.md)

### Technical Documentation

- [Authentication & Authorization](docs/authenication-authorization-spec/README.md)
- [Observability Setup](docs/observability/database-metrics-exporters.md)

### Docker Images

- [Frontend Image](docs/docker-images/frontend.md)
- [API Image](docs/docker-images/api.md)
- [Ingest Image](docs/docker-images/ingest.md)
- [Enrichment Image](docs/docker-images/enrichment.md)
- [Clusterer Image](docs/docker-images/clusterer.md)
- [Scheduler Image](docs/docker-images/scheduler.md)
- [Search Sync Image](docs/docker-images/search-sync.md)
- [Verifier Image](docs/docker-images/verifier.md)
- [DB Migrate Image](docs/docker-images/db-migrate.md)

---

## Contributing

Contributions are welcome! Please follow these guidelines:

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Make your changes** with clear commit messages
4. **Run tests and linter**:
   ```bash
   make lint
   make typecheck
   make test
   ```
5. **Format code**: `make format`
6. **Commit with conventional commits**:
   ```
   feat: add new feature
   fix: resolve bug
   docs: update documentation
   chore: update dependencies
   ```
7. **Push to your fork**: `git push origin feature/my-feature`
8. **Create a Pull Request**

### Code Style

- TypeScript for all code
- ESLint + Prettier for formatting
- Conventional commits for commit messages
- Comprehensive tests for new features
- Update documentation for user-facing changes

### Testing

- Write unit tests for business logic
- Write integration tests for API endpoints
- Use Vitest for testing
- Maintain >80% code coverage

### Pull Request Guidelines

- Describe the change and motivation
- Link related issues
- Ensure CI passes
- Request review from maintainers
- Keep PRs focused and small

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) file for details.

---

## Support

- **Issues**: https://github.com/your-org/battle-monitor/issues
- **Discord**: [Join our Discord](https://discord.gg/your-invite)
- **Documentation**: https://docs.battlescope.app

---

## Acknowledgments

- **EVE Online** by CCP Games for the amazing universe
- **zKillboard** for providing killmail data via RedisQ
- **EVE Swagger Interface (ESI)** for EVE Online API access
- All contributors to the open-source libraries we use

---

## Project Status

- **Version**: 0.1.0 (Beta)
- **Status**: Active Development
- **Production Ready**: Partial (auth incomplete)

See [DOCUMENTATION_SUMMARY.md](docs/DOCUMENTATION_SUMMARY.md) for detailed project status.

---

**Made with love for the EVE Online community**
