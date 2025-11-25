# BattleScope API Docker Image

**Image Name**: `petdog/battlescope-api:latest`

**Source**: `Dockerfile` with build args `SERVICE_SCOPE=@battlescope/api` and `BUILD_TARGET=backend/api`

## Purpose

REST API gateway providing access to battle data, killmail information, search functionality, and administrative operations. Built with Fastify for high performance.

## Features

- RESTful API with OpenAPI/Swagger documentation
- EVE Online SSO authentication (OAuth2)
- Feature-based RBAC authorization
- Real-time killmail stream via Server-Sent Events (SSE)
- Full-text search via Typesense
- Rate limiting and request validation
- Comprehensive observability (logs, metrics, traces)

## Configuration

### Environment Variables

#### Core Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | HTTP port to listen on | `3000` | No |
| `HOST` | Host to bind to | `0.0.0.0` | No |
| `DEVELOPER_MODE` | Enable developer mode (verbose logging) | `false` | No |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `[]` | No |
| `LOG_LEVEL` | Logging level (trace, debug, info, warn, error) | `info` | No |

#### Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |
| `POSTGRES_HOST` | PostgreSQL host | `localhost` | If no DATABASE_URL |
| `POSTGRES_PORT` | PostgreSQL port | `5432` | No |
| `POSTGRES_DB` | Database name | `battlescope` | No |
| `POSTGRES_USER` | Database user | - | If no DATABASE_URL |
| `POSTGRES_PASSWORD` | Database password | - | If no DATABASE_URL |
| `POSTGRES_SSL` | Enable SSL connection | `false` | No |

#### Redis Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ESI_REDIS_CACHE_URL` | Redis URL for ESI API caching | - | No |
| `SESSION_REDIS_URL` | Redis URL for session storage | - | Yes (for auth) |

#### EVE Online API (ESI) Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ESI_BASE_URL` | ESI API base URL | `https://esi.evetech.net/latest/` | No |
| `ESI_DATASOURCE` | ESI datasource | `tranquility` | No |
| `ESI_COMPATIBILITY_DATE` | ESI compatibility date | `2025-09-30` | No |
| `ESI_TIMEOUT_MS` | ESI request timeout (ms) | `10000` | No |
| `ESI_CACHE_TTL_SECONDS` | ESI cache TTL | `300` | No |

#### Authentication Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `EVE_CLIENT_ID` | EVE OAuth2 client ID | - | Yes (for auth) |
| `EVE_CLIENT_SECRET` | EVE OAuth2 client secret | - | Yes (for auth) |
| `EVE_CALLBACK_URL` | OAuth2 callback URL | - | Yes (for auth) |
| `EVE_SCOPES` | Space-separated OAuth2 scopes | `publicData` | No |
| `ENCRYPTION_KEY` | 32-byte encryption key (base64) for token storage | - | Yes (for auth) |
| `SESSION_TTL_SECONDS` | Session lifetime | `28800` (8 hours) | No |
| `SESSION_COOKIE_NAME` | Session cookie name | `battlescope_session` | No |
| `SESSION_COOKIE_SECURE` | Require HTTPS for cookies | `true` | No |
| `AUTHZ_CACHE_TTL_SECONDS` | Authorization cache TTL | `60` | No |
| `FRONTEND_URL` | Frontend URL for redirects | `http://localhost:5173` | Yes (for auth) |

#### Search Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TYPESENSE_HOST` | Typesense server host | `typesense.battlescope.svc.cluster.local` | Yes |
| `TYPESENSE_PORT` | Typesense server port | `8108` | No |
| `TYPESENSE_PROTOCOL` | Typesense protocol (http/https) | `http` | No |
| `TYPESENSE_API_KEY` | Typesense API key | `battlescope-search-key` | Yes |

#### Observability Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `http://otel-collector:4318` | No |
| `OTEL_SERVICE_NAME` | Service name for telemetry | `battlescope-api` | No |
| `OTEL_METRIC_EXPORT_INTERVAL` | Metrics export interval (ms) | `15000` | No |

## Ports

| Port | Protocol | Description |
|------|----------|-------------|
| 3000 | HTTP | REST API and Swagger UI |

## Health Checks

```bash
# HTTP health check endpoint
curl http://localhost:3000/healthz
```

Returns `200 OK` with `{ "status": "ok" }` when healthy.

## API Endpoints

### Core Endpoints

- `GET /healthz` - Health check
- `GET /docs` - Swagger UI documentation
- `GET /openapi.json` - OpenAPI specification

### Battle Endpoints

- `GET /battles` - List battles with filtering
- `GET /battles/:id` - Get battle details
- `GET /battles/:id/killmails` - Get battle killmails

### Killmail Endpoints

- `GET /killmails/recent` - Get recent killmails
- `GET /killmails/stream` - SSE stream of new killmails

