# Enrichment Service Specification

**Domain**: Killmail data augmentation and caching
**Version**: 1.0
**Date**: 2025-11-25

---

## Overview

The Enrichment Service is responsible for transforming minimal killmail references (from Ingestion Service) into fully enriched records with complete payload data and human-readable names resolved from EVE ESI API.

---

## Responsibilities

### Core Responsibilities

✅ **Killmail Enrichment**:
- Consume `killmail.ingested` events from Kafka
- Fetch full killmail payload from zKillboard API
- Store complete killmail JSON payload
- Publish `killmail.enriched` events to Kafka

✅ **ESI Integration & Caching**:
- Resolve entity IDs to names (characters, corporations, alliances, ships, systems)
- Cache ESI responses with appropriate TTLs
- Handle ESI rate limits and errors gracefully
- Batch ESI requests where possible

✅ **Data Retention**:
- Consume `data.retention_cleanup` events
- Delete enriched killmails older than 60 months
- Clean up orphaned ESI cache entries

✅ **Health & Monitoring**:
- Track enrichment processing rate
- Monitor ESI API health and cache hit rates
- Expose health check endpoints
- Track queue lag metrics

### NOT Responsible For

❌ Deciding which killmails to ingest (Ingestion domain)
❌ Clustering killmails into battles (Battle domain)
❌ Indexing for search (Search domain)
❌ User notifications (Notification domain)

---

## Database Schema

### Database: `enrichment_db` (PostgreSQL)

#### Table: `enriched_killmails`

Stores complete killmail payloads with enrichment metadata.

```sql
CREATE TABLE enriched_killmails (
  killmail_id BIGINT PRIMARY KEY,
  killmail_time TIMESTAMPTZ NOT NULL,
  system_id BIGINT NOT NULL,

  -- Full zKillboard payload
  zkb_payload JSONB NOT NULL,
  zkb_hash TEXT NOT NULL,
  zkb_total_value BIGINT, -- ISK value from zkb.totalValue
  zkb_points INT, -- Points from zkb.points

  -- Enrichment metadata
  enriched_at TIMESTAMPTZ DEFAULT NOW(),
  enrichment_duration_ms INT,
  esi_cache_hits INT DEFAULT 0,
  esi_cache_misses INT DEFAULT 0,

  -- Source tracking
  source TEXT NOT NULL, -- 'redisq', 'historical', 'daily_verification'

  -- Retention tracking
  deleted_at TIMESTAMPTZ,
  deletion_reason TEXT, -- 'retention_policy', 'manual_deletion'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enriched_killmails_time ON enriched_killmails(killmail_time DESC);
CREATE INDEX idx_enriched_killmails_system ON enriched_killmails(system_id);
CREATE INDEX idx_enriched_killmails_enriched_at ON enriched_killmails(enriched_at DESC);
CREATE INDEX idx_enriched_killmails_deleted_at ON enriched_killmails(deleted_at) WHERE deleted_at IS NOT NULL;

-- GIN index for JSONB payload queries
CREATE INDEX idx_enriched_killmails_payload ON enriched_killmails USING GIN(zkb_payload jsonb_path_ops);
```

#### Table: `esi_cache`

Caches ESI API responses to reduce external API calls.

```sql
CREATE TABLE esi_cache (
  cache_key TEXT PRIMARY KEY, -- e.g., 'character:123456', 'corporation:98765'
  entity_type TEXT NOT NULL, -- 'character', 'corporation', 'alliance', 'ship', 'system', 'region'
  entity_id BIGINT NOT NULL,
  entity_name TEXT NOT NULL,
  response_data JSONB, -- Full ESI response for complex entities

  -- Cache metadata
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count BIGINT DEFAULT 0,
  last_hit_at TIMESTAMPTZ,

  -- ESI response metadata
  esi_etag TEXT,
  esi_expires TEXT,
  esi_last_modified TEXT
);

CREATE INDEX idx_esi_cache_entity_type ON esi_cache(entity_type);
CREATE INDEX idx_esi_cache_entity_id ON esi_cache(entity_id);
CREATE INDEX idx_esi_cache_expires_at ON esi_cache(expires_at);

-- Composite index for entity lookups
CREATE INDEX idx_esi_cache_type_id ON esi_cache(entity_type, entity_id);
```

