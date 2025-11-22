# Battle Intel Frontend Specification

**Feature Key**: `battle-intel`
**Last Updated**: 2025-11-22

---

## Overview

This document defines the frontend implementation specification for the Battle Intel feature UI.

For the general feature specification, see [feature-spec.md](./feature-spec.md).

---

## Routes

### `/` (Home Dashboard)
**Component**: `HomePage`
**Section**: Intelligence Overview
**Access**: Requires `battle-intel` feature access (user role minimum)

### `/intel/alliances/:id`
**Component**: `AllianceIntelPage`
**Access**: Requires `battle-intel` feature access (user role minimum)

### `/intel/corporations/:id`
**Component**: `CorporationIntelPage`
**Access**: Requires `battle-intel` feature access (user role minimum)

### `/intel/characters/:id`
**Component**: `CharacterIntelPage`
**Access**: Requires `battle-intel` feature access (user role minimum)

### `/intel/characters/:id/ships/:shipTypeId`
**Component**: `CharacterShipDetailPage`
**Access**: Requires `battle-intel` feature access (user role minimum)

### `/admin/features/battle-intel/config`
**Component**: `BattleIntelConfigPage`
**Access**: SuperAdmin only

---

## Component Structure

```
frontend/src/modules/battle-intel/
├── pages/
│   ├── AllianceIntelPage.tsx
│   ├── CorporationIntelPage.tsx
│   ├── CharacterIntelPage.tsx
│   ├── CharacterShipDetailPage.tsx      # NEW: Ship-specific killmail history
│   └── BattleIntelConfigPage.tsx
├── components/
│   ├── IntelSummaryCards.tsx
│   ├── OpponentAnalysis.tsx
│   ├── ShipComposition.tsx
│   ├── GeographicActivity.tsx
│   ├── ActivityTimeline.tsx
│   ├── character/                        # NEW: Character-specific components
│   │   ├── CharacterShipTable.tsx        # Table of ships flown with stats
│   │   ├── CharacterLossList.tsx         # Paginated list of losses
│   │   ├── ShipKillmailHistory.tsx       # Killmail list for specific ship
│   │   └── LossCard.tsx                  # Individual loss card with ZKB link
│   └── config/
│       ├── CacheSettings.tsx
│       ├── DisplaySettings.tsx
│       ├── DataAvailabilityStats.tsx
│       └── ShipHistoryResetPanel.tsx     # NEW: Admin reset controls
├── hooks/
│   ├── useAllianceIntel.ts
│   ├── useCorpIntel.ts
│   ├── useCharacterIntel.ts
│   ├── useCharacterShips.ts              # NEW: Character ship history
│   ├── useCharacterLosses.ts             # NEW: Character losses with pagination
│   ├── useShipKillmails.ts               # NEW: Killmails for specific ship
│   ├── useGlobalSummary.ts
│   ├── useFeatureConfig.ts
│   └── useShipHistoryReset.ts            # NEW: Admin reset job management
├── api/
│   ├── intel.ts
│   ├── config.ts
│   └── ship-history.ts                   # NEW: Ship history API calls
└── types.ts
```

---

## Pages

### CharacterIntelPage

**Route**: `/intel/characters/:id`

**Sections**:
1. **Header**: Character name, portrait, corp/alliance info
2. **Overview Stats**: Battles, kills, losses, ISK efficiency, total ISK destroyed/lost
3. **Ships Flown**: Table of ships with stats (times flown, kills, losses, ISK)
4. **Recent Losses**: List of recent losses with ZKB links
5. **Top Opponents**: Most fought opponents

**State Management**:
```typescript
interface CharacterIntelPageState {
  characterId: string;
  isLoading: boolean;
  error: Error | null;
  intel: CharacterIntel | null;
  ships: CharacterShipSummary[];
  losses: CharacterLoss[];
  lossesNextCursor: string | null;
}
```

---

### CharacterShipDetailPage

**Route**: `/intel/characters/:id/ships/:shipTypeId`

**Sections**:
1. **Breadcrumb**: Back to character intel
2. **Ship Header**: Ship name, class, icon
3. **Summary Stats**: Times flown, kills, losses, ISK efficiency
4. **Killmail History**: Paginated table of all killmails

**Features**:
- Click any row to open ZKB in new tab
- Losses highlighted with red background/text
- Infinite scroll or "Load More" pagination
- Sort by date (default newest first)

---

## Components

### CharacterShipTable

Displays all ships a character has flown with aggregated statistics.

```typescript
interface CharacterShipTableProps {
  ships: CharacterShipSummary[];
  characterId: string;
  isLoading: boolean;
  onShipClick: (shipTypeId: string) => void;
}
```

**Columns**:
| Column | Description |
|--------|-------------|
| Ship | Ship name with icon |
| Times Flown | Total appearances on killmails |
| Kills | Times as attacker |
| Losses | Times as victim |
| ISK Destroyed | Total value of kills |
| ISK Lost | Total value of losses |
| ISK Efficiency | Percentage |

**Behavior**:
- Sortable by all numeric columns
- Click row to navigate to ship detail page
- Highlight losses > 5 as warning

---

### CharacterLossList

Displays paginated list of character losses with direct ZKB links.

```typescript
interface CharacterLossListProps {
  characterId: string;
  losses: CharacterLoss[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}
```

**Features**:
- Card-based layout for each loss
- Ship icon, name, system, date, value
- Direct "View on ZKillboard" button
- "Load More" button for pagination

---

### LossCard

Individual loss display card.

```typescript
interface LossCardProps {
  loss: CharacterLoss;
}
```

