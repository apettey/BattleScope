# Background Character Verification Specification

_Created: 2025-11-09_
_Status: Design Phase_

## Overview

This document specifies the background job that periodically verifies character corporation and alliance memberships to ensure users maintain access only while their characters remain in approved organizations.

### Purpose

Characters can change corporations and alliances outside of BattleScope. Without periodic verification:
- A character could authenticate while in an approved corporation
- They could then leave and join a denied corporation or neutral organization
- Their session would remain valid for up to 8 hours
- They'd retain access despite no longer meeting organization requirements

### Security Model

**Two-Layer Defense**:
1. **Login-time verification**: Corp/alliance checked during OAuth callback (existing)
2. **Hourly background verification**: Catches changes that occur during active sessions (this spec)

**Maximum Exposure Window**: 1 hour (acceptable trade-off between security and performance)

---

## 2. Job Schedule

**Frequency**: Every hour (0 minutes past the hour)

**Cron Expression**: `0 * * * *`

**Kubernetes CronJob**:
- Namespace: `battlescope`
- Name: `character-verifier`
- Concurrency Policy: `Forbid` (don't run multiple instances simultaneously)
- Success History Limit: 3
- Failed History Limit: 3
- Active Deadline Seconds: 3600 (1 hour timeout)

**Example CronJob Manifest**:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: character-verifier
  namespace: battlescope
spec:
  schedule: "0 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      activeDeadlineSeconds: 3600
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: verifier
            image: battlescope/verifier:latest
            env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: battlescope-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: battlescope-secrets
                  key: redis-url
            - name: TOKEN_ENCRYPTION_KEY
              valueFrom:
                secretKeyRef:
                  name: battlescope-secrets
                  key: token-encryption-key
            resources:
              requests:
                memory: "256Mi"
                cpu: "100m"
              limits:
                memory: "512Mi"
                cpu: "500m"
```

---

## 3. Verification Logic

### 3.1 Character Selection

**Query**: Find all characters that need verification

```sql
SELECT
  c.id,
  c.account_id,
  c.eve_character_id,
  c.eve_character_name,
  c.corp_id AS current_corp_id,
  c.alliance_id AS current_alliance_id,
  c.esi_access_token,
  c.esi_refresh_token,
  c.esi_token_expires_at,
  c.last_verified_at
FROM characters c
WHERE
  -- Only verify characters with active sessions
  EXISTS (
    SELECT 1
    FROM accounts a
    WHERE a.id = c.account_id
    AND a.is_deleted = false
    AND a.is_blocked = false
  )
  -- Skip recently verified characters (verified within last 55 minutes)
  AND (c.last_verified_at IS NULL OR c.last_verified_at < NOW() - INTERVAL '55 minutes')
ORDER BY c.last_verified_at ASC NULLS FIRST
LIMIT 1000; -- Process in batches
```

**Rationale**:
- Only verify characters belonging to non-deleted, non-blocked accounts
- Skip characters verified in the last 55 minutes (avoid duplicate work if job runs slightly early)
- Process oldest verifications first (NULLS FIRST ensures never-verified characters get priority)
- Limit to 1000 characters per run (adjust based on ESI rate limits)

### 3.2 ESI Verification Flow

For each character:

```typescript
interface CharacterVerificationResult {
  characterId: string;
  accountId: string;
  success: boolean;
  corpChanged: boolean;
  allianceChanged: boolean;
  newCorpId?: bigint;
  newCorpName?: string;
  newAllianceId?: bigint | null;
  newAllianceName?: string | null;
  isAllowed: boolean;
  error?: string;
  skipReason?: 'token_revoked' | 'esi_error' | 'rate_limited';
}

async function verifyCharacter(character: Character): Promise<CharacterVerificationResult> {
  try {
    // 1. Get valid access token (refresh if needed)
    let accessToken: string;
    try {
      accessToken = await characterTokenService.getValidAccessToken(character.id);
    } catch (error) {
      // Token revoked or refresh failed - use last known values
      logger.warn(
        { characterId: character.id, error },
        'ESI token unavailable, using last known corporation/alliance'
      );

      // Still check if last known values are allowed
      const isAllowed = await authConfigRepository.isCharacterAllowed(
        character.current_corp_id,
        character.current_alliance_id
      );

      return {
        characterId: character.id,
        accountId: character.account_id,
        success: true,
        corpChanged: false,
        allianceChanged: false,
        isAllowed,
        skipReason: 'token_revoked',
      };
    }

    // 2. Fetch current character affiliation from ESI
    const affiliation = await esiClient.getCharacterAffiliation(character.eve_character_id);

    // 3. Check if corp or alliance changed
    const corpChanged = affiliation.corporation_id !== Number(character.current_corp_id);
    const allianceChanged = affiliation.alliance_id !== Number(character.current_alliance_id || 0);

    // 4. If changed, fetch corp/alliance names
    let newCorpName = character.corp_name;
    let newAllianceName = character.alliance_name;

    if (corpChanged) {
      const corp = await esiClient.getCorporation(affiliation.corporation_id);
      newCorpName = corp.name;
    }

    if (allianceChanged && affiliation.alliance_id) {
      const alliance = await esiClient.getAlliance(affiliation.alliance_id);
      newAllianceName = alliance.name;
    }

    // 5. Check if new org is allowed
    const isAllowed = await authConfigRepository.isCharacterAllowed(
      BigInt(affiliation.corporation_id),
      affiliation.alliance_id ? BigInt(affiliation.alliance_id) : null
    );

    return {
      characterId: character.id,
      accountId: character.account_id,
      success: true,
      corpChanged,
      allianceChanged,
      newCorpId: BigInt(affiliation.corporation_id),
      newCorpName,
      newAllianceId: affiliation.alliance_id ? BigInt(affiliation.alliance_id) : null,
      newAllianceName: affiliation.alliance_id ? newAllianceName : null,
      isAllowed,
    };

  } catch (error) {
    logger.error({ error, characterId: character.id }, 'Character verification failed');

    return {
      characterId: character.id,
      accountId: character.account_id,
      success: false,
      corpChanged: false,
      allianceChanged: false,
      isAllowed: true, // Fail open - don't invalidate on transient errors
      error: error instanceof Error ? error.message : 'Unknown error',
      skipReason: 'esi_error',
    };
  }
}
```

### 3.3 Database Updates

```typescript
async function updateCharacterVerification(result: CharacterVerificationResult): Promise<void> {
  if (!result.success || (!result.corpChanged && !result.allianceChanged)) {
    // Only update last_verified_at
    await db
      .updateTable('characters')
      .set({
        last_verified_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', result.characterId)
      .execute();
    return;
  }

  // Update corp/alliance info
  await db
    .updateTable('characters')
    .set({
      corp_id: result.newCorpId!,
      corp_name: result.newCorpName!,
      alliance_id: result.newAllianceId,
      alliance_name: result.newAllianceName,
      last_verified_at: new Date(),
      updated_at: new Date(),
    })
    .where('id', '=', result.characterId)
    .execute();

  logger.info(
    {
      characterId: result.characterId,
      corpChanged: result.corpChanged,
      allianceChanged: result.allianceChanged,
      newCorpId: result.newCorpId,
      newAllianceId: result.newAllianceId,
    },
    'Character organization changed'
  );
}
```

### 3.4 Session Invalidation

```typescript
async function invalidateSessionIfDisallowed(result: CharacterVerificationResult): Promise<void> {
  if (result.isAllowed) {
    return; // Character still in approved org, no action needed
  }

  // Character now in unapproved org - invalidate all sessions for this account
  logger.warn(
    {
      accountId: result.accountId,
      characterId: result.characterId,
      reason: 'organization_changed',
    },
    'Invalidating sessions due to organization change'
  );

  // 1. Get current session token for account
  const sessionToken = await redis.get(`battlescope:account-session:${result.accountId}`);

  if (sessionToken) {
    // 2. Delete session
    await redis.del(`battlescope:session:${sessionToken}`);

    // 3. Delete account-session mapping
    await redis.del(`battlescope:account-session:${result.accountId}`);
  }

  // 4. Audit log
  await auditLogRepository.record({
    actor_account_id: null, // System action
    action: 'session.invalidated',
    target_type: 'account',
    target_id: result.accountId,
    metadata: {
      reason: 'organization_changed',
      character_id: result.characterId,
      new_corp_id: result.newCorpId?.toString(),
      new_alliance_id: result.newAllianceId?.toString(),
    },
  });
}
```

---

## 4. Main Verification Job

```typescript
// backend/verifier/src/index.ts

import { Kysely } from 'kysely';
import { Redis } from 'ioredis';
import { logger } from '@battlescope/logging';
import type { Database } from '@battlescope/database';

interface VerificationStats {
  totalCharacters: number;
  verified: number;
  failed: number;
  skipped: number;
  orgChanged: number;
  sessionsInvalidated: number;
  duration: number;
}

export class CharacterVerifierService {
  constructor(
    private db: Kysely<Database>,
    private redis: Redis,
    private esiClient: EsiClient,
    private authConfigRepository: AuthConfigRepository,
    private auditLogRepository: AuditLogRepository,
    private characterTokenService: CharacterTokenService,
  ) {}

  async run(): Promise<VerificationStats> {
    const startTime = Date.now();
    const stats: VerificationStats = {
      totalCharacters: 0,
      verified: 0,
      failed: 0,
      skipped: 0,
      orgChanged: 0,
      sessionsInvalidated: 0,
      duration: 0,
    };

    logger.info('Starting character verification job');

    try {
      // 1. Fetch characters to verify
      const characters = await this.getCharactersToVerify();
      stats.totalCharacters = characters.length;

      logger.info({ count: characters.length }, 'Characters to verify');

      // 2. Process in batches to respect ESI rate limits
      const BATCH_SIZE = 50; // Adjust based on ESI rate limits
      const DELAY_BETWEEN_BATCHES = 1000; // 1 second

      for (let i = 0; i < characters.length; i += BATCH_SIZE) {
        const batch = characters.slice(i, i + BATCH_SIZE);

        // Process batch in parallel
        const results = await Promise.all(
          batch.map(char => this.verifyCharacter(char))
        );

        // 3. Process results
        for (const result of results) {
          if (!result.success) {
            stats.failed++;
            continue;
          }

          if (result.skipReason) {
            stats.skipped++;
          } else {
            stats.verified++;
          }

          // 4. Update database
          await this.updateCharacterVerification(result);

          // 5. Track org changes
          if (result.corpChanged || result.allianceChanged) {
            stats.orgChanged++;
          }

          // 6. Invalidate session if needed
          if (!result.isAllowed) {
            await this.invalidateSessionIfDisallowed(result);
            stats.sessionsInvalidated++;
          }
        }

        // Delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < characters.length) {
          await this.sleep(DELAY_BETWEEN_BATCHES);
        }
      }

      stats.duration = Date.now() - startTime;

      logger.info(
        {
          stats,
          durationSeconds: Math.round(stats.duration / 1000),
        },
        'Character verification job completed'
      );

      return stats;
    } catch (error) {
      logger.error({ error, stats }, 'Character verification job failed');
      throw error;
    }
  }

  private async getCharactersToVerify(): Promise<Character[]> {
    return await this.db
      .selectFrom('characters')
      .selectAll()
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('accounts')
            .select('id')
            .whereRef('accounts.id', '=', 'characters.account_id')
            .where('accounts.is_deleted', '=', false)
            .where('accounts.is_blocked', '=', false)
        )
      )
      .where((eb) =>
        eb.or([
          eb('last_verified_at', 'is', null),
          eb('last_verified_at', '<', new Date(Date.now() - 55 * 60 * 1000)),
        ])
      )
      .orderBy('last_verified_at', 'asc')
      .limit(1000)
      .execute();
  }

  private verifyCharacter(character: Character): Promise<CharacterVerificationResult> {
    // Implementation from section 3.2
  }

  private updateCharacterVerification(result: CharacterVerificationResult): Promise<void> {
    // Implementation from section 3.3
  }

  private invalidateSessionIfDisallowed(result: CharacterVerificationResult): Promise<void> {
    // Implementation from section 3.4
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Entry point for CronJob
async function main() {
  const config = loadConfig();
  const db = createDatabaseClient(config.databaseUrl);
  const redis = new Redis(config.redisUrl);

  const service = new CharacterVerifierService(
    db,
    redis,
    esiClient,
    authConfigRepository,
    auditLogRepository,
    characterTokenService,
  );

  try {
    const stats = await service.run();

    // Exit with code 0 on success
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Verification job failed');
    process.exit(1);
  }
}

main();
```

---

## 5. Error Handling

### 5.1 ESI Rate Limiting

**Strategy**: Respect ESI error budget, use exponential backoff

```typescript
class EsiRateLimitHandler {
  private errorBudget = 100;

  async executeWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        const result = await fn();
        this.errorBudget = Math.min(100, this.errorBudget + 1);
        return result;
      } catch (error) {
        if (error.status === 429) { // Too Many Requests
          this.errorBudget--;

          if (this.errorBudget <= 0) {
            logger.error('ESI error budget exhausted, stopping verification');
            throw new Error('ESI rate limit exceeded');
          }

          const delay = Math.pow(2, retries) * 1000; // Exponential backoff
          logger.warn({ delay, retries }, 'ESI rate limited, backing off');
          await this.sleep(delay);
          retries++;
        } else {
          throw error;
        }
      }
    }

    throw new Error('Max retries exceeded');
  }
}
```

### 5.2 Token Revocation

**Strategy**: Gracefully handle revoked tokens by using last known corporation/alliance

```typescript
// When ESI token is revoked:
// 1. Log warning
// 2. Use last known corp_id and alliance_id from database
// 3. Check if last known values are still allowed
// 4. Invalidate session if last known org is now denied
// 5. Do NOT attempt to refresh or re-authenticate
```

### 5.3 Transient ESI Errors

**Strategy**: Fail open - don't invalidate sessions on transient errors

```typescript
// ESI 5xx errors, timeouts, network issues:
// 1. Log error with full context
// 2. Skip character verification for this run
// 3. Do NOT update last_verified_at (will retry next hour)
// 4. Do NOT invalidate session
// 5. Increment error counter in metrics
```

---

## 6. Monitoring & Observability

### 6.1 Metrics

**Prometheus Metrics**:

```typescript
// backend/verifier/src/metrics.ts

