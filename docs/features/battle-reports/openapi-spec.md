# Battle Reports OpenAPI Specification

**Feature Key**: `battle-reports`
**Last Updated**: 2025-11-11

---

## Overview

This document defines the OpenAPI/REST API specification for the Battle Reports feature.

For the general feature specification, see [feature-spec.md](./feature-spec.md).

---

## Base Path

All battle reports endpoints are prefixed with `/api`

---

## Authentication

All endpoints require authentication via session cookie or API key.

Feature-scoped authorization: Requires `battle-reports` feature access with minimum role `user`.

---

## Endpoints

### List Battles

```yaml
GET /battles
```

**Query Parameters**:

**Space & Location Filters**:
- `securityType` (array[string], optional): Filter by security type (`highsec`, `lowsec`, `nullsec`, `wormhole`, `pochven`)
- `system_id` (array[bigint], optional): Filter by specific solar system IDs
- `system_name` (string, optional): Filter by system name (partial match, case-insensitive)
- `region_id` (array[bigint], optional): Filter by region IDs

**Entity Filters** (searches by name or ID):
- `alliance_id` (array[bigint], optional): Filter by alliance ID participation
- `alliance_name` (string, optional): Filter by alliance name (partial match)
- `corp_id` (array[bigint], optional): Filter by corporation ID participation
- `corp_name` (string, optional): Filter by corporation name (partial match)
- `character_id` (array[bigint], optional): Filter by character ID participation
- `character_name` (string, optional): Filter by character name (partial match)

**Battle Characteristics**:
- `min_kills` (integer, optional): Minimum number of kills in battle
- `max_kills` (integer, optional): Maximum number of kills in battle
- `min_isk` (bigint, optional): Minimum ISK destroyed (in ISK)
- `max_isk` (bigint, optional): Maximum ISK destroyed (in ISK)
- `min_participants` (integer, optional): Minimum number of participants
- `max_participants` (integer, optional): Maximum number of participants
- `min_duration` (integer, optional): Minimum battle duration (in seconds)
- `max_duration` (integer, optional): Maximum battle duration (in seconds)

**Time Filters**:
- `start_time_after` (string, ISO 8601, optional): Battles starting after this time
- `start_time_before` (string, ISO 8601, optional): Battles starting before this time
- `time_range` (string, optional): Preset time ranges (`last_hour`, `last_24h`, `last_7d`, `last_30d`, `custom`)

**Pagination & Sorting**:
- `limit` (integer, optional): Number of results (default 20, max 100)
- `cursor` (string, optional): Pagination cursor
- `sort_by` (string, optional): Sort field (`start_time`, `isk_destroyed`, `kills`, `duration`, `participants`) (default: `start_time`)
- `sort_order` (string, optional): Sort order (`asc`, `desc`) (default: `desc`)

**Response**: `200 OK`

```json
{
  "items": [
    {
      "id": "uuid",
      "systemId": "string",
      "systemName": "string",
      "regionId": "string",
      "regionName": "string",
      "securityType": "highsec" | "lowsec" | "nullsec" | "wormhole" | "pochven",
      "startTime": "ISO 8601 timestamp",
      "endTime": "ISO 8601 timestamp",
      "duration": "number (seconds)",
      "totalKills": "number",
      "totalParticipants": "number",
      "totalIskDestroyed": "string (bigint)",
      "zkillRelatedUrl": "string",
      "mainAlliances": [
        {
          "allianceId": "string",
          "allianceName": "string",
          "participantCount": "number"
        }
      ]
    }
  ],
  "nextCursor": "string | null",
  "hasMore": "boolean",
  "totalCount": "number (approximate)",
  "appliedFilters": {
    "summary": "string (human-readable summary of active filters)"
  }
}
```

**Notes**:
- Multiple values for array parameters can be provided via repeated query params (e.g., `?securityType=nullsec&securityType=wormhole`)
- Name-based filters use partial, case-insensitive matching
- For precise entity filtering, use ID-based filters
- Battles are included if ANY participant matches the entity filter

---

### Get Battle Details

```yaml
GET /battles/{id}
```

**Path Parameters**:
- `id` (uuid, required): Battle ID

**Response**: `200 OK`

