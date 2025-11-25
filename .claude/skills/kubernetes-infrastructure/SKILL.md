# Claude Skill: Kubernetes Infrastructure for BattleScope

**Purpose**: Guide all Kubernetes infrastructure definitions, deployments, and configuration for BattleScope services.

---

## Core Principles

### 1. Everything Runs on Kubernetes

**Rule**: All production infrastructure MUST be defined as Kubernetes resources.

**Rationale**:
- Consistent deployment across environments
- Infrastructure as Code (GitOps ready)
- Declarative configuration management
- Built-in service discovery and load balancing
- Simplified scaling and updates

**What Must Be Kubernetes Resources**:
- ✅ All application services (Ingestion, Enrichment, Battle, Search, Notification, Frontend, BFF)
- ✅ All stateful services (PostgreSQL, Kafka/Redpanda, Typesense, Redis)
- ✅ All configuration (ConfigMaps, Secrets)
- ✅ All networking (Services, NodePorts)
- ✅ All storage (PersistentVolumeClaims)
- ✅ All observability (Prometheus, Grafana, Loki, Jaeger)

**What Should NOT Be Custom**:
- ❌ Don't create custom cluster management scripts
- ❌ Don't use docker-compose in production
- ❌ Don't manage services outside of Kubernetes

---

## Namespace Standards

### Single Namespace: `battlescope`

**Rule**: All BattleScope resources MUST be deployed to the `battlescope` namespace.

**Rationale**:
- Clear resource isolation from other workloads
- Simplified RBAC management
- Easy to apply policies (NetworkPolicies, ResourceQuotas, LimitRanges)
- Consistent naming and discovery

**Namespace Definition**:
```yaml
# infra/k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: battlescope
  labels:
    app.kubernetes.io/name: battlescope
    app.kubernetes.io/part-of: battlescope-platform
```

**Resource Naming Convention**:
```
Format: <service-name>-<resource-type>

Examples:
- ingestion-deployment
- ingestion-service
- ingestion-configmap
- ingestion-secret
- battles-db-statefulset
- battles-db-pvc
```

---

## Development Environment: Minikube

### Local Development Setup

**Minikube Configuration**:
```bash
# Start minikube with sufficient resources
minikube start \
  --cpus=4 \
  --memory=8192 \
  --disk-size=50g \
  --driver=docker \
  --addons=metrics-server,storage-provisioner

# Enable necessary addons
minikube addons enable metrics-server
minikube addons enable storage-provisioner  # For PVCs
```

**Context Setup**:
```bash
# Ensure kubectl uses minikube context
kubectl config use-context minikube

# Create battlescope namespace
kubectl apply -f infra/k8s/namespace.yaml

# Verify
kubectl config set-context --current --namespace=battlescope
```

### Storage for Minikube

**PersistentVolume Provisioning**:
- Minikube includes automatic PV provisioning via `storage-provisioner` addon
- Uses `hostPath` storage class by default
- PVCs automatically bound to dynamically provisioned PVs

**Storage Classes**:
```yaml
# infra/k8s/storage-class.yaml (optional, uses default)
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: battlescope-standard
  namespace: battlescope
provisioner: k8s.io/minikube-hostpath
volumeBindingMode: Immediate
reclaimPolicy: Retain  # Keep data on PVC deletion for dev
```

---

## External Access: NodePort Services

### NodePort Requirements

**Rule**: All services requiring external access MUST use NodePort type with ports in 30000-32767 range.

**Rationale**:
- Minikube does not support LoadBalancer type (requires cloud provider)
- NodePort exposes services on each node's IP at a static port
- Simple port-forward alternative for local development
- Consistent with production edge-proxy patterns

### Port Assignment Strategy

**Reserved NodePort Ranges**:
```
30000-30099: Frontend & User-Facing Services
30100-30199: API Services
30200-30299: Databases (admin access only)
30300-30399: Message Brokers
30400-30499: Search & Caching
30500-30599: Observability
```

**Assigned Ports**:

| Service | NodePort | Internal Port | Purpose |
|---------|----------|---------------|---------|
| **Frontend** | 30000 | 80 | Web UI |
| **Frontend BFF** | 30100 | 3000 | BFF API |
| **Ingestion Service** | 30101 | 3001 | Ingestion API |
| **Enrichment Service** | 30102 | 3002 | Enrichment API |
| **Battle Service** | 30103 | 3003 | Battle API |
| **Search Service** | 30104 | 3004 | Search API |
| **Notification Service** | 30105 | 3005 | Notification API + WebSocket |
| **PostgreSQL (Ingestion)** | 30200 | 5432 | Ingestion DB (admin) |
| **PostgreSQL (Enrichment)** | 30201 | 5432 | Enrichment DB (admin) |
| **PostgreSQL (Battles)** | 30202 | 5432 | Battles DB (admin) |
| **Kafka/Redpanda** | 30300 | 9092 | Kafka broker |
| **Kafka UI** | 30301 | 8080 | Kafka admin UI |
| **Typesense** | 30400 | 8108 | Search API |
| **Redis (Notifications)** | 30401 | 6379 | Redis (admin) |
| **Redis (Cache)** | 30402 | 6379 | Redis (admin) |
| **Prometheus** | 30500 | 9090 | Metrics |
| **Grafana** | 30501 | 3000 | Dashboards |
| **Jaeger UI** | 30502 | 16686 | Tracing UI |

**Port Conflict Checking**:
```bash
# Before assigning a NodePort, check if it's available
minikube service list -n battlescope

# Check specific port on minikube node
minikube ssh "sudo netstat -tuln | grep 30100"

# If port is in use, choose next available in range
```

### NodePort Service Definition Template

```yaml
apiVersion: v1
kind: Service
metadata:
  name: <service-name>
  namespace: battlescope
  labels:
    app: <service-name>
    tier: <frontend|backend|data>
spec:
  type: NodePort
  selector:
    app: <service-name>
  ports:
    - name: http
      protocol: TCP
      port: <internal-port>        # Service port (internal)
      targetPort: <container-port> # Container port
      nodePort: <30xxx>            # External port (30000-32767)
```

**Example - Frontend Service**:
```yaml
# infra/k8s/services/frontend-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: battlescope
  labels:
    app: frontend
    tier: frontend
spec:
  type: NodePort
  selector:
    app: frontend
  ports:
    - name: http
      protocol: TCP
      port: 80
      targetPort: 80
      nodePort: 30000
```

**Accessing Services**:
```bash
# Get minikube IP
minikube ip

# Access service
curl http://$(minikube ip):30000

# Or use minikube service command
minikube service frontend -n battlescope --url
```

---

## Configuration Management

### ConfigMaps

**Rule**: All non-sensitive configuration MUST use ConfigMaps.

**Location**: `infra/k8s/config/<service-name>-configmap.yaml`

**Template**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: <service-name>-config
  namespace: battlescope
  labels:
    app: <service-name>
data:
  # Application configuration
  NODE_ENV: "production"
  LOG_LEVEL: "info"

  # Service discovery (use Kubernetes DNS)
  KAFKA_BROKERS: "kafka-service.battlescope.svc.cluster.local:9092"
  REDIS_HOST: "redis-cache.battlescope.svc.cluster.local"
  REDIS_PORT: "6379"

  # Feature flags
  ENABLE_HISTORICAL_INGESTION: "true"
  ENABLE_DAILY_VERIFICATION: "true"
  DATA_RETENTION_MONTHS: "60"
