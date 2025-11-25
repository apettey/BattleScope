# Ingestion Service Specification

**Domain**: Raw killmail acquisition
**Version**: 1.0 (with Historical Ingestion)
**Date**: 2025-11-25

---

## Overview

The Ingestion Service is responsible for acquiring killmail data from zKillboard through two channels:
1. **Real-time ingestion** via RedisQ (streaming)
2. **Historical ingestion** via History API (batch backfill)

Both channels apply the same ruleset filters and publish to the same Kafka topic, ensuring consistent downstream processing.

---

## Responsibilities

### Core Responsibilities

✅ **Real-Time Ingestion**:
- Poll zKillboard RedisQ endpoint every 5 seconds
- Apply ruleset filters (min pilots, tracked alliances/corps, systems)
- Store accepted killmail events
- Publish `killmail.ingested` events to Kafka

✅ **Historical Ingestion**:
- Fetch killmail IDs from zKillboard History API for specified date ranges
- Apply same ruleset filters as real-time
- Process killmails in batches by date
- Track job progress and handle failures
- Publish `killmail.ingested` events to Kafka (same format as real-time)

✅ **Data Retention & Cleanup**:
- Maintain 60-month (5-year) rolling window of data
- Automatically delete killmails older than 60 months (daily at 02:00 UTC)
- Publish retention events to notify downstream services
- Track deletion metrics and audit trail

✅ **Daily Verification & Gap Detection**:
- Verify yesterday's killmails are complete (daily at 03:00 UTC)
- Compare local database with zKillboard History API
- Re-queue missing killmails automatically
- Notify Battle Service to re-cluster affected dates
- Detect and fill gaps on service startup

✅ **Ruleset Management**:
- CRUD operations for ingestion rulesets
- Filter configuration (min pilots, alliances, corps, systems, security types)
- Ruleset versioning and history

✅ **Health & Monitoring**:
- Track ingestion statistics (accepted, rejected, rate)
- Monitor API health (RedisQ, History API)
- Expose health check endpoints
- Track retention and verification metrics

### NOT Responsible For

❌ Enriching killmails with full payload (Enrichment domain)
❌ Clustering killmails into battles (Battle domain)
❌ Searching or indexing killmails (Search domain)
❌ User notifications (Notification domain)

---

## Database Schema

### Database: `ingestion_db` (PostgreSQL)

#### Table: `killmail_events`

Stores all ingested killmails (both real-time and historical).

```sql
CREATE TABLE killmail_events (
  killmail_id BIGINT PRIMARY KEY,
  killmail_time TIMESTAMPTZ NOT NULL,
  system_id BIGINT NOT NULL,
  victim_alliance_id BIGINT,
  attacker_alliance_ids BIGINT[] NOT NULL DEFAULT '{}',
  zkb_hash TEXT NOT NULL,
  zkb_url TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'redisq', -- 'redisq', 'historical', 'daily_verification'
  historical_job_id UUID REFERENCES historical_ingestion_jobs(id),
  ruleset_id UUID REFERENCES rulesets(id),
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Retention tracking
  deleted_at TIMESTAMPTZ,
  deletion_reason TEXT -- 'retention_policy', 'manual_deletion'
);

CREATE INDEX idx_killmail_events_time ON killmail_events(killmail_time DESC);
CREATE INDEX idx_killmail_events_system ON killmail_events(system_id);
CREATE INDEX idx_killmail_events_source ON killmail_events(source);
CREATE INDEX idx_killmail_events_historical_job ON killmail_events(historical_job_id);
CREATE INDEX idx_killmail_events_ingested_at ON killmail_events(ingested_at DESC);
CREATE INDEX idx_killmail_events_deleted_at ON killmail_events(deleted_at) WHERE deleted_at IS NOT NULL;
```

#### Table: `rulesets`

Filtering configuration for ingestion.

```sql
CREATE TABLE rulesets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  min_pilots INT DEFAULT 2,
  tracked_alliance_ids BIGINT[],
  tracked_corp_ids BIGINT[],
  tracked_system_ids BIGINT[],
  security_types TEXT[], -- ['high', 'low', 'null', 'wormhole', 'pochven']
  ignore_unlisted BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

CREATE INDEX idx_rulesets_active ON rulesets(is_active);
```

#### Table: `historical_ingestion_jobs`

