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
| `system_id` | INT | Solar system ID |
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
| `killmail_id` | INT | zKillboard kill ID |
| `zkb_url` | TEXT | Killmail link |
| `timestamp` | DATETIME | Killmail time |
| `victim_alliance_id` | INT | From metadata |
| `attacker_alliance_ids` | ARRAY | List of alliances involved |
| `isk_value` | BIGINT | Total value destroyed |
| `side_id` | SMALLINT | 0 or 1 to group sides |

#### battle_participants
| Column | Type | Description |
|---------|------|-------------|
| `battle_id` | UUID | FK to battles |
| `character_id` | INT | Participant ID |
| `alliance_id` | INT | Alliance ID |
| `corp_id` | INT | Corporation ID |
| `ship_type_id` | INT | Hull type |
| `side_id` | SMALLINT | Alliance group side |
| `is_victim` | BOOL | True if ship lost |

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

### GET /battles?space_type=jspace
```json
[
  {
    "battle_id": "BR-31000123-20251103",
    "system_name": "J115422",
    "space_type": "jspace",
    "start_time": "2025-11-03T18:42:00Z",
    "end_time": "2025-11-03T19:05:00Z",
    "total_kills": 14,
    "total_isk_destroyed": 3600000000,
    "zkill_related_url": "https://zkillboard.com/related/31000123/202511031842/"
  }
]
```

### GET /battles/:id
```json
{
  "battle_id": "BR-31000123-20251103",
  "system_id": "31000123",
  "space_type": "jspace",
  "killmails": [
    {
      "killmail_id": "12457890",
      "zkb_url": "https://zkillboard.com/kill/12457890/",
      "isk_value": "380000000",
      "timestamp": "2025-11-03T18:43:00Z",
      "enrichment": {
        "status": "succeeded",
        "payload": { "source": "zkill" },
        "error": null,
        "fetched_at": "2025-11-03T18:45:00Z",
        "updated_at": "2025-11-03T18:45:05Z",
        "created_at": "2025-11-03T18:44:30Z"
      }
    }
  ]
}
```

> `enrichment.status` tracks the worker lifecycle (`pending`, `processing`, `succeeded`, `failed`) while keeping detailed payloads optional. Producers should requeue killmails when failures persist to guarantee eventual consistency.

---

## 9. MVP Scope

✅ zKillboard ingestion + clustering  
✅ Minimal relational schema  
✅ REST API (battle listing/filtering)  
✅ zKillboard related URL generation  
✅ Space type derivation  
✅ Battle storage without full killmail payloads  

---

## 10. Future Enhancements

- Doctrine/fleet composition inference (via ship role mapping)
- Player or alliance performance stats
- ESI integration for character lookup
- Discord/Slack bot for battle notifications
- Map/timeline visualization layer
