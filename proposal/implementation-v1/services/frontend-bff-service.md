# Frontend BFF Service Specification

**Domain**: Frontend-specific data aggregation (Backend-for-Frontend pattern)
**Version**: 1.0
**Date**: 2025-11-25

---

## Overview

The Frontend BFF (Backend-for-Frontend) Service is responsible for aggregating data from multiple backend services and transforming it into frontend-optimized formats, implementing the BFF pattern for clean separation between frontend needs and backend domain services.

---

## Responsibilities

### Core Responsibilities

✅ **Data Aggregation**:
- Receive frontend requests
- Call multiple backend services in parallel
- Combine responses into unified frontend-friendly format
- Handle partial failures gracefully (circuit breaker pattern)
- Transform backend data structures for UI needs

✅ **Response Caching**:
- Cache aggregated responses in Redis
- Implement cache invalidation strategies
- Cache warming for popular queries
- Per-user caching where appropriate

✅ **API Optimization**:
- Reduce number of roundtrips for frontend
- GraphQL-like field selection (optional)
- Batch requests where possible
- Compress responses

✅ **Authentication & Authorization**:
- Validate JWT tokens
- Extract user context
- Forward user context to backend services
- Handle session management

✅ **Error Handling & Fallbacks**:
- Graceful degradation when services unavailable
- Return partial data when possible
- User-friendly error messages
- Retry logic with exponential backoff

✅ **Health & Monitoring**:
- Track backend service health
- Monitor cache hit rates
- Expose health check endpoints
- Track request/response times

### NOT Responsible For

❌ Business logic (delegates to domain services)
❌ Authoritative data storage (only caches)
❌ Event publishing (read-only from frontend perspective)
❌ Complex computations (delegates to domain services)

---

## Database

### Redis Cache

#### Key Pattern: `cache:battle:{battleId}`

Cached battle detail response.

**Value**:
```json
{
  "battle": { /* full battle data */ },
  "participants": [ /* top 100 participants */ ],
  "timeline": [ /* killmail timeline */ ],
  "cachedAt": "2025-11-25T10:00:00Z"
}
```

**TTL**: 5 minutes (closed battles), 30 seconds (open battles)

#### Key Pattern: `cache:battles:list:{hash}`

Cached battle list response (hash based on query params).

**Value**:
```json
{
  "battles": [ /* battle list */ ],
  "pagination": { /* pagination metadata */ },
  "cachedAt": "2025-11-25T10:00:00Z"
}
```

**TTL**: 1 minute

#### Key Pattern: `cache:dashboard:{userId}`

Cached dashboard data per user.

**Value**:
```json
{
  "recentBattles": [ /* user's subscribed battles */ ],
  "activeNotifications": [ /* active battles */ ],
  "statistics": { /* user-specific stats */ },
  "cachedAt": "2025-11-25T10:00:00Z"
}
```

**TTL**: 30 seconds

#### Key Pattern: `cache:stats:global`

Cached global statistics.

**Value**:
```json
{
  "last24Hours": {
    "battlesCreated": 234,
    "totalIskDestroyed": 5000000000000,
    "totalPilots": 15234
  },
  "last7Days": { /* weekly stats */ },
  "topAlliances": [ /* top 10 alliances */ ],
  "topSystems": [ /* top 10 systems */ ],
  "cachedAt": "2025-11-25T10:00:00Z"
}
```

**TTL**: 5 minutes

---

## API Endpoints

### Health & Status

#### GET /api/health
Kubernetes health check.

**Response**:
```json
{
  "status": "healthy",
  "services": {
    "battle": "healthy",
    "search": "healthy",
    "notification": "healthy",
    "enrichment": "healthy",
    "ingestion": "healthy"
  },
  "cache": {
    "status": "connected",
    "hitRate": 0.87
  }
}
```

#### GET /api/stats
BFF service statistics.

**Response**:
```json
{
  "requests": {
    "total": 125456,
    "last1Minute": 125,
    "last1Hour": 7500
  },
  "cache": {
    "hits": 109000,
    "misses": 16456,
    "hitRate": 0.87
  },
  "backendCalls": {
    "battle": 45000,
    "search": 30000,
    "notification": 25000
  },
  "avgResponseTime": 45
}
```

### Dashboard

#### GET /api/dashboard
Get user's personalized dashboard.

**Authorization**: Requires authenticated user

