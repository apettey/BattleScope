# Authentication & Authorization Spec (EVE Online SSO, Multi-Character, Feature-Scoped RBAC)

_Last updated: 2025-11-09_
_Updated for BattleScope architecture: 2025-11-07_

---

## ⚠️ CRITICAL IMPLEMENTATION GAPS IDENTIFIED (2025-11-09)

**Status**: Authentication flow is incomplete. The following pieces are MISSING and must be implemented:

1. **❌ Session Cookie Not Set** - OAuth callback does not set `battlescope_session` cookie
2. **❌ Session Storage Not Implemented** - Redis session management missing
3. **❌ OAuth Token Storage Missing** - ESI tokens not encrypted and stored in database
4. **❌ Token Refresh Not Implemented** - No automatic token refresh mechanism
5. **❌ Multi-Character Support Incomplete** - Character linking flow not functional

**See**: [Session Management Specification](./session-management-spec.md) for complete implementation requirements.

**Impact**: Users authenticate but cannot stay logged in; ESI API calls on behalf of users are not possible.

---

## 1) Purpose & Scope

Design a clean, extensible identity and authorization system for **BattleScope** that:

- Uses **EVE Online SSO (OAuth2/OIDC)** for login.
- Allows an **Account** to own **multiple Characters** (each with its own ESI token).
- Gates access based on **Corporation/Alliance membership** (configurable allow/deny lists).
- Implements **Feature-scoped RBAC** (Roles per Feature: `User → FC → Director → Admin`; plus global `SuperAdmin`).
- Provides **HTTP authorization checks** via middleware for API requests.
- Includes **admin UI** for user/role/feature/settings management (readable by Directors, editable by Admins; global admin overrides).

> **Integration Note**: This auth system integrates with the existing BattleScope API service. The API handles OAuth callbacks and enforces authorization via middleware, delegating policy decisions to a lightweight authorization layer within the same codebase.

> Non-goals: Building a dedicated IdP; deep product feature specs (beyond seeds `Battle Reports`, `Battle Intel`).

---

## 2) Definitions

- **Account**: Application user entity (email optional; identity is EVE SSO primary character + internal ID).
- **Character**: EVE character linked to an Account; stores ESI credentials/scopes; one is marked **Primary**.
- **Org**: EVE **Corporation** or **Alliance**.
- **Feature**: A product area with its own roles & settings (seed: `battle-reports`, `battle-intel`).
- **Role**: `user`, `fc`, `director`, `admin` (per Feature). **SuperAdmin** is global over everything.
- **PDP**: Policy Decision Point (Authorization Service).
- **PEP**: Policy Enforcement Point (API gateway/backend).

---

## 3) High-Level Architecture

```
[Browser / App Frontend]
        │
        ▼
[BattleScope API Service (Fastify)]
        │
        ├─── Auth Routes (/auth/*)
        │    └─── EVE SSO OAuth flow, token refresh, character linking
        │
        ├─── Auth Middleware (session validation)
        │    └─── Extracts account from JWT/session
        │
        ├─── Authorization Module (PDP)
        │    └─── Feature-scoped RBAC checks (allow/deny)
        │
        ├─── Protected Routes (battles, admin, features)
        │    └─── Call authorization module before handlers
        │
        └─── Repositories & Services
             ├─── AccountRepository (accounts, characters)
             ├─── AuthRepository (sessions, audit logs)
             ├─── FeatureRepository (features, roles, settings)
             └─── ESI Client (EVE API integration)
        │
        ▼
[PostgreSQL Database] + [Redis Cache]
```

**Component Responsibilities**:
- **Auth Routes**: Handle EVE SSO login/callback, token refresh, logout, character linking via `/auth/*` endpoints
- **Auth Middleware**: Fastify `preHandler` hook that validates JWT/session and attaches `request.account` to protected routes
- **Authorization Module**: Lightweight policy engine (function calls, not separate service) that checks feature roles and permissions; cached in Redis
- **Protected Routes**: Call authorization checks before executing business logic (e.g., `canViewFeature`, `canManageUsers`)
- **Repositories**: Kysely-based data access for accounts, characters, features, roles, settings
- **PostgreSQL**: Primary data store (accounts, characters, features, roles, audit logs)
- **Redis**: Session storage, authorization cache (TTL 60-120s), ESI token cache

