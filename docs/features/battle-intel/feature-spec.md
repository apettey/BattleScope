# Battle Intel Feature Specification

**Feature Key**: `battle-intel`
**Feature Name**: Battle Intel
**Last Updated**: 2025-11-22

---

## 1. Overview

**Battle Intel** is a feature that provides intelligence and statistical analysis about EVE Online combat activities, tracking who fights whom, where battles occur, what ships are used, and performance metrics for alliances, corporations, and individual characters.

### Purpose

Provide users with actionable intelligence and analytics about:

- **Who**: Alliance, corporation, and character participation patterns
- **Where**: Geographic battle distribution and favorite hunting grounds
- **What**: Ship composition, doctrine trends, and fleet sizes
- **When**: Activity patterns and peak engagement times
- **How**: Combat performance, ISK efficiency, and win/loss ratios

### Key Value Proposition

- **Aggregate Statistics**: Comprehensive metrics derived from battle data
- **Opponent Analysis**: Track who entities are fighting against most frequently
- **Ship Intelligence**: Understand fleet compositions and ship usage patterns
- **Geographic Intelligence**: Identify hotspots and operational areas
- **Performance Tracking**: ISK efficiency, kill/loss ratios, and battle outcomes

---

## 2. Feature Concepts

| Concept                | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| **Entity Statistics**  | Aggregate metrics for alliances, corporations, and characters |
| **Opponent Analysis**  | Breakdown of who an entity fights most frequently             |
| **Ship Composition**   | Distribution of ship types used by an entity                  |
| **Geographic Heatmap** | Systems where an entity is most active                        |
| **ISK Efficiency**     | Ratio of ISK destroyed vs ISK lost                            |
| **Activity Timeline**  | Historical pattern of battle participation                    |
| **Doctrine Detection** | Identification of common fleet compositions                   |
| **Pilot Ship History** | Complete record of ships flown by each pilot with kill/loss links |

---

## 3. Data Flow

### 3.1 Intelligence Processing Pipeline

1. **Battle Data Aggregation**
   - Read from `battles`, `battle_killmails`, `battle_participants` tables
   - Compute aggregate statistics per entity (alliance, corp, character)
   - Track opponent relationships (who fights whom)
   - Analyze ship type distributions

2. **Statistical Computation**
   - Total battles participated
   - Total kills and losses
   - ISK destroyed vs ISK lost
   - ISK efficiency percentage
   - Average battle size (participants)
   - Most used ships
   - Most frequent opponents
   - Favorite systems (by battles and by kills)

3. **Intelligence Caching**
   - Store computed statistics in Redis with TTL
   - Invalidate cache on new battle data
   - Background job to refresh stale statistics

### 3.2 Pilot Ship History Pipeline

1. **Ship Record Extraction**
   - During killmail enrichment, extract ship type for each participant
   - For victims: Record the ship they lost
   - For attackers: Record the ship they were flying

2. **Ship History Storage**
   - Store each ship appearance in `pilot_ship_history` table
   - Link to the specific killmail for easy navigation
   - Track whether it was a kill or loss for that pilot

3. **Query Capabilities**
   - Get all ships a pilot has ever flown
   - Filter by ship type to find all killmails where pilot flew that ship
   - Quickly find all losses for a pilot (with direct killmail links)

---

## 4. Data Model

### 4.1 Pilot Ship History Table

Battle Intel introduces the `pilot_ship_history` table to track ships flown by pilots:

```sql
CREATE TABLE pilot_ship_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  killmail_id bigint NOT NULL REFERENCES killmail_events(killmail_id),
  character_id bigint NOT NULL,
  ship_type_id bigint NOT NULL,
  alliance_id bigint,
  corp_id bigint,
  system_id bigint NOT NULL,
  is_loss boolean NOT NULL,           -- true if this pilot lost the ship
  ship_value bigint,                  -- value of the ship flown (always populated)
  killmail_value bigint,              -- total value of the killmail
  occurred_at timestamptz NOT NULL,
  zkb_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Indexes for common queries
  CONSTRAINT unique_pilot_killmail UNIQUE (killmail_id, character_id)
);

-- Index for querying all ships a character has flown
CREATE INDEX idx_pilot_ship_history_character ON pilot_ship_history(character_id);

-- Index for querying all losses for a character
CREATE INDEX idx_pilot_ship_history_character_losses ON pilot_ship_history(character_id) WHERE is_loss = true;

-- Index for querying by ship type
CREATE INDEX idx_pilot_ship_history_ship_type ON pilot_ship_history(ship_type_id);

-- Index for querying character + ship type combination
CREATE INDEX idx_pilot_ship_history_character_ship ON pilot_ship_history(character_id, ship_type_id);

-- Index for time-based queries
CREATE INDEX idx_pilot_ship_history_occurred_at ON pilot_ship_history(occurred_at DESC);
```

**Usage Examples**:

