# Search Service Specification

**Domain**: Full-text search and faceted filtering
**Version**: 1.0
**Date**: 2025-11-25

---

## Overview

The Search Service is responsible for providing fast, typo-tolerant full-text search across battles, entities, and killmails using Typesense as the search engine.

---

## Responsibilities

### Core Responsibilities

✅ **Search Indexing**:
- Consume `battle.created` and `battle.updated` events from Kafka
- Transform battle data into search-optimized documents
- Index battles in Typesense with facets
- Maintain entity search indices (alliances, corporations, characters, systems)
- Handle index updates and deletions

✅ **Search Queries**:
- Expose search API with typo tolerance
- Support faceted filtering (alliance, system, date range, ISK range)
- Ranked search results with relevance scoring
- Autocomplete for entity names
- Aggregations and statistics

✅ **Data Retention**:
- Consume `data.retention_cleanup` events
- Remove battles and entities older than 60 months from indices
- Clean up orphaned documents

✅ **Health & Monitoring**:
- Track indexing rate and search query performance
- Monitor Typesense cluster health
- Expose health check endpoints

### NOT Responsible For

❌ Creating battles (Battle domain)
❌ Storing authoritative data (only search indices)
❌ Real-time notifications (Notification domain)
❌ Business logic (delegates to domain services)

---

## Database

### Typesense Collections

#### Collection: `battles`

Search index for battles.

**Schema**:
```json
{
  "name": "battles",
  "fields": [
    {"name": "battle_id", "type": "string", "facet": false},
    {"name": "started_at", "type": "int64", "facet": false, "sort": true},
    {"name": "ended_at", "type": "int64", "facet": false},
    {"name": "duration_seconds", "type": "int32", "facet": false},

    {"name": "primary_system_id", "type": "int64", "facet": true},
    {"name": "primary_system_name", "type": "string", "facet": false},
    {"name": "primary_region_id", "type": "int64", "facet": true},
    {"name": "primary_region_name", "type": "string", "facet": false},

    {"name": "total_killmails", "type": "int32", "facet": false, "sort": true},
    {"name": "total_pilots", "type": "int32", "facet": false, "sort": true},
    {"name": "total_isk_destroyed", "type": "int64", "facet": false, "sort": true},

    {"name": "team_a_pilots", "type": "int32", "facet": false},
    {"name": "team_a_alliance_ids", "type": "int64[]", "facet": true},
    {"name": "team_a_alliance_names", "type": "string[]", "facet": false},

    {"name": "team_b_pilots", "type": "int32", "facet": false},
    {"name": "team_b_alliance_ids", "type": "int64[]", "facet": true},
    {"name": "team_b_alliance_names", "type": "string[]", "facet": false},

    {"name": "is_decisive", "type": "bool", "facet": true},
    {"name": "winning_team", "type": "string", "facet": true, "optional": true},

    {"name": "status", "type": "string", "facet": true}
  ],
  "default_sorting_field": "started_at"
}
```

#### Collection: `entities`

Autocomplete and entity search.

**Schema**:
```json
{
  "name": "entities",
  "fields": [
    {"name": "entity_id", "type": "int64", "facet": false},
    {"name": "entity_type", "type": "string", "facet": true},
    {"name": "entity_name", "type": "string", "facet": false},
    {"name": "entity_ticker", "type": "string", "facet": false, "optional": true},
    {"name": "battle_count", "type": "int32", "facet": false, "sort": true},
    {"name": "last_seen_at", "type": "int64", "facet": false, "sort": true}
  ],
  "default_sorting_field": "last_seen_at"
}
```

#### Collection: `killmails`

Killmail search (for detailed queries).

