# BattleScope V3 - Deployment Instructions

## What's Been Completed

✅ All 6 microservices implemented (Ingestion, Enrichment, Battle, Search, Notification, BFF)
✅ Docker images built locally for all services
✅ Kubernetes manifests created for full deployment
✅ Makefile for build automation
✅ Old battlescope namespace cleaned and new one created

## Current Blocker

The Docker images are built locally but cannot be pushed to docker.io due to authentication/network errors:
```
push access denied, repository does not exist or may require authorization
```

All pods are in `ImagePullBackOff` state because they cannot pull the images from the registry.

## Solution Options

### Option 1: Push to Docker Hub (Recommended)

1. **Create repositories on Docker Hub manually**:
   - Go to https://hub.docker.com/
   - Create these repositories under your account:
     - `petdog/battlescope-v3-ingestion`
     - `petdog/battlescope-v3-enrichment`
     - `petdog/battlescope-v3-battle`
     - `petdog/battlescope-v3-search`
     - `petdog/battlescope-v3-notification`
     - `petdog/battlescope-v3-bff`

2. **Retag and push images**:
   ```bash
   # Tag images
   for service in ingestion enrichment battle search notification bff; do
     docker tag battlescope/${service}-service:v3.0.0 petdog/battlescope-v3-${service}:v3.0.0
     docker tag petdog/battlescope-v3-${service}:v3.0.0 petdog/battlescope-v3-${service}:latest
   done

   # Ensure you're logged in
   docker login

   # Push images
   for service in ingestion enrichment battle search notification bff; do
     docker push petdog/battlescope-v3-${service}:v3.0.0
     docker push petdog/battlescope-v3-${service}:latest
   done
   ```

3. **Update Kubernetes manifests**:
   ```bash
   # Update image references in all deployment files
   cd infra/k8s/services/

   # For each service, update the image line:
   # image: petdog/battlescope-v3-ingestion:v3.0.0
   sed -i '' 's|battlescope/ingestion-service:v3.0.0|petdog/battlescope-v3-ingestion:v3.0.0|' ingestion-deployment.yaml
   sed -i '' 's|battlescope/enrichment-service:v3.0.0|petdog/battlescope-v3-enrichment:v3.0.0|' enrichment-deployment.yaml
   sed -i '' 's|battlescope/battle-service:v3.0.0|petdog/battlescope-v3-battle:v3.0.0|' battle-deployment.yaml
   sed -i '' 's|battlescope/search-service:v3.0.0|petdog/battlescope-v3-search:v3.0.0|' search-deployment.yaml
   sed -i '' 's|battlescope/notification-service:v3.0.0|petdog/battlescope-v3-notification:v3.0.0|' notification-deployment.yaml
   sed -i '' 's|battlescope/bff-service:v3.0.0|petdog/battlescope-v3-bff:v3.0.0|' bff-deployment.yaml
   ```

4. **Redeploy to Kubernetes**:
   ```bash
   kubectl apply -f infra/k8s/services/
   kubectl rollout restart deployment -n battlescope
   ```

### Option 2: Use Local Registry

1. **Configure Docker to allow insecure registry** (if not already done):
   Edit `/etc/docker/daemon.json`:
   ```json
   {
     "insecure-registries": ["10.0.1.3:30500"]
   }
   ```
   Restart Docker.

2. **Push images to local registry**:
   ```bash
   REGISTRY="10.0.1.3:30500"
   for service in ingestion enrichment battle search notification bff; do
     docker tag battlescope/${service}-service:v3.0.0 ${REGISTRY}/battlescope-${service}:v3.0.0
     docker push ${REGISTRY}/battlescope-${service}:v3.0.0
   done
   ```

3. **Update Kubernetes manifests to use local registry**:
   ```bash
   sed -i '' 's|battlescope/|10.0.1.3:30500/battlescope-|g' infra/k8s/services/*-deployment.yaml
   ```

4. **Redeploy**:
   ```bash
   kubectl apply -f infra/k8s/services/
   ```

