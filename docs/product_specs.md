# BattleScope Product Specification (v2)

## 1. Product Overview

**BattleScope** is a data intelligence platform that reconstructs and classifies **battles** in *EVE Online* by clustering related killmails from **zKillboard**.  

Unlike traditional killboard scrapers, BattleScope focuses on **efficient storage and contextual analysis**:  
- It does **not** store raw killmail payloads (which can be re-fetched from zKillboard/ESI).  
- It stores **battle clusters**, **metadata**, and **references** (killmail IDs and URLs).  
- It provides an API and UI for **exploring fights** by alliance, corp, pilot, space type, or system.

This enables performant historical and tactical insights while maintaining low storage footprint and high data reliability.

---

## 2. Objectives

| Goal | Description |
|------|--------------|
| **1. Battle Reconstruction** | Automatically identify related killmails and group them into a single “battle” entity. |
| **2. Reference-First Storage** | Store only essential metadata and external killmail references. |
| **3. Queryable Metadata** | Enable flexible filtering (space type, corporation, alliance, character, time). |
| **4. Efficient Enrichment** | Allow on-demand retrieval of detailed killmail data when needed. |
| **5. Publicly Verifiable** | Each record references canonical zKillboard and ESI links for transparency. |
| **6. Frontend Situational Awareness** | Deliver real-time battle intelligence via the web UI (home stats, kill feed, rules controls) while authentication remains out of scope for this iteration. |

---

## 3. Core Concepts

| Concept | Description |
|----------|--------------|
| **Killmail Reference** | Minimal object containing killmail ID, timestamp, solarSystemID, and zKillboard link. |
| **Battle** | Logical grouping of killmail references determined by clustering algorithm (time, system, participants). |
| **Participant** | Any character, corp, or alliance appearing in one or more killmails within the battle. |
| **Side** | A distinct group within a battle (based on attacker/victim overlap and alliance correlation). |
| **Space Type** | K-space (known), J-space (wormhole), or Poch-space (Triglavian). |
| **Source Link** | Permanent zKillboard “related kills” URL or similar canonical link. |
| **Ruleset** | Configurable filters (alliances, corporations, minimum pilots) that drive ingestion focus and UI behaviour; killmails outside the allowlist are ignored when active. |

---

## 4. Data Flow Overview

### 4.1 Ingestion Pipeline
1. **Killmail Feed**
   - Subscribe to zKillboard’s RedisQ feed or bulk API dumps.
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
   - Deduplicate entries based on `killmail_id`.

2. **Clustering Engine**
   - Runs on sliding time windows (e.g., 30 min) per system.
   - Uses overlap in attacker/victim alliances or corporations to link kills into “battles”.
   - Groups kills into clusters meeting thresholds (≥2 kills, ≤30 min apart, same system).

3. **Battle Construction**
   - Assign unique `battle_id`.
   - Derive:
     - Start/end time from earliest/latest kill
     - Total kill count
     - Distinct alliances/corps/characters per side
     - ISK destroyed (sum of zKB `zkb.totalValue`)
     - Space type (based on system ID prefix)
   - Generate related zKillboard URL:
     ```
     https://zkillboard.com/related/{system_id}/{timestamp}/
     ```

4. **Storage**
   - Minimal schema focused on relationships, not raw data.

---

## 5. Data Model

### 5.1 Core Tables

#### battles
| Column | Type | Description |
|---------|------|-------------|
| `id` | UUID | Internal battle ID |
| `system_id` | BIGINT | Solar system ID (supports large EVE system IDs) |
| `space_type` | ENUM(`kspace`, `jspace`, `pochven`) | Derived from system ID |
| `start_time` | DATETIME | Earliest killmail |
| `end_time` | DATETIME | Latest killmail |
| `total_kills` | INT | Number of kills in cluster |
| `total_isk_destroyed` | BIGINT | Sum of kill values |
| `zkill_related_url` | TEXT | Canonical battle link |
| `created_at` | DATETIME | Record creation timestamp |

#### battle_killmails
| Column | Type | Description |
|---------|------|-------------|
| `battle_id` | UUID | FK to battles |
| `killmail_id` | BIGINT | zKillboard kill ID (large IDs require bigint) |
| `zkb_url` | TEXT | Killmail link |
| `timestamp` | DATETIME | Killmail time |
| `victim_alliance_id` | BIGINT | From metadata (nullable) |
| `attacker_alliance_ids` | ARRAY[BIGINT] | List of alliances involved |
| `isk_value` | BIGINT | Total value destroyed |
| `side_id` | SMALLINT | 0 or 1 to group sides |

