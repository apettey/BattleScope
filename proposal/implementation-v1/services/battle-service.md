# Battle Service Specification

**Domain**: Combat encounter aggregation and lifecycle management
**Version**: 1.0
**Date**: 2025-11-25

---

## Overview

The Battle Service is responsible for clustering related killmails into battle aggregates, managing battle lifecycle, computing statistics, and exposing battle query APIs.

---

## Responsibilities

### Core Responsibilities

✅ **Battle Clustering**:
- Consume `killmail.enriched` events from Kafka
- Run clustering algorithm (temporal + spatial proximity, participant overlap)
- Create new battles or add killmails to existing battles
- Assign participants to sides (Team A vs Team B)
- Calculate battle start/end times dynamically

✅ **Battle Statistics**:
- Compute ISK destroyed per side
- Track pilot counts and ship types
- Calculate battle duration
- Determine battle outcome (if clear winner)
- Track top killers and top losers

✅ **Battle Re-clustering**:
- Consume `battle.recluster` events from Kafka
- Re-run clustering algorithm for specified date ranges
- Update existing battles with new killmails
- Create new battles if warranted
- Remove invalid battles
- Publish updated battle events

✅ **Data Retention**:
- Consume `data.retention_cleanup` events
- Delete battles older than 60 months
- Cascade delete participants and statistics
- Publish deletion events for downstream services

✅ **Battle Query API**:
- Expose RESTful API for battle retrieval
- Support filtering (date range, system, alliance, min ISK)
- Pagination and sorting
- Detailed battle views with participants

✅ **Health & Monitoring**:
- Track clustering performance
- Monitor battle creation rate
- Expose health check endpoints

### NOT Responsible For

❌ Ingesting raw killmails (Ingestion domain)
❌ Enriching killmails (Enrichment domain)
❌ Full-text search (Search domain)
❌ Real-time notifications (Notification domain)

---

## Database Schema

### Database: `battles_db` (PostgreSQL)

#### Table: `battles`

Core battle aggregate.

```sql
CREATE TABLE battles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Temporal
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_seconds INT GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (ended_at - started_at))) STORED,

  -- Spatial
  primary_system_id BIGINT NOT NULL,
  primary_system_name TEXT NOT NULL,
  primary_region_id BIGINT NOT NULL,
  primary_region_name TEXT NOT NULL,

  -- Statistics
  total_killmails INT DEFAULT 0,
  total_pilots INT DEFAULT 0,
  total_isk_destroyed BIGINT DEFAULT 0,

  team_a_pilots INT DEFAULT 0,
  team_a_isk_destroyed BIGINT DEFAULT 0,
  team_a_isk_lost BIGINT DEFAULT 0,
  team_a_ships_destroyed INT DEFAULT 0,
  team_a_ships_lost INT DEFAULT 0,

  team_b_pilots INT DEFAULT 0,
  team_b_isk_destroyed BIGINT DEFAULT 0,
  team_b_isk_lost BIGINT DEFAULT 0,
  team_b_ships_destroyed INT DEFAULT 0,
  team_b_ships_lost INT DEFAULT 0,

  -- Outcome
  is_decisive BOOLEAN DEFAULT FALSE,
  winning_team TEXT, -- 'team_a', 'team_b', NULL if indecisive

  -- Metadata
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'closed', 'historical'
  last_killmail_at TIMESTAMPTZ,

  -- Retention
  deleted_at TIMESTAMPTZ,
  deletion_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_battles_started_at ON battles(started_at DESC);
CREATE INDEX idx_battles_ended_at ON battles(ended_at DESC);
CREATE INDEX idx_battles_system ON battles(primary_system_id);
CREATE INDEX idx_battles_region ON battles(primary_region_id);
CREATE INDEX idx_battles_isk_destroyed ON battles(total_isk_destroyed DESC);
CREATE INDEX idx_battles_status ON battles(status);
CREATE INDEX idx_battles_deleted_at ON battles(deleted_at) WHERE deleted_at IS NOT NULL;

-- Composite index for common queries
CREATE INDEX idx_battles_date_system ON battles(started_at DESC, primary_system_id);
```

#### Table: `battle_participants`

Characters involved in a battle.