import { Counter, Histogram, Gauge } from 'prom-client';

export const metrics = {
  verificationJobDuration: new Histogram({
    name: 'battlescope_character_verification_duration_seconds',
    help: 'Duration of character verification job',
  }),

  charactersProcessed: new Counter({
    name: 'battlescope_characters_verified_total',
    help: 'Total characters verified',
    labelNames: ['status'], // success, failed, skipped
  }),

  organizationChanges: new Counter({
    name: 'battlescope_character_org_changes_total',
    help: 'Total organization changes detected',
    labelNames: ['type'], // corp, alliance, both
  }),

  sessionsInvalidated: new Counter({
    name: 'battlescope_sessions_invalidated_total',
    help: 'Total sessions invalidated due to org changes',
    labelNames: ['reason'], // organization_changed
  }),

  esiErrors: new Counter({
    name: 'battlescope_character_verification_esi_errors_total',
    help: 'ESI errors during verification',
    labelNames: ['error_code'], // 429, 500, timeout
  }),

  lastRunTimestamp: new Gauge({
    name: 'battlescope_character_verification_last_run_timestamp',
    help: 'Unix timestamp of last verification run',
  }),
};
```

### 6.2 Logging

**Structured Logs** (Pino format):

```typescript
// Job start
logger.info({ totalCharacters: 1234 }, 'Starting character verification job');