```sql
-- Get all ships a pilot has flown (aggregated with ISK values)
SELECT ship_type_id,
       COUNT(*) as times_flown,
       SUM(CASE WHEN is_loss THEN 1 ELSE 0 END) as losses,
       SUM(CASE WHEN NOT is_loss THEN 1 ELSE 0 END) as kills,
       SUM(CASE WHEN is_loss THEN ship_value ELSE 0 END) as total_isk_lost,
       SUM(CASE WHEN NOT is_loss THEN killmail_value ELSE 0 END) as total_isk_killed
FROM pilot_ship_history
WHERE character_id = 123456789
GROUP BY ship_type_id
ORDER BY times_flown DESC;

-- Get all losses for a pilot with killmail links and values
SELECT ship_type_id, zkb_url, ship_value, killmail_value, occurred_at
FROM pilot_ship_history
WHERE character_id = 123456789 AND is_loss = true
ORDER BY occurred_at DESC;

-- Get all killmails where pilot flew a specific ship
SELECT killmail_id, zkb_url, is_loss, ship_value, killmail_value, occurred_at
FROM pilot_ship_history
WHERE character_id = 123456789 AND ship_type_id = 11567
ORDER BY occurred_at DESC;

-- Get total ISK destroyed and lost for a pilot
SELECT
  SUM(CASE WHEN is_loss THEN ship_value ELSE 0 END) as total_isk_lost,
  SUM(CASE WHEN NOT is_loss THEN killmail_value ELSE 0 END) as total_isk_killed,
  COUNT(CASE WHEN is_loss THEN 1 END) as total_losses,
  COUNT(CASE WHEN NOT is_loss THEN 1 END) as total_kills
FROM pilot_ship_history
WHERE character_id = 123456789;
```

---

### 4.2 Views (Computed from Battle Reports Data)

Battle Intel also computes statistics from Battle Reports tables:

```sql
-- Example materialized view for alliance statistics
CREATE MATERIALIZED VIEW alliance_statistics AS
SELECT
  bp.alliance_id,
  COUNT(DISTINCT bp.battle_id) as total_battles,
  COUNT(DISTINCT CASE WHEN bp.is_victim THEN bp.battle_id END) as battles_with_losses,
  COUNT(DISTINCT CASE WHEN NOT bp.is_victim THEN bp.battle_id END) as battles_with_kills,
  SUM(CASE WHEN bp.is_victim THEN bk.isk_value ELSE 0 END) as total_isk_lost,
  SUM(CASE WHEN NOT bp.is_victim THEN bk.isk_value ELSE 0 END) as total_isk_destroyed
FROM battle_participants bp
JOIN battle_killmails bk ON bp.battle_id = bk.battle_id
WHERE bp.alliance_id IS NOT NULL
GROUP BY bp.alliance_id;

-- Refresh periodically
REFRESH MATERIALIZED VIEW CONCURRENTLY alliance_statistics;
```

**Alternative**: Compute on-demand with caching (no materialized views).

---

### 4.3 Cache Keys

**Redis Cache Keys**:

- `battlescope:intel:alliance:{allianceId}:stats` - Alliance statistics (TTL: 1 hour)
- `battlescope:intel:corp:{corpId}:stats` - Corporation statistics (TTL: 1 hour)
- `battlescope:intel:character:{characterId}:stats` - Character statistics (TTL: 1 hour)
- `battlescope:intel:alliance:{allianceId}:opponents` - Top opponents (TTL: 1 hour)
- `battlescope:intel:summary` - Global summary statistics (TTL: 5 minutes)
- `battlescope:intel:character:{characterId}:ships` - Character ship history summary (TTL: 30 minutes)
- `battlescope:intel:character:{characterId}:losses` - Character loss summary (TTL: 30 minutes)

---

## 5. API Endpoints

All endpoints require `battle-intel` feature access (minimum role: `user`).

### 5.1 Global Statistics Summary

```
GET /intel/summary
```

**Authorization**: `feature.view` action on `battle-intel`

**Response**:

```json
{
  "totalBattles": 1543,
  "totalKillmails": 8721,
  "uniqueAlliances": 42,
  "uniqueCorporations": 156,
  "totalIskDestroyed": "2450000000000",
  "topAlliances": [
    {
      "allianceId": "99001234",
      "allianceName": "Pandemic Legion",
      "battleCount": 87,
      "iskDestroyed": "450000000000",
      "iskLost": "320000000000"
    }
  ],
  "topCorporations": [
    {
      "corpId": "98001234",
      "corpName": "Sniggerdly",
      "battleCount": 45,
      "iskDestroyed": "230000000000"
    }
  ],
  "hotspotSystems": [
    {
      "systemId": "30002187",
      "systemName": "M-OEE8",
      "battleCount": 34,
      "killmailCount": 456
    }
  ],
  "generatedAt": "2025-11-07T14:30:00Z"
}
```

---

### 5.2 Alliance Intelligence

```
GET /intel/alliances/{id}
```

**Authorization**: `feature.view` action on `battle-intel`

**Response**:

```json
{
  "allianceId": "99001234",
  "allianceName": "Pandemic Legion",
  "ticker": "PL",
  "statistics": {
    "totalBattles": 87,
    "totalKillmails": 1245,
    "totalKills": 890,
    "totalLosses": 355,
    "totalIskDestroyed": "450000000000",
    "totalIskLost": "320000000000",
    "iskEfficiency": 58.44,
    "averageParticipants": 12.5,
    "averageBattleDuration": 1820,
    "mostActiveMembers": [
      {
        "characterId": "90012345",
        "characterName": "John Doe",
        "battleCount": 45,
        "killCount": 67
      }
    ],
    "mostUsedShips": [
      {
        "shipTypeId": "11567",
        "shipTypeName": "Loki",
        "count": 145,
        "percentage": 11.6
      },
      {
        "shipTypeId": "11987",
        "shipTypeName": "Proteus",
        "count": 98,
        "percentage": 7.9
      }
    ],
    "topOpponents": [
      {
        "allianceId": "99005678",
        "allianceName": "Goonswarm Federation",
        "battleCount": 23,
        "killsAgainst": 145,
        "lossesAgainst": 89,
        "iskDestroyedAgainst": "45000000000",
        "iskLostAgainst": "28000000000"
      }
    ],
    "topSystems": [
      {
        "systemId": "31000123",
        "systemName": "J115422",
        "spaceType": "jspace",
        "battleCount": 15,
        "killCount": 89
      }
    ],
    "activityBySpaceType": {
      "kspace": 45,
      "jspace": 32,
      "pochven": 10
    },
    "activityTimeline": {
      "daily": [
        { "date": "2025-11-01", "battles": 3, "kills": 24 },
        { "date": "2025-11-02", "battles": 5, "kills": 38 }
      ]
    }
  },
  "updatedAt": "2025-11-07T14:30:00Z"
}
```

---

### 5.3 Corporation Intelligence

```
GET /intel/corporations/{id}
```

**Authorization**: `feature.view` action on `battle-intel`

**Response**:

```json
{
  "corpId": "98001234",
  "corpName": "Sniggerdly",
  "ticker": "SNGGR",
  "allianceId": "99001234",
  "allianceName": "Pandemic Legion",
  "statistics": {
    "totalBattles": 45,
    "totalKillmails": 678,
    "totalKills": 456,
    "totalLosses": 222,
    "totalIskDestroyed": "230000000000",
    "totalIskLost": "180000000000",
    "iskEfficiency": 56.1,
    "averageParticipants": 8.2,
    "topPilots": [
      {
        "characterId": "90012345",
        "characterName": "John Doe",
        "battleCount": 32,
        "killCount": 45,
        "lossCount": 12
      }
    ],
    "mostUsedShips": [
      {
        "shipTypeId": "11567",
        "shipTypeName": "Loki",
        "count": 89,
        "percentage": 13.1
      }
    ],
    "topOpponents": [
      {
        "allianceId": "99005678",
        "allianceName": "Goonswarm Federation",
        "battleCount": 15
      }
    ],
    "topSystemsByKills": [
      {
        "systemId": "30002187",
        "systemName": "M-OEE8",
        "spaceType": "nullsec",
        "killCount": 156
      }
    ]
  },
  "updatedAt": "2025-11-07T14:30:00Z"
}
```

---

### 5.4 Character Intelligence

```
GET /intel/characters/{id}
```

**Authorization**: `feature.view` action on `battle-intel`

**Response**:

```json
{
  "characterId": "90012345",
  "characterName": "John Doe",
  "corpId": "98001234",
  "corpName": "Sniggerdly",
  "allianceId": "99001234",
  "allianceName": "Pandemic Legion",
  "statistics": {
    "totalBattles": 32,
    "totalKills": 45,
    "totalLosses": 12,
    "totalIskDestroyed": "15000000000",
    "totalIskLost": "8000000000",
    "iskEfficiency": 65.22,
    "averageBattleSize": 18.5,
    "mostUsedShips": [
      {
        "shipTypeId": "11567",
        "shipTypeName": "Loki",
        "count": 18,
        "killsIn": 23,
        "lossesIn": 3
      }
    ],
    "topOpponents": [
      {
        "allianceId": "99005678",
        "allianceName": "Goonswarm Federation",
        "battleCount": 12,
        "killsAgainst": 18,
        "lossesAgainst": 4
      }
    ],
    "favoriteSystems": [
      {
        "systemId": "31000123",
        "systemName": "J115422",
        "spaceType": "jspace",
        "battleCount": 8,
        "killCount": 12
      }
    ],
    "recentActivity": [
      {
        "date": "2025-11-06",
        "battles": 2,
        "kills": 3,
        "losses": 0
      }
    ]
  },
  "updatedAt": "2025-11-07T14:30:00Z"
}
```

---

### 5.5 Opponent Analysis

```
GET /intel/alliances/{id}/opponents?limit={n}
```

**Authorization**: `feature.view` action on `battle-intel`

**Response**:

```json
{
  "allianceId": "99001234",
  "allianceName": "Pandemic Legion",
  "opponents": [
    {
      "allianceId": "99005678",
      "allianceName": "Goonswarm Federation",
      "battleCount": 23,
      "killsAgainst": 145,
      "lossesAgainst": 89,
      "iskDestroyedAgainst": "45000000000",
      "iskLostAgainst": "28000000000",
      "winRate": 61.97,
      "lastEngagement": "2025-11-06T18:45:00Z"
    }
  ]
}
```

---

### 5.6 Ship Usage Analysis

```
GET /intel/alliances/{id}/ships?limit={n}
```

**Authorization**: `feature.view` action on `battle-intel`

