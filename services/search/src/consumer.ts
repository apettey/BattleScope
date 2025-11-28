import { EventBus, getEventBusConfigFromEnv, Topics } from '@battlescope/events';
import type { Event } from '@battlescope/types';
import { Indexer, BattleDocument, KillmailDocument, CharacterDocument } from './indexer';
import { createLogger } from '@battlescope/logger';

const logger = createLogger({ serviceName: 'search-consumer' });
import { Config } from './config';

export class EventConsumer {
  private eventBus: EventBus;
  private indexer: Indexer;
  private isRunning = false;

  constructor(config: Config, indexer: Indexer) {
    const eventBusConfig = {
      brokers: config.kafka.brokers,
      clientId: config.kafka.clientId,
      groupId: config.kafka.groupId,
    };

    this.eventBus = new EventBus(eventBusConfig);
    this.indexer = indexer;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Event consumer already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting event consumers...');

    // Subscribe to killmail.enriched events
    await this.subscribeToKillmails();

    // Subscribe to battle events
    await this.subscribeToBattles();

    logger.info('Event consumers started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping event consumers...');
    this.isRunning = false;
    await this.eventBus.disconnect();
    logger.info('Event consumers stopped');
  }

  private async subscribeToKillmails(): Promise<void> {
    await this.eventBus.subscribe(
      Topics.KILLMAILS_ENRICHED,
      this.eventBus['kafka']['clientId'] + '-killmails',
      async (event: Event) => {
        try {
          if (event.type !== 'killmail.enriched') {
            return;
          }

          const { data } = event;

          // Transform to killmail document
          const killmailDoc: KillmailDocument = {
            killmail_id: data.killmailId.toString(),
            victim_name: data.victim.characterName || 'Unknown',
            victim_alliance: data.victim.allianceName,
            ship_type_name: data.victim.shipTypeName || 'Unknown',
            ship_group: this.extractShipGroup(data.victim.shipTypeName),
            system_name: this.extractSystemName(data.solarSystemId),
            region_name: this.extractRegionName(data.solarSystemId),
            occurred_at: Math.floor(data.killmailTime.getTime() / 1000),
            isk_value: data.zkb?.totalValue || 0,
          };

          await this.indexer.indexKillmail(killmailDoc);

          // Also index victim character if available
          if (data.victim.characterId && data.victim.characterName) {
            const characterDoc: CharacterDocument = {
              character_id: data.victim.characterId.toString(),
              character_name: data.victim.characterName,
              corp_name: data.victim.corporationName || 'Unknown',
              alliance_name: data.victim.allianceName,
            };
            await this.indexer.indexCharacter(characterDoc);
          }

          // Index attacker characters
          for (const attacker of data.attackers) {
            if (attacker.characterId && attacker.characterName) {
              const characterDoc: CharacterDocument = {
                character_id: attacker.characterId.toString(),
                character_name: attacker.characterName,
                corp_name: attacker.corporationName || 'Unknown',
                alliance_name: attacker.allianceName,
              };
              await this.indexer.indexCharacter(characterDoc);
            }
          }

          logger.debug({ killmailId: data.killmailId }, 'Killmail processed and indexed');
        } catch (error: any) {
          logger.error({ error: error.message, event }, 'Failed to process killmail event');
        }
      }
    );
  }

  private async subscribeToBattles(): Promise<void> {
    await this.eventBus.subscribe(
      Topics.BATTLES,
      this.eventBus['kafka']['clientId'] + '-battles',
      async (event: Event) => {
        try {
          if (event.type !== 'battle.detected' && event.type !== 'battle.updated') {
            return;
          }

          if (event.type === 'battle.detected') {
            // Initial battle detection - create minimal document
            const detectedData = event.data as { battleId: string; systemId: number; startTime: Date };
            const battleDoc: BattleDocument = {
              id: detectedData.battleId,
              system_name: this.extractSystemName(detectedData.systemId),
              region_name: this.extractRegionName(detectedData.systemId),
              security_type: this.determineSecurityType(detectedData.systemId),
              start_time: Math.floor(detectedData.startTime.getTime() / 1000),
              total_kills: 0,
              total_isk_destroyed: 0,
              alliance_names: [],
              participant_names: [],
            };

            await this.indexer.indexBattle(battleDoc);
            logger.debug({ battleId: detectedData.battleId }, 'Battle detected and indexed');
          } else if (event.type === 'battle.updated') {
            // Battle updated - full document
            const updatedData = event.data as {
              id: string;
              systemId: number;
              systemName: string;
              regionId: number;
              regionName: string;
              startTime: Date;
              endTime?: Date;
              totalKills: number;
              totalValue: number;
              participants: number;
              alliances: string[];
              corporations: string[];
            };
            const battleDoc: BattleDocument = {
              id: updatedData.id,
              system_name: updatedData.systemName,
              region_name: updatedData.regionName,
              security_type: this.determineSecurityType(updatedData.systemId),
              start_time: Math.floor(updatedData.startTime.getTime() / 1000),
              end_time: updatedData.endTime ? Math.floor(updatedData.endTime.getTime() / 1000) : undefined,
              total_kills: updatedData.totalKills,
              total_isk_destroyed: updatedData.totalValue,
              alliance_names: updatedData.alliances || [],
              participant_names: [], // This would need to be populated from participants
            };

            await this.indexer.indexBattle(battleDoc);
            logger.debug({ battleId: updatedData.id }, 'Battle updated and indexed');
          }
        } catch (error: any) {
          logger.error({ error: error.message, event }, 'Failed to process battle event');
        }
      }
    );
  }

  // Helper functions - these would ideally pull from a system cache or database
  private extractSystemName(systemId: number): string {
    // TODO: Implement system name lookup from cache/database
    return `System-${systemId}`;
  }

  private extractRegionName(systemId: number): string {
    // TODO: Implement region name lookup from cache/database
    return `Region-${systemId}`;
  }

  private determineSecurityType(systemId: number): string {
    // TODO: Implement security status lookup
    // For now, return a placeholder
    return 'Unknown';
  }

  private extractShipGroup(shipTypeName?: string): string {
    if (!shipTypeName) {
      return 'Unknown';
    }

    // Simple heuristic based on ship name
    const name = shipTypeName.toLowerCase();

    if (name.includes('capsule')) return 'Capsule';
    if (name.includes('frigate')) return 'Frigate';
    if (name.includes('destroyer')) return 'Destroyer';
    if (name.includes('cruiser')) return 'Cruiser';
    if (name.includes('battlecruiser')) return 'Battlecruiser';
    if (name.includes('battleship')) return 'Battleship';
    if (name.includes('carrier')) return 'Carrier';
    if (name.includes('dreadnought')) return 'Dreadnought';
    if (name.includes('titan')) return 'Titan';
    if (name.includes('supercarrier')) return 'Supercarrier';
    if (name.includes('industrial')) return 'Industrial';
    if (name.includes('hauler')) return 'Hauler';

    return 'Unknown';
  }
}
