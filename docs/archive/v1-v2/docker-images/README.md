# BattleScope Docker Images

This directory contains documentation for all BattleScope Docker images published to Docker Hub under the `petdog/battlescope-*` namespace.

## Available Images

| Image | Purpose | Dockerfile | Documentation |
|-------|---------|------------|---------------|
| [battlescope-frontend](https://hub.docker.com/r/petdog/battlescope-frontend) | React SPA web interface | `frontend/Dockerfile` | [frontend.md](./frontend.md) |
| [battlescope-api](https://hub.docker.com/r/petdog/battlescope-api) | REST API gateway with Fastify | `Dockerfile` | [api.md](./api.md) |
| [battlescope-ingest](https://hub.docker.com/r/petdog/battlescope-ingest) | zKillboard data ingestion | `Dockerfile` | [ingest.md](./ingest.md) |
| [battlescope-enrichment](https://hub.docker.com/r/petdog/battlescope-enrichment) | Killmail enrichment worker | `Dockerfile` | [enrichment.md](./enrichment.md) |
| [battlescope-clusterer](https://hub.docker.com/r/petdog/battlescope-clusterer) | Battle clustering algorithm | `Dockerfile` | [clusterer.md](./clusterer.md) |
| [battlescope-scheduler](https://hub.docker.com/r/petdog/battlescope-scheduler) | Scheduled maintenance tasks | `Dockerfile` | [scheduler.md](./scheduler.md) |
| [battlescope-search-sync](https://hub.docker.com/r/petdog/battlescope-search-sync) | Typesense index synchronization | `backend/search-sync/Dockerfile` | [search-sync.md](./search-sync.md) |
| [battlescope-verifier](https://hub.docker.com/r/petdog/battlescope-verifier) | Data integrity verification | `Dockerfile` | [verifier.md](./verifier.md) |
| [battlescope-db-migrate](https://hub.docker.com/r/petdog/battlescope-db-migrate) | Database migration runner | `Dockerfile` | [db-migrate.md](./db-migrate.md) |

## Documentation Structure

Each service documentation follows a standardized template. See [TEMPLATE.md](./TEMPLATE.md) for the structure.

## Adding a New Service

When creating a new Docker image:

1. **Create Documentation**
   ```bash
   # Copy the template
   cp docs/docker-images/TEMPLATE.md docs/docker-images/<service-name>.md

   # Fill in service-specific details
   # - Replace all {{PLACEHOLDERS}}
   # - Extract environment variables from source code
   # - Add actual configuration examples
   ```

2. **Register the Service**
   - Add entry to this README table
   - Add to `scripts/docker-readme-sync.sh` SERVICES array
   - Add to `.github/workflows/ci.yml` matrix
   - Add build target to `Makefile`

3. **Update Documentation**
   ```bash
   # Test locally
   ./scripts/docker-readme-sync.sh <service-name>

   # Commit and push
   git add docs/docker-images/<service-name>.md
   git commit -m "docs: add Docker documentation for <service-name>"
   git push origin main
   ```

4. **Verify**
   - Check GitHub Actions runs successfully
   - Verify README appears on Docker Hub
   - Ensure all environment variables are documented

## Syncing to Docker Hub

Documentation automatically syncs to Docker Hub via CI/CD:
- **Trigger**: Push to `main` branch
- **Workflow**: `.github/workflows/ci.yml` → `sync-docker-readmes` job
- **Tool**: `docker-pushrm`
- **Manual**: Run `./scripts/docker-readme-sync.sh`

## Common Environment Variables

Many services share common environment variables:

### Database Connection
```bash
DATABASE_URL="postgresql://user:pass@host:5432/dbname"
# Or individual components:
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
POSTGRES_USER="battlescope"
POSTGRES_PASSWORD="secret"
POSTGRES_DB="battlescope"
```

### Redis Connection
```bash
REDIS_URL="redis://localhost:6379"
ESI_REDIS_CACHE_URL="redis://localhost:6379/0"
SESSION_REDIS_URL="redis://localhost:6379/1"
```

### Observability (OpenTelemetry)
```bash
OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-collector:4318"
OTEL_SERVICE_NAME="api"
OTEL_METRIC_EXPORT_INTERVAL="60000"
LOG_LEVEL="info"  # trace, debug, info, warn, error, fatal
```

### Application Config
```bash
NODE_ENV="production"  # development, production
PORT="3000"
HOST="0.0.0.0"
DEVELOPER_MODE="false"
```

## Resource Recommendations

### Small Services (Scheduler, Verifier)
```yaml
resources:
  requests:
    cpu: 50m
    memory: 128Mi
  limits:
    cpu: 200m
    memory: 256Mi
```

### Medium Services (Ingest, Enrichment, Clusterer, Search-Sync)
```yaml
resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

### Large Services (API, Frontend)
```yaml
resources:
  requests:
    cpu: 200m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 1Gi
```

## Health Check Patterns

### HTTP Health Check (API, Frontend)
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

### Exec Health Check (Workers, Background Services)
```yaml
livenessProbe:
  exec:
    command:
      - node
      - -e
      - "process.exit(0)"
  initialDelaySeconds: 10
  periodSeconds: 30
```

## Build Information

### Shared Dockerfile
Most backend services use the same multi-stage Dockerfile at the repository root:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg SERVICE_SCOPE=@battlescope/<service> \
  --build-arg BUILD_TARGET=backend/<service> \
  -t petdog/battlescope-<service>:latest \
  -f Dockerfile \
  .
```

### Dedicated Dockerfile
Some services have their own Dockerfile:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t petdog/battlescope-<service>:latest \
  -f <path>/Dockerfile \
  .
```

## Security Best Practices

1. **Run as non-root user**
   ```dockerfile
   USER node
   ```

2. **Minimal base images**
   - Use `node:20-slim` for production
   - Avoid including build tools in final image

3. **Environment variable validation**
   - Validate required env vars at startup
   - Fail fast if misconfigured

4. **Secrets management**
   - Never hardcode secrets
   - Use Kubernetes Secrets
   - Rotate credentials regularly

5. **Vulnerability scanning**
   - CI/CD includes Trivy scanning
   - Update base images regularly
   - Monitor security advisories

## Troubleshooting

### Image Won't Build
```bash
# Check Docker buildx
docker buildx ls

# Clean build cache
docker buildx prune

# Verify build args
docker buildx build --build-arg SERVICE_SCOPE=@battlescope/api --dry-run
```

### README Not Syncing
```bash
# Check CI/CD logs
# Visit: https://github.com/YOUR_USERNAME/battle-monitor/actions

# Test locally
export DOCKER_USERNAME=petdog
export DOCKER_PASSWORD=your-password
./scripts/docker-readme-sync.sh <service>

# Verify credentials
docker login
```

### Service Won't Start
```bash
# Check logs
kubectl logs -n battlescope deployment/<service> --tail=100

# Check environment variables
kubectl get deployment <service> -n battlescope -o yaml | grep -A 20 "env:"

# Check pod status
kubectl describe pod -n battlescope -l app=<service>
```

## Related Documentation

- **Architecture**: [docs/architecture.md](../architecture.md)
- **Technical Specs**: [docs/technical-specifications/](../technical-specifications/)
- **Sync Script**: [scripts/docker-readme-sync.sh](../../scripts/docker-readme-sync.sh)
- **CI/CD**: [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- **Makefile**: [Makefile](../../Makefile)

## Maintenance

This directory is automatically maintained by:
- **Skill**: `.claude/skills/docker-docs-maintainer/`
- **CI/CD**: Syncs to Docker Hub on every push to `main`
- **Script**: `scripts/docker-readme-sync.sh`

When you modify a service, update its documentation file here and the CI/CD pipeline will automatically sync it to Docker Hub.

---

**Last Updated**: 2025-11-12
**Namespace**: `petdog/battlescope-*`
**Registry**: Docker Hub