**Response**:

```json
{
  "allianceId": "99001234",
  "allianceName": "Pandemic Legion",
  "ships": [
    {
      "shipTypeId": "11567",
      "shipTypeName": "Loki",
      "shipClass": "Strategic Cruiser",
      "count": 145,
      "percentage": 11.6,
      "killsInShip": 234,
      "lossesInShip": 45,
      "avgIskValue": "350000000"
    }
  ]
}
```

---

### 5.7 Character Ship History

```
GET /intel/characters/{id}/ships?limit={n}&shipTypeId={shipTypeId}
```

**Authorization**: `feature.view` action on `battle-intel`

**Query Parameters**:
- `limit` (optional): Maximum number of ship types to return (default: 20)
- `shipTypeId` (optional): Filter to a specific ship type to get detailed killmail history

**Response** (aggregated by ship type):

```json
{
  "characterId": "90012345",
  "characterName": "John Doe",
  "totalIskDestroyed": "15000000000",
  "totalIskLost": "8000000000",
  "iskEfficiency": 65.22,
  "ships": [
    {
      "shipTypeId": "11567",
      "shipTypeName": "Loki",
      "shipClass": "Strategic Cruiser",
      "timesFlown": 18,
      "kills": 15,
      "losses": 3,
      "iskDestroyed": "4500000000",
      "iskLost": "1050000000"
    },
    {
      "shipTypeId": "11987",
      "shipTypeName": "Proteus",
      "shipClass": "Strategic Cruiser",
      "timesFlown": 12,
      "kills": 10,
      "losses": 2,
      "iskDestroyed": "3200000000",
      "iskLost": "700000000"
    }
  ],
  "updatedAt": "2025-11-22T14:30:00Z"
}
```

**Response** (filtered by shipTypeId - detailed killmail list):

```json
{
  "characterId": "90012345",
  "characterName": "John Doe",
  "shipTypeId": "11567",
  "shipTypeName": "Loki",
  "shipClass": "Strategic Cruiser",
  "summary": {
    "timesFlown": 18,
    "kills": 15,
    "losses": 3,
    "iskDestroyed": "4500000000",
    "iskLost": "1050000000"
  },
  "killmails": [
    {
      "killmailId": "123456789",
      "zkbUrl": "https://zkillboard.com/kill/123456789/",
      "isLoss": false,
      "shipValue": "350000000",
      "killmailValue": "1200000000",
      "systemId": "30002187",
      "systemName": "M-OEE8",
      "occurredAt": "2025-11-20T18:45:00Z"
    },
    {
      "killmailId": "123456780",
      "zkbUrl": "https://zkillboard.com/kill/123456780/",
      "isLoss": true,
      "shipValue": "350000000",
      "killmailValue": "350000000",
      "systemId": "31000123",
      "systemName": "J115422",
      "occurredAt": "2025-11-19T12:30:00Z"
    }
  ],
  "updatedAt": "2025-11-22T14:30:00Z"
}
```

---

### 5.8 Character Losses

```
GET /intel/characters/{id}/losses?limit={n}&cursor={cursor}
```

**Authorization**: `feature.view` action on `battle-intel`

**Query Parameters**:
- `limit` (optional): Maximum number of losses to return (default: 50)
- `cursor` (optional): Pagination cursor for fetching more results

**Response**:

```json
{
  "characterId": "90012345",
  "characterName": "John Doe",
  "totalLosses": 12,
  "totalIskLost": "8000000000",
  "losses": [
    {
      "killmailId": "123456780",
      "zkbUrl": "https://zkillboard.com/kill/123456780/",
      "shipTypeId": "11567",
      "shipTypeName": "Loki",
      "shipClass": "Strategic Cruiser",
      "shipValue": "350000000",
      "systemId": "31000123",
      "systemName": "J115422",
      "occurredAt": "2025-11-19T12:30:00Z"
    },
    {
      "killmailId": "123456770",
      "zkbUrl": "https://zkillboard.com/kill/123456770/",
      "shipTypeId": "11987",
      "shipTypeName": "Proteus",
      "shipClass": "Strategic Cruiser",
      "shipValue": "320000000",
      "systemId": "30002187",
      "systemName": "M-OEE8",
      "occurredAt": "2025-11-18T20:15:00Z"
    }
  ],
  "nextCursor": "eyJvZmZzZXQiOjUwfQ==",
  "updatedAt": "2025-11-22T14:30:00Z"
}
```

---

## 6. UI Components

### 6.1 Home Dashboard (Intel Summary)

**Route**: `/` (home page)

**Access**: Requires `battle-intel` feature access (user role minimum)

**Section**: Intelligence Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Battle Intelligence                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐      │
│ │ 1,543     │ │ 8,721     │ │ 42        │ │ 156       │      │
│ │ Battles   │ │ Killmails │ │ Alliances │ │ Corps     │      │
│ └───────────┘ └───────────┘ └───────────┘ └───────────┘      │
│                                                                 │
│ Top Alliances by Activity                                       │
│ 1. Pandemic Legion        87 battles  •  [View Intel →]        │
│ 2. Goonswarm Federation   73 battles  •  [View Intel →]        │
│ 3. Test Alliance          54 battles  •  [View Intel →]        │
│                                                                 │
│ Hotspot Systems                                                 │
│ 1. M-OEE8 (Null-sec)      34 battles  •  [View Map]            │
│ 2. J115422 (Wormhole)     28 battles  •  [View Map]            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6.2 Alliance Intel Page

