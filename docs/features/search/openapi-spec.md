# Search OpenAPI Specification

**Feature Key**: `search`
**Last Updated**: 2025-11-10

---

## Overview

This document defines the OpenAPI/REST API specification for the Search feature.

For the general feature specification, see [feature-spec.md](./feature-spec.md).

---

## Base Path

All search endpoints are prefixed with `/api/search`

---

## Authentication

All endpoints require authentication via session cookie or API key.

Most search endpoints require feature access to the data being searched (e.g., `battle-reports` feature access to search battles).

---

## Endpoints

### Autocomplete Entities

```yaml
GET /search/entities
```

**Purpose**: Autocomplete search for alliances, corporations, and characters. Used in filter interfaces.

**Authorization**: Requires any feature access (typically `battle-reports` or `battle-intel`)

**Query Parameters**:
- `q` (string, required): Search query (minimum 2 characters)
- `type` (array[string], optional): Entity types to search (`alliance`, `corporation`, `character`). Default: all types
- `limit` (integer, optional): Number of results per type (default 10, max 20)

**Response**: `200 OK`

```json
{
  "alliances": [
    {
      "id": "99001234",
      "type": "alliance",
      "name": "Pandemic Legion",
      "ticker": "PL",
      "battleCount": 87,
      "lastSeenAt": "2025-11-10T14:30:00Z"
    }
  ],
  "corporations": [
    {
      "id": "98001234",
      "type": "corporation",
      "name": "Sniggerdly",
      "ticker": "SNGGR",
      "allianceId": "99001234",
      "allianceName": "Pandemic Legion",
      "battleCount": 45,
      "lastSeenAt": "2025-11-10T12:15:00Z"
    }
  ],
  "characters": [
    {
      "id": "90012345",
      "type": "character",
      "name": "John Doe",
      "corpId": "98001234",
      "corpName": "Sniggerdly",
      "allianceId": "99001234",
      "allianceName": "Pandemic Legion",
      "battleCount": 32,
      "lastSeenAt": "2025-11-10T16:45:00Z"
    }
  ],
  "processingTimeMs": 23,
  "query": "pandemic"
}
```

**Notes**:
- Results sorted by activity score (most active entities ranked higher)
- Only returns entities that have participated in at least one battle
- Supports fuzzy matching for typos (e.g., "pandmic" still finds "Pandemic")
- Response includes all three entity types unless filtered via `type` parameter

**Example Requests**:
```bash
# Search all entity types
GET /search/entities?q=pandemic

# Search only alliances
GET /search/entities?q=goon&type=alliance

# Search alliances and corporations
GET /search/entities?q=test&type=alliance&type=corporation

# Limit results
GET /search/entities?q=test&limit=5
```

---

### Autocomplete Systems

```yaml
GET /search/systems
```

**Purpose**: Autocomplete search for EVE Online solar systems. Used in filter interfaces.

**Authorization**: Requires any feature access

**Query Parameters**:
- `q` (string, required): Search query (minimum 2 characters)
- `space_type` (array[string], optional): Filter by space type (`kspace`, `jspace`, `pochven`)
- `limit` (integer, optional): Number of results (default 10, max 20)

**Response**: `200 OK`

```json
{
  "systems": [
    {
      "id": "31000123",
      "name": "J115422",
      "regionId": "11000001",
      "regionName": "A-R00001",
      "constellationId": "21000001",
      "constellationName": "B-R00001",
      "spaceType": "jspace",
      "securityLevel": null,
      "securityStatus": -1.0,
      "battleCount": 28,
      "lastBattleAt": "2025-11-10T18:42:00Z"
    },
    {
      "id": "30002187",
      "name": "M-OEE8",
      "regionId": "10000014",
      "regionName": "Catch",
      "constellationId": "20000187",
      "constellationName": "GE-8JV",
      "spaceType": "kspace",
      "securityLevel": "nullsec",
      "securityStatus": -0.4,
      "battleCount": 34,
      "lastBattleAt": "2025-11-10T14:30:00Z"
    }
  ],
  "processingTimeMs": 18,
  "query": "m-o"
}
```

**Notes**:
- Results sorted by activity score (systems with recent battles ranked higher)
- Includes security status for K-Space systems
- J-Space system names are searchable
- Matches system name, region name, and constellation name

**Example Requests**:
```bash
# Search all systems
GET /search/systems?q=jita

# Search only wormhole systems
GET /search/systems?q=j11&space_type=jspace

# Search null-sec systems
GET /search/systems?q=delve&space_type=kspace
```

---

### Global Search

```yaml
GET /search/global
```

**Purpose**: Universal search across all data types. Used by the global search bar in navigation.

**Authorization**: Requires authentication (feature access checked per result type)

**Query Parameters**:
- `q` (string, required): Search query (minimum 2 characters)
- `limit` (integer, optional): Number of results per category (default 5, max 10)

**Response**: `200 OK`

```json
{
  "battles": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "systemName": "M-OEE8",
      "spaceType": "kspace",
      "startTime": "2025-11-10T14:30:00Z",
      "totalKills": 87,
      "totalIskDestroyed": "42300000000",
      "mainAlliances": ["Test Alliance", "Brave Collective"],
      "relevanceScore": 0.95
    }
  ],
  "entities": {
    "alliances": [
      {
        "id": "99001234",
        "name": "Pandemic Legion",
        "ticker": "PL",
        "battleCount": 87
      }
    ],
    "corporations": [],
    "characters": []
  },
  "systems": [
    {
      "id": "30002187",
      "name": "M-OEE8",
      "spaceType": "kspace",
      "battleCount": 34
    }
  ],
  "processingTimeMs": 45,
  "query": "m-o",
  "totalResults": {
    "battles": 12,
    "entities": 1,
    "systems": 3
  }
}
```