Tracks historical backfill jobs.

```sql
CREATE TABLE historical_ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed', 'cancelled'
  ruleset_id UUID REFERENCES rulesets(id),
  priority TEXT NOT NULL DEFAULT 'normal', -- 'low', 'normal', 'high'

  -- Progress tracking
  total_dates INT NOT NULL,
  processed_dates INT DEFAULT 0,
  total_killmails BIGINT DEFAULT 0,
  processed_killmails BIGINT DEFAULT 0,
  accepted_killmails BIGINT DEFAULT 0,
  rejected_killmails BIGINT DEFAULT 0,

  -- Timestamps
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Error handling
  error_message TEXT,
  retry_count INT DEFAULT 0,
  last_processed_date DATE,

  CONSTRAINT valid_date_range CHECK (start_date <= end_date)
);

CREATE INDEX idx_historical_jobs_status ON historical_ingestion_jobs(status);
CREATE INDEX idx_historical_jobs_dates ON historical_ingestion_jobs(start_date, end_date);
CREATE INDEX idx_historical_jobs_created_at ON historical_ingestion_jobs(created_at DESC);
```

#### Table: `ingestion_status`

Real-time ingestion health tracking.

```sql
CREATE TABLE ingestion_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_poll_at TIMESTAMPTZ,
  last_successful_poll_at TIMESTAMPTZ,
  last_killmail_id BIGINT,
  consecutive_failures INT DEFAULT 0,
  is_healthy BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Table: `data_retention_jobs`

Tracks data retention cleanup and verification jobs.

```sql
CREATE TABLE data_retention_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL, -- 'retention_cleanup', 'daily_verification'
  cutoff_date DATE NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'

  -- Metrics
  killmails_deleted BIGINT DEFAULT 0,
  battles_deleted BIGINT DEFAULT 0,
  killmails_missing BIGINT DEFAULT 0,
  killmails_requeued BIGINT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Error handling
  error_message TEXT
);

CREATE INDEX idx_retention_jobs_created_at ON data_retention_jobs(created_at DESC);
CREATE INDEX idx_retention_jobs_status ON data_retention_jobs(status);
CREATE INDEX idx_retention_jobs_type ON data_retention_jobs(job_type);
```

#### Table: `verification_history`

Daily verification results.

```sql
CREATE TABLE verification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_date DATE NOT NULL,
  total_killmails_expected BIGINT NOT NULL,
  total_killmails_found BIGINT NOT NULL,
  missing_killmails BIGINT NOT NULL,
  requeued_killmails BIGINT NOT NULL,
  verification_duration_seconds INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_verification_date UNIQUE (verification_date)
);