```json
{
  "id": "uuid",
  "systemId": "string",
  "systemName": "string",
  "spaceType": "kspace" | "jspace" | "pochven",
  "startTime": "ISO 8601 timestamp",
  "endTime": "ISO 8601 timestamp",
  "duration": "number (seconds)",
  "totalKills": "number",
  "totalIskDestroyed": "string (bigint)",
  "zkillRelatedUrl": "string",
  "killmails": [
    {
      "killmailId": "string (bigint)",
      "zkbUrl": "string",
      "timestamp": "ISO 8601 timestamp",
      "victimAllianceId": "string (bigint) | null",
      "victimAllianceName": "string | null",
      "victimCorpId": "string (bigint) | null",
      "victimCorpName": "string | null",
      "victimCharacterId": "string (bigint)",
      "victimCharacterName": "string",
      "attackerAllianceIds": ["string (bigint)"],
      "attackerAllianceNames": ["string"],
      "iskValue": "string (bigint)"
    }
  ],
  "participants": [
    {
      "characterId": "string (bigint)",
      "characterName": "string",
      "allianceId": "string (bigint) | null",
      "allianceName": "string | null",
      "corpId": "string (bigint) | null",
      "corpName": "string | null",
      "shipTypeId": "string (bigint)",
      "shipTypeName": "string",
      "sideId": "number | null",
      "isVictim": "boolean"
    }
  ]
}
```

**Error Responses**:
- `404 Not Found`: Battle not found

---

### Entity Search (for filter autocomplete)

```yaml
GET /search/entities
```

**Purpose**: Search for alliances, corporations, and characters by name for use in battle filters. This endpoint provides autocomplete functionality for entity name fields.

**Query Parameters**:
- `q` (string, required): Search query (minimum 2 characters)
- `type` (array[string], optional): Entity types to search (`alliance`, `corporation`, `character`) (default: all types)
- `limit` (integer, optional): Number of results per type (default 10, max 20)

**Response**: `200 OK`

```json
{
  "alliances": [
    {
      "id": "string (bigint)",
      "name": "string",
      "ticker": "string",
      "battleCount": "number (battles this alliance participated in)"
    }
  ],
  "corporations": [
    {
      "id": "string (bigint)",
      "name": "string",
      "ticker": "string",
      "allianceId": "string | null",
      "allianceName": "string | null",
      "battleCount": "number"
    }
  ],
  "characters": [
    {
      "id": "string (bigint)",
      "name": "string",
      "corpId": "string",
      "corpName": "string",
      "allianceId": "string | null",
      "allianceName": "string | null",
      "battleCount": "number"
    }
  ]
}
```

**Notes**:
- Results are sorted by relevance (exact matches first, then partial matches)
- Results are limited to entities that have participated in at least one battle
- Battle counts help users understand entity activity level
- For more advanced search capabilities, see the **Global Search Integration** section below

---

### System Search (for filter autocomplete)

```yaml
GET /search/systems
```

**Purpose**: Search for EVE Online solar systems by name for use in battle filters.

**Query Parameters**:
- `q` (string, required): Search query (minimum 2 characters)
- `securityType` (array[string], optional): Filter by security type
- `limit` (integer, optional): Number of results (default 10, max 20)

**Response**: `200 OK`

```json
{
  "systems": [
    {
      "id": "string (bigint)",
      "name": "string",
      "regionId": "string",
      "regionName": "string",
      "securityType": "highsec" | "lowsec" | "nullsec" | "wormhole" | "pochven",
      "securityStatus": "number (-1.0 to 1.0)",
      "battleCount": "number (battles in this system)"
    }
  ]
}
```

**Notes**:
- Results include security status for K-Space systems
- Battle counts show how active each system is
- J-Space system names (J-signatures) are searchable

---

### Recent Killmails Feed

```yaml
GET /killmails/recent
```

**Query Parameters**:
- `securityType` (array[string], optional): Filter by security type
- `tracked_only` (boolean, optional): Only show kills involving tracked entities
- `limit` (integer, optional): Number of results (default 50, max 100)

**Response**: `200 OK`

```json
{
  "items": [
    {
      "killmailId": "string (bigint)",
      "systemId": "string (bigint)",
      "systemName": "string",
      "timestamp": "ISO 8601 timestamp",
      "securityType": "highsec" | "lowsec" | "nullsec" | "wormhole" | "pochven",
      "victimAllianceId": "string (bigint) | null",
      "victimAllianceName": "string | null",
      "victimCorpId": "string (bigint) | null",
      "victimCorpName": "string | null",
      "iskValue": "string (bigint)",
      "zkbUrl": "string",
      "battleId": "uuid | null",
      "participantCount": "number"
    }
  ],
  "count": "number"
}
```

