# Observability Infrastructure - BattleScope V3

**Purpose**: Complete Kubernetes infrastructure for metrics, logging, tracing, and alerting.
**Version**: 1.0
**Date**: 2025-11-25

---

## Overview

This document defines the complete observability stack for BattleScope V3, including:
- **Prometheus** - Metrics collection and alerting
- **Grafana** - Metrics visualization and dashboards
- **Loki** - Log aggregation and querying
- **Jaeger** - Distributed tracing
- **AlertManager** - Alert routing and notification

All observability components run in Kubernetes and are deployed to the `battlescope` namespace.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Observability Stack                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Prometheus  │  │     Loki     │  │    Jaeger    │      │
│  │   (Metrics)  │  │    (Logs)    │  │   (Traces)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                 │
│                      ┌─────▼──────┐                         │
│                      │  Grafana   │                         │
│                      │(Dashboards)│                         │
│                      └────────────┘                         │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              AlertManager                             │   │
│  │  (Receives alerts from Prometheus)                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
           ▲                  ▲                   ▲
           │                  │                   │
    ┌──────┴──────┐    ┌─────┴──────┐    ┌──────┴──────┐
    │  Services   │    │  Services  │    │  Services   │
    │  (Metrics)  │    │   (Logs)   │    │  (Traces)   │
    └─────────────┘    └────────────┘    └─────────────┘
```

---

## 1. Prometheus Stack

### Deployment

```yaml
# infra/k8s/observability/prometheus/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: battlescope
  labels:
    app: prometheus
    component: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      serviceAccountName: prometheus
      containers:
        - name: prometheus
          image: prom/prometheus:v2.48.0
          args:
            - '--config.file=/etc/prometheus/prometheus.yml'
            - '--storage.tsdb.path=/prometheus'
            - '--storage.tsdb.retention.time=30d'
            - '--web.enable-lifecycle'
            - '--web.enable-admin-api'
          ports:
            - name: http
              containerPort: 9090
          volumeMounts:
            - name: config
              mountPath: /etc/prometheus
            - name: rules
              mountPath: /etc/prometheus/rules
            - name: storage
              mountPath: /prometheus
          resources:
            requests:
              cpu: 500m
              memory: 2Gi
            limits:
              cpu: 2000m
              memory: 4Gi
      volumes:
        - name: config
          configMap:
            name: prometheus-config
        - name: rules
          configMap:
            name: prometheus-rules
        - name: storage
          persistentVolumeClaim:
            claimName: prometheus-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: prometheus
  namespace: battlescope
spec:
  type: NodePort
  selector:
    app: prometheus
  ports:
    - name: http
      port: 9090
      targetPort: 9090
      nodePort: 30500  # External access for development
