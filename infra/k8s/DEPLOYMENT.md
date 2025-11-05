# Deployment Guide

## Database Migrations

The database migration job is run as a Kubernetes Job before deploying or updating the application services.

### Running Migrations

To run database migrations during deployment:

1. Update the timestamp annotation in `db-migrate-job.yaml` to trigger a new job run:

```bash
# Using current timestamp
sed -i "s/REPLACE_WITH_TIMESTAMP/$(date +%s)/" infra/k8s/db-migrate-job.yaml
```

Or manually edit the file and replace `REPLACE_WITH_TIMESTAMP` with a unique value (e.g., Git SHA or timestamp).

2. Apply the job manifest:

```bash
kubectl apply -f infra/k8s/db-migrate-job.yaml
```

3. Monitor the migration job:

```bash
kubectl logs -n battlescope job/db-migrate -f
```

4. Wait for the job to complete before deploying/updating other services:

```bash
kubectl wait --for=condition=complete --timeout=300s -n battlescope job/db-migrate
```

### Deployment Workflow

The recommended deployment workflow is:

1. Push changes to main branch (triggers CI to build and push images)
2. Run the db-migrate job (as shown above)
3. Update the service deployments with new image tags
4. Apply the deployment manifests

Example:

```bash
# Update image tags in deployments (if needed)
# Update deployment.timestamp to trigger new migration
sed -i "s/REPLACE_WITH_TIMESTAMP/$(date +%s)/" infra/k8s/db-migrate-job.yaml

# Run migrations
kubectl apply -f infra/k8s/db-migrate-job.yaml
kubectl wait --for=condition=complete --timeout=300s -n battlescope job/db-migrate

# Deploy services
kubectl apply -f infra/k8s/api-deployment.yaml
kubectl apply -f infra/k8s/ingest-deployment.yaml
kubectl apply -f infra/k8s/enrichment-deployment.yaml
kubectl apply -f infra/k8s/clusterer-deployment.yaml
kubectl apply -f infra/k8s/frontend-deployment.yaml
kubectl apply -f infra/k8s/scheduler-cronjob.yaml
```

### Troubleshooting

If the migration job fails:

```bash
# Check job status
kubectl get job -n battlescope db-migrate

# View logs
kubectl logs -n battlescope job/db-migrate

# Delete failed job before retrying
kubectl delete job -n battlescope db-migrate
```

### Notes

- Migrations are idempotent and safe to run multiple times
- The job will not retry on failure (backoffLimit: 0)
- The job pod is automatically cleaned up after 5 minutes (ttlSecondsAfterFinished: 300)
- Always run migrations before updating service deployments