```

**Example - Ingestion Service ConfigMap**:
```yaml
# infra/k8s/config/ingestion-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ingestion-config
  namespace: battlescope
  labels:
    app: ingestion
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"

  # zKillboard API
  ZKILL_REDISQ_URL: "https://zkillboard.com/api/redisq.php"
  ZKILL_HISTORY_URL: "https://zkillboard.com/api/history"
  ZKILL_RATE_LIMIT: "10"

  # Kafka
  KAFKA_BROKERS: "kafka-service.battlescope.svc.cluster.local:9092"
  KAFKA_TOPIC_INGESTED: "killmail.ingested"
  KAFKA_TOPIC_RECLUSTER: "battle.recluster"
  KAFKA_TOPIC_RETENTION: "data.retention"

  # Database
  DB_HOST: "ingestion-db.battlescope.svc.cluster.local"
  DB_PORT: "5432"
  DB_NAME: "ingestion_db"

  # Retention Policy
  DATA_RETENTION_MONTHS: "60"
  RETENTION_CLEANUP_SCHEDULE: "0 2 * * *"
  DAILY_VERIFICATION_SCHEDULE: "0 3 * * *"
```

### Secrets

**Rule**: All sensitive configuration MUST use Secrets.

**Location**: `infra/k8s/secrets/<service-name>-secret.yaml`

**IMPORTANT**: Secrets MUST NOT be committed to git in plain text.

**Secret Management Strategy**:
```bash
# Method 1: Create from environment variables (local development)
export DB_PASSWORD="your-password-here"
envsubst < infra/k8s/secrets/ingestion-secret.yaml | kubectl apply -f -

# Method 2: Create directly with kubectl
kubectl create secret generic ingestion-secret \
  --from-literal=DB_PASSWORD=your-password-here \
  --from-literal=DB_USER=ingestion_user \
  -n battlescope

# Method 3: Use sealed-secrets (production)
# Install sealed-secrets controller, then:
kubeseal < secret.yaml > sealed-secret.yaml
# Commit sealed-secret.yaml to git safely
```

**Secret Template** (with placeholders):
```yaml
# infra/k8s/secrets/ingestion-secret.yaml.template
apiVersion: v1
kind: Secret
metadata:
  name: <service-name>-secret
  namespace: battlescope
  labels:
    app: <service-name>
type: Opaque
stringData:
  # Database credentials
  DB_USER: ${DB_USER}
  DB_PASSWORD: ${DB_PASSWORD}

  # API keys
  API_KEY: ${API_KEY}
```

**Example - Ingestion Service Secret**:
```yaml
# infra/k8s/secrets/ingestion-secret.yaml.template
apiVersion: v1
kind: Secret
metadata:
  name: ingestion-secret
  namespace: battlescope
  labels:
    app: ingestion
type: Opaque
stringData:
  DB_USER: ${INGESTION_DB_USER}
  DB_PASSWORD: ${INGESTION_DB_PASSWORD}
```

### Consuming Configuration in Pods

**Environment Variables from ConfigMap**:
```yaml
spec:
  containers:
    - name: ingestion
      image: battlescope/ingestion:latest
      envFrom:
        - configMapRef:
            name: ingestion-config
      env:
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: ingestion-secret
              key: DB_USER
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: ingestion-secret
              key: DB_PASSWORD
```

---

## Persistent Storage (PVCs)

### PersistentVolumeClaim Standards

**Rule**: All stateful services MUST use PersistentVolumeClaims.

**Location**: `infra/k8s/storage/<service-name>-pvc.yaml`

**PVC Naming Convention**:
```
Format: <service-name>-<purpose>-pvc

Examples:
- ingestion-db-pvc
- battles-db-pvc
- kafka-data-pvc
- prometheus-data-pvc
```

**PVC Template**:
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: <service-name>-pvc
  namespace: battlescope
  labels:
    app: <service-name>
spec:
  accessModes:
    - ReadWriteOnce  # Single node read-write
  resources:
    requests:
      storage: <size>Gi
  storageClassName: standard  # Use default minikube storage class
```

**Storage Size Guidelines**:

| Service | Storage Size | Rationale |
|---------|--------------|-----------|
| **ingestion-db** | 20Gi | ~15M killmail events (60 months) |
| **enrichment-db** | 50Gi | Full killmail payloads + ESI cache |
| **battles-db** | 100Gi | Battles + participants + statistics |
| **kafka-data** | 100Gi | Event retention (7 days) |
| **typesense-data** | 50Gi | Search indices |
| **redis-notifications** | 5Gi | Active connections + subscriptions |
| **redis-cache** | 10Gi | BFF cache |
| **prometheus-data** | 50Gi | Metrics retention (30 days) |
| **loki-data** | 100Gi | Logs retention (7 days) |

**Example - PostgreSQL PVC**:
```yaml
# infra/k8s/storage/ingestion-db-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ingestion-db-pvc
  namespace: battlescope
  labels:
    app: ingestion-db
    tier: data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
  storageClassName: standard
```

### Using PVCs in StatefulSets

**StatefulSet with PVC**:
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ingestion-db
  namespace: battlescope
spec:
  serviceName: ingestion-db
  replicas: 1
  selector:
    matchLabels:
      app: ingestion-db
  template:
    metadata:
      labels:
        app: ingestion-db
    spec:
      containers:
        - name: postgres
          image: postgres:15
          ports:
            - containerPort: 5432
              name: postgres
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
          envFrom:
            - configMapRef:
                name: ingestion-db-config
            - secretRef:
                name: ingestion-db-secret
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 20Gi
```

---

## Service Discovery

### Kubernetes DNS

**Rule**: Use Kubernetes DNS for all internal service communication.

**DNS Format**:
```
<service-name>.<namespace>.svc.cluster.local:<port>

Examples:
- kafka-service.battlescope.svc.cluster.local:9092
- ingestion-db.battlescope.svc.cluster.local:5432
- redis-cache.battlescope.svc.cluster.local:6379
```

**Short Form** (within same namespace):
```
<service-name>:<port>

Examples:
- kafka-service:9092
- ingestion-db:5432
- redis-cache:6379
```

**Environment Variables for Service Discovery**:
```yaml
# In ConfigMap
data:
  KAFKA_BROKERS: "kafka-service:9092"
  POSTGRES_HOST: "ingestion-db"
  POSTGRES_PORT: "5432"
  REDIS_HOST: "redis-cache"
  REDIS_PORT: "6379"
```

---

## Resource Limits & Requests

### Resource Standards

**Rule**: All Deployments and StatefulSets MUST define resource requests and limits.

**Guidelines**:
```yaml
spec:
  containers:
    - name: <container-name>
      resources:
        requests:
          cpu: <min-cpu>
          memory: <min-memory>
        limits:
          cpu: <max-cpu>
          memory: <max-memory>