**Response**:
```json
{
  "user": {
    "userId": "uuid",
    "username": "john_doe",
    "subscriptions": {
      "total": 5,
      "alliances": 2,
      "systems": 3
    }
  },
  "recentBattles": [
    {
      "battleId": "uuid",
      "startedAt": "2025-11-25T09:00:00Z",
      "primarySystemName": "Jita",
      "totalIskDestroyed": 150000000000,
      "totalPilots": 456,
      "status": "open",
      "matchedSubscriptions": [
        {
          "type": "alliance",
          "entityId": 99001234,
          "entityName": "Test Alliance"
        }
      ]
    }
  ],
  "activeNotifications": 3,
  "statistics": {
    "watchedBattles": 125,
    "totalIskWatched": 5000000000000
  }
}
```

**Implementation**:
- Calls Notification Service for user subscriptions
- Calls Battle Service for recent battles matching subscriptions
- Calls Notification Service for active notifications
- Aggregates and caches response

### Battle Queries

#### GET /api/battles
List battles with frontend-optimized format.

**Query Parameters**:
- All standard Battle Service parameters
- Additional: `includeParticipants` (boolean), `includeTimeline` (boolean)

**Response**:
```json
{
  "battles": [
    {
      "id": "uuid",
      "startedAt": "2025-11-25T09:00:00Z",
      "endedAt": "2025-11-25T10:30:00Z",
      "duration": "1h 30m",
      "durationSeconds": 5400,
      "location": {
        "systemId": 30000142,
        "systemName": "Jita",
        "regionId": 10000002,
        "regionName": "The Forge",
        "security": "1.0"
      },
      "statistics": {
        "killmails": 125,
        "pilots": 456,
        "iskDestroyed": "150.0B",
        "iskDestroyedRaw": 150000000000
      },
      "teams": {
        "teamA": {
          "pilots": 234,
          "iskDestroyed": "80.0B",
          "iskLost": "70.0B",
          "mainAlliance": {
            "id": 99001234,
            "name": "Test Alliance",
            "ticker": "TEST"
          }
        },
        "teamB": {
          "pilots": 222,
          "iskDestroyed": "70.0B",
          "iskLost": "80.0B",
          "mainAlliance": {
            "id": 99005678,
            "name": "Enemy Alliance",
            "ticker": "ENEMY"
          }
        }
      },
      "outcome": {
        "isDecisive": true,
        "winner": "Team A"
      },
      "status": "closed",
      "zkillboardUrl": "https://zkillboard.com/related/30000142/202511250900/"
    }
  ],
  "pagination": {
    "total": 125456,
    "page": 1,
    "perPage": 50,
    "totalPages": 2510,
    "hasNext": true,
    "hasPrevious": false
  },
  "filters": {
    "applied": {
      "systemId": 30000142,
      "minIsk": 1000000000
    },
    "available": {
      "regions": [
        {"id": 10000002, "name": "The Forge", "count": 523}
      ],
      "alliances": [
        {"id": 99001234, "name": "Test Alliance", "count": 123}
      ]
    }
  }
}
```

**Implementation**:
- Calls Battle Service for battle list
- Optionally calls Search Service for facets/filters
- Transforms ISK values to human-readable format (B/M/K)
- Transforms timestamps to relative time
- Caches response with query-based hash

#### GET /api/battles/:id
Get detailed battle information.

**Query Parameters**:
- `includeParticipants` (optional, default false)
- `includeKillmails` (optional, default false)
- `includeTimeline` (optional, default true)