// Batch progress
logger.info(
  {
    batchNumber: 3,
    totalBatches: 10,
    progress: 30
  },
  'Processing batch'
);

// Organization change detected
logger.warn(
  {
    characterId: 'abc-123',
    accountId: 'def-456',
    oldCorpId: '98000001',
    newCorpId: '98000002',
    isAllowed: false,
  },
  'Character organization changed to unapproved corp'
);

// Session invalidation
logger.warn(
  {
    accountId: 'def-456',
    reason: 'organization_changed',
  },
  'Invalidating session'
);

// Job completion
logger.info(
  {
    stats: {
      totalCharacters: 1234,
      verified: 1200,
      failed: 10,
      skipped: 24,
      orgChanged: 5,
      sessionsInvalidated: 2,
      duration: 45000,
    },
  },
  'Character verification job completed'
);
```

### 6.3 Alerts

**Alertmanager Rules**:

```yaml
groups:
- name: character_verification
  interval: 5m
  rules:
  # Job hasn't run in over 90 minutes
  - alert: CharacterVerificationJobStale
    expr: time() - battlescope_character_verification_last_run_timestamp > 5400
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "Character verification job hasn't run recently"
      description: "Last run was {{ $value }} seconds ago"

  # High ESI error rate
  - alert: CharacterVerificationHighEsiErrors
    expr: rate(battlescope_character_verification_esi_errors_total[5m]) > 0.1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High ESI error rate during character verification"

  # Many sessions invalidated (possible mass org change)
  - alert: CharacterVerificationManyInvalidations
    expr: increase(battlescope_sessions_invalidated_total[1h]) > 10
    for: 5m
    labels:
      severity: info
    annotations:
      summary: "Unusually high number of sessions invalidated"
      description: "{{ $value }} sessions invalidated in the last hour"
