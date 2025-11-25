import axios, { AxiosError } from 'axios';
import { createLogger } from '@battlescope/logger';
import { config } from './config';
import { WebhookDeliveriesRepository } from './database';

const logger = createLogger('webhook-delivery');

export interface WebhookPayload {
  notificationId: string;
  subscriptionId: string;
  webhookUrl: string;
  payload: any;
}

export class WebhookDeliveryService {
  private webhookRepo: WebhookDeliveriesRepository;
  private retryInterval: NodeJS.Timeout | null = null;

  constructor(webhookRepo: WebhookDeliveriesRepository) {
    this.webhookRepo = webhookRepo;
  }

  // Enqueue a webhook for delivery
  async enqueue(webhook: WebhookPayload): Promise<void> {
    try {
      // Create webhook delivery record
      const delivery = await this.webhookRepo.create({
        notification_id: webhook.notificationId,
        subscription_id: webhook.subscriptionId,
        webhook_url: webhook.webhookUrl,
        payload: webhook.payload,
        attempt_count: 0,
        max_attempts: config.webhook.maxRetries,
        status: 'pending',
      });

      // Attempt immediate delivery
      await this.deliver(delivery.id);
    } catch (error) {
      logger.error('Error enqueueing webhook', { error, webhook });
    }
  }

  // Deliver a webhook
  async deliver(deliveryId: string): Promise<void> {
    try {
      const delivery = await this.webhookRepo.findById(deliveryId);

      if (!delivery) {
        logger.warn('Webhook delivery not found', { deliveryId });
        return;
      }

      if (delivery.status === 'success') {
        logger.debug('Webhook already delivered', { deliveryId });
        return;
      }

      if (delivery.attempt_count >= delivery.max_attempts) {
        logger.warn('Webhook max attempts reached', {
          deliveryId,
          attempts: delivery.attempt_count,
        });
        await this.webhookRepo.markFailed(
          deliveryId,
          'Max delivery attempts reached'
        );
        return;
      }

      logger.info('Attempting webhook delivery', {
        deliveryId,
        attempt: delivery.attempt_count + 1,
        maxAttempts: delivery.max_attempts,
        url: delivery.webhook_url,
      });

      try {
        // Attempt HTTP POST to webhook URL
        const response = await axios.post(delivery.webhook_url, delivery.payload, {
          timeout: config.webhook.timeoutMs,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'BattleScope-Webhook/1.0',
            'X-BattleScope-Delivery-Id': deliveryId,
            'X-BattleScope-Event-Type': delivery.payload.type,
          },
        });

        // Success
        logger.info('Webhook delivered successfully', {
          deliveryId,
          statusCode: response.status,
          url: delivery.webhook_url,
        });

        await this.webhookRepo.markSuccess(deliveryId, response.status);
      } catch (error) {
        const axiosError = error as AxiosError;
        const statusCode = axiosError.response?.status;
        const errorMessage = axiosError.message || 'Unknown error';

        logger.warn('Webhook delivery failed', {
          deliveryId,
          error: errorMessage,
          statusCode,
          attempt: delivery.attempt_count + 1,
          url: delivery.webhook_url,
        });

        // Check if we should retry
        if (delivery.attempt_count + 1 < delivery.max_attempts) {
          // Calculate next retry time with exponential backoff
          const retryDelayMs =
            config.webhook.retryDelayMs * Math.pow(2, delivery.attempt_count);
          const nextRetryAt = new Date(Date.now() + retryDelayMs);

          await this.webhookRepo.incrementAttempt(
            deliveryId,
            nextRetryAt,
            errorMessage,
            statusCode
          );

          logger.info('Webhook retry scheduled', {
            deliveryId,
            nextRetryAt,
            delayMs: retryDelayMs,
          });
        } else {
          // Max attempts reached
          await this.webhookRepo.markFailed(deliveryId, errorMessage, statusCode);

          logger.error('Webhook delivery failed permanently', {
            deliveryId,
            attempts: delivery.attempt_count + 1,
            url: delivery.webhook_url,
          });
        }
      }
    } catch (error) {
      logger.error('Error in webhook delivery', { error, deliveryId });
    }
  }

  // Start retry processor
  startRetryProcessor(): void {
    if (this.retryInterval) {
      logger.warn('Retry processor already running');
      return;
    }

    logger.info('Starting webhook retry processor');

    // Check for pending retries every 10 seconds
    this.retryInterval = setInterval(async () => {
      try {
        const pendingRetries = await this.webhookRepo.findPendingRetries();

        if (pendingRetries.length > 0) {
          logger.info('Processing pending webhook retries', {
            count: pendingRetries.length,
          });

          for (const delivery of pendingRetries) {
            await this.deliver(delivery.id);
          }
        }
      } catch (error) {
        logger.error('Error in retry processor', { error });
      }
    }, 10000); // 10 seconds
  }

  // Stop retry processor
  stopRetryProcessor(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
      logger.info('Webhook retry processor stopped');
    }
  }
}
