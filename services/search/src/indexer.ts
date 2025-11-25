import { Client } from 'typesense/lib/Typesense/Client';
import { Collections } from './schemas';
import { logger } from '@battlescope/logger';

// Battle document interface
export interface BattleDocument {
  id: string;
  system_name: string;
  region_name: string;
  security_type: string;
  start_time: number; // Unix timestamp
  end_time?: number; // Unix timestamp
  total_kills: number;
  total_isk_destroyed: number;
  alliance_names: string[];
  participant_names: string[];
}

// Killmail document interface
export interface KillmailDocument {
  killmail_id: string;
  victim_name: string;
  victim_alliance?: string;
  ship_type_name: string;
  ship_group: string;
  system_name: string;
  region_name: string;
  occurred_at: number; // Unix timestamp
  isk_value: number;
}

// Character document interface
export interface CharacterDocument {
  character_id: string;
  character_name: string;
  corp_name: string;
  alliance_name?: string;
}

// Corporation document interface
export interface CorporationDocument {
  corp_id: string;
  corp_name: string;
  alliance_name?: string;
  member_count?: number;
}

// System document interface
export interface SystemDocument {
  system_id: string;
  system_name: string;
  region_name: string;
  security_status: number;
}

export class Indexer {
  constructor(private client: Client) {}

  // Index a battle
  async indexBattle(battle: BattleDocument): Promise<void> {
    try {
      await this.client.collections(Collections.BATTLES).documents().upsert(battle);
      logger.debug({ battleId: battle.id }, 'Battle indexed successfully');
    } catch (error: any) {
      logger.error(
        { battleId: battle.id, error: error.message },
        'Failed to index battle'
      );
      throw error;
    }
  }

  // Index multiple battles in bulk
  async indexBattlesBulk(battles: BattleDocument[]): Promise<void> {
    try {
      const results = await this.client
        .collections(Collections.BATTLES)
        .documents()
        .import(battles, { action: 'upsert' });

      const failedCount = results.filter((r) => !r.success).length;
      if (failedCount > 0) {
        logger.warn({ failedCount, total: battles.length }, 'Some battles failed to index');
      } else {
        logger.info({ count: battles.length }, 'Battles indexed in bulk');
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to bulk index battles');
      throw error;
    }
  }

  // Index a killmail
  async indexKillmail(killmail: KillmailDocument): Promise<void> {
    try {
      await this.client.collections(Collections.KILLMAILS).documents().upsert(killmail);
      logger.debug({ killmailId: killmail.killmail_id }, 'Killmail indexed successfully');
    } catch (error: any) {
      logger.error(
        { killmailId: killmail.killmail_id, error: error.message },
        'Failed to index killmail'
      );
      throw error;
    }
  }

  // Index multiple killmails in bulk
  async indexKillmailsBulk(killmails: KillmailDocument[]): Promise<void> {
    try {
      const results = await this.client
        .collections(Collections.KILLMAILS)
        .documents()
        .import(killmails, { action: 'upsert' });

      const failedCount = results.filter((r) => !r.success).length;
      if (failedCount > 0) {
        logger.warn({ failedCount, total: killmails.length }, 'Some killmails failed to index');
      } else {
        logger.info({ count: killmails.length }, 'Killmails indexed in bulk');
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to bulk index killmails');
      throw error;
    }
  }

  // Index a character
  async indexCharacter(character: CharacterDocument): Promise<void> {
    try {
      await this.client.collections(Collections.CHARACTERS).documents().upsert(character);
      logger.debug({ characterId: character.character_id }, 'Character indexed successfully');
    } catch (error: any) {
      logger.error(
        { characterId: character.character_id, error: error.message },
        'Failed to index character'
      );
      throw error;
    }
  }

  // Index a corporation
  async indexCorporation(corporation: CorporationDocument): Promise<void> {
    try {
      await this.client.collections(Collections.CORPORATIONS).documents().upsert(corporation);
      logger.debug({ corpId: corporation.corp_id }, 'Corporation indexed successfully');
    } catch (error: any) {
      logger.error(
        { corpId: corporation.corp_id, error: error.message },
        'Failed to index corporation'
      );
      throw error;
    }
  }

  // Index a system
  async indexSystem(system: SystemDocument): Promise<void> {
    try {
      await this.client.collections(Collections.SYSTEMS).documents().upsert(system);
      logger.debug({ systemId: system.system_id }, 'System indexed successfully');
    } catch (error: any) {
      logger.error(
        { systemId: system.system_id, error: error.message },
        'Failed to index system'
      );
      throw error;
    }
  }

  // Delete a battle
  async deleteBattle(battleId: string): Promise<void> {
    try {
      await this.client.collections(Collections.BATTLES).documents(battleId).delete();
      logger.info({ battleId }, 'Battle deleted from index');
    } catch (error: any) {
      logger.error({ battleId, error: error.message }, 'Failed to delete battle');
      throw error;
    }
  }

  // Delete a killmail
  async deleteKillmail(killmailId: string): Promise<void> {
    try {
      await this.client.collections(Collections.KILLMAILS).documents(killmailId).delete();
      logger.info({ killmailId }, 'Killmail deleted from index');
    } catch (error: any) {
      logger.error({ killmailId, error: error.message }, 'Failed to delete killmail');
      throw error;
    }
  }

  // Clear all documents in a collection
  async clearCollection(collectionName: string): Promise<void> {
    try {
      await this.client.collections(collectionName).documents().delete({ filter_by: '' });
      logger.info({ collection: collectionName }, 'Collection cleared');
    } catch (error: any) {
      logger.error(
        { collection: collectionName, error: error.message },
        'Failed to clear collection'
      );
      throw error;
    }
  }
}
