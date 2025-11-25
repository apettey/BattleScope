-- BattleScope Notification Service - Initial Schema
-- Creates tables for user subscriptions and notification history

-- User subscriptions table
-- Stores user notification preferences and subscription filters
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subscription_type TEXT NOT NULL, -- 'character', 'corporation', 'alliance', 'system', 'region'
  filter_value BIGINT, -- Character ID, Corp ID, Alliance ID, System ID, etc.
  notification_channels TEXT[] NOT NULL DEFAULT ARRAY['websocket']::TEXT[], -- 'websocket', 'webhook', 'email'
  webhook_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_type ON user_subscriptions(subscription_type);
CREATE INDEX idx_user_subscriptions_filter_value ON user_subscriptions(filter_value) WHERE filter_value IS NOT NULL;
CREATE INDEX idx_user_subscriptions_active ON user_subscriptions(is_active) WHERE is_active = TRUE;

-- Notification history table
-- Tracks all notifications sent to users
CREATE TABLE notification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- 'battle.created', 'battle.ended', 'killmail.enriched'
  event_data JSONB NOT NULL,
  notification_channel TEXT NOT NULL, -- Which channel was used
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

-- Indexes for notification history
CREATE INDEX idx_notification_history_user_id ON notification_history(user_id);
CREATE INDEX idx_notification_history_subscription_id ON notification_history(subscription_id);
CREATE INDEX idx_notification_history_sent_at ON notification_history(sent_at DESC);
CREATE INDEX idx_notification_history_read_at ON notification_history(read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notification_history_deleted_at ON notification_history(deleted_at) WHERE deleted_at IS NULL;

-- Webhook delivery tracking table
-- Tracks webhook delivery attempts and status
CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notification_history(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  webhook_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  status TEXT NOT NULL, -- 'pending', 'success', 'failed', 'retrying'
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  success_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  http_status_code INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for webhook deliveries
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at) WHERE status = 'retrying';
CREATE INDEX idx_webhook_deliveries_notification_id ON webhook_deliveries(notification_id);

-- Schema migrations tracking
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('001_init');
