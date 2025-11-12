# Docker Documentation Maintainer

Maintain Docker images and their documentation for the BattleScope project.

## Purpose

This skill helps you keep Docker images and their README documentation synchronized and up-to-date across Dockerfiles, Docker Hub, and the project documentation.

## When to Use

Invoke this skill when:
- Adding a new Docker service
- Modifying environment variables in a service
- Updating Docker image configuration
- Changing Dockerfile structure
- Adding new configuration options
- Updating deployment manifests

## What This Skill Does

1. **Analyzes Service Changes**
   - Scans service source code for environment variables
   - Identifies configuration changes
   - Detects new or removed services

2. **Updates Docker Documentation**
   - Updates `/docs/docker-images/<service>.md` with:
     - Current environment variables
     - Configuration examples
     - Resource requirements
     - Health check endpoints
     - Kubernetes manifests

3. **Validates Documentation**
   - Ensures all Docker images have documentation
   - Verifies environment variables match source code
   - Checks Docker Hub README sync status

4. **Syncs to Docker Hub**
   - Tests the sync script locally
   - Provides commands to sync manually
   - Verifies CI/CD pipeline integration

## Docker Images in BattleScope

The project maintains 9 Docker images:

1. **battlescope-frontend** - React SPA
   - Dockerfile: `frontend/Dockerfile`
   - Documentation: `docs/docker-images/frontend.md`

2. **battlescope-api** - REST API Gateway
   - Dockerfile: `Dockerfile` (with BUILD_ARG SERVICE_SCOPE=@battlescope/api)
   - Documentation: `docs/docker-images/api.md`

3. **battlescope-ingest** - zKillboard Ingestion
   - Dockerfile: `Dockerfile` (with BUILD_ARG SERVICE_SCOPE=@battlescope/ingest)
   - Documentation: `docs/docker-images/ingest.md`

4. **battlescope-enrichment** - Killmail Enrichment Worker
   - Dockerfile: `Dockerfile` (with BUILD_ARG SERVICE_SCOPE=@battlescope/enrichment)
   - Documentation: `docs/docker-images/enrichment.md`

5. **battlescope-clusterer** - Battle Clustering
   - Dockerfile: `Dockerfile` (with BUILD_ARG SERVICE_SCOPE=@battlescope/clusterer)
   - Documentation: `docs/docker-images/clusterer.md`

6. **battlescope-scheduler** - Maintenance Tasks
   - Dockerfile: `Dockerfile` (with BUILD_ARG SERVICE_SCOPE=@battlescope/scheduler)
   - Documentation: `docs/docker-images/scheduler.md`

7. **battlescope-search-sync** - Typesense Indexer
   - Dockerfile: `backend/search-sync/Dockerfile`
   - Documentation: `docs/docker-images/search-sync.md`

8. **battlescope-verifier** - Data Integrity Validation
   - Dockerfile: `Dockerfile` (with BUILD_ARG SERVICE_SCOPE=@battlescope/verifier)
   - Documentation: `docs/docker-images/verifier.md`

9. **battlescope-db-migrate** - Database Migrations
   - Dockerfile: `Dockerfile` (with BUILD_ARG SERVICE_SCOPE=@battlescope/database)
   - Documentation: `docs/docker-images/db-migrate.md`

## Documentation Structure

Each Docker image documentation file should include:

### 1. Header
- Image name and Docker Hub URL
- Purpose and description
- Status badge (if applicable)

### 2. Configuration Section
- Complete list of environment variables
- Default values
- Required vs optional
- Description of each variable

### 3. Ports and Health Checks
- Exposed ports
- Health check endpoint
- Liveness/readiness probes

### 4. Usage Examples
- `docker run` command
- Docker Compose configuration
- Kubernetes Deployment manifest

### 5. Resource Requirements
- CPU requests and limits
- Memory requests and limits
- Scaling considerations

### 6. Dependencies
- Required services (PostgreSQL, Redis, etc.)
- External APIs (ESI, zKillboard)
- Service dependencies

### 7. Build Information
- Build arguments
- Multi-stage build details
- Platform support (amd64, arm64)

### 8. Troubleshooting
- Common issues and solutions
- Debugging tips
- Log locations

### 9. Performance Tuning
- Optimization recommendations
- Configuration tuning
- Scaling guidance

### 10. Security
- Security best practices
- Secrets management
- Network policies

## How to Extract Environment Variables

To ensure documentation accuracy, analyze the actual source code:

### For Backend Services
Look in `backend/<service>/src/index.ts` or `backend/<service>/src/config.ts`:

```typescript
// Example patterns to find:
const PORT = process.env.PORT || '3000';
const DATABASE_URL = process.env.DATABASE_URL;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
```

### For Packages
Look in `packages/<package>/src/index.ts` or configuration files:

```typescript
// Common locations:
// - packages/database/src/client.ts (DATABASE_URL)
// - packages/esi-client/src/index.ts (ESI_*)
// - packages/shared/src/config.ts (LOG_LEVEL, OTEL_*)
```

### From Kubernetes Manifests
Cross-reference with `infra/k8s/<service>-deployment.yaml`:

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: postgres-secret
        key: url
  - name: LOG_LEVEL
    value: "info"
```

## Syncing to Docker Hub

### Manual Sync (Local Testing)
```bash
# Install docker-pushrm (one-time)
brew install christian-korneck/homebrew-repo/docker-pushrm

# Set credentials
export DOCKER_USERNAME=petdog
export DOCKER_PASSWORD=your-password

# Sync all images
./scripts/docker-readme-sync.sh

