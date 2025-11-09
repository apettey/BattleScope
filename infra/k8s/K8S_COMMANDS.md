# Kubernetes Commands Reference

## Overview

This document describes the available `make` commands for managing the BattleScope Kubernetes cluster.

## Cluster Management Commands

### `make k8s-reset`

**⚠️ DESTRUCTIVE - Deletes all data and resets the cluster**

Completely resets the k8s cluster by:

1. Prompting for confirmation (type `yes` to proceed)
2. Deleting the entire `battlescope` namespace (cascades to all resources)
3. Deleting all PersistentVolumeClaims (PostgreSQL, Redis, Loki data)
4. Recreating the namespace
5. Deploying all resources from scratch
6. Running database migrations

**Usage:**

```bash
make k8s-reset
```

**What gets deleted:**

- ❌ All PostgreSQL data (battles, killmails, accounts, characters, etc.)
- ❌ All Redis data (sessions, cache, queues)
- ❌ All Loki logs (last 1 hour)
- ❌ All running pods
- ❌ All persistent volumes

**When to use:**

- Starting completely fresh
- Clearing corrupt data
- Testing full deployment from scratch
- Resetting to a clean state for development

**Time estimate:** ~3-5 minutes

---

### `make k8s-reset-force`

**⚠️ DESTRUCTIVE - No confirmation prompt**

Same as `k8s-reset` but skips the confirmation prompt.

**Usage:**

```bash
make k8s-reset-force
```

**When to use:**

- In CI/CD pipelines
- Automated testing
- When you're absolutely certain

**⚠️ WARNING:** There is no undo. All data will be permanently deleted.

---

### `make k8s-deploy-all`

**Safe - Applies all manifests without deleting anything**

Deploys all k8s resources in the correct order:

1. **Namespace & Secrets** - Create namespace, apply secrets
2. **ConfigMaps** - Application config, Grafana, Prometheus, OTEL
3. **StatefulSets** - PostgreSQL, Redis, Loki (waits for ready)
4. **Observability** - Prometheus, Jaeger, Grafana, OTEL, Promtail
5. **Database Migration** - Runs db-migrate job (waits for completion)
6. **Applications** - API, Frontend, Ingest, Enrichment, Clusterer, Scheduler

**Usage:**

```bash
make k8s-deploy-all
```

**When to use:**

- Initial cluster setup
- After modifying manifests
- Updating configurations
- Recovering from partial deployment

**Safe?** Yes - Uses `kubectl apply`, which updates existing resources without data loss.

---

### `make k8s-redeploy`

**Safe - Restarts application pods**

Restarts all application deployments to pick up new Docker images:

- Frontend
- API
- Ingest
- Enrichment
- Clusterer

**Usage:**

```bash
make k8s-redeploy
```

**When to use:**

- After pushing new Docker images
- After running `make k8s-build-push`
- To force pods to pull latest images

**Safe?** Yes - Rolling restart, no data loss.

---

### `make k8s-restart-observability`

**Safe - Restarts observability stack**

Restarts observability components to pick up config changes:

- OTEL Collector
- Grafana
- Loki

**Usage:**

```bash
make k8s-restart-observability
```

**When to use:**

- After updating OTEL collector config
- After updating Grafana datasources
- After updating Loki config
- After updating Promtail config

**Safe?** Yes - Rolling restart, no data loss.

---

## Build and Deploy Workflow

### Full Fresh Deployment

```bash
# 1. Build all TypeScript
make build

# 2. Build and push Docker images
make k8s-build-push

# 3. Reset cluster (with confirmation)
make k8s-reset

# Result: Fresh cluster with latest code
```

### Update Existing Cluster

```bash
# 1. Build all TypeScript
make build

# 2. Build and push Docker images
make k8s-build-push

# 3. Restart pods to pick up new images
make k8s-redeploy

# Result: Existing cluster with latest code, data preserved
```

### Config Changes Only

```bash
# 1. Edit manifests in infra/k8s/

# 2. Apply changes
make k8s-deploy-all

# 3. Restart if needed (for observability configs)
make k8s-restart-observability

# Result: Config updated, data preserved
```

## Common Scenarios

### Scenario: "I want to start completely fresh"

```bash
make k8s-reset
# Type: yes
# Wait ~3-5 minutes
```

### Scenario: "I deployed new code"

```bash
make build
make k8s-build-push
make k8s-redeploy
```

### Scenario: "I updated Grafana datasource config"

```bash
kubectl apply -f infra/k8s/grafana-config.yaml
make k8s-restart-observability
```

### Scenario: "Postgres crashed and data is corrupt"

```bash
make k8s-reset
# This will rebuild Postgres with fresh data
```

### Scenario: "I want to test the full deployment process"

```bash
make k8s-reset-force  # No confirmation prompt
```

### Scenario: "I added a new k8s manifest"

```bash
make k8s-deploy-all
# This will apply all manifests including the new one
```

## Verification

### Check if reset worked

