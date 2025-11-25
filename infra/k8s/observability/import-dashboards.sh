#!/bin/bash

# Import dashboards into Grafana
GRAFANA_URL="http://10.0.1.5:30300"
GRAFANA_USER="admin"
GRAFANA_PASSWORD="admin"

echo "Importing dashboards to Grafana..."

# Authentication Dashboard
curl -X POST "${GRAFANA_URL}/api/dashboards/db" \
  -H "Content-Type: application/json" \
  -u "${GRAFANA_USER}:${GRAFANA_PASSWORD}" \
  -d @- <<'EOF'
{
  "dashboard": {
    "id": null,
    "uid": "auth-dashboard",
    "title": "BattleScope - Authentication Service",
    "tags": ["battlescope", "authentication"],
    "timezone": "browser",
    "schemaVersion": 16,
    "version": 0,
    "refresh": "5s",
    "panels": [
      {
        "id": 1,
        "title": "Active Sessions (Redis)",
        "type": "stat",
        "gridPos": {"x": 0, "y": 0, "w": 6, "h": 4},
        "targets": [
          {
            "expr": "redis_db_keys{namespace=\"battlescope\"}",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "color": {"mode": "thresholds"},
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"value": null, "color": "green"},
                {"value": 100, "color": "yellow"},
                {"value": 500, "color": "red"}
              ]
            }
          }
        }
      },
      {
        "id": 2,
        "title": "Database Connections",
        "type": "stat",
        "gridPos": {"x": 6, "y": 0, "w": 6, "h": 4},
        "targets": [
          {
            "expr": "pg_stat_database_numbackends{datname=\"battlescope_auth\"}",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "color": {"mode": "thresholds"},
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"value": null, "color": "green"},
                {"value": 10, "color": "yellow"},
                {"value": 20, "color": "red"}
              ]
            }
          }
        }
      },
      {
        "id": 3,
        "title": "Pod Status",
        "type": "stat",
        "gridPos": {"x": 12, "y": 0, "w": 6, "h": 4},
        "targets": [
          {
            "expr": "count(kube_pod_status_phase{namespace=\"battlescope\",pod=~\"authentication.*\",phase=\"Running\"})",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "color": {"mode": "thresholds"},
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"value": null, "color": "red"},
                {"value": 1, "color": "yellow"},
                {"value": 2, "color": "green"}
              ]
            }
          }
        }
      },
      {
        "id": 4,
        "title": "Memory Usage",
        "type": "stat",
        "gridPos": {"x": 18, "y": 0, "w": 6, "h": 4},
        "targets": [
          {
            "expr": "sum(container_memory_working_set_bytes{namespace=\"battlescope\",pod=~\"authentication.*\"})",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "bytes",
            "color": {"mode": "thresholds"}
          }
        }
      },
      {
        "id": 5,
        "title": "Recent Logs - Authentication",
        "type": "logs",
        "gridPos": {"x": 0, "y": 4, "w": 24, "h": 12},
        "datasource": {
          "type": "loki",
          "uid": "P8E80F9AEF21F6940"
        },
        "targets": [
          {
            "expr": "{app=\"authentication\"}",
            "refId": "A",
            "datasource": {
              "type": "loki",
              "uid": "P8E80F9AEF21F6940"
            }
          }
        ],
        "options": {
          "showTime": true,
          "wrapLogMessage": true,
          "sortOrder": "Descending"
        }
      },
      {
        "id": 6,
        "title": "Error Logs",
        "type": "logs",
        "gridPos": {"x": 0, "y": 16, "w": 24, "h": 8},
        "datasource": {
          "type": "loki",
          "uid": "P8E80F9AEF21F6940"
        },
        "targets": [
          {
            "expr": "{app=\"authentication\"} |~ \"(?i)(error|exception|fail|400|500)\"",
            "refId": "A",
            "datasource": {
              "type": "loki",
              "uid": "P8E80F9AEF21F6940"
            }
          }
        ],
        "options": {
          "showTime": true,
          "wrapLogMessage": true,
          "sortOrder": "Descending"
        }
      }
    ],
    "time": {"from": "now-1h", "to": "now"}
  },
  "overwrite": true
}
EOF

echo ""
echo "Authentication dashboard imported"