CREATE INDEX idx_verification_history_date ON verification_history(verification_date DESC);
```

---

## API Endpoints

### Real-Time Ingestion Endpoints

#### GET /api/ingestion/health
Health check for Kubernetes probes.

**Response**:
```json
{
  "status": "healthy",
  "lastPoll": "2025-11-25T10:00:00Z",
  "lastKillmail": "2025-11-25T09:59:55Z",
  "consecutiveFailures": 0
}
```

#### GET /api/ingestion/stats
Ingestion statistics.

**Response**:
```json
{
  "realTime": {
    "totalIngested": 1523456,
    "totalAccepted": 548923,
    "totalRejected": 974533,
    "acceptRate": 0.36,
    "ingestRate": 12.5,
    "lastHourAccepted": 750
  },
  "historical": {
    "totalJobs": 15,
    "runningJobs": 1,
    "completedJobs": 12,
    "failedJobs": 2,
    "totalKillmailsProcessed": 2345678
  }
}
```

### Historical Ingestion Endpoints

#### POST /api/ingestion/historical/jobs
Create a new historical ingestion job.

**Authorization**: Requires `admin` role

**Request**:
```json
{
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "rulesetId": "uuid", // Optional, uses default if not provided
  "priority": "normal" // 'low', 'normal', 'high'
}
```

**Response** (201 Created):
```json
{
  "jobId": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "status": "pending",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "totalDates": 31,
  "estimatedKillmails": 450000,
  "estimatedDuration": "4-8 hours",
  "createdAt": "2025-11-25T10:00:00Z"
}
```

#### GET /api/ingestion/historical/jobs
List all historical ingestion jobs.

**Authorization**: Requires `admin` role

**Query Parameters**:
- `status` (optional): Filter by status
- `limit` (optional, default 50): Results per page
- `offset` (optional, default 0): Pagination offset

**Response**:
```json
{
  "jobs": [
    {
      "jobId": "uuid",
      "status": "running",
      "startDate": "2025-01-01",
      "endDate": "2025-01-31",
      "progress": {
        "totalDates": 31,
        "processedDates": 8,
        "totalKillmails": 450000,
        "processedKillmails": 125000,
        "acceptedKillmails": 45000,
        "rejectedKillmails": 80000,
        "percentComplete": 27.8
      },
      "createdBy": "admin@battlescope.io",
      "createdAt": "2025-11-25T10:00:00Z",
      "startedAt": "2025-11-25T10:00:05Z"
    }
  ],
  "total": 15,
  "limit": 50,
  "offset": 0
}
```

#### GET /api/ingestion/historical/jobs/:id
Get detailed status of specific job.

**Authorization**: Requires `admin` role

**Response**:
```json
{
  "jobId": "uuid",
  "status": "running",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "rulesetId": "uuid",
  "priority": "normal",
  "progress": {
    "totalDates": 31,
    "processedDates": 8,
    "currentDate": "2025-01-08",
    "totalKillmails": 450000,
    "processedKillmails": 125000,
    "acceptedKillmails": 45000,
    "rejectedKillmails": 80000,
    "percentComplete": 27.8,
    "currentRate": 1200,
    "estimatedCompletion": "2025-11-25T14:30:00Z"
  },
  "dateProgress": [
    { "date": "2025-01-01", "status": "completed", "killmails": 15000, "accepted": 5400 },
    { "date": "2025-01-02", "status": "completed", "killmails": 14800, "accepted": 5328 },
    { "date": "2025-01-08", "status": "running", "killmails": 8500, "accepted": 3060 }
  ],
  "createdBy": "admin@battlescope.io",
  "createdAt": "2025-11-25T10:00:00Z",
  "startedAt": "2025-11-25T10:00:05Z"
}
```

#### POST /api/ingestion/historical/jobs/:id/cancel
Cancel a running or pending job.

**Authorization**: Requires `admin` role

**Response** (200 OK):
```json
{
  "jobId": "uuid",
  "status": "cancelled",
  "cancelledAt": "2025-11-25T10:15:00Z"
}
```

#### POST /api/ingestion/historical/jobs/:id/retry
Retry a failed job.

**Authorization**: Requires `admin` role

**Response** (200 OK):
```json
{
  "jobId": "uuid",
  "status": "pending",
  "retryCount": 1,
  "lastProcessedDate": "2025-01-15",
  "willResumeFrom": "2025-01-16"
}
```

### Ruleset Management Endpoints

#### GET /api/ingestion/rulesets
List all rulesets.

#### POST /api/ingestion/rulesets
Create new ruleset (admin only).

#### PUT /api/ingestion/rulesets/:id
Update ruleset (admin only).

#### DELETE /api/ingestion/rulesets/:id
Delete ruleset (admin only).

### Data Retention & Verification Endpoints

#### GET /api/ingestion/retention/status
Get current retention policy status.

**Response**:
```json
{
  "retentionPolicy": {
    "windowMonths": 60,
    "cutoffDate": "2020-11-25",
    "lastCleanup": "2025-11-25T02:00:00Z",
    "nextCleanup": "2025-11-26T02:00:00Z"
  },
  "dataStats": {
    "oldestKillmail": "2020-11-25T00:05:23Z",
    "newestKillmail": "2025-11-25T10:32:15Z",
    "totalKillmails": 15234567
  }
}
```

#### GET /api/ingestion/verification/history
Get daily verification history.

**Query Parameters**:
- `limit` (default: 30)
- `offset` (default: 0)

**Response**:
```json
{
  "verifications": [
    {
      "date": "2025-11-24",
      "expected": 15234,
      "found": 15232,
      "missing": 2,
      "requeued": 2,
      "duration": 145
    }
  ],
  "summary": {
    "totalDaysVerified": 30,
    "totalMissing": 15,
    "averageMissingPerDay": 0.5
  }
}
```

#### POST /api/ingestion/retention/trigger
Manually trigger retention cleanup (admin only).

**Response** (202 Accepted):
```json
{
  "jobId": "uuid",
  "status": "pending",
  "cutoffDate": "2020-11-25"
}
```

#### POST /api/ingestion/verification/trigger
Manually trigger verification for specific date (admin only).

**Request**:
```json
{
  "date": "2025-11-20"
}
```

**Response** (202 Accepted):
```json
{
  "jobId": "uuid",
  "status": "pending",
  "verificationDate": "2025-11-20"
}
```

---

## Event Publishing

### Event: `killmail.ingested`

Published to Kafka topic: `killmail.ingested`

**Schema** (same for both real-time and historical):
```json
{
  "eventId": "uuid",
  "eventType": "killmail.ingested",
  "timestamp": "2025-11-25T10:00:00Z",
  "source": "ingestion-service",
  "data": {
    "killmailId": "123456789",
    "killmailTime": "2025-11-25T09:55:00Z",
    "systemId": "30000142",
    "victimAllianceId": "99001234",
    "attackerAllianceIds": ["99005678", "99009012"],
    "zkbHash": "abc123...",
    "zkbUrl": "https://zkillboard.com/kill/123456789/",
    "source": "historical", // or "redisq"
    "historicalJobId": "uuid" // Only present for historical
  }
}
```

**Partition Key**: `killmailId` (ensures ordering per killmail)

### Event: `battle.recluster`

Published to Kafka topic: `battle.recluster`

**Purpose**: Notify Battle Service to re-cluster a date range due to new/missing killmails or retention cleanup.

**Schema**:
```json
{
  "eventId": "uuid",
  "eventType": "battle.recluster",
  "timestamp": "2025-11-25T03:05:00Z",
  "source": "ingestion-service",
  "data": {
    "startDate": "2025-11-24",
    "endDate": "2025-11-24",
    "reason": "daily_verification", // or "gap_detected", "retention_cleanup", "manual"
    "affectedKillmails": 125,
    "priority": "normal" // or "high" for manual requests
  }
}
```

### Event: `data.retention_cleanup`

Published to Kafka topic: `data.retention`

**Purpose**: Notify downstream services that data older than cutoff date has been deleted.

**Schema**:
```json
{
  "eventId": "uuid",
  "eventType": "data.retention_cleanup",
  "timestamp": "2025-11-25T02:15:00Z",
  "source": "ingestion-service",
  "data": {
    "cutoffDate": "2020-11-25",
    "killmailsDeleted": 12345,
    "dateRangeDeleted": {
      "start": "2020-11-24",
      "end": "2020-11-25"
    }
  }
}
```

**Consumers**:
- Enrichment Service (delete enriched killmails)
- Battle Service (delete battles)
- Search Service (remove from indices)

---

## Implementation Details

### Real-Time Ingestion Worker

```typescript
class RedisQPoller {
  private pollInterval = 5000; // 5 seconds
  private endpoint = 'https://zkillboard.com/api/redisq.php';