**Integration with Existing BattleScope API**:
- Auth routes are registered alongside existing battle/killmail routes in `backend/api/src/server.ts`
- Uses existing `buildServer` pattern with dependency injection
- Shares database client, Redis instance, and configuration with other API features
- Authorization middleware applied selectively to protected endpoints

_Tech stack:_ **Fastify** with Zod type provider, **Kysely** query builder, **PostgreSQL 15**, **Redis 7**, **ioredis**, **Kubernetes**, **GitHub Actions**, **OpenTelemetry** + **Pino** logging.

---

## 4) Data Model

### 4.1 Database Schema

**Note**: Column names use `snake_case` following BattleScope conventions. All tables include `created_at` and `updated_at` timestamps (managed by Kysely or triggers). EVE entity IDs are stored as `bigint` to support values exceeding JavaScript's `Number.MAX_SAFE_INTEGER`.

#### accounts
```sql
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,  -- nullable, unique when present
  display_name text NOT NULL,
  primary_character_id uuid REFERENCES characters(id),  -- nullable until first link
  is_blocked boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,  -- soft delete
  is_super_admin boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Kysely Type**:
```typescript
interface AccountsTable {
  id: Generated<string>;
  email: string | null;
  display_name: string;
  primary_character_id: string | null;
  is_blocked: Generated<boolean>;
  is_deleted: Generated<boolean>;
  is_super_admin: Generated<boolean>;
  last_login_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
```

**Zod Schema** (API):
```typescript
const AccountSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  displayName: z.string(),
  primaryCharacterId: z.string().uuid().nullable(),
  isBlocked: z.boolean(),
  isSuperAdmin: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
});
```

---

#### characters
```sql
CREATE TABLE characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  eve_character_id bigint NOT NULL UNIQUE,
  eve_character_name text NOT NULL,
  corp_id bigint NOT NULL,
  corp_name text NOT NULL,
  alliance_id bigint,
  alliance_name text,
  portrait_url text NOT NULL,  -- EVE image CDN
  esi_access_token text NOT NULL,  -- encrypted
  esi_refresh_token text NOT NULL,  -- encrypted
  esi_token_expires_at timestamptz NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_characters_account_id ON characters(account_id);
CREATE INDEX idx_characters_eve_character_id ON characters(eve_character_id);
```

**Kysely Type**:
```typescript
interface CharactersTable {
  id: Generated<string>;
  account_id: string;
  eve_character_id: bigint;
  eve_character_name: string;
  corp_id: bigint;
  corp_name: string;
  alliance_id: bigint | null;
  alliance_name: string | null;
  portrait_url: string;
  esi_access_token: string;  // encrypted
  esi_refresh_token: string;  // encrypted
  esi_token_expires_at: Date;
  scopes: string[];
  last_verified_at: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
```

---

#### features
```sql
CREATE TABLE features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,  -- e.g. 'battle-reports', 'battle-intel'
  name text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Seed Values**:
```sql
INSERT INTO features (key, name, description) VALUES
  ('battle-reports', 'Battle Reports', 'View and analyze reconstructed battles'),
  ('battle-intel', 'Battle Intel', 'Real-time killmail feed and intelligence');
```

---

#### roles
```sql
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,  -- 'user', 'fc', 'director', 'admin'
  name text NOT NULL,
  rank int NOT NULL,  -- user=10, fc=20, director=30, admin=40
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Seed Values**:
```sql
INSERT INTO roles (key, name, rank) VALUES
  ('user', 'User', 10),
  ('fc', 'Fleet Commander', 20),
  ('director', 'Director', 30),
  ('admin', 'Admin', 40);
```

---

#### account_feature_roles
```sql
CREATE TABLE account_feature_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES accounts(id),  -- nullable for system grants
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, feature_id)  -- one role per account per feature
);

