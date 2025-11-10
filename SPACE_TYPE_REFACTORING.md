# Space Type Refactoring Plan

## Problem Statement

The current codebase has confusing terminology around space classification in EVE Online. It uses two separate concepts:

1. **SpaceType** - Broad categorization: `'kspace' | 'jspace' | 'pochven'`
2. **SecurityType** - Detailed categorization: `'highsec' | 'lowsec' | 'nullsec' | 'wormhole' | 'pochven'`

The issue is that `'kspace'` is too broad - it encompasses highsec, lowsec, and nullsec, which are fundamentally different security environments in EVE Online. Users should be able to filter by specific security levels, not just "k-space".

## Proposed Solution

**Remove the `SpaceType` concept entirely and use only `SecurityType` throughout the codebase.**

This aligns with how players actually think about space in EVE Online:
- **Highsec** (High Security, 0.5-1.0)
- **Lowsec** (Low Security, 0.1-0.4)
- **Nullsec** (Null Security, -1.0 to 0.0)
- **Wormhole** (J-Space, system IDs 31M-32M)
- **Pochven** (Triglavian Space, system IDs 32M-33M)

## Current Implementation Analysis

### Core Type Definitions

**`/packages/shared/src/space-type.ts`:**
```typescript
export type SpaceType = 'kspace' | 'jspace' | 'pochven';

export const deriveSpaceType = (systemId: bigint | number): SpaceType => {
  const value = typeof systemId === 'bigint' ? Number(systemId) : systemId;

  if (value >= 32_000_000 && value < 33_000_000) {
    return 'pochven';
  }

  if (value >= 31_000_000 && value < 32_000_000) {
    return 'jspace';
  }

  return 'kspace';
};
```

**`/packages/shared/src/system-security.ts`:**
```typescript
export interface SystemInfo {
  systemId: bigint;
  securityStatus: number;
  securityType: SecurityType;
  spaceType: SpaceType;  // ← Remove this field
}

export function deriveSecurityType(systemId: bigint, securityStatus?: number): SecurityType {
  const spaceType = deriveSpaceType(systemId);

  // Wormhole and Pochven systems don't have traditional security status
  if (spaceType === 'jspace') return 'wormhole';
  if (spaceType === 'pochven') return 'pochven';

  // K-space systems require security status
  if (securityStatus === undefined) {
    throw new Error(`Security status required for k-space system ${systemId}`);
  }

  if (securityStatus >= 0.5) return 'highsec';
  if (securityStatus >= 0.1) return 'lowsec';
  return 'nullsec';
}
```

**`/packages/database/src/types.ts`:**
- `SpaceTypeSchema` = `z.enum(['kspace', 'jspace', 'pochven'])`
- `SecurityTypeSchema` = `z.enum(['highsec', 'lowsec', 'nullsec', 'wormhole', 'pochven'])`
- `BattleInsertSchema` includes `spaceType: SpaceTypeSchema`
- `KillmailFeedItemSchema` includes `spaceType: SpaceTypeSchema`

## Files Requiring Changes

Based on grep search, 72 files reference space type terminology:

### Critical Files (Type Definitions)

1. `/packages/shared/src/space-type.ts` - Remove or refactor
2. `/packages/shared/src/system-security.ts` - Update `SystemInfo` interface
3. `/packages/database/src/types.ts` - Remove `SpaceTypeSchema`, update schemas
4. `/packages/database/src/schema.ts` - Database table definitions
5. `/backend/api/src/schemas.ts` - API validation schemas
6. `/backend/api/src/types.ts` - API types
7. `/packages/search/src/types.ts` - Search service types
8. `/packages/search/src/schemas.ts` - Search schemas

### Repository Files

9. `/packages/database/src/repositories/battle-repository.ts` - Battle queries
10. `/packages/database/src/repositories/killmail-repository.ts` - Killmail queries

### Backend API Routes

11. `/backend/api/src/routes/battles.ts` - Battle endpoints
12. `/backend/api/src/routes/killmails.ts` - Killmail endpoints
13. `/backend/api/src/routes/search.ts` - Search endpoints
14. `/backend/api/src/routes/admin-battle-reports.ts` - Admin config

### Services

15. `/backend/api/src/services/ruleset-filter.ts` - Filtering logic
16. `/packages/battle-reports/src/clustering/engine.ts` - Battle clustering
17. `/packages/search/src/search-service.ts` - Search indexing

### Frontend Files

18. `/frontend/src/modules/battles/api.ts` - Battle API client
19. `/frontend/src/modules/battles/components/BattlesView.tsx` - Battle list view
20. `/frontend/src/modules/battles/components/BattleFilters.tsx` - Filter UI
21. `/frontend/src/modules/killfeed/api.ts` - Killfeed API client
22. `/frontend/src/modules/killfeed/RecentKillsView.tsx` - Recent kills view