```

**Resource Allocations**:

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit |
|---------|-------------|-----------|----------------|--------------|
| **Ingestion** | 100m | 500m | 128Mi | 512Mi |
| **Enrichment** | 200m | 1000m | 256Mi | 1Gi |
| **Battle** | 200m | 1000m | 512Mi | 2Gi |
| **Search** | 200m | 1000m | 256Mi | 1Gi |
| **Notification** | 100m | 500m | 256Mi | 1Gi |
| **Frontend BFF** | 200m | 1000m | 256Mi | 1Gi |
| **Frontend** | 100m | 500m | 128Mi | 512Mi |
| **PostgreSQL** | 500m | 2000m | 1Gi | 4Gi |
| **Kafka** | 1000m | 2000m | 2Gi | 4Gi |
| **Typesense** | 500m | 2000m | 1Gi | 4Gi |
| **Redis** | 100m | 500m | 256Mi | 1Gi |

---

## Deployment Structure

### Directory Layout

```
infra/k8s/
├── namespace.yaml
├── storage-class.yaml
├── config/
│   ├── ingestion-configmap.yaml
│   ├── enrichment-configmap.yaml
│   ├── battle-configmap.yaml
│   ├── search-configmap.yaml
│   ├── notification-configmap.yaml
│   ├── frontend-bff-configmap.yaml
│   └── frontend-configmap.yaml
├── secrets/
│   ├── ingestion-secret.yaml.template
│   ├── enrichment-secret.yaml.template
│   ├── battle-secret.yaml.template
│   ├── ingestion-db-secret.yaml.template
│   ├── enrichment-db-secret.yaml.template
│   ├── battles-db-secret.yaml.template
│   └── kafka-secret.yaml.template
├── storage/
│   ├── ingestion-db-pvc.yaml
│   ├── enrichment-db-pvc.yaml
│   ├── battles-db-pvc.yaml
│   ├── kafka-pvc.yaml
│   ├── typesense-pvc.yaml
│   ├── redis-notifications-pvc.yaml
│   ├── redis-cache-pvc.yaml
│   ├── prometheus-pvc.yaml
│   └── loki-pvc.yaml
├── services/
│   ├── frontend-service.yaml (NodePort 30000)
│   ├── frontend-bff-service.yaml (NodePort 30100)
│   ├── ingestion-service.yaml (NodePort 30101)
│   ├── enrichment-service.yaml (NodePort 30102)
│   ├── battle-service.yaml (NodePort 30103)
│   ├── search-service.yaml (NodePort 30104)
│   ├── notification-service.yaml (NodePort 30105)
│   ├── ingestion-db-service.yaml (NodePort 30200)
│   ├── enrichment-db-service.yaml (NodePort 30201)
│   ├── battles-db-service.yaml (NodePort 30202)
│   ├── kafka-service.yaml (NodePort 30300)
│   ├── typesense-service.yaml (NodePort 30400)
│   ├── redis-notifications-service.yaml (NodePort 30401)
│   └── redis-cache-service.yaml (NodePort 30402)
├── deployments/
│   ├── frontend-deployment.yaml
│   ├── frontend-bff-deployment.yaml
│   ├── ingestion-deployment.yaml
│   ├── enrichment-deployment.yaml
│   ├── battle-deployment.yaml
│   ├── search-deployment.yaml
│   └── notification-deployment.yaml
├── statefulsets/
│   ├── ingestion-db-statefulset.yaml
│   ├── enrichment-db-statefulset.yaml
│   ├── battles-db-statefulset.yaml
│   ├── kafka-statefulset.yaml
│   ├── typesense-statefulset.yaml
│   ├── redis-notifications-statefulset.yaml
│   └── redis-cache-statefulset.yaml
└── observability/
    ├── prometheus-deployment.yaml
    ├── grafana-deployment.yaml
    ├── loki-statefulset.yaml
    └── jaeger-deployment.yaml
```

---

## Deployment Commands

### Initial Setup

```bash
# 1. Create namespace
kubectl apply -f infra/k8s/namespace.yaml

# 2. Create storage class (optional, uses default)
kubectl apply -f infra/k8s/storage-class.yaml

# 3. Create PVCs
kubectl apply -f infra/k8s/storage/

# 4. Create ConfigMaps
kubectl apply -f infra/k8s/config/

# 5. Create Secrets (after setting env vars)
export INGESTION_DB_USER="ingestion_user"
export INGESTION_DB_PASSWORD="secure-password"
# ... set all required secrets
envsubst < infra/k8s/secrets/ingestion-secret.yaml.template | kubectl apply -f -

# 6. Deploy StatefulSets (databases, kafka, redis)
kubectl apply -f infra/k8s/statefulsets/

# 7. Wait for StatefulSets to be ready
kubectl wait --for=condition=ready pod -l tier=data -n battlescope --timeout=300s

# 8. Create Services
kubectl apply -f infra/k8s/services/

# 9. Deploy Applications
kubectl apply -f infra/k8s/deployments/

# 10. Deploy Observability
kubectl apply -f infra/k8s/observability/
```

### Makefile Integration

```makefile
# Makefile at root
.PHONY: k8s-setup k8s-deploy k8s-clean

k8s-setup: ## Setup Kubernetes cluster (namespace, storage, config)
	@echo "Creating namespace..."
	kubectl apply -f infra/k8s/namespace.yaml
	@echo "Creating PVCs..."
	kubectl apply -f infra/k8s/storage/
	@echo "Creating ConfigMaps..."
	kubectl apply -f infra/k8s/config/
	@echo "✅ Kubernetes setup complete"