---

### Killmails Stream (SSE)

```yaml
GET /killmails/stream
```

**Protocol**: Server-Sent Events (`text/event-stream`)

**Query Parameters**:
- `securityType` (array[string], optional): Filter by security type

**Event Types**:

```
event: killmail
data: { ...killmail object... }

event: heartbeat
data: { "timestamp": "ISO 8601 timestamp" }
```

---

## Admin Configuration API

### Get Ingestion Configuration

```yaml
GET /admin/config/ingest
```

**Authorization**: Requires `admin` role or SuperAdmin

**Response**: `200 OK`

```json
{
  "ruleset": {
    "id": "uuid",
    "minPilots": "number",
    "trackedAllianceIds": ["string (bigint)"],
    "trackedCorpIds": ["string (bigint)"],
    "trackedSystemIds": ["string (bigint)"],
    "trackedSecurityTypes": ["highsec" | "lowsec" | "nullsec" | "wormhole" | "pochven"],
    "ignoreUnlisted": "boolean",
    "updatedAt": "ISO 8601 timestamp"
  },
  "service": {
    "pollIntervalMs": "number (optional)",
    "redisqQueueId": "string (optional)"
  }
}
```

### Update Ingestion Configuration

```yaml
PUT /admin/config/ingest
```

**Authorization**: Requires `admin` role or SuperAdmin

**Request Body**:

```json
{
  "ruleset": {
    "minPilots": "number (optional)",
    "trackedAllianceIds": ["string"] (optional),
    "trackedCorpIds": ["string"] (optional),
    "trackedSystemIds": ["string"] (optional),
    "trackedSecurityTypes": ["highsec" | "lowsec" | "nullsec" | "wormhole" | "pochven"] (optional),
    "ignoreUnlisted": "boolean (optional)"
  },
  "service": {
    "pollIntervalMs": "number (optional)",
    "redisqQueueId": "string (optional)"
  }
}
```

**Response**: `200 OK`

```json
{
  "success": true
}
```

### Get Clustering Configuration

```yaml
GET /admin/config/clusterer
```

**Authorization**: Requires `admin` role or SuperAdmin

**Response**: `200 OK`

```json
{
  "windowMinutes": "number (optional)",
  "gapMaxMinutes": "number (optional)",
  "minKills": "number (optional)",
  "processingDelayMinutes": "number (optional)",
  "batchSize": "number (optional)",
  "intervalMs": "number (optional)"
}
```

### Update Clustering Configuration

```yaml
PUT /admin/config/clusterer
```

**Authorization**: Requires `admin` role or SuperAdmin

**Request Body**:

```json
{
  "windowMinutes": "number (optional, 5-180)",
  "gapMaxMinutes": "number (optional, 1-60)",
  "minKills": "number (optional, 1-100)",
  "processingDelayMinutes": "number (optional, 0-1440)",
  "batchSize": "number (optional, 100-10000)",
  "intervalMs": "number (optional, 1000-300000)"
}
```

**Response**: `200 OK`

```json
{
  "success": true
}
```

### Get Ingestion Statistics

```yaml
GET /admin/stats/ingest
```

**Authorization**: Requires `admin` role or SuperAdmin

**Response**: `200 OK`

```json
{
  "received24h": "number",
  "accepted24h": "number",
  "rejected24h": "number",
  "acceptanceRate": "number (percentage)",
  "unprocessedCount": "number"
}
```

### Get Clustering Statistics

```yaml
GET /admin/stats/clusterer
```

**Authorization**: Requires `admin` role or SuperAdmin

**Response**: `200 OK`

```json
{
  "battlesCreated24h": "number",
  "unprocessedKillmails": "number",
  "averageLagMinutes": "number",
  "lastProcessedAt": "ISO 8601 timestamp | null"
}
```

### Trigger Battle Reclustering

```yaml
POST /admin/battles/recluster
```

**Authorization**: Requires `admin` role or SuperAdmin

**Request Body**:

```json
{
  "startTime": "ISO 8601 timestamp",
  "endTime": "ISO 8601 timestamp",
  "deleteExisting": "boolean (default false)",
  "dryRun": "boolean (default false)",
  "customConfig": {
    "windowMinutes": "number (optional)",
    "gapMaxMinutes": "number (optional)",
    "minKills": "number (optional)"
  }
}
```

