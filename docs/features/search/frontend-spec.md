# Search Frontend Specification

**Feature Key**: `search`
**Last Updated**: 2025-11-10

---

## Overview

This document defines the frontend implementation specification for the Search feature, including reusable components that can be used across all BattleScope features.

For the general feature specification, see [feature-spec.md](./feature-spec.md).

---

## Component Structure

```
frontend/src/modules/search/
├── components/
│   ├── EntityAutocomplete.tsx       # Reusable entity search autocomplete
│   ├── SystemAutocomplete.tsx       # Reusable system search autocomplete
│   ├── GlobalSearchBar.tsx          # Global search in navigation
│   ├── GlobalSearchModal.tsx        # Expanded global search results
│   ├── SearchResultItem.tsx         # Generic search result display
│   └── SearchHighlight.tsx          # Highlight matched terms
├── hooks/
│   ├── useEntitySearch.ts           # Entity autocomplete hook
│   ├── useSystemSearch.ts           # System autocomplete hook
│   ├── useGlobalSearch.ts           # Global search hook
│   ├── useAdvancedBattleSearch.ts   # Advanced battle search hook
│   └── useSearchDebounce.ts         # Debounce utility hook
├── api/
│   └── search.ts                    # Search API client
└── types.ts                          # TypeScript types
```

---

## Reusable Components

### EntityAutocomplete

**Purpose**: Autocomplete component for searching alliances, corporations, and characters.

**Usage**: Used in filter interfaces across Battle Reports, Battle Intel, and other features.

**Props**:
```typescript
interface EntityAutocompleteProps {
  value?: EntitySearchResult | null;
  onChange: (entity: EntitySearchResult | null) => void;
  types?: ('alliance' | 'corporation' | 'character')[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}
```

**Features**:
- **Debounced search** (300ms delay)
- **Grouped results** (alliances, corps, characters in separate sections)
- **Keyboard navigation** (up/down arrows, enter to select, escape to close)
- **Loading state** with spinner
- **Empty state** ("No results found")
- **Recent selections** (stored in local storage)
- **Clear button** (×) when value is selected
- **Accessible** (ARIA labels, screen reader friendly)

**Visual Layout**:
```
┌─────────────────────────────────────────────────┐
│ [🔍] Search alliances, corps, characters...  [×]│
└─────────────────────────────────────────────────┘
       ↓ (when typing)
┌─────────────────────────────────────────────────┐
│ Alliances                                        │
│   🏢 Pandemic Legion [PL]           87 battles  │
│   🏢 Pandemic Horde [REKTD]         54 battles  │
│                                                  │
│ Corporations                                     │
│   🏭 Sniggerdly [SNGGR]             45 battles  │
│      Pandemic Legion                             │
│                                                  │
│ Characters                                       │
│   👤 John Doe                       32 battles  │
│      Sniggerdly • Pandemic Legion                │
└─────────────────────────────────────────────────┘
```

**Implementation**:
```typescript
export const EntityAutocomplete: FC<EntityAutocompleteProps> = ({
  value,
  onChange,
  types,
  placeholder = 'Search entities...',
  disabled,
  className
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const debouncedQuery = useSearchDebounce(query, 300);

  const { data, loading, error } = useEntitySearch(debouncedQuery, {
    enabled: debouncedQuery.length >= 2,
    types,
  });

  const handleSelect = (entity: EntitySearchResult) => {
    onChange(entity);
    setQuery('');
    setIsOpen(false);
    saveRecentSelection(entity);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={value ? value.name : query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-4 py-2 pl-10 pr-10 border rounded-lg"
          aria-label="Entity search"
        />
        <SearchIcon className="absolute left-3 top-3 text-gray-400" />
        {(value || query) && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            <XIcon />
          </button>
        )}
      </div>

      {isOpen && query.length >= 2 && (
        <SearchResultsDropdown
          results={data}
          loading={loading}
          error={error}
          onSelect={handleSelect}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};
```

---

### SystemAutocomplete

**Purpose**: Autocomplete component for searching EVE Online solar systems.

**Props**:
```typescript
interface SystemAutocompleteProps {
  value?: SystemSearchResult | null;
  onChange: (system: SystemSearchResult | null) => void;
  spaceType?: ('kspace' | 'jspace' | 'pochven')[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}
```

**Features**:
- Similar to EntityAutocomplete but for systems
- Shows system name, region, and space type
- Displays security status for K-Space systems
- Shows battle count badge

**Visual Layout**:
```
┌─────────────────────────────────────────────────┐
│ [🔍] Search systems...                        [×]│
└─────────────────────────────────────────────────┘
       ↓ (when typing)
┌─────────────────────────────────────────────────┐
│ 🌍 M-OEE8 • Null-sec                            │
│    Catch region                     34 battles   │
│                                                  │
│ 🌌 J115422 • Wormhole                           │
│    A-R00001 region                  28 battles   │
└─────────────────────────────────────────────────┘
```

**Implementation**: Similar to EntityAutocomplete but using `useSystemSearch` hook.