#### battle_participants
| Column | Type | Description |
|---------|------|-------------|
| `battle_id` | UUID | FK to battles |
| `character_id` | BIGINT | Participant ID |
| `alliance_id` | BIGINT | Alliance ID (nullable) |
| `corp_id` | BIGINT | Corporation ID (nullable) |
| `ship_type_id` | BIGINT | Hull type (nullable) |
| `side_id` | SMALLINT | Alliance group side |
| `is_victim` | BOOL | True if ship lost |

### 5.2 ID Type Requirements

**All EVE Online entity identifiers must use BIGINT (64-bit integers):**

- **Rationale**: EVE Online IDs can exceed JavaScript's `Number.MAX_SAFE_INTEGER` (2^53-1 = 9,007,199,254,740,991)
- **Affected entities**: killmail IDs, character IDs, corporation IDs, alliance IDs, system IDs, ship type IDs
- **API representation**: All IDs transmitted as strings in JSON to prevent precision loss
- **Database storage**: Native BIGINT columns for efficient indexing and filtering

---

## 6. Functional Requirements

| ID | Requirement | Priority |
|----|--------------|-----------|
| F1 | Subscribe to zKillboard RedisQ feed and store minimal metadata | High |
| F2 | Cluster kills by system + timestamp proximity | High |
| F3 | Compute derived battle properties (ISK destroyed, ship counts, etc.) | High |
| F4 | Store only references (killmail IDs, URLs) | High |
| F5 | Identify and assign space type (via system prefix) | High |
| F6 | Provide REST/GraphQL API to query battles | High |
| F7 | Generate canonical zKillboard related URLs | Medium |
| F8 | Fetch extended data on-demand (lazy fetch via zKB API) | Medium |
| F9 | Filter by alliance, corporation, or character | Medium |
| F10 | Detect and merge overlapping battle clusters | Low |
| F11 | Provide aggregated statistics for total battles and top alliances/corps to power the homepage dashboard | Medium |
| F12 | Expose a streaming-friendly recent killmail feed segmented by space type for the Recent Kills page | Medium |
| F13 | Offer read/write APIs for rulesets (min pilots, tracked alliances/corps, ignore-unlisted toggle) surfaced in the Rules UI | High |
| F14 | Resolve and include entity names (alliances, corps, characters, systems, ships) in all API responses via ESI integration | High |
| F15 | Provide entity detail pages (Alliance, Corporation, Character) showing battle history, statistics, and opponent analysis | High |

### Frontend MVP Experience

- **Home:** Present total battle reports and tracked alliance/corp counts with contextual metadata from F11; refresh periodically without requiring login.
- **Recent Kills:** Auto-update a list of recent killmails by space type (kspace, jspace, pochven) using the streaming feed from F12 with graceful fallback polling.
- **Rules:** Allow operators to configure minimum pilot thresholds and tracked alliances/corps, persisting changes through F13 while signalling that authentication will arrive in a future iteration.
- **Battles:** Display list of recent battles with detail view showing participants and killmails.
- **Entity Pages (Alliance/Corporation/Character):** Show entity-specific battle history with opponent breakdown, participant counts, ship type composition, and direct links to battle reports.

### UI Display Requirements (F14)

**Entity Name Display**: The UI must display human-readable names for all EVE Online entities instead of raw IDs.