#### Table: `enrichment_queue`

Tracks enrichment processing status and retries.

```sql
CREATE TABLE enrichment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  killmail_id BIGINT NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'processing', 'completed', 'failed'
  priority TEXT NOT NULL DEFAULT 'normal', -- 'low', 'normal', 'high'

  -- Processing metadata
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ
);

CREATE INDEX idx_enrichment_queue_status ON enrichment_queue(status);
CREATE INDEX idx_enrichment_queue_killmail_id ON enrichment_queue(killmail_id);
CREATE INDEX idx_enrichment_queue_next_retry ON enrichment_queue(next_retry_at) WHERE status = 'failed';
```

#### Table: `enrichment_stats`

Aggregated statistics for monitoring.

```sql
CREATE TABLE enrichment_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Processing metrics
  killmails_processed BIGINT DEFAULT 0,
  killmails_succeeded BIGINT DEFAULT 0,
  killmails_failed BIGINT DEFAULT 0,
  avg_processing_time_ms INT,

  -- ESI metrics
  esi_requests_total BIGINT DEFAULT 0,
  esi_cache_hits BIGINT DEFAULT 0,
  esi_cache_misses BIGINT DEFAULT 0,
  esi_cache_hit_rate DECIMAL(5,2),
  esi_rate_limits_hit INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enrichment_stats_period ON enrichment_stats(period_start DESC);
```

---

## API Endpoints

### Health & Status

#### GET /api/enrichment/health
Kubernetes health check.

**Response**:
```json
{
  "status": "healthy",
  "lastProcessed": "2025-11-25T10:00:00Z",
  "queueDepth": 45,
  "processingRate": 150.5,
  "esiCacheHitRate": 0.87
}
```

#### GET /api/enrichment/stats
Service statistics.

**Response**:
```json
{
  "current": {
    "queueDepth": 45,
    "processingRate": 150.5,
    "avgProcessingTime": 125,
    "esiCacheHitRate": 0.87
  },
  "last24Hours": {
    "processed": 125000,
    "succeeded": 124800,
    "failed": 200,
    "successRate": 0.998,
    "esiRequestsTotal": 45000,
    "esiCacheHits": 39150,
    "esiCacheMisses": 5850
  }
}
```

### Enrichment Management

#### GET /api/enrichment/killmails/:id
Retrieve enriched killmail by ID.

**Response**:
```json
{
  "killmailId": 123456789,
  "killmailTime": "2025-11-25T09:55:00Z",
  "systemId": 30000142,
  "systemName": "Jita",
  "zkbHash": "abc123...",
  "zkbTotalValue": 5000000000,
  "zkbPoints": 5,
  "victim": {
    "characterId": 95465499,
    "characterName": "John Doe",
    "corporationId": 98765432,
    "corporationName": "Test Corp",
    "allianceId": 99001234,
    "allianceName": "Test Alliance",
    "shipTypeId": 587,
    "shipTypeName": "Rifter",
    "damageTaken": 1500
  },
  "attackers": [
    {
      "characterId": 12345678,
      "characterName": "Jane Smith",
      "corporationId": 87654321,
      "corporationName": "Enemy Corp",
      "allianceId": 99005678,
      "allianceName": "Enemy Alliance",
      "shipTypeId": 599,
      "shipTypeName": "Merlin",
      "damageDone": 1200,
      "finalBlow": true
    }
  ],
  "enrichedAt": "2025-11-25T09:56:05Z",
  "source": "redisq"
}
```

#### POST /api/enrichment/reprocess/:id
Manually trigger re-enrichment of a killmail (admin only).

**Response** (202 Accepted):
```json
{
  "killmailId": 123456789,
  "status": "queued",
  "queuePosition": 15
}
```

### ESI Cache Management

#### GET /api/enrichment/cache/stats
ESI cache statistics.

