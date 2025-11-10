# Multi-Character Management

_Last Updated: 2025-11-10_

## Overview

BattleScope supports multiple EVE Online characters per account. This document describes how character management works, including adding alt characters, primary character rules, and organization gating.

---

## Key Concepts

### Primary Character

Every account has exactly **one primary character**. The primary character is:

1. The character used for initial login/account creation
2. The character whose corp/alliance determines account access
3. The character displayed in the user's profile header
4. Set automatically to the first character added to an account

### Alt Characters

Alt characters are additional characters linked to an account. Alt characters:

1. Do NOT need to be in approved corps/alliances
2. Can be in any corp/alliance (including hostile ones)
3. Cannot be used for initial login (must add via existing session)
4. Can be promoted to primary character by the user or SuperAdmin

---

## Organization Gating Rules

### Rule 1: Primary Character MUST Be Approved

The **primary character's** corporation or alliance must be in the approved list:

- Checked during initial login
- Checked by background verifier hourly
- If primary char leaves approved org → session invalidated

### Rule 2: Alt Characters Are NOT Gated

Alt characters can be in ANY corp/alliance:

- No org check when adding alt character
- Allows spy alts, market alts, etc.
- No session invalidation if alt changes corp

### Rule 3: Changing Primary Requires Approval

If a user changes their primary character:

- New primary MUST be in an approved org (enforced by background verifier)
- User can still change primary in the UI
- Next verifier run will invalidate session if new primary is not approved

---

## Adding Alt Characters

### User Flow

1. User is logged in with their main account
2. User clicks "Add Character" in profile
3. Redirected to `/auth/login?add_character=true`
4. System extracts current account ID from session
5. User completes EVE SSO for alt character
6. System checks if alt already exists on **another** account
   - If yes → error "character_exists"
   - If no → add to current account
7. **No org gating check** performed
8. User redirected back to profile
9. Alt appears in character list (not as primary)

### Technical Implementation

**Login Endpoint** (`GET /auth/login?add_character=true`):
```typescript
// Extract current session
const session = await sessionService.validateSession(request.cookies.battlescope_session);
if (!session) {
  return redirect(frontendUrl + '?error=not_authenticated');
}

// Generate OAuth URL with metadata
const { url } = eveSSOService.generateAuthorizationUrl(frontendUrl, {
  isAddingCharacter: true,
  existingAccountId: session.accountId,
});
```

**Callback Handler** (`GET /auth/callback`):
```typescript
// Extract OAuth state
const { oauthState } = await eveSSOService.exchangeCodeForToken(code, state);

if (oauthState.isAddingCharacter && oauthState.existingAccountId) {
  // Check if character exists on different account
  const existing = await characterRepository.getByEveCharacterId(characterId);
  if (existing && existing.accountId !== oauthState.existingAccountId) {
    return redirect(frontendUrl + '#profile?error=character_exists');
  }

  // Add character (NO org gating check)
  await characterRepository.create({
    accountId: oauthState.existingAccountId,
    // ... character data
  });

  // Audit log
  await auditLogRepository.create({
    actorAccountId: oauthState.existingAccountId,
    action: 'character.added',
    targetType: 'character',
    targetId: newCharacter.id,
  });

  // Redirect back (don't create new session)
  return redirect(frontendUrl + '#profile?character_added=true');
}
```

---

## Changing Primary Character

### User Self-Service

Users can change their primary character in the profile:

1. Navigate to Profile page
2. Find character they want to set as primary
3. Click "Set as Primary"
4. System updates `account.primaryCharacterId`
5. Audit log created
6. UI updates immediately

**Important**: If the new primary is not in an approved org, the user will be locked out on the next background verification run (within 1 hour).

### SuperAdmin Override

SuperAdmins can change any user's primary character:

**Endpoint**: `POST /admin/accounts/:id/primary-character`

**Use Case**: User's primary character left corp and they cannot log in

**Request**:
```json
{
  "characterId": "uuid-of-character-on-their-account"
}
```