```bash
# Check all pods are running
kubectl get pods -n battlescope

# Watch pods starting
kubectl get pods -n battlescope -w

# Check specific service
kubectl logs -n battlescope -l app=api --tail=50

# Check database is empty
kubectl exec -n battlescope postgres-0 -- psql -U battlescope -d battlescope -c "SELECT COUNT(*) FROM battles;"
# Should return 0 after fresh reset
```

### Check if deployment worked

```bash
# All pods should be running
kubectl get pods -n battlescope

# Check migrations ran
kubectl logs -n battlescope -l app=db-migrate

# Check API is responding
kubectl port-forward -n battlescope svc/api 3000:3000
curl http://localhost:3000/healthz
# Should return: {"status":"ok"}
```

## Troubleshooting

### Reset hangs on "Waiting for namespace deletion"

**Issue:** Namespace stuck in "Terminating" state

**Solution:**

```bash
# Force delete
kubectl delete namespace battlescope --force --grace-period=0

# Then continue
make k8s-deploy-all
```

### StatefulSets not becoming ready

**Issue:** Postgres/Redis/Loki pods stuck in "Pending" or "CrashLoopBackOff"

**Solution:**

```bash
# Check pod status
kubectl describe pod postgres-0 -n battlescope

# Check PVC status
kubectl get pvc -n battlescope

# If PVC is stuck, delete it
kubectl delete pvc data-postgres-0 -n battlescope

# Then reapply
kubectl apply -f infra/k8s/postgres-statefulset.yaml
```

### Database migration job fails

**Issue:** db-migrate job in "Error" state

**Solution:**

```bash
# Check migration logs
kubectl logs -n battlescope -l app=db-migrate

# Delete the job
kubectl delete job db-migrate -n battlescope

# Update job timestamp to force rerun
# Edit infra/k8s/db-migrate-job.yaml
# Change: deployment.timestamp: '1762375775'
# To:     deployment.timestamp: '$(date +%s)'

# Reapply
kubectl apply -f infra/k8s/db-migrate-job.yaml
```

### Pods crash after reset

**Issue:** Application pods in "CrashLoopBackOff"

**Solution:**

```bash
# Check pod logs
kubectl logs -n battlescope -l app=api --tail=100

# Common issues:
# - Database not ready: Wait for postgres-0 to be ready
# - Migration not complete: Check db-migrate job status
# - Secret missing: Verify secrets.yaml is applied

# Fix and restart
kubectl rollout restart deployment/api -n battlescope
```

## Safety Checklist

Before running `make k8s-reset`:

- [ ] Do you have backups of important data?
- [ ] Are you in the correct cluster? (`kubectl config current-context`)
- [ ] Is this the correct namespace? (should be `battlescope`)
- [ ] Do you need to export any data first?
- [ ] Have you notified your team?
- [ ] Are you prepared to wait 3-5 minutes?

## Advanced Usage

### Reset with custom secrets

```bash
# 1. Reset cluster
make k8s-reset-force

# 2. Update secrets before applying
export DATABASE_PASSWORD="new-password"
envsubst < infra/k8s/secrets.yaml | kubectl apply -f -

# 3. Continue with deployment
make k8s-deploy-all
```

### Reset specific StatefulSet only

```bash
# Delete just Postgres (preserves Redis, Loki)
kubectl delete statefulset postgres -n battlescope
kubectl delete pvc data-postgres-0 -n battlescope

# Reapply
kubectl apply -f infra/k8s/postgres-statefulset.yaml
```

### Deploy without waiting

```bash
# Remove the waits from k8s-deploy-all
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/secrets.yaml
# ... etc (manual)
```

## Reference

### Deployment Order

Critical order for successful deployment:

1. Namespace (must exist first)
2. Secrets (needed by all pods)
3. ConfigMaps (needed by apps)
4. StatefulSets (Postgres, Redis, Loki - must be ready before apps)
5. Observability (can start in parallel)
6. Migration (requires Postgres to be ready)
7. Applications (require Postgres, Redis, migration complete)

### Resource Dependencies

```
API → PostgreSQL, Redis, ConfigMap, Secrets
Ingest → PostgreSQL, Redis, ConfigMap, Secrets
Enrichment → PostgreSQL, Redis, ConfigMap, Secrets
Clusterer → PostgreSQL, Redis, ConfigMap, Secrets
Frontend → ConfigMap
Grafana → Loki, Prometheus, Jaeger, ConfigMap
OTEL → Loki, Jaeger, Prometheus, ConfigMap
Promtail → Loki
```

## Support

If commands are failing:

1. Check cluster connection: `kubectl cluster-info`
2. Check namespace exists: `kubectl get namespace battlescope`
3. Check secrets are applied: `kubectl get secrets -n battlescope`
4. Check PVCs: `kubectl get pvc -n battlescope`
5. Check pod logs: `kubectl logs -n battlescope <pod-name>`

For more help, see:

- `infra/k8s/DEPLOYMENT.md` - General deployment guide
- `infra/k8s/LOGGING_SETUP.md` - Logging and observability
- `docs/technical_specs.md` - Architecture and design
