# User Profile - API Specification

_Last Updated: 2025-11-09_

## Overview

This document specifies the API endpoints required for the User Profile feature. All endpoints require authentication and operate on the currently authenticated user's account.

## Base URL

```
https://api.battlescope.com
```

## Authentication

All endpoints require a valid session cookie:
```
Cookie: battlescope_session=<session_token>
```

## Endpoints

### 1. Get User Profile

Get the current user's profile with all characters and feature roles.

```http
GET /me/profile
```

**Authentication**: Required

**Response**: `200 OK`

```typescript
{
  account: {
    id: string;              // UUID
    displayName: string;     // Account display name
    email: string | null;    // User's email
    lastLoginAt: string;     // ISO 8601 datetime
    createdAt: string;       // ISO 8601 datetime
  };
  primaryCharacter: {
    id: string;              // UUID
    eveCharacterId: string;  // EVE character ID
    eveCharacterName: string;
    portraitUrl: string;     // URL to character portrait
    corpId: string;
    corpName: string;
    allianceId: string | null;
    allianceName: string | null;
    tokenStatus: 'valid' | 'expiring' | 'expired';
  } | null;
  charactersGrouped: Array<{
    allianceId: string | null;
    allianceName: string | null;
    corporations: Array<{
      corpId: string;
      corpName: string;
      characters: Array<{
        id: string;                    // Character UUID
        eveCharacterId: string;
        eveCharacterName: string;
        portraitUrl: string;
        corpId: string;
        corpName: string;
        allianceId: string | null;
        allianceName: string | null;
        isPrimary: boolean;
        scopes: string[];              // ESI scopes
        tokenExpiresAt: string;        // ISO 8601 datetime
        tokenStatus: 'valid' | 'expiring' | 'expired';
        lastVerifiedAt: string;        // ISO 8601 datetime
        createdAt: string;             // ISO 8601 datetime
      }>;
    }>;
  }>;
  featureRoles: Array<{
    featureKey: string;       // e.g., "battles", "admin"
    featureName: string;      // e.g., "Battles & Killmails"
    roleKey: string;          // e.g., "user", "fc", "director", "admin"
    roleName: string;         // e.g., "Fleet Commander"
    roleRank: number;         // 0-3 (higher = more permissions)
  }>;
  stats: {
    totalCharacters: number;
    uniqueAlliances: number;
    uniqueCorporations: number;
  };
}
```

**Example Response**:

```json
{
  "account": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "displayName": "Commander Tyrael",
    "email": "commander@example.com",
    "lastLoginAt": "2025-11-09T18:30:00.000Z",
    "createdAt": "2025-10-01T10:00:00.000Z"
  },
  "primaryCharacter": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "eveCharacterId": "123456789",
    "eveCharacterName": "Commander Tyrael",
    "portraitUrl": "https://images.evetech.net/characters/123456789/portrait?size=128",
    "corpId": "98000001",
    "corpName": "State War Academy",
    "allianceId": null,
    "allianceName": null,
    "tokenStatus": "valid"
  },
  "charactersGrouped": [
    {
      "allianceId": null,
      "allianceName": null,
      "corporations": [
        {
          "corpId": "98000001",
          "corpName": "State War Academy",
          "characters": [
            {
              "id": "660e8400-e29b-41d4-a716-446655440001",
              "eveCharacterId": "123456789",
              "eveCharacterName": "Commander Tyrael",
              "portraitUrl": "https://images.evetech.net/characters/123456789/portrait?size=64",
              "corpId": "98000001",
              "corpName": "State War Academy",
              "allianceId": null,
              "allianceName": null,
              "isPrimary": true,
              "scopes": ["esi-characterContactsRead.v1"],
              "tokenExpiresAt": "2025-11-16T18:30:00.000Z",
              "tokenStatus": "valid",
              "lastVerifiedAt": "2025-11-09T18:00:00.000Z",
              "createdAt": "2025-10-01T10:00:00.000Z"
            }
          ]
        }
      ]
    }
  ],
  "featureRoles": [
    {
      "featureKey": "battles",
      "featureName": "Battles & Killmails",
      "roleKey": "fc",
      "roleName": "Fleet Commander",
      "roleRank": 1
    }
  ],
  "stats": {
    "totalCharacters": 1,
    "uniqueAlliances": 0,
    "uniqueCorporations": 1
  }
}
```

