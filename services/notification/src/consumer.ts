import { createConsumer } from '@battlescope/events';
import { createLogger } from '@battlescope/logger';
import { config } from './config';
import { SubscriptionsRepository, NotificationsRepository } from './database';
import { WebSocketManager } from './websocket';
import { WebhookDeliveryService } from './webhook-delivery';

const logger = createLogger('event-consumer');

export interface EventConsumerDependencies {
  subscriptionsRepo: SubscriptionsRepository;
  notificationsRepo: NotificationsRepository;
  wsManager: WebSocketManager;
  webhookService: WebhookDeliveryService;
}

export async function startEventConsumer(deps: EventConsumerDependencies) {
  const { subscriptionsRepo, notificationsRepo, wsManager, webhookService } = deps;

  const consumer = createConsumer({
    brokers: config.kafka.brokers,
    groupId: config.kafka.groupId,
    clientId: config.kafka.clientId,
  });

  await consumer.connect();

  // Subscribe to topics
  await consumer.subscribe({
    topics: ['battle.created', 'battle.ended', 'killmail.enriched'],
    fromBeginning: false,
  });

  logger.info('Event consumer started, listening for events...');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const value = message.value?.toString();
        if (!value) {
          logger.warn('Received empty message', { topic, partition });
          return;
        }

        const event = JSON.parse(value);
        logger.debug('Processing event', { topic, eventType: event.type });

        // Process different event types
        switch (topic) {
          case 'battle.created':
            await handleBattleCreated(event, deps);
            break;
          case 'battle.ended':
            await handleBattleEnded(event, deps);
            break;
          case 'killmail.enriched':
            await handleKillmailEnriched(event, deps);
            break;
          default:
            logger.warn('Unknown topic', { topic });
        }
      } catch (error) {
        logger.error('Error processing event', { error, topic, partition });
      }
    },
  });

  return consumer;
}

// Handle battle.created events
async function handleBattleCreated(event: any, deps: EventConsumerDependencies) {
  const { subscriptionsRepo, notificationsRepo, wsManager, webhookService } = deps;
  const battleData = event.data;

  logger.info('Processing battle.created event', { battleId: battleData.id });

  // Find subscriptions for this system
  const systemSubscriptions = await subscriptionsRepo.findActiveByType(
    'system',
    battleData.systemId
  );

  // Find subscriptions for this region
  const regionSubscriptions = await subscriptionsRepo.findActiveByType(
    'region',
    battleData.regionId
  );

  const allSubscriptions = [...systemSubscriptions, ...regionSubscriptions];

  // Send notifications to all matching subscriptions
  for (const subscription of allSubscriptions) {
    await sendNotification({
      subscription,
      eventType: 'battle.created',
      eventData: battleData,
      deps,
    });
  }
}

// Handle battle.ended events
async function handleBattleEnded(event: any, deps: EventConsumerDependencies) {
  const { subscriptionsRepo, notificationsRepo, wsManager, webhookService } = deps;
  const battleData = event.data;

  logger.info('Processing battle.ended event', { battleId: battleData.id });

  // Find subscriptions for this system
  const systemSubscriptions = await subscriptionsRepo.findActiveByType(
    'system',
    battleData.systemId
  );

  // Find subscriptions for this region
  const regionSubscriptions = await subscriptionsRepo.findActiveByType(
    'region',
    battleData.regionId
  );

  const allSubscriptions = [...systemSubscriptions, ...regionSubscriptions];

  // Send notifications to all matching subscriptions
  for (const subscription of allSubscriptions) {
    await sendNotification({
      subscription,
      eventType: 'battle.ended',
      eventData: battleData,
      deps,
    });
  }
}