```sql
CREATE TABLE battle_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,

  -- Entity IDs
  character_id BIGINT NOT NULL,
  character_name TEXT NOT NULL,
  corporation_id BIGINT,
  corporation_name TEXT,
  alliance_id BIGINT,
  alliance_name TEXT,

  -- Participation
  team TEXT NOT NULL, -- 'team_a', 'team_b'
  ships_flown JSONB DEFAULT '[]', -- Array of ship type IDs
  kills INT DEFAULT 0,
  deaths INT DEFAULT 0,
  damage_done BIGINT DEFAULT 0,
  damage_received BIGINT DEFAULT 0,
  isk_destroyed BIGINT DEFAULT 0,
  isk_lost BIGINT DEFAULT 0,

  -- Timestamps
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_battle_character UNIQUE (battle_id, character_id)
);

CREATE INDEX idx_battle_participants_battle ON battle_participants(battle_id);
CREATE INDEX idx_battle_participants_character ON battle_participants(character_id);
CREATE INDEX idx_battle_participants_alliance ON battle_participants(alliance_id);
CREATE INDEX idx_battle_participants_team ON battle_participants(battle_id, team);
```

#### Table: `battle_killmails`

Killmails that are part of a battle.

```sql
CREATE TABLE battle_killmails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  killmail_id BIGINT NOT NULL,
  killmail_time TIMESTAMPTZ NOT NULL,

  -- Location
  system_id BIGINT NOT NULL,

  -- Victim
  victim_character_id BIGINT,
  victim_alliance_id BIGINT,
  victim_ship_type_id BIGINT,
  victim_team TEXT NOT NULL, -- 'team_a', 'team_b'

  -- Value
  isk_destroyed BIGINT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_battle_killmail UNIQUE (battle_id, killmail_id)
);

CREATE INDEX idx_battle_killmails_battle ON battle_killmails(battle_id);
CREATE INDEX idx_battle_killmails_killmail ON battle_killmails(killmail_id);
CREATE INDEX idx_battle_killmails_time ON battle_killmails(battle_id, killmail_time);
```

#### Table: `battle_statistics`

Pre-computed statistics for fast queries.

```sql
CREATE TABLE battle_statistics (
  battle_id UUID PRIMARY KEY REFERENCES battles(id) ON DELETE CASCADE,

  -- Top combatants
  top_killers JSONB DEFAULT '[]', -- [{characterId, name, kills, iskDestroyed}]
  top_losers JSONB DEFAULT '[]', -- [{characterId, name, deaths, iskLost}]

  -- Ship types involved
  team_a_ship_types JSONB DEFAULT '{}', -- {shipTypeId: count}
  team_b_ship_types JSONB DEFAULT '{}',

  -- Alliance participation
  team_a_alliances JSONB DEFAULT '[]', -- [{allianceId, name, pilots, iskDestroyed, iskLost}]
  team_b_alliances JSONB DEFAULT '[]',

  -- Temporal distribution
  killmail_timeline JSONB DEFAULT '[]', -- [{timestamp, killmailId, victimTeam, iskDestroyed}]

  -- Spatial
  systems_involved JSONB DEFAULT '[]', -- [{systemId, name, killmails}]

  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Table: `clustering_jobs`

Tracks re-clustering jobs.

```sql
CREATE TABLE clustering_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL, -- 'initial_clustering', 'reclustering', 'retention_cleanup'

  -- Date range
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Status
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  priority TEXT NOT NULL DEFAULT 'normal', -- 'low', 'normal', 'high'

  -- Metrics
  killmails_processed INT DEFAULT 0,
  battles_created INT DEFAULT 0,
  battles_updated INT DEFAULT 0,
  battles_deleted INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Error handling
  error_message TEXT,
  retry_count INT DEFAULT 0
);

