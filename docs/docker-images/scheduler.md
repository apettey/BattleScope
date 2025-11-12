# BattleScope Scheduler Service Docker Image

**Image Name**: `petdog/battlescope-scheduler:latest`

**Source**: `Dockerfile` with build args `SERVICE_SCOPE=@battlescope/scheduler` and `BUILD_TARGET=backend/scheduler`

## Purpose

Kubernetes CronJob that triggers periodic maintenance tasks such as clustering runs, cache cleanup, statistics refresh, and database maintenance.

## Features

- Trigger clustering service at regular intervals
- Perform database maintenance (VACUUM, ANALYZE)
- Clear stale cache entries
- Generate periodic statistics
- Execute data retention policies
- Health monitoring and alerting

## Configuration

### Environment Variables

#### Core Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `LOG_LEVEL` | Logging level (trace, debug, info, warn, error) | `info` | No |

#### Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |

#### Observability Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `http://otel-collector:4318` | No |
| `OTEL_SERVICE_NAME` | Service name for telemetry | `battlescope-scheduler` | No |

## Scheduled Jobs

### Default Schedule

Runs every 5 minutes: `*/5 * * * *`

### Job Tasks

1. **Database Statistics Refresh**
   - Runs `ANALYZE` on key tables
   - Updates query planner statistics
   - Frequency: Every run

2. **Cache Cleanup** (Future)
   - Clear expired cache entries
   - Remove stale sessions
   - Frequency: Hourly

3. **Data Retention** (Future)
   - Archive old battles
   - Prune old killmails
   - Frequency: Daily

4. **Health Checks** (Future)
   - Verify service availability
   - Check queue depths
   - Alert on anomalies

## Example Usage

### Kubernetes CronJob

See `infra/k8s/scheduler-cronjob.yaml` for the complete manifest.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: scheduler
  namespace: battlescope
spec:
  schedule: "*/5 * * * *"  # Every 5 minutes
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  concurrencyPolicy: Forbid  # Don't run if previous job still running
  startingDeadlineSeconds: 60
  jobTemplate:
    spec:
      template:
        metadata:
          labels:
            app: scheduler
        spec:
          restartPolicy: OnFailure
          containers:
            - name: scheduler
              image: petdog/battlescope-scheduler:latest
              env:
                - name: LOG_LEVEL
                  value: "info"
              envFrom:
                - secretRef:
                    name: battlescope-secrets
                - configMapRef:
                    name: battlescope-config
              resources:
                requests:
                  cpu: 50m
                  memory: 64Mi
                limits:
                  cpu: 200m
                  memory: 256Mi
```

### Docker (Standalone)

```bash
# Run once
docker run --rm \
  -e DATABASE_URL=postgres://user:pass@postgres:5432/battlescope \
  petdog/battlescope-scheduler:latest

# Run with cron (Linux/macOS)
echo "*/5 * * * * docker run --rm -e DATABASE_URL=postgres://user:pass@postgres:5432/battlescope petdog/battlescope-scheduler:latest" | crontab -
```

### Docker Compose (Not Recommended)

Scheduler is designed to run as a Kubernetes CronJob. For Docker Compose, use a cron container or external cron daemon.

## Resource Requirements

### Recommended

- **CPU**: 50m request, 200m limit
- **Memory**: 64Mi request, 256Mi limit

### Minimum

- **CPU**: 25m
- **Memory**: 32Mi

## Execution Time

Typical execution time: 5-30 seconds depending on database size and tasks.

## Concurrency Policy

**IMPORTANT**: Set Kubernetes `concurrencyPolicy: Forbid` to prevent overlapping executions.

## Dependencies

### Required Services

- **PostgreSQL 15+**: Perform maintenance tasks

### Optional Services

- **OpenTelemetry Collector**: For metrics and tracing

## Build Information

### Build Command

```bash
docker build \
  --build-arg SERVICE_SCOPE=@battlescope/scheduler \
  --build-arg BUILD_TARGET=backend/scheduler \
  -t petdog/battlescope-scheduler:latest \
  -f Dockerfile \
  .
```

## Metrics

The scheduler service exposes the following metrics:

- `scheduler_runs_total` - Total scheduler runs
- `scheduler_duration_seconds` - Scheduler run duration
- `scheduler_tasks_completed` - Tasks completed per run
- `scheduler_errors_total` - Scheduler errors

## Troubleshooting

### Jobs Not Running

1. Check CronJob status: `kubectl get cronjobs -n battlescope`
2. Check job history: `kubectl get jobs -n battlescope`
3. Verify schedule syntax is correct
4. Check for suspended CronJob: `kubectl describe cronjob scheduler -n battlescope`

### Jobs Failing

1. Check job logs: `kubectl logs -n battlescope -l app=scheduler`
2. Verify database connectivity
3. Check resource limits (may be OOM killed)
4. Verify environment variables are set

### Long Execution Times

1. Check database performance
2. Reduce frequency of runs (increase schedule interval)
3. Optimize maintenance queries
4. Increase CPU/memory limits

## Schedule Tuning

### High Activity Environments

```yaml
schedule: "*/2 * * * *"  # Every 2 minutes
```

### Low Activity Environments

```yaml
schedule: "*/15 * * * *"  # Every 15 minutes
```

### Production (Recommended)

```yaml
schedule: "*/5 * * * *"  # Every 5 minutes
```

## Security Considerations

- Read/write access to database required
- Use Kubernetes ServiceAccount with minimal permissions
- No external network access required
- Consider audit logging for maintenance operations

## Best Practices

- Set `concurrencyPolicy: Forbid` to prevent overlap
- Monitor job success/failure rates
- Set reasonable resource limits
- Keep execution time under 60 seconds
- Use `successfulJobsHistoryLimit` to prevent clutter
- Alert on job failures

## Future Enhancements

Planned features for the scheduler service:

- [ ] Configurable task list
- [ ] Data archival to cold storage
- [ ] Automated backup triggers
- [ ] Statistics recalculation
- [ ] Index maintenance and rebuilding
- [ ] Alerting integration (PagerDuty, Opsgenie)

## Version Information

- **Node.js**: 20 LTS
- **TypeScript**: 5.4.5

## Additional Resources

- [Scheduler Service Source Code](../../backend/scheduler)
- [Architecture Documentation](../architecture.md)
- [Kubernetes CronJob Documentation](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)