**Route**: `/intel/alliances/{id}`

**Access**: Requires `battle-intel` feature access (user role minimum)

**Layout**:

```
┌─────────────────────────────────────────────────────────────────┐
│ Alliance Intelligence: Pandemic Legion [PL]                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Overview                                                        │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐      │
│ │ 87        │ │ 1,245     │ │ 58.4%     │ │ 12.5      │      │
│ │ Battles   │ │ Killmails │ │ ISK Eff.  │ │ Avg Pilots│      │
│ └───────────┘ └───────────┘ └───────────┘ └───────────┘      │
│                                                                 │
│ [Battle History] (only if has battle-reports access)            │
│                                                                 │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ Top Opponents                                                   │
│ 1. Goonswarm Federation     23 battles  •  62% win rate        │
│    145 kills vs 89 losses  •  45B destroyed vs 28B lost        │
│                                                                 │
│ 2. Test Alliance            18 battles  •  55% win rate        │
│    98 kills vs 76 losses  •  28B destroyed vs 24B lost         │
│                                                                 │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ Ship Composition                                                │
│ [Bar Chart]                                                     │
│ Loki (Strategic Cruiser)     ████████████░░░░░░░░  145  11.6%  │
│ Proteus (Strategic Cruiser)  ████████░░░░░░░░░░░░   98   7.9%  │
│ Sabre (Interdictor)          ██████░░░░░░░░░░░░░░   76   6.1%  │
│                                                                 │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ Geographic Activity                                             │
│ Top Systems by Battles                                          │
│ 1. J115422 (Wormhole)    15 battles  •  89 kills              │
│ 2. M-OEE8 (Null-sec)     12 battles  •  67 kills              │
│                                                                 │
│ Activity by Space Type                                          │
│ • K-Space: 45 battles (52%)                                     │
│ • J-Space: 32 battles (37%)                                     │
│ • Pochven: 10 battles (11%)                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6.3 Corporation Intel Page

**Route**: `/intel/corporations/{id}`

**Access**: Requires `battle-intel` feature access (user role minimum)

Similar layout to Alliance Intel Page but with corp-specific metrics and top pilots section.

---

### 6.4 Character Intel Page

**Route**: `/intel/characters/{id}`

**Access**: Requires `battle-intel` feature access (user role minimum)

**Layout**:

```
┌─────────────────────────────────────────────────────────────────┐
│ Character Intelligence: John Doe                                 │
│ Sniggerdly [SNGGR] • Pandemic Legion [PL]                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Overview                                                        │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐      │
│ │ 32        │ │ 45        │ │ 12        │ │ 65.2%     │      │
│ │ Battles   │ │ Kills     │ │ Losses    │ │ ISK Eff.  │      │
│ └───────────┘ └───────────┘ └───────────┘ └───────────┘      │
│                                                                 │
│ ┌───────────┐ ┌───────────┐                                    │
│ │ 15B       │ │ 8B        │                                    │
│ │ Destroyed │ │ Lost      │                                    │
│ └───────────┘ └───────────┘                                    │
│                                                                 │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ Ships Flown                       [View All Ships →]            │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ Ship             │ Flown │ Kills │ Losses │ ISK Eff.   │   │
│ ├─────────────────────────────────────────────────────────┤   │
│ │ Loki             │  18   │  15   │   3    │  81.1%     │   │
│ │  → 4.5B destroyed • 1.05B lost              [View →]   │   │
│ ├─────────────────────────────────────────────────────────┤   │
│ │ Proteus          │  12   │  10   │   2    │  82.1%     │   │
│ │  → 3.2B destroyed • 700M lost               [View →]   │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ Recent Losses                     [View All Losses →]           │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ 2025-11-19 • Loki • J115422 • 350M     [View Kill →]   │   │
│ │ 2025-11-18 • Proteus • M-OEE8 • 320M   [View Kill →]   │   │
│ │ 2025-11-15 • Sabre • Amamake • 45M     [View Kill →]   │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ Top Opponents                                                   │
│ 1. Goonswarm Federation     12 battles  •  18 kills vs 4 losses│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6.5 Character Ship Detail Page

**Route**: `/intel/characters/{id}/ships/{shipTypeId}`

**Access**: Requires `battle-intel` feature access (user role minimum)

