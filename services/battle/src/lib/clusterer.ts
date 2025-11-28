import { v4 as uuidv4 } from 'uuid';
import type { DB } from '../database/types';
import { createLogger } from '@battlescope/logger';

const logger = createLogger({ serviceName: 'battle-clusterer' });

interface EnrichedKillmail {
  killmailId: number;
  killmailTime: Date;
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
}

// Battle clustering configuration
const BATTLE_TIME_WINDOW = 5 * 60 * 1000; // 5 minutes (kills within 5 min of each other)
const BATTLE_INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes (battle ends after 30 min of no kills)

function getSecurityType(securityStatus: number): string {
  if (securityStatus >= 0.5) return 'highsec';
  if (securityStatus > 0.0) return 'lowsec';
  if (securityStatus <= 0.0 && securityStatus > -1.0) return 'nullsec';
  return 'wormhole';
}

function determineSideId(
  victim: EnrichedKillmail['victim'],
  attacker: EnrichedKillmail['attackers'][0],
  existingSides: Map<number, number>
): number {
  // Use alliance if available, otherwise corporation
  const victimAllianceId = victim.allianceId || victim.corporationId;
  const attackerAllianceId = attacker.allianceId || attacker.corporationId || 0;

  // Check if we've seen these alliances before
  if (existingSides.has(victimAllianceId)) {
    return existingSides.get(victimAllianceId)!;
  }
  if (existingSides.has(attackerAllianceId)) {
    // Victim is on opposite side
    const attackerSide = existingSides.get(attackerAllianceId)!;
    return attackerSide === 1 ? 2 : 1;
  }

  // New sides - assign victim to side 1, attackers to side 2
  existingSides.set(victimAllianceId, 1);
  if (attackerAllianceId) {
    existingSides.set(attackerAllianceId, 2);
  }

  return 1; // Default to side 1 for victim
}

export class BattleClusterer {
  private db: DB;
  private activeBattles: Map<string, { battleId: string; lastKillmail: Date; sides: Map<number, number> }> = new Map();

  constructor(db: DB) {
    this.db = db;
  }

  async initialize(): Promise<void> {
    // Load active battles (battles without end_time)
    const activeBattles = await this.db
      .selectFrom('battles')
      .selectAll()
      .where('end_time', 'is', null)
      .execute();

    for (const battle of activeBattles) {
      const key = `${battle.system_id}`;
      this.activeBattles.set(key, {
        battleId: battle.id,
        lastKillmail: new Date(battle.last_killmail_at),
        sides: new Map(),
      });

      // Load existing sides for this battle
      const participants = await this.db
        .selectFrom('battle_participants')
        .select(['alliance_id', 'side_id'])
        .where('battle_id', '=', battle.id)
        .where('alliance_id', 'is not', null)
        .execute();

      const sidesMap = new Map<number, number>();
      for (const p of participants) {
        if (p.alliance_id && p.side_id) {
          sidesMap.set(p.alliance_id, p.side_id);
        }
      }
      this.activeBattles.get(key)!.sides = sidesMap;
    }

    logger.info(`Loaded ${activeBattles.length} active battles`);
  }

  async processKillmail(killmail: EnrichedKillmail): Promise<void> {
    const systemKey = `${killmail.solarSystemId}`;
    const killmailTime = new Date(killmail.killmailTime);

    // Check if there's an active battle for this system
    const activeBattle = this.activeBattles.get(systemKey);

    if (activeBattle) {
      const timeSinceLastKill = killmailTime.getTime() - activeBattle.lastKillmail.getTime();

      // Check if battle should end (30 min inactivity)
      if (timeSinceLastKill > BATTLE_INACTIVITY_TIMEOUT) {
        await this.endBattle(activeBattle.battleId);
        this.activeBattles.delete(systemKey);
        // Create new battle
        await this.createNewBattle(killmail);
      } else {
        // Add to existing battle
        await this.addKillmailToBattle(activeBattle.battleId, killmail, activeBattle.sides);
        activeBattle.lastKillmail = killmailTime;
      }
    } else {
      // Check if there's a recent battle we can join (within 5 minutes)
      const recentBattle = await this.findRecentBattle(killmail.solarSystemId, killmailTime);

      if (recentBattle) {
        // Reactivate the battle
        const sidesMap = new Map<number, number>();
        const participants = await this.db
          .selectFrom('battle_participants')
          .select(['alliance_id', 'side_id'])
          .where('battle_id', '=', recentBattle.id)
          .where('alliance_id', 'is not', null)
          .execute();

        for (const p of participants) {
          if (p.alliance_id && p.side_id) {
            sidesMap.set(p.alliance_id, p.side_id);
          }
        }

        this.activeBattles.set(systemKey, {
          battleId: recentBattle.id,
          lastKillmail: killmailTime,
          sides: sidesMap,
        });

        await this.addKillmailToBattle(recentBattle.id, killmail, sidesMap);
      } else {
        // Create new battle
        await this.createNewBattle(killmail);
      }
    }
  }

