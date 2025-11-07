# Battle Intel Feature Specification

**Feature Key**: `battle-intel`
**Feature Name**: Battle Intel
**Last Updated**: 2025-11-07

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

| Concept | Description |
|---------|-------------|
| **Entity Statistics** | Aggregate metrics for alliances, corporations, and characters |
| **Opponent Analysis** | Breakdown of who an entity fights most frequently |
| **Ship Composition** | Distribution of ship types used by an entity |
| **Geographic Heatmap** | Systems where an entity is most active |
| **ISK Efficiency** | Ratio of ISK destroyed vs ISK lost |
| **Activity Timeline** | Historical pattern of battle participation |
| **Doctrine Detection** | Identification of common fleet compositions |

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

---

## 4. Data Model

### 4.1 Views (Computed from Battle Reports Data)

Battle Intel does NOT have its own tables - it computes statistics from Battle Reports tables:

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

### 4.2 Cache Keys

**Redis Cache Keys**:
- `battlescope:intel:alliance:{allianceId}:stats` - Alliance statistics (TTL: 1 hour)
- `battlescope:intel:corp:{corpId}:stats` - Corporation statistics (TTL: 1 hour)
- `battlescope:intel:character:{characterId}:stats` - Character statistics (TTL: 1 hour)
- `battlescope:intel:alliance:{allianceId}:opponents` - Top opponents (TTL: 1 hour)
- `battlescope:intel:summary` - Global summary statistics (TTL: 5 minutes)

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
    "iskEfficiency": 56.10,
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

Similar layout to Alliance Intel Page but with character-specific metrics and detailed ship usage stats.

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

registerBattleIntelRoutes(
  app,
  intelService,
  nameEnricher,
  redis,
);
```

All routes use feature-scoped authorization middleware:

```typescript
app.get('/intel/alliances/:id', {
  preHandler: [authMiddleware, requireFeatureRole('battle-intel', 'user')],
  handler: async (request, reply) => { /* ... */ },
});
```

---

## 9. Caching Strategy

**Cache Invalidation**:
- When new battles are created → invalidate global summary
- When battle participants updated → invalidate entity-specific caches
- Background job refreshes stale caches every hour

**Cache Warming**:
- Pre-compute statistics for top 50 alliances on startup
- Background job refreshes top entities every 30 minutes

**Cache Hit Rate Target**: >85%

---

## 10. Success Metrics

- **Query Performance**: Intel API responses < 500ms (p95)
- **Cache Hit Rate**: >85% for entity statistics
- **Data Freshness**: Statistics lag < 5 minutes from battle creation
- **User Engagement**: Average intel page views per user per day
- **Accuracy**: Statistics match real-time battle data within 1%

---

## 11. Future Enhancements

- [ ] Doctrine detection and classification
- [ ] Activity heatmaps (time-based)
- [ ] Predictive analytics (where/when entities will fight next)
- [ ] Custom intelligence reports (user-defined queries)
- [ ] Intelligence alerts (notify when opponents are active)
- [ ] Comparative analysis (compare two alliances side-by-side)
- [ ] Export intelligence reports to PDF/CSV
- [ ] Integration with external tools (Pathfinder, Tripwire)