**Layout**:

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to John Doe                                              │
│                                                                 │
│ Loki Usage: John Doe                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Summary                                                         │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐      │
│ │ 18        │ │ 15        │ │ 3         │ │ 81.1%     │      │
│ │ Times Flown│ │ Kills     │ │ Losses    │ │ ISK Eff.  │      │
│ └───────────┘ └───────────┘ └───────────┘ └───────────┘      │
│                                                                 │
│ ┌───────────┐ ┌───────────┐                                    │
│ │ 4.5B      │ │ 1.05B     │                                    │
│ │ Destroyed │ │ Lost      │                                    │
│ └───────────┘ └───────────┘                                    │
│                                                                 │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ Killmail History                                                │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ Date       │ System   │ Result │ Value    │ Action     │   │
│ ├─────────────────────────────────────────────────────────┤   │
│ │ 2025-11-20 │ M-OEE8   │ Kill   │ 1.2B     │ [View →]   │   │
│ │ 2025-11-19 │ J115422  │ LOSS   │ 350M     │ [View →]   │   │
│ │ 2025-11-18 │ Amamake  │ Kill   │ 890M     │ [View →]   │   │
│ │ 2025-11-17 │ M-OEE8   │ Kill   │ 450M     │ [View →]   │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│ [Load More]                                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Behavior**:
- Clicking "View →" opens ZKillboard in a new tab
- Losses are highlighted (red text or background)
- Pagination via cursor-based loading

---

## 7. Permission-Based UI Behavior

### When User Does NOT Have `battle-intel` Access:

**Home Page**:

- Intelligence statistics section is hidden
- Top alliances/corps section is hidden
- Only shows basic welcome message

**Alliance/Corp/Character Pages**:

- If accessed via URL, redirect to home with message: "Battle Intel feature requires access"
- If has `battle-reports` access: Show basic entity info + battle history only
- Statistics panels are hidden
- Opponent analysis is hidden
- Ship composition is hidden
- Geographic activity is hidden

**Navigation**:

- "Intel" navigation link is hidden (if we add one)

---

### When User HAS `battle-intel` Access:

**Home Page**:

- Full intelligence dashboard visible
- Statistics cards displayed
- Top alliances/corps with "View Intel" links

**Alliance/Corp/Character Pages**:

- Full intel pages accessible
- All statistics visible
- Opponent analysis visible
- Ship composition charts visible
- Geographic heatmaps visible

**Hybrid Access (has `battle-reports` but NOT `battle-intel`)**:

```
┌─────────────────────────────────────────────────────────────────┐
│ Pandemic Legion [PL]                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Battle History                                                  │
│ [List of battles this alliance participated in]                │
│                                                                 │
│ ℹ️  Want to see intelligence statistics, opponent analysis,     │
│    and ship composition? Contact an admin for Battle Intel     │
│    feature access.                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Package Structure

### Backend Package

**Location**: `backend/battle-intel/`

**Structure**:

```
backend/battle-intel/
├── src/
│   ├── aggregators/         # Statistics computation
│   │   ├── alliance-aggregator.ts
│   │   ├── corp-aggregator.ts
│   │   └── character-aggregator.ts
│   ├── analyzers/           # Intelligence analysis
│   │   ├── opponent-analyzer.ts
│   │   ├── ship-analyzer.ts
│   │   └── geographic-analyzer.ts
│   ├── repositories/        # Data access
│   │   └── intel-repository.ts
│   ├── services/            # Business logic
│   │   └── intel-service.ts
│   └── index.ts
├── test/
│   ├── aggregators/
│   └── analyzers/
└── package.json
```

**Dependencies**:

- `@battlescope/database` (shared)
- `@battlescope/shared` (types)
- `@battlescope/battle-reports` (reads battle data)
- Kysely query builder
- ioredis (for caching)

**Exports**:

```typescript
export { IntelService } from './services/intel-service.js';
export { AllianceAggregator } from './aggregators/alliance-aggregator.js';
export { OpponentAnalyzer } from './analyzers/opponent-analyzer.js';
```

---

### API Integration

Battle Intel routes are registered in the API service:

```typescript
// backend/api/src/server.ts
import { registerBattleIntelRoutes } from './routes/battle-intel.js';

