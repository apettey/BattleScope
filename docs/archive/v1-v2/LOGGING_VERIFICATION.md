# Logging Verification Guide

## Overview

This guide helps you verify that the enhanced logging (with file/package/caller context) is working correctly in your deployed environment.

## What Should Be in Every Log

According to `docs/technical_specs.md` section 8.1, every log entry MUST include:

```json
{
  "level": 30,
  "time": 1762707623232,
  "pid": 66800,
  "hostname": "api-6867c7fd4-8689s",
  "file": "backend/api/src/routes/auth.ts", // ✅ REQUIRED
  "package": "api", // ✅ REQUIRED
  "caller": "exchangeCodeForToken", // ✅ REQUIRED (when available)
  "msg": "Token exchange successful"
}
```

## Verification Steps

### Step 1: Check Local Build

First, verify the logger is configured correctly in your local build:

```bash
# Build the shared package with logger
pnpm --filter @battlescope/shared run build

# Run the logger integration test
pnpm --filter @battlescope/api test logger-integration.test.ts

# You should see output like:
# Mixin result: {
#   file: 'backend/api/test/logger-integration.test.ts',
#   package: 'api',
#   caller: undefined
# }
```

✅ **Expected**: Test passes and shows `file`, `package`, and `caller` fields

### Step 2: Check Docker Build

Verify the logger works in the Docker container environment:

```bash
# Build and run the API container locally
docker build -t battlescope-api-test \
  --build-arg SERVICE_SCOPE=@battlescope/api \
  --build-arg BUILD_TARGET=backend/api \
  -f Dockerfile .

# Run it (replace with your actual DB URL)
docker run --rm \
  -e DATABASE_URL="postgresql://..." \
  -e PORT=3000 \
  battlescope-api-test

# Watch the logs - they should show:
# {"level":30,"file":"backend/api/src/index.ts","package":"api","caller":"...","msg":"Server starting"}
```

✅ **Expected**: Logs contain `file`, `package`, and `caller` fields

### Step 3: Check Kubernetes Pod Logs

After deploying to k8s, check the raw pod logs:

```bash
# Get logs from an API pod
kubectl logs -n battlescope -l app=api --tail=50

# Or from a specific pod
kubectl logs -n battlescope api-6867c7fd4-8689s --tail=50
```

**Look for:**

```json
{
  "level": 30,
  "time": 1762707623232,
  "file": "backend/api/src/routes/auth.ts",
  "package": "api",
  "caller": "...",
  "msg": "..."
}
```

✅ **Expected**: Every log entry has `file`, `package` fields

❌ **If missing**: The logger config is not being applied. Check:

- Is `@battlescope/shared` built? Run: `pnpm --filter @battlescope/shared run build`
- Is the API using `createLoggerConfig()`? Check `backend/api/src/server.ts`

### Step 4: Check Promtail is Collecting Logs

Verify Promtail is scraping and forwarding logs:

```bash
# Check Promtail is running
kubectl get pods -n battlescope -l app=promtail

# Check Promtail logs
kubectl logs -n battlescope -l app=promtail --tail=100

# Look for:
# - "server starting" message
# - No errors about connecting to Loki
# - Lines indicating log scraping (e.g., "added target")
```

✅ **Expected**: Promtail is running and forwarding logs

❌ **If not working**:

```bash
# Check Promtail can reach Loki
kubectl exec -n battlescope -l app=promtail -- wget -O- http://loki:3100/ready

# Should return: {"ready": true}
```

### Step 5: Check Loki is Receiving Logs

Verify logs are reaching Loki:

```bash
# Port-forward to Loki
kubectl port-forward -n battlescope svc/loki 3100:3100

# Query Loki API
curl -G -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query={app="api"}' | jq

# Check label values
curl -s "http://localhost:3100/loki/api/v1/labels" | jq
```

✅ **Expected**: You should see labels including `file`, `package`, `app`

❌ **If missing**:

- Check OTEL collector logs: `kubectl logs -n battlescope -l app=otel-collector`
- Verify Loki is running: `kubectl get pods -n battlescope -l app=loki`

### Step 6: Check Grafana

Finally, verify you can query logs in Grafana:

```bash
# Port-forward to Grafana
kubectl port-forward -n battlescope svc/grafana 3001:3000
```

