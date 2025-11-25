# Local Development Setup - Authentication Service

## Prerequisites

1. **Kubernetes cluster** running with:
   - PostgreSQL service on port 5432
   - Redis service on port 6379

2. **Port Forwarding** - Run these commands in separate terminals:
   ```bash
   # PostgreSQL
   kubectl port-forward -n battlescope svc/postgres 5432:5432

   # Redis
   kubectl port-forward -n battlescope svc/redis 6379:6379
   ```

## Environment Variables

The authentication service requires these environment variables (configured in `.env.local`):

```bash
# EVE Online ESI Configuration (Localhost Testing App)
EVE_CLIENT_ID=54916eadca8f4a0e98d80f91caaef37a
EVE_CLIENT_SECRET=eat_7cY0AwrEcEqKSoL9yCgnSIZ3ctHl6XGN_1YccPW
EVE_CALLBACK_URL=http://localhost:3007/auth/callback

# Frontend URL for redirects
FRONTEND_URL=http://localhost:3000

# Database Configuration
# Note: The @battlescope/database package uses DB_* prefix
DB_HOST=localhost
DB_PORT=5432
DB_NAME=battlescope_auth
DB_USER=battlescope
DB_PASSWORD=battlescope

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Session Configuration
SESSION_COOKIE_NAME=battlescope_session
SESSION_TTL_SECONDS=28800
COOKIE_SECURE=false

# Encryption
ENCRYPTION_KEY=d8f5fea920e636a11ab4e75828aaa35cb66b2ee00041a83fcc53a326c5017a68

# Server Configuration
PORT=3007
SKIP_MIGRATIONS=true
```

## Running Locally

**Important**: tsx doesn't load `.env.local` files automatically, so you must pass environment variables inline:

```bash
cd /Users/andrew/Projects/battle-monitor/services/authentication

SKIP_MIGRATIONS=true \
EVE_CLIENT_ID=54916eadca8f4a0e98d80f91caaef37a \
EVE_CLIENT_SECRET=eat_7cY0AwrEcEqKSoL9yCgnSIZ3ctHl6XGN_1YccPW \
EVE_CALLBACK_URL=http://localhost:3007/auth/callback \
FRONTEND_URL=http://localhost:3000 \
DB_HOST=localhost \
DB_PORT=5432 \
DB_NAME=battlescope_auth \
DB_USER=battlescope \
DB_PASSWORD=battlescope \
REDIS_HOST=localhost \
REDIS_PORT=6379 \
SESSION_COOKIE_NAME=battlescope_session \
ENCRYPTION_KEY=d8f5fea920e636a11ab4e75828aaa35cb66b2ee00041a83fcc53a326c5017a68 \
COOKIE_SECURE=false \
PORT=3007 \
pnpm dev
```

## Key Configuration Notes

1. **Database Name**: The Kubernetes PostgreSQL instance has a database named `battlescope_auth`, not `battlescope`

2. **Environment Variable Naming**: The `@battlescope/database` package expects:
   - `DB_HOST` (not `POSTGRES_HOST`)
   - `DB_PORT` (not `POSTGRES_PORT`)
   - `DB_NAME` (not `POSTGRES_DB`)
   - `DB_USER` (not `POSTGRES_USER`)
   - `DB_PASSWORD` (not `POSTGRES_PASSWORD`)

3. **Encryption Key**: Must be a 64-character hex string (32 bytes). Generate with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. **EVE SSO Credentials**: The localhost-specific ESI app has the callback URL configured as `http://localhost:3007/auth/callback`

## Full Stack Local Development

To run the complete stack locally:

1. **Start port-forwards** (in separate terminals):
   ```bash
   kubectl port-forward -n battlescope svc/postgres 5432:5432
   kubectl port-forward -n battlescope svc/redis 6379:6379
   ```

2. **Start Authentication Service** (port 3007):
   ```bash
   cd services/authentication
   # Use the environment variables command above
   ```

3. **Start BFF Service** (port 3006):
   ```bash
   cd services/bff
   AUTH_SERVICE_URL=http://localhost:3007 PORT=3006 pnpm dev
   ```

4. **Start Frontend** (port 3000):
   ```bash
   cd frontend
   pnpm dev
   ```

## Testing Authentication Flow

1. Visit `http://localhost:3000`
2. Click "Login with EVE Online"
3. Authenticate with EVE SSO
4. You should be redirected back and logged in
5. The frontend will call `/api/auth/me` through the BFF to verify authentication

## Testing Character Linking

1. Log in with your first character
2. Navigate to the Characters page
3. Click "Link Character"
4. Authenticate with a different EVE character
5. The second character should be added to your existing account (not create a new account)
6. Both characters should appear under the same account

## Troubleshooting

### Database connection errors
- Ensure PostgreSQL port-forward is running
- Verify the database name is `battlescope_auth`
- Check that environment variables use `DB_*` prefix

### Redis connection errors
- Ensure Redis port-forward is running
- Check that `REDIS_HOST=localhost` and `REDIS_PORT=6379`

### OAuth callback errors
- Verify `EVE_CALLBACK_URL=http://localhost:3007/auth/callback`
- Ensure `ENCRYPTION_KEY` is set
- Check that the EVE SSO credentials are correct

### Session not persisting
- Verify Redis is running and accessible
- Check that `SESSION_COOKIE_NAME=battlescope_session`
- Ensure cookies are being set (check browser dev tools)

### Character linking creating second account
- This was a bug that has been fixed in `services/authentication/src/routes/auth.ts`
- The OAuth callback handler now checks for `stateData.linking` and `stateData.accountId`
- If both exist, it links the character to the existing account instead of creating a new one