CREATE INDEX idx_account_feature_roles_account_id ON account_feature_roles(account_id);
CREATE INDEX idx_account_feature_roles_feature_id ON account_feature_roles(feature_id);
```

---

#### feature_settings
```sql
CREATE TABLE feature_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id uuid NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_by uuid NOT NULL REFERENCES accounts(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(feature_id, key)
);
```

---

#### auth_config
```sql
CREATE TABLE auth_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- singleton row
  allowed_corp_ids bigint[] NOT NULL DEFAULT '{}',
  allowed_alliance_ids bigint[] NOT NULL DEFAULT '{}',
  denied_corp_ids bigint[] NOT NULL DEFAULT '{}',
  denied_alliance_ids bigint[] NOT NULL DEFAULT '{}',
  require_membership boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Initialize singleton row
INSERT INTO auth_config (id) VALUES ('00000000-0000-0000-0000-000000000001');
```

---

#### audit_logs
```sql
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_account_id uuid REFERENCES accounts(id),  -- nullable for system actions
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,  -- stores uuid/bigint/text as string
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_actor_account_id ON audit_logs(actor_account_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

**Example Audit Log Entries**:
- `{ action: 'account.login', target_type: 'account', target_id: '<uuid>', metadata: { eve_character_id: 12345 } }`
- `{ action: 'role.granted', target_type: 'account_feature_role', target_id: '<uuid>', metadata: { feature: 'battle-reports', role: 'fc' } }`
- `{ action: 'settings.updated', target_type: 'feature_settings', target_id: '<uuid>', metadata: { feature: 'battle-intel', key: 'alert_threshold' } }`

---

## 5) Authentication (EVE Online SSO)

- OAuth2/OIDC Authorization Code + PKCE.
- Scopes minimal; expand per Feature.
- Validate ID token via JWKS; use `state` and `nonce`.
- Encrypt ESI tokens; rotate refresh tokens if supported.
- Issue short-lived **app JWT** and long-lived refresh token.

### Login & Org Gating

1. On callback, fetch character & orgs.
2. Check deny lists, then allow lists.
3. Upsert character; create account if needed; set primary if first.
4. Reject with 403 if org not allowed.

### Multi-Character

- “Link another character” flow repeats SSO and links to same account.
- Allow set/unlink primary with restrictions.

---

## 6) Authorization (Feature-Scoped RBAC)

- Roles per Feature: `user (10)`, `fc (20)`, `director (30)`, `admin (40)`.
- Director/Admin can read/update Feature settings.
- **SuperAdmin** bypasses all checks.

### PDP API

- `POST /v1/authorize` → returns `allow/deny`, reason, TTL hint.
- Actions: `feature.view`, `feature.create`, `feature.edit.any`, `feature.settings.read`, `feature.settings.update`, `feature.roles.manage`, `user.manage`, `user.block`.

---

## 7) API Surface (Fastify Routes)

### Route Registration Pattern

Routes are registered in `backend/api/src/server.ts` using the `buildServer` pattern:

```typescript
export const buildServer = ({
  // ... existing repositories
  accountRepository,
  authRepository,
  featureRepository,
  config,
  redis,
}: BuildServerOptions) => {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Register auth routes
  registerAuthRoutes(app, authRepository, accountRepository, config, redis);
  registerAdminRoutes(app, accountRepository, featureRepository);
  registerFeatureRoutes(app, featureRepository);

  return app;
};
```

---

### Auth Routes (`backend/api/src/routes/auth.ts`)

```typescript
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const registerAuthRoutes = (
  app: FastifyInstance,
  authRepository: AuthRepository,
  accountRepository: AccountRepository,
  config: ApiConfig,
  redis?: Redis,
) => {
  const appWithTypes = app.withTypeProvider<ZodTypeProvider>();

  // EVE SSO login initiation
  appWithTypes.get('/auth/login', {
    schema: {
      tags: ['Auth'],
      description: 'Initiate EVE Online SSO login flow',
      querystring: z.object({
        redirect_uri: z.string().url().optional(),
      }),
      response: {
        302: z.object({ location: z.string() }),
      },
    },
    handler: async (request, reply) => {
      const { redirect_uri } = request.query;
      const authUrl = await authService.initiateLogin(redirect_uri);
      return reply.redirect(302, authUrl);
    },
  });

  // OAuth callback
  appWithTypes.get('/auth/callback', {
    schema: {
      tags: ['Auth'],
      querystring: z.object({
        code: z.string(),
        state: z.string(),
      }),
    },
    handler: async (request, reply) => {
      const { code, state } = request.query;
      const session = await authService.handleCallback(code, state);

      // ⚠️ CRITICAL: Set HTTP-only secure cookie
      // See session-management-spec.md for complete implementation
      reply.setCookie('battlescope_session', session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });

      return reply.redirect(302, session.redirect_uri);
    },
  });

  // Get current user
  appWithTypes.get('/me', {
    preHandler: [authMiddleware],
    schema: {
      tags: ['Auth'],
      response: {
        200: z.object({
          id: z.string().uuid(),
          displayName: z.string(),
          email: z.string().email().nullable(),
          primaryCharacter: z.object({
            id: z.string().uuid(),
            eveCharacterId: z.string(),
            eveCharacterName: z.string(),
            portraitUrl: z.string(),
          }).nullable(),
          characters: z.array(z.object({
            id: z.string().uuid(),
            eveCharacterId: z.string(),
            eveCharacterName: z.string(),
            corpName: z.string(),
            allianceName: z.string().nullable(),
            portraitUrl: z.string(),
          })),
          roles: z.array(z.object({
            feature: z.string(),
            role: z.string(),
            rank: z.number(),
          })),
          isSuperAdmin: z.boolean(),
        }),
      },
    },
    handler: async (request, reply) => {
      const account = await accountRepository.getWithCharacters(request.account.id);
      return reply.send(account);
    },
  });

  // Logout
  appWithTypes.post('/auth/logout', {
    preHandler: [authMiddleware],
    schema: {
      tags: ['Auth'],
      response: {
        204: z.null(),
      },
    },
    handler: async (request, reply) => {
      await authService.logout(request.account.id);
      reply.clearCookie('battlescope_session');
      return reply.status(204).send();
    },
  });
};
```

---

### Admin Routes (`backend/api/src/routes/admin.ts`)

```typescript
export const registerAdminRoutes = (
  app: FastifyInstance,
  accountRepository: AccountRepository,
  featureRepository: FeatureRepository,
) => {
  const appWithTypes = app.withTypeProvider<ZodTypeProvider>();

  // List accounts
  appWithTypes.get('/admin/accounts', {
    preHandler: [authMiddleware, requireRole('admin')],
    schema: {
      tags: ['Admin'],
      querystring: z.object({
        query: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(20),
        offset: z.coerce.number().min(0).default(0),
      }),
      response: {
        200: z.object({
          accounts: z.array(AccountSchema),
          total: z.number(),
        }),
      },
    },
    handler: async (request, reply) => {
      const { query, limit, offset } = request.query;
      const result = await accountRepository.list({ query, limit, offset });
      return reply.send(result);
    },
  });

  // Block account
  appWithTypes.post('/admin/accounts/{id}/block', {
    preHandler: [authMiddleware, requireRole('admin')],
    schema: {
      tags: ['Admin'],
      params: z.object({ id: z.string().uuid() }),
      response: {
        204: z.null(),
      },
    },
    handler: async (request, reply) => {
      await accountRepository.block(request.params.id);
      await auditLog.record({
        actor: request.account.id,
        action: 'account.blocked',
        target_type: 'account',
        target_id: request.params.id,
      });
      return reply.status(204).send();
    },
  });

  // Assign feature roles
  appWithTypes.put('/admin/accounts/{id}/feature-roles', {
    preHandler: [authMiddleware, requireRole('admin')],
    schema: {
      tags: ['Admin'],
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        featureKey: z.string(),
        roleKey: z.enum(['user', 'fc', 'director', 'admin']),
      }),
      response: {
        204: z.null(),
      },
    },
    handler: async (request, reply) => {
      const { featureKey, roleKey } = request.body;
      await featureRepository.assignRole(
        request.params.id,
        featureKey,
        roleKey,
        request.account.id,
      );
      return reply.status(204).send();
    },
  });
};
```

---

### Feature Routes (`backend/api/src/routes/features.ts`)

```typescript
export const registerFeatureRoutes = (
  app: FastifyInstance,
  featureRepository: FeatureRepository,
) => {
  const appWithTypes = app.withTypeProvider<ZodTypeProvider>();

  // Get feature settings (Director+)
  appWithTypes.get('/features/{featureKey}/settings', {
    preHandler: [authMiddleware, requireFeatureRole('director')],
    schema: {
      tags: ['Features'],
      params: z.object({ featureKey: z.string() }),
      response: {
        200: z.record(z.string(), z.unknown()),
      },
    },
    handler: async (request, reply) => {
      const settings = await featureRepository.getSettings(request.params.featureKey);
      return reply.send(settings);
    },
  });

  // Update feature settings (Admin+)
  appWithTypes.put('/features/{featureKey}/settings', {
    preHandler: [authMiddleware, requireFeatureRole('admin')],
    schema: {
      tags: ['Features'],
      params: z.object({ featureKey: z.string() }),
      body: z.record(z.string(), z.unknown()),
      response: {
        204: z.null(),
      },
    },
    handler: async (request, reply) => {
      await featureRepository.updateSettings(
        request.params.featureKey,
        request.body,
        request.account.id,
      );
      return reply.status(204).send();
    },
  });
};
```

---

### Auth Middleware (`backend/api/src/middleware/auth.ts`)

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';

interface AuthenticatedRequest extends FastifyRequest {
  account: {
    id: string;
    isSuperAdmin: boolean;
    roles: Map<string, number>;  // featureKey -> rank
  };
}

export const authMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const token = request.cookies.battlescope_session;
  if (!token) {
    return reply.status(401).send({ message: 'Authentication required' });
  }

  const session = await sessionService.validate(token);
  if (!session) {
    return reply.status(401).send({ message: 'Invalid session' });
  }

  // Attach account to request
  (request as AuthenticatedRequest).account = {
    id: session.accountId,
    isSuperAdmin: session.isSuperAdmin,
    roles: session.roles,
  };
};