**Response**: `200 OK`

```json
{
  "success": true,
  "message": "string",
  "affectedKillmails": "number",
  "affectedBattles": "number (optional)"
}
```

---

## Data Models

### SecurityType

```typescript
type SecurityType = 'highsec' | 'lowsec' | 'nullsec' | 'wormhole' | 'pochven';
```

**Notes**:
- Replaces the previous `SpaceType` ('kspace', 'jspace', 'pochven') and `SecurityLevel` ('highsec', 'lowsec', 'nullsec') with a unified type
- `wormhole` corresponds to the previous 'jspace'
- K-space systems are now categorized as 'highsec', 'lowsec', or 'nullsec'
- 'pochven' remains unchanged

### Battle

```typescript
interface Battle {
  id: string; // UUID
  systemId: string; // bigint
  systemName: string;
  securityType: SecurityType;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  duration: number; // seconds
  totalKills: number;
  totalIskDestroyed: string; // bigint as string
  zkillRelatedUrl: string;
}
```

### Killmail

```typescript
interface Killmail {
  killmailId: string; // bigint as string
  zkbUrl: string;
  timestamp: string; // ISO 8601
  systemId: string; // bigint as string
  systemName: string;
  securityType: SecurityType;
  victimAllianceId: string | null;
  victimAllianceName: string | null;
  victimCorpId: string | null;
  victimCorpName: string | null;
  victimCharacterId: string;
  victimCharacterName: string;
  attackerAllianceIds: string[];
  attackerAllianceNames: string[];
  iskValue: string; // bigint as string
  battleId: string | null; // UUID
  participantCount: number;
}
```

---

## Error Responses

### Standard Error Format

```json
{
  "error": "string (error type)",
  "message": "string (human-readable message)"
}
```

### Common Error Codes

- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized (missing feature access)
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

---

## Rate Limiting

- Authenticated users: 1000 requests per hour
- SSE streams: Max 5 concurrent connections per user
- Search endpoints: 100 requests per minute

---

## Global Search Integration

### Overview

For advanced search capabilities beyond basic filtering, BattleScope will integrate with an external search product (to be determined). This will enable:

- **Full-text search** across battle descriptions, participant names, and system names
- **Fuzzy matching** for typo-tolerant searches
- **Advanced query syntax** (boolean operators, wildcards, proximity searches)
- **Search suggestions** and query autocomplete
- **Search analytics** (popular searches, search trends)
- **Faceted search** with dynamic filter options based on search results

### Integration Points

The external search product will be integrated at the following layers:

1. **Data Indexing**:
   - Battle data indexed in real-time as battles are created/updated
   - Entity names (alliances, corps, characters) indexed with metadata
   - System names and locations indexed with spatial data

2. **API Layer**:
   - Dedicated `/search/advanced` endpoint for complex queries
   - Search results return battle IDs that can be fetched via standard battle endpoints
   - Search API proxies to external search service with authentication

3. **Frontend**:
   - Global search bar in navigation (searches across all features)
   - Advanced search modal with query builder interface
   - Search results page with highlighted matches
   - "Search in Battle Reports" scoped search

### Search vs. Filter

**Use Basic Filtering When**:
- Users know exact criteria (specific alliance, date range, system)
- Simple AND/OR combinations of filters
- Real-time updates needed (SSE streams)

**Use Global Search When**:
- Users need to find battles by description or context
- Fuzzy matching needed ("find battles involving Goons")
- Complex query requirements beyond simple filters
- Exploring unfamiliar data

### Implementation Notes

- Basic filter endpoints (`GET /battles` with query params) remain the primary method for filtering
- Search integration is additive - doesn't replace existing filter functionality
- Search results can be further refined using standard filters
- External search product will be documented separately once selected

**Recommended Search Products** (to be evaluated):
- Algolia (managed SaaS)
- Meilisearch (self-hosted, open source)
- Typesense (self-hosted, open source)
- Elasticsearch (self-hosted, complex but powerful)

---

## Notes

- All bigint values are serialized as strings to prevent precision loss in JSON
- Timestamps are in ISO 8601 format with timezone
- Pagination uses cursor-based pagination for efficient large dataset traversal
- Security type filtering supports multiple values via repeated query parameters
- Entity name searches use PostgreSQL full-text search (basic) - for advanced search, use the global search integration