**Error Responses**:

- `401 Unauthorized`: Not authenticated
  ```json
  {
    "statusCode": 401,
    "error": "Unauthorized",
    "message": "Not authenticated"
  }
  ```

---

### 2. Set Primary Character

Change the user's primary character.

```http
POST /me/profile/primary-character
```

**Authentication**: Required

**Request Body**:

```typescript
{
  characterId: string;  // UUID of the character to set as primary
}
```

**Example Request**:

```json
{
  "characterId": "660e8400-e29b-41d4-a716-446655440002"
}
```

**Response**: `204 No Content`

**Error Responses**:

- `400 Bad Request`: Invalid character ID or character not found
  ```json
  {
    "statusCode": 400,
    "error": "Bad Request",
    "message": "Character not found or does not belong to this account"
  }
  ```

- `401 Unauthorized`: Not authenticated

---

### 3. Remove Character

Remove a character from the user's account.

```http
DELETE /me/profile/characters/:characterId
```

**Authentication**: Required

**Path Parameters**:

- `characterId` (string, UUID): ID of the character to remove

**Response**: `204 No Content`

**Error Responses**:

- `400 Bad Request`: Cannot remove character
  ```json
  {
    "statusCode": 400,
    "error": "Bad Request",
    "message": "Cannot remove your only character"
  }
  ```

- `404 Not Found`: Character not found
  ```json
  {
    "statusCode": 404,
    "error": "Not Found",
    "message": "Character not found"
  }
  ```

- `401 Unauthorized`: Not authenticated

**Notes**:
- Cannot remove the only character on the account
- If removing the primary character, a new primary must be set automatically (the oldest remaining character)
- Creates an audit log entry

---

### 4. Add Character (OAuth Flow)

Initiate the EVE SSO OAuth flow to add a new character.

```http
GET /auth/login?add_character=true
```

**Authentication**: Required (in query param or cookie)

**Query Parameters**:

- `add_character` (boolean): Flag to indicate this is adding a character to existing account
- `session_token` (string, optional): Session token if not in cookie

**Response**: `302 Redirect` to EVE SSO OAuth URL

**OAuth Callback**:

After successful OAuth, the callback handler (`/auth/callback`) will:
1. Verify the user is already authenticated
2. Add the new character to their account
3. Redirect to profile page with success message

**Redirect URL**: `/profile?character_added=true`

**Error Scenarios**:

If the character's corporation/alliance is not approved:
- Redirect to: `/profile?character_added=false&reason=org_not_approved`

If the character already belongs to another account:
- Redirect to: `/profile?character_added=false&reason=character_exists`

---

### 5. Refresh Character Token

Initiate ESI token refresh for a specific character.

```http
GET /me/profile/characters/:characterId/refresh
```

**Authentication**: Required

**Path Parameters**:

- `characterId` (string, UUID): ID of the character to refresh

**Response**: `302 Redirect` to EVE SSO OAuth URL

**OAuth Callback**:

After successful OAuth, redirects back to profile page with updated token.

**Redirect URL**: `/profile?token_refreshed=true&character_id=<characterId>`

**Error Responses**:

- `404 Not Found`: Character not found
  ```json
  {
    "statusCode": 404,
    "error": "Not Found",
    "message": "Character not found"
  }
  ```

- `401 Unauthorized`: Not authenticated

---

## Data Models

### Token Status

Token status is calculated based on `tokenExpiresAt`:

```typescript
function getTokenStatus(expiresAt: Date): 'valid' | 'expiring' | 'expired' {
  const now = new Date();
  const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (daysUntilExpiry < 0) {
    return 'expired';
  } else if (daysUntilExpiry <= 7) {
    return 'expiring';
  } else {
    return 'valid';
  }
}
```

### Character Grouping

Characters are grouped by alliance first, then by corporation:

1. **Alliance Group**: Characters with the same `allianceId` are grouped together
2. **Corporation Group**: Within each alliance, characters are grouped by `corpId`
3. **No Alliance**: Characters with `allianceId === null` are grouped in a separate "No Alliance" group

**Sorting**:
- Alliances: Alphabetically by `allianceName` (null alliance last)
- Corporations: Alphabetically by `corpName`
- Characters: Alphabetically by `eveCharacterName`

---

## Rate Limiting

All endpoints are subject to rate limiting:

- **Profile GET**: 10 requests per minute
- **Primary Character POST**: 5 requests per minute
- **Remove Character DELETE**: 5 requests per minute
- **Token Refresh GET**: 10 requests per minute

**Rate Limit Headers**:

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: 1636387200
```

**Rate Limit Exceeded Response**: `429 Too Many Requests`

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 30 seconds.",
  "retryAfter": 30
}
```

---

## Caching

### Client-Side Caching

- **Profile Data**: Cache for 5 minutes with `stale-while-revalidate`
- **Character Portraits**: Cache indefinitely (immutable)

**Cache Headers**:

```
Cache-Control: max-age=300, stale-while-revalidate=300
ETag: "33a64df551425fcc55e4d42a148795d9f25f89d4"
```

### Server-Side Caching

- **Feature Roles**: Cached in Redis for 10 minutes (invalidated on role change)
- **Character Data**: Not cached (always fresh from DB)

---

## Security Considerations

1. **Authorization**: Users can only access their own profile data
2. **Character Ownership**: Verify character belongs to authenticated user before any mutation
3. **Primary Character**: Ensure at least one character remains on account
4. **Audit Logging**: Log all character additions/removals and primary changes
5. **Token Security**: Never expose raw ESI tokens in API responses
6. **CORS**: Restrict to approved origins only

---

## Implementation Notes

### Backend

**New Route File**: `backend/api/src/routes/profile.ts`

**Reusable Logic**:
- Can leverage existing `AccountRepository.getDetailWithCharactersGrouped()` method
- Can reuse `FeatureRepository.getAccountFeatureRoles()` method
- Add new methods:
  - `AccountRepository.setPrimaryCharacter(accountId, characterId)`
  - `CharacterRepository.deleteCharacter(characterId, accountId)` (with ownership check)

**Middleware**:
- Use existing `createAuthMiddleware()` for authentication
- No special permissions required (users manage their own accounts)

### Frontend

**New Page**: `frontend/src/pages/Profile.tsx`

**Components**:
- `ProfileHeader.tsx` - Account header section
- `ProfileStats.tsx` - Statistics cards
- `CharacterCard.tsx` - Individual character card (reusable)
- `CharacterGroup.tsx` - Corporation grouping
- `AllianceGroup.tsx` - Alliance grouping
- `FeatureRoleCard.tsx` - Feature role display
- Modals:
  - `AddCharacterModal.tsx`
  - `RemoveCharacterModal.tsx`
  - `SetPrimaryModal.tsx`
  - `RefreshTokenModal.tsx`

**State Management**:
- Use React Query for data fetching and caching
- Optimistic updates for primary character change
- Invalidate cache after character add/remove

---

## Testing

### Unit Tests

- Token status calculation
- Character grouping logic
- Rate limiting enforcement
- Authorization checks

### Integration Tests

- Full profile load
- Set primary character flow
- Remove character flow
- Add character OAuth flow
- Token refresh flow

### E2E Tests

- Navigate to profile page
- View all sections
- Change primary character
- Remove character with confirmation
- Add character via SSO
- Refresh expired token

---

## Future Enhancements (Out of Scope for v1)

1. **Edit Display Name**: Allow users to change their display name
2. **Email Management**: Add/update email address
3. **Account Activity Log**: View recent login history and actions
4. **Character Notes**: Add personal notes to characters
5. **Character Tags**: Tag characters (main, alt, spy, etc.)
6. **Bulk Character Management**: Select multiple characters for actions
7. **Export Account Data**: GDPR compliance export
8. **Two-Factor Authentication**: Add 2FA for enhanced security
9. **API Key Management**: Generate API keys for third-party integrations
10. **Character Sharing**: Share specific characters with other accounts (corp management)