export const requireRole = (minRole: string) => {
  const minRank = ROLE_RANKS[minRole];

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;

    if (authReq.account.isSuperAdmin) {
      return; // SuperAdmin bypasses all checks
    }

    // Check if user has required rank in ANY feature
    const hasRole = Array.from(authReq.account.roles.values()).some(
      rank => rank >= minRank
    );

    if (!hasRole) {
      return reply.status(403).send({ message: 'Insufficient permissions' });
    }
  };
};

export const requireFeatureRole = (minRole: string) => {
  const minRank = ROLE_RANKS[minRole];

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    const featureKey = request.params.featureKey;

    if (authReq.account.isSuperAdmin) {
      return; // SuperAdmin bypasses all checks
    }

    const userRank = authReq.account.roles.get(featureKey) ?? 0;
    if (userRank < minRank) {
      return reply.status(403).send({ message: 'Insufficient permissions' });
    }
  };
};
```

---

## 8) Frontend & Admin UI (Highlights)

- Profile: primary + linked characters (portraits), token status, set primary, unlink.
- Admin Console: accounts table, block/unblock, assign roles; feature settings; org gate config (SuperAdmin); audit log.
- Directors: read-only; Admins: edit; SuperAdmin: global.

---

## 9) Security & Operations

### Security Measures

**OAuth2/OIDC Implementation**:
- Use PKCE (Proof Key for Code Exchange) for all EVE SSO flows
- Validate `state` parameter to prevent CSRF attacks
- Validate `nonce` in ID tokens
- Verify JWT signatures using EVE's JWKS endpoint
- Store tokens encrypted at rest (use `crypto.subtle` or `node:crypto` with AES-256-GCM)

**Session Management**:
- HTTP-only, Secure, SameSite cookies for session tokens
- Short-lived JWT tokens (15 minutes) with long-lived refresh tokens (30 days)
- Store session state in Redis with automatic expiration
- Rotate refresh tokens after use (if EVE SSO supports it)

**API Security**:
- Rate limiting via Fastify plugins (`@fastify/rate-limit`)
- Request size limits (body parser limits)
- Helmet headers for XSS/clickjacking protection
- CORS configured via `@fastify/cors` (existing pattern)
- Input validation via Zod schemas (all endpoints)
- SQL injection protection via Kysely parameterized queries

**Encryption**:
- ESI tokens encrypted at rest using environment variable key
- Secrets managed via Kubernetes Secrets (existing pattern)
- TLS termination at ingress (cert-manager + Let's Encrypt)

---

### Operational Patterns

**Observability** (existing BattleScope setup):
- **Logging**: Pino structured JSON logs to stdout → Loki
- **Tracing**: OpenTelemetry instrumentation for Fastify, Kysely, Redis
- **Metrics**: OpenTelemetry metrics → Prometheus (auth latency, session count, failed logins)
- **Dashboards**: Grafana dashboards for auth metrics, authorization cache hit rates

**Caching Strategy**:
- **Authorization cache**: Redis with 60-120s TTL (key: `battlescope:authz:{accountId}`)
- **Session cache**: Redis with 30-day TTL (key: `battlescope:session:{token}`)
- **ESI token cache**: Redis (reuse existing ESI cache patterns)
- **Org gating cache**: Redis with 1-hour TTL for `auth_config` table

**Performance**:
- Authorization checks cached after first query (low latency for subsequent requests)
- Bulk role loading on session creation (single query)
- Redis pipelining for multi-key operations
- Database connection pooling (existing Kysely pool config)

**Reliability**:
- Fail-closed for protected endpoints (deny access if cache/DB unavailable)
- Circuit breaker for ESI API calls (existing pattern)
- Graceful degradation: allow SuperAdmin access even if role cache fails
- Health checks include session validation (`/healthz` endpoint)

**Audit & Compliance**:
- All authentication events logged to `audit_logs` table
- All authorization decisions (allow/deny) logged with context
- User management actions (block, role assignment) audited
- GDPR compliance: support data export and account deletion
- Audit log retention: 90 days (configurable)

**Deployment** (existing BattleScope patterns):
- Kubernetes Deployments with rolling updates
- ConfigMaps for non-sensitive configuration
- Secrets for ESI client credentials, encryption keys
- Horizontal Pod Autoscaling (HPA) based on CPU/memory
- PostgreSQL backups via managed service snapshots
- Redis persistence (AOF + RDB) for session recovery

**Monitoring & Alerts**:
- Alert on high failed login rate (potential brute force)
- Alert on authorization cache miss rate > 50% (performance degradation)
- Alert on ESI token refresh failures
- Dashboard showing: active sessions, logins/hour, role distribution

---

## 10) Seeds

### Auth Config
```json
{
  "require_membership": true,
  "allowed_corp_ids": [98000001, 98000002],
  "allowed_alliance_ids": [99000001],
  "denied_corp_ids": [],
  "denied_alliance_ids": [99009999]
}
```

### Features
```json
[
  { "key": "battle-reports", "name": "Battle Reports" },
  { "key": "battle-intel",   "name": "Battle Intel"   }
]
```

---

## 11) Authorization Policy Implementation

### Authorization Service (`backend/api/src/services/authorization.ts`)

```typescript
import type { Redis } from 'ioredis';
import type { AccountRepository } from './repositories/account-repository.js';

