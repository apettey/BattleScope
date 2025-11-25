# Authentication Service

EVE Online SSO authentication service with multi-character support and feature-scoped RBAC.

## Features

- EVE SSO OAuth2/OIDC authentication
- Multi-character support per account
- Primary character selection
- Encrypted ESI token storage (AES-256-GCM)
- Redis-based session management
- Single session per user policy
- Corp/Alliance membership gating
- Feature-scoped RBAC system
- Automatic ESI token refresh
- Audit logging

## Tech Stack

- **Runtime**: Node.js 22
- **Framework**: Fastify
- **Database**: PostgreSQL (dedicated `battlescope_auth` database)
- **Cache**: Redis
- **ORM**: Kysely
- **Testing**: Vitest with 80% coverage requirement

## API Endpoints

### Public Endpoints

- `GET /health` - Health check
- `GET /auth/login` - Initiate EVE SSO login
- `GET /auth/callback` - OAuth callback handler
- `POST /auth/logout` - Logout and clear session

### Protected Endpoints (Requires Session)

- `GET /me` - Get current user with all characters
- `GET /me/characters` - List all characters
- `POST /me/characters/primary` - Set primary character
- `DELETE /me/characters/:id` - Unlink character
- `GET /me/roles` - Get user roles across features
- `GET /me/permissions` - Get user permissions

## Environment Variables

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
EVE_CLIENT_ID=<your-client-id>
EVE_CLIENT_SECRET=<your-client-secret>
EVE_CALLBACK_URL=http://10.0.1.5:30000/auth/callback
EVE_SCOPES=publicData

# Session
SESSION_TTL_SECONDS=28800
SESSION_COOKIE_NAME=battlescope_session
SESSION_COOKIE_SECURE=false
SESSION_SECRET=<generate-random>

# Token Encryption
ENCRYPTION_KEY=<generate-32-byte-hex>

# Frontend
FRONTEND_URL=http://10.0.1.5:30000

# CORS
CORS_ORIGIN=http://10.0.1.5:30000
```

## Development

```bash
# Install dependencies
pnpm install

# Run migrations
pnpm migrate

# Start in development mode
pnpm dev

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Build for production
pnpm build

# Start production server
pnpm start
```

## Database Migrations

Migrations are stored in `migrations/` and run automatically on service startup.

### Creating a New Migration

1. Create a new SQL file: `migrations/00X_description.sql`
2. Use idempotent SQL (`IF NOT EXISTS`, `CREATE OR REPLACE`)
3. Restart the service to apply

Example migration:
```sql
-- Migration: 002_add_feature
-- Description: Add new feature
-- Created: 2025-11-25

CREATE TABLE IF NOT EXISTS new_table (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL
);
```

## Docker

```bash
# Build image
docker build -t petdog/battlescope-authentication:latest -f services/authentication/Dockerfile .

# Run container
docker run -p 3007:3007 \
  -e DB_HOST=postgres \
  -e REDIS_HOST=redis \
  -e EVE_CLIENT_ID=<id> \
  -e EVE_CLIENT_SECRET=<secret> \
  -e ENCRYPTION_KEY=<key> \
  petdog/battlescope-authentication:latest
```

## Kubernetes Deployment

The service uses an init container to run migrations before the main container starts.

```yaml
initContainers:
  - name: migrate
    image: petdog/battlescope-authentication:v1.0.0
    command: ['node', 'dist/index.js']
    # Runs migrations then exits
```

Deploy:
```bash
kubectl apply -f infra/k8s/services/authentication-deployment.yaml
```

## Testing

Tests are written using Vitest and require 80% code coverage.

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

### Test Coverage Requirements

- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

## Architecture

### Database Schema

- `accounts` - User accounts
- `characters` - EVE characters with encrypted ESI tokens
- `features` - Feature areas (battle-reports, battle-intel)
- `roles` - Role definitions (user, fc, director, admin)
- `account_feature_roles` - Role assignments per feature
- `feature_settings` - Feature configuration
- `auth_config` - Corp/Alliance allow/deny lists
- `audit_logs` - Audit trail

### Security

- **Token Encryption**: ESI tokens encrypted at rest using AES-256-GCM with PBKDF2 key derivation
- **Session Management**: HTTP-only, secure cookies with Redis backing
- **Single Session Policy**: Only one active session per user
- **RBAC**: Feature-scoped role-based access control
- **Audit Logging**: All authentication and authorization actions logged

## License

Proprietary
