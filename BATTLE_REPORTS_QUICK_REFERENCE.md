# Battle Reports - Quick Reference Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                         │
│  BattlesView.tsx - Battle list + Detail viewer (614 lines)  │
│  └─ Left Panel: Battle Feed (cursor pagination)             │
│  └─ Right Panel: Battle Details + Participants + Killmails  │
└────────────────────────┬────────────────────────────────────┘
                         │ API Calls
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                  BACKEND API (Fastify)                      │
│  battles.ts - 5 main endpoints                              │
│  └─ GET /battles                                            │
│  └─ GET /battles/:id                                        │
│  └─ GET /alliances/:id/battles                              │
│  └─ GET /corporations/:id/battles                           │
│  └─ GET /characters/:id/battles                             │
│  └─ Entity detail endpoints (statistics)                    │
└────────────────────────┬────────────────────────────────────┘
                         │ Repository Pattern
                         ↓
┌─────────────────────────────────────────────────────────────┐
│          DATABASE LAYER (BattleRepository)                  │
│  Methods:                                                   │
│  └─ createBattle()                                          │
│  └─ listBattles(filters, limit, cursor)                    │
│  └─ getBattleById()                                         │
│  └─ getAllianceStatistics()                                 │
│  └─ getCorporationStatistics()                              │
│  └─ getCharacterStatistics()                                │
└────────────────────────┬────────────────────────────────────┘
                         │ Kysely ORM
                         ↓
┌─────────────────────────────────────────────────────────────┐
│         POSTGRESQL TABLES                                   │
│  ├─ battles (id, systemId, spaceType, startTime, ...)      │
│  ├─ battle_killmails (battleId, killmailId, ...)           │
│  ├─ battle_participants (battleId, characterId, ...)       │
│  ├─ killmail_events (killmailId, victimAllianceId, ...)    │
│  └─ killmail_enrichments (killmailId, status, payload) │
└─────────────────────────────────────────────────────────────┘
```

## Current Filter Support

### Available Filters
- **spaceType**: 'kspace' | 'jspace' | 'pochven'
- **systemId**: EVE system ID
- **allianceId**: EVE alliance ID (finds battles where participated)
- **corpId**: EVE corporation ID (finds battles where participated)
- **characterId**: EVE character ID (finds battles where participated)
- **since**: Date filter (startTime >= since)
- **until**: Date filter (startTime <= until)
- **limit**: 1-100 (default 20)
- **cursor**: Base64 pagination token

### Query Implementation
```
Filters → BattleRepository.listBattles()
        → Builds Kysely query
        → Applies WHERE clauses
        → Orders by (startTime DESC, id DESC)
        → Returns paginated results
```

## Data Models at a Glance

### BattleSummary (Frontend)
```typescript
{
  id: UUID,
  systemId: string,
  systemName: string | null,
  spaceType: 'kspace' | 'jspace' | 'pochven',
  startTime: ISO8601,
  endTime: ISO8601,
  totalKills: string,
  totalIskDestroyed: string,
  zkillRelatedUrl: URL
}
```

### BattleDetail (Frontend)
```typescript
extends BattleSummary {
  createdAt: ISO8601,
  killmails: KillmailDetail[],
  participants: BattleParticipant[]
}
```

### BattleRecord (Database)
```
battles table columns:
├─ id: UUID (PRIMARY KEY)
├─ systemId: bigint
├─ spaceType: ENUM('kspace', 'jspace', 'pochven')
├─ startTime: timestamptz
├─ endTime: timestamptz
├─ totalKills: bigint
├─ totalIskDestroyed: numeric
├─ zkillRelatedUrl: text
└─ createdAt: timestamptz (auto)
```

## Key Implementation Files

| Path | Lines | Purpose |
|------|-------|---------|
| `backend/api/src/routes/battles.ts` | 484 | API endpoints & filtering logic |
| `frontend/src/modules/battles/components/BattlesView.tsx` | 614 | Main React component |
| `packages/database/src/repositories/battle-repository.ts` | 740 | Database queries |
| `frontend/src/modules/battles/api.ts` | 140 | Frontend API client |
| `packages/database/src/schema.ts` | 220+ | Database schema definitions |
| `packages/database/src/types.ts` | 150+ | TypeScript type definitions |

## Pagination Strategy

**Cursor-Based (Keyset Pagination)**
- Avoids offset problems with large datasets
- Handles duplicate timestamps via composite key: `(startTime, id)`
- Format: Base64-encoded JSON: `{startTime: ISO8601, id: UUID}`
- Order: `ORDER BY startTime DESC, id DESC`

## Entity-Specific Statistics

### Available for Alliances, Corporations, Characters

```
statistics {
  totalBattles: number
  totalKillmails: number
  totalIskDestroyed: bigint
  totalIskLost: bigint
  iskEfficiency: percentage
  averageParticipants: number
  mostUsedShips: [{shipTypeId, count}]
  topOpponents: [{allianceId, battleCount}]
  topSystems: [{systemId, battleCount}]
  // Plus entity-specific fields
}
```

## Killmail Enrichment Flow

```
Raw Killmail Event
    ↓
ESI API Fetch (external service)
    ↓
killmail_enrichments table
├─ status: 'pending' → 'processing' → 'succeeded' | 'failed'
├─ payload: Full ESI response (JSONB)
├─ error: Error message if failed
└─ fetchedAt: Completion timestamp
```

## Current UI Flow

1. User opens Battles tab
2. BattlesView loads with `fetchBattles(limit: 10)`
3. First battle auto-selected → `fetchBattleDetail(battleId)`
4. Left panel: Battle list (scrollable, 350px wide)
5. Right panel: Battle details (detail, participants, killmails)
6. "Load more battles" button uses cursor pagination

## Enhancement Roadmap Considerations

### Phase 1: Filtering UI
- Date range picker component
- Space type selector (radio/buttons)
- Entity search/autocomplete (alliance, corp, character)
- ISK range slider
- Participant count filter
- Submit/Reset buttons

### Phase 2: Advanced Features
- Multi-entity AND/OR filtering
- Saved filter presets
- Battle comparison view
- Statistics dashboard
- Export battle data (CSV/JSON)

### Phase 3: Performance
- Add more indexes on battle_participants (allianceId, corpId)
- Optimize killmail_events queries
- Consider denormalization for statistics
- Cache entity statistics

### Phase 4: UX
- Infinite scroll vs pagination toggle
- Favorite battles/entities
- Quick view modals
- Alliance detail page redesign
- Mobile responsive improvements

## Testing Coverage

- `api.test.ts`: Frontend API client tests
- Zod schema validation on both client & server
- Manual testing for BigInt/numeric conversions
- Integration tests needed for filter combinations

## Performance Notes

- Default limit: 20 battles (frontend uses 10 for UX)
- Max limit: 100 battles (API constraint)
- Indexes on: (systemId, startTime, endTime), characterId, killmailId
- Large dataset concern: Many battles with same timestamp
  - Solution: Composite cursor key (startTime + id)

---

**Analysis Generated:** 2025-11-10
**Current Implementation Status:** Foundation complete, ready for UI expansion