| Entity Type | Display Format | Example | zKillboard Link |
|-------------|----------------|---------|-----------------|
| **Alliance** | Alliance name as clickable link | [Pandemic Legion](https://zkillboard.com/alliance/99001234/) | `https://zkillboard.com/alliance/{allianceId}/` |
| **Corporation** | Corporation name as clickable link | [Sniggerdly](https://zkillboard.com/corporation/98001234/) | `https://zkillboard.com/corporation/{corpId}/` |
| **Character** | Character name as clickable link | [John Doe](https://zkillboard.com/character/90012345/) | `https://zkillboard.com/character/{characterId}/` |
| **System** | System name with optional ID | J115422 (31000123) | N/A |
| **Ship Type** | Ship name | Loki | N/A |

**UI Implementation Rules**:

1. **Never display raw IDs**: All entity references must show names, not numeric IDs
2. **External links**: All alliances, corporations, and characters must link to their respective zKillboard pages
3. **Link styling**: Use visual indicators (color, underline, or icon) to distinguish external links
4. **Fallback handling**: If a name is unavailable, display "Unknown {EntityType} #{ID}" with tooltip
5. **Loading states**: Show skeleton loaders or placeholders while names are being fetched
6. **Multiple entities**: When displaying lists (e.g., attacker alliances), show all names separated by commas, each as a clickable link

**Screen-Specific Requirements**:

- **Home View**:
  - Top Alliances: Display alliance names with battle counts
  - Top Corporations: Display corporation names with battle counts
  - Each entry links to zKillboard entity page
  
- **Recent Kills View**:
  - Show victim alliance/corp/character names
  - Show attacker alliance/corp names (summarized if many)
  - System name with space type indicator
  - All entity names link to zKillboard
  
- **Battles View**:
  - Battle list: Show system name and space type
  - Battle detail: Show all participant names with roles (victim/attacker)
  - Killmail list: Show victim and attacker entity names
  - All entity names link to zKillboard

- **Entity Detail Pages (Alliance/Corporation/Character)**:
  - Header: Display entity name, icon/logo (if available), and basic statistics
  - Battle History: Paginated list of battles involving this entity
  - Battle Summary Cards: Each battle should show:
    - Battle date/time and duration
    - System name with space type indicator
    - Opposing alliances/corporations (those they fought against)
    - Participant count (total pilots involved)
    - Ship composition (breakdown by ship type/class)
    - ISK destroyed/lost ratio
    - Link to full battle report
  - Statistics Panel:
    - Total battles participated in
    - Win/loss ratio (based on ISK efficiency)
    - Most frequent opponents
    - Most used ship types
    - Favorite systems/regions
  - All entity names link to their respective detail pages or zKillboard

---

## 7. Non-Functional Requirements

| Category | Specification |
|-----------|----------------|
| **Storage Efficiency** | Average battle storage footprint < 10 KB |
| **Reliability** | Duplicate-safe ingestion with idempotent writes |
| **Performance** | Cluster detection for 10k+ kills/hour |
| **Scalability** | Stateless ingestion workers and async DB writes |
| **Transparency** | All data verifiable via zKillboard URLs |
| **Extensibility** | Easy to add optional enrichment jobs (ISK stats, doctrine tagging) |

---

## 8. API Examples

### GET /stats/summary
```json
{
  "totalBattles": 1543,
  "totalKillmails": 8721,
  "uniqueAlliances": 42,
  "uniqueCorporations": 156,
  "topAlliances": [
    {
      "allianceId": "99001234",
      "allianceName": "Pandemic Legion",
      "battleCount": 87
    },
    {
      "allianceId": "99005678",
      "allianceName": "Goonswarm Federation",
      "battleCount": 73
    }
  ],
  "topCorporations": [
    {
      "corpId": "98001234",
      "corpName": "Sniggerdly",
      "battleCount": 45
    }
  ],
  "generatedAt": "2025-11-03T19:15:00Z"
}
```

### GET /battles?space_type=jspace
```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "systemId": "31000123",
    "systemName": "J115422",
    "spaceType": "jspace",
    "startTime": "2025-11-03T18:42:00Z",
    "endTime": "2025-11-03T19:05:00Z",
    "totalKills": "14",
    "totalIskDestroyed": "3600000000",
    "zkillRelatedUrl": "https://zkillboard.com/related/31000123/202511031842/"
  }
]
```

### GET /battles/:id
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "systemId": "31000123",
  "systemName": "J115422",
  "spaceType": "jspace",
  "startTime": "2025-11-03T18:42:00Z",
  "endTime": "2025-11-03T19:05:00Z",
  "totalKills": "14",
  "totalIskDestroyed": "3600000000",
  "zkillRelatedUrl": "https://zkillboard.com/related/31000123/202511031842/",
  "createdAt": "2025-11-03T19:05:30Z",
  "killmails": [
    {
      "killmailId": "12457890",
      "zkbUrl": "https://zkillboard.com/kill/12457890/",
      "occurredAt": "2025-11-03T18:43:00Z",
      "victimAllianceId": "99001234",
      "victimAllianceName": "Pandemic Legion",
      "victimCorpId": "98001234",
      "victimCorpName": "Sniggerdly",
      "victimCharacterId": "90012345",
      "victimCharacterName": "John Doe",
      "attackerAllianceIds": ["99005678"],
      "attackerAllianceNames": ["Goonswarm Federation"],
      "attackerCorpIds": ["98005678"],
      "attackerCorpNames": ["KarmaFleet"],
      "attackerCharacterIds": ["90098765"],
      "attackerCharacterNames": ["Jane Smith"],
      "iskValue": "380000000",
      "enrichment": {
        "status": "succeeded",
        "payload": { "source": "zkill" },
        "error": null,
        "fetchedAt": "2025-11-03T18:45:00Z",
        "updatedAt": "2025-11-03T18:45:05Z",
        "createdAt": "2025-11-03T18:44:30Z"
      }
    }
  ],
  "participants": [
    {
      "battleId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "characterId": "90012345",
      "characterName": "John Doe",
      "allianceId": "99001234",
      "allianceName": "Pandemic Legion",
      "corpId": "98001234",
      "corpName": "Sniggerdly",
      "shipTypeId": "11567",
      "shipTypeName": "Loki",
      "sideId": "1",
      "isVictim": true
    }
  ]
}
```

### GET /killmails/recent?limit=50
```json
{
  "items": [
    {
      "killmailId": "12457890",
      "systemId": "31000123",
      "systemName": "J115422",
      "occurredAt": "2025-11-03T18:43:00Z",
      "spaceType": "jspace",
      "victimAllianceId": "99001234",
      "victimAllianceName": "Pandemic Legion",
      "victimCorpId": "98001234",
      "victimCorpName": "Sniggerdly",
      "victimCharacterId": "90012345",
      "victimCharacterName": "John Doe",
      "attackerAllianceIds": ["99005678"],
      "attackerAllianceNames": ["Goonswarm Federation"],
      "attackerCorpIds": ["98005678"],
      "attackerCorpNames": ["KarmaFleet"],
      "attackerCharacterIds": ["90098765"],
      "attackerCharacterNames": ["Jane Smith"],
      "iskValue": "380000000",
      "zkbUrl": "https://zkillboard.com/kill/12457890/",
      "battleId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "participantCount": 15
    }
  ],
  "count": 50
}
```

### GET /alliances/:id
```json
{
  "allianceId": "99001234",
  "allianceName": "Pandemic Legion",
  "ticker": "PL",
  "statistics": {
    "totalBattles": 87,
    "totalKillmails": 1245,
    "totalIskDestroyed": "450000000000",
    "totalIskLost": "320000000000",
    "iskEfficiency": 58.44,
    "averageParticipants": 12.5,
    "mostUsedShips": [
      { "shipTypeId": "11567", "shipTypeName": "Loki", "count": 145 },
      { "shipTypeId": "11987", "shipTypeName": "Proteus", "count": 98 }
    ],
    "topOpponents": [
      { "allianceId": "99005678", "allianceName": "Goonswarm Federation", "battleCount": 23 },
      { "allianceId": "99002345", "allianceName": "Test Alliance Please Ignore", "battleCount": 18 }
    ],
    "topSystems": [
      { "systemId": "31000123", "systemName": "J115422", "battleCount": 15 },
      { "systemId": "30002187", "systemName": "M-OEE8", "battleCount": 12 }
    ]
  }
}
```

### GET /alliances/:id/battles?limit=20&cursor=xyz
```json
{
  "items": [
    {
      "battleId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "systemId": "31000123",
      "systemName": "J115422",
      "spaceType": "jspace",
      "startTime": "2025-11-03T18:42:00Z",
      "endTime": "2025-11-03T19:05:00Z",
      "duration": 1380,
      "totalKills": 14,
      "totalParticipants": 28,
      "totalIskDestroyed": "3600000000",
      "allianceIskDestroyed": "2100000000",
      "allianceIskLost": "1500000000",
      "allianceParticipants": 15,
      "opponents": [
        { "allianceId": "99005678", "allianceName": "Goonswarm Federation", "participants": 13 }
      ],
      "shipComposition": [
        { "shipTypeId": "11567", "shipTypeName": "Loki", "count": 5 },
        { "shipTypeId": "11987", "shipTypeName": "Proteus", "count": 3 }
      ],
      "zkillRelatedUrl": "https://zkillboard.com/related/31000123/202511031842/"
    }
  ],
  "nextCursor": "abc123",
  "hasMore": true
}
```

### GET /corporations/:id
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
    "totalIskDestroyed": "230000000000",
    "totalIskLost": "180000000000",
    "iskEfficiency": 56.10,
    "averageParticipants": 8.2,
    "mostUsedShips": [
      { "shipTypeId": "11567", "shipTypeName": "Loki", "count": 89 },
      { "shipTypeId": "11969", "shipTypeName": "Sabre", "count": 54 }
    ],
    "topOpponents": [
      { "allianceId": "99005678", "allianceName": "Goonswarm Federation", "battleCount": 15 }
    ],
    "topPilots": [
      { "characterId": "90012345", "characterName": "John Doe", "battleCount": 32 }
    ]
  }
}
```

### GET /corporations/:id/battles?limit=20&cursor=xyz
```json
{
  "items": [
    {
      "battleId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "systemId": "31000123",
      "systemName": "J115422",
      "spaceType": "jspace",
      "startTime": "2025-11-03T18:42:00Z",
      "endTime": "2025-11-03T19:05:00Z",
      "duration": 1380,
      "totalKills": 14,
      "totalParticipants": 28,
      "corpParticipants": 8,
      "corpIskDestroyed": "1200000000",
      "corpIskLost": "900000000",
      "opponents": [
        { "corpId": "98005678", "corpName": "KarmaFleet", "allianceId": "99005678", "allianceName": "Goonswarm Federation", "participants": 10 }
      ],
      "shipComposition": [
        { "shipTypeId": "11567", "shipTypeName": "Loki", "count": 3 }
      ],
      "zkillRelatedUrl": "https://zkillboard.com/related/31000123/202511031842/"
    }
  ],
  "nextCursor": "def456",
  "hasMore": true
}
```

### GET /characters/:id
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
    "mostUsedShips": [
      { "shipTypeId": "11567", "shipTypeName": "Loki", "count": 18 },
      { "shipTypeId": "11987", "shipTypeName": "Proteus", "count": 8 }
    ],
    "topOpponents": [
      { "allianceId": "99005678", "allianceName": "Goonswarm Federation", "battleCount": 12 }
    ],
    "favoriteSystems": [
      { "systemId": "31000123", "systemName": "J115422", "battleCount": 8 }
    ]
  }
}
```

### GET /characters/:id/battles?limit=20&cursor=xyz
```json
{
  "items": [
    {
      "battleId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "systemId": "31000123",
      "systemName": "J115422",
      "spaceType": "jspace",
      "startTime": "2025-11-03T18:42:00Z",
      "endTime": "2025-11-03T19:05:00Z",
      "duration": 1380,
      "totalKills": 14,
      "characterKills": 2,
      "characterLosses": 0,
      "characterIskDestroyed": "450000000",
      "characterIskLost": "0",
      "shipsFlown": [
        { "shipTypeId": "11567", "shipTypeName": "Loki" }
      ],
      "opponents": [
        { "allianceId": "99005678", "allianceName": "Goonswarm Federation" }
      ],
      "zkillRelatedUrl": "https://zkillboard.com/related/31000123/202511031842/"
    }
  ],
  "nextCursor": "ghi789",
  "hasMore": true
}
```

> **Entity Name Resolution**: All API responses include both IDs (as strings for bigint support) and human-readable names for alliances, corporations, characters, systems, and ship types. Names are resolved via the ESI API during enrichment and cached for performance.

> **Enrichment Lifecycle**: `enrichment.status` tracks the worker lifecycle (`pending`, `processing`, `succeeded`, `failed`) while keeping detailed payloads optional. Producers should requeue killmails when failures persist to guarantee eventual consistency.

---

## 9. MVP Scope

✅ zKillboard ingestion + clustering  
✅ Minimal relational schema  
✅ REST API (battle listing/filtering)  
✅ zKillboard related URL generation  
✅ Space type derivation  
✅ Battle storage without full killmail payloads  
⏳ Frontend surfaces: Home statistics, streaming Recent Kills feed, and Rules configuration (authentication deferred)

---

## 10. Future Enhancements

- User authentication and role-based access for Rules management
- Doctrine/fleet composition inference (via ship role mapping)
- Player or alliance performance stats
- ESI integration for character lookup
- Discord/Slack bot for battle notifications
- Map/timeline visualization layer