**Response**:
```json
{
  "battle": {
    "id": "uuid",
    "startedAt": "2025-11-25T09:00:00Z",
    "endedAt": "2025-11-25T10:30:00Z",
    "duration": "1h 30m",
    "location": {
      "systemId": 30000142,
      "systemName": "Jita",
      "regionId": 10000002,
      "regionName": "The Forge",
      "security": "1.0",
      "dotlanUrl": "https://evemaps.dotlan.net/system/Jita"
    },
    "statistics": {
      "killmails": 125,
      "pilots": 456,
      "iskDestroyed": "150.0B",
      "iskDestroyedRaw": 150000000000
    },
    "teams": {
      "teamA": {
        "name": "Team A",
        "pilots": 234,
        "iskDestroyed": "80.0B",
        "iskLost": "70.0B",
        "shipsDestroyed": 65,
        "shipsLost": 60,
        "alliances": [
          {
            "id": 99001234,
            "name": "Test Alliance",
            "ticker": "TEST",
            "pilots": 123,
            "iskDestroyed": "50.0B"
          }
        ],
        "topShips": [
          {
            "shipTypeId": 587,
            "shipTypeName": "Rifter",
            "count": 45,
            "iconUrl": "https://images.evetech.net/types/587/icon"
          }
        ]
      },
      "teamB": { /* similar structure */ }
    },
    "topKillers": [
      {
        "characterId": 12345678,
        "characterName": "Jane Smith",
        "team": "Team A",
        "kills": 15,
        "iskDestroyed": "5.0B",
        "zkillboardUrl": "https://zkillboard.com/character/12345678/"
      }
    ],
    "topLosers": [ /* similar structure */ ],
    "timeline": [
      {
        "timestamp": "2025-11-25T09:05:00Z",
        "relativeTime": "5m",
        "killmailId": 123456789,
        "victimName": "John Doe",
        "victimShip": "Rifter",
        "victimTeam": "Team B",
        "iskDestroyed": "50M",
        "zkillboardUrl": "https://zkillboard.com/kill/123456789/"
      }
    ],
    "relatedLinks": {
      "zkillboard": "https://zkillboard.com/related/30000142/202511250900/",
      "dotlan": "https://evemaps.dotlan.net/system/Jita",
      "eveWho": "https://evewho.com/alli/99001234"
    }
  },
  "userContext": {
    "isSubscribed": true,
    "subscriptions": [
      {
        "type": "alliance",
        "entityId": 99001234,
        "entityName": "Test Alliance"
      }
    ],
    "hasNotification": false
  }
}
```

**Implementation**:
- Calls Battle Service for core battle data
- Optionally calls Battle Service for participants/killmails
- If authenticated: calls Notification Service for user subscriptions
- Enriches with external URLs (zKillboard, Dotlan, EVE Who)
- Transforms ISK/time to human-readable
- Adds ship icons from EVE image server
- Caches response per battle ID

### Search

#### GET /api/search
Unified search across battles and entities.

**Query Parameters**:
- `q`: Search query
- `type` (optional): 'battles', 'entities', 'all' (default 'all')
- Other parameters passed to Search Service

**Response**:
```json
{
  "query": "jita",
  "results": {
    "battles": {
      "found": 523,
      "hits": [ /* battle search results */ ]
    },
    "entities": {
      "found": 15,
      "hits": [
        {
          "type": "system",
          "id": 30000142,
          "name": "Jita",
          "ticker": null,
          "battleCount": 523,
          "dotlanUrl": "https://evemaps.dotlan.net/system/Jita"
        },
        {
          "type": "alliance",
          "id": 99001234,
          "name": "Test Alliance",
          "ticker": "TEST",
          "battleCount": 123,
          "zkillboardUrl": "https://zkillboard.com/alliance/99001234/"
        }
      ]
    }
  },
  "searchTime": 15
}
```

**Implementation**:
- Calls Search Service with query
- Transforms results with external URLs
- Adds type-specific metadata
- Caches response with query hash

### Statistics

#### GET /api/statistics/global
Get global statistics.

**Query Parameters**:
- `period` (optional): '24h', '7d', '30d' (default '24h')

**Response**:
```json
{
  "period": "24h",
  "battles": {
    "total": 234,
    "totalIskDestroyed": "5.0T",
    "totalPilots": 15234,
    "averageIskPerBattle": "21.4B",
    "averagePilotsPerBattle": 65
  },
  "topSystems": [
    {
      "systemId": 30000142,
      "systemName": "Jita",
      "battles": 45,
      "iskDestroyed": "1.5T"
    }
  ],
  "topAlliances": [
    {
      "allianceId": 99001234,
      "allianceName": "Test Alliance",
      "battles": 52,
      "iskDestroyed": "800.0B",
      "iskLost": "750.0B"
    }
  ],
  "activityTimeline": [
    {
      "hour": "00:00",
      "battles": 12,
      "iskDestroyed": "150.0B"
    }
  ]
}
```

**Implementation**:
- Calls Search Service for aggregations
- Calls Battle Service for additional stats
- Transforms to human-readable format
- Heavily cached (5 minutes TTL)

### User Subscriptions

#### GET /api/subscriptions
Get user's subscriptions with enriched data.