### Test Files

23. `/frontend/src/modules/battles/api.test.ts`
24. `/frontend/src/modules/killfeed/RecentKillsView.test.tsx`
25. `/frontend/src/modules/app/index.test.tsx`
26. `/packages/shared/test/index.test.ts`
27. `/packages/database/test/index.test.ts`
28. `/packages/search/test/search-service.test.ts`
29. `/backend/api/test/server.test.ts`

### Database Migrations

30. `/packages/database/migrations/0001_init.ts` - Initial schema migration

### Documentation Files

31. `/docs/features/battle-reports/feature-spec.md`
32. `/docs/features/battle-reports/frontend-spec.md`
33. `/docs/features/battle-reports/openapi-spec.md`
34. `/docs/features/battle-intel/feature-spec.md`
35. `/docs/features/admin-panel/feature-spec.md`
36. `/docs/features/search/feature-spec.md`
37. `/docs/features/search/frontend-spec.md`
38. `/docs/features/search/openapi-spec.md`
39. `/docs/technical_specs.md`
40. `/docs/product_specs.md`
41. `/docs/ruleset_configuration_spec.md`
42. `/docs/openapi.yaml`
43. `/BATTLE_REPORTS_README.md`
44. `/BATTLE_REPORTS_CODE_EXAMPLES.md`
45. `/BATTLE_REPORTS_QUICK_REFERENCE.md`
46. `/BATTLE_REPORTS_IMPLEMENTATION.md`
47. `/AGENTS.md`

## Migration Strategy

### Phase 1: Update Type Definitions

1. **Keep `deriveSpaceType` for internal use** (system ID → broad category)
2. **Make `deriveSecurityType` the primary function** (system ID → detailed security)
3. **Update `SystemInfo` interface**:
   ```typescript
   export interface SystemInfo {
     systemId: bigint;
     securityStatus: number;
     securityType: SecurityType;
     // Remove spaceType field
   }
   ```

### Phase 2: Update Database Layer

1. **Migration file**: Create new migration to:
   - Rename `battles.space_type` column to `battles.security_type`
   - Update column type from `space_type_enum` to `security_type_enum`
   - Migrate existing data:
     - `'jspace'` → `'wormhole'`
     - `'pochven'` → `'pochven'`
     - `'kspace'` → Look up actual security type from ESI

2. **Schema updates** (`/packages/database/src/schema.ts`):
   ```typescript
   interface BattlesTable {
     id: string;
     systemId: ColumnType<bigint, string | number | bigint, string | number | bigint>;
     securityType: SecurityType;  // Changed from spaceType
     startTime: ColumnType<Date, Date, Date>;
     endTime: ColumnType<Date, Date, Date>;
     // ...
   }
   ```

3. **Type updates** (`/packages/database/src/types.ts`):
   - Remove `SpaceTypeSchema` exports
   - Update `BattleInsertSchema`: `spaceType` → `securityType` (use `SecurityTypeSchema`)
   - Update `KillmailFeedItemSchema`: `spaceType` → `securityType`
   - Keep `SecurityTypeSchema` as-is

### Phase 3: Update Repositories

1. **Battle Repository** (`/packages/database/src/repositories/battle-repository.ts`):
   - Update all queries to use `security_type` column
   - Update filter methods to accept `SecurityType` instead of `SpaceType`

2. **Killmail Repository** (`/packages/database/src/repositories/killmail-repository.ts`):
   - Update `toFeedItem()` method to use `deriveSecurityType` instead of `deriveSpaceType`

### Phase 4: Update API Layer

1. **API Schemas** (`/backend/api/src/schemas.ts`):
   - Update battle schemas to use `securityType` field
   - Update validation to use `SecurityTypeSchema`

2. **API Routes**:
   - `/backend/api/src/routes/battles.ts`: Update query parameters
   - `/backend/api/src/routes/killmails.ts`: Update filter parameters
   - `/backend/api/src/routes/search.ts`: Update search filters
   - `/backend/api/src/routes/admin-battle-reports.ts`: Already uses `SecurityType` for rulesets

3. **Services**:
   - `/backend/api/src/services/ruleset-filter.ts`: Update filtering logic

### Phase 5: Update Frontend

1. **API Client** (`/frontend/src/modules/battles/api.ts`):
   ```typescript
   export interface FetchBattlesOptions {
     limit?: number;
     cursor?: string | null;
     securityType?: 'highsec' | 'lowsec' | 'nullsec' | 'wormhole' | 'pochven';  // Changed
     systemId?: string;
     allianceId?: string;
     corpId?: string;
     characterId?: string;
     since?: Date;
     until?: Date;
     signal?: AbortSignal;
   }
   ```