CREATE INDEX idx_clustering_jobs_status ON clustering_jobs(status);
CREATE INDEX idx_clustering_jobs_dates ON clustering_jobs(start_date, end_date);
```

---

## API Endpoints

### Health & Status

#### GET /api/battles/health
Kubernetes health check.

**Response**:
```json
{
  "status": "healthy",
  "lastProcessed": "2025-11-25T10:00:00Z",
  "activeBattles": 15,
  "processingRate": 45.5
}
```

#### GET /api/battles/stats
Service statistics.

**Response**:
```json
{
  "totalBattles": 125456,
  "activeBattles": 15,
  "last24Hours": {
    "battlesCreated": 234,
    "battlesUpdated": 456,
    "killmailsProcessed": 15234,
    "avgClusteringTime": 125
  }
}
```

### Battle Queries

#### GET /api/battles
List battles with filtering and pagination.

**Query Parameters**:
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date
- `systemId` (optional): Solar system ID
- `regionId` (optional): Region ID
- `allianceId` (optional): Alliance ID filter
- `minIsk` (optional): Minimum ISK destroyed
- `minPilots` (optional): Minimum pilot count
- `status` (optional): 'open', 'closed', 'historical'
- `sort` (optional): 'started_at', 'isk_destroyed', 'pilots' (default: '-started_at')
- `limit` (optional, default 50, max 100)
- `offset` (optional, default 0)

**Response**:
```json
{
  "battles": [
    {
      "id": "uuid",
      "startedAt": "2025-11-25T09:00:00Z",
      "endedAt": "2025-11-25T10:30:00Z",
      "duration": 5400,
      "primarySystem": {
        "id": 30000142,
        "name": "Jita"
      },
      "primaryRegion": {
        "id": 10000002,
        "name": "The Forge"
      },
      "statistics": {
        "totalKillmails": 125,
        "totalPilots": 456,
        "totalIskDestroyed": 150000000000,
        "teamA": {
          "pilots": 234,
          "iskDestroyed": 80000000000,
          "iskLost": 70000000000,
          "shipsDestroyed": 65,
          "shipsLost": 60
        },
        "teamB": {
          "pilots": 222,
          "iskDestroyed": 70000000000,
          "iskLost": 80000000000,
          "shipsDestroyed": 60,
          "shipsLost": 65
        }
      },
      "outcome": {
        "isDecisive": true,
        "winningTeam": "team_a"
      },
      "status": "closed"
    }
  ],
  "pagination": {
    "total": 125456,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

#### GET /api/battles/:id
Get detailed battle information.

**Response**:
```json
{
  "id": "uuid",
  "startedAt": "2025-11-25T09:00:00Z",
  "endedAt": "2025-11-25T10:30:00Z",
  "duration": 5400,
  "primarySystem": {
    "id": 30000142,
    "name": "Jita",
    "security": 1.0
  },
  "primaryRegion": {
    "id": 10000002,
    "name": "The Forge"
  },
  "statistics": {
    "totalKillmails": 125,
    "totalPilots": 456,
    "totalIskDestroyed": 150000000000,
    "teamA": {
      "pilots": 234,
      "iskDestroyed": 80000000000,
      "iskLost": 70000000000,
      "shipsDestroyed": 65,
      "shipsLost": 60,
      "topAlliances": [
        {
          "allianceId": 99001234,
          "allianceName": "Test Alliance",
          "pilots": 123,
          "iskDestroyed": 50000000000,
          "iskLost": 40000000000
        }
      ],
      "shipTypes": {
        "587": { "name": "Rifter", "count": 45 },
        "599": { "name": "Merlin", "count": 20 }
      }
    },
    "teamB": {
      "pilots": 222,
      "iskDestroyed": 70000000000,
      "iskLost": 80000000000,
      "shipsDestroyed": 60,
      "shipsLost": 65,
      "topAlliances": [
        {
          "allianceId": 99005678,
          "allianceName": "Enemy Alliance",
          "pilots": 111,
          "iskDestroyed": 40000000000,
          "iskLost": 50000000000
        }
      ],
      "shipTypes": {
        "638": { "name": "Apocalypse", "count": 35 },
        "640": { "name": "Raven", "count": 25 }
      }
    },
    "topKillers": [
      {
        "characterId": 12345678,
        "characterName": "Jane Smith",
        "team": "team_a",
        "kills": 15,
        "iskDestroyed": 5000000000
      }
    ],
    "topLosers": [
      {
        "characterId": 87654321,
        "characterName": "Bob Jones",
        "team": "team_b",
        "deaths": 3,
        "iskLost": 8000000000
      }
    ]
  },
  "outcome": {
    "isDecisive": true,
    "winningTeam": "team_a"
  },
  "status": "closed",
  "lastKillmailAt": "2025-11-25T10:28:00Z",
  "createdAt": "2025-11-25T09:05:00Z",
  "updatedAt": "2025-11-25T10:35:00Z"
}
```

#### GET /api/battles/:id/participants
Get battle participants with filtering.

**Query Parameters**:
- `team` (optional): 'team_a', 'team_b'
- `allianceId` (optional): Filter by alliance
- `sort` (optional): 'kills', 'deaths', 'isk_destroyed' (default: '-kills')
- `limit` (optional, default 50)
- `offset` (optional, default 0)

**Response**:
```json
{
  "participants": [
    {
      "characterId": 12345678,
      "characterName": "Jane Smith",
      "corporation": {
        "id": 87654321,
        "name": "Test Corp"
      },
      "alliance": {
        "id": 99001234,
        "name": "Test Alliance"
      },
      "team": "team_a",
      "shipsFlown": [
        { "shipTypeId": 587, "shipTypeName": "Rifter" },
        { "shipTypeId": 599, "shipTypeName": "Merlin" }
      ],
      "kills": 15,
      "deaths": 2,
      "damageDone": 15000000,
      "damageReceived": 5000000,
      "iskDestroyed": 5000000000,
      "iskLost": 1500000000,
      "firstSeenAt": "2025-11-25T09:05:00Z",
      "lastSeenAt": "2025-11-25T10:25:00Z"
    }
  ],
  "pagination": {
    "total": 456,
    "limit": 50,
    "offset": 0
  }
}
```

#### GET /api/battles/:id/killmails
Get killmails that are part of this battle.

**Query Parameters**:
- `team` (optional): Filter by victim team
- `sort` (optional): 'time', 'isk_destroyed' (default: 'time')
- `limit` (optional, default 50)
- `offset` (optional, default 0)

**Response**:
```json
{
  "killmails": [
    {
      "killmailId": 123456789,
      "killmailTime": "2025-11-25T09:15:00Z",
      "systemId": 30000142,
      "victimCharacterId": 95465499,
      "victimAllianceId": 99001234,
      "victimShipTypeId": 587,
      "victimTeam": "team_b",
      "iskDestroyed": 50000000
    }
  ],
  "pagination": {
    "total": 125,
    "limit": 50,
    "offset": 0
  }
}
```

### Re-clustering

#### POST /api/battles/recluster
Manually trigger re-clustering for a date range (admin only).

**Request**:
```json
{
  "startDate": "2025-11-24",
  "endDate": "2025-11-24",
  "priority": "high"
}
```

**Response** (202 Accepted):
```json
{
  "jobId": "uuid",
  "status": "pending",
  "startDate": "2025-11-24",
  "endDate": "2025-11-24",
  "priority": "high"
}
```

#### GET /api/battles/recluster/jobs/:id
Get re-clustering job status (admin only).

**Response**:
```json
{
  "jobId": "uuid",
  "status": "running",
  "startDate": "2025-11-24",
  "endDate": "2025-11-24",
  "progress": {
    "killmailsProcessed": 1250,
    "battlesCreated": 5,
    "battlesUpdated": 12,
    "battlesDeleted": 2
  },
  "startedAt": "2025-11-25T10:00:00Z"
}
```

---

## Event Consumption

### Event: `killmail.enriched`

Consumed from Kafka topic: `killmail.enriched`

**Handler Logic**:
1. Extract killmail data
2. Find candidate battles (within 1 hour time window, same region)
3. Calculate proximity scores (temporal + spatial + participant overlap)
4. If score > threshold: add to existing battle
5. Else: create new battle
6. Update battle statistics
7. Assign participant to team
8. Publish `battle.created` or `battle.updated` event

### Event: `battle.recluster`

Consumed from Kafka topic: `battle.recluster`

**Handler Logic**:
1. Extract date range from event
2. Fetch all killmails in date range
3. Delete existing battles in date range
4. Re-run clustering algorithm from scratch
5. Create new battle aggregates
6. Publish updated battle events

### Event: `data.retention_cleanup`

Consumed from Kafka topic: `data.retention`

**Handler Logic**:
1. Extract cutoff date
2. Soft delete battles older than cutoff
3. Update `deleted_at` and `deletion_reason`
4. Log deletion metrics

---

## Event Publishing

### Event: `battle.created`

Published to Kafka topic: `battle.events`

**Schema**:
```json
{
  "eventId": "uuid",
  "eventType": "battle.created",
  "timestamp": "2025-11-25T10:00:00Z",
  "source": "battle-service",
  "data": {
    "battleId": "uuid",
    "startedAt": "2025-11-25T09:00:00Z",
    "endedAt": "2025-11-25T10:30:00Z",
    "primarySystemId": "30000142",
    "primarySystemName": "Jita",
    "primaryRegionId": "10000002",
    "primaryRegionName": "The Forge",
    "totalKillmails": 125,
    "totalPilots": 456,
    "totalIskDestroyed": 150000000000,
    "status": "closed"
  }
}
```

### Event: `battle.updated`

Published to Kafka topic: `battle.events`

**Schema**: Same as `battle.created` with `eventType: "battle.updated"`

---

## Implementation Details

### Clustering Algorithm

```typescript
class BattleClusterer {
  private readonly TIME_WINDOW_SECONDS = 3600; // 1 hour
  private readonly PROXIMITY_THRESHOLD = 0.65;

  async clusterKillmail(enrichedKillmail: EnrichedKillmail): Promise<void> {
    // 1. Find candidate battles
    const candidates = await this.findCandidateBattles(enrichedKillmail);

    // 2. Calculate proximity scores
    const scores = candidates.map(battle => ({
      battle,
      score: this.calculateProximityScore(battle, enrichedKillmail)
    }));

    // 3. Find best match
    const bestMatch = scores.sort((a, b) => b.score - a.score)[0];

    if (bestMatch && bestMatch.score >= this.PROXIMITY_THRESHOLD) {
      // Add to existing battle
      await this.addKillmailToBattle(bestMatch.battle.id, enrichedKillmail);
      await this.publishBattleUpdatedEvent(bestMatch.battle.id);
    } else {
      // Create new battle
      const battleId = await this.createNewBattle(enrichedKillmail);
      await this.publishBattleCreatedEvent(battleId);
    }
  }

  private async findCandidateBattles(
    killmail: EnrichedKillmail
  ): Promise<Battle[]> {
    const timeWindowStart = new Date(
      killmail.killmailTime.getTime() - (this.TIME_WINDOW_SECONDS * 1000)
    );
    const timeWindowEnd = new Date(
      killmail.killmailTime.getTime() + (this.TIME_WINDOW_SECONDS * 1000)
    );

    return this.db
      .selectFrom('battles')
      .where('primary_region_id', '=', killmail.regionId)
      .where('started_at', '>=', timeWindowStart)
      .where('ended_at', '<=', timeWindowEnd)
      .where('status', '=', 'open')
      .selectAll()
      .execute();
  }

  private calculateProximityScore(
    battle: Battle,
    killmail: EnrichedKillmail
  ): number {
    // Temporal proximity (40% weight)
    const temporalScore = this.calculateTemporalProximity(battle, killmail);

    // Spatial proximity (30% weight)
    const spatialScore = this.calculateSpatialProximity(battle, killmail);

    // Participant overlap (30% weight)
    const participantScore = this.calculateParticipantOverlap(battle, killmail);

    return (temporalScore * 0.4) + (spatialScore * 0.3) + (participantScore * 0.3);
  }

  private calculateTemporalProximity(
    battle: Battle,
    killmail: EnrichedKillmail
  ): number {
    const killmailTime = killmail.killmailTime.getTime();
    const battleStart = battle.startedAt.getTime();
    const battleEnd = battle.endedAt.getTime();

    // Killmail within battle time range = 1.0
    if (killmailTime >= battleStart && killmailTime <= battleEnd) {
      return 1.0;
    }

    // Calculate time distance from nearest battle boundary
    const distanceFromStart = Math.abs(killmailTime - battleStart);
    const distanceFromEnd = Math.abs(killmailTime - battleEnd);
    const minDistance = Math.min(distanceFromStart, distanceFromEnd);

    // Linear decay over 1 hour
    const maxDistance = this.TIME_WINDOW_SECONDS * 1000;
    return Math.max(0, 1 - (minDistance / maxDistance));
  }

  private calculateSpatialProximity(
    battle: Battle,
    killmail: EnrichedKillmail
  ): number {
    // Same system = 1.0
    if (battle.primarySystemId === killmail.systemId) {
      return 1.0;
    }

    // Same region = 0.5
    if (battle.primaryRegionId === killmail.regionId) {
      return 0.5;
    }

    return 0.0;
  }

  private async calculateParticipantOverlap(
    battle: Battle,
    killmail: EnrichedKillmail
  ): Promise<number> {
    // Get all battle participants
    const battleParticipants = await this.db
      .selectFrom('battle_participants')
      .where('battle_id', '=', battle.id)
      .select('character_id')
      .execute();

    const battleCharacterIds = new Set(
      battleParticipants.map(p => p.character_id)
    );

    // Extract killmail participants
    const killmailCharacterIds = new Set<number>();
    if (killmail.victim.characterId) {
      killmailCharacterIds.add(killmail.victim.characterId);
    }
    killmail.attackers.forEach(attacker => {
      if (attacker.characterId) {
        killmailCharacterIds.add(attacker.characterId);
      }
    });

    // Calculate Jaccard similarity
    const intersection = new Set(
      [...killmailCharacterIds].filter(id => battleCharacterIds.has(id))
    );

    if (intersection.size === 0) {
      return 0.0;
    }

    const union = new Set([...battleCharacterIds, ...killmailCharacterIds]);
    return intersection.size / union.size;
  }

  private async assignTeam(
    battleId: string,
    characterId: number,
    allianceId: number | null
  ): Promise<'team_a' | 'team_b'> {
    // Check if character already in battle
    const existing = await this.db
      .selectFrom('battle_participants')
      .where('battle_id', '=', battleId)
      .where('character_id', '=', characterId)
      .select('team')
      .executeTakeFirst();

    if (existing) {
      return existing.team as 'team_a' | 'team_b';
    }

    // Check if alliance already assigned to a team
    if (allianceId) {
      const allianceTeam = await this.db
        .selectFrom('battle_participants')
        .where('battle_id', '=', battleId)
        .where('alliance_id', '=', allianceId)
        .select('team')
        .executeTakeFirst();

      if (allianceTeam) {
        return allianceTeam.team as 'team_a' | 'team_b';
      }
    }

    // Assign to team with fewer pilots (balancing)
    const teamCounts = await this.db
      .selectFrom('battle_participants')
      .where('battle_id', '=', battleId)
      .select('team')
      .select(sql`COUNT(*)`.as('count'))
      .groupBy('team')
      .execute();

    const teamACount = teamCounts.find(t => t.team === 'team_a')?.count || 0;
    const teamBCount = teamCounts.find(t => t.team === 'team_b')?.count || 0;

    return teamACount <= teamBCount ? 'team_a' : 'team_b';
  }
}
```

---

## Operational Considerations

### Performance Targets

- **Throughput**: 50-100 killmails/second
- **Clustering Time**: <200ms per killmail
- **Battle Query Latency**: <100ms p95

### Resource Requirements

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 250m | 1500m |
| Memory | 512Mi | 2Gi |
| Storage | N/A | N/A |

### Scaling

- **Horizontal**: 2-4 replicas
- **Consumer Groups**: Kafka consumer groups
- **Database**: Connection pooling (10-20 connections per replica)

---

## Monitoring & Alerting

### Metrics

- `battle_killmails_processed_total` - Killmails processed
- `battle_battles_created_total` - Battles created
- `battle_battles_updated_total` - Battles updated
- `battle_clustering_duration_seconds` - Clustering time
- `battle_active_battles` - Currently open battles
- `battle_kafka_lag_seconds` - Consumer lag

### Alerts

- **High Clustering Time**: >500ms p95 for 5 minutes
- **Queue Lag**: >60 seconds for 5 minutes
- **High Error Rate**: >5% failures

---

## Testing Strategy

### Unit Tests
- Clustering algorithm with various scenarios
- Team assignment logic
- Proximity score calculations
- Statistics computation

### Integration Tests
- Full clustering flow
- Battle updates
- Re-clustering
- Database transactions

### End-to-End Tests
- Real killmail processing
- Verify battle accuracy
- Multi-killmail battles

---

## Dependencies

**Internal Services**:
- PostgreSQL (battles_db)
- Kafka/Redpanda

**Libraries**:
- Fastify (HTTP server)
- Kysely (Database)
- KafkaJS (Event streaming)
- Zod (Validation)

---

## References

- [Domain Boundaries](../DOMAIN-BOUNDARIES.md#domain-3-battle)
- [Data Retention Policy](../../docs/features/data-retention-policy.md)
- [Battle Clustering Algorithm](../../docs/architecture-v3/battle-clustering-algorithm.md)
