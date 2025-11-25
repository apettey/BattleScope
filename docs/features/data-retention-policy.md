# BattleScope Data Retention Policy

**Version**: 1.0
**Date**: 2025-11-25
**Status**: Production Policy

---

## Overview

BattleScope maintains a **rolling 60-month (5-year) window** of killmail and battle data. This policy ensures:
- Sufficient historical data for trend analysis
- Manageable database size and performance
- Automatic cleanup of aged data
- Continuous data completeness verification

---

## Retention Policy

### Core Rule

**All data older than 60 months (5 years) from the current date is automatically deleted.**

### Affected Data

| Data Type | Retention Period | Auto-Delete |
|-----------|------------------|-------------|
| **Killmail Events** | 60 months | Yes |
| **Enriched Killmails** | 60 months | Yes |
| **Battles** | 60 months | Yes |
| **Battle Participants** | 60 months | Yes (cascade from battles) |
| **Search Indices** | 60 months | Yes |
| **Historical Job Records** | Permanent | No (audit trail) |
| **Metrics & Logs** | Per observability policy | Yes |

### Implementation

**Automated Deletion**:
- Runs daily at 02:00 UTC
- Deletes data older than 60 months
- Cascading deletes ensure referential integrity
- Metrics tracked for deleted records

**Calculation**:
```
deletion_cutoff_date = CURRENT_DATE - INTERVAL '60 months'
```

**Example** (as of 2025-11-25):
- Keep: All data from 2020-11-25 onwards
- Delete: All data before 2020-11-25

---

## Data Completeness Verification

### Daily Verification Job

**Purpose**: Ensure no killmails are missing from the last 60 months due to outages, API failures, or other issues.

**Schedule**: Runs daily at 03:00 UTC (after retention cleanup)

**Process**:
1. Query zKillboard History API for yesterday's date
2. Compare killmail IDs with local database
3. Identify missing killmails
4. Queue missing killmails for ingestion
5. Notify Battle Service to re-cluster affected date range

**Verification Window**: Yesterday only (most recent complete day)

**Why Yesterday Only**:
- Yesterday is a complete 24-hour period
- zKillboard History API data is stable for completed days
- Minimizes API load vs checking entire 60-month window
- Real-time RedisQ handles "today"

### Gap Detection & Re-sync

**Scenario 1: Service Outage Detected**
- Ingestion service was down for 6 hours
- System automatically detects gap
- Triggers historical ingestion job for missing period
- Battle Service re-clusters affected time range

**Scenario 2: Missing Killmails Identified**
- Daily verification finds 100 missing killmails from yesterday
- Re-queues missing killmails via Kafka
- Enrichment service processes normally
- Battle Service receives `battle.recluster` event

**Scenario 3: Initial Database Population**
- New installation or database reset
- System detects missing last 60 months
- Triggers bulk historical ingestion (60-month backfill)
- Estimated time: 7-10 days for full 60-month window

---

## Battle Re-clustering

### When Re-clustering Occurs

**Trigger Events**:
1. New killmails added to historical date range
2. Data retention cleanup removes old killmails
3. Manual admin request for date range

**Process**:
1. Ingestion Service publishes `battle.recluster` event
2. Battle Service receives event with date range
3. Battle Service:
   - Fetches all killmails in date range
   - Re-runs clustering algorithm
   - Updates existing battles
   - Creates new battles if needed
   - Deletes battles that no longer meet criteria
4. Battle Service publishes `battle.updated` events
5. Search Service re-indexes updated battles

### Event Schema

**Event**: `battle.recluster`

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

**Kafka Topic**: `battle.recluster`

---

## Database Schemas for Retention

### Ingestion Service

#### Table: `killmail_events` (retention applied)

```sql
-- Add deletion timestamp for retention tracking
ALTER TABLE killmail_events
ADD COLUMN deleted_at TIMESTAMPTZ,
ADD COLUMN deletion_reason TEXT; -- 'retention_policy', 'manual_deletion'

CREATE INDEX idx_killmail_events_killmail_time ON killmail_events(killmail_time);
CREATE INDEX idx_killmail_events_deleted_at ON killmail_events(deleted_at) WHERE deleted_at IS NOT NULL;
```