**Layout**:
```
┌──────────────────────────────────────────────┐
│ [Ship Icon] Loki                             │
│ Strategic Cruiser                            │
│                                              │
│ System: J115422 (Wormhole)                   │
│ Date: 2025-11-19 12:30 UTC                   │
│ Value: 350,000,000 ISK                       │
│                                              │
│ [View on ZKillboard →]                       │
└──────────────────────────────────────────────┘
```

---

### ShipKillmailHistory

Table of killmails for a specific ship type.

```typescript
interface ShipKillmailHistoryProps {
  killmails: ShipKillmail[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}
```

**Columns**:
| Column | Description |
|--------|-------------|
| Date | Killmail timestamp |
| System | Solar system name |
| Result | "Kill" (green) or "LOSS" (red) |
| Value | Killmail ISK value |
| Action | "View" button to ZKB |

---

### ShipHistoryResetPanel (Admin)

Admin panel for triggering ship history reset jobs.

```typescript
interface ShipHistoryResetPanelProps {
  onReset: (options: ResetOptions) => Promise<void>;
  currentJob: ResetJob | null;
}
```

**UI**:
```
┌─────────────────────────────────────────────────────────────┐
│ Ship History Data Management                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Current Status: 145,231 records                             │
│ Last Updated: 2025-11-22 10:30 UTC                          │
│                                                             │
│ Reset Mode:                                                 │
│ ○ Full Reset - Rebuild all ship history from scratch        │
│ ● Incremental - Update from specific date                   │
│                                                             │
│ From Date: [2025-11-01         ] (incremental only)         │
│ Batch Size: [1000              ]                            │
│                                                             │
│ [Start Reset]                                               │
│                                                             │
│ ─────────────────────────────────────────────────────────  │
│ Current Job: Running                                        │
│ Progress: ████████████░░░░░░░░ 60% (5,432 / 8,721)         │
│ Started: 2025-11-22 10:45 UTC                               │
│ [Cancel Job]                                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Hooks

### useCharacterShips

Fetches aggregated ship history for a character.

```typescript
function useCharacterShips(characterId: string): {
  ships: CharacterShipSummary[];
  totalIskDestroyed: string;
  totalIskLost: string;
  iskEfficiency: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};
```

### useCharacterLosses

Fetches paginated losses for a character.

```typescript
function useCharacterLosses(characterId: string, limit?: number): {
  losses: CharacterLoss[];
  totalLosses: number;
  totalIskLost: string;
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
};
```

### useShipKillmails

Fetches killmails for a specific character + ship combination.

```typescript
function useShipKillmails(
  characterId: string,
  shipTypeId: string
): {
  summary: ShipSummary;
  killmails: ShipKillmail[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
};
```

### useShipHistoryReset (Admin)

Manages ship history reset jobs.

```typescript
function useShipHistoryReset(): {
  startReset: (options: ResetOptions) => Promise<string>;
  currentJob: ResetJob | null;
  isStarting: boolean;
  error: Error | null;
  pollJobStatus: (jobId: string) => void;
};
```

---

## API Functions

### ship-history.ts

```typescript
// Get character's ship history (aggregated)
export async function getCharacterShips(
  characterId: string,
  limit?: number
): Promise<CharacterShipsResponse>;

// Get character's ship history for specific ship (with killmails)
export async function getCharacterShipKillmails(
  characterId: string,
  shipTypeId: string,
  cursor?: string
): Promise<CharacterShipKillmailsResponse>;

// Get character's losses
export async function getCharacterLosses(
  characterId: string,
  limit?: number,
  cursor?: string
): Promise<CharacterLossesResponse>;

// Admin: Start ship history reset
export async function startShipHistoryReset(
  options: ResetOptions
): Promise<ResetJobResponse>;

// Admin: Get reset job status
export async function getResetJobStatus(
  jobId: string
): Promise<ResetJobStatusResponse>;
```

---

## Types

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

interface CharacterLoss {
  killmailId: string;
  zkbUrl: string;
  shipTypeId: string;
  shipTypeName: string;
  shipClass: string;
  shipValue: string;
  systemId: string;
  systemName: string;
  occurredAt: string;
}

interface ShipKillmail {
  killmailId: string;
  zkbUrl: string;
  isLoss: boolean;
  shipValue: string | null;
  killmailValue: string;
  systemId: string;
  systemName: string;
  occurredAt: string;
}

interface ResetOptions {
  mode: 'full' | 'incremental';
  fromDate?: string;
  batchSize?: number;
}

interface ResetJob {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    processed: number;
    total: number;
    percentage: number;
  };
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}
```

---

## Styling Guidelines

### Loss Highlighting
- Loss rows/cards: `bg-red-50 dark:bg-red-900/20`
- Loss text: `text-red-600 dark:text-red-400`
- Loss badge: Red pill with "LOSS" text

### ISK Formatting
- Use abbreviated format by default: `350M`, `1.2B`
- Show full value on hover tooltip
- Positive efficiency: Green
- Negative efficiency (<50%): Red
- Neutral (50-60%): Yellow

### Ship Icons
- Use EVE Online type icons from image server
- Fallback to generic ship silhouette
- Size: 32x32 in tables, 48x48 in headers

### External Links
- ZKB links open in new tab
- Include external link icon indicator
- Button style: Secondary/outline

---

## Notes

- Intelligence data availability depends on Battle Reports configuration
- Display clear messaging when data is missing due to ingestion filters
- Link to Battle Reports config for data collection issues
- Ship history requires enriched killmail data - display warning if enrichments pending
- ISK values displayed as strings to avoid JavaScript number precision issues
