import { EventBus, Topics, getEventBusConfigFromEnv } from '@battlescope/events';
import { createLogger } from '@battlescope/logger';
import type { Event, Killmail } from '@battlescope/types';
import type { Kysely } from 'kysely';
import type { Database } from '../database/schema';

const logger = createLogger({ serviceName: 'enriched-killmail-consumer' });

export class EnrichedKillmailConsumer {
  private eventBus: EventBus;
  private isRunning = false;

  constructor(private db: Kysely<Database>) {
    const config = getEventBusConfigFromEnv();
    this.eventBus = new EventBus(config);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Consumer is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting enriched killmail consumer...');

    try {
      await this.eventBus.subscribe(
        Topics.KILLMAILS_ENRICHED,
        'ingestion-service',
        async (event: Event) => {
          await this.handleEnrichedKillmailEvent(event);
        }
      );

      logger.info('Enriched killmail consumer started successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to start consumer');
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping enriched killmail consumer...');
    await this.eventBus.disconnect();
    this.isRunning = false;
    logger.info('Enriched killmail consumer stopped');
  }

  private async handleEnrichedKillmailEvent(event: Event): Promise<void> {
    try {
      // Validate event type
      if (event.type !== 'killmail.enriched') {
        logger.warn({ eventType: event.type }, 'Received unexpected event type');
        return;
      }

      const killmail = event.data as Killmail;
      logger.info({ killmailId: killmail.killmailId }, 'Processing enriched killmail');

      // Extract attacker alliance IDs
      const attackerAllianceIds = killmail.attackers
        .map((a) => a.allianceId)
        .filter((id): id is number => id !== undefined);

      // Update the killmail in the database with enriched data
      const result = await this.db
        .updateTable('killmail_events')
        .set({
          system_id: killmail.solarSystemId,
          occurred_at: killmail.killmailTime,
          victim_alliance_id: killmail.victim.allianceId || null,
          attacker_alliance_ids: attackerAllianceIds.length > 0 ? attackerAllianceIds : null,
          isk_value: killmail.zkb?.totalValue || null,
          raw_data: JSON.stringify(killmail),
          processed_at: new Date(),
        })
        .where('killmail_id', '=', killmail.killmailId)
        .executeTakeFirst();

      if (result.numUpdatedRows === 0n) {
        logger.warn(
          { killmailId: killmail.killmailId },
          'Killmail not found in database - it may not have been ingested yet'
        );
        return;
      }

      logger.info(
        { killmailId: killmail.killmailId, systemId: killmail.solarSystemId },
        'Successfully updated killmail with enriched data'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to handle enriched killmail event');
      // Don't throw - we want to continue processing other killmails
    }
  }
}

// Singleton instance
let consumer: EnrichedKillmailConsumer | null = null;

export function getEnrichedKillmailConsumer(
  db: Kysely<Database>
): EnrichedKillmailConsumer {
  if (!consumer) {
    consumer = new EnrichedKillmailConsumer(db);
  }
  return consumer;
}