```

---

## 7. Testing

### 7.1 Unit Tests

```typescript
describe('CharacterVerifierService', () => {
  describe('verifyCharacter', () => {
    it('should detect corporation change', async () => {
      // Mock ESI to return different corp
      esiClient.getCharacterAffiliation.mockResolvedValue({
        corporation_id: 98000002,
        alliance_id: 99000001,
      });

      const result = await service.verifyCharacter({
        id: 'char-1',
        corp_id: BigInt(98000001),
        alliance_id: BigInt(99000001),
      });

      expect(result.corpChanged).toBe(true);
      expect(result.allianceChanged).toBe(false);
      expect(result.newCorpId).toBe(BigInt(98000002));
    });

    it('should handle revoked tokens gracefully', async () => {
      characterTokenService.getValidAccessToken.mockRejectedValue(
        new Error('Token revoked')
      );

      const result = await service.verifyCharacter({
        id: 'char-1',
        corp_id: BigInt(98000001),
        alliance_id: null,
      });

      expect(result.success).toBe(true);
      expect(result.skipReason).toBe('token_revoked');
      expect(result.corpChanged).toBe(false);
    });

    it('should invalidate session for unapproved org', async () => {
      authConfigRepository.isCharacterAllowed.mockResolvedValue(false);

      const result = await service.verifyCharacter({
        id: 'char-1',
        corp_id: BigInt(98000001),
      });

      expect(result.isAllowed).toBe(false);

      await service.invalidateSessionIfDisallowed(result);

      expect(redis.del).toHaveBeenCalledWith(
        expect.stringContaining('battlescope:session:')
      );
    });
  });
});
```

### 7.2 Integration Tests

```typescript
describe('Character Verification Job (Integration)', () => {
  it('should complete full verification cycle', async () => {
    // Setup: Create characters in approved corps
    const account = await createTestAccount();
    const char1 = await createTestCharacter({
      account_id: account.id,
      corp_id: BigInt(98000001), // Approved
      alliance_id: BigInt(99000001), // Approved
    });

    // Create active session
    await sessionService.create(account.id);

    // Mock ESI to return different corp (unapproved)
    esiClient.getCharacterAffiliation.mockResolvedValue({
      corporation_id: 98000099, // Not in approved list
      alliance_id: null,
    });

    // Run verification
    const stats = await verifierService.run();

    // Assertions
    expect(stats.totalCharacters).toBe(1);
    expect(stats.verified).toBe(1);
    expect(stats.orgChanged).toBe(1);
    expect(stats.sessionsInvalidated).toBe(1);

    // Verify database updated
    const updatedChar = await db
      .selectFrom('characters')
      .selectAll()
      .where('id', '=', char1.id)
      .executeTakeFirstOrThrow();

    expect(updatedChar.corp_id).toBe(BigInt(98000099));
    expect(updatedChar.last_verified_at).not.toBe(char1.last_verified_at);

    // Verify session invalidated
    const session = await redis.get(`battlescope:account-session:${account.id}`);
    expect(session).toBeNull();
  });
});
```

---

## 8. Deployment

### 8.1 Package Structure

```
backend/
├── verifier/
│   ├── src/
│   │   ├── index.ts                 # Entry point
│   │   ├── service.ts               # CharacterVerifierService
│   │   ├── metrics.ts               # Prometheus metrics
│   │   └── config.ts                # Configuration
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
```

### 8.2 Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/verifier/package.json ./backend/verifier/

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source
COPY backend/verifier ./backend/verifier
COPY backend/database ./backend/database
COPY backend/shared ./backend/shared

# Build
RUN pnpm --filter @battlescope/verifier build

# Production image
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts and node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/verifier/dist ./dist

# Run as non-root user
USER node

CMD ["node", "dist/index.js"]
```