**Response**:
```json
{
  "totalEntries": 1523456,
  "byType": {
    "character": 456789,
    "corporation": 125000,
    "alliance": 5432,
    "ship": 350,
    "system": 8000
  },
  "hitRate": {
    "overall": 0.87,
    "last1Hour": 0.92,
    "last24Hours": 0.87
  },
  "expiringWithin24Hours": 12500
}
```

#### DELETE /api/enrichment/cache/expired
Manually trigger cleanup of expired cache entries (admin only).

**Response** (200 OK):
```json
{
  "entriesDeleted": 5432,
  "bytesFreed": 1048576
}
```

#### DELETE /api/enrichment/cache/:type/:id
Invalidate specific cache entry (admin only).

**Response** (200 OK):
```json
{
  "cacheKey": "character:123456",
  "deleted": true
}
```

---

## Event Consumption

### Event: `killmail.ingested`

Consumed from Kafka topic: `killmail.ingested`

**Handler Logic**:
1. Extract killmail ID and hash from event
2. Check if already enriched (idempotency)
3. Fetch full killmail payload from zKillboard
4. Extract all entity IDs (characters, corps, alliances, ships, systems)
5. Resolve names via ESI (with caching)
6. Store enriched killmail in database
7. Publish `killmail.enriched` event

**Idempotency**: Use `killmail_id` as idempotency key. Skip if already exists.

### Event: `data.retention_cleanup`

Consumed from Kafka topic: `data.retention`

**Handler Logic**:
1. Extract cutoff date from event
2. Soft delete enriched killmails older than cutoff
3. Update `deleted_at` and `deletion_reason` fields
4. Schedule cleanup of orphaned ESI cache entries
5. Log deletion metrics

---

## Event Publishing

### Event: `killmail.enriched`

Published to Kafka topic: `killmail.enriched`

**Schema**:
```json
{
  "eventId": "uuid",
  "eventType": "killmail.enriched",
  "timestamp": "2025-11-25T10:00:00Z",
  "source": "enrichment-service",
  "data": {
    "killmailId": "123456789",
    "killmailTime": "2025-11-25T09:55:00Z",
    "systemId": "30000142",
    "systemName": "Jita",
    "regionId": "10000002",
    "regionName": "The Forge",
    "zkbTotalValue": 5000000000,
    "zkbPoints": 5,
    "victim": {
      "characterId": "95465499",
      "characterName": "John Doe",
      "corporationId": "98765432",
      "corporationName": "Test Corp",
      "allianceId": "99001234",
      "allianceName": "Test Alliance",
      "shipTypeId": "587",
      "shipTypeName": "Rifter",
      "damageTaken": 1500
    },
    "attackers": [
      {
        "characterId": "12345678",
        "characterName": "Jane Smith",
        "corporationId": "87654321",
        "corporationName": "Enemy Corp",
        "allianceId": "99005678",
        "allianceName": "Enemy Alliance",
        "shipTypeId": "599",
        "shipTypeName": "Merlin",
        "damageDone": 1200,
        "finalBlow": true,
        "weaponTypeId": "2456"
      }
    ],
    "attackerCount": 1,
    "source": "redisq"
  }
}
```

**Partition Key**: `killmailId` (ensures ordering)

---

## Implementation Details

### Enrichment Worker

