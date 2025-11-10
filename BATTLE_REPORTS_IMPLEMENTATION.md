# Battle Reports Implementation Analysis

## Executive Summary

The battle-monitor project has a comprehensive but foundational battle reports system that tracks PvP battles in EVE Online with detailed killmail and participant information. The current implementation includes database persistence, API endpoints with filtering, and a basic frontend UI. It's well-structured for expansion with enhanced filtering and alliance-focused search features.

---

## 1. Battle Reports Package

**Location:** `/Users/andrew/Projects/battle-monitor/packages/battle-reports/`

### Structure
```
packages/battle-reports/
├── src/
│   ├── clustering/
│   │   ├── engine.ts       # Clustering algorithm implementation
│   │   ├── service.ts      # Clustering service
│   │   └── index.ts        # Exports
│   └── index.ts            # Main package exports
```

### Exports
The package exports clustering functionality:
- `ClusteringEngine` - Core clustering algorithm
- `ClustererService` - Service wrapper
- Types: `ClusteringParameters`, `BattlePlan`, `ClusterResult`, `ClustererStats`

### Note
The clustering module appears to be related to battle grouping/analysis but is separate from the main data model. The core battle reports functionality is managed through the database package.

---

## 2. Frontend Battle Reports

**Location:** `/Users/andrew/Projects/battle-monitor/frontend/src/modules/battles/`

### Structure
```
frontend/src/modules/battles/
├── components/
│   └── BattlesView.tsx     # Main battle list and detail view
├── api.ts                  # Frontend API client
└── api.test.ts            # API tests
```

### Current Routes and UI

#### Tab Integration
- Integrated as a tab in the main app (`src/modules/app/index.tsx`)
- Tab ID: `'battles'` with label `'Battles'`
- Renders `<BattlesView />` component

#### BattlesView Component Features

**Left Sidebar (Battle List)**
- Displays up to 10 battles per page with pagination
- Shows for each battle:
  - Space type (emoji: 🌌 K-Space, 🕳️ J-Space, ⚡ Pochven)
  - System name or ID
  - Start time
  - Total kills count
  - Total ISK destroyed
  - zKillboard link
- "Load more battles" button for cursor-based pagination
- Selection state with visual feedback

**Right Panel (Battle Details)**
- Selected battle summary with:
  - Space type indicator
  - Duration (start → end time)
  - Total kills and ISK destroyed
  - Link to zKillboard
  
- **Participants Section** (~389 lines):
  - Shows all battle participants
  - Displays emoji: 💀 for victims, ⚔️ for attackers
  - Character name with avatar (24px)
  - Ship type name
  - Corporation name with avatar (16px)
  - Alliance name with avatar (16px)
  - Scrollable list (max 400px height)
  
- **Killmails Section**:
  - List of all killmails in the battle
  - For each killmail:
    - Killmail ID
    - Occurrence timestamp
    - Victim character with avatar
    - Attacker alliances list (up to 5 displayed)
    - ISK value
    - Enrichment status (pending/processing/succeeded/failed)
    - Error message if enrichment failed
    - Link to zKillboard

### API Client (`api.ts`)

**Types Defined:**
```typescript
- BattleSummary        // Battle overview data
- BattleDetail         // Complete battle with killmails & participants
- KillmailDetail       // Individual killmail data
- BattlesListResponse  // Paginated response
- FetchBattlesOptions  // Request options
- FetchBattleDetailOptions
```

**Functions:**
1. `fetchBattles(options)` - List battles with pagination
   - Parameters: `limit`, `cursor`, `signal`, `baseUrl`, `fetchFn`
   
2. `fetchBattleDetail(battleId, options)` - Get battle details
   - Parameters: `baseUrl`, `fetchFn`, `signal`
   
3. `formatIsk(value)` - Format ISK amounts for display

### Current Filtering
- **No filtering UI** currently present
- Basic pagination with cursor support
- Default limit: 10 battles
- Max limit: 100

---

## 3. Backend API

**Location:** `/Users/andrew/Projects/battle-monitor/backend/api/src/routes/battles.ts`

### Current Endpoints