#### New Table: `data_retention_jobs`

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
```

#### New Table: `verification_history`

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

### Battle Service

#### Table: `battles` (retention applied)

```sql
-- Add deletion tracking
ALTER TABLE battles
ADD COLUMN deleted_at TIMESTAMPTZ,
ADD COLUMN deletion_reason TEXT; -- 'retention_policy', 'reclustering', 'manual_deletion'

CREATE INDEX idx_battles_start_time ON battles(start_time);
CREATE INDEX idx_battles_deleted_at ON battles(deleted_at) WHERE deleted_at IS NOT NULL;
```

#### New Table: `reclustering_jobs`

```sql
CREATE TABLE reclustering_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL, -- 'daily_verification', 'gap_detected', 'retention_cleanup', 'manual'
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high'

  -- Metrics
  total_killmails_processed BIGINT DEFAULT 0,
  battles_created BIGINT DEFAULT 0,
  battles_updated BIGINT DEFAULT 0,
  battles_deleted BIGINT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Error handling
  error_message TEXT
);

CREATE INDEX idx_reclustering_jobs_dates ON reclustering_jobs(start_date, end_date);
CREATE INDEX idx_reclustering_jobs_status ON reclustering_jobs(status);
CREATE INDEX idx_reclustering_jobs_created_at ON reclustering_jobs(created_at DESC);
```

---

## Scheduled Jobs

### Job 1: Data Retention Cleanup

**Schedule**: Daily at 02:00 UTC

**Purpose**: Delete data older than 60 months

**Implementation**:
```typescript
async function runRetentionCleanup(): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 60);

  // 1. Delete from Ingestion Service
  const deletedKillmails = await db
    .deleteFrom('killmail_events')
    .where('killmail_time', '<', cutoffDate)
    .returning('killmail_id')
    .execute();

  // 2. Publish retention event
  await kafka.send({
    topic: 'data.retention',
    messages: [{
      value: JSON.stringify({
        eventType: 'data.retention_cleanup',
        cutoffDate: cutoffDate.toISOString(),
        deletedKillmails: deletedKillmails.length
      })
    }]
  });

  // 3. Downstream services handle their own retention
  // (Enrichment, Battle, Search receive event and delete their data)
}
```

**Duration**: ~5-30 minutes depending on data volume

### Job 2: Daily Verification

**Schedule**: Daily at 03:00 UTC (after retention cleanup)

**Purpose**: Verify yesterday's killmails are complete

**Implementation**:
```typescript
async function runDailyVerification(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0].replace(/-/g, '');

  // 1. Fetch from zKillboard History API
  const historyKillmails = await fetch(
    `https://zkillboard.com/api/history/${dateStr}.json`
  ).then(r => r.json());

  // 2. Query local database
  const localKillmails = await db
    .selectFrom('killmail_events')
    .select('killmail_id')
    .where('killmail_time', '>=', yesterday)
    .where('killmail_time', '<', new Date())
    .execute();

  // 3. Find missing killmails
  const historyIds = new Set(historyKillmails.map(k => k.killmail_id));
  const localIds = new Set(localKillmails.map(k => k.killmail_id));
  const missing = [...historyIds].filter(id => !localIds.has(id));

  // 4. Re-queue missing killmails
  if (missing.length > 0) {
    for (const killmailId of missing) {
      const killmail = historyKillmails.find(k => k.killmail_id === killmailId);
      await kafka.send({
        topic: 'killmail.ingested',
        messages: [{
          key: killmailId.toString(),
          value: JSON.stringify({
            eventType: 'killmail.ingested',
            data: {
              killmailId: killmailId.toString(),
              zkbHash: killmail.zkb.hash,
              source: 'daily_verification'
            }
          })
        }]
      });
    }

    // 5. Notify Battle Service to re-cluster
    await kafka.send({
      topic: 'battle.recluster',
      messages: [{
        value: JSON.stringify({
          eventType: 'battle.recluster',
          data: {
            startDate: yesterday.toISOString().split('T')[0],
            endDate: yesterday.toISOString().split('T')[0],
            reason: 'daily_verification',
            affectedKillmails: missing.length
          }
        })
      }]
    });
  }

  // 6. Log verification results
  await db.insertInto('verification_history').values({
    verification_date: yesterday,
    total_killmails_expected: historyIds.size,
    total_killmails_found: localIds.size,
    missing_killmails: missing.length,
    requeued_killmails: missing.length
  }).execute();
}
```

**Duration**: ~2-5 minutes

### Job 3: Gap Detection (Startup)

**Trigger**: On Ingestion Service startup

**Purpose**: Detect missing data in last 60 months

**Implementation**:
```typescript
async function detectAndFillGaps(): Promise<void> {
  const today = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 60);

  // 1. Query for dates with zero killmails
  const dates = [];
  for (let d = new Date(startDate); d < today; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }

  const gapDates = [];
  for (const date of dates) {
    const count = await db
      .selectFrom('killmail_events')
      .select(db.fn.count('killmail_id').as('count'))
      .where('killmail_time', '>=', date)
      .where('killmail_time', '<', new Date(date.getTime() + 86400000))
      .executeTakeFirst();

    if (count.count === 0) {
      gapDates.push(date);
    }
  }

  // 2. Create historical ingestion jobs for gaps
  if (gapDates.length > 0) {
    // Group consecutive dates into jobs
    const jobs = groupConsecutiveDates(gapDates);
    for (const job of jobs) {
      await createHistoricalIngestionJob({
        startDate: job.startDate,
        endDate: job.endDate,
        reason: 'gap_detected',
        priority: 'high'
      });
    }
  }
}
```

**Duration**: Varies (5-30 minutes for analysis, days for backfill)

---

## API Endpoints

### GET /api/ingestion/retention/status

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
    "totalKillmails": 15234567,
    "totalBattles": 523456
  }
}
```

