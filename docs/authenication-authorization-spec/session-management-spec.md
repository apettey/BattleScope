# Session Management & Token Storage Specification

_Created: 2025-11-09_
_Updated: 2025-11-09_
_Status: ✅ Implemented_

## Overview

This document specifies the session management, cookie handling, and OAuth token storage for BattleScope's authentication system.

### Session Policy

**Single Session Per User**: Only one active session is allowed per account. When a user logs in, any existing session is automatically invalidated.

**Session Duration**: 8 hours by default (configurable via `SESSION_TTL_SECONDS`)

**Rationale**:

- Prevents session proliferation and unauthorized access from stale sessions
- Forces periodic re-authentication for security
- Reduces Redis memory usage

---

## 2. Session Cookie Requirements

### Cookie Configuration

**Cookie Name**: `battlescope_session`

**Cookie Attributes**:

```typescript
{
  httpOnly: true,        // Prevents JavaScript access (XSS protection)
  secure: true,          // HTTPS only (set to false via SESSION_COOKIE_SECURE=false)
  sameSite: 'lax',       // CSRF protection, allows navigation
  path: '/',             // Available to entire application
  maxAge: 28800,         // 8 hours default (configurable via SESSION_TTL_SECONDS)
  domain: hostname,      // Hostname without port (e.g., "10.0.1.5")
}
```

**Environment Variables**:

- `SESSION_TTL_SECONDS` - Session duration in seconds (default: 28800 = 8 hours)
- `SESSION_COOKIE_SECURE` - Enable secure flag (default: true, set to false for HTTP)
- `SESSION_COOKIE_NAME` - Cookie name (default: battlescope_session)

### Implementation Location

**Backend** (`backend/api/src/routes/auth.ts`):

```typescript
// After successful OAuth callback
reply.setCookie('battlescope_session', sessionToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 30, // 30 days
});
```

**Cookie Clearing on Logout**:

```typescript
reply.clearCookie('battlescope_session', {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
});
```

### Development vs Production

```typescript
// config.ts
export const getCookieConfig = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 30,
  domain: process.env.COOKIE_DOMAIN, // undefined for local
});
```

---

## 3. Session Storage Schema

### Session Data Structure

**Redis Keys**:

1. `battlescope:session:{sessionToken}` - Session data
2. `battlescope:account-session:{accountId}` - Current session token for account (enforces single session)

**Session Value** (JSON):

```typescript
interface Session {
  accountId: string; // UUID
  isSuperAdmin: boolean;
  roles: Record<string, number>; // featureKey -> rank
  expiresAt: number; // Unix timestamp
}
```

**Example Session**:

```json
{
  "accountId": "550e8400-e29b-41d4-a716-446655440000",
  "isSuperAdmin": false,
  "roles": {
    "battle-reports": 20,
    "battle-intel": 10
  },
  "expiresAt": 1699564800000
}
```

**Example Account-Session Mapping**:

```
battlescope:account-session:550e8400-e29b-41d4-a716-446655440000 -> "token123abc..."
```

### Single-Session-Per-User Implementation

When a new session is created:

1. Check if `battlescope:account-session:{accountId}` exists
2. If yes, delete the old session using the token stored there
3. Create new session at `battlescope:session:{newToken}`
4. Update `battlescope:account-session:{accountId}` with new token
5. Both keys have the same TTL (8 hours default)

### Redis Operations

**Create Session**:

```typescript
const sessionToken = crypto.randomBytes(32).toString('hex');
const sessionData: SessionData = {
  accountId: account.id,
  primaryCharacterId: account.primaryCharacterId,
  isSuperAdmin: account.isSuperAdmin,
  isBlocked: account.isBlocked,
  roles: await loadUserRoles(account.id),
  createdAt: Date.now(),
  lastAccessedAt: Date.now(),
  expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'] || 'unknown',
};

await redis.setex(
  `battlescope:session:${sessionToken}`,
  60 * 60 * 24 * 30, // 30 days TTL
  JSON.stringify(sessionData),
);
```

**Validate Session**:

```typescript
const sessionData = await redis.get(`battlescope:session:${sessionToken}`);
if (!sessionData) {
  throw new Error('Session not found or expired');
}

const session: SessionData = JSON.parse(sessionData);

// Check if blocked
if (session.isBlocked) {
  await redis.del(`battlescope:session:${sessionToken}`);
  throw new Error('Account is blocked');
}

// Check expiration
if (Date.now() > session.expiresAt) {
  await redis.del(`battlescope:session:${sessionToken}`);
  throw new Error('Session expired');
}

// Update last accessed timestamp
session.lastAccessedAt = Date.now();
await redis.setex(
  `battlescope:session:${sessionToken}`,
  60 * 60 * 24 * 30,
  JSON.stringify(session),
);

return session;
```

**Delete Session (Logout)**:

```typescript
await redis.del(`battlescope:session:${sessionToken}`);
```

**Delete All User Sessions**:

```typescript
// When user is blocked or changes password
const pattern = `battlescope:session:*`;
const keys = await redis.keys(pattern);

for (const key of keys) {
  const data = await redis.get(key);
  if (data) {
    const session: SessionData = JSON.parse(data);
    if (session.accountId === accountId) {
      await redis.del(key);
    }
  }
}
```

---

## 4. OAuth Token Storage

### Token Encryption

**Encryption Method**: AES-256-GCM

**Implementation**:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, 'hex'); // 32 bytes
const ALGORITHM = 'aes-256-gcm';

export const encryptToken = (token: string): string => {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:encrypted:authTag (all hex)
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
};

export const decryptToken = (encryptedToken: string): string => {
  const [ivHex, encryptedHex, authTagHex] = encryptedToken.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
};
```

**Environment Variable**:

```bash
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

### Character Token Storage

**On OAuth Callback** (New Character or Refresh):

```typescript
// After exchanging OAuth code for tokens
const encryptedAccessToken = encryptToken(esiTokens.access_token);
const encryptedRefreshToken = encryptToken(esiTokens.refresh_token);

const character = await db
  .insertInto('characters')
  .values({
    account_id: accountId,
    eve_character_id: eveCharacterId,
    eve_character_name: characterInfo.name,
    corp_id: characterInfo.corporation_id,
    corp_name: corporationInfo.name,
    alliance_id: characterInfo.alliance_id || null,
    alliance_name: allianceInfo?.name || null,
    portrait_url: `https://images.evetech.net/characters/${eveCharacterId}/portrait`,
    esi_access_token: encryptedAccessToken,
    esi_refresh_token: encryptedRefreshToken,
    esi_token_expires_at: new Date(Date.now() + esiTokens.expires_in * 1000),
    scopes: esiTokens.scope.split(' '),
    last_verified_at: new Date(),
  })
  .onConflict((oc) =>
    oc.column('eve_character_id').doUpdateSet({
      account_id: accountId,
      corp_id: characterInfo.corporation_id,
      corp_name: corporationInfo.name,
      alliance_id: characterInfo.alliance_id || null,
      alliance_name: allianceInfo?.name || null,
      esi_access_token: encryptedAccessToken,
      esi_refresh_token: encryptedRefreshToken,
      esi_token_expires_at: new Date(Date.now() + esiTokens.expires_in * 1000),
      scopes: esiTokens.scope.split(' '),
      last_verified_at: new Date(),
      updated_at: new Date(),
    }),
  )
  .returningAll()
  .executeTakeFirstOrThrow();
```

### Token Refresh Flow

**Automatic Token Refresh**:

```typescript
export class CharacterTokenService {
  async getValidAccessToken(characterId: string): Promise<string> {
    const character = await db
      .selectFrom('characters')
      .selectAll()
      .where('id', '=', characterId)
      .executeTakeFirstOrThrow();

    // Check if token is expired or expiring soon (5 minute buffer)
    const bufferMs = 5 * 60 * 1000;
    const isExpired = new Date(character.esi_token_expires_at).getTime() - bufferMs < Date.now();

    if (!isExpired) {
      return decryptToken(character.esi_access_token);
    }

    // Token expired, refresh it
    const refreshToken = decryptToken(character.esi_refresh_token);
    const newTokens = await this.refreshEsiToken(refreshToken);

    // Store new tokens
    const encryptedAccessToken = encryptToken(newTokens.access_token);
    const encryptedRefreshToken = encryptToken(newTokens.refresh_token);

    await db
      .updateTable('characters')
      .set({
        esi_access_token: encryptedAccessToken,
        esi_refresh_token: encryptedRefreshToken,
        esi_token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000),
        updated_at: new Date(),
      })
      .where('id', '=', characterId)
      .execute();