const ROLE_RANKS = {
  user: 10,
  fc: 20,
  director: 30,
  admin: 40,
} as const;

interface AuthorizationContext {
  accountId: string;
  isSuperAdmin: boolean;
  featureKey?: string;
  action: string;
}

interface AuthorizationResult {
  allowed: boolean;
  reason: string;
}

export class AuthorizationService {
  constructor(
    private accountRepository: AccountRepository,
    private redis?: Redis,
  ) {}

  async authorize(ctx: AuthorizationContext): Promise<AuthorizationResult> {
    // SuperAdmin bypasses all checks
    if (ctx.isSuperAdmin) {
      return { allowed: true, reason: 'superadmin' };
    }

    // Try cache first
    const cached = await this.getCached(ctx.accountId);
    const roles = cached ?? await this.loadRoles(ctx.accountId);

    // Get role rank for the feature (if feature-scoped action)
    const rank = ctx.featureKey ? (roles.get(ctx.featureKey) ?? 0) : 0;

    // Global actions (not feature-scoped)
    if (ctx.action === 'user.manage' || ctx.action === 'user.block') {
      // Requires admin role in ANY feature
      const maxRank = Math.max(...roles.values(), 0);
      if (maxRank >= ROLE_RANKS.admin) {
        return { allowed: true, reason: 'role.admin' };
      }
      return { allowed: false, reason: 'insufficient_permissions' };
    }

    // Feature-scoped actions
    switch (ctx.action) {
      case 'feature.view':
        return rank >= ROLE_RANKS.user
          ? { allowed: true, reason: 'role.user' }
          : { allowed: false, reason: 'insufficient_permissions' };

      case 'feature.create':
        return rank >= ROLE_RANKS.fc
          ? { allowed: true, reason: 'role.fc' }
          : { allowed: false, reason: 'insufficient_permissions' };

      case 'feature.edit.any':
        return rank >= ROLE_RANKS.director
          ? { allowed: true, reason: 'role.director' }
          : { allowed: false, reason: 'insufficient_permissions' };

      case 'feature.settings.read':
      case 'feature.settings.update':
        return rank >= ROLE_RANKS.director
          ? { allowed: true, reason: 'role.director' }
          : { allowed: false, reason: 'insufficient_permissions' };

      case 'feature.roles.manage':
        return rank >= ROLE_RANKS.admin
          ? { allowed: true, reason: 'role.admin' }
          : { allowed: false, reason: 'insufficient_permissions' };

      default:
        return { allowed: false, reason: 'unknown_action' };
    }
  }