  private async findRecentBattle(systemId: number, killmailTime: Date) {
    const cutoffTime = new Date(killmailTime.getTime() - BATTLE_TIME_WINDOW);

    return this.db
      .selectFrom('battles')
      .selectAll()
      .where('system_id', '=', systemId)
      .where('last_killmail_at', '>=', cutoffTime)
      .orderBy('last_killmail_at', 'desc')
      .executeTakeFirst();
  }

  private async createNewBattle(killmail: EnrichedKillmail): Promise<string> {
    const battleId = uuidv4();
    const systemKey = `${killmail.solarSystemId}`;
    const securityType = getSecurityType(killmail.securityStatus);

    await this.db
      .insertInto('battles')
      .values({
        id: battleId,
        system_id: killmail.solarSystemId,
        system_name: killmail.systemName,
        region_name: killmail.regionName,
        security_type: securityType,
        start_time: new Date(killmail.killmailTime),
        last_killmail_at: new Date(killmail.killmailTime),
        total_kills: 1,
        total_isk_destroyed: BigInt(killmail.zkb?.totalValue || 0),
        zkill_related_url: `https://zkillboard.com/system/${killmail.solarSystemId}/`,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();

    const sidesMap = new Map<number, number>();
    this.activeBattles.set(systemKey, {
      battleId,
      lastKillmail: new Date(killmail.killmailTime),
      sides: sidesMap,
    });

    await this.addKillmailToBattle(battleId, killmail, sidesMap);

    logger.info(`Created new battle ${battleId} in ${killmail.systemName}`);
    return battleId;
  }

  private async addKillmailToBattle(
    battleId: string,
    killmail: EnrichedKillmail,
    sides: Map<number, number>
  ): Promise<void> {
    const victimSideId = determineSideId(killmail.victim, killmail.attackers[0] || {}, sides);
    const attackerSideId = victimSideId === 1 ? 2 : 1;

    // Insert battle_killmails
    await this.db
      .insertInto('battle_killmails')
      .values({
        battle_id: battleId,
        killmail_id: killmail.killmailId,
        occurred_at: new Date(killmail.killmailTime),
        ship_type_name: killmail.victim.shipTypeName || null,
        victim_name: killmail.victim.characterName || null,
        victim_alliance_name: killmail.victim.allianceName || null,
        isk_value: BigInt(killmail.zkb?.totalValue || 0),
        side_id: victimSideId,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();

    // Insert/update victim participant
    if (killmail.victim.characterId) {
      await this.upsertParticipant(battleId, {
        character_id: killmail.victim.characterId,
        character_name: killmail.victim.characterName || null,
        alliance_id: killmail.victim.allianceId || null,
        alliance_name: killmail.victim.allianceName || null,
        corp_id: killmail.victim.corporationId,
        corp_name: killmail.victim.corporationName || null,
        ship_type_id: killmail.victim.shipTypeId,
        ship_type_name: killmail.victim.shipTypeName || null,
        side_id: victimSideId,
        is_victim: true,
      });

      // Update ship history for victim (loss)
      await this.updateShipHistory(
        killmail.victim.characterId,
        killmail.victim.shipTypeId,
        killmail.victim.shipTypeName || 'Unknown',
        new Date(killmail.killmailTime),
        { isLoss: true }
      );
    }

    // Insert/update attacker participants
    for (const attacker of killmail.attackers) {
      if (attacker.characterId && attacker.shipTypeId) {
        await this.upsertParticipant(battleId, {
          character_id: attacker.characterId,
          character_name: attacker.characterName || null,
          alliance_id: attacker.allianceId || null,
          alliance_name: attacker.allianceName || null,
          corp_id: attacker.corporationId || null,
          corp_name: attacker.corporationName || null,
          ship_type_id: attacker.shipTypeId,
          ship_type_name: attacker.shipTypeName || null,
          side_id: attackerSideId,
          is_victim: false,
        });

        // Update ship history for attacker (kill)
        await this.updateShipHistory(
          attacker.characterId,
          attacker.shipTypeId,
          attacker.shipTypeName || 'Unknown',
          new Date(killmail.killmailTime),
          { isKill: true }
        );
      }
    }

    // Update battle stats
    await this.db
      .updateTable('battles')
      .set({
        total_kills: (eb) => eb('total_kills', '+', 1),
        total_isk_destroyed: (eb) => eb('total_isk_destroyed', '+', BigInt(killmail.zkb?.totalValue || 0)),
        last_killmail_at: new Date(killmail.killmailTime),
      })
      .where('id', '=', battleId)
      .execute();
  }

  private async upsertParticipant(battleId: string, participant: {
    character_id: number;
    character_name: string | null;
    alliance_id: number | null;
    alliance_name: string | null;
    corp_id: number | null;
    corp_name: string | null;
    ship_type_id: number | null;
    ship_type_name: string | null;
    side_id: number;
    is_victim: boolean;
  }): Promise<void> {
    await this.db
      .insertInto('battle_participants')
      .values({
        battle_id: battleId,
        ...participant,
      })
      .onConflict((oc) =>
        oc.columns(['battle_id', 'character_id']).doUpdateSet({
          // Update ship if they changed ships during the battle
          ship_type_id: participant.ship_type_id,
          ship_type_name: participant.ship_type_name,
        })
      )
      .execute();
  }

  private async updateShipHistory(
    characterId: number,
    shipTypeId: number,
    shipTypeName: string,
    timestamp: Date,
    stats: { isKill?: boolean; isLoss?: boolean }
  ): Promise<void> {
    const existing = await this.db
      .selectFrom('pilot_ship_history')
      .selectAll()
      .where('character_id', '=', characterId)
      .where('ship_type_id', '=', shipTypeId)
      .executeTakeFirst();

    if (existing) {
      await this.db
        .updateTable('pilot_ship_history')
        .set({
          last_seen: timestamp,
          kill_count: stats.isKill ? existing.kill_count + 1 : existing.kill_count,
          loss_count: stats.isLoss ? existing.loss_count + 1 : existing.loss_count,
        })
        .where('character_id', '=', characterId)
        .where('ship_type_id', '=', shipTypeId)
        .execute();
    } else {
      await this.db
        .insertInto('pilot_ship_history')
        .values({
          character_id: characterId,
          ship_type_id: shipTypeId,
          ship_type_name: shipTypeName,
          first_seen: timestamp,
          last_seen: timestamp,
          kill_count: stats.isKill ? 1 : 0,
          loss_count: stats.isLoss ? 1 : 0,
        })
        .execute();
    }
  }

  private async endBattle(battleId: string): Promise<void> {
    await this.db
      .updateTable('battles')
      .set({ end_time: new Date() })
      .where('id', '=', battleId)
      .execute();

    logger.info(`Ended battle ${battleId}`);
  }

  async checkInactiveBattles(): Promise<void> {
    const now = new Date();

    for (const [systemKey, battle] of this.activeBattles.entries()) {
      const timeSinceLastKill = now.getTime() - battle.lastKillmail.getTime();

      if (timeSinceLastKill > BATTLE_INACTIVITY_TIMEOUT) {
        await this.endBattle(battle.battleId);
        this.activeBattles.delete(systemKey);
      }
    }
  }
}
