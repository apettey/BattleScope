import { createLogger } from '@battlescope/logger';
import type { Killmail } from '@battlescope/types';
import { getESIClient } from './esi-client';
import { getDatabase } from '../database/client';
import type { AttackerData } from '../database/types';

const logger = createLogger({ serviceName: 'enricher' });

export interface EnrichedKillmail {
  killmail_id: number;
  ship_type_id: number;
  ship_type_name: string;
  ship_group_name: string;
  system_id: number;
  system_name: string;
  region_id: number;
  region_name: string;
  security_status: number;
  victim_character_id: number | null;
  victim_character_name: string | null;
  victim_corp_id: number | null;
  victim_corp_name: string | null;
  victim_alliance_id: number | null;
  victim_alliance_name: string | null;
  attacker_data: AttackerData[];
  raw_killmail_data: any;
}

export class KillmailEnricher {
  private esiClient = getESIClient();
  private db = getDatabase();

  async enrichKillmail(killmail: Killmail): Promise<EnrichedKillmail> {
    const startTime = Date.now();

    try {
      logger.info(`Enriching killmail ${killmail.killmailId}`);

      // Validate killmail data before enriching
      if (!killmail.solarSystemId || killmail.solarSystemId === 0) {
        logger.warn({
          msg: 'Skipping killmail with invalid solarSystemId',
          killmailId: killmail.killmailId,
          solarSystemId: killmail.solarSystemId,
        });
        throw new Error(`Invalid solarSystemId: ${killmail.solarSystemId}`);
      }

      if (!killmail.victim || !killmail.victim.shipTypeId) {
        logger.warn({
          msg: 'Skipping killmail with invalid victim data',
          killmailId: killmail.killmailId,
        });
        throw new Error('Invalid victim data');
      }

      // Enrich victim ship type
      const shipType = await this.esiClient.getShipType(killmail.victim.shipTypeId);
      if (!shipType) {
        throw new Error(`Failed to fetch ship type ${killmail.victim.shipTypeId}`);
      }

      const group = await this.esiClient.getGroup(shipType.group_id);
      if (!group) {
        throw new Error(`Failed to fetch group ${shipType.group_id}`);
      }

      // Enrich system and region
      const system = await this.esiClient.getSystem(killmail.solarSystemId);
      if (!system) {
        throw new Error(`Failed to fetch system ${killmail.solarSystemId}`);
      }

      const constellation = await this.esiClient.getConstellation(system.constellation_id);
      if (!constellation) {
        throw new Error(`Failed to fetch constellation ${system.constellation_id}`);
      }

      const region = await this.esiClient.getRegion(constellation.region_id);
      if (!region) {
        throw new Error(`Failed to fetch region ${constellation.region_id}`);
      }

      // Enrich victim
      let victimCharacterName: string | null = null;
      let victimCorpName: string | null = null;
      let victimAllianceName: string | null = null;

      if (killmail.victim.characterId) {
        const character = await this.esiClient.getCharacter(killmail.victim.characterId);
        victimCharacterName = character?.name || null;
      }

      const victimCorp = await this.esiClient.getCorporation(killmail.victim.corporationId);
      victimCorpName = victimCorp?.name || null;

      if (killmail.victim.allianceId) {
        const alliance = await this.esiClient.getAlliance(killmail.victim.allianceId);
        victimAllianceName = alliance?.name || null;
      }

      // Enrich attackers
      const enrichedAttackers: AttackerData[] = [];
      for (const attacker of killmail.attackers) {
        const enrichedAttacker: AttackerData = {
          characterId: attacker.characterId,
          corporationId: attacker.corporationId,
          allianceId: attacker.allianceId,
          shipTypeId: attacker.shipTypeId,
          weaponTypeId: attacker.weaponTypeId,
          damageDone: attacker.damageDone,
          finalBlow: attacker.finalBlow,
        };

        // Enrich attacker character
        if (attacker.characterId) {
          const character = await this.esiClient.getCharacter(attacker.characterId);
          enrichedAttacker.characterName = character?.name;
        }

        // Enrich attacker corporation
        if (attacker.corporationId) {
          const corp = await this.esiClient.getCorporation(attacker.corporationId);
          enrichedAttacker.corporationName = corp?.name;
        }

        // Enrich attacker alliance
        if (attacker.allianceId) {
          const alliance = await this.esiClient.getAlliance(attacker.allianceId);
          enrichedAttacker.allianceName = alliance?.name;
        }

        // Enrich attacker ship type
        if (attacker.shipTypeId) {
          const attackerShip = await this.esiClient.getShipType(attacker.shipTypeId);
          enrichedAttacker.shipTypeName = attackerShip?.name;
        }

        // Enrich weapon type
        if (attacker.weaponTypeId) {
          const weapon = await this.esiClient.getShipType(attacker.weaponTypeId);
          enrichedAttacker.weaponTypeName = weapon?.name;
        }

        enrichedAttackers.push(enrichedAttacker);
      }

      const enriched: EnrichedKillmail = {
        killmail_id: killmail.killmailId,
        ship_type_id: killmail.victim.shipTypeId,
        ship_type_name: shipType.name,
        ship_group_name: group.name,
        system_id: killmail.solarSystemId,
        system_name: system.name,
        region_id: constellation.region_id,
        region_name: region.name,
        security_status: system.security_status,
        victim_character_id: killmail.victim.characterId || null,
        victim_character_name: victimCharacterName,
        victim_corp_id: killmail.victim.corporationId,
        victim_corp_name: victimCorpName,
        victim_alliance_id: killmail.victim.allianceId || null,
        victim_alliance_name: victimAllianceName,
        attacker_data: enrichedAttackers,
        raw_killmail_data: killmail,
      };

      // Save to database
      await this.db
        .insertInto('enriched_killmails')
        .values({
          ...enriched,
          attacker_data: JSON.stringify(enriched.attacker_data),
          raw_killmail_data: JSON.stringify(enriched.raw_killmail_data),
          enriched_at: new Date(),
          version: 1,
        })
        .onConflict((oc) =>
          oc.column('killmail_id').doUpdateSet({
            ...enriched,
            attacker_data: JSON.stringify(enriched.attacker_data),
            raw_killmail_data: JSON.stringify(enriched.raw_killmail_data),
            enriched_at: new Date(),
            version: 1,
          })
        )
        .execute();

      const processingTime = Date.now() - startTime;
      logger.info(
        `Enriched killmail ${killmail.killmailId} in ${processingTime}ms`
      );

      // Update stats
      await this.updateStats(processingTime);

      return enriched;
    } catch (error: any) {
      logger.error({
        msg: `Failed to enrich killmail ${killmail.killmailId}`,
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name,
        killmailId: killmail.killmailId,
      });
      await this.incrementErrorCount();
      throw error;
    }
  }