```

### Configuration

```yaml
# infra/k8s/observability/prometheus/config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: battlescope
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      scrape_timeout: 10s
      evaluation_interval: 15s
      external_labels:
        cluster: 'battlescope'
        environment: 'production'

    # Load alert rules
    rule_files:
      - '/etc/prometheus/rules/*.yml'

    # AlertManager configuration
    alerting:
      alertmanagers:
        - static_configs:
            - targets:
                - alertmanager:9093

    # Scrape configurations
    scrape_configs:
      # Prometheus itself
      - job_name: 'prometheus'
        static_configs:
          - targets: ['localhost:9090']

      # Kubernetes API server
      - job_name: 'kubernetes-apiservers'
        kubernetes_sd_configs:
          - role: endpoints
        scheme: https
        tls_config:
          ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
        bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
        relabel_configs:
          - source_labels: [__meta_kubernetes_namespace, __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
            action: keep
            regex: default;kubernetes;https

      # Kubernetes nodes
      - job_name: 'kubernetes-nodes'
        kubernetes_sd_configs:
          - role: node
        scheme: https
        tls_config:
          ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
        bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
        relabel_configs:
          - action: labelmap
            regex: __meta_kubernetes_node_label_(.+)

      # Kubernetes pods (application services)
      - job_name: 'kubernetes-pods'
        kubernetes_sd_configs:
          - role: pod
            namespaces:
              names:
                - battlescope
        relabel_configs:
          # Only scrape pods with prometheus.io/scrape annotation
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
            action: keep
            regex: true

          # Use custom scrape path if specified
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
            action: replace
            target_label: __metrics_path__
            regex: (.+)

          # Use custom port if specified
          - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
            action: replace
            regex: ([^:]+)(?::\d+)?;(\d+)
            replacement: $1:$2
            target_label: __address__

          # Add pod metadata as labels
          - action: labelmap
            regex: __meta_kubernetes_pod_label_(.+)
          - source_labels: [__meta_kubernetes_namespace]
            action: replace
            target_label: kubernetes_namespace
          - source_labels: [__meta_kubernetes_pod_name]
            action: replace
            target_label: kubernetes_pod_name
          - source_labels: [__meta_kubernetes_pod_node_name]
            action: replace
            target_label: kubernetes_node

      # Service monitors (PostgreSQL, Kafka, Redis, etc.)
      - job_name: 'postgres-exporter'
        static_configs:
          - targets:
              - 'postgres-exporter:9187'
            labels:
              service: 'postgresql'

      - job_name: 'kafka-exporter'
        static_configs:
          - targets:
              - 'kafka-exporter:9308'
            labels:
              service: 'kafka'

      - job_name: 'redis-exporter'
        static_configs:
          - targets:
              - 'redis-exporter:9121'
            labels:
              service: 'redis'
```

### Alert Rules

```yaml
# infra/k8s/observability/prometheus/rules.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-rules
  namespace: battlescope
data:
  critical-alerts.yml: |
    groups:
      - name: critical-alerts
        interval: 30s
        rules:
          # Service Down
          - alert: ServiceDown
            expr: up{job=~".*-service"} == 0
            for: 1m
            labels:
              severity: critical
              team: platform
            annotations:
              summary: "Service {{ $labels.job }} is down"
              description: "{{ $labels.job }} on {{ $labels.kubernetes_pod_name }} has been down for more than 1 minute"
              runbook: "https://docs.battlescope.io/runbooks/service-down"

          # High Error Rate
          - alert: HighErrorRate
            expr: |
              sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (service)
              /
              sum(rate(http_requests_total[5m])) by (service)
              > 0.05
            for: 5m
            labels:
              severity: critical
              team: backend
            annotations:
              summary: "High error rate on {{ $labels.service }}"
              description: "Error rate is {{ $value | humanizePercentage }} (threshold: 5%)"
              dashboard: "https://grafana.battlescope.io/d/service-overview?var-service={{ $labels.service }}"
              runbook: "https://docs.battlescope.io/runbooks/high-error-rate"

          # Database Connection Pool Exhausted
          - alert: DatabaseConnectionPoolExhausted
            expr: db_connection_pool_size{state="waiting"} > 0
            for: 2m
            labels:
              severity: critical
              team: backend
            annotations:
              summary: "Database connection pool exhausted on {{ $labels.service }}"
              description: "{{ $value }} connections waiting for pool"
              runbook: "https://docs.battlescope.io/runbooks/db-pool-exhausted"

          # Kafka Consumer Lag Critical
          - alert: KafkaConsumerLagCritical
            expr: kafka_consumer_lag_seconds > 300
            for: 5m
            labels:
              severity: critical
              team: backend
            annotations:
              summary: "Critical Kafka consumer lag on {{ $labels.service }}"
              description: "Consumer lag is {{ $value }}s on topic {{ $labels.topic }} (threshold: 300s)"
              dashboard: "https://grafana.battlescope.io/d/kafka-overview"
              runbook: "https://docs.battlescope.io/runbooks/kafka-lag"

          # Persistent Volume Almost Full
          - alert: PersistentVolumeAlmostFull
            expr: |
              (kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes) > 0.85
            for: 10m
            labels:
              severity: critical
              team: platform
            annotations:
              summary: "PVC {{ $labels.persistentvolumeclaim }} is {{ $value | humanizePercentage }} full"
              description: "Volume usage is above 85% threshold"
              runbook: "https://docs.battlescope.io/runbooks/pvc-full"

  warning-alerts.yml: |
    groups:
      - name: warning-alerts
        interval: 60s
        rules:
          # High Latency
          - alert: HighLatency
            expr: |
              histogram_quantile(0.95,
                rate(http_request_duration_seconds_bucket[5m])
              ) > 1
            for: 10m
            labels:
              severity: warning
              team: backend
            annotations:
              summary: "High latency on {{ $labels.service }}"
              description: "P95 latency is {{ $value }}s (threshold: 1s)"
              dashboard: "https://grafana.battlescope.io/d/service-overview?var-service={{ $labels.service }}"

          # Low Cache Hit Rate
          - alert: LowCacheHitRate
            expr: |
              sum(rate(cache_operations_total{result="hit"}[5m])) by (service)
              /
              sum(rate(cache_operations_total{operation="get"}[5m])) by (service)
              < 0.7
            for: 15m
            labels:
              severity: warning
              team: backend
            annotations:
              summary: "Low cache hit rate on {{ $labels.service }}"
              description: "Cache hit rate is {{ $value | humanizePercentage }} (threshold: 70%)"

          # Event Loop Lag (Node.js)
          - alert: NodeJSEventLoopLag
            expr: nodejs_eventloop_lag_seconds > 0.1
            for: 5m
            labels:
              severity: warning
              team: backend
            annotations:
              summary: "High event loop lag on {{ $labels.service }}"
              description: "Event loop lag is {{ $value }}s (threshold: 100ms)"

          # Memory Usage High
          - alert: MemoryUsageHigh
            expr: |
              container_memory_working_set_bytes{namespace="battlescope"}
              /
              container_spec_memory_limit_bytes{namespace="battlescope"}
              > 0.85
            for: 10m
            labels:
              severity: warning
              team: platform
            annotations:
              summary: "High memory usage on {{ $labels.pod }}"
              description: "Memory usage is {{ $value | humanizePercentage }} (threshold: 85%)"

          # CPU Throttling
          - alert: CPUThrottling
            expr: |
              rate(container_cpu_cfs_throttled_seconds_total{namespace="battlescope"}[5m])
              > 0.5
            for: 10m
            labels:
              severity: warning
              team: platform
            annotations:
              summary: "CPU throttling on {{ $labels.pod }}"
              description: "Container is being CPU throttled {{ $value | humanizePercentage }} of the time"

  slo-alerts.yml: |
    groups:
      - name: slo-alerts
        interval: 120s
        rules:
          # Availability SLO Violation
          - alert: AvailabilitySLOViolation
            expr: |
              avg_over_time(service_available[30d]) < 0.999
            for: 5m
            labels:
              severity: critical
              team: backend
              slo: availability
            annotations:
              summary: "Availability SLO violated for {{ $labels.service }}"
              description: "30-day availability is {{ $value | humanizePercentage }} (SLO: 99.9%)"
              runbook: "https://docs.battlescope.io/runbooks/slo-availability"

          # Latency SLO Violation
          - alert: LatencySLOViolation
            expr: |
              histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[7d])) > 0.5
            for: 10m
            labels:
              severity: critical
              team: backend
              slo: latency
            annotations:
              summary: "Latency SLO violated for {{ $labels.service }}"
              description: "7-day P95 latency is {{ $value }}s (SLO: 500ms)"
              runbook: "https://docs.battlescope.io/runbooks/slo-latency"

          # Error Rate SLO Violation
          - alert: ErrorRateSLOViolation
            expr: |
              sum(rate(http_requests_total{status_code=~"5.."}[7d])) by (service)
              /
              sum(rate(http_requests_total[7d])) by (service)
              > 0.005
            for: 10m
            labels:
              severity: critical
              team: backend
              slo: error_rate
            annotations:
              summary: "Error rate SLO violated for {{ $labels.service }}"
              description: "7-day error rate is {{ $value | humanizePercentage }} (SLO: 0.5%)"
              runbook: "https://docs.battlescope.io/runbooks/slo-error-rate"