**Requirements**:
1. Must be SuperAdmin
2. Character must belong to the target account
3. Character must exist

**Audit Log**:
```typescript
{
  action: 'account.primary_character_changed_by_admin',
  targetType: 'account',
  targetId: accountId,
  metadata: {
    characterId: '...',
    characterName: '...',
    adminId: '...',
  },
}
```

---

## Edge Cases

### Case 1: User's Primary Leaves Approved Corp

**Scenario**: User's main character leaves their alliance

**Result**:
1. User can still log in until next verification
2. Background verifier runs (within 1 hour)
3. Verifier checks primary character's org
4. Org not approved → session invalidated
5. User cannot log in

**Solution**:
- User contacts SuperAdmin
- SuperAdmin changes primary to another character in approved org
- User can log in again

### Case 2: User Adds Alt from Enemy Alliance

**Scenario**: User wants to add spy alt from hostile alliance

**Result**:
1. User clicks "Add Character"
2. Logs in with spy alt via EVE SSO
3. System adds spy alt to account (no org check)
4. Spy alt appears in profile
5. User can still log in (primary unchanged)

**Restrictions**:
- User cannot use spy alt for login
- User cannot set spy alt as primary (would fail next verification)

### Case 3: Character Exists on Another Account

**Scenario**: User tries to add a character that's already on another account

**Result**:
1. User clicks "Add Character"
2. Logs in with character via EVE SSO
3. System checks if character exists
4. Character found on different account
5. Error: "character_exists"
6. Character NOT added

**Solution**:
- User must remove character from other account first
- Then add to current account

### Case 4: User Has Multiple Approved Characters

**Scenario**: User has 3 characters all in approved corps

**Result**:
- User can freely switch primary between them
- All switches are instant
- No risk of lockout
- Background verifier approves all

---

## API Endpoints Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/auth/login?add_character=true` | GET | Required (session) | Initiate add character flow |
| `/auth/callback` | GET | Public | OAuth callback (handles both login and add_character) |
| `/me/profile/primary-character` | POST | Required | User changes their own primary |
| `/admin/accounts/:id/primary-character` | POST | SuperAdmin | Admin changes user's primary |

---

## Background Verification

The background verifier runs hourly and checks:

1. For each character: Get current corp/alliance from ESI
2. Update character record with latest org info
3. **For primary characters only**: Check if org is approved
4. If primary's org not approved → invalidate all sessions for that account

See [background-verification-spec.md](./background-verification-spec.md) for full details.

---

## Database Schema

**accounts table**:
```sql
primary_character_id UUID REFERENCES characters(id)
```

**characters table**:
```sql
account_id UUID REFERENCES accounts(id)
eve_character_id BIGINT UNIQUE
corp_id BIGINT
alliance_id BIGINT NULL
-- No "is_approved" flag - only primary matters
```

**Determining primary**:
```sql
-- Get account's primary character
SELECT c.* FROM characters c
JOIN accounts a ON c.id = a.primary_character_id
WHERE a.id = $account_id;

-- Check if character is primary
SELECT EXISTS (
  SELECT 1 FROM accounts
  WHERE id = $account_id
  AND primary_character_id = $character_id
);
```

---

## Security Considerations

1. **Session Hijacking**: Adding characters requires valid session (can't add to someone else's account)
2. **Character Stealing**: Cannot add character if it exists on another account
3. **Privilege Escalation**: Cannot gain access by adding approved alt (must be primary)
4. **Lockout Prevention**: SuperAdmin can change primary if user locked out
5. **Audit Trail**: All primary changes logged with actor and metadata

---

## Future Enhancements

1. **Character Transfer**: Allow moving character between accounts (with both users' consent)
2. **Character Groups**: Tag characters (main, pvp alt, market alt, spy, etc.)
3. **Bulk Character Import**: Add multiple characters in one flow
4. **Primary Change Validation**: Warn user before setting non-approved char as primary
5. **Grace Period**: Allow 24-hour grace period if primary leaves corp (instead of 1 hour)
