# Battle Reports Feature Specification

**Feature Key**: `battle-reports`
**Feature Name**: Battle Reports
**Last Updated**: 2025-11-07

---

## 1. Overview

**Battle Reports** is a feature that collects killmails from zKillboard, clusters them into coherent battle events, and presents reconstructed battle reports showing participants, killmails, and battle outcomes.

### Purpose

Provide users with comprehensive battle reconstructions that group related killmails by:
- Temporal proximity (kills happening close together in time)
- Spatial proximity (kills in the same solar system)
- Participant overlap (shared attackers/victims across kills)

### Key Value Proposition

- **Reference-First Storage**: Store only essential metadata and external killmail references (not full payloads)
- **Battle Reconstruction**: Automatically identify related killmails and group them into battle entities
- **Queryable Metadata**: Enable filtering by space type, time, entities (alliances, corporations, characters)
- **Transparent**: All records reference canonical zKillboard links for verification

---

## 2. Feature Concepts

| Concept | Description |
|---------|-------------|
| **Killmail Reference** | Minimal object containing killmail ID, timestamp, systemId, and zKillboard link |
| **Battle** | Logical grouping of killmail references determined by clustering algorithm (time, system, participants) |
| **Battle Participant** | Any character appearing in one or more killmails within the battle |
| **Side** | Distinct group within a battle (based on attacker/victim overlap and alliance correlation) |
| **Space Type** | K-space (known), J-space (wormhole), or Poch-space (Triglavian) |
| **Source Link** | Permanent zKillboard "related kills" URL for the battle |

---

## 3. Data Flow

### 3.1 Ingestion Pipeline

1. **Killmail Feed**
   - Subscribe to zKillboard RedisQ feed or bulk API dumps
   - Apply ruleset filters before storage (minimum pilots, alliances, corporations, systems, security types)
   - Store minimal killmail metadata:
     ```json
     {
       "killmail_id": 12345678,
       "system_id": 31000090,
       "timestamp": "2025-11-03T18:04:00Z",
       "victim_alliance_id": 99001234,
       "attackers_alliances": [99004567, 99002345],
       "zkb_url": "https://zkillboard.com/kill/12345678/"
     }
     ```
   - Deduplicate based on `killmail_id`
   - Queue accepted killmails for enrichment

2. **Enrichment Worker**
   - Processes all queued killmails (no additional filtering)
   - Fetches full killmail payload from zKillboard API
   - Stores detailed participant data (ship types, character IDs, etc.)
   - Updates enrichment status: `pending` → `processing` → `succeeded`/`failed`

3. **Clustering Engine**
   - Runs on sliding time windows (30 min) per system
   - Uses overlap in attacker/victim alliances/corporations to link kills
   - Groups kills meeting thresholds (≥2 kills, ≤15 min gap, same system)

4. **Battle Construction**
   - Assign unique `battle_id`
   - Derive:
     - Start/end time from earliest/latest kill
     - Total kill count
     - Distinct alliances/corps/characters per side
     - ISK destroyed (sum of zkb.totalValue)
     - Space type (based on system ID)
   - Generate zKillboard related URL:
     ```
     https://zkillboard.com/related/{system_id}/{timestamp}/
     ```

---

## 4. Data Model

### 4.1 Tables

#### battles
```sql
CREATE TABLE battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id bigint NOT NULL,
  space_type text NOT NULL CHECK (space_type IN ('kspace', 'jspace', 'pochven')),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  total_kills int NOT NULL,
  total_isk_destroyed bigint NOT NULL,
  zkill_related_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_battles_space_type ON battles(space_type);
CREATE INDEX idx_battles_start_time ON battles(start_time DESC);
CREATE INDEX idx_battles_system_id ON battles(system_id);
```

