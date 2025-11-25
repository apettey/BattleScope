# Notification Service Specification

**Domain**: Real-time user notifications and subscriptions
**Version**: 1.0
**Date**: 2025-11-25

---

## Overview

The Notification Service is responsible for managing user subscriptions, maintaining WebSocket connections, and pushing real-time battle notifications to users based on their interests.

---

## Responsibilities

### Core Responsibilities

✅ **WebSocket Connection Management**:
- Maintain persistent WebSocket connections with users
- Handle connection lifecycle (connect, disconnect, reconnect)
- Implement heartbeat/ping-pong for connection health
- Support connection recovery with missed message replay

✅ **Subscription Management**:
- Store user subscriptions (alliances, corporations, systems, regions)
- CRUD operations for subscriptions via API
- Support multiple subscription types (alliance, corporation, system, region, character)

✅ **Notification Filtering & Delivery**:
- Consume `battle.created` and `battle.updated` events from Kafka
- Match battles against user subscriptions
- Filter notifications based on user preferences
- Push notifications to connected users via WebSocket
- Queue notifications for offline users (limited retention)

✅ **User Preferences**:
- Manage notification preferences (frequency, types, thresholds)
- Support do-not-disturb periods
- Min ISK threshold per user
- Notification cooldown periods

✅ **Health & Monitoring**:
- Track active WebSocket connections
- Monitor notification delivery rate
- Expose health check endpoints

### NOT Responsible For

❌ Creating battles (Battle domain)
❌ Storing battle data (Battle domain)
❌ User authentication (handled by API layer)
❌ Battle search (Search domain)

---

## Database

### Redis Data Structures

#### Key: `ws:connection:{userId}`

Active WebSocket connection metadata.

**Value** (Hash):
```json
{
  "userId": "uuid",
  "connectionId": "uuid",
  "connectedAt": "2025-11-25T10:00:00Z",
  "lastPing": "2025-11-25T10:05:00Z",
  "userAgent": "Mozilla/5.0...",
  "ipAddress": "192.168.1.1"
}
```

**TTL**: 24 hours (refreshed on ping)

#### Key: `subscriptions:{userId}`

User subscriptions.

**Value** (Hash):
```json
{
  "alliances": "[99001234,99005678]",
  "corporations": "[98765432]",
  "systems": "[30000142]",
  "regions": "[10000002]",
  "characters": "[95465499]"
}
```

**TTL**: None (persistent)

#### Key: `preferences:{userId}`

User notification preferences.

**Value** (Hash):
```json
{
  "minIskThreshold": "1000000000",
  "minPilots": "10",
  "enabledTypes": "[\"battle.created\",\"battle.updated\"]",
  "cooldownSeconds": "300",
  "dndStart": "23:00",
  "dndEnd": "07:00",
  "timezone": "UTC"
}
```

**TTL**: None (persistent)

#### Key: `notifications:pending:{userId}`

Pending notifications for offline users.

**Value** (List):
```json
[
  "{\"battleId\":\"uuid\",\"type\":\"battle.created\",\"timestamp\":\"2025-11-25T10:00:00Z\"}",
  "{\"battleId\":\"uuid2\",\"type\":\"battle.updated\",\"timestamp\":\"2025-11-25T10:05:00Z\"}"
]
```

**TTL**: 1 hour (notifications older than 1 hour are discarded)

#### Key: `notification:cooldown:{userId}:{subscriptionId}`

Cooldown tracking to prevent notification spam.

**Value**: `1`

**TTL**: User's configured cooldown seconds (default 300)

#### Key: `stats:notifications`

Real-time notification statistics.

**Value** (Hash):
```json
{
  "totalConnections": "1523",
  "totalSent": "125456",
  "totalQueued": "234",
  "last1MinSent": "45"
}
```

**TTL**: 1 hour (refreshed periodically)

---

## API Endpoints

### Health & Status

#### GET /api/notifications/health
Kubernetes health check.

**Response**:
```json
{
  "status": "healthy",
  "activeConnections": 1523,
  "redisStatus": "connected"
}
```