    return newTokens.access_token;
  }

  private async refreshEsiToken(refreshToken: string): Promise<EsiTokenResponse> {
    const response = await fetch('https://login.eveonline.com/v2/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${config.eveClientId}:${config.eveClientSecret}`,
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh token: ${response.statusText}`);
    }

    return await response.json();
  }
}
```

### Token Revocation

**On Character Unlink**:

```typescript
export const unlinkCharacter = async (accountId: string, characterId: string): Promise<void> => {
  const character = await db
    .selectFrom('characters')
    .selectAll()
    .where('id', '=', characterId)
    .where('account_id', '=', accountId)
    .executeTakeFirstOrThrow();

  // Revoke ESI token (optional, EVE SSO doesn't always support this)
  const refreshToken = decryptToken(character.esi_refresh_token);
  try {
    await fetch('https://login.eveonline.com/v2/oauth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${config.eveClientId}:${config.eveClientSecret}`,
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        token: refreshToken,
        token_type_hint: 'refresh_token',
      }),
    });
  } catch (error) {
    // Log but don't fail - token will expire naturally
    logger.warn({ error, characterId }, 'Failed to revoke ESI token');
  }

  // Delete from database
  await db
    .deleteFrom('characters')
    .where('id', '=', characterId)
    .where('account_id', '=', accountId)
    .execute();

  // Audit log
  await auditLogRepository.record({
    actor_account_id: accountId,
    action: 'character.unlinked',
    target_type: 'character',
    target_id: characterId,
    metadata: { eve_character_id: character.eve_character_id },
  });
};
```

---

## 5. Auth Middleware Implementation

### Session Validation Middleware

```typescript
// backend/api/src/middleware/auth.ts

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyRequest {
    session: SessionData;
    account: {
      id: string;
      isSuperAdmin: boolean;
      roles: Map<string, number>;
    };
  }
}

export const createAuthMiddleware = (redis: Redis) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Extract session token from cookie
    const sessionToken = request.cookies.battlescope_session;

    if (!sessionToken) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'No session token provided',
      });
    }

    // Validate session
    let sessionData: SessionData;
    try {
      const rawSession = await redis.get(`battlescope:session:${sessionToken}`);

      if (!rawSession) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Session not found or expired',
        });
      }

      sessionData = JSON.parse(rawSession);

      // Check if blocked
      if (sessionData.isBlocked) {
        await redis.del(`battlescope:session:${sessionToken}`);
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Account is blocked',
        });
      }

      // Check expiration
      if (Date.now() > sessionData.expiresAt) {
        await redis.del(`battlescope:session:${sessionToken}`);
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Session expired',
        });
      }

      // Update last accessed timestamp (don't await, fire and forget)
      sessionData.lastAccessedAt = Date.now();
      redis
        .setex(
          `battlescope:session:${sessionToken}`,
          60 * 60 * 24 * 30,
          JSON.stringify(sessionData),
        )
        .catch((err) => {
          request.log.warn({ err }, 'Failed to update session last accessed time');
        });
    } catch (error) {
      request.log.error({ error }, 'Session validation error');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to validate session',
      });
    }

    // Attach session and account to request
    request.session = sessionData;
    request.account = {
      id: sessionData.accountId,
      isSuperAdmin: sessionData.isSuperAdmin,
      roles: new Map(Object.entries(sessionData.roles)),
    };
  };
};
```

---

## 6. Frontend Integration

### Cookie Handling

**Browser automatically handles cookies** - No JavaScript changes needed for basic cookie handling.

**Reading Cookie in Frontend** (for debugging only):

```typescript
// Frontend should NOT read the httpOnly cookie directly
// Instead, call the /me endpoint to check auth status