2. **Filter Component** (`/frontend/src/modules/battles/components/BattleFilters.tsx`):
   - Update button labels:
     - "K-Space" → Remove
     - "J-Space" → "Wormhole"
     - "Pochven" → Keep
     - Add: "High Sec", "Low Sec", "Null Sec"
   - Update `BattleFilterValues` interface

3. **Views**:
   - Update all display logic to show security type names

### Phase 6: Update Search Service

1. **Search Types** (`/packages/search/src/types.ts`):
   - Update battle document schema to use `securityType`

2. **Search Service** (`/packages/search/src/search-service.ts`):
   - Update indexing to use `securityType`
   - Update search filters

### Phase 7: Update Battle Reports

1. **Clustering Engine** (`/packages/battle-reports/src/clustering/engine.ts`):
   - Update to use `securityType` when creating battles
   - Update to call `deriveSecurityType` for system classification

### Phase 8: Update Tests

1. Update all test fixtures to use `securityType` instead of `spaceType`
2. Update test expectations for new values:
   - `'jspace'` → `'wormhole'`
   - `'kspace'` → one of `'highsec'`, `'lowsec'`, `'nullsec'`

### Phase 9: Update Documentation

1. Update all spec documents to use SecurityType terminology
2. Update OpenAPI documentation
3. Update README files and code examples
4. Update AGENTS.md if it references space types

## Data Migration

### SQL Migration Script

```sql
-- Step 1: Add new column with SecurityType enum
ALTER TABLE battles ADD COLUMN security_type security_type_enum;

-- Step 2: Migrate data
-- For wormhole systems (jspace)
UPDATE battles
SET security_type = 'wormhole'
WHERE space_type = 'jspace';

-- For pochven systems
UPDATE battles
SET security_type = 'pochven'
WHERE space_type = 'pochven';

-- For k-space systems - need to look up actual security
-- This requires joining with a systems table or ESI lookup
-- For MVP, we can default to nullsec and backfill later
UPDATE battles
SET security_type = 'nullsec'
WHERE space_type = 'kspace' AND security_type IS NULL;

-- Step 3: Make column NOT NULL
ALTER TABLE battles ALTER COLUMN security_type SET NOT NULL;

-- Step 4: Drop old column
ALTER TABLE battles DROP COLUMN space_type;

-- Step 5: Rename new column to old name (if desired)
ALTER TABLE battles RENAME COLUMN security_type TO space_type;
-- OR keep it as security_type (recommended)
```

## Backward Compatibility

**Breaking Changes:**
- API endpoints will use `securityType` instead of `spaceType`
- Enum values change: `'jspace'` → `'wormhole'`, `'kspace'` split into `'highsec'|'lowsec'|'nullsec'`

**Migration Path:**
1. Version the API and support both old and new field names during transition period
2. Or: Do a clean break (recommended for internal tool)

## Testing Strategy

1. **Unit Tests**: Update all type-related tests first
2. **Integration Tests**: Test repositories with new schema
3. **API Tests**: Test endpoints with new query parameters
4. **E2E Tests**: Test frontend filters with new values
5. **Migration Tests**: Test data migration script on copy of production data

## Rollout Plan

1. Create feature branch: `refactor/space-type-to-security-type`
2. Implement changes in order (types → database → backend → frontend)
3. Run full test suite after each phase
4. Create migration script and test on staging database
5. Deploy to staging environment
6. Verify all functionality works
7. Deploy to production with maintenance window for migration
8. Monitor for errors
9. Update client documentation

## Risk Mitigation

1. **Data Loss**: Backup database before migration
2. **Service Downtime**: Migration requires brief downtime (estimate: 5-10 minutes)
3. **Client Breakage**: Internal tool, coordinate with users
4. **Rollback Plan**: Keep old column until verified, easy to revert

## Success Criteria

- ✅ All TypeScript builds pass without errors
- ✅ All tests pass
- ✅ Database migration completes successfully
- ✅ Frontend filters show highsec/lowsec/nullsec/wormhole/pochven
- ✅ API returns correct `securityType` values
- ✅ Search filters work with new values
- ✅ No `spaceType` references remain (except in migration history)
- ✅ Documentation is updated

## Timeline Estimate

- Phase 1 (Type Definitions): 30 minutes
- Phase 2 (Database Layer): 1 hour
- Phase 3 (Repositories): 30 minutes
- Phase 4 (API Layer): 1 hour
- Phase 5 (Frontend): 1 hour
- Phase 6 (Search Service): 30 minutes
- Phase 7 (Battle Reports): 30 minutes
- Phase 8 (Tests): 1 hour
- Phase 9 (Documentation): 1 hour

**Total Estimated Time: 7-8 hours**