  private async loadRoles(accountId: string): Promise<Map<string, number>> {
    const roles = await this.accountRepository.getRoles(accountId);
    const roleMap = new Map<string, number>();

    for (const { featureKey, roleRank } of roles) {
      roleMap.set(featureKey, roleRank);
    }

    // Cache for 60 seconds
    if (this.redis) {
      await this.redis.setex(
        `battlescope:authz:${accountId}`,
        60,
        JSON.stringify(Array.from(roleMap.entries())),
      );
    }

    return roleMap;
  }

  private async getCached(accountId: string): Promise<Map<string, number> | null> {
    if (!this.redis) return null;

    const cached = await this.redis.get(`battlescope:authz:${accountId}`);
    if (!cached) return null;

    const entries = JSON.parse(cached) as [string, number][];
    return new Map(entries);
  }

  async invalidateCache(accountId: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(`battlescope:authz:${accountId}`);
    }
  }
}
```

---

### Usage in Middleware

```typescript
// backend/api/src/middleware/auth.ts

export const requireAction = (action: string, featureKey?: string) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;

    const result = await authorizationService.authorize({
      accountId: authReq.account.id,
      isSuperAdmin: authReq.account.isSuperAdmin,
      featureKey: featureKey ?? request.params.featureKey,
      action,
    });

    if (!result.allowed) {
      app.log.warn({
        accountId: authReq.account.id,
        action,
        featureKey,
        reason: result.reason,
      }, 'Authorization denied');

      return reply.status(403).send({
        message: 'Insufficient permissions',
        reason: result.reason,
      });
    }
  };
};
```

---

### Example Route Protection

```typescript
// Protect a route with specific action requirement
appWithTypes.delete('/battles/{id}', {
  preHandler: [
    authMiddleware,
    requireAction('feature.edit.any', 'battle-reports'),
  ],
  handler: async (request, reply) => {
    // Handler only executes if authorized
  },
});