**Schema**:
```json
{
  "name": "killmails",
  "fields": [
    {"name": "killmail_id", "type": "string", "facet": false},
    {"name": "killmail_time", "type": "int64", "facet": false, "sort": true},
    {"name": "system_id", "type": "int64", "facet": true},
    {"name": "system_name", "type": "string", "facet": false},
    {"name": "region_id", "type": "int64", "facet": true},

    {"name": "victim_character_id", "type": "int64", "facet": false, "optional": true},
    {"name": "victim_character_name", "type": "string", "facet": false, "optional": true},
    {"name": "victim_alliance_id", "type": "int64", "facet": true, "optional": true},
    {"name": "victim_alliance_name", "type": "string", "facet": false, "optional": true},
    {"name": "victim_ship_type_id", "type": "int64", "facet": true},
    {"name": "victim_ship_type_name", "type": "string", "facet": false},

    {"name": "attacker_alliance_ids", "type": "int64[]", "facet": true},
    {"name": "attacker_count", "type": "int32", "facet": false},

    {"name": "isk_destroyed", "type": "int64", "facet": false, "sort": true},
    {"name": "battle_id", "type": "string", "facet": false, "optional": true}
  ],
  "default_sorting_field": "killmail_time"
}
```

---

## API Endpoints

### Health & Status

#### GET /api/search/health
Kubernetes health check.

**Response**:
```json
{
  "status": "healthy",
  "typesense": {
    "status": "healthy",
    "collections": {
      "battles": 125456,
      "entities": 45678,
      "killmails": 15234567
    }
  }
}
```

#### GET /api/search/stats
Service statistics.

**Response**:
```json
{
  "collections": {
    "battles": {
      "documents": 125456,
      "size": "2.5GB"
    },
    "entities": {
      "documents": 45678,
      "size": "150MB"
    },
    "killmails": {
      "documents": 15234567,
      "size": "45GB"
    }
  },
  "last24Hours": {
    "searchQueries": 15234,
    "avgQueryTime": 15,
    "indexingRate": 125.5
  }
}
```

### Battle Search

#### GET /api/search/battles
Search battles with full-text and faceted filtering.

**Query Parameters**:
- `q` (optional): Search query (searches system names, alliance names)
- `filter_by` (optional): Typesense filter string
  - Examples:
    - `primary_system_id:30000142`
    - `primary_region_id:10000002`
    - `team_a_alliance_ids:[99001234]`
    - `total_isk_destroyed:>100000000000`
    - `started_at:>=1700000000 && started_at:<=1700086400`
- `sort_by` (optional): Sort field and direction (default: `started_at:desc`)
  - Examples: `total_isk_destroyed:desc`, `total_pilots:desc`
- `page` (optional, default 1)
- `per_page` (optional, default 50, max 100)

**Response**:
```json
{
  "found": 1523,
  "out_of": 125456,
  "page": 1,
  "hits": [
    {
      "document": {
        "battle_id": "uuid",
        "started_at": 1700000000,
        "ended_at": 1700005400,
        "duration_seconds": 5400,
        "primary_system_id": 30000142,
        "primary_system_name": "Jita",
        "primary_region_id": 10000002,
        "primary_region_name": "The Forge",
        "total_killmails": 125,
        "total_pilots": 456,
        "total_isk_destroyed": 150000000000,
        "team_a_pilots": 234,
        "team_a_alliance_ids": [99001234],
        "team_a_alliance_names": ["Test Alliance"],
        "team_b_pilots": 222,
        "team_b_alliance_ids": [99005678],
        "team_b_alliance_names": ["Enemy Alliance"],
        "is_decisive": true,
        "winning_team": "team_a",
        "status": "closed"
      },
      "highlights": [],
      "text_match": 98765432
    }
  ],
  "facet_counts": [
    {
      "field_name": "primary_region_id",
      "counts": [
        {"value": "10000002", "count": 523},
        {"value": "10000043", "count": 345}
      ]
    },
    {
      "field_name": "team_a_alliance_ids",
      "counts": [
        {"value": "99001234", "count": 123},
        {"value": "99005678", "count": 89}
      ]
    }
  ],
  "search_time_ms": 12
}
```

#### GET /api/search/battles/autocomplete
Autocomplete for battle search.

