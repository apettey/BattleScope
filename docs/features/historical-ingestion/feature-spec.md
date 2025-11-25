# Historical Killmail Ingestion Feature Specification

**Version**: 1.0
**Date**: 2025-11-25
**Status**: Draft

---

## Overview

Historical killmail ingestion allows BattleScope to backfill killmail data from specific dates using zKillboard's History API. This enables:
- Retroactive battle reconstruction for historical analysis
- Data recovery after outages
- Initial population of new alliances/corporations
- Historical trend analysis

---

## Business Requirements

### Use Cases

**UC1: Historical Backfill for New Alliance**
- Admin adds a new alliance to tracking
- System backfills last 30 days of killmails for that alliance
- Battles are reconstructed from historical data

**UC2: Data Recovery After Outage**
- Ingestion service was down for 6 hours
- Admin initiates historical ingestion for the missed period
- System fills the gap without duplicates

**UC3: Historical Analysis**
- Analyst wants to study battles from a specific date range
- Admin triggers historical ingestion for those dates
- System processes killmails through normal pipeline

**UC4: Initial System Population**
- New BattleScope installation
- Admin backfills last 90 days of data
- System builds complete historical battle database

---

## Technical Requirements

### zKillboard History API

**Endpoint**: `https://zkillboard.com/api/history/YYYYMMDD.json`

**Response Format**:
```json
[
  {
    "killmail_id": 123456789,
    "zkb": {
      "hash": "abc123..."
    }
  },
  ...
]
```

**Key Differences from RedisQ**:
- History API returns only `killmail_id` and `hash`
- NO killmail metadata (victim, attackers, system, time)
- Requires fetching full killmail from zKillboard API
- No real-time streaming (batch processing)

**Rate Limits**:
- Standard zKillboard rate limits apply
- Recommend: 10 requests/second maximum
- Use exponential backoff on 429 responses

---

## Architecture Design

### Data Flow

```
Admin triggers historical ingestion for date range
                    ↓
Historical Ingestion Job (Ingestion Service)
    - Fetches killmail IDs from History API
    - Applies same ruleset filters
    - Stores as "historical" batch
    - Publishes to Kafka
                    ↓
Enrichment Service (same process as RedisQ)
    - Consumes events
    - Fetches full killmail payloads
    - Enriches with ESI data
    - Publishes enriched events
                    ↓
Battle Service (same process as RedisQ)
    - Clusters killmails into battles
    - Handles out-of-order events
    - Retroactive attribution
```

### Database Schema Changes

#### Ingestion Service

**New Table: `historical_ingestion_jobs`**
```sql
CREATE TABLE historical_ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  total_killmails BIGINT DEFAULT 0,
  processed_killmails BIGINT DEFAULT 0,
  accepted_killmails BIGINT DEFAULT 0,
  created_by TEXT, -- User who initiated
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX idx_historical_jobs_status ON historical_ingestion_jobs(status);
CREATE INDEX idx_historical_jobs_dates ON historical_ingestion_jobs(start_date, end_date);
```

**Update Table: `killmail_events`**
```sql
ALTER TABLE killmail_events
ADD COLUMN source TEXT NOT NULL DEFAULT 'redisq', -- 'redisq' or 'historical'
ADD COLUMN historical_job_id UUID REFERENCES historical_ingestion_jobs(id);

CREATE INDEX idx_killmail_events_source ON killmail_events(source);
CREATE INDEX idx_killmail_events_historical_job ON killmail_events(historical_job_id);
```

---

## Implementation Details

### Ingestion Service Changes

#### New API Endpoints

**POST /api/ingestion/historical/jobs**
Create a new historical ingestion job

Request:
```json
{
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "rulesetId": "uuid", // Optional, uses default if not provided
  "priority": "normal" // 'low', 'normal', 'high'
}
```

Response:
```json
{
  "jobId": "uuid",
  "status": "pending",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "estimatedKillmails": 450000,
  "estimatedDuration": "2 hours"
}
```