#### GET /api/notifications/stats
Service statistics.

**Response**:
```json
{
  "activeConnections": 1523,
  "totalUsers": 2345,
  "last24Hours": {
    "notificationsSent": 125456,
    "notificationsQueued": 5432,
    "avgDeliveryTime": 25
  }
}
```

### Subscription Management

#### GET /api/notifications/subscriptions
Get user's subscriptions.

**Authorization**: Requires authenticated user

**Response**:
```json
{
  "userId": "uuid",
  "subscriptions": {
    "alliances": [
      {
        "allianceId": 99001234,
        "allianceName": "Test Alliance",
        "subscribedAt": "2025-11-25T10:00:00Z"
      }
    ],
    "corporations": [
      {
        "corporationId": 98765432,
        "corporationName": "Test Corp",
        "subscribedAt": "2025-11-25T10:00:00Z"
      }
    ],
    "systems": [
      {
        "systemId": 30000142,
        "systemName": "Jita",
        "subscribedAt": "2025-11-25T10:00:00Z"
      }
    ],
    "regions": [
      {
        "regionId": 10000002,
        "regionName": "The Forge",
        "subscribedAt": "2025-11-25T10:00:00Z"
      }
    ],
    "characters": [
      {
        "characterId": 95465499,
        "characterName": "John Doe",
        "subscribedAt": "2025-11-25T10:00:00Z"
      }
    ]
  },
  "totalSubscriptions": 5
}
```

#### POST /api/notifications/subscriptions
Add new subscription.

**Authorization**: Requires authenticated user

**Request**:
```json
{
  "type": "alliance",
  "entityId": 99001234,
  "entityName": "Test Alliance"
}
```

**Response** (201 Created):
```json
{
  "type": "alliance",
  "entityId": 99001234,
  "entityName": "Test Alliance",
  "subscribedAt": "2025-11-25T10:00:00Z"
}
```

#### DELETE /api/notifications/subscriptions/:type/:id
Remove subscription.

**Authorization**: Requires authenticated user

**Response** (204 No Content)

### Notification Preferences

#### GET /api/notifications/preferences
Get user's notification preferences.

**Authorization**: Requires authenticated user

**Response**:
```json
{
  "userId": "uuid",
  "minIskThreshold": 1000000000,
  "minPilots": 10,
  "enabledTypes": ["battle.created", "battle.updated"],
  "cooldownSeconds": 300,
  "doNotDisturb": {
    "enabled": true,
    "start": "23:00",
    "end": "07:00",
    "timezone": "UTC"
  }
}
```

#### PUT /api/notifications/preferences
Update notification preferences.

**Authorization**: Requires authenticated user

**Request**:
```json
{
  "minIskThreshold": 5000000000,
  "minPilots": 50,
  "enabledTypes": ["battle.created"],
  "cooldownSeconds": 600,
  "doNotDisturb": {
    "enabled": true,
    "start": "23:00",
    "end": "07:00",
    "timezone": "UTC"
  }
}
```

**Response** (200 OK):
```json
{
  "userId": "uuid",
  "minIskThreshold": 5000000000,
  "minPilots": 50,
  "enabledTypes": ["battle.created"],
  "cooldownSeconds": 600,
  "doNotDisturb": {
    "enabled": true,
    "start": "23:00",
    "end": "07:00",
    "timezone": "UTC"
  },
  "updatedAt": "2025-11-25T10:00:00Z"
}
```

### Pending Notifications

#### GET /api/notifications/pending
Get pending notifications for authenticated user.

**Authorization**: Requires authenticated user

**Response**:
```json
{
  "notifications": [
    {
      "notificationId": "uuid",
      "type": "battle.created",
      "battleId": "uuid",
      "timestamp": "2025-11-25T09:55:00Z",
      "data": {
        "battleId": "uuid",
        "startedAt": "2025-11-25T09:00:00Z",
        "primarySystemName": "Jita",
        "totalIskDestroyed": 150000000000,
        "totalPilots": 456
      }
    }
  ],
  "total": 5
}
```