#### List Battles
```
GET /battles
```
Query parameters (from BattleListQuerySchema):
- `limit` (optional): 1-100, default 20
- `cursor` (optional): Base64-encoded pagination cursor
- `spaceType` (optional): 'kspace' | 'jspace' | 'pochven'
- `systemId` (optional): Numeric system ID
- `allianceId` (optional): Numeric alliance ID
- `corpId` (optional): Numeric corporation ID
- `characterId` (optional): Numeric character ID
- `since` (optional): Start date filter
- `until` (optional): End date filter

**Response:**
```typescript
{
  items: BattleSummary[],
  nextCursor: string | null
}
```

#### Entity-Specific Battle Lists
```
GET /alliances/:id/battles
GET /corporations/:id/battles
GET /characters/:id/battles
```
- Same query parameters as `/battles`
- Automatically filtered by entity ID

#### Get Battle Details
```
GET /battles/:id
```
Returns full battle with all killmails and participants.

#### Entity Statistics
```
GET /alliances/:id
GET /corporations/:id
GET /characters/:id
```
Returns comprehensive statistics including:
- Total battles/killmails
- ISK destroyed/lost
- Efficiency calculations
- Most used ships
- Top opponents
- Top systems/favorite systems/top pilots

### Filtering Implementation

**BattleFilters Interface:**
```typescript
interface BattleFilters {
  spaceType?: SpaceType;
  systemId?: bigint;
  allianceId?: bigint;
  corpId?: bigint;
  characterId?: bigint;
  since?: Date;
  until?: Date;
}
```

**Filter Logic in Repository:**
- Space type: Direct equality match
- System ID: Direct equality match
- Time range: `startTime >= since` and `startTime <= until`
- Alliance/Corp/Character: Subquery on `killmail_events` table to find battles where the entity participated (as victim or attacker)

**Cursor-Based Pagination:**
- Cursor format: Base64-encoded JSON with `{startTime, id}`
- Composite ordering: `startTime DESC, id DESC`
- Used to handle duplicate timestamps

### Query Schema Validation
```typescript
BattleListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  spaceType: SpaceTypeSchema.optional(),
  systemId: z.string().regex(/^\d+$/).optional(),
  allianceId: z.string().regex(/^\d+$/).optional(),
  corpId: z.string().regex(/^\d+$/).optional(),
  characterId: z.string().regex(/^\d+$/).optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
})
```

---

## 4. Database Schema

**Location:** `/Users/andrew/Projects/battle-monitor/packages/database/src/schema.ts`

### Core Tables

#### `battles`
Main battle record table.

**Columns:**
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key, unique battle ID |
| `systemId` | bigint | EVE system ID |
| `spaceType` | space_type enum | 'kspace' \| 'jspace' \| 'pochven' |
| `startTime` | timestamptz | Battle start time |
| `endTime` | timestamptz | Battle end time |
| `totalKills` | bigint | Total killmails in battle |
| `totalIskDestroyed` | numeric | Total ISK value destroyed |
| `zkillRelatedUrl` | text | URL to zKillboard battle report |
| `createdAt` | timestamptz | Record creation time (auto) |

**Indexes:**
- `battles_system_time_idx`: (systemId, startTime, endTime)

#### `battle_killmails`
Killmails associated with each battle.

**Columns:**
| Column | Type | Notes |
|--------|------|-------|
| `battleId` | UUID | Foreign key to battles.id (cascade delete) |
| `killmailId` | bigint | EVE killmail ID |
| `zkbUrl` | text | URL to zKillboard killmail |
| `occurredAt` | timestamptz | Killmail timestamp |
| `victimAllianceId` | bigint \| null | Victim's alliance |
| `attackerAllianceIds` | bigint[] | Array of attacker alliances |
| `iskValue` | numeric \| null | ISK value of kill |
| `sideId` | smallint \| null | Side ID (0 or 1 for grouping) |

**Primary Key:** (battleId, killmailId)
**Indexes:** killmailId

#### `battle_participants`
Individual character participation in battles.

