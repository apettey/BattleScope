# BattleScope Verifier Service Docker Image

**Image Name**: `petdog/battlescope-verifier:latest`

**Source**: `Dockerfile` with build args `SERVICE_SCOPE=@battlescope/verifier` and `BUILD_TARGET=backend/verifier`

## Purpose

Validates data integrity and detects anomalies in the database. Runs periodic checks to ensure data quality and consistency.

## Features

- Verify killmail data completeness
- Detect orphaned records
- Validate battle clustering accuracy
- Check for duplicate records
- Monitor data quality metrics
- Generate validation reports

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

## Validation Checks

### 1. Orphaned Killmails

Checks for killmails not assigned to any battle (after clustering should have processed them).

```sql
SELECT COUNT(*) FROM battle_killmails
WHERE battle_id IS NULL
  AND enriched_at IS NOT NULL
  AND enriched_at < NOW() - INTERVAL '2 hours';
```

### 2. Missing Participants

Checks for battles without any participants.

```sql
SELECT b.id FROM battles b
LEFT JOIN battle_participants bp ON b.id = bp.battle_id
WHERE bp.id IS NULL;
```

### 3. Invalid Timestamps

Checks for records with future timestamps or NULL timestamps.

```sql
SELECT COUNT(*) FROM killmails
WHERE occurred_at > NOW() OR occurred_at IS NULL;
```

### 4. Duplicate Killmails

Checks for duplicate killmail IDs in the database.

```sql
SELECT killmail_id, COUNT(*)
FROM killmails
GROUP BY killmail_id
HAVING COUNT(*) > 1;
```

### 5. Missing Entity Names

Checks for entities without resolved names (should be resolved via ESI).

```sql
SELECT COUNT(*) FROM battle_participants
WHERE character_name IS NULL
  OR corporation_name IS NULL;
```

## Example Usage

### Docker Run (One-time Check)

```bash
docker run --rm \
  -e DATABASE_URL=postgres://user:pass@postgres:5432/battlescope \
  petdog/battlescope-verifier:latest
```

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: verifier
  namespace: battlescope
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM UTC
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        metadata:
          labels:
            app: verifier
        spec:
          restartPolicy: OnFailure
          containers:
            - name: verifier
              image: petdog/battlescope-verifier:latest
              envFrom:
                - secretRef:
                    name: battlescope-secrets
              resources:
                requests:
                  cpu: 50m
                  memory: 128Mi
                limits:
                  cpu: 200m
                  memory: 512Mi
```

### Docker Compose

```yaml
services:
  verifier:
    image: petdog/battlescope-verifier:latest
    environment:
      DATABASE_URL: postgres://battlescope:password@postgres:5432/battlescope
      LOG_LEVEL: info
    depends_on:
      - postgres
    command: ["node", "dist/backend/verifier/src/index.js"]
```

## Resource Requirements

### Recommended

- **CPU**: 50m request, 200m limit
- **Memory**: 128Mi request, 512Mi limit

### Minimum

- **CPU**: 25m
- **Memory**: 64Mi

## Execution Time

Typical execution time: 1-5 minutes depending on database size.

## Dependencies

### Required Services

- **PostgreSQL 15+**: Read data for validation

## Build Information

### Build Command

```bash
docker build \
  --build-arg SERVICE_SCOPE=@battlescope/verifier \
  --build-arg BUILD_TARGET=backend/verifier \
  -t petdog/battlescope-verifier:latest \
  -f Dockerfile \
  .
```

## Output

The verifier service logs validation results:

```json
{
  "level": "info",
  "msg": "Data validation complete",
  "orphaned_killmails": 15,
  "missing_participants": 0,
  "invalid_timestamps": 2,
  "duplicate_killmails": 0,
  "missing_entity_names": 43,
  "status": "warning"
}
```

**Status Levels**:
- `ok` - All checks passed
- `warning` - Minor issues detected (should be investigated)
- `error` - Critical issues detected (requires immediate action)

## Alerting

Integrate with monitoring systems to alert on validation failures:

```yaml
# Prometheus AlertManager rule example
- alert: DataIntegrityIssues
  expr: battlescope_verifier_errors > 0
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "BattleScope data integrity issues detected"
    description: "Verifier found {{ $value }} data integrity issues"
```

## Troubleshooting

### High Orphaned Killmail Count

1. Check if clusterer service is running
2. Verify clustering parameters are reasonable
3. Check for clustering errors in logs

### Missing Participants

1. Check enrichment service is working
2. Verify database foreign key constraints
3. Review battle creation logic

### Duplicate Killmails

1. Check ingest service for race conditions
2. Review database unique constraints
3. Run manual cleanup if needed

## Best Practices

- Run daily as Kubernetes CronJob
- Alert on validation failures
- Review validation reports regularly
- Use for monitoring data quality trends
- Integrate with observability stack

## Future Enhancements

Planned features:

- [ ] Automatic remediation for common issues
- [ ] Historical trend analysis
- [ ] Detailed validation reports (exported to file)
- [ ] Integration with alerting systems
- [ ] Custom validation rule configuration
- [ ] Database consistency checks
- [ ] Performance metrics validation

## Version Information

- **Node.js**: 20 LTS
- **TypeScript**: 5.4.5

## Additional Resources

- [Verifier Service Source Code](../../backend/verifier)
- [Architecture Documentation](../architecture.md)