1. Open http://localhost:3001
2. Go to **Explore**
3. Select **Loki** datasource
4. Try these queries:

```logql
# All API logs
{app="api"}

# Logs from specific file
{file="backend/api/src/routes/auth.ts"}

# Logs from auth package
{package="auth"}

# Show file and package labels
{app="api"} | json | line_format "{{.file}} [{{.package}}] {{.msg}}"
```

✅ **Expected**: Queries return logs with proper labels and JSON parsing works

❌ **If not working**:

- Check Grafana can reach Loki: Configuration → Data Sources → Loki → Test
- Verify datasource URL is `http://loki:3100`

## Common Issues

### Issue: Logs don't have `file` or `package` fields

**Cause**: Logger config not applied

**Solution**:

```bash
# 1. Rebuild shared package
pnpm --filter @battlescope/shared run build

# 2. Rebuild API (or whichever service)
pnpm --filter @battlescope/api run build

# 3. Rebuild Docker images
make k8s-build-push

# 4. Redeploy
make k8s-redeploy
```

### Issue: `file` shows as "unknown"

**Cause**: File path doesn't match detection patterns

**Solution**: Add the path pattern to `packages/shared/src/logger.ts` in `getCallerInfo()`:

```typescript
else if (file.startsWith('backend/my-new-service/')) {
  pkg = 'my-new-service';
}
```

### Issue: `caller` is always undefined

**Cause**: Anonymous functions or arrow functions

**Solution**: Use named functions:

```typescript
// ❌ Bad
app.get('/route', async (req, reply) => { ... });

// ✅ Good
app.get('/route', async function handleRoute(req, reply) { ... });

// ✅ Also good
const handleRoute = async (req, reply) => { ... };
app.get('/route', handleRoute);
```

### Issue: Promtail labels don't include `file` or `package`

**Cause**: Promtail config not updated

**Solution**:

```bash
# 1. Apply updated Promtail config
kubectl apply -f infra/k8s/promtail-daemonset.yaml

# 2. Restart Promtail
kubectl rollout restart daemonset/promtail -n battlescope

# 3. Check it's running
kubectl get pods -n battlescope -l app=promtail
```

### Issue: OTEL Collector not forwarding logs

**Cause**: OTEL config not updated

**Solution**:

```bash
# 1. Apply updated OTEL config
kubectl apply -f infra/k8s/otel-collector-config.yaml

# 2. Restart OTEL
kubectl rollout restart deployment/otel-collector -n battlescope

# 3. Check logs
kubectl logs -n battlescope -l app=otel-collector --tail=50
```

## Testing the Full Pipeline

Create a test log and trace it through the entire pipeline:

```bash
# 1. Generate a log entry
kubectl exec -n battlescope deployment/api -- \
  node -e "import('./dist/backend/api/src/index.js').then(() => console.log('Test'))"

# 2. Check it appears in pod logs
kubectl logs -n battlescope -l app=api --tail=10 | grep -i test

# 3. Wait 10-30 seconds for collection

# 4. Query in Loki
curl -G -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query={app="api"} |= "Test"' | jq

# 5. Check in Grafana
# Query: {app="api"} |= "Test"
```

## Success Criteria

✅ Your logging is working correctly when:

1. **Pod logs** show `file`, `package`, `caller` in JSON
2. **Promtail** is running and forwarding without errors
3. **Loki API** returns logs with proper labels
4. **Grafana queries** work with label filters:
   - `{file="..."}`
   - `{package="..."}`
   - `{app="..."}`
5. **JSON parsing** works in LogQL: `| json | level >= 50`

## Next Steps

Once logging is verified:

1. **Create Dashboards**: Build Grafana dashboards for common log patterns
2. **Set Up Alerts**: Configure Loki alerting rules for errors
3. **Add More Services**: Apply `createLoggerConfig()` to other services
4. **Document Patterns**: Document common log queries for your team

## Support

If logging still isn't working after following this guide:

1. Share the output of:

   ```bash
   kubectl logs -n battlescope -l app=api --tail=20
   kubectl logs -n battlescope -l app=promtail --tail=50
   kubectl logs -n battlescope -l app=loki --tail=50
   ```

2. Share a sample log entry that's missing fields

3. Check the implementation tests pass:
   ```bash
   pnpm --filter @battlescope/api test logger-integration.test.ts
   ```