```typescript
class EnrichmentWorker {
  async processKillmailIngestedEvent(event: KillmailIngestedEvent): Promise<void> {
    const startTime = Date.now();

    try {
      // 1. Check idempotency
      const existing = await this.db
        .selectFrom('enriched_killmails')
        .where('killmail_id', '=', event.data.killmailId)
        .selectAll()
        .executeTakeFirst();

      if (existing) {
        logger.info({ killmailId: event.data.killmailId }, 'Killmail already enriched, skipping');
        return;
      }

      // 2. Fetch full killmail from zKillboard
      const zkbPayload = await this.fetchKillmailFromZkb(
        event.data.killmailId,
        event.data.zkbHash
      );

      // 3. Extract entity IDs
      const entityIds = this.extractEntityIds(zkbPayload);

      // 4. Resolve names from ESI (with caching)
      const { names, cacheHits, cacheMisses } = await this.resolveEntityNames(entityIds);

      // 5. Store enriched killmail
      await this.db
        .insertInto('enriched_killmails')
        .values({
          killmail_id: event.data.killmailId,
          killmail_time: zkbPayload.killmail_time,
          system_id: zkbPayload.solar_system_id,
          zkb_payload: JSON.stringify(zkbPayload),
          zkb_hash: event.data.zkbHash,
          zkb_total_value: zkbPayload.zkb?.totalValue,
          zkb_points: zkbPayload.zkb?.points,
          enrichment_duration_ms: Date.now() - startTime,
          esi_cache_hits: cacheHits,
          esi_cache_misses: cacheMisses,
          source: event.data.source
        })
        .execute();

      // 6. Publish enriched event
      await this.publishEnrichedEvent(zkbPayload, names, event.data.source);

      logger.info(
        {
          killmailId: event.data.killmailId,
          duration: Date.now() - startTime,
          cacheHitRate: cacheHits / (cacheHits + cacheMisses)
        },
        'Killmail enriched successfully'
      );
    } catch (error) {
      logger.error({ error, killmailId: event.data.killmailId }, 'Enrichment failed');
      await this.handleEnrichmentFailure(event.data.killmailId, error);
      throw error;
    }
  }

  private async fetchKillmailFromZkb(killmailId: number, hash: string): Promise<any> {
    const url = `https://zkillboard.com/api/killID/${killmailId}/`;
    const response = await this.fetchWithRetry(url);

    if (!response || response.length === 0) {
      throw new Error(`Killmail not found: ${killmailId}`);
    }

    return response[0];
  }

  private extractEntityIds(zkbPayload: any): EntityIdMap {
    const ids: EntityIdMap = {
      characters: new Set<number>(),
      corporations: new Set<number>(),
      alliances: new Set<number>(),
      ships: new Set<number>(),
      systems: new Set<number>()
    };

    // Victim
    if (zkbPayload.victim.character_id) ids.characters.add(zkbPayload.victim.character_id);
    if (zkbPayload.victim.corporation_id) ids.corporations.add(zkbPayload.victim.corporation_id);
    if (zkbPayload.victim.alliance_id) ids.alliances.add(zkbPayload.victim.alliance_id);
    if (zkbPayload.victim.ship_type_id) ids.ships.add(zkbPayload.victim.ship_type_id);

    // Attackers
    for (const attacker of zkbPayload.attackers) {
      if (attacker.character_id) ids.characters.add(attacker.character_id);
      if (attacker.corporation_id) ids.corporations.add(attacker.corporation_id);
      if (attacker.alliance_id) ids.alliances.add(attacker.alliance_id);
      if (attacker.ship_type_id) ids.ships.add(attacker.ship_type_id);
      if (attacker.weapon_type_id) ids.ships.add(attacker.weapon_type_id);
    }

    // System
    ids.systems.add(zkbPayload.solar_system_id);

    return ids;
  }

  private async resolveEntityNames(entityIds: EntityIdMap): Promise<ResolvedNames> {
    let cacheHits = 0;
    let cacheMisses = 0;
    const names: Record<string, string> = {};

    // Process each entity type
    for (const [type, ids] of Object.entries(entityIds)) {
      for (const id of ids) {
        const cacheKey = `${type}:${id}`;

        // Check cache first
        const cached = await this.getCachedEntity(cacheKey);

        if (cached && cached.expires_at > new Date()) {
          names[cacheKey] = cached.entity_name;
          cacheHits++;

          // Update hit count
          await this.db
            .updateTable('esi_cache')
            .set({
              hit_count: sql`hit_count + 1`,
              last_hit_at: new Date()
            })
            .where('cache_key', '=', cacheKey)
            .execute();
        } else {
          // Fetch from ESI
          const name = await this.fetchFromESI(type, id);
          names[cacheKey] = name;
          cacheMisses++;

          // Cache the result
          await this.cacheEntity(type, id, name);
        }
      }
    }

    return { names, cacheHits, cacheMisses };
  }

  private async fetchFromESI(type: string, id: number): Promise<string> {
    // ESI endpoint mapping
    const endpoints = {
      character: `/characters/${id}/`,
      corporation: `/corporations/${id}/`,
      alliance: `/alliances/${id}/`,
      ship: `/universe/types/${id}/`,
      system: `/universe/systems/${id}/`
    };

    const url = `https://esi.evetech.net/latest${endpoints[type]}`;
    const response = await this.fetchWithRetry(url);

    return response.name;
  }

  private async cacheEntity(type: string, id: number, name: string): Promise<void> {
    const ttls = {
      character: 7 * 24 * 60 * 60, // 7 days
      corporation: 7 * 24 * 60 * 60, // 7 days
      alliance: 7 * 24 * 60 * 60, // 7 days
      ship: 30 * 24 * 60 * 60, // 30 days (static data)
      system: 30 * 24 * 60 * 60 // 30 days (static data)
    };

    const expiresAt = new Date(Date.now() + (ttls[type] * 1000));

    await this.db
      .insertInto('esi_cache')
      .values({
        cache_key: `${type}:${id}`,
        entity_type: type,
        entity_id: id,
        entity_name: name,
        expires_at: expiresAt
      })
      .onConflict((oc) => oc
        .column('cache_key')
        .doUpdateSet({
          entity_name: name,
          expires_at: expiresAt,
          cached_at: new Date()
        })
      )
      .execute();
  }
}
```

---

## Operational Considerations

### Performance Targets

- **Throughput**: 100-200 killmails/second
- **Average Processing Time**: <500ms per killmail
- **ESI Cache Hit Rate**: >85%
- **Queue Lag**: <30 seconds under normal load

### Resource Requirements

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 200m | 1000m |
| Memory | 256Mi | 1Gi |
| Storage | N/A | N/A (database separate) |

### Scaling

- **Horizontal**: 2-4 replicas
- **Consumer Groups**: Use Kafka consumer groups for load distribution
- **Partitioning**: Kafka topic partitioned by killmail ID

---

## Monitoring & Alerting

### Metrics

- `enrichment_killmails_processed_total{status}` - Total processed (success/failure)
- `enrichment_processing_duration_seconds` - Processing time histogram
- `enrichment_queue_depth` - Current queue depth
- `enrichment_esi_requests_total{result}` - ESI requests (cache_hit/cache_miss/error)
- `enrichment_esi_cache_hit_rate` - ESI cache hit rate
- `enrichment_zkb_requests_total{status}` - zKillboard requests
- `enrichment_kafka_lag_seconds` - Consumer lag

### Alerts

- **High Queue Lag**: Lag > 60 seconds for 5 minutes
- **Low ESI Cache Hit Rate**: <70% for 10 minutes
- **Processing Failures**: >5% failure rate
- **ESI API Errors**: >10 errors/minute

---

## Testing Strategy

### Unit Tests
- ESI client with mocked responses
- Entity ID extraction
- Name resolution with cache
- Event publishing
- Idempotency handling

### Integration Tests
- Full enrichment flow with test database
- Kafka event consumption and publishing
- ESI cache behavior
- Retry logic

### End-to-End Tests
- Consume real killmail.ingested events
- Verify enriched data accuracy
- Confirm downstream services receive events

---

## Dependencies

**External Services**:
- zKillboard API
- EVE ESI API

**Internal Services**:
- PostgreSQL (enrichment_db)
- Kafka/Redpanda
- Redis (optional for distributed caching)

**Libraries**:
- Fastify (HTTP server)
- Kysely (Database)
- KafkaJS (Event streaming)
- Zod (Validation)

---

## References

- [EVE ESI API Documentation](https://esi.evetech.net/)
- [zKillboard API](https://github.com/zKillboard/zKillboard/wiki/API-(Killmails))
- [Domain Boundaries](../DOMAIN-BOUNDARIES.md#domain-2-enrichment)
- [Data Retention Policy](../../docs/features/data-retention-policy.md)
