# Ruleset Configuration Specification - System & Security Filtering

## Overview

This document extends the BattleScope ruleset configuration to support filtering killmails by:
- **Specific systems** - Track only killmails from designated solar systems
- **Security types** - Track only killmails from specific security classifications

## Security Type Classifications

EVE Online systems are classified by security status:

| Security Type | Security Status Range | Description |
|---------------|----------------------|-------------|
| `highsec` | 0.5 to 1.0 | High security space (CONCORD enforced) |
| `lowsec` | 0.1 to 0.4 | Low security space (limited CONCORD) |
| `nullsec` | -1.0 to 0.0 | Null security space (no CONCORD) |
| `wormhole` | N/A | J-space wormhole systems |
| `pochven` | N/A | Triglavian space (Pochven region) |

**Note**: Wormhole and Pochven systems don't have traditional security status and are identified by their space type.

## Extended Ruleset Schema

### Database Schema (`rulesets` table)

```sql
ALTER TABLE rulesets ADD COLUMN tracked_system_ids bigint[] DEFAULT ARRAY[]::bigint[];
ALTER TABLE rulesets ADD COLUMN tracked_security_types text[] DEFAULT ARRAY[]::text[];
```

| Column | Type | Description |
|--------|------|-------------|
| `tracked_system_ids` | `bigint[]` | Array of solar system IDs to track (empty = all) |
| `tracked_security_types` | `text[]` | Array of security types to track: `highsec`, `lowsec`, `nullsec`, `wormhole`, `pochven` (empty = all) |

### TypeScript Types

```typescript
type SecurityType = 'highsec' | 'lowsec' | 'nullsec' | 'wormhole' | 'pochven';

interface RulesetRecord {
  id: string;
  minPilots: number;
  trackedAllianceIds: bigint[];
  trackedCorpIds: bigint[];
  trackedSystemIds: bigint[];              // NEW
  trackedSecurityTypes: SecurityType[];   // NEW
  ignoreUnlisted: boolean;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

## Filtering Logic

### Ingestion Service

When a killmail is received, the ingestion service applies the following filters **in order**:

1. **Minimum Pilots** - Check participant count
2. **System ID** - If `trackedSystemIds` is non-empty, check if killmail system is in the list
3. **Security Type** - If `trackedSecurityTypes` is non-empty, check if system security type matches
4. **Tracked Entities** - Check if alliances/corporations match (existing logic)

### Filter Behavior

```typescript
// System filtering
if (trackedSystemIds.length > 0) {
  if (!trackedSystemIds.includes(killmail.systemId)) {
    return false; // Filter out
  }
}

// Security type filtering
if (trackedSecurityTypes.length > 0) {
  const systemSecurityType = await getSystemSecurityType(killmail.systemId);
  if (!trackedSecurityTypes.includes(systemSecurityType)) {
    return false; // Filter out
  }
}
```

**Combination Logic**:
- Empty arrays mean "no filter" (accept all)
- If both `trackedSystemIds` and `trackedSecurityTypes` are specified, a killmail must satisfy BOTH
- System filters are applied BEFORE entity filters for efficiency

## ESI Integration

### System Information Fetching

System security status is retrieved from ESI:

```
GET /universe/systems/{system_id}/
```

Response includes:
```json
{
  "system_id": 30000142,
  "name": "Jita",
  "security_status": 0.9459131360054016,
  ...
}
```

### Security Type Derivation

```typescript
function deriveSecurityType(systemId: bigint, securityStatus?: number): SecurityType {
  // Check space type first (wormhole/pochven)
  const spaceType = deriveSpaceType(systemId);
  if (spaceType === 'jspace') return 'wormhole';
  if (spaceType === 'pochven') return 'pochven';

  // Derive from security status
  if (securityStatus === undefined) {
    throw new Error('Security status required for k-space systems');
  }

  if (securityStatus >= 0.5) return 'highsec';
  if (securityStatus >= 0.1) return 'lowsec';
  return 'nullsec';
}
```

### Caching Strategy

To avoid excessive ESI calls:
1. **Redis cache**: System security types cached with 24-hour TTL
2. **Cache key**: `battlescope:system:security:{systemId}`
3. **Batch fetching**: Support bulk system lookups for efficiency

## API Endpoints

### GET /rulesets/current

Response includes new fields:

```json
{
  "id": "...",
  "minPilots": 5,
  "trackedAllianceIds": ["99001234"],
  "trackedAllianceNames": ["Pandemic Legion"],
  "trackedCorpIds": [],
  "trackedCorpNames": [],
  "trackedSystemIds": ["30000142", "30002187"],
  "trackedSystemNames": ["Jita", "M-OEE8"],
  "trackedSecurityTypes": ["nullsec", "wormhole"],
  "ignoreUnlisted": true,
  "updatedBy": "admin",
  "createdAt": "2025-11-07T00:00:00Z",
  "updatedAt": "2025-11-07T12:00:00Z"
}
```

### PUT /rulesets/current

Request body includes new fields:

```json
{
  "minPilots": 5,
  "trackedAllianceIds": ["99001234"],
  "trackedCorpIds": [],
  "trackedSystemIds": ["30000142", "30002187"],
  "trackedSecurityTypes": ["nullsec", "wormhole"],
  "ignoreUnlisted": true,
  "updatedBy": "admin"
}
```

**Validation**:
- `trackedSystemIds`: Maximum 1000 systems
- `trackedSecurityTypes`: Must be valid security type enum values
- System IDs are validated as bigint-safe values

## Use Cases

### Example 1: Track only null-sec and wormhole killmails

```json
{
  "trackedSecurityTypes": ["nullsec", "wormhole"],
  "ignoreUnlisted": true
}
```

### Example 2: Track specific systems (staging areas)

```json
{
  "trackedSystemIds": ["30000142", "30002187", "30045342"],
  "trackedSystemNames": ["Jita", "M-OEE8", "1DQ1-A"]
}
```

### Example 3: Track alliance in low-sec only

```json
{
  "trackedAllianceIds": ["99001234"],
  "trackedSecurityTypes": ["lowsec"],
  "ignoreUnlisted": true
}
```

### Example 4: Track everything except high-sec

```json
{
  "trackedSecurityTypes": ["lowsec", "nullsec", "wormhole", "pochven"]
}
```

## Implementation Considerations

### Performance

1. **System security lookup**: Cached in Redis, 24-hour TTL
2. **Ingestion filtering**: System check happens before expensive entity checks
3. **Batch ESI calls**: Systems fetched in batches when possible

### Data Consistency

1. **ESI failures**: If ESI is unavailable, fall back to space type only (jspace/pochven/kspace)
2. **Cache invalidation**: System cache invalidated on ESI version changes
3. **Unknown systems**: New systems default to fetching from ESI

### Migration Path

1. Existing rulesets default to empty arrays (no filtering)
2. Operators can incrementally add system/security filters
3. Backward compatible with existing filtering behavior

## Testing Requirements

- ✅ Filter killmails by specific system IDs
- ✅ Filter killmails by security type (highsec, lowsec, nullsec, wormhole, pochven)
- ✅ Combination of system and security filters
- ✅ ESI integration for system security lookup
- ✅ Redis caching of system security types
- ✅ API validation of new ruleset fields
- ✅ Cache invalidation on ruleset updates