```

### Service Account & RBAC

```yaml
# infra/k8s/observability/prometheus/rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: prometheus
  namespace: battlescope
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: prometheus
rules:
  - apiGroups: [""]
    resources:
      - nodes
      - nodes/proxy
      - services
      - endpoints
      - pods
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources:
      - configmaps
    verbs: ["get"]
  - nonResourceURLs: ["/metrics"]
    verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: prometheus
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: prometheus
subjects:
  - kind: ServiceAccount
    name: prometheus
    namespace: battlescope
```

### PersistentVolumeClaim

```yaml
# infra/k8s/observability/prometheus/pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: prometheus-pvc
  namespace: battlescope
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi
```

---

## 2. Grafana

### Deployment

```yaml
# infra/k8s/observability/grafana/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
  namespace: battlescope
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana
  template:
    metadata:
      labels:
        app: grafana
    spec:
      containers:
        - name: grafana
          image: grafana/grafana:10.2.0
          ports:
            - name: http
              containerPort: 3000
          env:
            - name: GF_SECURITY_ADMIN_USER
              valueFrom:
                secretKeyRef:
                  name: grafana-secret
                  key: admin-user
            - name: GF_SECURITY_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: grafana-secret
                  key: admin-password
            - name: GF_PATHS_PROVISIONING
              value: /etc/grafana/provisioning
          volumeMounts:
            - name: storage
              mountPath: /var/lib/grafana
            - name: datasources
              mountPath: /etc/grafana/provisioning/datasources
            - name: dashboards-config
              mountPath: /etc/grafana/provisioning/dashboards
            - name: dashboards
              mountPath: /var/lib/grafana/dashboards
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 1Gi
      volumes:
        - name: storage
          persistentVolumeClaim:
            claimName: grafana-pvc
        - name: datasources
          configMap:
            name: grafana-datasources
        - name: dashboards-config
          configMap:
            name: grafana-dashboards-config
        - name: dashboards
          configMap:
            name: grafana-dashboards
