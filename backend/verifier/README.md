# Character Verifier Service

Background job that periodically verifies character corporation and alliance memberships to ensure users maintain access only while their characters remain in approved organizations.

## Overview

This service runs as a Kubernetes CronJob every hour to:
1. Check all active characters for corporation/alliance changes
2. Verify new organizations are still approved
3. Invalidate sessions for characters that moved to unapproved organizations
4. Update character records in the database

## Architecture

- **Trigger**: Kubernetes CronJob (hourly: `0 * * * *`)
- **Language**: TypeScript/Node.js
- **Dependencies**: PostgreSQL, Redis, ESI API
- **Observability**: Prometheus metrics, structured logging

## Configuration

Environment variables:

```bash
# Required
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
ENCRYPTION_KEY=<64-char-hex-string>

# Optional (with defaults)
BATCH_SIZE=50                         # Characters to process per batch
DELAY_BETWEEN_BATCHES=1000            # Milliseconds between batches
MAX_CHARACTERS_PER_RUN=1000           # Max characters to check per run
VERIFICATION_THRESHOLD_MINUTES=55     # How old last_verified_at must be
```

## Security Model

**Two-Layer Defense**:
1. **Login-time verification**: Corp/alliance checked during OAuth callback
2. **Hourly background verification**: Catches changes during active sessions

**Maximum Exposure Window**: 1 hour (trade-off between security and performance)

## Verification Logic

For each character:

1. **Fetch ESI Data**: Get current corp/alliance from EVE SSI
2. **Handle Token Issues**:
   - If token revoked → Use last known corp/alliance
   - If ESI error → Skip and retry next hour
3. **Detect Changes**: Compare current vs stored corp/alliance
4. **Update Database**: Save new org info and timestamp
5. **Check Approval**: Verify against auth_config allow/deny lists
6. **Invalidate Sessions**: If org no longer approved, delete Redis session

## Error Handling

- **Token Revoked**: Use last known values, still check approval
- **ESI Rate Limited**: Exponential backoff, error budget tracking
- **Transient Errors**: Fail open (don't invalidate sessions)
- **ESI Down**: Skip verification, retry next hour

## Observability

### Metrics (Prometheus)

- `battlescope_character_verification_duration_seconds` - Job duration
- `battlescope_characters_verified_total{status}` - Characters processed (success/failed/skipped)
- `battlescope_character_org_changes_total{type}` - Org changes detected (corp/alliance/both)
- `battlescope_sessions_invalidated_total{reason}` - Sessions invalidated
- `battlescope_character_verification_esi_errors_total{error_code}` - ESI errors
- `battlescope_character_verification_last_run_timestamp` - Last run timestamp

### Logs

Structured JSON logs (Pino):
- Job start/completion
- Batch progress
- Org changes detected
- Session invalidations
- ESI errors

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm --filter @battlescope/verifier build

# Type check
pnpm --filter @battlescope/verifier typecheck

# Run tests
pnpm --filter @battlescope/verifier test

# Run locally (requires env vars)
pnpm --filter @battlescope/verifier start
```

## Deployment

### Build Docker Image

```bash
docker build \
  --build-arg SERVICE_SCOPE=@battlescope/verifier \
  --build-arg BUILD_TARGET=backend/verifier \
  -t battlescope-verifier:latest \
  .
```

### Deploy to Kubernetes

```bash
# Apply manifests
kubectl apply -f infra/k8s/verifier/configmap.yaml
kubectl apply -f infra/k8s/verifier/cronjob.yaml

# Check status
kubectl get cronjobs -n battlescope
kubectl get jobs -n battlescope -l app=character-verifier

# View logs
kubectl logs -n battlescope -l app=character-verifier --tail=100

# Manually trigger job
kubectl create job --from=cronjob/character-verifier manual-verify-$(date +%s) -n battlescope
```

## Monitoring

### Alerts

- **Job Stale**: Last run > 90 minutes ago
- **High ESI Errors**: Error rate > 10% over 5 minutes
- **Mass Invalidations**: > 10 sessions invalidated in 1 hour

### Dashboards

- Active characters
- Verification success rate
- Org changes over time
- ESI error trends
- Session invalidations

## Operational Runbooks

### Job Hasn't Run

```bash
# Check CronJob status
kubectl get cronjob character-verifier -n battlescope

# Check recent jobs
kubectl get jobs -n battlescope -l app=character-verifier

# Check pod logs
kubectl logs -n battlescope -l app=character-verifier --tail=200

# Resume if suspended
kubectl patch cronjob character-verifier -n battlescope -p '{"spec":{"suspend":false}}'
```

### High ESI Error Rate

```bash
# Check ESI status
curl https://esi.evetech.net/ping

# Check error distribution
kubectl logs -n battlescope -l app=character-verifier | grep "ESI error"

# Reduce batch size if rate limited
kubectl edit configmap character-verifier-config -n battlescope
# Set BATCH_SIZE=25
```

### Many Sessions Invalidated

```bash
# Check audit logs
# Query audit_logs table for action='session.invalidated'

# Verify auth_config hasn't changed unexpectedly
# Query auth_config table

# Check for mass org changes (war, merger, etc.)
```

## See Also

- [Background Verification Spec](../../docs/authenication-authorization-spec/background-verification-spec.md)
- [Authentication & Authorization Spec](../../docs/authenication-authorization-spec/README.md)
- [Session Management Spec](../../docs/authenication-authorization-spec/session-management-spec.md)