### GET /api/ingestion/verification/history

Get daily verification history.

**Query Parameters**:
- `limit` (default: 30): Number of days to return
- `offset` (default: 0): Pagination offset

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
      "status": "completed",
      "duration": 145
    },
    {
      "date": "2025-11-23",
      "expected": 14892,
      "found": 14892,
      "missing": 0,
      "requeued": 0,
      "status": "completed",
      "duration": 132
    }
  ],
  "summary": {
    "totalDaysVerified": 30,
    "totalMissing": 15,
    "totalRequeued": 15,
    "averageMissingPerDay": 0.5
  }
}
```

### POST /api/ingestion/retention/trigger

Manually trigger retention cleanup (admin only).

**Authorization**: Requires `admin` role

**Response** (202 Accepted):
```json
{
  "jobId": "uuid",
  "status": "pending",
  "cutoffDate": "2020-11-25",
  "estimatedDuration": "5-30 minutes"
}
```

### POST /api/ingestion/verification/trigger

Manually trigger verification for specific date (admin only).

**Authorization**: Requires `admin` role

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
  "verificationDate": "2025-11-20",
  "estimatedDuration": "2-5 minutes"
}
```

---

## Monitoring & Alerts

### Key Metrics

**Retention**:
- `retention_cleanup_killmails_deleted_total` - Killmails deleted per run
- `retention_cleanup_battles_deleted_total` - Battles deleted per run
- `retention_cleanup_duration_seconds` - Job duration
- `retention_cleanup_failures_total` - Failed cleanup runs

**Verification**:
- `daily_verification_missing_killmails_total` - Missing killmails found
- `daily_verification_requeued_killmails_total` - Killmails re-queued
- `daily_verification_duration_seconds` - Verification duration
- `daily_verification_failures_total` - Failed verification runs

**Re-clustering**:
- `reclustering_jobs_total` - Total re-clustering jobs
- `reclustering_battles_updated_total` - Battles updated
- `reclustering_duration_seconds` - Re-clustering duration

### Alerts