**Query Parameters**:
- `q`: Search query prefix
- `field` (optional): Field to search (default: all)

**Response**:
```json
{
  "suggestions": [
    {
      "text": "Jita",
      "type": "system",
      "id": 30000142
    },
    {
      "text": "Test Alliance",
      "type": "alliance",
      "id": 99001234
    }
  ]
}
```

### Entity Search

#### GET /api/search/entities
Search entities (alliances, corporations, characters, systems).

**Query Parameters**:
- `q`: Search query
- `type` (optional): Filter by entity type (alliance, corporation, character, system)
- `per_page` (optional, default 20, max 50)

**Response**:
```json
{
  "found": 15,
  "hits": [
    {
      "document": {
        "entity_id": 99001234,
        "entity_type": "alliance",
        "entity_name": "Test Alliance",
        "entity_ticker": "TEST",
        "battle_count": 523,
        "last_seen_at": 1700000000
      },
      "highlights": [
        {
          "field": "entity_name",
          "matched_tokens": ["Test"],
          "snippet": "<mark>Test</mark> Alliance"
        }
      ]
    }
  ]
}
```

### Killmail Search

#### GET /api/search/killmails
Search killmails.

**Query Parameters**:
- `q` (optional): Search query
- `filter_by` (optional): Typesense filter
- `sort_by` (optional): Sort field (default: `killmail_time:desc`)
- `page` (optional, default 1)
- `per_page` (optional, default 50, max 100)

**Response**:
```json
{
  "found": 5432,
  "hits": [
    {
      "document": {
        "killmail_id": "123456789",
        "killmail_time": 1700000000,
        "system_id": 30000142,
        "system_name": "Jita",
        "region_id": 10000002,
        "victim_character_id": 95465499,
        "victim_character_name": "John Doe",
        "victim_alliance_id": 99001234,
        "victim_alliance_name": "Test Alliance",
        "victim_ship_type_id": 587,
        "victim_ship_type_name": "Rifter",
        "attacker_alliance_ids": [99005678],
        "attacker_count": 5,
        "isk_destroyed": 50000000,
        "battle_id": "uuid"
      }
    }
  ]
}
```

### Aggregations

#### GET /api/search/aggregations/top-alliances
Get top alliances by battle participation.

**Query Parameters**:
- `days` (optional, default 30): Time window in days
- `limit` (optional, default 10, max 50)

**Response**:
```json
{
  "alliances": [
    {
      "allianceId": 99001234,
      "allianceName": "Test Alliance",
      "battleCount": 523,
      "totalIskDestroyed": 5000000000000,
      "totalIskLost": 4500000000000
    }
  ]
}
```

#### GET /api/search/aggregations/top-systems
Get top systems by battle activity.

**Query Parameters**:
- `days` (optional, default 30)
- `limit` (optional, default 10, max 50)

**Response**:
```json
{
  "systems": [
    {
      "systemId": 30000142,
      "systemName": "Jita",
      "regionId": 10000002,
      "regionName": "The Forge",
      "battleCount": 234,
      "totalIskDestroyed": 2500000000000
    }
  ]
}
```

---

## Event Consumption

### Event: `battle.created`

Consumed from Kafka topic: `battle.events`

**Handler Logic**:
1. Extract battle data from event
2. Transform into Typesense document format
3. Index battle in `battles` collection
4. Update entity indices with new alliances/systems
5. Log indexing metrics

**Idempotency**: Use `battle_id` as document ID. Upsert operation.

### Event: `battle.updated`

Consumed from Kafka topic: `battle.events`

**Handler Logic**:
1. Extract updated battle data
2. Transform into Typesense document
3. Update existing document in `battles` collection (upsert)
4. Update entity statistics
5. Log update metrics

### Event: `data.retention_cleanup`

Consumed from Kafka topic: `data.retention`

**Handler Logic**:
1. Extract cutoff date from event
2. Delete battles older than cutoff from `battles` collection
3. Delete killmails older than cutoff from `killmails` collection
4. Recalculate entity statistics (remove deleted battles from counts)
5. Log deletion metrics