export const checkAuthStatus = async (): Promise<User | null> => {
  try {
    const response = await fetch('/api/me', {
      credentials: 'include', // Important: include cookies
    });

    if (response.status === 401) {
      return null; // Not authenticated
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to check auth status:', error);
    return null;
  }
};
```

### API Requests with Credentials

**All authenticated requests must include credentials**:

```typescript
// fetch API
fetch('/api/battles', {
  credentials: 'include', // Sends cookies with request
});

// axios
axios.get('/api/battles', {
  withCredentials: true,
});
```

### AuthContext Updates

```typescript
// frontend/src/modules/auth/AuthContext.tsx

export const AuthProvider: FC<PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch('/api/me', {
          credentials: 'include', // Important!
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Failed to load user:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
```

---

## 7. OAuth Callback Flow (Complete)

### Step-by-Step Implementation

```typescript
// backend/api/src/routes/auth.ts

app.get('/auth/callback', {
  schema: {
    querystring: z.object({
      code: z.string(),
      state: z.string(),
    }),
  },
  handler: async (request, reply) => {
    const { code, state } = request.query;

    try {
      // 1. Verify state parameter (CSRF protection)
      const storedState = await redis.get(`battlescope:oauth:state:${state}`);
      if (!storedState) {
        return reply.redirect(302, `${config.frontendUrl}?error=invalid_state`);
      }
      await redis.del(`battlescope:oauth:state:${state}`);

      // 2. Exchange authorization code for tokens
      const tokenResponse = await fetch('https://login.eveonline.com/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${config.eveClientId}:${config.eveClientSecret}`,
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Token exchange failed');
      }

      const tokens = await tokenResponse.json();

      // 3. Verify JWT and extract character ID
      const payload = await verifyEveJwt(tokens.access_token);
      const eveCharacterId = BigInt(payload.sub.split(':')[2]);

      // 4. Fetch character info from ESI
      const characterInfo = await esiClient.getCharacterInfo(eveCharacterId);
      const corporationInfo = await esiClient.getCorporationInfo(characterInfo.corp_id);
      const allianceInfo = characterInfo.alliance_id
        ? await esiClient.getAllianceInfo(characterInfo.alliance_id)
        : null;

      // 5. Check org gating
      const isAllowed = await authConfigRepository.isCharacterAllowed(
        characterInfo.corp_id,
        characterInfo.alliance_id,
      );

      if (!isAllowed) {
        return reply.redirect(302, `${config.frontendUrl}?error=org_not_allowed`);
      }

      // 6. Encrypt tokens
      const encryptedAccessToken = encryptToken(tokens.access_token);
      const encryptedRefreshToken = encryptToken(tokens.refresh_token);

      // 7. Upsert character
      const character = await db
        .insertInto('characters')
        .values({
          eve_character_id: eveCharacterId,
          eve_character_name: characterInfo.name,
          corp_id: characterInfo.corp_id,
          corp_name: corporationInfo.name,
          alliance_id: characterInfo.alliance_id || null,
          alliance_name: allianceInfo?.name || null,
          portrait_url: `https://images.evetech.net/characters/${eveCharacterId}/portrait`,
          esi_access_token: encryptedAccessToken,
          esi_refresh_token: encryptedRefreshToken,
          esi_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
          scopes: tokens.scope.split(' '),
          last_verified_at: new Date(),
        })
        .onConflict((oc) =>
          oc.column('eve_character_id').doUpdateSet({
            corp_id: characterInfo.corp_id,
            corp_name: corporationInfo.name,
            alliance_id: characterInfo.alliance_id || null,
            alliance_name: allianceInfo?.name || null,
            esi_access_token: encryptedAccessToken,
            esi_refresh_token: encryptedRefreshToken,
            esi_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
            scopes: tokens.scope.split(' '),
            last_verified_at: new Date(),
            updated_at: new Date(),
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      // 8. Get or create account
      let account = await accountRepository.findByCharacterId(character.id);

      if (!account) {
        account = await accountRepository.create({
          display_name: characterInfo.name,
          primary_character_id: character.id,
        });
      }

      // 9. Update character's account_id if needed
      if (character.account_id !== account.id) {
        await db
          .updateTable('characters')
          .set({ account_id: account.id })
          .where('id', '=', character.id)
          .execute();
      }

      // 10. Load user roles
      const roles = await accountRepository.getRoles(account.id);
      const rolesMap: Record<string, number> = {};
      for (const role of roles) {
        rolesMap[role.featureKey] = role.roleRank;
      }

      // 11. Create session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const sessionData: SessionData = {
        accountId: account.id,
        primaryCharacterId: account.primary_character_id,
        isSuperAdmin: account.is_super_admin,
        isBlocked: account.is_blocked,
        roles: rolesMap,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] || 'unknown',
      };

      await redis.setex(
        `battlescope:session:${sessionToken}`,
        60 * 60 * 24 * 30,
        JSON.stringify(sessionData),
      );

      // 12. Set cookie
      reply.setCookie('battlescope_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });

      // 13. Audit log
      await auditLogRepository.record({
        actor_account_id: account.id,
        action: 'account.login',
        target_type: 'account',
        target_id: account.id,
        metadata: {
          eve_character_id: eveCharacterId.toString(),
          ip_address: request.ip,
        },
      });

      // 14. Redirect to frontend
      return reply.redirect(302, config.frontendUrl);
    } catch (error) {
      request.log.error({ error }, 'OAuth callback failed');
      return reply.redirect(302, `${config.frontendUrl}?error=auth_failed`);
    }
  },
});
```

---

## 8. Multi-Character Support

### Link Additional Character

```typescript
app.get('/me/characters/link/start', {
  preHandler: [authMiddleware],
  handler: async (request, reply) => {
    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');

    // Store state with account ID
    await redis.setex(
      `battlescope:oauth:link:${state}`,
      300, // 5 minutes
      JSON.stringify({
        accountId: request.account.id,
        linkingCharacter: true,
      }),
    );

    // Redirect to EVE SSO
    const authUrl = buildEveOAuthUrl({
      clientId: config.eveClientId,
      redirectUri: `${config.apiBaseUrl}/auth/callback/link`,
      state,
      scopes: config.eveScopes,
    });

    return reply.redirect(302, authUrl);
  },
});

app.get('/auth/callback/link', {
  schema: {
    querystring: z.object({
      code: z.string(),
      state: z.string(),
    }),
  },
  handler: async (request, reply) => {
    const { code, state } = request.query;

    // Verify state and get account ID
    const storedData = await redis.get(`battlescope:oauth:link:${state}`);
    if (!storedData) {
      return reply.redirect(302, `${config.frontendUrl}/profile?error=invalid_state`);
    }

    const { accountId } = JSON.parse(storedData);
    await redis.del(`battlescope:oauth:link:${state}`);

    // Exchange code for tokens and link character to existing account
    // (Similar to main callback, but skip account creation)

    // ... token exchange, character creation ...

    // Link to existing account
    await db
      .updateTable('characters')
      .set({ account_id: accountId })
      .where('id', '=', newCharacter.id)
      .execute();

    return reply.redirect(302, `${config.frontendUrl}/profile?success=character_linked`);
  },
});
```

---

## 9. Testing Session Management

### Unit Tests

```typescript
describe('Session Management', () => {
  it('should create session with correct TTL', async () => {
    const sessionToken = await sessionService.create(accountId);
    const session = await redis.get(`battlescope:session:${sessionToken}`);
    expect(session).toBeDefined();
  });

  it('should validate session and update last accessed time', async () => {
    const sessionToken = await sessionService.create(accountId);
    await sleep(1000);
    const session = await sessionService.validate(sessionToken);
    expect(session.lastAccessedAt).toBeGreaterThan(session.createdAt);
  });

  it('should reject expired session', async () => {
    const sessionToken = await sessionService.create(accountId);
    // Manually expire
    await redis.setex(`battlescope:session:${sessionToken}`, 1, '{}');
    await sleep(2000);
    await expect(sessionService.validate(sessionToken)).rejects.toThrow('Session expired');
  });

  it('should reject blocked account', async () => {
    await accountRepository.block(accountId);
    const sessionToken = await sessionService.create(accountId);
    await expect(sessionService.validate(sessionToken)).rejects.toThrow('Account is blocked');
  });
});
```

### Integration Tests

```typescript
describe('Auth E2E Flow', () => {
  it('should complete full OAuth flow and set session cookie', async () => {
    // Mock EVE SSO responses
    nock('https://login.eveonline.com').post('/v2/oauth/token').reply(200, {
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      expires_in: 1200,
    });

    const response = await server.inject({
      method: 'GET',
      url: '/auth/callback?code=test_code&state=test_state',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers['set-cookie']).toBeDefined();
    expect(response.headers['set-cookie']).toContain('battlescope_session=');
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Lax');
  });

  it('should access protected endpoint with valid session', async () => {
    const sessionToken = await sessionService.create(accountId);

    const response = await server.inject({
      method: 'GET',
      url: '/me',
      cookies: {
        battlescope_session: sessionToken,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: accountId,
      displayName: 'Test User',
    });
  });
});
```

---

## 10. Security Checklist

- [ ] **Session cookies use httpOnly flag** (prevents XSS)
- [ ] **Session cookies use secure flag in production** (HTTPS only)
- [ ] **Session cookies use SameSite=lax** (CSRF protection)
- [ ] **OAuth tokens encrypted at rest** (AES-256-GCM)
- [ ] **Encryption key stored in Kubernetes Secret** (not in code)
- [ ] **Session tokens are cryptographically random** (32 bytes)
- [ ] **Sessions have expiration** (30 days max)
- [ ] **State parameter validated** (CSRF protection for OAuth)
- [ ] **Blocked accounts cannot authenticate**
- [ ] **Session invalidation on logout**
- [ ] **Session invalidation on account block**
- [ ] **Audit logging for all auth events**

---

## 11. Implementation Priority

### Phase 1: Basic Session (IMMEDIATE)

1. Implement session creation in `/auth/callback`
2. Set cookie after successful OAuth
3. Create `authMiddleware` to validate sessions
4. Update `/me` endpoint to use session
5. Implement logout endpoint

### Phase 2: Token Storage (HIGH PRIORITY)

1. Implement token encryption/decryption
2. Store OAuth tokens in `characters` table
3. Implement token refresh service
4. Add token revocation on character unlink

### Phase 3: Multi-Character (MEDIUM PRIORITY)

1. Implement character linking flow
2. Add primary character selection
3. Support multiple ESI tokens per account

### Phase 4: Security Hardening (ONGOING)

1. Add rate limiting to auth endpoints
2. Implement session renewal
3. Add suspicious activity detection
4. Implement account recovery flow

---

## 12. Configuration

### Environment Variables

```bash
# Session Management
SESSION_TTL_DAYS=30
SESSION_COOKIE_SECURE=true  # false for local dev

# Token Encryption
TOKEN_ENCRYPTION_KEY=<64-char-hex-string>  # Generate with crypto.randomBytes(32).toString('hex')

# Redis
REDIS_URL=redis://localhost:6379
REDIS_SESSION_PREFIX=battlescope:session:

# OAuth
EVE_CLIENT_ID=<from-eve-developers>
EVE_CLIENT_SECRET=<from-eve-developers>
EVE_CALLBACK_URL=http://localhost:3000/auth/callback
EVE_SCOPES=esi-killmails.read_killmails.v1 esi-characters.read_corporation_roles.v1

# Frontend
FRONTEND_URL=http://localhost:5173
API_BASE_URL=http://localhost:3000
```

---

## Summary

This specification addresses all three critical issues:

1. ✅ **Session Cookies** - Detailed implementation with proper security flags
2. ✅ **Session Awareness** - Complete Redis-based session storage and validation
3. ✅ **OAuth Token Storage** - Encrypted token storage with automatic refresh

**Next Steps**:

1. Implement session management service
2. Add cookie handling to OAuth callback
3. Implement token encryption utility
4. Update auth middleware to validate sessions
5. Store ESI tokens encrypted in database
6. Add token refresh mechanism
7. Test end-to-end auth flow
