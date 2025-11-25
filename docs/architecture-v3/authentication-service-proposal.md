# Authentication Service Proposal

## Overview

A dedicated microservice for handling EVE Online SSO authentication, session management, character management, and authorization for the BattleScope platform.

## Architecture

### Service Details
- **Name**: `authentication-service`
- **Port**: 3007
- **Technology**: Node.js + Fastify + TypeScript
- **Database**: PostgreSQL (dedicated database: `battlescope_auth`)
- **Cache**: Redis (for sessions)
- **Image**: `petdog/battlescope-authentication:v3.0.0`

### Responsibilities

1. **EVE SSO OAuth Flow**
   - Initiate login with EVE Online SSO
   - Handle OAuth callbacks
   - Exchange authorization codes for tokens
   - Validate EVE character via ESI

2. **Session Management**
   - Create and manage user sessions
   - Store sessions in Redis with TTL
   - Enforce single-session-per-user policy
   - Session validation and refresh

3. **Character Management**
   - Store multiple EVE characters per account
   - Track primary character
   - Store and encrypt ESI access/refresh tokens
   - Automatic token refresh
   - Character verification via ESI

4. **Account Management**
   - Create accounts on first login
   - Link multiple characters to accounts
   - Corp/Alliance membership validation
   - Account blocking/deletion

5. **Authorization (RBAC)**
   - Feature-scoped role-based access control
   - Roles: User, FC, Director, Admin, SuperAdmin
   - Permission checking endpoints
   - Audit logging

## Database Schema

### Dedicated PostgreSQL Database: `battlescope_auth`

Tables:
- `accounts` - User accounts
- `characters` - EVE characters with encrypted ESI tokens
- `features` - Feature areas (battle-reports, battle-intel, etc.)
- `roles` - Role definitions with ranks
- `account_feature_roles` - Role assignments per feature
- `feature_settings` - Feature configuration
- `auth_config` - Corp/Alliance allow/deny lists
- `audit_logs` - Audit trail

## API Endpoints

### Public Endpoints (No Auth Required)

```
GET  /health                    - Health check
GET  /auth/login                - Initiate EVE SSO login
GET  /auth/callback             - OAuth callback handler
POST /auth/logout               - Logout and clear session
```

### Protected Endpoints (Session Required)

```
GET  /me                        - Get current user + characters
GET  /me/characters             - List all characters
POST /me/characters/link        - Link new character (initiates OAuth)
POST /me/characters/primary     - Set primary character
DELETE /me/characters/:id       - Unlink character

GET  /me/roles                  - Get user roles across features
GET  /me/permissions            - Get user permissions

POST /authorize                 - Check if user can perform action
```

### Admin Endpoints (Admin/SuperAdmin Only)

```
GET    /admin/accounts          - List accounts
GET    /admin/accounts/:id      - Get account details
PUT    /admin/accounts/:id      - Update account (block, etc.)
DELETE /admin/accounts/:id      - Soft delete account

GET    /admin/roles             - List roles
POST   /admin/roles/grant       - Grant role to account
DELETE /admin/roles/:id          - Revoke role

GET    /admin/config            - Get auth config
PUT    /admin/config            - Update corp/alliance lists

GET    /admin/audit             - Get audit logs
```

## Configuration

### Environment Variables

```bash
# Service
PORT=3007
NODE_ENV=production
LOG_LEVEL=info

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=battlescope_auth
DB_USER=battlescope
DB_PASSWORD=<secret>

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# EVE SSO OAuth
EVE_CLIENT_ID=b6a3764eb7044abba312b76ca8c7c88c
EVE_CLIENT_SECRET=eat_2HkUBZFd5CVll5v7KBYBoz73TfBIGqyNh_4PQzoi
EVE_CALLBACK_URL=http://10.0.1.5:30000/auth/callback
EVE_SCOPES=publicData

# Session
SESSION_TTL_SECONDS=28800        # 8 hours
SESSION_COOKIE_NAME=battlescope_session
SESSION_COOKIE_SECURE=false      # true for HTTPS
SESSION_SECRET=<generate-random>

# Token Encryption
ENCRYPTION_KEY=<generate-32-byte-hex>

# CORS
CORS_ORIGIN=http://10.0.1.5:30000
```