#### battle_killmails
```sql
CREATE TABLE battle_killmails (
  battle_id uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  killmail_id bigint NOT NULL,
  zkb_url text NOT NULL,
  timestamp timestamptz NOT NULL,
  system_id bigint NOT NULL,
  victim_alliance_id bigint,
  victim_corp_id bigint,
  victim_character_id bigint,
  attacker_alliance_ids bigint[] NOT NULL DEFAULT '{}',
  attacker_corp_ids bigint[] NOT NULL DEFAULT '{}',
  attacker_character_ids bigint[] NOT NULL DEFAULT '{}',
  isk_value bigint NOT NULL,
  side_id smallint,
  PRIMARY KEY (battle_id, killmail_id)
);

CREATE INDEX idx_battle_killmails_killmail_id ON battle_killmails(killmail_id);
CREATE INDEX idx_battle_killmails_timestamp ON battle_killmails(timestamp DESC);
```

#### battle_participants
```sql
CREATE TABLE battle_participants (
  battle_id uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  character_id bigint NOT NULL,
  corp_id bigint,
  alliance_id bigint,
  ship_type_id bigint,
  side_id smallint,
  is_victim boolean NOT NULL DEFAULT false,
  PRIMARY KEY (battle_id, character_id, ship_type_id)
);

CREATE INDEX idx_battle_participants_character_id ON battle_participants(character_id);
CREATE INDEX idx_battle_participants_alliance_id ON battle_participants(alliance_id);
CREATE INDEX idx_battle_participants_corp_id ON battle_participants(corp_id);
```

---

## 5. API Endpoints

All endpoints require `battle-reports` feature access (minimum role: `user`).

### 5.1 List Battles

```
GET /battles?space_type={type}&limit={n}&cursor={cursor}
```

**Authorization**: `feature.view` action on `battle-reports`

**Query Parameters**:
- `space_type`: Filter by `kspace`, `jspace`, or `pochven` (optional, multi-value)
- `alliance_id`: Filter by alliance participation (optional)
- `corp_id`: Filter by corporation participation (optional)
- `character_id`: Filter by character participation (optional)
- `system_id`: Filter by solar system (optional)
- `start_time_after`: ISO 8601 timestamp (optional)
- `start_time_before`: ISO 8601 timestamp (optional)
- `limit`: Number of results (default 20, max 100)
- `cursor`: Pagination cursor (optional)

**Response**:
```json
{
  "items": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "systemId": "31000123",
      "systemName": "J115422",
      "spaceType": "jspace",
      "startTime": "2025-11-03T18:42:00Z",
      "endTime": "2025-11-03T19:05:00Z",
      "duration": 1380,
      "totalKills": 14,
      "totalIskDestroyed": "3600000000",
      "zkillRelatedUrl": "https://zkillboard.com/related/31000123/202511031842/"
    }
  ],
  "nextCursor": "abc123",
  "hasMore": true
}
```

---

### 5.2 Get Battle Details

```
GET /battles/{id}
```

**Authorization**: `feature.view` action on `battle-reports`

