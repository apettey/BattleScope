# Battle Reports Frontend Specification

**Feature Key**: `battle-reports`
**Last Updated**: 2025-11-10

---

## Overview

This document defines the frontend implementation specification for the Battle Reports feature UI.

For the general feature specification, see [feature-spec.md](./feature-spec.md).

---

## Routes

### `/battles`
**Component**: `BattlesPage`
**Access**: Requires `battle-reports` feature access (user role minimum)

### `/battles/:id`
**Component**: `BattleDetailPage`
**Access**: Requires `battle-reports` feature access (user role minimum)

### `/killmails`
**Component**: `RecentKillmailsPage`
**Access**: Requires `battle-reports` feature access (user role minimum)

### `/admin/features/battle-reports/config`
**Component**: `BattleReportsConfigPage`
**Access**: SuperAdmin only

---

## Component Structure

```
frontend/src/modules/battle-reports/
├── pages/
│   ├── BattlesPage.tsx
│   ├── BattleDetailPage.tsx
│   ├── RecentKillmailsPage.tsx
│   └── BattleReportsConfigPage.tsx
├── components/
│   ├── BattleCard.tsx
│   ├── BattleList.tsx
│   ├── BattleFilters.tsx
│   ├── KillmailCard.tsx
│   ├── KillmailList.tsx
│   ├── KillmailStream.tsx
│   ├── ParticipantList.tsx
│   └── config/
│       ├── IngestionFilters.tsx
│       ├── ClusteringSettings.tsx
│       └── IngestionStats.tsx
├── hooks/
│   ├── useBattles.ts
│   ├── useBattleDetail.ts
│   ├── useRecentKillmails.ts
│   ├── useKillmailStream.ts
│   └── useFeatureConfig.ts
├── api/
│   ├── battles.ts
│   ├── killmails.ts
│   └── config.ts
└── types.ts
```

---

## Pages

### BattlesPage

**Purpose**: Browse and filter battles with comprehensive filtering options

**Layout**:
```
┌────────────────────────────────────────────────────────────────┐
│ Battle Reports                                    [? Help]      │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─ Filters ────────────────────────────────────────────────┐  │
│ │                                                           │  │
│ │ [🔍 Search alliances, corps, characters, systems...]     │  │
│ │                                                           │  │
│ │ Space Type:  [K-Space] [J-Space] [Pochven]              │  │
│ │ Security:    [High] [Low] [Null]                         │  │
│ │ Time Range:  [Last 24h ▼]                                │  │
│ │                                                           │  │
│ │ Advanced Filters ▼                                        │  │
│ │   ISK Range: [Min ___] to [Max ___]                      │  │
│ │   Kills: [Min ___] to [Max ___]                          │  │
│ │   Participants: [Min ___] to [Max ___]                   │  │
│ │   Duration: [Min ___] to [Max ___]                       │  │
│ │                                                           │  │
│ │ [Clear All]                   [3 filters active]          │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ Sort by: [Start Time ▼] [Newest First ▼]       [1,234 battles] │
│                                                                 │
│ ┌─ Battle Card ──────────────────────────────────────────────┐ │
│ │ J115422 • Wormhole                    18:42 UTC            │ │
│ │ 14 kills • 3.6B ISK • 28 pilots • 23 min                  │ │
│ │ Pandemic Legion (12) vs Goonswarm Federation (13)         │ │
│ │                                    [View Details →]        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ Battle Card ──────────────────────────────────────────────┐ │
│ │ M-OEE8 • Null-sec                     14:30 UTC            │ │
│ │ 87 kills • 42.3B ISK • 156 pilots • 1h 15min              │ │
│ │ Test Alliance (89) vs Brave Collective (67)               │ │
│ │                                    [View Details →]        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [Load More]                                                    │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Features**:
- **Universal search bar**: Type-ahead search for alliances, corps, characters, systems
- **Quick filters**: One-click space type and security level filters
- **Time range presets**: Last hour, 24h, 7d, 30d, custom date picker
- **Advanced filters panel**: Collapsible section with range filters for ISK, kills, participants, duration
- **Active filter chips**: Display applied filters with remove button
- **Sorting options**: Sort by start time, ISK destroyed, kills, duration, participants
- **Battle cards**: Compact view with key metrics and main participants
- **Infinite scroll**: Automatic loading as user scrolls
- **Result count**: Show approximate total matching battles
- **Save filter presets**: (Future) Save commonly used filter combinations

**State Management**:
```typescript
interface BattlesPageState {
  battles: Battle[];
  filters: BattleFilters;
  loading: boolean;
  hasMore: boolean;
  cursor: string | null;
  sortBy: 'start_time' | 'isk_destroyed' | 'kills' | 'duration' | 'participants';
  sortOrder: 'asc' | 'desc';
  totalCount: number;
}