**Authorization**: Requires authenticated user

**Response**:
```json
{
  "subscriptions": [
    {
      "type": "alliance",
      "entityId": 99001234,
      "entityName": "Test Alliance",
      "entityTicker": "TEST",
      "subscribedAt": "2025-11-25T10:00:00Z",
      "recentActivity": {
        "last24Hours": {
          "battles": 5,
          "iskDestroyed": "500.0B"
        }
      },
      "zkillboardUrl": "https://zkillboard.com/alliance/99001234/"
    }
  ],
  "preferences": {
    "minIskThreshold": "1.0B",
    "minPilots": 10,
    "notifications": {
      "enabled": true,
      "types": ["battle.created"]
    }
  }
}
```

**Implementation**:
- Calls Notification Service for subscriptions
- Calls Search Service for recent activity per subscription
- Enriches with external URLs
- Transforms ISK to human-readable

---

## Implementation Details

### Aggregation Pattern

```typescript
class BFFAggregator {
  async getBattleDetail(
    battleId: string,
    userId: string | null,
    options: BattleDetailOptions
  ): Promise<BattleDetailResponse> {
    // 1. Check cache
    const cacheKey = `cache:battle:${battleId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return this.enrichWithUserContext(JSON.parse(cached), userId);
    }

    // 2. Call backend services in parallel
    const [battle, participants, userSubscriptions] = await Promise.allSettled([
      this.battleService.getBattle(battleId),
      options.includeParticipants ? this.battleService.getParticipants(battleId) : null,
      userId ? this.notificationService.getUserSubscriptions(userId) : null
    ]);

    // 3. Handle partial failures
    if (battle.status === 'rejected') {
      throw new Error('Battle not found');
    }

    // 4. Transform to frontend format
    const response = this.transformBattleDetail(
      battle.value,
      participants.status === 'fulfilled' ? participants.value : null
    );

    // 5. Enrich with external URLs
    this.enrichWithExternalUrls(response);

    // 6. Transform ISK/time to human-readable
    this.transformToHumanReadable(response);

    // 7. Cache response
    const ttl = battle.value.status === 'closed' ? 300 : 30; // 5min closed, 30sec open
    await this.redis.setex(cacheKey, ttl, JSON.stringify(response));

    // 8. Add user context if authenticated
    return this.enrichWithUserContext(response, userId, userSubscriptions);
  }

  private transformBattleDetail(battle: Battle, participants: Participant[] | null): any {
    return {
      id: battle.id,
      startedAt: battle.startedAt,
      endedAt: battle.endedAt,
      duration: this.formatDuration(battle.durationSeconds),
      durationSeconds: battle.durationSeconds,
      location: {
        systemId: battle.primarySystem.id,
        systemName: battle.primarySystem.name,
        regionId: battle.primaryRegion.id,
        regionName: battle.primaryRegion.name,
        security: this.getSystemSecurity(battle.primarySystem.id)
      },
      statistics: {
        killmails: battle.totalKillmails,
        pilots: battle.totalPilots,
        iskDestroyed: this.formatISK(battle.totalIskDestroyed),
        iskDestroyedRaw: battle.totalIskDestroyed
      },
      teams: this.transformTeams(battle),
      topKillers: this.transformTopKillers(battle.statistics.topKillers),
      topLosers: this.transformTopLosers(battle.statistics.topLosers),
      timeline: this.transformTimeline(battle.statistics.killmailTimeline)
    };
  }

  private formatISK(isk: number): string {
    if (isk >= 1_000_000_000_000) {
      return `${(isk / 1_000_000_000_000).toFixed(1)}T`;
    } else if (isk >= 1_000_000_000) {
      return `${(isk / 1_000_000_000).toFixed(1)}B`;
    } else if (isk >= 1_000_000) {
      return `${(isk / 1_000_000).toFixed(1)}M`;
    } else if (isk >= 1_000) {
      return `${(isk / 1_000).toFixed(1)}K`;
    }
    return isk.toString();
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  private enrichWithExternalUrls(response: any): void {
    // zKillboard related link
    const dateStr = new Date(response.startedAt).toISOString().slice(0, 10).replace(/-/g, '');
    const hour = new Date(response.startedAt).getUTCHours().toString().padStart(2, '0');
    response.relatedLinks = {
      zkillboard: `https://zkillboard.com/related/${response.location.systemId}/${dateStr}${hour}00/`,
      dotlan: `https://evemaps.dotlan.net/system/${response.location.systemName.replace(' ', '_')}`,
      eveWho: response.teams.teamA.mainAlliance
        ? `https://evewho.com/alli/${response.teams.teamA.mainAlliance.id}`
        : null
    };

    // Add ship icons
    if (response.teams?.teamA?.topShips) {
      response.teams.teamA.topShips.forEach(ship => {
        ship.iconUrl = `https://images.evetech.net/types/${ship.shipTypeId}/icon`;
      });
    }

    if (response.teams?.teamB?.topShips) {
      response.teams.teamB.topShips.forEach(ship => {
        ship.iconUrl = `https://images.evetech.net/types/${ship.shipTypeId}/icon`;
      });
    }
  }

  private async enrichWithUserContext(
    response: any,
    userId: string | null,
    userSubscriptions?: any
  ): Promise<any> {
    if (!userId) {
      return response;
    }

    const subscriptions = userSubscriptions?.subscriptions || {};
    const matchedSubscriptions = [];

    // Check if user is subscribed to any entities in this battle
    if (subscriptions.alliances) {
      const allianceIds = [
        ...response.teams.teamA.alliances.map(a => a.id),
        ...response.teams.teamB.alliances.map(a => a.id)
      ];

      for (const allianceId of allianceIds) {
        if (subscriptions.alliances.includes(allianceId)) {
          const alliance = [...response.teams.teamA.alliances, ...response.teams.teamB.alliances]
            .find(a => a.id === allianceId);

          matchedSubscriptions.push({
            type: 'alliance',
            entityId: allianceId,
            entityName: alliance.name
          });
        }
      }
    }

    response.userContext = {
      isSubscribed: matchedSubscriptions.length > 0,
      subscriptions: matchedSubscriptions,
      hasNotification: false // TODO: check notification service
    };

    return response;
  }
}
```

### Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime: Date | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  private readonly threshold = 5;
  private readonly timeout = 60000; // 1 minute

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime!.getTime() > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

---

## Operational Considerations

### Performance Targets

- **Response Time**: <100ms p95 (with cache hit)
- **Response Time**: <500ms p95 (with cache miss)
- **Cache Hit Rate**: >80%
- **Throughput**: 1,000+ requests/second per replica

### Resource Requirements

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 200m | 1000m |
| Memory | 256Mi | 1Gi |
| Storage | N/A | N/A |

**Redis**:
- Memory: 2GB (for cached responses)
- Eviction policy: allkeys-lru

### Scaling

- **Horizontal**: 3-5 replicas
- **Stateless**: No session affinity required
- **Cache**: Shared Redis instance

---

## Monitoring & Alerting

### Metrics

- `bff_requests_total{endpoint}` - Total requests per endpoint
- `bff_response_duration_seconds{endpoint}` - Response time histogram
- `bff_cache_operations_total{operation,result}` - Cache hits/misses
- `bff_backend_calls_total{service,status}` - Backend service calls
- `bff_circuit_breaker_state{service}` - Circuit breaker state

### Alerts

- **High Response Time**: p95 >1 second for 5 minutes
- **Low Cache Hit Rate**: <60% for 10 minutes
- **Backend Service Down**: Circuit breaker open
- **High Error Rate**: >5% 5xx responses

---

## Testing Strategy

### Unit Tests
- Data transformation logic
- ISK/time formatting
- URL generation
- Cache key generation

### Integration Tests
- Aggregation from multiple services
- Circuit breaker behavior
- Cache invalidation
- Partial failure handling

### End-to-End Tests
- Full user flows (dashboard, battle detail, search)
- Performance under load
- Cache effectiveness

---

## Dependencies

**Internal Services**:
- Battle Service (HTTP)
- Search Service (HTTP)
- Notification Service (HTTP)
- Enrichment Service (HTTP, optional)
- Ingestion Service (HTTP, optional)
- Redis (cache)

**Libraries**:
- Fastify (HTTP server)
- Redis client
- Zod (Validation)
- Axios or Fetch (HTTP client)

---

## References

- [Domain Boundaries](../DOMAIN-BOUNDARIES.md#domain-6-frontend-aggregation)
- [BFF Pattern](../../docs/architecture-v3/bff-pattern.md)
- [Circuit Breaker Pattern](../../docs/architecture-v3/circuit-breaker-pattern.md)