**Notes**:
- Returns top results from each category
- Results filtered by user's feature access (e.g., no battle results if user lacks `battle-reports` access)
- Relevance-ranked across all categories
- Suitable for global search dropdown/modal

---

### Advanced Battle Search

```yaml
POST /search/battles
```

**Purpose**: Advanced battle search with complex filters and full-text queries.

**Authorization**: Requires `battle-reports` feature access

**Request Body**:

```json
{
  "query": "pandemic legion goonswarm",
  "filters": {
    "spaceType": ["kspace", "jspace"],
    "securityLevel": ["lowsec", "nullsec"],
    "startTime": {
      "after": "2025-11-01T00:00:00Z",
      "before": "2025-11-10T23:59:59Z"
    },
    "totalKills": {
      "min": 10,
      "max": 100
    },
    "totalIskDestroyed": {
      "min": 1000000000,
      "max": 50000000000
    },
    "totalParticipants": {
      "min": 20
    },
    "duration": {
      "min": 600,
      "max": 3600
    },
    "allianceIds": ["99001234", "99005678"],
    "corpIds": [],
    "systemIds": []
  },
  "sort": {
    "by": "startTime",
    "order": "desc"
  },
  "page": {
    "limit": 20,
    "offset": 0
  }
}
```

**Response**: `200 OK`

```json
{
  "hits": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "systemId": "30002187",
      "systemName": "M-OEE8",
      "regionName": "Catch",
      "spaceType": "kspace",
      "securityLevel": "nullsec",
      "startTime": "2025-11-10T14:30:00Z",
      "endTime": "2025-11-10T15:45:00Z",
      "duration": 4500,
      "totalKills": 87,
      "totalParticipants": 156,
      "totalIskDestroyed": 42300000000,
      "allianceNames": ["Test Alliance", "Brave Collective"],
      "_matchedTerms": ["pandemic", "goonswarm"],
      "_relevanceScore": 0.87
    }
  ],
  "estimatedTotalHits": 234,
  "limit": 20,
  "offset": 0,
  "processingTimeMs": 67,
  "query": "pandemic legion goonswarm",
  "facets": {
    "spaceType": {
      "kspace": 180,
      "jspace": 54
    },
    "securityLevel": {
      "lowsec": 42,
      "nullsec": 138
    }
  }
}
```

**Notes**:
- Full-text search across system names, alliance names, corp names, and participant names
- All filters are optional
- Supports range filters (min/max) for numeric fields
- Returns faceted counts for dynamic filter suggestions
- Relevance-ranked by default, customizable with `sort` parameter

---

## Data Models

### EntitySearchResult

```typescript
interface EntitySearchResult {
  id: string;
  type: 'alliance' | 'corporation' | 'character';
  name: string;
  ticker: string | null;
  allianceId?: string;
  allianceName?: string;
  corpId?: string;
  corpName?: string;
  battleCount: number;
  lastSeenAt: string; // ISO 8601
}
```

### SystemSearchResult

```typescript
interface SystemSearchResult {
  id: string;
  name: string;
  regionId: string;
  regionName: string;
  constellationId: string;
  constellationName: string;
  spaceType: 'kspace' | 'jspace' | 'pochven';
  securityLevel: 'highsec' | 'lowsec' | 'nullsec' | null;
  securityStatus: number; // -1.0 to 1.0
  battleCount: number;
  lastBattleAt: string | null; // ISO 8601
}
```

### BattleSearchResult

```typescript
interface BattleSearchResult {
  id: string;
  systemId: string;
  systemName: string;
  regionName: string;
  spaceType: 'kspace' | 'jspace' | 'pochven';
  securityLevel: 'highsec' | 'lowsec' | 'nullsec' | null;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  duration: number; // seconds
  totalKills: number;
  totalParticipants: number;
  totalIskDestroyed: number;
  allianceNames: string[];
  _matchedTerms?: string[]; // Query terms that matched
  _relevanceScore?: number; // 0.0 to 1.0
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

- `400 Bad Request`: Invalid query parameters (e.g., query too short, invalid filters)
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Missing required feature access
- `429 Too Many Requests`: Rate limit exceeded (100 requests/minute for search)
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Search service (Meilisearch) is down

---

## Rate Limiting

- **Autocomplete endpoints** (`/entities`, `/systems`): 100 requests per minute per user
- **Global search**: 50 requests per minute per user
- **Advanced battle search**: 30 requests per minute per user

---

## Performance

### Response Time Targets

- **Autocomplete**: <50ms p95
- **Global search**: <100ms p95
- **Advanced battle search**: <150ms p95

### Optimization Notes

- Results are cached in Meilisearch for fast retrieval
- Debounce client-side queries to reduce API calls
- Use `limit` parameter to control result size
- Fuzzy matching adds ~10-20ms latency but improves UX

---

## Meilisearch Integration

### Direct Access (Admin/Debug)

For debugging or admin purposes, Meilisearch can be accessed directly:

```bash
# Health check
GET http://meilisearch:7700/health

# Get index stats
GET http://meilisearch:7700/indexes/battles/stats

# Search directly (requires MEILI_MASTER_KEY)
POST http://meilisearch:7700/indexes/battles/search
Authorization: Bearer {MEILI_MASTER_KEY}
Content-Type: application/json

{
  "q": "pandemic",
  "limit": 20
}
```

**Note**: Direct Meilisearch access should be restricted to administrators only.

---

## Notes

- Search uses Meilisearch for fast, typo-tolerant searching
- All timestamps are in ISO 8601 format with timezone
- Entity and system autocomplete is case-insensitive
- Search results reflect user's feature access permissions
- Indexing lag is typically <5 seconds (battles searchable shortly after creation)