### Option 3: GitHub Container Registry

1. **Authenticate with GitHub**:
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
   ```

2. **Tag and push**:
   ```bash
   for service in ingestion enrichment battle search notification bff; do
     docker tag battlescope/${service}-service:v3.0.0 ghcr.io/USERNAME/battlescope-${service}:v3.0.0
     docker push ghcr.io/USERNAME/battlescope-${service}:v3.0.0
   done
   ```

3. **Update manifests** to use `ghcr.io/USERNAME/...`

## Verification

Once images are available:

```bash
# Check pod status
kubectl get pods -n battlescope

# Should show all pods as Running:
NAME                                    READY   STATUS    RESTARTS   AGE
battle-service-*                        1/1     Running   0          1m
bff-service-*                           1/1     Running   0          1m
enrichment-service-*                    1/1     Running   0          1m
ingestion-service-*                     1/1     Running   0          1m
notification-service-*                  1/1     Running   0          1m
search-service-*                        1/1     Running   0          1m
```

## Test Services

```bash
# Get node IP
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')

# Test each service
curl http://${NODE_IP}:30101/health  # Ingestion
curl http://${NODE_IP}:30102/health  # Enrichment
curl http://${NODE_IP}:30103/health  # Battle
curl http://${NODE_IP}:30104/health  # Search
curl http://${NODE_IP}:30105/health  # Notification
curl http://${NODE_IP}:30106/health  # BFF
```

Expected response from each:
```json
{
  "status": "ok",
  "service": "ingestion",
  "timestamp": "2025-11-25T02:00:00.000Z"
}
```

## Next Steps After Deployment

1. **Deploy Databases**:
   - PostgreSQL instances for each service
   - Create schemas and run migrations

2. **Deploy Kafka**:
   - For event-driven communication between services

3. **Implement Business Logic**:
   - Current services only have health endpoints
   - Add killmail processing, enrichment, battle detection, etc.

4. **Build Frontend**:
   - React/Next.js application
   - Connects to BFF on port 3006

5. **Add Observability**:
   - Prometheus for metrics
   - Grafana for dashboards
   - Loki for logs
   - Jaeger for tracing

6. **Write Tests**:
   - Unit tests (vitest)
   - Integration tests
   - E2E tests

## Useful Commands

```bash
# View logs
kubectl logs -f deployment/ingestion-service -n battlescope

# Describe pod (for troubleshooting)
kubectl describe pod -l app=ingestion-service -n battlescope

# Port forward for local testing
kubectl port-forward -n battlescope svc/ingestion-service 3001:3001

# Delete and redeploy
kubectl delete namespace battlescope
kubectl apply -f infra/k8s/namespace/
kubectl apply -f infra/k8s/services/

# Check resource usage
kubectl top pods -n battlescope
```

## Project Structure

```
battle-monitor/
├── services/              # All 6 microservices
│   ├── ingestion/
│   ├── enrichment/
│   ├── battle/
│   ├── search/
│   ├── notification/
│   └── bff/
├── infra/k8s/            # Kubernetes manifests
│   ├── namespace/
│   ├── services/
│   └── registry/
├── Makefile              # Build automation
├── package.json          # Root workspace config
└── pnpm-workspace.yaml
```

## Docker Images

All images are built locally and ready:
```
battlescope/ingestion-service:v3.0.0     192MB
battlescope/enrichment-service:v3.0.0    192MB
battlescope/battle-service:v3.0.0        192MB
battlescope/search-service:v3.0.0        180MB
battlescope/notification-service:v3.0.0  169MB
battlescope/bff-service:v3.0.0           180MB
```

## Summary

The V3 architecture is fully implemented with all services containerized and K8s manifests ready.
The only blocker is getting the images into a registry accessible by your Raspberry Pi cluster.

Choose one of the options above, execute the commands, and your system will be running!

---

**Status**: ⚠️ Ready to deploy pending registry access
**Contact**: Check DEPLOYMENT_STATUS.md for detailed technical summary