  async start(): Promise<void> {
    while (true) {
      try {
        const killmail = await this.fetchFromRedisQ();

        if (killmail) {
          const accepted = await this.applyRulesets(killmail);

          if (accepted) {
            await this.storeKillmail(killmail, 'redisq');
            await this.publishEvent(killmail, 'redisq');
          }
        }

        await sleep(this.pollInterval);
      } catch (error) {
        logger.error({ error }, 'RedisQ polling failed');
        await this.handleFailure(error);
      }
    }
  }
}
```

### Historical Ingestion Worker

```typescript
class HistoricalIngestionWorker {
  async processJob(job: HistoricalIngestionJob): Promise<void> {
    await this.updateJobStatus(job.id, 'running');

    try {
      const dates = this.generateDateRange(job.startDate, job.endDate);

      for (const date of dates) {
        // 1. Fetch killmail IDs from History API
        const killmails = await this.fetchHistoryForDate(date);

        // 2. Apply ruleset filters (same as RedisQ)
        const filtered = await this.applyRulesets(killmails, job.rulesetId);

        // 3. Store in database
        await this.storeKillmails(filtered, 'historical', job.id);

        // 4. Publish to Kafka (same event format as RedisQ)
        await this.publishEvents(filtered, 'historical', job.id);

        // 5. Update job progress
        await this.updateJobProgress(job.id, date, killmails.length, filtered.length);

        // 6. Rate limit handling
        await this.rateLimitDelay();
      }

      await this.updateJobStatus(job.id, 'completed');
    } catch (error) {
      await this.updateJobStatus(job.id, 'failed', error.message);
      throw error;
    }
  }

