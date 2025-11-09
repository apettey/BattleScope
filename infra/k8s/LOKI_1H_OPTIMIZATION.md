# Loki 1-Hour Retention Configuration

## Configuration Summary

This Loki setup is optimized for **maximum log capture with minimal storage costs** using an aggressive 1-hour retention policy.

## Key Optimizations

### 1. Retention Settings (1 Hour)

```yaml
retention_period: 1h
max_query_lookback: 1h
reject_old_samples_max_age: 1h
```

- Logs older than 1 hour are automatically deleted
- Queries limited to 1-hour window
- Samples older than 1 hour are rejected

### 2. Maximum Ingestion (No Rate Limiting)

```yaml
ingestion_rate_mb: 100 # 100MB/s per tenant
ingestion_burst_size_mb: 200 # 200MB burst
per_stream_rate_limit: 100MB # No practical limit
per_stream_rate_limit_burst: 200MB
max_streams_per_user: 0 # Unlimited streams
max_global_streams_per_user: 0 # Unlimited
```

- Captures everything your applications log
- No sampling or dropping of logs
- Handles burst traffic

### 3. Fast Compaction & Cleanup

```yaml
compaction_interval: 5m # Run every 5 minutes
retention_delete_delay: 5m # Delete within 5 minutes after expiry
```

- Old logs are cleaned up quickly
- Minimal storage usage
- Compaction runs frequently

### 4. Quick Flush to Storage

```yaml
chunk_idle_period: 5m # Flush idle chunks after 5 minutes
max_chunk_age: 10m # Force flush after 10 minutes
flush_check_period: 30s # Check for flushes every 30 seconds
```

- Logs are written to disk quickly
- Reduces memory pressure
- Better for 1-hour retention window

### 5. Promtail - Maximum Capture

```yaml
readline_rate_enabled: false # No rate limiting on reads
batchwait: 1s # Small wait for batching
batchsize: 1048576 # 1MB batches
max_retries: 10 # Aggressive retries
```

- No rate limiting on log collection
- Fast delivery to Loki
- Retries to prevent log loss

### 6. Minimal Storage

```yaml
storage: 2Gi # Only 2Gi needed for 1 hour
```

- 1 hour of logs typically uses < 1Gi
- 2Gi provides headroom for bursts
- Much cheaper than 10Gi+ for long retention

## Trade-offs

### ✅ Advantages

- **Zero sampling** - Capture ALL logs
- **Real-time debugging** - Full logs for last hour
- **Low storage costs** - Only 2Gi storage
- **Fast cleanup** - Old logs deleted within minutes
- **High throughput** - Can handle 100MB/s ingestion

### ⚠️ Limitations

- **No historical analysis** - Can't query logs > 1 hour old
- **Must debug in real-time** - Log and review within the hour
- **Higher CPU usage** - More frequent compaction
- **Memory spikes possible** - During high log volume

## Use Cases

### ✅ Perfect For:

- Development and testing
- Real-time debugging sessions
- Reproducing bugs immediately
- Load testing with full logging
- Cost-sensitive deployments
- Short-lived test environments

### ❌ Not Suitable For:

- Production systems requiring audit trails
- Compliance/regulatory requirements
- Long-term trend analysis
- Incident investigation after the fact
- Systems needing > 1 hour of history

## Monitoring Loki Health

### Check if logs are being ingested

```bash
# Check Loki metrics
curl http://localhost:30100/metrics | grep loki_ingester_streams

# Check current storage usage
kubectl exec -n battlescope loki-0 -- du -sh /loki/chunks
```

### Watch for dropped logs

```bash
# Check Loki logs for errors
kubectl logs -n battlescope -l app=loki --tail=100 | grep -i error

# Check Promtail for dropped logs
kubectl logs -n battlescope -l app=promtail --tail=100 | grep -i "drop\|fail"
```

### Verify retention is working

```bash
# Query Loki for oldest log timestamp
# Should never be older than 1 hour
```

## Scaling for Higher Volume

If you're hitting ingestion limits:

### 1. Increase Ingestion Limits

```yaml
ingestion_rate_mb: 200 # 200MB/s
ingestion_burst_size_mb: 400 # 400MB burst
```

### 2. Add More Memory

```yaml
resources:
  limits:
    memory: 1Gi # Up from 512Mi
```

### 3. Increase Storage

```yaml
storage: 5Gi # If logs are large
```

### 4. Faster Compaction

```yaml
compaction_interval: 2m # More aggressive cleanup
retention_delete_delay: 2m
```

## Cost Analysis

### Storage Costs (Example with AWS EBS)

- **2Gi gp3 volume**: ~$0.16/month
- **10Gi gp3 volume**: ~$0.80/month
- **100Gi gp3 volume**: ~$8.00/month

With 1-hour retention and 2Gi:

- **Monthly cost**: ~$0.16 vs $8+ for long-term storage
- **Savings**: ~98% reduction in storage costs

### Total Logging Stack Cost (Rough Estimate)

- Loki (2Gi storage): $0.16/month
- Compute (assume small nodes): Negligible overhead
- **Total**: < $1/month for complete logging

Compare to managed solutions:

- CloudWatch Logs: $0.50/GB ingested + $0.03/GB storage
- Datadog: $1.70/GB ingested
- Elastic Cloud: $95+/month

## Migration Path

If you later need longer retention:

### Quick (Dev → Prod transition)

1. Edit retention periods in config
2. Increase storage size
3. Restart Loki
4. Existing logs remain until new retention kicks in

### Example: 1h → 24h

```yaml
retention_period: 24h
max_query_lookback: 24h
storage: 10Gi
```

### Example: 1h → 7d (Production)

```yaml
retention_period: 168h
max_query_lookback: 168h
storage: 50Gi
compaction_interval: 10m # Less aggressive
retention_delete_delay: 2h
```

## Conclusion

This 1-hour configuration provides:

- ✅ **Full log capture** without sampling
- ✅ **Real-time debugging** capabilities
- ✅ **Minimal costs** for development/testing
- ✅ **Easy migration** to longer retention when needed

Perfect for your use case of real-time testing without the expense of long-term log storage!