# Sync specific image
./scripts/docker-readme-sync.sh api
```

### Automatic Sync (CI/CD)
Documentation syncs automatically when pushing to `main`:
- GitHub Actions workflow: `.github/workflows/ci.yml`
- Job: `sync-docker-readmes`
- Runs after: `publish-images`

### Verify Sync Status
Check Docker Hub pages:
- https://hub.docker.com/r/petdog/battlescope-api
- https://hub.docker.com/r/petdog/battlescope-ingest
- (etc. for all 9 images)

## Workflow for Adding a New Service

1. **Create the Service**
   - Add service code in `backend/<service>/` or `packages/<service>/`
   - Create Dockerfile (or use shared Dockerfile with BUILD_ARG)

2. **Update Makefile**
   - Add build target in `k8s-build-push` section
   - Include appropriate BUILD_ARG values

3. **Update CI/CD**
   - Add matrix entry in `.github/workflows/ci.yml`
   - Include dockerfile path and build args

4. **Create Documentation**
   - Create `docs/docker-images/<service>.md`
   - Extract all environment variables from source
   - Document configuration and usage
   - Add Kubernetes example

5. **Update Sync Script**
   - Verify service is in `SERVICES` array in `scripts/docker-readme-sync.sh`
   - Add if missing

6. **Update Architecture Docs**
   - Add to `docs/architecture.md` component list
   - Update system diagram
   - Document dependencies

7. **Test Locally**
   - Build Docker image: `make k8s-build-push` (or specific target)
   - Test documentation sync: `./scripts/docker-readme-sync.sh <service>`
   - Verify on Docker Hub

8. **Deploy and Verify**
   - Push to main branch
   - Watch GitHub Actions workflow
   - Verify image builds and README syncs

## Workflow for Updating Environment Variables

1. **Identify Changes**
   - Note what variables were added/removed/changed
   - Check service source code for actual usage

2. **Update Documentation**
   - Edit `docs/docker-images/<service>.md`
   - Update environment variables table
   - Update example configurations

3. **Update Kubernetes Manifests**
   - Edit `infra/k8s/<service>-deployment.yaml`
   - Add/update env vars or configmap references

4. **Test Locally**
   - Test sync: `./scripts/docker-readme-sync.sh <service>`
   - Verify documentation is correct

5. **Commit and Push**
   - Commit with clear message: "docs: update <service> environment variables"
   - Push to main
   - Verify CI/CD syncs to Docker Hub

## Checklist Before Committing

- [ ] All environment variables documented in `docs/docker-images/<service>.md`
- [ ] Default values match source code
- [ ] Required vs optional correctly marked
- [ ] Health check endpoint documented
- [ ] Resource requirements specified
- [ ] Kubernetes example manifest included
- [ ] Dependencies listed
- [ ] Troubleshooting section complete
- [ ] Examples tested and working
- [ ] Service added to sync script (if new)
- [ ] Architecture docs updated (if new service)

## Common Issues

### Issue: README not syncing to Docker Hub
**Solution**:
1. Check GitHub Actions logs for sync job
2. Verify DOCKERHUB_USERNAME and DOCKERHUB_TOKEN secrets are set
3. Ensure script has execute permissions: `chmod +x scripts/docker-readme-sync.sh`
4. Test locally with credentials

### Issue: Environment variables outdated
**Solution**:
1. Grep service source code: `grep -r "process.env" backend/<service>/`
2. Check Kubernetes manifests: `cat infra/k8s/<service>-deployment.yaml`
3. Update documentation with all found variables

### Issue: Documentation missing for new service
**Solution**:
1. Copy existing template from similar service
2. Extract environment variables from source
3. Update configuration examples
4. Add service to sync script array

## Files to Monitor

When services change, check these files:
- `backend/<service>/src/index.ts` - Service entry point
- `backend/<service>/src/config.ts` - Configuration (if exists)
- `packages/<package>/src/index.ts` - Package entry point
- `infra/k8s/<service>-deployment.yaml` - K8s deployment
- `Dockerfile` or `backend/<service>/Dockerfile` - Build config
- `Makefile` - Build targets
- `.github/workflows/ci.yml` - CI/CD pipeline

## Related Documentation

- Main architecture: `docs/architecture.md`
- Docker images directory: `docs/docker-images/`
- Sync script: `scripts/docker-readme-sync.sh`
- CI/CD workflow: `.github/workflows/ci.yml`
- Makefile: `Makefile`

## Quick Commands

```bash
# List all Docker image docs
ls -la docs/docker-images/

# Find environment variable usage in service
grep -r "process.env" backend/<service>/

# Test sync locally
./scripts/docker-readme-sync.sh <service>

# Build specific image
docker buildx build --platform linux/arm64 \
  --build-arg SERVICE_SCOPE=@battlescope/<service> \
  --build-arg BUILD_TARGET=backend/<service> \
  -t docker.io/petdog/battlescope-<service>:latest \
  -f Dockerfile .

# Check Docker Hub
open https://hub.docker.com/r/petdog/battlescope-<service>
```

## Success Criteria

Documentation is considered complete when:
1. ✅ All 9 services have up-to-date documentation files
2. ✅ Every environment variable is documented with defaults
3. ✅ Docker Hub pages show current README content
4. ✅ CI/CD pipeline successfully syncs on every push to main
5. ✅ Kubernetes examples match deployed manifests
6. ✅ Resource requirements reflect actual allocations
7. ✅ Troubleshooting sections cover common issues
8. ✅ Dependencies are clearly documented

---

**Last Updated**: 2025-11-12
**Maintained by**: BattleScope Team
**Related Skills**: deployment, kubernetes-manager, documentation-writer
