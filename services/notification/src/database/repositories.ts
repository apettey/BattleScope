import { getDatabase } from './client';
import {
  UserSubscription,
  NewUserSubscription,
  UserSubscriptionUpdate,
  NotificationHistory,
  NewNotificationHistory,
  NotificationHistoryUpdate,
  WebhookDelivery,
  NewWebhookDelivery,
  WebhookDeliveryUpdate,
} from './types';

// User Subscriptions Repository
export class SubscriptionsRepository {
  async findByUserId(userId: string): Promise<UserSubscription[]> {
    const db = getDatabase();
    return db
      .selectFrom('user_subscriptions')
      .selectAll()
      .where('user_id', '=', userId)
      .where('is_active', '=', true)
      .orderBy('created_at', 'desc')
      .execute();
  }

  async findById(id: string): Promise<UserSubscription | undefined> {
    const db = getDatabase();
    return db
      .selectFrom('user_subscriptions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findActiveByType(
    type: string,
    filterValue?: number
  ): Promise<UserSubscription[]> {
    const db = getDatabase();
    let query = db
      .selectFrom('user_subscriptions')
      .selectAll()
      .where('subscription_type', '=', type)
      .where('is_active', '=', true);

    if (filterValue !== undefined) {
      query = query.where('filter_value', '=', filterValue);
    }

    return query.execute();
  }

  async create(subscription: NewUserSubscription): Promise<UserSubscription> {
    const db = getDatabase();
    return db
      .insertInto('user_subscriptions')
      .values(subscription)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(
    id: string,
    subscription: UserSubscriptionUpdate
  ): Promise<UserSubscription> {
    const db = getDatabase();
    return db
      .updateTable('user_subscriptions')
      .set({ ...subscription, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async delete(id: string): Promise<void> {
    const db = getDatabase();
    await db
      .deleteFrom('user_subscriptions')
      .where('id', '=', id)
      .execute();
  }
}

// Notification History Repository
export class NotificationsRepository {
  async findByUserId(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<NotificationHistory[]> {
    const db = getDatabase();
    return db
      .selectFrom('notification_history')
      .selectAll()
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .orderBy('sent_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();
  }

  async countByUserId(userId: string): Promise<number> {
    const db = getDatabase();
    const result = await db
      .selectFrom('notification_history')
      .select(db.fn.count<number>('id').as('count'))
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(result?.count || 0);
  }

  async countUnreadByUserId(userId: string): Promise<number> {
    const db = getDatabase();
    const result = await db
      .selectFrom('notification_history')
      .select(db.fn.count<number>('id').as('count'))
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(result?.count || 0);
  }

  async findById(id: string): Promise<NotificationHistory | undefined> {
    const db = getDatabase();
    return db
      .selectFrom('notification_history')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async create(notification: NewNotificationHistory): Promise<NotificationHistory> {
    const db = getDatabase();
    return db
      .insertInto('notification_history')
      .values(notification)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async markAsRead(id: string): Promise<NotificationHistory> {
    const db = getDatabase();
    return db
      .updateTable('notification_history')
      .set({ read_at: new Date() })
      .where('id', '=', id)
      .where('read_at', 'is', null)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async markAllAsRead(userId: string): Promise<number> {
    const db = getDatabase();
    const result = await db
      .updateTable('notification_history')
      .set({ read_at: new Date() })
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows || 0);
  }

  async softDelete(id: string): Promise<void> {
    const db = getDatabase();
    await db
      .updateTable('notification_history')
      .set({ deleted_at: new Date() })
      .where('id', '=', id)
      .execute();
  }
}

// Webhook Deliveries Repository
export class WebhookDeliveriesRepository {
  async findPendingRetries(): Promise<WebhookDelivery[]> {
    const db = getDatabase();
    return db
      .selectFrom('webhook_deliveries')
      .selectAll()
      .where('status', '=', 'retrying')
      .where('next_retry_at', '<=', new Date())
      .where('attempt_count', '<', db.fn('max_attempts', []))
      .execute();
  }

  async findById(id: string): Promise<WebhookDelivery | undefined> {
    const db = getDatabase();
    return db
      .selectFrom('webhook_deliveries')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async create(delivery: NewWebhookDelivery): Promise<WebhookDelivery> {
    const db = getDatabase();
    return db
      .insertInto('webhook_deliveries')
      .values(delivery)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: string, delivery: WebhookDeliveryUpdate): Promise<WebhookDelivery> {
    const db = getDatabase();
    return db
      .updateTable('webhook_deliveries')
      .set(delivery)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async markSuccess(id: string, httpStatusCode: number): Promise<void> {
    const db = getDatabase();
    await db
      .updateTable('webhook_deliveries')
      .set({
        status: 'success',
        success_at: new Date(),
        last_attempt_at: new Date(),
        http_status_code: httpStatusCode,
      })
      .where('id', '=', id)
      .execute();
  }

  async markFailed(id: string, errorMessage: string, httpStatusCode?: number): Promise<void> {
    const db = getDatabase();
    await db
      .updateTable('webhook_deliveries')
      .set({
        status: 'failed',
        failed_at: new Date(),
        last_attempt_at: new Date(),
        error_message: errorMessage,
        http_status_code: httpStatusCode,
      })
      .where('id', '=', id)
      .execute();
  }

  async incrementAttempt(
    id: string,
    nextRetryAt: Date,
    errorMessage: string,
    httpStatusCode?: number
  ): Promise<void> {
    const db = getDatabase();
    await db
      .updateTable('webhook_deliveries')
      .set({
        attempt_count: db.fn('attempt_count', []).plus(1),
        status: 'retrying',
        last_attempt_at: new Date(),
        next_retry_at: nextRetryAt,
        error_message: errorMessage,
        http_status_code: httpStatusCode,
      })
      .where('id', '=', id)
      .execute();
  }
}