**Columns:**
| Column | Type | Notes |
|--------|------|-------|
| `battleId` | UUID | Foreign key to battles.id (cascade delete) |
| `characterId` | bigint | EVE character ID |
| `allianceId` | bigint \| null | Character's alliance in battle |
| `corpId` | bigint \| null | Character's corporation |
| `shipTypeId` | bigint \| null | Ship type flown |
| `sideId` | smallint \| null | Side ID (0 or 1) |
| `isVictim` | boolean | True if pod/ship was destroyed |

**Primary Key:** (battleId, characterId, shipTypeId)
**Indexes:** (characterId, battleId)

#### `killmail_events`
Enriched killmail event data (from EVE ESI API).

**Columns:**
| Column | Type | Notes |
|--------|------|-------|
| `killmailId` | bigint | EVE killmail ID |
| `systemId` | bigint | System where kill occurred |
| `occurredAt` | timestamptz | Kill timestamp |
| `victimAllianceId` | bigint \| null | Victim alliance |
| `victimCorpId` | bigint \| null | Victim corporation |
| `victimCharacterId` | bigint \| null | Victim character |
| `attackerAllianceIds` | bigint[] | All attacker alliances |
| `attackerCorpIds` | bigint[] | All attacker corporations |
| `attackerCharacterIds` | bigint[] | All attacker characters |
| `iskValue` | numeric \| null | ISK value |
| `zkbUrl` | text | zKillboard URL |
| `fetchedAt` | timestamptz | When data was fetched |
| `processedAt` | timestamptz \| null | When battle was assigned |
| `battleId` | UUID \| null | Assigned battle ID |

#### `killmail_enrichments`
Enrichment data for killmails (ESI payload).

**Columns:**
| Column | Type | Notes |
|--------|------|-------|
| `killmailId` | bigint | Foreign key to killmail_events |
| `status` | string | 'pending' \| 'processing' \| 'succeeded' \| 'failed' |
| `payload` | jsonb \| null | ESI API response data |
| `error` | string \| null | Error message if status is 'failed' |
| `fetchedAt` | timestamptz \| null | When enrichment data was fetched |
| `updatedAt` | timestamptz | Last update time |
| `createdAt` | timestamptz | Record creation time |

### Relationships Diagram
```
battles (1) ──── (N) battle_killmails
           └──── (N) battle_participants

killmail_events (1) ──── (1) killmail_enrichments
                └──── (N) battles [via battleId]
```

### Data Types Notes
- Large integer IDs use `bigint` type (for EVE IDs)
- ISK values use `numeric` (for arbitrary precision)
- Timestamps are `timestamptz` (timezone-aware)
- Arrays stored natively in PostgreSQL (e.g., `bigint[]`)

---

## 5. Type System

### Frontend Types (`frontend/src/modules/battles/api.ts`)

```typescript
BattleSummary {
  id: UUID string
  systemId: string (numeric)
  systemName: string | null
  spaceType: 'kspace' | 'jspace' | 'pochven'
  startTime: ISO 8601 string
  endTime: ISO 8601 string
  totalKills: string (numeric)
  totalIskDestroyed: string (numeric, ISK)
  zkillRelatedUrl: URL string
}

BattleDetail extends BattleSummary {
  createdAt: ISO 8601 string
  killmails: KillmailDetail[]
  participants: BattleParticipant[]
}

KillmailDetail {
  killmailId: string (numeric)
  occurredAt: ISO 8601 string
  victimAllianceId: string | null
  victimAllianceName: string | null
  victimCorpId: string | null
  victimCorpName: string | null
  victimCharacterId: string | null
  victimCharacterName: string | null
  attackerAllianceIds: string[] (numeric)
  attackerAllianceNames: (string | null)[]
  attackerCorpIds: string[] (numeric)
  attackerCorpNames: (string | null)[]
  attackerCharacterIds: string[] (numeric)
  attackerCharacterNames: (string | null)[]
  iskValue: string | null (numeric, ISK)
  zkbUrl: URL string
  enrichment: KillmailEnrichment | null
}

BattleParticipant {
  battleId: UUID string
  characterId: string (numeric)
  characterName: string | null
  allianceId: string | null (numeric)
  allianceName: string | null
  corpId: string | null (numeric)
  corpName: string | null
  shipTypeId: string | null (numeric)
  shipTypeName: string | null
  sideId: string | null (numeric)
  isVictim: boolean
}
```