---

## Implementation Details

### Indexing Worker

```typescript
class SearchIndexer {
  async indexBattle(battleEvent: BattleCreatedEvent | BattleUpdatedEvent): Promise<void> {
    const document = this.transformBattleToDocument(battleEvent.data);

    try {
      await this.typesense
        .collections('battles')
        .documents()
        .upsert(document);

      logger.info({ battleId: battleEvent.data.battleId }, 'Battle indexed successfully');

      // Update entity indices
      await this.updateEntityIndices(battleEvent.data);
    } catch (error) {
      logger.error({ error, battleId: battleEvent.data.battleId }, 'Indexing failed');
      throw error;
    }
  }

  private transformBattleToDocument(battle: Battle): any {
    return {
      id: battle.battleId,
      battle_id: battle.battleId,
      started_at: Math.floor(new Date(battle.startedAt).getTime() / 1000),
      ended_at: Math.floor(new Date(battle.endedAt).getTime() / 1000),
      duration_seconds: battle.statistics.durationSeconds,

      primary_system_id: battle.primarySystem.id,
      primary_system_name: battle.primarySystem.name,
      primary_region_id: battle.primaryRegion.id,
      primary_region_name: battle.primaryRegion.name,

      total_killmails: battle.statistics.totalKillmails,
      total_pilots: battle.statistics.totalPilots,
      total_isk_destroyed: battle.statistics.totalIskDestroyed,

      team_a_pilots: battle.statistics.teamA.pilots,
      team_a_alliance_ids: battle.statistics.teamA.topAlliances.map(a => a.allianceId),
      team_a_alliance_names: battle.statistics.teamA.topAlliances.map(a => a.allianceName),

      team_b_pilots: battle.statistics.teamB.pilots,
      team_b_alliance_ids: battle.statistics.teamB.topAlliances.map(a => a.allianceId),
      team_b_alliance_names: battle.statistics.teamB.topAlliances.map(a => a.allianceName),

      is_decisive: battle.outcome.isDecisive,
      winning_team: battle.outcome.winningTeam || null,

      status: battle.status
    };
  }

  private async updateEntityIndices(battle: Battle): Promise<void> {
    // Extract unique alliances
    const alliances = new Set<number>();
    battle.statistics.teamA.topAlliances.forEach(a => alliances.add(a.allianceId));
    battle.statistics.teamB.topAlliances.forEach(a => alliances.add(a.allianceId));

    // Update alliance entities
    for (const allianceId of alliances) {
      const alliance = [...battle.statistics.teamA.topAlliances, ...battle.statistics.teamB.topAlliances]
        .find(a => a.allianceId === allianceId);

      if (alliance) {
        await this.upsertEntity({
          entity_id: alliance.allianceId,
          entity_type: 'alliance',
          entity_name: alliance.allianceName,
          entity_ticker: alliance.ticker || '',
          last_seen_at: Math.floor(new Date(battle.endedAt).getTime() / 1000)
        });
      }
    }

    // Update system entity
    await this.upsertEntity({
      entity_id: battle.primarySystem.id,
      entity_type: 'system',
      entity_name: battle.primarySystem.name,
      last_seen_at: Math.floor(new Date(battle.endedAt).getTime() / 1000)
    });
  }

  private async upsertEntity(entity: EntityDocument): Promise<void> {
    try {
      // Try to get existing document
      const existing = await this.typesense
        .collections('entities')
        .documents(String(entity.entity_id))
        .retrieve();

      // Update battle count
      const updatedEntity = {
        ...entity,
        id: String(entity.entity_id),
        battle_count: (existing.battle_count || 0) + 1
      };

      await this.typesense
        .collections('entities')
        .documents()
        .upsert(updatedEntity);
    } catch (error) {
      // Document doesn't exist, create new
      const newEntity = {
        ...entity,
        id: String(entity.entity_id),
        battle_count: 1
      };

      await this.typesense
        .collections('entities')
        .documents()
        .create(newEntity);
    }
  }
}
```