### 8.3 Kubernetes Manifests

**CronJob** (already shown in section 2)

**ConfigMap**:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: character-verifier-config
  namespace: battlescope
data:
  BATCH_SIZE: "50"
  DELAY_BETWEEN_BATCHES: "1000"
  MAX_CHARACTERS_PER_RUN: "1000"
  VERIFICATION_THRESHOLD_MINUTES: "55"
```

---

## 9. Rollout Plan

### Phase 1: Implementation
- [ ] Create `backend/verifier` package
- [ ] Implement `CharacterVerifierService`
- [ ] Add token refresh handling for revoked tokens
- [ ] Write unit tests

### Phase 2: Testing
- [ ] Integration tests with test database
- [ ] Load testing (simulate 10k+ characters)
- [ ] ESI error simulation
- [ ] Verify session invalidation works correctly

### Phase 3: Deployment
- [ ] Build Docker image
- [ ] Deploy CronJob to staging
- [ ] Monitor first few runs
- [ ] Set up alerts and dashboards

### Phase 4: Production
- [ ] Deploy to production
- [ ] Monitor metrics and logs
- [ ] Tune batch size and delays based on ESI rate limits
- [ ] Document operational runbooks

---

## 10. Operational Runbooks

### Runbook: Job Hasn't Run

**Symptoms**: `CharacterVerificationJobStale` alert firing

**Investigation**:
1. Check CronJob status: `kubectl get cronjob character-verifier -n battlescope`
2. Check recent job runs: `kubectl get jobs -n battlescope -l app=character-verifier`
3. Check pod logs: `kubectl logs -n battlescope -l job-name=character-verifier-<timestamp>`

**Common Causes**:
- CronJob suspended: `kubectl patch cronjob character-verifier -n battlescope -p '{"spec":{"suspend":false}}'`
- Job failed: Check logs for errors
- Kubernetes scheduler issue: Restart kube-scheduler

### Runbook: High ESI Error Rate

**Symptoms**: `CharacterVerificationHighEsiErrors` alert firing

**Investigation**:
1. Check ESI status: https://status.eveonline.com
2. Check error types in logs: `kubectl logs -n battlescope -l app=character-verifier | grep "ESI error"`
3. Check if specific error codes (429, 500, etc.)

**Actions**:
- If 429 (rate limited): Reduce BATCH_SIZE in ConfigMap
- If 5xx errors: Wait for ESI recovery, job will retry next hour
- If persistent: Consider increasing DELAY_BETWEEN_BATCHES

### Runbook: Many Sessions Invalidated

**Symptoms**: `CharacterVerificationManyInvalidations` alert firing

**Investigation**:
1. Check audit logs for invalidation reasons
2. Look for patterns (same corp, same alliance)
3. Verify auth_config hasn't changed unexpectedly

**Actions**:
- If expected (e.g., corp removed from allow list): Document and resolve alert
- If unexpected: Investigate potential bug in org checking logic
- Communicate to affected users if legitimate access revoked

---

## 11. Future Enhancements

### 11.1 Adaptive Verification Frequency

Instead of always hourly, adjust frequency based on:
- Characters in volatile corps (frequent membership changes) → verify every 30 minutes
- Characters in stable corps → verify every 4 hours
- Track org volatility in database

### 11.2 Real-time Webhook Support

If EVE adds webhook support for character events:
- Subscribe to corporation membership change events
- Immediately verify and invalidate sessions
- Keep hourly job as fallback

### 11.3 User Notifications

When session invalidated:
- Store notification in database
- Show banner on next visit: "Access revoked due to corporation change"
- Send email notification (if email configured)

### 11.4 Grace Period

Instead of immediate invalidation:
- Set account to "pending verification" state
- Allow 24-hour grace period for character to rejoin approved corp
- Only invalidate if still unapproved after grace period

---

## Summary

This specification provides:

✅ **Hourly background verification** of character corporation/alliance memberships
✅ **Graceful handling** of revoked ESI tokens
✅ **Session invalidation** for characters in unapproved organizations
✅ **Comprehensive error handling** for ESI rate limits and transient errors
✅ **Full observability** with metrics, logging, and alerts
✅ **Production-ready** Kubernetes CronJob implementation
✅ **Maximum 1-hour exposure window** when combined with login-time checks

**Security Posture**:
- Login-time verification (existing): Prevents initial access
- Hourly background verification (this spec): Catches changes during active sessions
- Combined: Maximum 1-hour window of potential unauthorized access

**Next Steps**:
1. Review and approve specification
2. Implement `CharacterVerifierService`
3. Write comprehensive tests
4. Deploy to staging and monitor
5. Roll out to production
