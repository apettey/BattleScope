# BattleScope Notification Service

Real-time notification service with WebSocket support, webhook delivery, and user subscriptions.

## Features

- **User Subscriptions**: Subscribe to characters, corporations, alliances, systems, or regions
- **WebSocket Notifications**: Real-time notifications via Socket.io
- **Webhook Delivery**: HTTP POST webhooks with retry logic and exponential backoff
- **Event Processing**: Consumes battle and killmail events from Kafka/Redpanda
- **Notification History**: Track all sent notifications with read/unread status
- **Multi-Channel**: Support for WebSocket, webhook, and email (future) channels

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Notification Service                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   REST API   │    │  WebSocket   │    │   Consumer   │  │
│  │              │    │   (Socket.io)│    │   (Kafka)    │  │
│  │ - Notifs     │    │              │    │              │  │
│  │ - Subs       │    │ - Auth       │    │ - Battles    │  │
│  │              │    │ - Rooms      │    │ - Killmails  │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                    │          │
│         └───────────────────┼────────────────────┘          │
│                             │                               │
│                     ┌───────▼────────┐                      │
│                     │   Repositories  │                      │
│                     │  - Subscriptions│                      │
│                     │  - Notifications│                      │
│                     │  - Webhooks     │                      │
│                     └───────┬────────┘                      │
│                             │                               │
└─────────────────────────────┼───────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │    PostgreSQL      │
                    │  (notifications DB)│
                    └────────────────────┘
```

## Database Schema

### user_subscriptions
- `id`: UUID primary key
- `user_id`: UUID (references auth service)
- `subscription_type`: Enum (character, corporation, alliance, system, region)
- `filter_value`: BIGINT (entity ID to filter on)
- `notification_channels`: TEXT[] (websocket, webhook, email)
- `webhook_url`: TEXT (optional)
- `is_active`: BOOLEAN

### notification_history
- `id`: UUID primary key
- `user_id`: UUID
- `subscription_id`: UUID (references user_subscriptions)
- `event_type`: TEXT (battle.created, battle.ended, killmail.enriched)
- `event_data`: JSONB
- `notification_channel`: TEXT
- `sent_at`: TIMESTAMPTZ
- `read_at`: TIMESTAMPTZ (nullable)
- `deleted_at`: TIMESTAMPTZ (nullable)

### webhook_deliveries
- `id`: UUID primary key
- `notification_id`: UUID (references notification_history)
- `subscription_id`: UUID (references user_subscriptions)
- `webhook_url`: TEXT
- `payload`: JSONB
- `attempt_count`: INT
- `max_attempts`: INT
- `status`: Enum (pending, success, failed, retrying)
- `last_attempt_at`: TIMESTAMPTZ
- `next_retry_at`: TIMESTAMPTZ
- `error_message`: TEXT

## API Endpoints

### Notifications

- `GET /api/notifications` - Get user's notifications (paginated)
  - Query params: `limit` (default: 50), `offset` (default: 0)
  - Returns: notifications, pagination, unreadCount

- `POST /api/notifications/:id/read` - Mark notification as read

- `POST /api/notifications/read-all` - Mark all notifications as read

- `DELETE /api/notifications/:id` - Delete notification (soft delete)

### Subscriptions

- `GET /api/subscriptions` - Get user's subscriptions

- `POST /api/subscriptions` - Create subscription
  ```json
  {
    "subscription_type": "character",
    "filter_value": 123456789,
    "notification_channels": ["websocket", "webhook"],
    "webhook_url": "https://example.com/webhook"
  }
  ```

- `PUT /api/subscriptions/:id` - Update subscription

- `DELETE /api/subscriptions/:id` - Delete subscription

### WebSocket

Connect to `/socket.io` and authenticate:

```javascript
const socket = io('http://localhost:3005');

// Authenticate
socket.emit('authenticate', { userId: 'user-uuid' });

// Listen for authentication success
socket.on('authenticated', (data) => {
  console.log('Authenticated:', data);
});

// Listen for notifications
socket.on('notification', (notification) => {
  console.log('Received notification:', notification);
});
```

## Event Consumption

The service consumes the following Kafka/Redpanda topics:

- `battle.created` - New battle detected
- `battle.ended` - Battle concluded
- `killmail.enriched` - Enriched killmail data

## Webhook Delivery

Webhooks are delivered via HTTP POST with:

- **Retry Logic**: 3 attempts with exponential backoff
- **Timeout**: 5 seconds per attempt
- **Headers**:
  - `Content-Type: application/json`
  - `User-Agent: BattleScope-Webhook/1.0`
  - `X-BattleScope-Delivery-Id: <uuid>`
  - `X-BattleScope-Event-Type: <event-type>`

Payload format:
```json
{
  "id": "notification-uuid",
  "type": "battle.created",
  "data": { ... },
  "timestamp": "2025-11-25T12:00:00.000Z"
}
```

## Development

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Kafka/Redpanda

### Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Run migrations:
   ```bash
   npm run migrate
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

## Production

### Docker

Build and run:
```bash
docker build -t battlescope-notification:latest .
docker run -p 3005:3005 --env-file .env battlescope-notification:latest
```

### Kubernetes

Deploy with:
```bash
kubectl apply -f k8s/notification-deployment.yaml
```

## Environment Variables

See `.env.example` for all configuration options.

Key variables:
- `PORT`: HTTP server port (default: 3005)
- `DATABASE_*`: PostgreSQL connection settings
- `REDIS_*`: Redis connection settings
- `KAFKA_*`: Kafka/Redpanda connection settings
- `WEBHOOK_*`: Webhook delivery settings

## Monitoring

### Health Check

```bash
curl http://localhost:3005/health
```

### Metrics

The service logs stats every minute:
- WebSocket connections count
- Connected users count

## License

Proprietary - BattleScope V3