### Search Query Handler

```typescript
class SearchQueryHandler {
  async searchBattles(params: BattleSearchParams): Promise<SearchResult> {
    const searchParams: SearchParams = {
      q: params.q || '*',
      query_by: params.q ? 'primary_system_name,team_a_alliance_names,team_b_alliance_names' : '',
      filter_by: this.buildFilterString(params),
      sort_by: params.sortBy || 'started_at:desc',
      page: params.page || 1,
      per_page: Math.min(params.perPage || 50, 100),
      facet_by: 'primary_region_id,team_a_alliance_ids,team_b_alliance_ids,is_decisive,winning_team'
    };

    const result = await this.typesense
      .collections('battles')
      .documents()
      .search(searchParams);

    return this.transformSearchResult(result);
  }

  private buildFilterString(params: BattleSearchParams): string {
    const filters: string[] = [];

    if (params.systemId) {
      filters.push(`primary_system_id:${params.systemId}`);
    }

    if (params.regionId) {
      filters.push(`primary_region_id:${params.regionId}`);
    }

    if (params.allianceId) {
      filters.push(`team_a_alliance_ids:[${params.allianceId}] || team_b_alliance_ids:[${params.allianceId}]`);
    }

    if (params.minIsk) {
      filters.push(`total_isk_destroyed:>=${params.minIsk}`);
    }

    if (params.minPilots) {
      filters.push(`total_pilots:>=${params.minPilots}`);
    }

    if (params.startDate && params.endDate) {
      const start = Math.floor(new Date(params.startDate).getTime() / 1000);
      const end = Math.floor(new Date(params.endDate).getTime() / 1000);
      filters.push(`started_at:>=${start} && started_at:<=${end}`);
    }

    if (params.status) {
      filters.push(`status:${params.status}`);
    }

    return filters.join(' && ');
  }
}
```

---

## Operational Considerations

### Performance Targets

- **Search Query Latency**: <50ms p95
- **Indexing Rate**: 100+ battles/second
- **Index Update Latency**: <100ms

### Resource Requirements

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 200m | 1000m |
| Memory | 256Mi | 1Gi |
| Storage | N/A | N/A (Typesense separate) |

**Typesense Cluster**:
- 3 nodes for high availability
- 4GB RAM per node
- 50GB SSD per node

### Scaling

- **Horizontal**: 2-4 search service replicas
- **Typesense**: 3-node cluster with replication
- **Consumer Groups**: Kafka consumer groups for indexing

---

## Monitoring & Alerting

### Metrics

- `search_queries_total{endpoint}` - Total search queries
- `search_query_duration_seconds` - Query latency histogram
- `search_index_operations_total{operation,collection}` - Index operations
- `search_typesense_health` - Typesense cluster health
- `search_kafka_lag_seconds` - Consumer lag

### Alerts

- **High Query Latency**: p95 >100ms for 5 minutes
- **Typesense Cluster Unhealthy**: Any node down
- **High Indexing Lag**: >60 seconds lag
- **Search Errors**: >5% error rate

---

## Testing Strategy

### Unit Tests
- Document transformation
- Filter string building
- Entity updates
- Query parsing

### Integration Tests
- Full indexing flow
- Search queries with various filters
- Faceted search
- Autocomplete

### End-to-End Tests
- Index battles and search
- Verify search accuracy
- Facet counts correctness

---

## Dependencies

**External Services**:
- Typesense cluster

**Internal Services**:
- Kafka/Redpanda

**Libraries**:
- Fastify (HTTP server)
- Typesense JS Client
- KafkaJS (Event streaming)
- Zod (Validation)

---

## References

- [Typesense Documentation](https://typesense.org/docs/)
- [Domain Boundaries](../DOMAIN-BOUNDARIES.md#domain-4-search)
- [Data Retention Policy](../../docs/features/data-retention-policy.md)