### Database Types (`packages/database/src/types.ts`)

```typescript
BattleRecord extends BattleInsert {
  createdAt: Date
}

BattleKillmailRecord {
  battleId: UUID
  killmailId: bigint
  zkbUrl: string
  occurredAt: Date
  victimAllianceId: bigint | null
  victimCorpId: bigint | null
  victimCharacterId: bigint | null
  attackerAllianceIds: bigint[]
  attackerCorpIds: bigint[]
  attackerCharacterIds: bigint[]
  iskValue: bigint | null
  sideId: bigint | null
  enrichment: KillmailEnrichmentRecord | null
}

BattleParticipantRecord {
  battleId: UUID
  characterId: bigint
  allianceId: bigint | null
  corpId: bigint | null
  shipTypeId: bigint | null
  sideId: bigint | null
  isVictim: boolean
}

BattleWithDetails extends BattleRecord {
  killmails: BattleKillmailRecord[]
  participants: BattleParticipantRecord[]
}
```

---

## 6. Current Capabilities & Gaps

### What Works Well
✓ Complete battle tracking and persistence
✓ Multi-level filtering (space type, system, entity participation)
✓ Cursor-based pagination (handles duplicates)
✓ Detailed killmail information with enrichment
✓ Participant tracking with corporation & alliance info
✓ Entity detail pages with comprehensive statistics
✓ zKillboard integration (links and URL generation)

### Current Limitations
✗ No search functionality (must use direct filters)
✗ No alliance history or trend analysis
✗ No multi-alliance battle filtering (AND/OR logic)
✗ No ISK value filtering/ranges
✗ No ship type filtering
✗ Limited UI for advanced filtering
✗ No saved filter presets
✗ No battle statistics dashboard
✗ No comparison tools between battles/entities

### Enhancement Opportunities
1. **Alliance-focused page** with dedicated search interface
2. **Advanced filtering UI** with form controls
3. **Date range picker** (currently using raw timestamps)
4. **Multi-select filters** (multiple alliances, corps, ships)
5. **ISK destroyed range** filters
6. **Participant count** filters
7. **Statistics aggregation** by various dimensions
8. **Favorites/bookmarks** for quick access
9. **Battle export** functionality

---

## 7. Code Patterns & Architecture

### Database Repository Pattern
- `BattleRepository` class encapsulates all DB operations
- Methods return domain-typed objects (not raw DB rows)
- Filters object passed to methods for flexible queries
- Cursor pagination handled at repository level

### API Route Pattern
- Routes receive `FastifyInstance`, `BattleRepository`, `NameEnricher`
- Request/response validation with Zod schemas
- OpenTelemetry tracing integration
- Error handling with appropriate HTTP status codes

### Frontend API Pattern
- Separate `api.ts` file per module
- Zod schema validation on client side
- Generic fetch wrapper with retry/abort support
- Cursor pagination abstraction

### Naming Conventions
- Database: snake_case (system_id, battle_id)
- TypeScript: camelCase (systemId, battleId)
- Enums: lowercase (kspace, jspace, pochven)
- BigInt conversion utilities (toBigInt, serializeBigInt)

---

## 8. Technical Stack Summary

**Database:** PostgreSQL with Kysely ORM
**Backend:** Fastify with Zod validation
**Frontend:** React with TypeScript
**Data Flow:** REST API with cursor pagination
**Serialization:** BigInt/numeric conversion utilities
**Enrichment:** External ESI API integration for killmail details

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `/backend/api/src/routes/battles.ts` | Main API endpoint implementation |
| `/frontend/src/modules/battles/api.ts` | Frontend API client |
| `/frontend/src/modules/battles/components/BattlesView.tsx` | Main UI component (614 lines) |
| `/packages/database/src/repositories/battle-repository.ts` | Database access layer (740 lines) |
| `/packages/database/src/schema.ts` | Database table schemas |
| `/packages/database/src/types.ts` | TypeScript type definitions |
| `/backend/api/src/schemas.ts` | API request/response schemas |
| `/packages/database/migrations/0001_init.ts` | Initial schema migration |