**Response**:
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "systemId": "31000123",
  "systemName": "J115422",
  "spaceType": "jspace",
  "startTime": "2025-11-03T18:42:00Z",
  "endTime": "2025-11-03T19:05:00Z",
  "duration": 1380,
  "totalKills": 14,
  "totalIskDestroyed": "3600000000",
  "zkillRelatedUrl": "https://zkillboard.com/related/31000123/202511031842/",
  "killmails": [
    {
      "killmailId": "12457890",
      "zkbUrl": "https://zkillboard.com/kill/12457890/",
      "timestamp": "2025-11-03T18:43:00Z",
      "victimAllianceId": "99001234",
      "victimAllianceName": "Pandemic Legion",
      "victimCorpId": "98001234",
      "victimCorpName": "Sniggerdly",
      "victimCharacterId": "90012345",
      "victimCharacterName": "John Doe",
      "attackerAllianceIds": ["99005678"],
      "attackerAllianceNames": ["Goonswarm Federation"],
      "iskValue": "380000000"
    }
  ],
  "participants": [
    {
      "characterId": "90012345",
      "characterName": "John Doe",
      "allianceId": "99001234",
      "allianceName": "Pandemic Legion",
      "corpId": "98001234",
      "corpName": "Sniggerdly",
      "shipTypeId": "11567",
      "shipTypeName": "Loki",
      "sideId": 1,
      "isVictim": true
    }
  ]
}
```

---

### 5.3 Recent Killmails Feed

```
GET /killmails/recent?space_type={type}&limit={n}
```

**Authorization**: `feature.view` action on `battle-reports`

**Query Parameters**:
- `space_type`: Filter by space type (optional, multi-value)
- `limit`: Number of results (default 50, max 100)

**Response**:
```json
{
  "items": [
    {
      "killmailId": "12457890",
      "systemId": "31000123",
      "systemName": "J115422",
      "timestamp": "2025-11-03T18:43:00Z",
      "spaceType": "jspace",
      "victimAllianceId": "99001234",
      "victimAllianceName": "Pandemic Legion",
      "victimCorpId": "98001234",
      "victimCorpName": "Sniggerdly",
      "iskValue": "380000000",
      "zkbUrl": "https://zkillboard.com/kill/12457890/",
      "battleId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "participantCount": 15
    }
  ],
  "count": 50
}
```

---

### 5.4 Killmails Stream (SSE)

```
GET /killmails/stream?space_type={type}
```

**Authorization**: `feature.view` action on `battle-reports`

**Protocol**: Server-Sent Events (`text/event-stream`)

**Event Format**:
```
event: killmail
data: {"killmailId":"12457890","systemId":"31000123","spaceType":"jspace",...}

