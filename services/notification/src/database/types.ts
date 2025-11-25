import { Generated, Insertable, Selectable, Updateable } from 'kysely';

// User Subscriptions table
export interface UserSubscriptionsTable {
  id: Generated<string>;
  user_id: string;
  subscription_type: 'character' | 'corporation' | 'alliance' | 'system' | 'region';
  filter_value: number | null;
  notification_channels: string[];
  webhook_url: string | null;
  is_active: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// Notification History table
export interface NotificationHistoryTable {
  id: Generated<string>;
  user_id: string;
  subscription_id: string | null;
  event_type: string;
  event_data: any; // JSONB
  notification_channel: string;
  sent_at: Generated<Date>;
  read_at: Date | null;
  deleted_at: Date | null;
}

// Webhook Deliveries table
export interface WebhookDeliveriesTable {
  id: Generated<string>;
  notification_id: string;
  subscription_id: string;
  webhook_url: string;
  payload: any; // JSONB
  attempt_count: number;
  max_attempts: number;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  last_attempt_at: Date | null;
  next_retry_at: Date | null;
  success_at: Date | null;
  failed_at: Date | null;
  error_message: string | null;
  http_status_code: number | null;
  created_at: Generated<Date>;
}

// Schema Migrations table
export interface SchemaMigrationsTable {
  version: string;
  applied_at: Generated<Date>;
}

// Database interface
export interface Database {
  user_subscriptions: UserSubscriptionsTable;
  notification_history: NotificationHistoryTable;
  webhook_deliveries: WebhookDeliveriesTable;
  schema_migrations: SchemaMigrationsTable;
}

// Type helpers
export type UserSubscription = Selectable<UserSubscriptionsTable>;
export type NewUserSubscription = Insertable<UserSubscriptionsTable>;
export type UserSubscriptionUpdate = Updateable<UserSubscriptionsTable>;

export type NotificationHistory = Selectable<NotificationHistoryTable>;
export type NewNotificationHistory = Insertable<NotificationHistoryTable>;
export type NotificationHistoryUpdate = Updateable<NotificationHistoryTable>;

export type WebhookDelivery = Selectable<WebhookDeliveriesTable>;
export type NewWebhookDelivery = Insertable<WebhookDeliveriesTable>;
export type WebhookDeliveryUpdate = Updateable<WebhookDeliveriesTable>;