### Search Endpoints

- `POST /search/battles` - Search battles
- `GET /search/entities` - Search entities (characters, corps, alliances)

### Admin Endpoints

- `GET /admin/rulesets` - List ingestion rulesets
- `POST /admin/rulesets` - Create ruleset
- `PUT /admin/rulesets/:id` - Update ruleset
- `DELETE /admin/rulesets/:id` - Delete ruleset
- `GET /admin/stats` - System statistics

### Authentication Endpoints

- `GET /auth/login` - Initiate EVE SSO login
- `GET /auth/callback` - OAuth2 callback
- `POST /auth/logout` - Logout
- `GET /auth/me` - Get current user

## Example Usage

### Docker Run

```bash
docker run -d \
  --name battlescope-api \
  -p 3000:3000 \
  -e DATABASE_URL=postgres://user:pass@postgres:5432/battlescope \
  -e REDIS_URL=redis://redis:6379/0 \
  -e SESSION_REDIS_URL=redis://redis:6379/2 \
  -e EVE_CLIENT_ID=your-client-id \
  -e EVE_CLIENT_SECRET=your-secret \
  -e EVE_CALLBACK_URL=http://localhost:3000/auth/callback \
  -e ENCRYPTION_KEY=$(openssl rand -base64 32) \
  -e FRONTEND_URL=http://localhost:5173 \
  -e TYPESENSE_HOST=typesense \
  -e TYPESENSE_API_KEY=your-api-key \
  petdog/battlescope-api:latest
```

### Docker Compose

```yaml
services:
  api:
    image: petdog/battlescope-api:latest
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      HOST: 0.0.0.0
      DATABASE_URL: postgres://battlescope:password@postgres:5432/battlescope
      REDIS_URL: redis://redis:6379/0
      SESSION_REDIS_URL: redis://redis:6379/2
      ESI_REDIS_CACHE_URL: redis://redis:6379/1
      EVE_CLIENT_ID: ${EVE_CLIENT_ID}
      EVE_CLIENT_SECRET: ${EVE_CLIENT_SECRET}
      EVE_CALLBACK_URL: http://localhost:3000/auth/callback
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      FRONTEND_URL: http://localhost:5173
      TYPESENSE_HOST: typesense
      TYPESENSE_PORT: 8108
      TYPESENSE_API_KEY: ${TYPESENSE_API_KEY}
      SESSION_COOKIE_SECURE: false
    depends_on:
      - postgres
      - redis
      - typesense
    restart: unless-stopped
```

### Kubernetes Deployment

See `infra/k8s/api-deployment.yaml` for the complete Kubernetes manifest.

## Resource Requirements

### Recommended

- **CPU**: 200m request, 1000m limit
- **Memory**: 256Mi request, 1Gi limit

### Minimum

- **CPU**: 50m
- **Memory**: 128Mi

## Dependencies

### Required Services

- **PostgreSQL 15+**: Primary database
- **Redis 7+**: Session storage and optional ESI caching
- **Typesense**: Search engine

### Optional Services

- **OpenTelemetry Collector**: For metrics and tracing
- **Loki**: For log aggregation

## Build Information

### Build Command

```bash
docker build \
  --build-arg SERVICE_SCOPE=@battlescope/api \
  --build-arg BUILD_TARGET=backend/api \
  -t petdog/battlescope-api:latest \
  -f Dockerfile \
  .
```

## Troubleshooting

### Authentication Not Working

1. Verify all auth environment variables are set
2. Check `ENCRYPTION_KEY` is 32+ characters
3. Verify `EVE_CALLBACK_URL` matches your EVE application configuration
4. Check Redis connectivity for session storage

### Database Connection Fails

1. Verify `DATABASE_URL` format: `postgres://user:pass@host:port/dbname`
2. Check network connectivity to PostgreSQL
3. Verify database exists and migrations have run

### Search Not Working

1. Verify Typesense is running and accessible
2. Check `TYPESENSE_API_KEY` matches Typesense configuration
3. Ensure search-sync service has indexed data

## Security Considerations

- Always use strong `ENCRYPTION_KEY` (32+ random bytes, base64 encoded)
- Set `SESSION_COOKIE_SECURE=true` in production with HTTPS
- Use Redis password authentication in production
- Configure `CORS_ALLOWED_ORIGINS` to restrict API access
- Rotate `EVE_CLIENT_SECRET` and `ENCRYPTION_KEY` periodically
- Use Kubernetes Secrets for sensitive environment variables

## Version Information

- **Node.js**: 20 LTS
- **Fastify**: 4.26
- **TypeScript**: 5.4.5

## Additional Resources

- [API Source Code](../../backend/api)
- [Swagger UI](http://localhost:3000/docs) (when running)
- [Architecture Documentation](../architecture.md)