#### POST /api/notifications/pending/:id/acknowledge
Mark notification as read.

**Authorization**: Requires authenticated user

**Response** (204 No Content)

---

## WebSocket Protocol

### Connection

**URL**: `ws://api.battlescope.io/ws/notifications`

**Authorization**: WebSocket upgrade request must include `Authorization: Bearer <token>` header

**Connection Flow**:
1. Client initiates WebSocket upgrade with JWT token
2. Server validates token and extracts user ID
3. Server stores connection metadata in Redis
4. Server sends welcome message
5. Server sends any pending notifications
6. Server starts heartbeat ping/pong

### Messages

#### Server → Client: Welcome

Sent immediately after connection established.

```json
{
  "type": "welcome",
  "data": {
    "connectionId": "uuid",
    "userId": "uuid",
    "timestamp": "2025-11-25T10:00:00Z",
    "pendingNotifications": 5
  }
}
```

#### Server → Client: Battle Notification

Sent when a battle matches user's subscriptions.

```json
{
  "type": "notification",
  "data": {
    "notificationId": "uuid",
    "battleId": "uuid",
    "eventType": "battle.created",
    "timestamp": "2025-11-25T10:00:00Z",
    "battle": {
      "id": "uuid",
      "startedAt": "2025-11-25T09:00:00Z",
      "endedAt": "2025-11-25T10:30:00Z",
      "primarySystem": {
        "id": 30000142,
        "name": "Jita"
      },
      "totalIskDestroyed": 150000000000,
      "totalPilots": 456,
      "matchedSubscriptions": [
        {
          "type": "alliance",
          "entityId": 99001234,
          "entityName": "Test Alliance",
          "team": "team_a"
        }
      ]
    }
  }
}
```

#### Server → Client: Ping

Heartbeat to keep connection alive.

```json
{
  "type": "ping",
  "timestamp": "2025-11-25T10:05:00Z"
}
```

#### Client → Server: Pong

Response to ping.

```json
{
  "type": "pong",
  "timestamp": "2025-11-25T10:05:00Z"
}
```

#### Client → Server: Subscribe

Add subscription via WebSocket.

```json
{
  "type": "subscribe",
  "data": {
    "type": "alliance",
    "entityId": 99001234,
    "entityName": "Test Alliance"
  }
}
```

#### Server → Client: Subscription Confirmed

```json
{
  "type": "subscription_confirmed",
  "data": {
    "type": "alliance",
    "entityId": 99001234,
    "entityName": "Test Alliance",
    "subscribedAt": "2025-11-25T10:00:00Z"
  }
}
```

#### Client → Server: Unsubscribe

Remove subscription via WebSocket.

```json
{
  "type": "unsubscribe",
  "data": {
    "type": "alliance",
    "entityId": 99001234
  }
}
```

---

## Event Consumption

### Event: `battle.created`

Consumed from Kafka topic: `battle.events`

**Handler Logic**:
1. Extract battle data from event
2. Query all users with matching subscriptions
3. For each matching user:
   - Check notification preferences (min ISK, min pilots)
   - Check do-not-disturb status
   - Check cooldown period
   - If user is connected: send WebSocket notification
   - If user is offline: queue notification in Redis
4. Update notification metrics

### Event: `battle.updated`

Consumed from Kafka topic: `battle.events`

**Handler Logic**: Same as `battle.created`, but only notify if significant update (e.g., ISK destroyed increased by >20%, pilot count increased by >50%)

---

## Implementation Details

### WebSocket Server