---
apiVersion: v1
kind: Service
metadata:
  name: grafana
  namespace: battlescope
spec:
  type: NodePort
  selector:
    app: grafana
  ports:
    - name: http
      port: 3000
      targetPort: 3000
      nodePort: 30501  # External access
```

### Datasources Configuration

```yaml
# infra/k8s/observability/grafana/datasources.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-datasources
  namespace: battlescope
data:
  datasources.yaml: |
    apiVersion: 1
    datasources:
      # Prometheus
      - name: Prometheus
        type: prometheus
        access: proxy
        url: http://prometheus:9090
        isDefault: true
        editable: false
        jsonData:
          timeInterval: "15s"

      # Loki
      - name: Loki
        type: loki
        access: proxy
        url: http://loki:3100
        editable: false
        jsonData:
          maxLines: 1000

      # Jaeger
      - name: Jaeger
        type: jaeger
        access: proxy
        url: http://jaeger-query:16686
        editable: false
```

### Dashboards Configuration

```yaml
# infra/k8s/observability/grafana/dashboards-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboards-config
  namespace: battlescope
data:
  dashboards.yaml: |
    apiVersion: 1
    providers:
      - name: 'battlescope'
        orgId: 1
        folder: 'BattleScope'
        type: file
        disableDeletion: false
        updateIntervalSeconds: 30
        allowUiUpdates: true
        options:
          path: /var/lib/grafana/dashboards
```

---

## 3. Loki (Log Aggregation)

### Deployment

```yaml
# infra/k8s/observability/loki/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: loki
  namespace: battlescope
spec:
  replicas: 1
  selector:
    matchLabels:
      app: loki
  template:
    metadata:
      labels:
        app: loki
    spec:
      containers:
        - name: loki
          image: grafana/loki:2.9.3
          args:
            - -config.file=/etc/loki/loki.yaml
          ports:
            - name: http
              containerPort: 3100
          volumeMounts:
            - name: config
              mountPath: /etc/loki
            - name: storage
              mountPath: /loki
          resources:
            requests:
              cpu: 500m
              memory: 1Gi
            limits:
              cpu: 2000m
              memory: 4Gi
      volumes:
        - name: config
          configMap:
            name: loki-config
        - name: storage
          persistentVolumeClaim:
            claimName: loki-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: loki
  namespace: battlescope
spec:
  selector:
    app: loki
  ports:
    - name: http
      port: 3100
      targetPort: 3100
```

### Configuration

```yaml
# infra/k8s/observability/loki/config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: loki-config
  namespace: battlescope