**GET /api/ingestion/historical/jobs**
List all historical ingestion jobs

Response:
```json
{
  "jobs": [
    {
      "jobId": "uuid",
      "status": "running",
      "startDate": "2025-01-01",
      "endDate": "2025-01-31",
      "progress": {
        "totalKillmails": 450000,
        "processedKillmails": 125000,
        "acceptedKillmails": 45000,
        "percentComplete": 27.8
      },
      "createdAt": "2025-11-25T10:00:00Z",
      "startedAt": "2025-11-25T10:00:05Z"
    }
  ]
}
```

**GET /api/ingestion/historical/jobs/:id**
Get status of specific job

**DELETE /api/ingestion/historical/jobs/:id**
Cancel a running job (idempotent)

#### Historical Ingestion Worker

**New Service**: `HistoricalIngestionWorker`

```typescript
class HistoricalIngestionWorker {
  async processJob(job: HistoricalIngestionJob): Promise<void> {
    // 1. Fetch killmail IDs for date range
    const dates = this.generateDateRange(job.startDate, job.endDate);

    for (const date of dates) {
      // 2. Fetch from History API
      const killmails = await this.fetchHistoryForDate(date);

      // 3. Apply ruleset filters (same as RedisQ)
      const filtered = await this.applyRulesets(killmails);

      // 4. Store in database
      await this.storeKillmailEvents(filtered, job.id);

      // 5. Publish to Kafka (same event format as RedisQ)
      await this.publishKillmailIngestedEvents(filtered);

      // 6. Update job progress
      await this.updateJobProgress(job.id, killmails.length, filtered.length);

      // 7. Rate limit handling
      await this.rateLimitDelay();
    }
  }

  private async fetchHistoryForDate(date: string): Promise<HistoricalKillmail[]> {
    const url = `https://zkillboard.com/api/history/${date}.json`;
    const response = await fetch(url);

    if (response.status === 429) {
      // Rate limited, exponential backoff
      await this.exponentialBackoff();
      return this.fetchHistoryForDate(date);
    }

    return response.json();
  }
}
```

#### Event Schema

**No changes to event schema** - Historical killmails use the same `killmail.ingested` event:

```json
{
  "eventId": "uuid",
  "eventType": "killmail.ingested",
  "timestamp": "2025-11-25T10:00:00Z",
  "data": {
    "killmailId": "123456789",
    "source": "historical", // Indicates historical vs real-time
    "historicalJobId": "uuid", // Reference to batch job
    "hash": "abc123..."
  }
}
```

Downstream services (Enrichment, Battle) handle historical events identically to real-time events.

---

## Frontend UI

### Admin Panel - Historical Ingestion Section

**Location**: `/admin/historical-ingestion`

**Access**: Requires `admin` role

#### UI Components

**1. Create Historical Ingestion Job**

```
┌───────────────────────────────────────────────────────────┐
│ Create Historical Ingestion Job                          │
├───────────────────────────────────────────────────────────┤
│                                                           │
│ Date Range:                                               │
│   Start Date:  [2025-01-01▼]                             │
│   End Date:    [2025-01-31▼]                             │
│                                                           │
│ Ruleset: [Default Ruleset          ▼]                    │
│                                                           │
│ Priority: ○ Low  ⦿ Normal  ○ High                        │
│                                                           │
│ ℹ️  Estimated: 450,000 killmails (~2 hours)              │
│                                                           │
│              [Cancel]  [Start Ingestion]                  │
└───────────────────────────────────────────────────────────┘
```

**2. Job List**

```
┌───────────────────────────────────────────────────────────┐
│ Historical Ingestion Jobs                  [+ New Job]    │
├───────────────────────────────────────────────────────────┤
│                                                           │
│ ┌─────────────────────────────────────────────────┐      │
│ │ 2025-01-01 to 2025-01-31          🔄 Running    │      │
│ │ Progress: ████████░░░░░░░░░░ 45%               │      │
│ │ 125,000 / 450,000 killmails processed           │      │
│ │ 45,000 accepted (36% pass rate)                 │      │
│ │ Started: 2025-11-25 10:00:05                    │      │
│ │ ETA: 1 hour 15 minutes                          │      │
│ │                        [View Details] [Cancel]  │      │
│ └─────────────────────────────────────────────────┘      │
│                                                           │
│ ┌─────────────────────────────────────────────────┐      │
│ │ 2024-12-01 to 2024-12-31          ✅ Completed  │      │
│ │ 890,000 killmails processed                     │      │
│ │ 320,000 accepted (36% pass rate)                │      │
│ │ Duration: 3 hours 45 minutes                    │      │
│ │ Completed: 2025-11-20 14:32:18                  │      │
│ │                        [View Details]           │      │
│ └─────────────────────────────────────────────────┘      │
│                                                           │
│ ┌─────────────────────────────────────────────────┐      │
│ │ 2024-11-15 to 2024-11-16          ❌ Failed     │      │
│ │ Error: Rate limit exceeded (429)                │      │
│ │ 125,000 / 200,000 killmails processed           │      │
│ │ Failed: 2025-11-19 08:15:32                     │      │
│ │                        [View Details] [Retry]   │      │
│ └─────────────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────┘
```

**3. Job Detail View**

```
┌───────────────────────────────────────────────────────────┐
│ Historical Ingestion Job Details          [Back to List]  │
├───────────────────────────────────────────────────────────┤
│                                                           │
│ Job ID: a1b2c3d4-5678-90ab-cdef-1234567890ab             │
│ Status: 🔄 Running                                        │
│                                                           │
│ Configuration:                                            │
│   Date Range: 2025-01-01 to 2025-01-31                   │
│   Ruleset: Default Ruleset                                │
│   Priority: Normal                                        │
│   Created By: admin@battlescope.io                        │
│   Created At: 2025-11-25 10:00:00                        │
│                                                           │
│ Progress:                                                 │
│   Total Killmails: 450,000                                │
│   Processed: 125,000 (27.8%)                              │
│   Accepted: 45,000 (36% pass rate)                        │
│   Rejected: 80,000 (64% filtered out)                     │
│                                                           │
│ Timeline:                                                 │
│   ✅ 2025-01-01: 15,000 killmails (5,400 accepted)       │
│   ✅ 2025-01-02: 14,800 killmails (5,328 accepted)       │
│   ✅ 2025-01-03: 15,200 killmails (5,472 accepted)       │
│   🔄 2025-01-04: Processing... (8,500 / 15,100)          │
│   ⏳ 2025-01-05 to 2025-01-31: Pending                   │
│                                                           │
│ Performance:                                              │
│   Average Rate: 1,200 killmails/minute                    │
│   Estimated Completion: 2025-11-25 12:15:00 (1h 15m)     │
│                                                           │
│                              [Cancel Job]                 │
└───────────────────────────────────────────────────────────┘
```

---

## Operational Considerations

### Rate Limiting

**Strategy**:
- Respect zKillboard rate limits (standard: ~10 req/s)
- Exponential backoff on 429 responses
- Configurable rate limit via environment variable
- Monitor rate limit headers from zKillboard

**Implementation**:
```typescript
class RateLimiter {
  private requestsPerSecond = 10;
  private backoffMultiplier = 2;
  private maxBackoff = 60000; // 60 seconds

