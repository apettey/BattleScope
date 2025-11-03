import type { DatabaseClient } from '../client';
import type {
  BattleInsert,
  BattleKillmailInsert,
  BattleParticipantInsert,
  BattleRecord,
  BattleWithDetails,
} from '../types';
import {
  BattleInsertSchema,
  BattleKillmailInsertSchema,
  BattleParticipantInsertSchema,
} from '../types';
import { serializeBigInt, toBigInt } from './utils';

export class BattleRepository {
  constructor(private readonly db: DatabaseClient) {}

  async createBattle(input: BattleInsert): Promise<BattleRecord> {
    const battle = BattleInsertSchema.parse(input);

    const inserted = await this.db
      .insertInto('battles')
      .values({
        id: battle.id,
        systemId: battle.systemId,
        spaceType: battle.spaceType,
        startTime: battle.startTime,
        endTime: battle.endTime,
        totalKills: battle.totalKills,
        totalIskDestroyed: serializeBigInt(battle.totalIskDestroyed),
        zkillRelatedUrl: battle.zkillRelatedUrl,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...inserted,
      totalIskDestroyed: toBigInt(inserted.totalIskDestroyed) ?? 0n,
    } satisfies BattleRecord;
  }

  async upsertKillmails(killmails: BattleKillmailInsert[]): Promise<void> {
    if (killmails.length === 0) {
      return;
    }

    const records = killmails.map((killmail) => BattleKillmailInsertSchema.parse(killmail));

    await this.db
      .insertInto('battle_killmails')
      .values(
        records.map((killmail) => ({
          battleId: killmail.battleId,
          killmailId: killmail.killmailId,
          zkbUrl: killmail.zkbUrl,
          occurredAt: killmail.occurredAt,
          victimAllianceId: killmail.victimAllianceId,
          attackerAllianceIds: killmail.attackerAllianceIds,
          iskValue: serializeBigInt(killmail.iskValue),
          sideId: killmail.sideId,
        })),
      )
      .onConflict((oc) =>
        oc.columns(['battleId', 'killmailId']).doUpdateSet((eb) => ({
          zkbUrl: eb.ref('excluded.zkb_url'),
          occurredAt: eb.ref('excluded.occurred_at'),
          victimAllianceId: eb.ref('excluded.victim_alliance_id'),
          attackerAllianceIds: eb.ref('excluded.attacker_alliance_ids'),
          iskValue: eb.ref('excluded.isk_value'),
          sideId: eb.ref('excluded.side_id'),
        })),
      )
      .execute();
  }

  async upsertParticipants(participants: BattleParticipantInsert[]): Promise<void> {
    if (participants.length === 0) {
      return;
    }

    const records = participants.map((participant) =>
      BattleParticipantInsertSchema.parse(participant),
    );

    await this.db
      .insertInto('battle_participants')
      .values(
        records.map((participant) => ({
          battleId: participant.battleId,
          characterId: participant.characterId,
          allianceId: participant.allianceId,
          corpId: participant.corpId,
          shipTypeId: participant.shipTypeId,
          sideId: participant.sideId,
          isVictim: participant.isVictim,
        })),
      )
      .onConflict((oc) =>
        oc.columns(['battleId', 'characterId', 'shipTypeId']).doUpdateSet((eb) => ({
          allianceId: eb.ref('excluded.alliance_id'),
          corpId: eb.ref('excluded.corp_id'),
          sideId: eb.ref('excluded.side_id'),
          isVictim: eb.ref('excluded.is_victim'),
        })),
      )
      .execute();
  }

  async getBattleById(id: string): Promise<BattleWithDetails | null> {
    const battle = await this.db
      .selectFrom('battles')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!battle) {
      return null;
    }

    const killmails = await this.db
      .selectFrom('battle_killmails')
      .selectAll()
      .where('battleId', '=', id)
      .orderBy('occurredAt', 'asc')
      .execute();

    const participants = await this.db
      .selectFrom('battle_participants')
      .selectAll()
      .where('battleId', '=', id)
      .execute();

    return {
      ...battle,
      totalIskDestroyed: toBigInt(battle.totalIskDestroyed) ?? 0n,
      killmails: killmails.map((killmail) => ({
        ...killmail,
        iskValue: toBigInt(killmail.iskValue),
      })),
      participants,
    } satisfies BattleWithDetails;
  }
}