registerBattleIntelRoutes(app, intelService, nameEnricher, redis);
```

All routes use feature-scoped authorization middleware:

```typescript
app.get('/intel/alliances/:id', {
  preHandler: [authMiddleware, requireFeatureRole('battle-intel', 'user')],
  handler: async (request, reply) => {
    /* ... */
  },
});
```

---

## 9. Pilot Ship History Ingestion

### 9.1 Data Source

Pilot ship history data is extracted from enriched killmails during the battle clustering process. The enrichment service already fetches detailed killmail data from ESI, which includes:

- Victim ship type and fitted value
- All attackers with their ship types
- Total killmail ISK value (from zKillboard)

### 9.2 Ingestion Pipeline Integration

The `pilot_ship_history` table is populated by the **Clusterer Service** when processing enriched killmails:

```typescript
// backend/clusterer/src/ship-history-processor.ts
export class ShipHistoryProcessor {
  async processKillmail(
    killmailId: bigint,
    enrichedData: EnrichedKillmail,
    zkbUrl: string
  ): Promise<void> {
    const records: PilotShipHistoryRecord[] = [];

    // Add victim record (is_loss = true)
    if (enrichedData.victim.character_id) {
      records.push({
        killmailId,
        characterId: enrichedData.victim.character_id,
        shipTypeId: enrichedData.victim.ship_type_id,
        allianceId: enrichedData.victim.alliance_id,
        corpId: enrichedData.victim.corporation_id,
        systemId: enrichedData.solar_system_id,
        isLoss: true,
        shipValue: this.calculateShipValue(enrichedData.victim),
        killmailValue: enrichedData.zkb?.totalValue,
        occurredAt: enrichedData.killmail_time,
        zkbUrl,
      });
    }

    // Add attacker records (is_loss = false)
    for (const attacker of enrichedData.attackers) {
      if (attacker.character_id && attacker.ship_type_id) {
        records.push({
          killmailId,
          characterId: attacker.character_id,
          shipTypeId: attacker.ship_type_id,
          allianceId: attacker.alliance_id,
          corpId: attacker.corporation_id,
          systemId: enrichedData.solar_system_id,
          isLoss: false,
          shipValue: null, // Attacker ship value not available from killmail
          killmailValue: enrichedData.zkb?.totalValue,
          occurredAt: enrichedData.killmail_time,
          zkbUrl,
        });
      }
    }

    // Batch insert with ON CONFLICT DO NOTHING
    await this.repository.insertShipHistory(records);
  }
}
```

### 9.3 Data Re-ingestion (Reset)

To populate ship history for existing killmails, a reset mechanism is provided:

#### Admin API Endpoint

```
POST /admin/intel/reset-ship-history
```

**Authorization**: SuperAdmin only

**Request Body**:

```json
{
  "mode": "full" | "incremental",
  "fromDate": "2025-01-01T00:00:00Z",  // optional, for incremental
  "batchSize": 1000                     // optional, default 1000
}
```

**Response**:

```json
{
  "jobId": "uuid",
  "status": "started",
  "estimatedKillmails": 8721,
  "message": "Ship history reset job started. Check /admin/jobs/{jobId} for progress."
}
```

#### Reset Process

1. **Full Reset**:
   - Truncate `pilot_ship_history` table
   - Iterate through all `killmail_enrichments` with status = 'succeeded'
   - Extract ship data and insert into `pilot_ship_history`
   - Process in batches to avoid memory issues

2. **Incremental Reset**:
   - Only process killmails after `fromDate`
   - Use `ON CONFLICT DO UPDATE` to update existing records
   - Useful for fixing data issues without full re-process

#### Background Job Implementation

```typescript
// backend/scheduler/src/jobs/reset-ship-history.ts
export class ResetShipHistoryJob {
  async execute(options: ResetOptions): Promise<void> {
    const { mode, fromDate, batchSize = 1000 } = options;

    if (mode === 'full') {
      await this.db.deleteFrom('pilot_ship_history').execute();
    }

    let cursor: bigint | null = null;
    let processed = 0;

    while (true) {
      const enrichments = await this.getEnrichmentsBatch(cursor, batchSize, fromDate);
      if (enrichments.length === 0) break;

      for (const enrichment of enrichments) {
        await this.shipHistoryProcessor.processKillmail(
          enrichment.killmailId,
          enrichment.payload,
          enrichment.zkbUrl
        );
      }

      cursor = enrichments[enrichments.length - 1].killmailId;
      processed += enrichments.length;

      await this.updateJobProgress(processed);
    }
  }
}
```

### 9.4 Monitoring

Ship history ingestion is monitored via:

- **Prometheus Metrics**:
  - `battlescope_ship_history_records_total` - Total records in table
  - `battlescope_ship_history_inserts_total` - Records inserted (counter)
  - `battlescope_ship_history_reset_duration_seconds` - Reset job duration

- **Admin Dashboard**:
  - Current record count
  - Last reset timestamp
  - Processing status (if reset in progress)

---

## 10. Configuration Page

### 10.1 Overview

**Route**: `/admin/features/battle-intel/config`

**Access**: Requires `battle-intel` feature access with `admin` role

The Battle Intel configuration page provides limited configuration options, as most data collection is controlled by the Battle Reports feature. This page primarily manages caching and display preferences.

---

### 10.2 Configuration Sections

#### 10.2.1 Data Source Notice

```
ℹ️  Battle Intel Data Source

Battle Intel computes all statistics from killmails and battles collected by the
Battle Reports feature. The quality and coverage of intelligence depends entirely
on what data is ingested.

🔗 Configure Data Collection:
   The Battle Reports feature controls which killmails are ingested into the system.
   If you're missing intelligence about certain entities or battles, check the
   ingestion configuration:

   → [Configure Battle Reports Ingestion]

   Ingestion filters (alliances, corps, systems, security types) determine what
   killmail data is available for intelligence analysis.
```

---

#### 10.2.2 Cache Settings

```
Cache Configuration:

Entity Statistics Cache TTL: [___3600___] seconds (1 hour)
ℹ️  How long to cache alliance/corp/character statistics before recomputing.

Global Summary Cache TTL: [___300___] seconds (5 minutes)
ℹ️  How long to cache the global intelligence summary shown on the home page.

Opponent Analysis Cache TTL: [___3600___] seconds (1 hour)
ℹ️  How long to cache "top opponents" data for each entity.

Ship Composition Cache TTL: [___7200___] seconds (2 hours)
ℹ️  How long to cache ship usage statistics for each entity.

Cache Warming Enabled: [Enabled ✓]
ℹ️  Pre-compute statistics for top entities on startup and periodically refresh.

Cache Warming Interval: [___30___] minutes
ℹ️  How often to refresh cached statistics for top entities in the background.

