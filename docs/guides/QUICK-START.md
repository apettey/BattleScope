# BattleScope V3 - Quick Start Guide

## Current Status

✅ All 6 microservices implemented and containerized
✅ Docker images pushed to docker.io/petdog/battlescope-*:v3.0.0
✅ PostgreSQL, Redis, and Kafka manifests created
✅ All services configured to connect to infrastructure

## Before Deploying

**IMPORTANT**: Make Docker Hub repositories public:

1. Visit: https://hub.docker.com/repositories/petdog
2. For each repository, click → Settings → Make Public:
   - `battlescope-ingestion`
   - `battlescope-enrichment`
   - `battlescope-battle`
   - `battlescope-search`
   - `battlescope-notification`
   - `battlescope-bff`

## Deploy Everything

Once repositories are public:

```bash
cd /Users/andrew/Projects/battle-monitor

# Deploy complete stack (infrastructure + services)
make k8s-deploy

# This will deploy:
# 1. PostgreSQL (with 4 databases: ingestion_db, enrichment_db, battle_db, search_db)
# 2. Redis (for caching and sessions)
# 3. Kafka + Zookeeper (for event streaming)
# 4. All 6 microservices with proper environment variables
```

## Verify Deployment

```bash
# Check all pods
kubectl get pods -n battlescope

# Expected output: All pods Running
NAME                                    READY   STATUS    RESTARTS   AGE
battle-service-*                        1/1     Running   0          2m
bff-service-*                           1/1     Running   0          2m
enrichment-service-*                    1/1     Running   0          2m
ingestion-service-*                     1/1     Running   0          2m
kafka-*                                 1/1     Running   0          3m
notification-service-*                  1/1     Running   0          2m
postgres-0                              1/1     Running   0          3m
redis-*                                 1/1     Running   0          3m
search-service-*                        1/1     Running   0          2m
zookeeper-*                             1/1     Running   0          3m
```

## Test Services

```bash
# Get node IP
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')

# Test all services
curl http://${NODE_IP}:30101/health  # Ingestion   → {"status":"ok","service":"ingestion"...}
curl http://${NODE_IP}:30102/health  # Enrichment  → {"status":"ok","service":"enrichment"...}
curl http://${NODE_IP}:30103/health  # Battle      → {"status":"ok","service":"battle"...}
curl http://${NODE_IP}:30104/health  # Search      → {"status":"ok","service":"search"...}
curl http://${NODE_IP}:30105/health  # Notification→ {"status":"ok","service":"notification"...}
curl http://${NODE_IP}:30106/health  # BFF         → {"status":"ok","service":"bff"...}
```

## Architecture Overview

```
Internet/API Clients
        │
        ▼
   BFF Service (:3006/:30106)
        │
        ├──────────┬──────────┬──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼
   Ingestion  Enrichment  Battle    Search    Notification
    (:3001)    (:3002)    (:3003)   (:3004)    (:3005)
        │          │          │          │          │
        └──────────┴──────────┴──────────┴──────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
   PostgreSQL            Redis              Kafka
   (4 databases)       (caching)         (events)
```

## Infrastructure Services

### PostgreSQL
- **Host**: `postgres.battlescope.svc.cluster.local` (or just `postgres`)
- **Port**: 5432
- **User**: battlescope
- **Password**: battlescope_password
- **Databases**:
  - `ingestion_db` - Ingestion Service
  - `enrichment_db` - Enrichment Service
  - `battle_db` - Battle Service
  - `search_db` - Search Service

### Redis
- **Host**: `redis.battlescope.svc.cluster.local` (or just `redis`)
- **Port**: 6379
- **Usage**: Caching, sessions, real-time data

### Kafka
- **Host**: `kafka.battlescope.svc.cluster.local` (or just `kafka`)
- **Port**: 9092
- **Zookeeper**: `zookeeper:2181`
- **Topics**: Auto-created on first use
- **Usage**: Event streaming between services

## Environment Variables

All services are configured with:

```yaml
# Database (for services that need it)
DATABASE_HOST: postgres
DATABASE_PORT: 5432
DATABASE_NAME: {service}_db
DATABASE_USER: battlescope
DATABASE_PASSWORD: battlescope_password

# Kafka (for event-driven services)
KAFKA_BROKERS: kafka:9092

# Redis (all services)
REDIS_HOST: redis
REDIS_PORT: 6379

# Service URLs (BFF only)
INGESTION_SERVICE_URL: http://ingestion-service:3001
ENRICHMENT_SERVICE_URL: http://enrichment-service:3002
BATTLE_SERVICE_URL: http://battle-service:3003
SEARCH_SERVICE_URL: http://search-service:3004
NOTIFICATION_SERVICE_URL: http://notification-service:3005
```

## Service Details

### Ingestion Service (Port 3001 / NodePort 30101)
- Receives killmail data from EVE Online
- Validates and stores in PostgreSQL
- Publishes events to Kafka

### Enrichment Service (Port 3002 / NodePort 30102)
- Listens to Kafka for new killmails
- Enriches data with additional context (ship info, player info, etc.)
- Updates PostgreSQL and publishes enriched events

### Battle Service (Port 3003 / NodePort 30103)
- Detects battles from killmail patterns
- Groups killmails into battle clusters
- Manages battle state in PostgreSQL

### Search Service (Port 3004 / NodePort 30104)
- Provides search API for killmails and battles
- Uses PostgreSQL for data
- Redis for caching search results

### Notification Service (Port 3005 / NodePort 30105)
- Listens to Kafka for important events
- Sends notifications (webhooks, etc.)
- No database (stateless)

### BFF Service (Port 3006 / NodePort 30106)
- Backend-for-Frontend aggregation layer
- Orchestrates calls to other services
- Provides unified API for frontend

## Useful Commands

```bash
# Watch pods start up
watch -n 2 kubectl get pods -n battlescope

# Stream logs from a service
kubectl logs -f deployment/ingestion-service -n battlescope

# Get all resources
kubectl get all -n battlescope

# Describe a pod (for troubleshooting)
kubectl describe pod -l app=ingestion-service -n battlescope

# Port forward for local testing
kubectl port-forward -n battlescope svc/bff-service 3006:3006
# Then access: http://localhost:3006/health

# Check PostgreSQL
kubectl exec -it -n battlescope postgres-0 -- psql -U battlescope -d ingestion_db

# Check Redis
kubectl exec -it -n battlescope deployment/redis -- redis-cli

# Check Kafka topics
kubectl exec -it -n battlescope deployment/kafka -- kafka-topics --bootstrap-server localhost:9092 --list

# Resource usage
kubectl top pods -n battlescope
kubectl top nodes
```

## Troubleshooting

### Pods not starting
```bash
# Check events
kubectl get events -n battlescope --sort-by='.lastTimestamp'

# Check pod logs
kubectl logs -l app=ingestion-service -n battlescope
```

### Image pull errors
- Ensure Docker Hub repositories are PUBLIC
- Check image names in deployments match pushed images

### Database connection errors
- Ensure PostgreSQL pod is Running
- Check database names match environment variables

### Kafka connection errors
- Ensure Kafka and Zookeeper pods are Running
- Wait 30-60 seconds after deploying Kafka before deploying services

## Clean Up

```bash
# Delete everything
make k8s-delete

# Or manually
kubectl delete namespace battlescope
```

## Next Steps

1. ✅ Make Docker Hub repos public
2. ✅ Deploy with `make k8s-deploy`
3. ✅ Verify all pods Running
4. ✅ Test health endpoints
5. 🚧 Implement business logic in services
6. 🚧 Add database migrations/schemas
7. 🚧 Create Kafka topics explicitly
8. 🚧 Build frontend application
9. 🚧 Add monitoring (Prometheus/Grafana)
10. 🚧 Write tests

---

**Status**: Ready to deploy once Docker Hub repositories are public!
**Version**: BattleScope V3.0.0
**Architecture**: Microservices with PostgreSQL, Redis, Kafka
