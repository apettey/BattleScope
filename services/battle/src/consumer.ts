import { EventBus, Topics } from '@battlescope/events';
import { createLogger } from '@battlescope/logger';
import { BattleClusterer } from './lib/clusterer';
import type { DB } from './database/types';

const logger = createLogger({ serviceName: 'battle-consumer' });

interface EnrichedKillmailEvent {
  type: 'killmail.enriched';
  data: {
    killmailId: number;
    killmailHash: string;
    killmailTime: string | Date;
    solarSystemId: number;
    systemName: string;
    regionName: string;
    securityStatus: number;
    victim: {
      characterId?: number;
      characterName?: string;
      corporationId: number;
      corporationName?: string;
      allianceId?: number;
      allianceName?: string;
      shipTypeId: number;
      shipTypeName?: string;
      damageTaken: number;
    };
    attackers: Array<{
      characterId?: number;
      characterName?: string;
      corporationId?: number;
      corporationName?: string;
      allianceId?: number;
      allianceName?: string;
      shipTypeId?: number;
      shipTypeName?: string;
      damageDone: number;
      finalBlow: boolean;
    }>;
    zkb?: {
      totalValue: number;
      points: number;
      npc: boolean;
      solo: boolean;
      awox: boolean;
    };
  };
  timestamp: string | Date;
}

export class KillmailConsumer {
  private eventBus: EventBus;
  private clusterer: BattleClusterer;
  private isRunning = false;

  constructor(eventBus: EventBus, db: DB) {
    this.eventBus = eventBus;
    this.clusterer = new BattleClusterer(db);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Consumer already running');
      return;
    }

    await this.clusterer.initialize();
    this.isRunning = true;

    logger.info('Starting killmail consumer...');

    // Subscribe to killmail.enriched events
    await this.eventBus.subscribe(
      Topics.KILLMAILS_ENRICHED,
      'battle-clusterer',
      async (event) => {
        try {
          if (!event || event.type !== 'killmail.enriched') {
            logger.warn('Received invalid event format');
            return;
          }

          // Convert date strings to Date objects
          const killmail = {
            ...event.data,
            killmailTime: new Date(event.data.killmailTime),
          };

          logger.info(`Processing killmail ${killmail.killmailId} in ${killmail.systemName}`);

          await this.clusterer.processKillmail(killmail);
        } catch (error) {
          logger.error({ error }, 'Error processing killmail');
        }
      }
    );

    // Start periodic check for inactive battles (every 5 minutes)
    setInterval(async () => {
      try {
        await this.clusterer.checkInactiveBattles();
      } catch (error) {
        logger.error('Error checking inactive battles:', error);
      }
    }, 5 * 60 * 1000);

    logger.info('Killmail consumer started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping killmail consumer...');
    this.isRunning = false;
    await this.eventBus.disconnect();
    logger.info('Killmail consumer stopped');
  }
}