  private async fetchHistoryForDate(date: string): Promise<HistoricalKillmail[]> {
    const url = `https://zkillboard.com/api/history/${date}.json`;
    const response = await this.fetchWithRetry(url);

    return response.map(item => ({
      killmailId: item.killmail_id,
      zkbHash: item.zkb.hash
    }));
  }

  private async fetchWithRetry(url: string, retryCount = 0): Promise<any> {
    try {
      const response = await fetch(url);

      if (response.status === 429) {
        // Rate limited
        await this.exponentialBackoff(retryCount);
        return this.fetchWithRetry(url, retryCount + 1);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      if (retryCount < 3) {
        await this.exponentialBackoff(retryCount);
        return this.fetchWithRetry(url, retryCount + 1);
      }
      throw error;
    }
  }

  private async exponentialBackoff(retryCount: number): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, retryCount), 60000);
    await sleep(delay);
  }
}
```

---

## Operational Considerations

### Performance Targets

**Real-Time Ingestion**:
- Poll interval: 5 seconds
- Expected rate: 10-20 killmails/minute
- Acceptance rate: ~30-40% (depends on rulesets)

**Historical Ingestion**:
- Throughput: 1,000-2,000 killmails/minute (after filtering)
- Rate limit: 10 requests/second to zKillboard
- Concurrent jobs: 1 (configurable)

### Resource Requirements

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 100m | 500m |
| Memory | 128Mi | 512Mi |
| Storage | N/A | N/A (database separate) |

### Scaling

- **Horizontal**: 1-2 replicas (only one actively polls RedisQ)
- **Leader Election**: Required for RedisQ polling (use Kubernetes lease)
- **Historical Jobs**: Single worker, queue-based processing

---

## Monitoring & Alerting

### Metrics

**Real-Time**:
- `ingestion_redisq_polls_total` - Total RedisQ polls
- `ingestion_redisq_polls_failures_total` - Failed polls
- `ingestion_killmails_ingested_total{source="redisq"}` - Killmails ingested
- `ingestion_killmails_accepted_total{source="redisq"}` - Killmails accepted
- `ingestion_killmails_rejected_total{source="redisq"}` - Killmails rejected

**Historical**:
- `ingestion_historical_jobs_total{status}` - Jobs by status
- `ingestion_historical_jobs_running` - Currently running jobs
- `ingestion_historical_killmails_processed_total` - Killmails processed
- `ingestion_historical_killmails_accepted_total` - Killmails accepted
- `ingestion_historical_rate_limits_hit_total` - Rate limit 429 responses
- `ingestion_historical_job_duration_seconds` - Job completion time

### Alerts

- **RedisQ Polling Down**: No successful poll in 60 seconds
- **Historical Job Stuck**: Job running > 24 hours
- **High Rate Limit**: >10 rate limit responses in 5 minutes
- **Job Failure Rate**: >20% of jobs failing

---

## Testing Strategy

### Unit Tests
- RedisQ polling logic
- History API client with mocked responses
- Ruleset filtering
- Event publishing
- Job state transitions

### Integration Tests
- Full ingestion flow with test database
- Kafka event publishing
- Job creation and monitoring
- Concurrent job handling

### End-to-End Tests
- Real-time ingestion from RedisQ
- Historical job creation and completion
- Verify no duplicates
- Verify downstream services receive events

---

## Dependencies

**External Services**:
- zKillboard RedisQ API
- zKillboard History API

**Internal Services**:
- PostgreSQL (ingestion_db)
- Kafka/Redpanda

**Libraries**:
- Fastify (HTTP server)
- Kysely (Database)
- KafkaJS (Event publishing)
- Zod (Validation)

---

## References

- [zKillboard History API](https://github.com/zKillboard/zKillboard/wiki/API-(History))
- [Historical Ingestion Feature Spec](../../docs/features/historical-ingestion/feature-spec.md)
- [Domain Service Boundaries](../DOMAIN-BOUNDARIES.md#domain-1-ingestion)
- [Distributed Systems Design](../../docs/architecture-v3/distributed-systems-design.md)