Top Entities to Warm: [___50___] entities
ℹ️  Number of top alliances/corps to pre-compute statistics for.
```

---

#### 10.2.3 Display Settings

```
Display Configuration:

Default Time Range: [Last 30 days ▼]
ℹ️  Default time range for intelligence statistics when viewing entity pages.

Minimum Battles to Show: [___3___] battles
ℹ️  Entities with fewer battles than this won't appear in top lists.

Top Opponents List Size: [___10___] opponents
ℹ️  Number of top opponents to show by default on entity intel pages.

Top Ships List Size: [___15___] ships
ℹ️  Number of most-used ships to show by default on entity intel pages.

ISK Value Display Format: [Abbreviated (3.6B) ▼]
ℹ️  How to display ISK values throughout the intel UI.
   Options: Abbreviated (3.6B), Full (3,600,000,000), Scientific (3.6×10⁹)
```

---

#### 10.2.4 Current Intelligence Statistics

```
┌─────────────────────────────────────────────────────────────┐
│ Intelligence Data Availability                               │
├─────────────────────────────────────────────────────────────┤
│ • Total Battles:          1,543                             │
│ • Total Killmails:        8,721                             │
│ • Unique Alliances:          42                             │
│ • Unique Corporations:      156                             │
│ • Unique Characters:      2,318                             │
│                                                             │
│ • Date Range:      2025-10-01 to 2025-11-10                 │
│ • Most Recent Battle:  23 minutes ago                       │
│                                                             │
│ Cache Performance (Last Hour):                              │
│ • Cache Hit Rate:         87.3%                             │
│ • Avg Query Time:        142 ms                             │
│ • Cache Size:           ~24 MB                              │
└─────────────────────────────────────────────────────────────┘
```

---

#### 10.2.5 Data Collection Reference

```
⚠️  IMPORTANT: Data Collection & Ingestion

Battle Intel does NOT collect its own data. All intelligence is computed from
killmails and battles ingested by the Battle Reports feature.

📊 What This Means:
   • Missing entities? Check Battle Reports ingestion filters
   • Intelligence gaps? Verify tracked alliances/corps are configured
   • Low battle counts? Adjust minimum pilot threshold or security type filters

🔧 To Modify Data Collection:
   1. Navigate to Battle Reports configuration
   2. Update ingestion filters (alliances, systems, security types)
   3. New killmails matching the updated filters will be ingested going forward
   4. Intelligence statistics will automatically include new data

🔗 Quick Links:
   → [Configure Battle Reports Ingestion]
   → [View Current Ingestion Statistics]
   → [View Ingestion Audit Log]

📝 Note: Battle Intel configuration only affects caching and display preferences,
not what data is collected.
```

---

### 10.3 Configuration Validation

The UI performs client-side validation:

- Cache TTL values: Must be > 0 seconds
- Warming interval: Must be ≥ 5 minutes
- List sizes: Must be between 1 and 100
- Minimum battles: Must be ≥ 1

Server-side validation ensures:

- Cache TTL values are reasonable (not too short to avoid thrashing)
- Configuration changes are logged for audit trail
- Invalid configurations are rejected with clear error messages

---

### 10.4 Configuration Storage

Configuration is stored in the database:

```sql
CREATE TABLE feature_config (
  feature_key text NOT NULL,
  config_key text NOT NULL,
  config_value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_key, config_key)
);

-- Example: battle-intel cache config
INSERT INTO feature_config (feature_key, config_key, config_value) VALUES
('battle-intel', 'cache', '{
  "entityStatsTTL": 3600,
  "globalSummaryTTL": 300,
  "opponentAnalysisTTL": 3600,
  "shipCompositionTTL": 7200,
  "warmingEnabled": true,
  "warmingInterval": 1800,
  "topEntitiesToWarm": 50
}'),
('battle-intel', 'display', '{
  "defaultTimeRange": "30d",
  "minimumBattles": 3,
  "topOpponentsSize": 10,
  "topShipsSize": 15,
  "iskFormat": "abbreviated"
}');
```

---

## 11. Caching Strategy

**Cache Invalidation**:

- When new battles are created → invalidate global summary
- When battle participants updated → invalidate entity-specific caches
- Background job refreshes stale caches every hour

**Cache Warming**:

- Pre-compute statistics for top 50 alliances on startup
- Background job refreshes top entities every 30 minutes

**Cache Hit Rate Target**: >85%

---

## 12. Success Metrics

- **Query Performance**: Intel API responses < 500ms (p95)
- **Cache Hit Rate**: >85% for entity statistics
- **Data Freshness**: Statistics lag < 5 minutes from battle creation
- **User Engagement**: Average intel page views per user per day
- **Accuracy**: Statistics match real-time battle data within 1%

---

## 13. Future Enhancements

- [ ] Doctrine detection and classification
- [ ] Activity heatmaps (time-based)
- [ ] Predictive analytics (where/when entities will fight next)
- [ ] Custom intelligence reports (user-defined queries)
- [ ] Intelligence alerts (notify when opponents are active)
- [ ] Comparative analysis (compare two alliances side-by-side)
- [ ] Export intelligence reports to PDF/CSV
- [ ] Integration with external tools (Pathfinder, Tripwire)
