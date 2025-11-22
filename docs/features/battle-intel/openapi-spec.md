# Battle Intel OpenAPI Specification

**Feature Key**: `battle-intel`
**Last Updated**: 2025-11-22

---

## Overview

This document defines the OpenAPI/REST API specification for the Battle Intel feature.

For the general feature specification, see [feature-spec.md](./feature-spec.md).

---

## Base Path

All battle intel endpoints are prefixed with `/api/intel`

---

## Authentication

All endpoints require authentication via session cookie or API key.

Feature-scoped authorization: Requires `battle-intel` feature access with minimum role `user`.

---

## Endpoints

### Global Statistics Summary

```yaml
GET /intel/summary
```

### Alliance Intelligence

```yaml
GET /intel/alliances/{id}
```

### Corporation Intelligence

```yaml
GET /intel/corporations/{id}
```

### Character Intelligence

```yaml
GET /intel/characters/{id}
```

### Opponent Analysis

```yaml
GET /intel/alliances/{id}/opponents
```

### Ship Usage Analysis

```yaml
GET /intel/alliances/{id}/ships
```

### Character Ship History

```yaml
GET /intel/characters/{id}/ships
```

**Query Parameters**:

| Parameter    | Type   | Required | Description                                               |
| ------------ | ------ | -------- | --------------------------------------------------------- |
| `limit`      | number | No       | Maximum ship types to return (default: 20, max: 100)      |
| `shipTypeId` | number | No       | Filter to specific ship type for detailed killmail list   |

**Response (aggregated)**:

```yaml
200 OK:
  content:
    application/json:
      schema:
        type: object
        properties:
          characterId:
            type: string
          characterName:
            type: string
          totalIskDestroyed:
            type: string
          totalIskLost:
            type: string
          iskEfficiency:
            type: number
          ships:
            type: array
            items:
              type: object
              properties:
                shipTypeId:
                  type: string
                shipTypeName:
                  type: string
                shipClass:
                  type: string
                timesFlown:
                  type: integer
                kills:
                  type: integer
                losses:
                  type: integer
                iskDestroyed:
                  type: string
                iskLost:
                  type: string
          updatedAt:
            type: string
            format: date-time
```

**Response (filtered by shipTypeId)**:

```yaml
200 OK:
  content:
    application/json:
      schema:
        type: object
        properties:
          characterId:
            type: string
          characterName:
            type: string
          shipTypeId:
            type: string
          shipTypeName:
            type: string
          shipClass:
            type: string
          summary:
            type: object
            properties:
              timesFlown:
                type: integer
              kills:
                type: integer
              losses:
                type: integer
              iskDestroyed:
                type: string
              iskLost:
                type: string
          killmails:
            type: array
            items:
              type: object
              properties:
                killmailId:
                  type: string
                zkbUrl:
                  type: string
                isLoss:
                  type: boolean
                shipValue:
                  type: string
                killmailValue:
                  type: string
                systemId:
                  type: string
                systemName:
                  type: string
                occurredAt:
                  type: string
                  format: date-time
          updatedAt:
            type: string
            format: date-time
```

---

### Character Losses

```yaml
GET /intel/characters/{id}/losses
```

**Query Parameters**:

| Parameter | Type   | Required | Description                                       |
| --------- | ------ | -------- | ------------------------------------------------- |
| `limit`   | number | No       | Maximum losses to return (default: 50, max: 100)  |
| `cursor`  | string | No       | Pagination cursor for fetching more results       |

**Response**:

```yaml
200 OK:
  content:
    application/json:
      schema:
        type: object
        properties:
          characterId:
            type: string
          characterName:
            type: string
          totalLosses:
            type: integer
          totalIskLost:
            type: string
          losses:
            type: array
            items:
              type: object
              properties:
                killmailId:
                  type: string
                zkbUrl:
                  type: string
                shipTypeId:
                  type: string
                shipTypeName:
                  type: string
                shipClass:
                  type: string
                shipValue:
                  type: string
                systemId:
                  type: string
                systemName:
                  type: string
                occurredAt:
                  type: string
                  format: date-time
          nextCursor:
            type: string
            nullable: true
          updatedAt:
            type: string
            format: date-time
```

---

## Admin Endpoints

### Reset Ship History

```yaml
POST /admin/intel/reset-ship-history
```

**Authorization**: SuperAdmin only

**Request Body**:

```yaml
content:
  application/json:
    schema:
      type: object
      required:
        - mode
      properties:
        mode:
          type: string
          enum: [full, incremental]
          description: Reset mode - full truncates and rebuilds, incremental updates from date
        fromDate:
          type: string
          format: date-time
          description: For incremental mode, process killmails from this date onwards
        batchSize:
          type: integer
          default: 1000
          description: Number of killmails to process per batch
```

**Response**:

```yaml
200 OK:
  content:
    application/json:
      schema:
        type: object
        properties:
          jobId:
            type: string
            format: uuid
          status:
            type: string
            enum: [started, queued]
          estimatedKillmails:
            type: integer
          message:
            type: string

400 Bad Request:
  content:
    application/json:
      schema:
        type: object
        properties:
          error:
            type: string
          message:
            type: string

409 Conflict:
  content:
    application/json:
      schema:
        type: object
        properties:
          error:
            type: string
          message:
            type: string
          existingJobId:
            type: string
```

---

### Get Ship History Reset Job Status

```yaml
GET /admin/intel/reset-ship-history/{jobId}
```

**Authorization**: SuperAdmin only

**Response**:

```yaml
200 OK:
  content:
    application/json:
      schema:
        type: object
        properties:
          jobId:
            type: string
            format: uuid
          status:
            type: string
            enum: [pending, running, completed, failed]
          progress:
            type: object
            properties:
              processed:
                type: integer
              total:
                type: integer
              percentage:
                type: number
          startedAt:
            type: string
            format: date-time
          completedAt:
            type: string
            format: date-time
            nullable: true
          error:
            type: string
            nullable: true
```

---

## Feature Configuration API

### Get Battle Intel Configuration

```yaml
GET /admin/features/battle-intel/config
```

### Update Battle Intel Configuration

```yaml
PUT /admin/features/battle-intel/config
```

---

## Data Models

### PilotShipHistoryRecord

```typescript
interface PilotShipHistoryRecord {
  id: string;
  killmailId: string;
  characterId: string;
  shipTypeId: string;
  allianceId: string | null;
  corpId: string | null;
  systemId: string;
  isLoss: boolean;
  shipValue: string | null;
  killmailValue: string | null;
  occurredAt: string; // ISO 8601 date-time
  zkbUrl: string;
  createdAt: string; // ISO 8601 date-time
}
```

### CharacterShipSummary

```typescript
interface CharacterShipSummary {
  shipTypeId: string;
  shipTypeName: string;
  shipClass: string;
  timesFlown: number;
  kills: number;
  losses: number;
  iskDestroyed: string;
  iskLost: string;
}
```

### CharacterLoss

```typescript
interface CharacterLoss {
  killmailId: string;
  zkbUrl: string;
  shipTypeId: string;
  shipTypeName: string;
  shipClass: string;
  shipValue: string;
  systemId: string;
  systemName: string;
  occurredAt: string; // ISO 8601 date-time
}
```

---

## Notes

- Battle Intel computes statistics from Battle Reports data
- Data availability depends on Battle Reports ingestion configuration
- Statistics are cached with configurable TTL
- Ship history is populated from enriched killmail data
- ISK values are stored as strings to handle large numbers without precision loss