  private async updateStats(processingTimeMs: number): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];

      await this.db
        .insertInto('enrichment_stats')
        .values({
          date: today,
          killmails_processed: 1,
          esi_api_calls: 0,
          esi_cache_hits: 0,
          esi_cache_misses: 0,
          errors_count: 0,
          avg_processing_time_ms: processingTimeMs,
        })
        .onConflict((oc) =>
          oc.column('date').doNothing()
        )
        .execute();
    } catch (error) {
      logger.error('Failed to update stats:', error);
    }
  }

  private async incrementErrorCount(): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];

      await this.db
        .insertInto('enrichment_stats')
        .values({
          date: today,
          killmails_processed: 0,
          esi_api_calls: 0,
          esi_cache_hits: 0,
          esi_cache_misses: 0,
          errors_count: 1,
          avg_processing_time_ms: 0,
        })
        .onConflict((oc) =>
          oc.column('date').doUpdateSet((eb) => ({
            errors_count: eb('errors_count', '+', 1),
            updated_at: new Date(),
          }))
        )
        .execute();
    } catch (error) {
      logger.error('Failed to increment error count:', error);
    }
  }

  async getEnrichedKillmail(killmailId: number): Promise<EnrichedKillmail | null> {
    try {
      const result = await this.db
        .selectFrom('enriched_killmails')
        .selectAll()
        .where('killmail_id', '=', killmailId)
        .executeTakeFirst();

      if (!result) {
        return null;
      }

      return {
        ...result,
        attacker_data: result.attacker_data as unknown as AttackerData[],
        raw_killmail_data: result.raw_killmail_data,
      };
    } catch (error) {
      logger.error(`Failed to fetch enriched killmail ${killmailId}:`, error);
      throw error;
    }
  }

  async getCacheStats(): Promise<any> {
    try {
      const totalCached = await this.db
        .selectFrom('esi_cache')
        .select((eb) => eb.fn.count('cache_key').as('count'))
        .executeTakeFirst();

      const expiredCount = await this.db
        .selectFrom('esi_cache')
        .select((eb) => eb.fn.count('cache_key').as('count'))
        .where('expires_at', '<', new Date())
        .executeTakeFirst();

      const todayStats = await this.db
        .selectFrom('enrichment_stats')
        .selectAll()
        .where('date', '=', new Date())
        .executeTakeFirst();

      return {
        cache: {
          total_entries: Number(totalCached?.count || 0),
          expired_entries: Number(expiredCount?.count || 0),
        },
        today: todayStats || {
          killmails_processed: 0,
          esi_api_calls: 0,
          esi_cache_hits: 0,
          esi_cache_misses: 0,
          errors_count: 0,
          avg_processing_time_ms: 0,
        },
      };
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      throw error;
    }
  }
}

// Singleton instance
let enricher: KillmailEnricher | null = null;

export function getEnricher(): KillmailEnricher {
  if (!enricher) {
    enricher = new KillmailEnricher();
  }
  return enricher;
}