  async handleRateLimitResponse(retryCount: number): Promise<void> {
    const delay = Math.min(
      1000 * Math.pow(this.backoffMultiplier, retryCount),
      this.maxBackoff
    );
    await sleep(delay);
  }
}
```

### Performance

**Expected Throughput**:
- ~1,000-2,000 killmails/minute (after filtering)
- ~60,000-120,000 killmails/hour
- ~1.5M-3M killmails/day

**Example**:
- Backfilling 30 days: ~450,000 killmails → 4-8 hours
- Backfilling 90 days: ~1.35M killmails → 12-24 hours

### Error Handling

**Retryable Errors**:
- 429 (Rate Limit) → Exponential backoff
- 500/502/503 (Server Error) → Retry with backoff
- Network timeout → Retry

**Non-Retryable Errors**:
- 404 (Date not found) → Skip date, log warning
- 400 (Bad Request) → Fail job
- Invalid JSON response → Fail job

**Job Recovery**:
- Jobs can be resumed from last successful date
- Progress tracked per-date for granular recovery
- Failed jobs can be retried manually

### Monitoring

**Key Metrics**:
- `historical_ingestion_jobs_total` - Total jobs created
- `historical_ingestion_jobs_running` - Currently running jobs
- `historical_ingestion_killmails_processed` - Killmails processed
- `historical_ingestion_killmails_accepted` - Killmails accepted
- `historical_ingestion_rate_limits_hit` - Rate limit 429 responses
- `historical_ingestion_job_duration_seconds` - Job completion time

---

## Testing Strategy

### Unit Tests

- History API client with mocked responses
- Ruleset filtering (same as RedisQ)
- Event publishing
- Job state transitions
- Rate limit handling

### Integration Tests

- Fetch real history data from zKillboard (test environment)
- Store in test database
- Verify Kafka event publishing
- Test job cancellation mid-process

### End-to-End Tests

- Create historical ingestion job via API
- Monitor job progress
- Verify killmails appear in battles
- Verify no duplicates with existing data

---

## Migration Plan

### Phase 1: Database Schema (Week 1)
- Add `historical_ingestion_jobs` table
- Add `source` and `historical_job_id` columns to `killmail_events`
- Create indexes

### Phase 2: Backend Implementation (Week 2-3)
- Implement History API client
- Implement HistoricalIngestionWorker
- Add new API endpoints
- Add job queue management

### Phase 3: Frontend UI (Week 3-4)
- Admin panel UI for job creation
- Job list and detail views
- Progress monitoring

### Phase 4: Testing & Deployment (Week 4-5)
- Integration testing with real data
- Performance testing
- Deploy to production
- Monitor for issues

---

## Security Considerations

**Access Control**:
- Historical ingestion endpoints require `admin` role
- Job creation logged in audit trail
- Jobs track creator for accountability

**Rate Limit Protection**:
- Prevent abuse by limiting concurrent jobs
- Max 1 running job at a time (configurable)
- Automatic throttling to respect zKillboard limits

**Data Integrity**:
- Idempotent ingestion (no duplicates)
- Same filtering rules as real-time
- Verification of killmail hashes

---

## Future Enhancements

**Priority Queue**:
- High-priority jobs for urgent backfills
- Low-priority for background historical analysis

**Selective Re-ingestion**:
- Re-process specific alliances/dates
- Update battles with new rulesets

**Scheduled Jobs**:
- Cron-based historical ingestion
- Automatic gap filling

**Parallel Processing**:
- Process multiple dates concurrently
- Distribute across worker pool

---

## API Contract

### OpenAPI Specification

See [historical-ingestion-openapi.yaml](./historical-ingestion-openapi.yaml) for complete API contract.

### Event Schema

See [killmail-ingested-historical.schema.json](./killmail-ingested-historical.schema.json) for event contract.

---

## References

- [zKillboard History API Documentation](https://github.com/zKillboard/zKillboard/wiki/API-(History))
- [Ingestion Service Architecture](../../architecture-v3/domain-service-boundaries.md#domain-1-ingestion)
- [Rate Limiting Patterns](../../architecture-v3/distributed-systems-design.md#pattern-5-rate-limiting-and-backpressure)
- [Idempotency Patterns](../../architecture-v3/distributed-systems-design.md#pattern-1-idempotent-operations)