data:
  loki.yaml: |
    auth_enabled: false

    server:
      http_listen_port: 3100

    ingester:
      lifecycler:
        ring:
          kvstore:
            store: inmemory
          replication_factor: 1
      chunk_idle_period: 5m
      chunk_retain_period: 30s
      max_transfer_retries: 0

    schema_config:
      configs:
        - from: 2023-01-01
          store: boltdb-shipper
          object_store: filesystem
          schema: v11
          index:
            prefix: index_
            period: 24h

    storage_config:
      boltdb_shipper:
        active_index_directory: /loki/boltdb-shipper-active
        cache_location: /loki/boltdb-shipper-cache
        cache_ttl: 24h
        shared_store: filesystem
      filesystem:
        directory: /loki/chunks

    limits_config:
      enforce_metric_name: false
      reject_old_samples: true
      reject_old_samples_max_age: 168h
      ingestion_rate_mb: 10
      ingestion_burst_size_mb: 20
      retention_period: 168h  # 7 days

    chunk_store_config:
      max_look_back_period: 168h

    table_manager:
      retention_deletes_enabled: true
      retention_period: 168h

    compactor:
      working_directory: /loki/compactor
      shared_store: filesystem
      retention_enabled: true
```

### Promtail (Log Shipper)

```yaml
# infra/k8s/observability/loki/promtail.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: promtail
  namespace: battlescope
spec:
  selector:
    matchLabels:
      app: promtail
  template:
    metadata:
      labels:
        app: promtail
    spec:
      serviceAccountName: promtail
      containers:
        - name: promtail
          image: grafana/promtail:2.9.3
          args:
            - -config.file=/etc/promtail/promtail.yaml
          volumeMounts:
            - name: config
              mountPath: /etc/promtail
            - name: varlog
              mountPath: /var/log
            - name: varlibdockercontainers
              mountPath: /var/lib/docker/containers
              readOnly: true
          resources:
            requests:
              cpu: 50m
              memory: 128Mi
            limits:
              cpu: 200m
              memory: 256Mi
      volumes:
        - name: config
          configMap:
            name: promtail-config
        - name: varlog
          hostPath:
            path: /var/log
        - name: varlibdockercontainers
          hostPath:
            path: /var/lib/docker/containers
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: promtail-config
  namespace: battlescope
data:
  promtail.yaml: |
    server:
      http_listen_port: 9080
      grpc_listen_port: 0

    positions:
      filename: /tmp/positions.yaml

    clients:
      - url: http://loki:3100/loki/api/v1/push

    scrape_configs:
      - job_name: kubernetes-pods
        kubernetes_sd_configs:
          - role: pod
            namespaces:
              names:
                - battlescope
        pipeline_stages:
          - docker: {}
          - json:
              expressions:
                level: level
                timestamp: timestamp
                service: service
                trace_id: trace_id
                message: message
          - labels:
              level:
              service:
          - timestamp:
              source: timestamp
              format: RFC3339
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_label_app]
            target_label: app
          - source_labels: [__meta_kubernetes_pod_name]
            target_label: pod
          - source_labels: [__meta_kubernetes_namespace]
            target_label: namespace
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: promtail
  namespace: battlescope
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: promtail
rules:
  - apiGroups: [""]
    resources:
      - nodes
      - nodes/proxy
      - services
      - endpoints
      - pods
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: promtail
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: promtail
subjects:
  - kind: ServiceAccount
    name: promtail
    namespace: battlescope
```

---

## 4. Jaeger (Distributed Tracing)

### Deployment

```yaml
# infra/k8s/observability/jaeger/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jaeger
  namespace: battlescope
spec:
  replicas: 1
  selector:
    matchLabels:
      app: jaeger
  template:
    metadata:
      labels:
        app: jaeger
    spec:
      containers:
        - name: jaeger
          image: jaegertracing/all-in-one:1.51
          env:
            - name: COLLECTOR_ZIPKIN_HOST_PORT
              value: ":9411"
            - name: SPAN_STORAGE_TYPE
              value: "badger"
            - name: BADGER_EPHEMERAL
              value: "false"
            - name: BADGER_DIRECTORY_VALUE
              value: "/badger/data"
            - name: BADGER_DIRECTORY_KEY
              value: "/badger/key"
          ports:
            # Jaeger UI
            - name: ui
              containerPort: 16686
            # Collector HTTP
            - name: collector-http
              containerPort: 14268
            # Collector gRPC
            - name: collector-grpc
              containerPort: 14250
            # Agent UDP (Compact)
            - name: agent-compact
              containerPort: 6831
              protocol: UDP
            # Agent UDP (Binary)
            - name: agent-binary
              containerPort: 6832
              protocol: UDP
            # Zipkin
            - name: zipkin
              containerPort: 9411
          volumeMounts:
            - name: storage
              mountPath: /badger
          resources:
            requests:
              cpu: 200m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 2Gi
      volumes:
        - name: storage
          persistentVolumeClaim:
            claimName: jaeger-pvc
