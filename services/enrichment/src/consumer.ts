import { EventBus, Topics, getEventBusConfigFromEnv } from '@battlescope/events';
import { createLogger } from '@battlescope/logger';
import type { Event, Killmail } from '@battlescope/types';
import { getEnricher } from './lib/enricher';
import { withSpan } from './lib/tracing';

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
    await withSpan(
      'kafka.consume.killmail',
      async (span) => {
        try {
          // Validate event type
          if (event.type !== 'killmail.received') {
            logger.warn(`Received unexpected event type: ${event.type}`);
            span.setAttribute('event.type', event.type);
            span.setAttribute('event.valid', false);
            return;
          }

          const killmail = event.data as Killmail;

          // Add tracing attributes for the killmail
          span.setAttribute('killmail.id', killmail.killmailId);
          span.setAttribute('killmail.system_id', killmail.solarSystemId);
          span.setAttribute('killmail.ship_type_id', killmail.victim.shipTypeId);
          span.setAttribute('killmail.attacker_count', killmail.attackers.length);
          span.setAttribute('event.type', event.type);

          logger.info(`Processing killmail ${killmail.killmailId}`);

          // Enrich the killmail (creates child span)
          const enriched = await this.enricher.enrichKillmail(killmail);

          // Publish enriched event (creates child span via auto-instrumentation)
          // Use killmailId as partition key for even distribution across partitions
          await this.eventBus.publish(
            Topics.KILLMAILS_ENRICHED,
            {
              type: 'killmail.enriched',
              data: {
                killmailId: killmail.killmailId,
                killmailHash: killmail.killmailHash,
                killmailTime: killmail.killmailTime,
                solarSystemId: killmail.solarSystemId,
                zkb: killmail.zkb,
                victim: {
                  ...killmail.victim,
                  shipTypeName: enriched.ship_type_name,
                  characterName: enriched.victim_character_name || undefined,
                  corporationName: enriched.victim_corp_name || undefined,
                  allianceName: enriched.victim_alliance_name || undefined,
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
              },
              timestamp: new Date(),
            }
          );

          span.setAttribute('enrichment.success', true);
          logger.info(`Successfully enriched and published killmail ${killmail.killmailId}`);
        } catch (error) {
          span.setAttribute('enrichment.success', false);
          logger.error('Failed to handle killmail event:', error);
          // Don't throw - we want to continue processing other killmails
        }
      },
      {
        'messaging.system': 'kafka',
        'messaging.destination': Topics.KILLMAILS,
        'messaging.operation': 'receive',
      }
    );
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