## Dependencies

### Core
- `fastify` - Web framework
- `@fastify/cookie` - Cookie handling
- `@fastify/cors` - CORS support
- `fastify-type-provider-zod` - Schema validation

### Database
- `kysely` - SQL query builder
- `pg` - PostgreSQL driver

### Cache
- `ioredis` - Redis client

### EVE Online
- `axios` - HTTP client for ESI
- `jsonwebtoken` - JWT validation

### Crypto
- `crypto` (node built-in) - Token encryption

## Integration with Other Services

### BFF Service Integration

The BFF service will proxy authentication requests to the auth service:

```typescript
// In BFF service
app.get('/auth/login', async (request, reply) => {
  return reply.redirect(302, 'http://authentication-service:3007/auth/login');
});

app.get('/me', async (request, reply) => {
  const session = request.cookies.battlescope_session;
  const response = await axios.get('http://authentication-service:3007/me', {
    headers: { Cookie: `battlescope_session=${session}` }
  });
  return response.data;
});
```

### Frontend Integration

Frontend redirects to BFF for login, receives session cookie:

```typescript
// Login button
<button onClick={() => window.location.href = '/api/auth/login'}>
  Login with EVE Online
</button>

// After login, session cookie is automatically sent with requests
const user = await fetch('/api/me').then(r => r.json());
```

## Deployment

### Kubernetes Resources

```yaml
# Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: authentication
  namespace: battlescope
spec:
  replicas: 2
  selector:
    matchLabels:
      app: authentication
  template:
    metadata:
      labels:
        app: authentication
    spec:
      containers:
        - name: authentication
          image: petdog/battlescope-authentication:v3.0.0
          ports:
            - containerPort: 3007
          env:
            - name: DB_HOST
              value: "postgres"
            - name: REDIS_HOST
              value: "redis"
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi

---
# Service
apiVersion: v1
kind: Service
metadata:
  name: authentication-service
  namespace: battlescope
spec:
  selector:
    app: authentication
  ports:
    - port: 3007
      targetPort: 3007
```

## Security Considerations

1. **Token Encryption**: ESI tokens encrypted at rest using AES-256-GCM
2. **Session Security**: HTTP-only, secure cookies with SameSite protection
3. **Single Session**: Only one active session per user
4. **Token Refresh**: Automatic ESI token refresh before expiry
5. **Audit Logging**: All authentication and authorization actions logged
6. **Corp/Alliance Gating**: Configurable allow/deny lists
7. **Rate Limiting**: Protect OAuth endpoints from abuse

## Migration Strategy

1. Create `battlescope_auth` database
2. Run migration SQL to create tables
3. Deploy authentication service
4. Update BFF to proxy auth requests
5. Update frontend to use EVE SSO login
6. Test complete OAuth flow
7. Migrate any existing users (if applicable)

## Success Criteria

- ✅ Users can log in with EVE Online SSO
- ✅ Primary character is set on first login
- ✅ Users can link multiple alts to their account
- ✅ Sessions persist across page reloads
- ✅ ESI tokens automatically refresh
- ✅ Corp/Alliance gating works
- ✅ RBAC permissions enforced
- ✅ Audit logs capture all actions
- ✅ High availability with 2+ replicas

## Timeline

- **Database Setup**: 30 minutes
- **Core Auth Implementation**: 3-4 hours
- **Character Management**: 2 hours
- **RBAC System**: 2 hours
- **Testing & Deployment**: 1 hour
- **Total**: ~8-10 hours

## Questions for User

1. Should we implement corp/alliance gating from day 1, or add it later?
2. What should the default role be for new users? (User, FC, etc.)
3. Do you want email addresses to be optional or required?
4. Should we implement the full RBAC system now, or start simpler?