```typescript
class NotificationWebSocketServer {
  private connections = new Map<string, WebSocket>();

  async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      // 1. Extract and validate JWT token
      const token = this.extractToken(request);
      const userId = await this.validateToken(token);

      // 2. Store connection metadata
      const connectionId = uuid();
      await this.storeConnection(userId, connectionId, request);

      this.connections.set(userId, ws);

      // 3. Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        data: {
          connectionId,
          userId,
          timestamp: new Date().toISOString(),
          pendingNotifications: await this.getPendingNotificationCount(userId)
        }
      }));

      // 4. Send pending notifications
      await this.sendPendingNotifications(userId, ws);

      // 5. Set up heartbeat
      this.startHeartbeat(userId, ws);

      // 6. Handle messages
      ws.on('message', (data) => this.handleMessage(userId, data));

      // 7. Handle disconnect
      ws.on('close', () => this.handleDisconnect(userId));

      logger.info({ userId, connectionId }, 'WebSocket connection established');
    } catch (error) {
      logger.error({ error }, 'WebSocket connection failed');
      ws.close(1008, 'Unauthorized');
    }
  }

  private async storeConnection(
    userId: string,
    connectionId: string,
    request: IncomingMessage
  ): Promise<void> {
    await this.redis.hset(`ws:connection:${userId}`, {
      userId,
      connectionId,
      connectedAt: new Date().toISOString(),
      lastPing: new Date().toISOString(),
      userAgent: request.headers['user-agent'] || 'unknown',
      ipAddress: request.socket.remoteAddress || 'unknown'
    });

    await this.redis.expire(`ws:connection:${userId}`, 86400); // 24 hours
  }

  private startHeartbeat(userId: string, ws: WebSocket): void {
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'ping',
          timestamp: new Date().toISOString()
        }));

        // Update last ping time
        this.redis.hset(`ws:connection:${userId}`, 'lastPing', new Date().toISOString());
      } else {
        clearInterval(interval);
      }
    }, 30000); // 30 seconds
  }

  private async handleMessage(userId: string, data: WebSocket.Data): Promise<void> {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'pong':
          // Update last pong time
          await this.redis.hset(`ws:connection:${userId}`, 'lastPing', new Date().toISOString());
          break;

        case 'subscribe':
          await this.handleSubscribe(userId, message.data);
          break;

        case 'unsubscribe':
          await this.handleUnsubscribe(userId, message.data);
          break;

        default:
          logger.warn({ userId, messageType: message.type }, 'Unknown message type');
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to handle WebSocket message');
    }
  }

  private handleDisconnect(userId: string): void {
    this.connections.delete(userId);
    this.redis.del(`ws:connection:${userId}`);
    logger.info({ userId }, 'WebSocket connection closed');
  }
}
```

### Notification Matcher