k8s-secrets: ## Create secrets from environment variables
	@echo "Creating secrets..."
	@test -n "$$INGESTION_DB_PASSWORD" || (echo "Error: INGESTION_DB_PASSWORD not set" && exit 1)
	envsubst < infra/k8s/secrets/ingestion-secret.yaml.template | kubectl apply -f -
	@echo "✅ Secrets created"

k8s-deploy: ## Deploy all services to Kubernetes
	@echo "Deploying StatefulSets..."
	kubectl apply -f infra/k8s/statefulsets/
	@echo "Waiting for StatefulSets to be ready..."
	kubectl wait --for=condition=ready pod -l tier=data -n battlescope --timeout=300s
	@echo "Creating Services..."
	kubectl apply -f infra/k8s/services/
	@echo "Deploying Applications..."
	kubectl apply -f infra/k8s/deployments/
	@echo "✅ Deployment complete"

k8s-status: ## Show status of all resources
	kubectl get all -n battlescope
	kubectl get pvc -n battlescope
	kubectl get configmap -n battlescope
	kubectl get secret -n battlescope

k8s-clean: ## Delete all Kubernetes resources
	kubectl delete namespace battlescope

k8s-logs: ## Show logs for a specific service (use SERVICE=ingestion)
	kubectl logs -f -l app=$(SERVICE) -n battlescope

k8s-shell: ## Open shell in a specific service (use SERVICE=ingestion)
	kubectl exec -it deployment/$(SERVICE) -n battlescope -- /bin/sh
```

---

## Health Checks

### Liveness & Readiness Probes

**Rule**: All Deployments MUST define liveness and readiness probes.

**Template**:
```yaml
spec:
  containers:
    - name: <service-name>
      livenessProbe:
        httpGet:
          path: /health
          port: <port>
        initialDelaySeconds: 30
        periodSeconds: 10
        timeoutSeconds: 5
        failureThreshold: 3
      readinessProbe:
        httpGet:
          path: /ready
          port: <port>
        initialDelaySeconds: 10
        periodSeconds: 5
        timeoutSeconds: 3
        failureThreshold: 3
```

---

## Summary: The Golden Rules

1. **Everything on Kubernetes** - All infrastructure defined as K8s resources
2. **Single Namespace** - All resources in `battlescope` namespace
3. **NodePort for External** - Use NodePort 30000-32767 for external access
4. **Check Port Availability** - Always verify NodePort is free before assigning
5. **PVCs for State** - All stateful services use PersistentVolumeClaims
6. **ConfigMaps for Config** - Non-sensitive config in ConfigMaps
7. **Secrets for Credentials** - Sensitive data in Secrets (never in git)
8. **Kubernetes DNS** - Use K8s DNS for service discovery
9. **Resource Limits** - Always define requests and limits
10. **Minikube Compatible** - All definitions work with minikube out-of-box

---

## How Claude Should Use This Skill

When I (Claude) am:

- **Creating K8s resources**: Follow namespace, naming, and structure conventions
- **Assigning NodePorts**: Check availability, use assigned range, document in table
- **Defining storage**: Use PVCs with appropriate sizes from guidelines
- **Configuring services**: Use ConfigMaps for config, Secrets for credentials
- **Setting up service discovery**: Use Kubernetes DNS names
- **Writing deployment files**: Include resource limits, health checks, proper labels
- **Creating Makefiles**: Integrate K8s commands following patterns above

**If unclear about NodePort assignment or storage sizes, ASK before implementing.**

---

## References

- Kubernetes Documentation: https://kubernetes.io/docs/
- Minikube Documentation: https://minikube.sigs.k8s.io/docs/
- StatefulSet Best Practices: https://kubernetes.io/docs/tutorials/stateful-application/
- Storage Classes: https://kubernetes.io/docs/concepts/storage/storage-classes/