event: heartbeat
data: {"timestamp":"2025-11-03T19:05:00Z"}
```

---

## 6. UI Components

### 6.1 Battles Page

**Route**: `/battles`

**Access**: Requires `battle-reports` feature access (user role minimum)

**Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Battle Reports                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [Filters: Space Type ▼] [Time Range ▼] [Alliance Search]       │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ J115422 • Wormhole      18:42 - 19:05 UTC (23 min)       │  │
│ │ 14 kills • 3.6B ISK destroyed                             │  │
│ │ Pandemic Legion vs Goonswarm Federation                   │  │
│ │                                   [View Battle Report →]  │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ M-OEE8 • Null-sec       14:30 - 15:45 UTC (1h 15min)     │  │
│ │ 87 kills • 42.3B ISK destroyed                            │  │
│ │ Test Alliance vs Brave Collective                         │  │
│ │                                   [View Battle Report →]  │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Features**:
- Filter by space type, time range, entities
- Battle summary cards with key metrics
- Click to view detailed battle report
- Pagination with infinite scroll

---

### 6.2 Battle Detail Page

**Route**: `/battles/{id}`

**Access**: Requires `battle-reports` feature access (user role minimum)

**Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Battle Report: J115422 • November 3, 2025 18:42 UTC            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Overview                                                        │
│ • System: J115422 (Wormhole)                                    │
│ • Duration: 23 minutes (18:42 - 19:05 UTC)                     │
│ • Participants: 28 pilots                                       │
│ • Total Kills: 14                                               │
│ • ISK Destroyed: 3.6 billion                                    │
│                                                                 │
│ [View on zKillboard →]                                          │
│                                                                 │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ Participants (Side 1)                   15 pilots               │
│ • Pandemic Legion                       12 pilots               │
│ • Sniggwaffe                            3 pilots                │
│                                                                 │
│ Participants (Side 2)                   13 pilots               │
│ • Goonswarm Federation                  13 pilots               │
│                                                                 │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ Killmails (14)                                                  │
│                                                                 │
│ 18:43 UTC  [Loki]  John Doe (PL) killed by Jane Smith (CONDI)  │
│            380M ISK  [View on zKillboard →]                     │
│                                                                 │
│ 18:45 UTC  [Proteus]  Bob Smith (PL) killed by ...             │
│            520M ISK  [View on zKillboard →]                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6.3 Recent Kills Page

**Route**: `/killmails`

**Access**: Requires `battle-reports` feature access (user role minimum)

**Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Recent Killmails                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [All Space ▼] [K-Space] [J-Space] [Pochven]                    │
│                                                                 │
│ 🔴 LIVE  •  Auto-updating                                       │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 19:05  J115422  [Loki] John Doe (PL)                      │  │
│ │        380M ISK  •  15 involved                            │  │
│ │        [View Killmail →] [View Battle →]                   │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 19:03  M-OEE8  [Sabre] Jane Smith (TEST)                  │  │
│ │        45M ISK  •  8 involved                              │  │
│ │        [View Killmail →] [View Battle →]                   │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Features**:
- Real-time updates via SSE (Server-Sent Events)
- Filter by space type
- Live indicator showing stream status
- Links to individual killmails and associated battles

---

## 7. Permission-Based UI Behavior

When a user does NOT have access to the `battle-reports` feature:

- **Header Navigation**: "Battles" and "Recent Kills" links are hidden
- **Home Page**: Battle statistics section is hidden
- **Alliance/Corp/Character Pages**: Battle-related sections are hidden (see Battle Intel spec for what remains visible)
- **Direct URL Access**: Redirect to home page with message: "Battle Reports feature requires authentication"

When a user HAS access to `battle-reports`:

- All battle-related UI components are visible
- Battle links are clickable
- Recent killmails feed is accessible
- Battle detail pages are viewable

---

## 8. Package Structure

### Backend Package

**Location**: `backend/battle-reports/`

**Structure**:
```
backend/battle-reports/
├── src/
│   ├── clustering/          # Battle clustering algorithm
│   │   ├── clusterer.ts
│   │   └── battle-builder.ts
│   ├── repositories/        # Data access layer
│   │   ├── battle-repository.ts
│   │   └── killmail-repository.ts
│   ├── services/            # Business logic
│   │   ├── battle-service.ts
│   │   └── killmail-service.ts
│   └── index.ts
├── test/
│   ├── clustering/
│   └── services/
└── package.json
```

**Dependencies**:
- `@battlescope/database` (shared)
- `@battlescope/shared` (types)
- Kysely query builder
- Zod for validation

**Exports**:
```typescript
export { BattleRepository } from './repositories/battle-repository.js';
export { KillmailRepository } from './repositories/killmail-repository.js';
export { BattleService } from './services/battle-service.js';
export { Clusterer } from './clustering/clusterer.js';
```

---

### API Integration

Battle Reports routes are registered in the API service:

```typescript
// backend/api/src/server.ts
import { registerBattleReportsRoutes } from './routes/battle-reports.js';

registerBattleReportsRoutes(
  app,
  battleRepository,
  killmailRepository,
  nameEnricher,
);
```

All routes use feature-scoped authorization middleware:

```typescript
app.get('/battles', {
  preHandler: [authMiddleware, requireFeatureRole('battle-reports', 'user')],
  handler: async (request, reply) => { /* ... */ },
});
```

---

## 9. Success Metrics

- **Data Efficiency**: Average battle storage < 10 KB
- **Clustering Accuracy**: >95% of related kills grouped correctly
- **API Performance**: Battle list query < 200ms (p95)
- **Stream Reliability**: <1% message loss on killmail stream
- **User Engagement**: Average battle detail page views per user per day

---

## 10. Future Enhancements

- [ ] Battle notifications (Discord/Slack integration)
- [ ] Battle tagging/categorization by users
- [ ] Doctrine detection (fleet composition analysis)
- [ ] Battle timeline visualization
- [ ] Export battles to CSV/JSON
- [ ] Battle comparison tool (compare multiple battles)
- [ ] Historical battle search with advanced filters