# Redis Dashboard
curl -X POST "${GRAFANA_URL}/api/dashboards/db" \
  -H "Content-Type: application/json" \
  -u "${GRAFANA_USER}:${GRAFANA_PASSWORD}" \
  -d @- <<'EOF'
{
  "dashboard": {
    "id": null,
    "uid": "redis-dashboard",
    "title": "BattleScope - Redis",
    "tags": ["battlescope", "redis"],
    "timezone": "browser",
    "schemaVersion": 16,
    "version": 0,
    "refresh": "5s",
    "panels": [
      {
        "id": 1,
        "title": "Connected Clients",
        "type": "stat",
        "gridPos": {"x": 0, "y": 0, "w": 6, "h": 4},
        "targets": [
          {
            "expr": "redis_connected_clients{namespace=\"battlescope\"}",
            "refId": "A"
          }
        ]
      },
      {
        "id": 2,
        "title": "Memory Used",
        "type": "stat",
        "gridPos": {"x": 6, "y": 0, "w": 6, "h": 4},
        "targets": [
          {
            "expr": "redis_memory_used_bytes{namespace=\"battlescope\"}",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {"unit": "bytes"}
        }
      },
      {
        "id": 3,
        "title": "Total Keys",
        "type": "stat",
        "gridPos": {"x": 12, "y": 0, "w": 6, "h": 4},
        "targets": [
          {
            "expr": "sum(redis_db_keys{namespace=\"battlescope\"})",
            "refId": "A"
          }
        ]
      },
      {
        "id": 4,
        "title": "Uptime",
        "type": "stat",
        "gridPos": {"x": 18, "y": 0, "w": 6, "h": 4},
        "targets": [
          {
            "expr": "redis_uptime_in_seconds{namespace=\"battlescope\"}",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {"unit": "s"}
        }
      },
      {
        "id": 5,
        "title": "Commands Per Second",
        "type": "graph",
        "gridPos": {"x": 0, "y": 4, "w": 12, "h": 8},
        "targets": [
          {
            "expr": "rate(redis_commands_total{namespace=\"battlescope\"}[1m])",
            "legendFormat": "{{cmd}}",
            "refId": "A"
          }
        ]
      },
      {
        "id": 6,
        "title": "Memory Usage",
        "type": "graph",
        "gridPos": {"x": 12, "y": 4, "w": 12, "h": 8},
        "targets": [
          {
            "expr": "redis_memory_used_bytes{namespace=\"battlescope\"}",
            "legendFormat": "Used",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {"unit": "bytes"}
        }
      }
    ],
    "time": {"from": "now-1h", "to": "now"}
  },
  "overwrite": true
}
EOF

echo "Redis dashboard imported"

# Redpanda Dashboard
curl -X POST "${GRAFANA_URL}/api/dashboards/db" \
  -H "Content-Type: application/json" \
  -u "${GRAFANA_USER}:${GRAFANA_PASSWORD}" \
  -d @- <<'EOF'
{
  "dashboard": {
    "id": null,
    "uid": "redpanda-dashboard",
    "title": "BattleScope - Redpanda",
    "tags": ["battlescope", "redpanda", "kafka"],
    "timezone": "browser",
    "schemaVersion": 16,
    "version": 0,
    "refresh": "5s",
    "panels": [
      {
        "id": 1,
        "title": "Brokers",
        "type": "stat",
        "gridPos": {"x": 0, "y": 0, "w": 6, "h": 4},
        "targets": [
          {
            "expr": "kafka_brokers{namespace=\"battlescope\"}",
            "refId": "A"
          }
        ]
      },
      {
        "id": 2,
        "title": "Topics",
        "type": "stat",
        "gridPos": {"x": 6, "y": 0, "w": 6, "h": 4},
        "targets": [
          {
            "expr": "count(kafka_topic_partitions{namespace=\"battlescope\"}) by (topic)",
            "refId": "A"
          }
        ]
      },
      {
        "id": 3,
        "title": "Consumer Groups",
        "type": "stat",
        "gridPos": {"x": 12, "y": 0, "w": 6, "h": 4},
        "targets": [
          {
            "expr": "count(kafka_consumergroup_members{namespace=\"battlescope\"})",
            "refId": "A"
          }
        ]
      },
      {
        "id": 4,
        "title": "Total Messages",
        "type": "stat",
        "gridPos": {"x": 18, "y": 0, "w": 6, "h": 4},
        "targets": [
          {
            "expr": "sum(kafka_topic_partition_current_offset{namespace=\"battlescope\"})",
            "refId": "A"
          }
        ]
      },
      {
        "id": 5,
        "title": "Messages In Per Second",
        "type": "graph",
        "gridPos": {"x": 0, "y": 4, "w": 12, "h": 8},
        "targets": [
          {
            "expr": "sum(rate(kafka_topic_partition_current_offset{namespace=\"battlescope\"}[1m])) by (topic)",
            "legendFormat": "{{topic}}",
            "refId": "A"
          }
        ]
      },
      {
        "id": 6,
        "title": "Consumer Lag",
        "type": "graph",
        "gridPos": {"x": 12, "y": 4, "w": 12, "h": 8},
        "targets": [
          {
            "expr": "kafka_consumergroup_lag{namespace=\"battlescope\"}",
            "legendFormat": "{{consumergroup}} - {{topic}}",
            "refId": "A"
          }
        ]
      }
    ],
    "time": {"from": "now-1h", "to": "now"}
  },
  "overwrite": true
}
EOF

echo "Redpanda dashboard imported"

# Loki Logs Dashboard
curl -X POST "${GRAFANA_URL}/api/dashboards/db" \
  -H "Content-Type: application/json" \
  -u "${GRAFANA_USER}:${GRAFANA_PASSWORD}" \
  -d @- <<'EOF'
{
  "dashboard": {
    "id": null,
    "uid": "loki-dashboard",
    "title": "BattleScope - System Logs",
    "tags": ["battlescope", "loki", "logs"],
    "timezone": "browser",
    "schemaVersion": 16,
    "version": 0,
    "refresh": "5s",
    "panels": [
      {
        "id": 1,
        "title": "All Services Logs",
        "type": "logs",
        "gridPos": {"x": 0, "y": 0, "w": 24, "h": 12},
        "targets": [
          {
            "expr": "{namespace=\"battlescope\"}",
            "refId": "A"
          }
        ],
        "options": {
          "showTime": true,
          "wrapLogMessage": true,
          "sortOrder": "Descending"
        }
      },
      {
        "id": 2,
        "title": "Error Logs",
        "type": "logs",
        "gridPos": {"x": 0, "y": 12, "w": 24, "h": 12},
        "targets": [
          {
            "expr": "{namespace=\"battlescope\"} |~ \"(?i)(error|exception|fail)\"",
            "refId": "A"
          }
        ],
        "options": {
          "showTime": true,
          "wrapLogMessage": true,
          "sortOrder": "Descending"
        }
      }
    ],
    "time": {"from": "now-1h", "to": "now"}
  },
  "overwrite": true
}
EOF

echo "Loki dashboard imported"
echo ""
echo "All dashboards imported successfully!"