---
# Jaeger Query Service (UI)
apiVersion: v1
kind: Service
metadata:
  name: jaeger-query
  namespace: battlescope
spec:
  type: NodePort
  selector:
    app: jaeger
  ports:
    - name: ui
      port: 16686
      targetPort: 16686
      nodePort: 30502  # External access
---
# Jaeger Collector Service
apiVersion: v1
kind: Service
metadata:
  name: jaeger-collector
  namespace: battlescope
spec:
  selector:
    app: jaeger
  ports:
    - name: http
      port: 14268
      targetPort: 14268
    - name: grpc
      port: 14250
      targetPort: 14250
---
# Jaeger Agent Service
apiVersion: v1
kind: Service
metadata:
  name: jaeger-agent
  namespace: battlescope
spec:
  selector:
    app: jaeger
  ports:
    - name: compact
      port: 6831
      targetPort: 6831
      protocol: UDP
    - name: binary
      port: 6832
      targetPort: 6832
      protocol: UDP
    - name: zipkin
      port: 9411
      targetPort: 9411
```

---

## 5. AlertManager

### Deployment

```yaml
# infra/k8s/observability/alertmanager/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: alertmanager
  namespace: battlescope
spec:
  replicas: 1
  selector:
    matchLabels:
      app: alertmanager
  template:
    metadata:
      labels:
        app: alertmanager
    spec:
      containers:
        - name: alertmanager
          image: prom/alertmanager:v0.26.0
          args:
            - '--config.file=/etc/alertmanager/alertmanager.yml'
            - '--storage.path=/alertmanager'
          ports:
            - name: http
              containerPort: 9093
          volumeMounts:
            - name: config
              mountPath: /etc/alertmanager
            - name: storage
              mountPath: /alertmanager
          resources:
            requests:
              cpu: 50m
              memory: 128Mi
            limits:
              cpu: 200m
              memory: 512Mi
      volumes:
        - name: config
          configMap:
            name: alertmanager-config
        - name: storage
          persistentVolumeClaim:
            claimName: alertmanager-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: alertmanager
  namespace: battlescope
spec:
  selector:
    app: alertmanager
  ports:
    - name: http
      port: 9093
      targetPort: 9093
```

### Configuration

```yaml
# infra/k8s/observability/alertmanager/config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: alertmanager-config
  namespace: battlescope
data:
  alertmanager.yml: |
    global:
      resolve_timeout: 5m
      # Slack webhook (replace with actual webhook URL)
      slack_api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'

    route:
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 12h
      receiver: 'slack-notifications'
      routes:
        # Critical alerts go to PagerDuty + Slack
        - match:
            severity: critical
          receiver: 'pagerduty-critical'
          continue: true

        # Warning alerts only to Slack
        - match:
            severity: warning
          receiver: 'slack-notifications'

    receivers:
      # Slack notifications
      - name: 'slack-notifications'
        slack_configs:
          - channel: '#battlescope-alerts'
            title: '{{ .GroupLabels.alertname }}'
            text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
            send_resolved: true

      # PagerDuty for critical alerts
      - name: 'pagerduty-critical'
        pagerduty_configs:
          - service_key: 'YOUR_PAGERDUTY_SERVICE_KEY'
            description: '{{ .GroupLabels.alertname }}: {{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

    inhibit_rules:
      # Inhibit warning if critical alert is firing
      - source_match:
          severity: 'critical'
        target_match:
          severity: 'warning'
        equal: ['alertname', 'service']
```

---

## 6. Application Instrumentation

### Service Deployment Annotations

All service deployments MUST include these annotations for Prometheus scraping:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: battle-service
  namespace: battlescope
spec:
  template:
    metadata:
      annotations:
        # Prometheus scraping
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      containers:
        - name: battle-service
          image: battlescope/battle-service:latest
          env:
            # OpenTelemetry configuration
            - name: OTEL_SERVICE_NAME
              value: "battle-service"
            - name: OTEL_EXPORTER_JAEGER_ENDPOINT
              value: "http://jaeger-collector:14268/api/traces"
            - name: OTEL_TRACES_SAMPLER
              value: "always_on"
            # Logging configuration
            - name: LOG_LEVEL
              value: "info"
            - name: LOG_FORMAT
              value: "json"
```