**High Priority**:
- `DailyVerificationFailed`: Verification job failed 2 days in a row
- `HighMissingKillmailRate`: >1% of killmails missing from yesterday
- `RetentionCleanupFailed`: Cleanup job failed

**Medium Priority**:
- `MissingKillmailsDetected`: Any missing killmails found
- `LargeGapDetected`: Gap >7 days detected at startup
- `ReclusteringBacklog`: >10 re-clustering jobs pending

---

## Configuration

### Environment Variables

```bash
# Retention Policy
DATA_RETENTION_MONTHS=60
RETENTION_CLEANUP_SCHEDULE="0 2 * * *"  # Daily at 02:00 UTC

# Verification
DAILY_VERIFICATION_ENABLED=true
DAILY_VERIFICATION_SCHEDULE="0 3 * * *"  # Daily at 03:00 UTC
VERIFICATION_WINDOW_DAYS=1  # Verify yesterday only

# Gap Detection
GAP_DETECTION_ON_STARTUP=true
GAP_DETECTION_WINDOW_MONTHS=60

# Re-clustering
RECLUSTERING_ENABLED=true
RECLUSTERING_BATCH_SIZE=1000  # Killmails per batch
```

---

## Admin UI

### Retention Policy Dashboard

**Location**: `/admin/data-retention`

**Access**: Requires `admin` role

```
┌───────────────────────────────────────────────────────────┐
│ Data Retention Policy                                     │
├───────────────────────────────────────────────────────────┤
│                                                           │
│ Current Policy:                                           │
│   Retention Window: 60 months (5 years)                   │
│   Cutoff Date: 2020-11-25                                 │
│   Next Cleanup: 2025-11-26 at 02:00 UTC (in 15h 28m)    │
│                                                           │
│ Database Statistics:                                      │
│   Oldest Killmail: 2020-11-25 00:05:23 UTC              │
│   Newest Killmail: 2025-11-25 10:32:15 UTC              │
│   Total Killmails: 15,234,567                            │
│   Total Battles: 523,456                                  │
│   Database Size: 47.2 GB                                  │
│                                                           │
│ Recent Cleanups:                                          │
│   2025-11-25: Deleted 12,345 killmails, 456 battles      │
│   2025-11-24: Deleted 11,892 killmails, 423 battles      │
│   2025-11-23: Deleted 12,567 killmails, 467 battles      │
│                                                           │
│                        [Trigger Cleanup Now]              │
└───────────────────────────────────────────────────────────┘
```

### Daily Verification Dashboard

```
┌───────────────────────────────────────────────────────────┐
│ Daily Verification History           [Trigger Manually]   │
├───────────────────────────────────────────────────────────┤
│                                                           │
│ Last 30 Days:                                             │
│   Total Missing: 15 killmails                             │
│   Average Missing/Day: 0.5                                │
│   Success Rate: 96.7%                                     │
│                                                           │
│ ┌─────────────────────────────────────────────────┐      │
│ │ 2025-11-24         ⚠️  2 missing                │      │
│ │ Expected: 15,234 | Found: 15,232 | Requeued: 2  │      │
│ │ Duration: 2m 25s | Status: Completed            │      │
│ └─────────────────────────────────────────────────┘      │
│                                                           │
│ ┌─────────────────────────────────────────────────┐      │
│ │ 2025-11-23         ✅ Complete                   │      │
│ │ Expected: 14,892 | Found: 14,892 | Missing: 0   │      │
│ │ Duration: 2m 12s | Status: Completed            │      │
│ └─────────────────────────────────────────────────┘      │
│                                                           │
│ [Show Full History]                                       │
└───────────────────────────────────────────────────────────┘
```

---

## References

- [Historical Ingestion Feature Spec](./historical-ingestion/feature-spec.md)
- [Ingestion Service Specification](../../proposal/implementation-v1/services/ingestion-service.md)
- [Battle Service Specification](../../proposal/implementation-v1/services/battle-service.md)
- [Distributed Systems Design](../architecture-v3/distributed-systems-design.md)