interface BattleFilters {
  // Space & Location
  spaceType: SpaceType[];
  securityLevel: SecurityLevel[];
  systemIds: string[];
  systemName?: string;
  regionIds: string[];

  // Entities (supports both ID and name search)
  allianceIds: string[];
  allianceName?: string;
  corpIds: string[];
  corpName?: string;
  characterIds: string[];
  characterName?: string;

  // Battle characteristics
  minKills?: number;
  maxKills?: number;
  minIsk?: string; // bigint as string
  maxIsk?: string;
  minParticipants?: number;
  maxParticipants?: number;
  minDuration?: number; // seconds
  maxDuration?: number;

  // Time
  startTimeAfter?: Date;
  startTimeBefore?: Date;
  timeRange?: 'last_hour' | 'last_24h' | 'last_7d' | 'last_30d' | 'custom';
}
```

**Search Functionality**:
The universal search bar provides autocomplete for all entity types:
```typescript
interface SearchResult {
  type: 'alliance' | 'corporation' | 'character' | 'system';
  id: string;
  name: string;
  ticker?: string;
  metadata?: string; // e.g., "45 battles" or "Null-sec"
}
```

When a user selects a search result, it's added to the appropriate filter array and displayed as a chip.

---

### BattleDetailPage

**Purpose**: View detailed battle information

**Sections**:
- Battle overview (system, time, participants, ISK destroyed)
- Link to zKillboard related kills
- Participant list grouped by side
- Killmail timeline with links to zKillboard

**Data Loading**:
- Fetch battle details on mount
- Show loading skeleton while fetching
- Error state if battle not found

---

### RecentKillmailsPage

**Purpose**: Real-time killmail feed

**Features**:
- Live indicator (connected/disconnected)
- Space type filter tabs
- Auto-updating list via SSE
- Link to battle (if associated)
- Link to zKillboard

**SSE Connection**:
```typescript
useEffect(() => {
  const eventSource = new EventSource('/api/killmails/stream');

  eventSource.addEventListener('killmail', (event) => {
    const killmail = JSON.parse(event.data);
    addKillmail(killmail);
  });

  eventSource.addEventListener('heartbeat', (event) => {
    updateLastHeartbeat(new Date());
  });

  return () => eventSource.close();
}, []);
```

---

### BattleReportsConfigPage

**Purpose**: Configure battle reports ingestion and clustering

**Sections**:

1. **Ingestion Filters**
   - Minimum pilot threshold
   - Tracked alliances (searchable multi-select)
   - Tracked corporations (searchable multi-select)
   - Tracked characters (searchable multi-select)
   - Ignore unlisted toggle
   - System whitelist
   - Space type checkboxes
   - K-Space security level checkboxes

2. **Enrichment Settings**
   - Auto-enrichment toggle
   - API throttle slider (100-5000ms)

3. **Clustering Settings**
   - Auto-clustering toggle
   - Time window input (minutes)
   - Minimum kills per battle
   - Maximum kill gap (minutes)
   - Reclustering interval (minutes)

4. **Current Statistics**
   - 24-hour ingestion stats
   - Acceptance rate chart
   - Rejection breakdown
   - Current queue depth

**Form Validation**:
- Client-side validation before submit
- Server-side validation errors displayed inline
- Confirmation dialog for changes affecting data collection

---

## Components

### BattleCard

**Props**:
```typescript
interface BattleCardProps {
  battle: Battle;
  onClick?: () => void;
}
```

**Display**:
- System name and space type badge
- Start/end time with duration
- Kill count and ISK destroyed
- Main participants (alliances)
- Link to detail page

---

### KillmailCard

**Props**:
```typescript
interface KillmailCardProps {
  killmail: Killmail;
  showBattleLink?: boolean;
}
```

**Display**:
- Timestamp and system
- Victim info (character, corp, alliance, ship)
- ISK value
- Participant count
- Links (zKillboard, battle if associated)

---

### BattleFilters

**Props**:
```typescript
interface BattleFiltersProps {
  filters: BattleFilters;
  onChange: (filters: BattleFilters) => void;
  resultCount?: number;
}
```

**Features**:
- **Universal Search Bar**: Autocomplete search for entities and systems
- **Quick Filters**: Toggle buttons for space types and security levels
- **Time Range Selector**: Dropdown with presets + custom date picker
- **Advanced Filters Panel**: Collapsible section with range inputs
- **Active Filter Chips**: Display applied filters with remove buttons
- **Clear All Button**: Reset all filters to default
- **Result Count**: Show number of battles matching current filters

**Sub-components**:
- `EntitySearchBar` - Universal search with autocomplete
- `SpaceTypeToggle` - Space type quick filter buttons
- `SecurityLevelToggle` - Security level quick filter buttons
- `TimeRangeSelector` - Time range dropdown and date picker
- `AdvancedFiltersPanel` - Collapsible panel with range filters
- `FilterChip` - Individual active filter chip with remove button

---

### EntitySearchBar

**Props**:
```typescript
interface EntitySearchBarProps {
  placeholder?: string;
  onSelectEntity: (entity: SearchResult) => void;
  types?: ('alliance' | 'corporation' | 'character' | 'system')[];
}
```

**Features**:
- Debounced search (300ms)
- Autocomplete dropdown with grouped results
- Keyboard navigation (up/down arrows, enter to select)
- Loading indicator during search
- "No results" state
- Recent searches (local storage)
- Result metadata display (battle count, ticker, etc.)

**Implementation**:
```typescript
const EntitySearchBar: FC<EntitySearchBarProps> = ({ onSelectEntity }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const { data, loading } = useEntitySearch(query, { enabled: query.length >= 2 });

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search alliances, corps, characters, systems..."
        className="w-full px-4 py-2 border rounded-lg"
      />
      {loading && <LoadingSpinner />}
      {results && (
        <SearchResultsDropdown
          results={results}
          onSelect={(result) => {
            onSelectEntity(result);
            setQuery('');
          }}
        />
      )}
    </div>
  );
};
```

---

### FilterChip

**Props**:
```typescript
interface FilterChipProps {
  label: string;
  value: string;
  onRemove: () => void;
}
```

**Display**:
```
[🏢 Pandemic Legion  ×]  [⏰ Last 24h  ×]  [⚡ Min 10 kills  ×]
```

**Features**:
- Icon based on filter type (alliance, time, range, etc.)
- Remove button (×)
- Hover state with tooltip showing full filter details

---

### KillmailStream

**Props**:
```typescript
interface KillmailStreamProps {
  spaceType?: SpaceType[];
  onKillmail?: (killmail: Killmail) => void;
}
```

**Features**:
- SSE connection management
- Auto-reconnect on disconnect
- Connection status indicator
- Buffering during connection issues

---

## Hooks

### useBattles

```typescript
interface UseBattlesResult {
  battles: Battle[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

function useBattles(filters: BattleFilters): UseBattlesResult;
```

**Implementation**:
- Cursor-based pagination
- Infinite scroll support
- Filter changes reset list
- Caching for performance

---

### useKillmailStream

```typescript
interface UseKillmailStreamResult {
  killmails: Killmail[];
  connected: boolean;
  error: Error | null;
  lastHeartbeat: Date | null;
}

function useKillmailStream(options: {
  spaceType?: SpaceType[];
  limit?: number;
}): UseKillmailStreamResult;
```

**Implementation**:
- SSE connection lifecycle
- Auto-reconnect with exponential backoff
- Buffer management (max 100 killmails in memory)
- Cleanup on unmount

---

## Styling Guidelines

### Color Scheme

**Space Types**:
- K-Space: Blue (#3b82f6)
- J-Space: Purple (#8b5cf6)
- Pochven: Red (#ef4444)

**ISK Values**:
- < 100M: Gray
- 100M - 1B: Blue
- 1B - 10B: Purple
- > 10B: Gold

### Typography

- Battle titles: `text-lg font-semibold`
- Timestamps: `text-sm text-gray-600`
- ISK values: `font-mono font-medium`
- Entity names: `text-sm hover:underline`

### Spacing

- Card padding: `p-4`
- Card gap: `gap-4`
- Section spacing: `space-y-6`

---

## Performance Considerations

### Lazy Loading
- Use React.lazy for page components
- Code-split by route

### Virtual Scrolling
- Implement virtual scrolling for long battle lists
- Use react-window or similar

### Memoization
- Memoize expensive computations (ISK formatting, time calculations)
- Use React.memo for list items

### SSE Optimization
- Batch UI updates (max 10 killmails/second)
- Throttle re-renders during high activity
- Close SSE connection when tab is hidden

---

## Accessibility

- Proper ARIA labels on interactive elements
- Keyboard navigation support
- Screen reader friendly
- Focus management for modals/dialogs

---

## Testing

### Unit Tests
- Component rendering
- Hook logic
- Utility functions

### Integration Tests
- Page navigation
- Filter functionality
- SSE connection handling

### E2E Tests
- Battle browsing flow
- Killmail stream
- Configuration changes