// Dynamic feature-scoped protection
appWithTypes.put('/features/{featureKey}/settings', {
  preHandler: [
    authMiddleware,
    requireAction('feature.settings.update'), // featureKey from params
  ],
  handler: async (request, reply) => {
    // Handler only executes if authorized
  },
});
```

---

## 12) ESI Integration

BattleScope already has an ESI client (`backend/api/src/services/esi-client.ts`) that handles:
- Caching in Redis
- Rate limiting
- Error handling and retries
- OpenTelemetry tracing

**Reuse for Auth**:
The auth implementation should use the existing ESI client for:

```typescript
// Verify character ownership via EVE SSO
const character = await esiClient.getCharacter(eveCharacterId);

// Get corporation details for org gating
const corp = await esiClient.getCorporation(corpId);

// Get alliance details (if applicable)
const alliance = await esiClient.getAlliance(allianceId);

// Get character portrait
const portrait = `https://images.evetech.net/characters/${eveCharacterId}/portrait?size=128`;
```

**Token Management**:
- Store ESI access/refresh tokens encrypted in `characters` table
- Use existing ESI client refresh token mechanism
- Share Redis cache namespace: `battlescope:esi:*`

---

## 13) Implementation Phases

**⚠️ CRITICAL: See [Session Management Spec](./session-management-spec.md) for required session cookie, token storage, and refresh implementation details.**

### Phase 1: Database & Core Auth (MVP)
- [ ] Create database migrations for auth tables
- [ ] Implement `AccountRepository` and `CharactersRepository` with Kysely
- [ ] Build EVE SSO OAuth flow (`/auth/login`, `/auth/callback`)
- [ ] **Implement session management with Redis** ⚠️ See session-management-spec.md
- [ ] **Set session cookies after OAuth callback** ⚠️ Critical missing piece
- [ ] **Implement token encryption/decryption** ⚠️ Required for ESI token storage
- [ ] **Store encrypted OAuth tokens in characters table** ⚠️ Required for multi-character
- [ ] Create `authMiddleware` for session validation
- [ ] Add `GET /me` endpoint
- [ ] Implement org gating logic (allow/deny lists)

### Phase 2: Authorization & Admin
- [ ] Implement `AuthorizationService` with role-based checks
- [ ] Create `requireAction` middleware
- [ ] Add admin routes for user management
- [ ] Build feature role assignment endpoints
- [ ] Implement audit logging
- [ ] Add authorization cache with Redis

### Phase 3: Multi-Character & Settings
- [ ] Add character linking flow (`/me/characters/link/start`)
- [ ] Implement primary character selection
- [ ] Add feature settings management
- [ ] Build admin UI for org gate configuration

### Phase 4: Frontend Integration
- [ ] Add auth routes to frontend (login redirect)
- [ ] Implement session cookie handling
- [ ] Build user profile page (characters, roles)
- [ ] Add admin console for user/role management
- [ ] Show "login required" indicators on protected features

---

## 14) Migration Path

**Backward Compatibility**:
- Existing unauthenticated endpoints remain accessible initially
- Add `authMiddleware` selectively to new/sensitive endpoints
- Frontend can detect auth availability via `GET /me` (returns 401 if not logged in)
- Phase in required auth by feature over multiple releases

**Rollout Strategy**:
1. **Release 1**: Auth system available, all features still public (no breaking changes)
2. **Release 2**: Battle Reports require "user" role minimum (soft gate)
3. **Release 3**: Admin features require "admin" role (hard gate)
4. **Release 4**: Full RBAC enforcement across all features

---

## 15) What's Included in this Spec

This specification document provides:
- ✅ BattleScope-integrated architecture (Fastify, Kysely, Redis, Kubernetes)
- ✅ Database schema with Kysely types and Zod validation
- ✅ Complete API implementation patterns with working code examples
- ✅ Authorization policy engine with caching
- ✅ Security and operational patterns aligned with existing BattleScope setup
- ✅ Integration with existing ESI client
- ✅ Implementation phases and migration path

**Next Steps**:
1. Review this spec with the team
2. Create database migration files in `backend/database/migrations/`
3. Implement repositories in `backend/database/src/repositories/`
4. Build auth routes in `backend/api/src/routes/auth.ts`
5. Create authorization service in `backend/api/src/services/authorization.ts`
6. Add middleware in `backend/api/src/middleware/auth.ts`
7. Write tests following existing BattleScope test patterns