```typescript
class NotificationMatcher {
  async processBattleEvent(event: BattleCreatedEvent | BattleUpdatedEvent): Promise<void> {
    // 1. Extract subscription criteria from battle
    const criteria = this.extractSubscriptionCriteria(event.data);

    // 2. Find matching users
    const matchingUsers = await this.findMatchingUsers(criteria);

    // 3. Filter by preferences and send notifications
    for (const userId of matchingUsers) {
      await this.sendNotificationIfEligible(userId, event);
    }
  }

  private extractSubscriptionCriteria(battle: Battle): SubscriptionCriteria {
    return {
      allianceIds: [
        ...battle.statistics.teamA.topAlliances.map(a => a.allianceId),
        ...battle.statistics.teamB.topAlliances.map(a => a.allianceId)
      ],
      systemId: battle.primarySystem.id,
      regionId: battle.primaryRegion.id
    };
  }

  private async findMatchingUsers(criteria: SubscriptionCriteria): Promise<string[]> {
    const matchingUsers = new Set<string>();

    // Find users subscribed to any of the alliances
    for (const allianceId of criteria.allianceIds) {
      const users = await this.redis.keys(`subscriptions:*`);
      for (const key of users) {
        const subscriptions = await this.redis.hget(key, 'alliances');
        if (subscriptions) {
          const allianceIds = JSON.parse(subscriptions);
          if (allianceIds.includes(allianceId)) {
            const userId = key.split(':')[1];
            matchingUsers.add(userId);
          }
        }
      }
    }

    // Find users subscribed to the system
    const systemUsers = await this.findUsersSubscribedToSystem(criteria.systemId);
    systemUsers.forEach(userId => matchingUsers.add(userId));

    // Find users subscribed to the region
    const regionUsers = await this.findUsersSubscribedToRegion(criteria.regionId);
    regionUsers.forEach(userId => matchingUsers.add(userId));

    return Array.from(matchingUsers);
  }

  private async sendNotificationIfEligible(
    userId: string,
    event: BattleCreatedEvent | BattleUpdatedEvent
  ): Promise<void> {
    // 1. Get user preferences
    const preferences = await this.getUserPreferences(userId);

    // 2. Check if battle meets user thresholds
    if (event.data.totalIskDestroyed < preferences.minIskThreshold) {
      return;
    }

    if (event.data.totalPilots < preferences.minPilots) {
      return;
    }

    // 3. Check do-not-disturb
    if (this.isDoNotDisturb(preferences)) {
      return;
    }

    // 4. Check cooldown
    if (await this.isInCooldown(userId, event.data.battleId)) {
      return;
    }

    // 5. Send notification
    const ws = this.wsServer.connections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      // User is connected, send immediately
      ws.send(JSON.stringify({
        type: 'notification',
        data: {
          notificationId: uuid(),
          battleId: event.data.battleId,
          eventType: event.eventType,
          timestamp: new Date().toISOString(),
          battle: event.data
        }
      }));
    } else {
      // User is offline, queue notification
      await this.queueNotification(userId, event);
    }

    // 6. Set cooldown
    await this.setCooldown(userId, event.data.battleId, preferences.cooldownSeconds);
  }

  private async queueNotification(
    userId: string,
    event: BattleCreatedEvent | BattleUpdatedEvent
  ): Promise<void> {
    const notification = {
      notificationId: uuid(),
      battleId: event.data.battleId,
      eventType: event.eventType,
      timestamp: new Date().toISOString(),
      data: event.data
    };

    await this.redis.lpush(
      `notifications:pending:${userId}`,
      JSON.stringify(notification)
    );

    await this.redis.expire(`notifications:pending:${userId}`, 3600); // 1 hour
  }
}
```

---

## Operational Considerations

### Performance Targets

- **WebSocket Connection Capacity**: 10,000+ concurrent connections per replica
- **Notification Delivery Latency**: <100ms from event to WebSocket send
- **Message Throughput**: 1,000+ notifications/second per replica

### Resource Requirements

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 250m | 1000m |
| Memory | 512Mi | 2Gi |
| Storage | N/A | N/A |

**Redis**:
- Memory: 4GB (for connections + subscriptions + pending notifications)
- Persistence: RDB snapshots every 5 minutes

### Scaling

- **Horizontal**: 3-5 replicas for high availability
- **Session Affinity**: Required (sticky sessions) if using multiple replicas
- **Alternative**: Use Redis Pub/Sub to broadcast notifications across replicas

---

## Monitoring & Alerting

### Metrics

- `notification_ws_connections_active` - Active WebSocket connections
- `notification_messages_sent_total{type}` - Messages sent by type
- `notification_delivery_duration_seconds` - Notification delivery latency
- `notification_queue_depth` - Pending notifications per user
- `notification_matches_total` - Battle-subscription matches

### Alerts

- **High Connection Loss**: >10% connections dropped in 5 minutes
- **Delivery Lag**: >1 second delivery latency p95
- **Queue Buildup**: >100 pending notifications for any user
- **Redis Connection Loss**: Redis unavailable

---

## Testing Strategy

### Unit Tests
- Subscription matching logic
- Preference filtering
- Do-not-disturb logic
- Cooldown tracking

### Integration Tests
- WebSocket connection lifecycle
- Notification delivery
- Queue management
- Redis persistence

### End-to-End Tests
- Real user connection flow
- Battle event to notification delivery
- Reconnection with pending messages

---

## Dependencies

**Internal Services**:
- Redis (connections + subscriptions)
- Kafka/Redpanda

**Libraries**:
- Fastify (HTTP server)
- `ws` (WebSocket)
- KafkaJS (Event streaming)
- Zod (Validation)

---

## References

- [Domain Boundaries](../DOMAIN-BOUNDARIES.md#domain-5-notification)
- [WebSocket Best Practices](../../docs/architecture-v3/websocket-patterns.md)