---

### GlobalSearchBar

**Purpose**: Global search bar in the application navigation. Searches across all data types.

**Props**:
```typescript
interface GlobalSearchBarProps {
  className?: string;
}
```

**Features**:
- **Keyboard shortcut** (Cmd+K / Ctrl+K) to focus
- **Quick preview** of top results in dropdown
- **"See all results" button** to open GlobalSearchModal
- **Recent searches** shown when empty
- **Search suggestions** based on popular queries

**Visual Layout (in Navigation)**:
```
┌──────────────────────────────────────────────────────────┐
│ BattleScope    [🔍 Search... ⌘K]    Profile ▼          │
└──────────────────────────────────────────────────────────┘
                     ↓ (when typing)
        ┌────────────────────────────────────────┐
        │ Top Results                             │
        │                                         │
        │ Battles (3)                             │
        │   M-OEE8 battle • 87 kills              │
        │                                         │
        │ Alliances (2)                           │
        │   🏢 Pandemic Legion                    │
        │                                         │
        │ [See all results →]                     │
        └────────────────────────────────────────┘
```

**Implementation**:
```typescript
export const GlobalSearchBar: FC<GlobalSearchBarProps> = ({ className }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const debouncedQuery = useSearchDebounce(query, 300);

  const { data, loading } = useGlobalSearch(debouncedQuery, {
    enabled: debouncedQuery.length >= 2,
    limit: 3, // Preview only shows top 3 per category
  });

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <div className={`relative ${className}`}>
        <input
          id="global-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder="Search... ⌘K"
          className="w-64 px-4 py-2 pl-10 border rounded-lg"
        />
        <SearchIcon className="absolute left-3 top-3" />

        {isOpen && query.length >= 2 && (
          <GlobalSearchPreview
            results={data}
            loading={loading}
            onSelectResult={(result) => {
              navigateToResult(result);
              setIsOpen(false);
            }}
            onSeeAll={() => {
              setShowModal(true);
              setIsOpen(false);
            }}
          />
        )}
      </div>

      {showModal && (
        <GlobalSearchModal
          query={query}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};
```

---

### GlobalSearchModal

**Purpose**: Full-screen modal with comprehensive search results across all categories.

**Props**:
```typescript
interface GlobalSearchModalProps {
  query: string;
  onClose: () => void;
}
```

**Features**:
- **Tabbed interface** (All, Battles, Entities, Systems)
- **Infinite scroll** for results
- **Filters** (space type, time range, etc.)
- **Sort options** (relevance, date, etc.)
- **Result highlighting** for matched terms

**Visual Layout**:
```
┌────────────────────────────────────────────────────────────┐
│ [×] Search Results for "pandemic"                          │
├────────────────────────────────────────────────────────────┤
│                                                             │
│ [All] [Battles] [Entities] [Systems]                       │
│                                                             │
│ Battles (234 results)                                       │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ M-OEE8 • Null-sec              Nov 10, 14:30 UTC        ││
│ │ 87 kills • 42.3B ISK                                    ││
│ │ Test Alliance vs Brave Collective                       ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ Entities (5 results)                                        │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 🏢 Pandemic Legion [PL]              87 battles         ││
│ │ Alliance • Last seen 2 hours ago                        ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ [Load More]                                                 │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

---

## Hooks

### useEntitySearch

```typescript
interface UseEntitySearchOptions {
  enabled?: boolean;
  types?: ('alliance' | 'corporation' | 'character')[];
  limit?: number;
}

interface UseEntitySearchResult {
  data: {
    alliances: EntitySearchResult[];
    corporations: EntitySearchResult[];
    characters: EntitySearchResult[];
  } | null;
  loading: boolean;
  error: Error | null;
}

function useEntitySearch(
  query: string,
  options?: UseEntitySearchOptions
): UseEntitySearchResult;
```

**Implementation**:
```typescript
export function useEntitySearch(
  query: string,
  options: UseEntitySearchOptions = {}
): UseEntitySearchResult {
  const { enabled = true, types, limit } = options;

  return useQuery({
    queryKey: ['search', 'entities', query, types, limit],
    queryFn: () => searchApi.searchEntities({ q: query, type: types, limit }),
    enabled: enabled && query.length >= 2,
    staleTime: 30000, // Cache for 30 seconds
  });
}
```

---

### useSystemSearch

```typescript
interface UseSystemSearchOptions {
  enabled?: boolean;
  spaceType?: ('kspace' | 'jspace' | 'pochven')[];
  limit?: number;
}

interface UseSystemSearchResult {
  data: {
    systems: SystemSearchResult[];
  } | null;
  loading: boolean;
  error: Error | null;
}

function useSystemSearch(
  query: string,
  options?: UseSystemSearchOptions
): UseSystemSearchResult;
```

---

### useGlobalSearch

```typescript
interface UseGlobalSearchOptions {
  enabled?: boolean;
  limit?: number;
}

