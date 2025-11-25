# BattleScope V3 Rebuild Progress

## Status: IN PROGRESS

**Last Updated**: 2025-11-25

## Completed Tasks

### Phase 1: Shared Packages ✅

All shared packages have been created and are building successfully:

- **@battlescope/database** - Database utilities with Kysely and migration runner
- **@battlescope/logger** - Pino-based logging configuration
- **@battlescope/types** - Shared TypeScript types for all services
- **@battlescope/events** - Kafka/Redpanda client and event schemas with Zod validation

All packages installed and compiled successfully with pnpm workspace.

### Phase 2: Authentication Service (IN PROGRESS)

**Status**: Core infrastructure complete, routes in progress

#### Completed Components:

1. **Database Layer**:
   - ✅ Migration `001_init.sql` with full auth schema
   - ✅ Kysely types for all tables
   - ✅ Database client with connection pooling
   - ✅ Migration CLI script

2. **Security Layer**:
   - ✅ Token encryption/decryption (AES-256-GCM)
   - ✅ Redis session management
   - ✅ Session generation and validation

3. **ESI Integration**:
   - ✅ OAuth2 authorization flow
   - ✅ Token exchange and refresh
   - ✅ Character, corp, and alliance info retrieval
   - ✅ Access token verification

4. **Routes**:
   - ✅ `/auth/login` - EVE SSO initiation
   - ✅ `/auth/callback` - OAuth callback with full character/account creation
   - ✅ `/auth/logout` - Session cleanup

#### Remaining Components:

1. **Protected Routes**:
   - `/me` - Get current user + characters
   - `/me/characters` - List all characters
   - `/me/characters/link` - Link additional character
   - `/me/characters/primary` - Set primary character
   - `/me/characters/:id` - Delete character
   - `/me/roles` - Get user roles
   - `/me/permissions` - Get user permissions
   - `/authorize` - Check permissions

2. **Admin Routes**:
   - `/admin/accounts` - List/manage accounts
   - `/admin/accounts/:id` - Get/update/delete account
   - `/admin/roles/grant` - Grant roles
   - `/admin/roles/:id` - Revoke roles
   - `/admin/config` - Get/update auth config
   - `/admin/audit` - Get audit logs

3. **Middleware**:
   - Session authentication middleware
   - RBAC permission checking middleware
   - Audit logging middleware

4. **Server Setup**:
   - Fastify app configuration
   - CORS setup
   - Cookie setup
   - Health check endpoint
   - Main index.ts with migration runner

5. **Dockerfile**:
   - Multi-stage build
   - Include migrations directory
   - Proper environment configuration

6. **Kubernetes Deployment**:
   - Deployment with init container for migrations
   - Service definition
   - ConfigMap for environment variables
   - Secret for sensitive data

## Next Steps

### Immediate (Authentication Service)

1. Create protected routes for `/me` endpoints
2. Create admin routes
3. Create authentication middleware
4. Create RBAC middleware
5. Create audit logging utilities
6. Create main server.ts and index.ts
7. Create Dockerfile
8. Create Kubernetes manifests
9. Test locally with database
10. Deploy to K8s cluster

### After Authentication

1. Create `battlescope_auth` database in PostgreSQL
2. Run migrations
3. Test full OAuth flow
4. Proceed with remaining services in order:
   - Ingestion
   - Enrichment
   - Battle/Clusterer
   - Search (with Typesense indexes)
   - Notification
   - BFF
5. Build frontend with all 8 modules
6. Complete integration testing

## Environment Variables Required

### Authentication Service

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
SESSION_TTL_SECONDS=28800
SESSION_COOKIE_NAME=battlescope_session
SESSION_COOKIE_SECURE=false

# Token Encryption
ENCRYPTION_KEY=<generate-32-byte-hex>

# Frontend
FRONTEND_URL=http://10.0.1.5:30000

# CORS
CORS_ORIGIN=http://10.0.1.5:30000
```

## Files Created

### Packages

- `packages/database/` (3 files)
- `packages/logger/` (2 files)
- `packages/types/` (2 files)
- `packages/events/` (3 files)

### Authentication Service

- `services/authentication/migrations/001_init.sql`
- `services/authentication/package.json`
- `services/authentication/tsconfig.json`
- `services/authentication/src/database/types.ts`
- `services/authentication/src/database/client.ts`
- `services/authentication/src/database/migrate-cli.ts`
- `services/authentication/src/lib/crypto.ts`
- `services/authentication/src/lib/session.ts`
- `services/authentication/src/lib/esi.ts`
- `services/authentication/src/routes/auth.ts`

## Architecture Notes

- Using pnpm workspaces for monorepo management
- All packages use TypeScript with strict mode
- Database migrations follow idempotent SQL patterns
- ESI tokens encrypted at rest with AES-256-GCM
- Single session per user policy enforced
- Corp/Alliance gating implemented in OAuth callback
- RBAC system with feature-scoped roles ready for implementation
