# Space Type Refactoring - Progress Summary

## What's Been Completed ✅

### Phase 1: Type Definitions
- ✅ Updated `/packages/shared/src/index.ts` - Defined `SecurityType` type
- ✅ Updated `/packages/shared/src/system-security.ts` - Removed `spaceType` from `SystemInfo`, defined `SecurityType`, updated `deriveSecurityType` to be more flexible
- ✅ Updated `/packages/database/src/types.ts` - Replaced `SpaceTypeSchema` with `SecurityTypeSchema`, updated all schemas
- ✅ Updated `/packages/database/src/schema.ts` - Changed `BattlesTable` to use `securityType: SecurityType`
- ✅ Updated `/packages/database/src/index.ts` - Removed `SpaceType` exports

### Phase 3: Repositories
- ✅ Updated `/packages/database/src/repositories/killmail-repository.ts` - Uses `deriveSecurityType`
- ✅ Updated `/packages/database/src/repositories/battle-repository.ts` - Changed filters to use `securityType`

### Phase 7: Battle Reports Clustering
- ✅ Updated `/packages/battle-reports/src/clustering/engine.ts` - Uses `deriveSecurityType`

### Tests
- ✅ Updated `/packages/database/test/index.test.ts` - Changed `spaceType: 'jspace'` to `securityType: 'wormhole'`

## What's Remaining 🚧

### Phase 2: Database Migration
- ⚠️ **CRITICAL**: Need SQL migration to rename column from `space_type` to `security_type`
- ⚠️ **CRITICAL**: Need to migrate data:
  - `'jspace'` → `'wormhole'`
  - `'pochven'` → `'pochven'`
  - `'kspace'` → Requires ESI lookup for actual security type (highsec/lowsec/nullsec)

### Phase 4: API Layer (In Progress)
- ✅ `/backend/api/src/routes/battles.ts` - Line 80 fixed
- ❌ `/backend/api/src/routes/killmails.ts` - Imports `SpaceType`, uses `spaceType` filtering
- ❌ `/backend/api/src/services/ruleset-filter.ts` - Imports `SpaceType`, filters by `spaceType`
- ❌ `/backend/api/src/types.ts` - Uses `spaceType` field (lines 157, 251)
- ❌ `/backend/api/src/schemas.ts` - Likely needs updates
- ❌ `/backend/api/test/server.test.ts` - Test data uses `spaceType` (lines 58, 172)

### Phase 5: Frontend
- ❌ `/frontend/src/modules/battles/api.ts` - API client uses `spaceType`
- ❌ `/frontend/src/modules/battles/components/BattleFilters.tsx` - Filter UI uses `spaceType` buttons
- ❌ `/frontend/src/modules/battles/components/BattlesView.tsx` - Uses `spaceType` in state
- ❌ `/frontend/src/modules/killfeed/*` - Likely uses `spaceType`

### Phase 6: Search Service
- ❌ `/packages/search/src/types.ts` - Search document schema
- ❌ `/packages/search/src/search-service.ts` - Indexing logic
- ❌ `/packages/search/src/schemas.ts` - Search schemas
- ❌ `/packages/search/test/search-service.test.ts` - Test data

### Phase 8: All Tests
- ❌ `/frontend/src/modules/battles/api.test.ts`
- ❌ `/frontend/src/modules/killfeed/RecentKillsView.test.tsx`
- ❌ `/frontend/src/modules/app/index.test.tsx`
- ❌ `/packages/shared/test/index.test.ts`
- ❌ Many more test files with `spaceType` references

### Phase 9: Documentation
- ❌ 40+ documentation files referencing `spaceType` or `kspace|jspace|pochven`

## Current Build Status

**TypeScript Errors Remaining:**
```
backend/api/src/routes/battles.ts:80 - FIXED ✅
backend/api/src/routes/killmails.ts:3 - SpaceType import ❌
backend/api/src/services/ruleset-filter.ts:1 - SpaceType import ❌
backend/api/src/services/ruleset-filter.ts:31 - spaceType property ❌
backend/api/src/types.ts:157 - spaceType property ❌
backend/api/src/types.ts:251 - spaceType property ❌
backend/api/test/server.test.ts:58 - spaceType in test data ❌
backend/api/test/server.test.ts:172 - spaceType in test data ❌
frontend - Not yet attempted ❌
```

## Migration Strategy Recommendation

Given the scope of this refactoring (72 files), I recommend:

### Option 1: Complete the Refactoring (Estimated: 4-5 hours remaining)
Continue fixing all TypeScript errors file by file, then:
1. Create database migration
2. Run full test suite
3. Update documentation
4. Deploy with maintenance window

### Option 2: Staged Rollout (Lower Risk)
1. Add `securityType` column alongside existing `space_type` column
2. Populate `securityType` based on `space_type` + ESI lookups
3. Update application to write to both columns
4. Gradually migrate reads from `space_type` to `securityType`
5. Once verified, drop `space_type` column

### Option 3: Pause and Review
- Commit current progress to feature branch
- Review approach with team
- Consider if the complexity is worth the benefit

## Key Decisions Needed

1. **K-Space System Classification**: How to handle existing battles with `'kspace'`?
   - Option A: Default all to `'nullsec'` (conservative)
   - Option B: Batch lookup from ESI (accurate but slow)
   - Option C: Mark as `'unknown'` and backfill later

2. **API Versioning**: Should we version the API for backward compatibility?
   - Breaking change to API responses
   - Clients will need updates

3. **Downtime Acceptable?**: Database migration will require brief downtime
   - Estimated: 5-10 minutes for column rename + data migration

## Next Steps

1. Fix remaining backend/api TypeScript errors
2. Update frontend code
3. Fix all tests
4. Create database migration script
5. Test migration on staging database
6. Update documentation
7. Deploy with coordinated rollout

##Status: 🟡 IN PROGRESS - Backend types mostly done, API layer and frontend remaining
