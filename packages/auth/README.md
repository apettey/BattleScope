# @battlescope/auth

Authentication and authorization package for BattleScope.

## Features

- **EVE Online SSO**: OAuth2/OIDC authentication with PKCE
- **Session Management**: Redis-backed session storage with TTL
- **Feature-Scoped RBAC**: Role-based access control per feature
- **Token Encryption**: AES-256-GCM encryption for ESI tokens
- **Authorization Caching**: Redis-cached authorization decisions
- **Fastify Middleware**: Ready-to-use authentication and authorization middleware

## Services

### EVESSOService

Handles EVE Online SSO OAuth2 flow with PKCE.

```typescript
import { createEVESSOService } from '@battlescope/auth';

const eveSSOService = createEVESSOService(
  {
    clientId: process.env.EVE_CLIENT_ID,
    clientSecret: process.env.EVE_CLIENT_SECRET,
    callbackUrl: 'https://example.com/auth/callback',
    scopes: ['publicData'],
  },
  esiClient,
);

// Generate authorization URL
const { url, state } = eveSSOService.generateAuthorizationUrl('/dashboard');

// Exchange code for token
const result = await eveSSOService.exchangeCodeForToken(code, state);
```

### SessionService

Manages user sessions in Redis.

```typescript
import { createSessionService } from '@battlescope/auth';

const sessionService = createSessionService(redis, {
  sessionTtl: 30 * 24 * 60 * 60, // 30 days
  cookieName: 'battlescope_session',
});

// Create session
const token = await sessionService.createSession({
  accountId: 'uuid',
  isSuperAdmin: false,
  roles: new Map([['battle-reports', 20]]),
});

// Validate session
const session = await sessionService.validateSession(token);
```

### AuthorizationService

Implements feature-scoped RBAC policy engine.

```typescript
import { createAuthorizationService, AUTH_ACTIONS } from '@battlescope/auth';

const authzService = createAuthorizationService(redis, {
  cacheTtl: 60, // 60 seconds
});

// Check authorization
const decision = await authzService.authorize(
  {
    subject: { accountId: 'uuid', superAdmin: false },
    action: AUTH_ACTIONS.featureView,
    resource: { featureKey: 'battle-reports' },
  },
  roles,
);
```

### EncryptionService

Encrypts/decrypts ESI tokens at rest.

```typescript
import { createEncryptionService } from '@battlescope/auth';

const encryptionService = createEncryptionService(process.env.ENCRYPTION_KEY);

// Encrypt token
const encrypted = encryptionService.encrypt(accessToken);

// Decrypt token
const decrypted = encryptionService.decrypt(encrypted);
```

## Middleware

### Auth Middleware

Validates session and attaches account to request.

```typescript
import { createAuthMiddleware } from '@battlescope/auth';

const authMiddleware = createAuthMiddleware(sessionService);

app.get(
  '/protected',
  {
    preHandler: [authMiddleware],
  },
  async (request, reply) => {
    // request.account is available
    return { accountId: request.account.id };
  },
);
```

### Role-Based Middleware

Requires minimum role across any feature.

```typescript
import { createRequireRoleMiddleware } from '@battlescope/auth';

const requireAdmin = createRequireRoleMiddleware('admin');

app.post(
  '/admin/users',
  {
    preHandler: [authMiddleware, requireAdmin],
  },
  async (request, reply) => {
    // Only admins can access
  },
);
```

### Feature-Scoped Role Middleware

Requires minimum role in specific feature.

```typescript
import { createRequireFeatureRoleMiddleware } from '@battlescope/auth';

const requireDirector = createRequireFeatureRoleMiddleware('director');

app.put(
  '/features/:featureKey/settings',
  {
    preHandler: [authMiddleware, requireDirector],
  },
  async (request, reply) => {
    // Only directors of the feature can access
  },
);
```

### Action-Based Middleware

Requires specific action authorization.

```typescript
import { createRequireActionMiddleware, AUTH_ACTIONS } from '@battlescope/auth';

const requireFeatureView = createRequireActionMiddleware(
  AUTH_ACTIONS.featureView,
  authzService,
);

app.get(
  '/features/:featureKey/data',
  {
    preHandler: [authMiddleware, requireFeatureView],
  },
  async (request, reply) => {
    // Authorization check performed
  },
);
```

## Role Hierarchy

| Role     | Rank | Permissions                                  |
| -------- | ---- | -------------------------------------------- |
| User     | 10   | View feature content                         |
| FC       | 20   | Create feature content                       |
| Director | 30   | Edit any content, view/update settings       |
| Admin    | 40   | Manage roles, full feature control           |
| SuperAdmin | ∞  | Global admin, bypasses all checks            |

## Actions

### Feature-Scoped Actions

- `feature.view` - View feature content (User+)
- `feature.create` - Create feature content (FC+)
- `feature.edit.any` - Edit any feature content (Director+)
- `feature.settings.read` - Read feature settings (Director+)
- `feature.settings.update` - Update feature settings (Admin+)
- `feature.roles.manage` - Manage feature roles (Admin+)

### Global Actions

- `user.manage` - Manage users (Admin+)
- `user.block` - Block users (Admin+)
- `auth.config.update` - Update auth config (SuperAdmin only)

## Testing

```bash
pnpm test
```

## License

Private - BattleScope Internal