// Handle killmail.enriched events
async function handleKillmailEnriched(event: any, deps: EventConsumerDependencies) {
  const { subscriptionsRepo, notificationsRepo, wsManager, webhookService } = deps;
  const killmailData = event.data;

  logger.debug('Processing killmail.enriched event', {
    killmailId: killmailData.killmailId,
  });

  // Find subscriptions for victim
  const victimSubscriptions: any[] = [];
  if (killmailData.victim?.characterId) {
    const charSubs = await subscriptionsRepo.findActiveByType(
      'character',
      killmailData.victim.characterId
    );
    victimSubscriptions.push(...charSubs);
  }

  if (killmailData.victim?.corporationId) {
    const corpSubs = await subscriptionsRepo.findActiveByType(
      'corporation',
      killmailData.victim.corporationId
    );
    victimSubscriptions.push(...corpSubs);
  }

  if (killmailData.victim?.allianceId) {
    const allianceSubs = await subscriptionsRepo.findActiveByType(
      'alliance',
      killmailData.victim.allianceId
    );
    victimSubscriptions.push(...allianceSubs);
  }

  // Find subscriptions for attackers
  const attackerSubscriptions: any[] = [];
  for (const attacker of killmailData.attackers || []) {
    if (attacker.characterId) {
      const charSubs = await subscriptionsRepo.findActiveByType(
        'character',
        attacker.characterId
      );
      attackerSubscriptions.push(...charSubs);
    }

    if (attacker.corporationId) {
      const corpSubs = await subscriptionsRepo.findActiveByType(
        'corporation',
        attacker.corporationId
      );
      attackerSubscriptions.push(...corpSubs);
    }

    if (attacker.allianceId) {
      const allianceSubs = await subscriptionsRepo.findActiveByType(
        'alliance',
        attacker.allianceId
      );
      attackerSubscriptions.push(...allianceSubs);
    }
  }

  // Find subscriptions for system
  const systemSubscriptions = await subscriptionsRepo.findActiveByType(
    'system',
    killmailData.solarSystemId
  );

  const allSubscriptions = [
    ...victimSubscriptions,
    ...attackerSubscriptions,
    ...systemSubscriptions,
  ];

  // Deduplicate subscriptions
  const uniqueSubscriptions = Array.from(
    new Map(allSubscriptions.map((sub) => [sub.id, sub])).values()
  );

  // Send notifications to all matching subscriptions
  for (const subscription of uniqueSubscriptions) {
    await sendNotification({
      subscription,
      eventType: 'killmail.enriched',
      eventData: killmailData,
      deps,
    });
  }
}

// Send notification via configured channels
async function sendNotification({
  subscription,
  eventType,
  eventData,
  deps,
}: {
  subscription: any;
  eventType: string;
  eventData: any;
  deps: EventConsumerDependencies;
}) {
  const { notificationsRepo, wsManager, webhookService } = deps;

  for (const channel of subscription.notification_channels) {
    try {
      // Create notification record
      const notification = await notificationsRepo.create({
        user_id: subscription.user_id,
        subscription_id: subscription.id,
        event_type: eventType,
        event_data: eventData,
        notification_channel: channel,
      });

      // Send via appropriate channel
      if (channel === 'websocket') {
        await wsManager.sendToUser(subscription.user_id, {
          id: notification.id,
          type: eventType,
          data: eventData,
          timestamp: notification.sent_at,
        });
        logger.debug('Sent WebSocket notification', {
          userId: subscription.user_id,
          notificationId: notification.id,
        });
      } else if (channel === 'webhook' && subscription.webhook_url) {
        await webhookService.enqueue({
          notificationId: notification.id,
          subscriptionId: subscription.id,
          webhookUrl: subscription.webhook_url,
          payload: {
            id: notification.id,
            type: eventType,
            data: eventData,
            timestamp: notification.sent_at,
          },
        });
        logger.debug('Queued webhook delivery', {
          userId: subscription.user_id,
          notificationId: notification.id,
          webhookUrl: subscription.webhook_url,
        });
      }
    } catch (error) {
      logger.error('Error sending notification', {
        error,
        subscriptionId: subscription.id,
        channel,
      });
    }
  }
}
