import { EventBus, Topics, getEventBusConfigFromEnv } from '@battlescope/events';
import { createLogger } from '@battlescope/logger';
import type { Event, Killmail } from '@battlescope/types';
import { getEnricher } from './lib/enricher';

const logger = createLogger({ serviceName: 'enrichment-consumer' });

export class KillmailConsumer {
  private eventBus: EventBus;
  private enricher = getEnricher();
  private isRunning = false;

  constructor() {
    const config = getEventBusConfigFromEnv();
    this.eventBus = new EventBus(config);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Consumer is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting killmail consumer...');

    try {
      await this.eventBus.subscribe(
        Topics.KILLMAILS,
        'enrichment-service',
        async (event: Event) => {
          await this.handleKillmailEvent(event);
        }
      );

      logger.info('Killmail consumer started successfully');
    } catch (error) {
      logger.error('Failed to start consumer:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping killmail consumer...');
    await this.eventBus.disconnect();
    this.isRunning = false;
    logger.info('Killmail consumer stopped');
  }

  private async handleKillmailEvent(event: Event): Promise<void> {
    try {
      // Validate event type
      if (event.type !== 'killmail.received') {
        logger.warn(`Received unexpected event type: ${event.type}`);
        return;
      }

      const killmail = event.data as Killmail;
      logger.info(`Processing killmail ${killmail.killmailId}`);

      // Enrich the killmail
      const enriched = await this.enricher.enrichKillmail(killmail);

      // Publish enriched event
      await this.eventBus.publish(Topics.KILLMAILS_ENRICHED, {
        type: 'killmail.enriched',
        data: {
          ...killmail,
          // Add enriched fields
          victim: {
            ...killmail.victim,
            shipTypeName: enriched.ship_type_name,
            characterName: enriched.victim_character_name,
            corporationName: enriched.victim_corp_name,
            allianceName: enriched.victim_alliance_name,
          },
          attackers: enriched.attacker_data.map((attacker) => ({
            characterId: attacker.characterId,
            characterName: attacker.characterName,
            corporationId: attacker.corporationId,
            corporationName: attacker.corporationName,
            allianceId: attacker.allianceId,
            allianceName: attacker.allianceName,
            shipTypeId: attacker.shipTypeId,
            shipTypeName: attacker.shipTypeName,
            weaponTypeId: attacker.weaponTypeId,
            weaponTypeName: attacker.weaponTypeName,
            damageDone: attacker.damageDone,
            finalBlow: attacker.finalBlow,
          })),
          // Add location data
          system: {
            systemId: enriched.system_id,
            systemName: enriched.system_name,
            regionId: enriched.region_id,
            regionName: enriched.region_name,
            securityStatus: enriched.security_status,
          },
          // Add ship data
          ship: {
            shipTypeId: enriched.ship_type_id,
            shipTypeName: enriched.ship_type_name,
            shipGroupName: enriched.ship_group_name,
          },
        },
        timestamp: new Date(),
      });

      logger.info(`Successfully enriched and published killmail ${killmail.killmailId}`);
    } catch (error) {
      logger.error('Failed to handle killmail event:', error);
      // Don't throw - we want to continue processing other killmails
    }
  }
}

// Singleton instance
let consumer: KillmailConsumer | null = null;

export function getConsumer(): KillmailConsumer {
  if (!consumer) {
    consumer = new KillmailConsumer();
  }
  return consumer;
}