interface UseGlobalSearchResult {
  data: {
    battles: BattleSearchResult[];
    entities: {
      alliances: EntitySearchResult[];
      corporations: EntitySearchResult[];
      characters: EntitySearchResult[];
    };
    systems: SystemSearchResult[];
    totalResults: {
      battles: number;
      entities: number;
      systems: number;
    };
  } | null;
  loading: boolean;
  error: Error | null;
}

function useGlobalSearch(
  query: string,
  options?: UseGlobalSearchOptions
): UseGlobalSearchResult;
```

---

### useSearchDebounce

**Purpose**: Utility hook to debounce search queries.

```typescript
function useSearchDebounce<T>(value: T, delay: number): T;
```

**Implementation**:
```typescript
export function useSearchDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
```

---

## API Client

```typescript
// frontend/src/modules/search/api/search.ts

export const searchApi = {
  searchEntities: async (params: {
    q: string;
    type?: ('alliance' | 'corporation' | 'character')[];
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    queryParams.set('q', params.q);
    if (params.type) {
      params.type.forEach(t => queryParams.append('type', t));
    }
    if (params.limit) {
      queryParams.set('limit', params.limit.toString());
    }

    const response = await fetch(`/api/search/entities?${queryParams}`);
    if (!response.ok) throw new Error('Search failed');
    return response.json();
  },

  searchSystems: async (params: {
    q: string;
    space_type?: ('kspace' | 'jspace' | 'pochven')[];
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    queryParams.set('q', params.q);
    if (params.space_type) {
      params.space_type.forEach(st => queryParams.append('space_type', st));
    }
    if (params.limit) {
      queryParams.set('limit', params.limit.toString());
    }

    const response = await fetch(`/api/search/systems?${queryParams}`);
    if (!response.ok) throw new Error('Search failed');
    return response.json();
  },

  searchGlobal: async (params: {
    q: string;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    queryParams.set('q', params.q);
    if (params.limit) {
      queryParams.set('limit', params.limit.toString());
    }

    const response = await fetch(`/api/search/global?${queryParams}`);
    if (!response.ok) throw new Error('Search failed');
    return response.json();
  },
};
```

---

## Styling Guidelines

### Search Input

```css
.search-input {
  @apply w-full px-4 py-2 pl-10 pr-10 border rounded-lg;
  @apply focus:ring-2 focus:ring-blue-500 focus:border-blue-500;
  @apply disabled:bg-gray-100 disabled:cursor-not-allowed;
}
```

### Search Dropdown

```css
.search-dropdown {
  @apply absolute z-50 mt-2 w-full bg-white border rounded-lg shadow-lg;
  @apply max-h-96 overflow-y-auto;
}

.search-result-item {
  @apply px-4 py-2 cursor-pointer hover:bg-gray-50;
  @apply focus:bg-gray-50 focus:outline-none;
}

.search-result-item-active {
  @apply bg-gray-100;
}
```

### Entity Type Icons

- Alliance: 🏢 or custom SVG icon
- Corporation: 🏭 or custom SVG icon
- Character: 👤 or custom SVG icon
- System: 🌍 (K-Space), 🌌 (J-Space), ⚡ (Pochven)

---

## Performance Optimization

### Debouncing

- **Autocomplete**: 300ms delay before API call
- **Global search**: 300ms delay

### Caching

- Search results cached for 30 seconds (React Query)
- Recent selections cached in local storage (max 10 items)

### Virtual Scrolling

- For long result lists (>100 items), use virtual scrolling (react-window)

### Request Cancellation

- Cancel pending requests when query changes
- Implemented automatically by React Query

---

## Accessibility

- **Keyboard navigation**: Arrow keys to navigate results, Enter to select, Escape to close
- **ARIA labels**: Proper labels for screen readers
- **Focus management**: Auto-focus on search input when modal opens
- **Live regions**: Announce result counts to screen readers

---

## Testing

### Unit Tests

- Component rendering
- Keyboard navigation
- Debounce logic
- API client functions

### Integration Tests

- Search flow (type → results → select)
- Keyboard shortcuts
- Modal interactions

### E2E Tests

- Global search from navigation
- Entity autocomplete in filters
- Search result navigation

---

## Usage Examples

### In Battle Reports Filters

```typescript
<EntityAutocomplete
  value={selectedAlliance}
  onChange={setSelectedAlliance}
  types={['alliance']}
  placeholder="Search alliances..."
/>
```

### In Battle Intel Page

```typescript
<EntityAutocomplete
  value={selectedEntity}
  onChange={(entity) => {
    // Navigate to intel page for selected entity
    if (entity.type === 'alliance') {
      navigate(`/intel/alliances/${entity.id}`);
    }
  }}
  placeholder="Search for intelligence..."
/>
```

### Global Search in Navigation

```typescript
<GlobalSearchBar className="ml-4" />
```

---

## Notes

- All search components are designed to be reusable across features
- Search results respect user's feature access permissions
- Empty states provide helpful guidance ("Try searching for an alliance name")
- Loading states show skeletons or spinners for better UX
- Error states are user-friendly and suggest retry actions
