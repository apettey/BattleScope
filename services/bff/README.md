# BattleScope BFF (Backend for Frontend)

The BFF service is a stateless proxy and aggregation layer that sits between the frontend application and backend microservices. It provides a unified API interface for the frontend and handles cross-service data aggregation.

## Purpose

- **API Aggregation**: Combines data from multiple backend services
- **Request Proxying**: Forwards requests to appropriate backend services
- **Response Caching**: Improves performance with intelligent caching
- **Error Handling**: Provides consistent error responses
- **Session Management**: Forwards authentication cookies to backend services

## Technology Stack

- **Fastify**: High-performance HTTP server
- **TypeScript**: Type-safe development
- **Axios**: HTTP client for backend requests
- **@battlescope/logger**: Structured logging
- **@battlescope/types**: Shared type definitions

## Architecture

```
Frontend (React) → BFF (Port 3006) → Backend Services
                                    ├── Auth (3007)
                                    ├── Battle (3003)
                                    ├── Ingestion (3001)
                                    ├── Search (3004)
                                    └── Notification (3005)
```

## API Endpoints

### Authentication (Proxy to Auth Service)
- `GET /api/me` - Get current user profile
- `GET /api/me/characters` - Get linked characters
- `POST /api/me/characters/link` - Link new character
- `POST /api/me/characters/primary` - Set primary character
- `DELETE /api/me/characters/:id` - Unlink character
- `GET /api/auth/login` - EVE SSO login
- `POST /api/auth/logout` - Logout

### Admin (Proxy to Auth Service)
- `GET /api/admin/accounts` - Get all accounts
- `PUT /api/admin/accounts/:id` - Update account
- `GET /api/admin/roles` - Get all roles
- `POST /api/admin/roles/grant` - Grant role
- `GET /api/admin/config` - Get system config
- `PUT /api/admin/config` - Update system config
- `GET /api/admin/audit` - Get audit logs

### Battles (Proxy to Battle Service)
- `GET /api/battles` - List battles (with pagination/filters)
- `GET /api/battles/:id` - Get battle details
- `GET /api/battles/:id/participants` - Get battle participants
- `GET /api/battles/:id/timeline` - Get battle timeline

### Intel (Proxy to Ingestion Service)
- `GET /api/intel/live` - Get live killmails
- `GET /api/intel/killmails/:id` - Get killmail details
- `GET /api/intel/characters/:characterId/ships` - Get character ship history

### Search (Proxy to Search Service)
- `GET /api/search` - Universal search

### Notifications (Proxy to Notification Service)
- `GET /api/notifications` - Get user notifications
- `POST /api/notifications/:id/read` - Mark as read
- `POST /api/notifications/read-all` - Mark all as read
- `DELETE /api/notifications/:id` - Delete notification

### Health & Stats (Aggregated)
- `GET /api/health` - Aggregate health check for all services
- `GET /health` - Simple BFF health check
- `GET /api/health/cache` - Cache statistics

## Configuration

Environment variables:

```bash
# Server
PORT=3006
HOST=0.0.0.0
NODE_ENV=development

# Backend Service URLs
AUTH_SERVICE_URL=http://authentication:3007
BATTLE_SERVICE_URL=http://battle:3003
INGESTION_SERVICE_URL=http://ingestion:3001
SEARCH_SERVICE_URL=http://search:3004
NOTIFICATION_SERVICE_URL=http://notification:3005

# CORS
CORS_ORIGIN=http://localhost:5173

# Cache
CACHE_ENABLED=true
CACHE_TTL=300

# Request timeout
REQUEST_TIMEOUT=30000
```

## Features

### Response Caching
- In-memory cache with TTL-based expiration
- Automatic cache key generation
- Per-route cache configuration
- Cache statistics endpoint

### Cookie Forwarding
- Automatically forwards cookies to backend services
- Handles Set-Cookie headers from backends
- Supports session-based authentication

### Error Handling
- Consistent error response format
- Proper HTTP status codes
- Service unavailable detection
- Request timeout handling

### Logging
- Structured request/response logging
- Performance metrics (response time)
- Error tracking
- Request ID propagation

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start

# Type check
pnpm typecheck
```

## Docker

Build the Docker image:

```bash
docker build -t battlescope-bff .
```

Run the container:

```bash
docker run -p 3006:3006 \
  -e AUTH_SERVICE_URL=http://authentication:3007 \
  -e BATTLE_SERVICE_URL=http://battle:3003 \
  battlescope-bff
```

## Testing

Test the service:

```bash
# Health check
curl http://localhost:3006/health

# Aggregate health check
curl http://localhost:3006/api/health

# Cache stats
curl http://localhost:3006/api/health/cache

# Test proxy (requires authentication)
curl http://localhost:3006/api/me \
  --cookie "session=your-session-id"
```

## Performance Considerations

- **Caching**: GET requests are cached by default (configurable per route)
- **Timeout**: 30-second default timeout for backend requests
- **Keep-Alive**: HTTP connections are reused
- **Streaming**: Large responses are streamed efficiently
- **Memory**: Cache cleanup runs every minute

## Security

- **Cookie Security**: Session cookies are forwarded securely
- **CORS**: Configurable origin restrictions
- **Rate Limiting**: (Future enhancement)
- **Request Validation**: (Future enhancement)

## Monitoring

The service provides several monitoring endpoints:

- `/health` - BFF service health
- `/api/health` - All services health status
- `/api/health/cache` - Cache performance metrics

## Future Enhancements

- [ ] Request rate limiting
- [ ] Response compression
- [ ] Request/response validation with Zod
- [ ] Redis-based distributed cache
- [ ] Circuit breaker pattern
- [ ] Metric collection (Prometheus)
- [ ] Distributed tracing
- [ ] GraphQL endpoint (optional)
