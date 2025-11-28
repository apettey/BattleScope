import { Kafka } from 'kafkajs';
import { createLogger } from '@battlescope/logger';
import { config } from './config';
import { SubscriptionsRepository, NotificationsRepository } from './database';
import { WebSocketManager } from './websocket';
import { WebhookDeliveryService } from './webhook-delivery';

const logger = createLogger({ serviceName: 'notification-consumer' });

export interface EventConsumerDependencies {
  subscriptionsRepo: SubscriptionsRepository;
  notificationsRepo: NotificationsRepository;
  wsManager: WebSocketManager;
  webhookService: WebhookDeliveryService;
}

export async function startEventConsumer(deps: EventConsumerDependencies) {
  const { subscriptionsRepo, notificationsRepo, wsManager, webhookService } = deps;

  const kafka = new Kafka({
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
  });

  const consumer = kafka.consumer({ groupId: config.kafka.groupId });
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
          logger.warn({ topic, partition }, 'Received empty message');
          return;
        }

        const event = JSON.parse(value);
        logger.debug({ topic, eventType: event.type }, 'Processing event');

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
            logger.warn({ topic }, 'Unknown topic');
        }
      } catch (error) {
        logger.error({ error, topic, partition }, 'Error processing event');
      }
    },
  });

  return consumer;
}

// Handle battle.created events
async function handleBattleCreated(event: any, deps: EventConsumerDependencies) {
  const { subscriptionsRepo, notificationsRepo, wsManager, webhookService } = deps;
  const battleData = event.data;

  logger.info({ battleId: battleData.id }, 'Processing battle.created event');

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

  logger.info({ battleId: battleData.id }, 'Processing battle.ended event');

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

  logger.debug({ killmailId: killmailData.killmailId }, 'Processing killmail.enriched event');

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
        logger.debug({ userId: subscription.user_id, notificationId: notification.id }, 'Sent WebSocket notification');
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
        logger.debug({ userId: subscription.user_id, notificationId: notification.id, webhookUrl: subscription.webhook_url }, 'Queued webhook delivery');
      }
    } catch (error) {
      logger.error({ error, subscriptionId: subscription.id, channel }, 'Error sending notification');
    }
  }
}