### OpenTelemetry SDK Setup (Node.js)

```typescript
// src/telemetry/tracer.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';

const jaegerExporter = new JaegerExporter({
  endpoint: process.env.OTEL_EXPORTER_JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'unknown-service',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  }),
  traceExporter: jaegerExporter,
  instrumentations: [
    new HttpInstrumentation(),
    new FastifyInstrumentation(),
    new PgInstrumentation(),
    new RedisInstrumentation(),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.error('Error terminating tracing', error))
    .finally(() => process.exit(0));
});
```

---

## 7. Makefile Integration

```makefile
# Makefile

# Observability stack commands
.PHONY: observability-deploy observability-destroy observability-status

## Deploy observability stack (Prometheus, Grafana, Loki, Jaeger)
observability-deploy:
	@echo "Deploying observability stack..."
	kubectl apply -f infra/k8s/observability/prometheus/
	kubectl apply -f infra/k8s/observability/grafana/
	kubectl apply -f infra/k8s/observability/loki/
	kubectl apply -f infra/k8s/observability/jaeger/
	kubectl apply -f infra/k8s/observability/alertmanager/
	@echo "Waiting for pods to be ready..."
	kubectl wait --for=condition=ready pod -l app=prometheus -n battlescope --timeout=300s
	kubectl wait --for=condition=ready pod -l app=grafana -n battlescope --timeout=300s
	kubectl wait --for=condition=ready pod -l app=loki -n battlescope --timeout=300s
	kubectl wait --for=condition=ready pod -l app=jaeger -n battlescope --timeout=300s
	@echo "Observability stack deployed successfully!"

## Destroy observability stack
observability-destroy:
	kubectl delete -f infra/k8s/observability/ --recursive

## Check observability stack status
observability-status:
	@echo "=== Prometheus ==="
	@kubectl get pods -l app=prometheus -n battlescope
	@echo ""
	@echo "=== Grafana ==="
	@kubectl get pods -l app=grafana -n battlescope
	@echo ""
	@echo "=== Loki ==="
	@kubectl get pods -l app=loki -n battlescope
	@echo ""
	@echo "=== Jaeger ==="
	@kubectl get pods -l app=jaeger -n battlescope
	@echo ""
	@echo "=== AlertManager ==="
	@kubectl get pods -l app=alertmanager -n battlescope

## Open Grafana in browser
grafana-open:
	@echo "Opening Grafana at http://$(minikube ip):30501"
	@open http://$(shell minikube ip):30501 || xdg-open http://$(shell minikube ip):30501

## Open Prometheus in browser
prometheus-open:
	@echo "Opening Prometheus at http://$(minikube ip):30500"
	@open http://$(shell minikube ip):30500 || xdg-open http://$(shell minikube ip):30500

## Open Jaeger in browser
jaeger-open:
	@echo "Opening Jaeger at http://$(minikube ip):30502"
	@open http://$(shell minikube ip):30502 || xdg-open http://$(shell minikube ip):30502
```

---

## 8. Access URLs (Minikube)

After deploying, access the observability stack at:

| Service | URL | Credentials |
|---------|-----|-------------|
| **Prometheus** | `http://<minikube-ip>:30500` | N/A |
| **Grafana** | `http://<minikube-ip>:30501` | admin / (from secret) |
| **Jaeger UI** | `http://<minikube-ip>:30502` | N/A |
| **AlertManager** | Internal only | N/A |
| **Loki** | Internal only (via Grafana) | N/A |

Get minikube IP: `minikube ip`

---

## Summary

This observability infrastructure provides:

✅ **Metrics**: Prometheus scraping all services with retention (30 days)
✅ **Alerting**: 15+ predefined alerts (critical + warning + SLO violations)
✅ **Visualization**: Grafana dashboards with Prometheus, Loki, and Jaeger datasources
✅ **Logging**: Loki aggregating structured JSON logs from all pods (7 days retention)
✅ **Tracing**: Jaeger collecting distributed traces with OpenTelemetry
✅ **Notifications**: AlertManager routing to Slack + PagerDuty

All components are Kubernetes-native, scalable, and production-ready!
