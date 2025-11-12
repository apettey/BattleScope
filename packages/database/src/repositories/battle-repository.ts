import { sql } from 'kysely';
import type { DatabaseClient } from '../client.js';
import type {
  BattleInsert,
  BattleKillmailInsert,
  BattleParticipantInsert,
  BattleRecord,
  BattleWithDetails,
  SecurityType,
} from '../types.js';
import {
  BattleInsertSchema,
  BattleKillmailInsertSchema,
  BattleParticipantInsertSchema,
  KillmailEnrichmentSchema,
} from '../types.js';
import {
  serializeBigInt,
  serializeBigIntArray,
  serializeBigIntRequired,
  toBigInt,
  toBigIntArray,
} from './utils.js';

export interface BattleFilters {
  securityType?: SecurityType;
  systemId?: bigint;
  allianceId?: bigint;
  corpId?: bigint;
  characterId?: bigint;
  since?: Date;
  until?: Date;
}

export interface BattleCursor {
  startTime: Date;
  id: string;
}

export class BattleRepository {
  constructor(private readonly db: DatabaseClient) {}

  async createBattle(input: BattleInsert): Promise<BattleRecord> {
    const battle = BattleInsertSchema.parse(input);

    const inserted = await this.db
      .insertInto('battles')
      .values({
        id: battle.id,
        systemId: serializeBigIntRequired(battle.systemId),
        securityType: battle.securityType,
        startTime: battle.startTime,
        endTime: battle.endTime,
        totalKills: serializeBigIntRequired(battle.totalKills),
        totalIskDestroyed: serializeBigIntRequired(battle.totalIskDestroyed),
        zkillRelatedUrl: battle.zkillRelatedUrl,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...inserted,
      systemId: toBigInt(inserted.systemId) ?? 0n,
      totalKills: toBigInt(inserted.totalKills) ?? 0n,
      totalIskDestroyed: toBigInt(inserted.totalIskDestroyed) ?? 0n,
    };
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
          killmailId: serializeBigIntRequired(killmail.killmailId),
          zkbUrl: killmail.zkbUrl,
          occurredAt: killmail.occurredAt,
          victimAllianceId: serializeBigInt(killmail.victimAllianceId),
          attackerAllianceIds: serializeBigIntArray(killmail.attackerAllianceIds),
          iskValue: serializeBigInt(killmail.iskValue),
          sideId: serializeBigInt(killmail.sideId),
        })),
      )
      .onConflict((oc) =>
        oc.columns(['battleId', 'killmailId']).doUpdateSet((eb) => ({
          zkbUrl: eb.ref('excluded.zkbUrl'),
          occurredAt: eb.ref('excluded.occurredAt'),
          victimAllianceId: eb.ref('excluded.victimAllianceId'),
          attackerAllianceIds: eb.ref('excluded.attackerAllianceIds'),
          iskValue: eb.ref('excluded.iskValue'),
          sideId: eb.ref('excluded.sideId'),
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
          characterId: serializeBigIntRequired(participant.characterId),
          allianceId: serializeBigInt(participant.allianceId),
          corpId: serializeBigInt(participant.corpId),
          shipTypeId: serializeBigInt(participant.shipTypeId),
          sideId: serializeBigInt(participant.sideId),
          isVictim: participant.isVictim,
        })),
      )
      .onConflict((oc) =>
        oc.columns(['battleId', 'characterId']).doUpdateSet((eb) => ({
          allianceId: eb.ref('excluded.allianceId'),
          corpId: eb.ref('excluded.corpId'),
          shipTypeId: eb.ref('excluded.shipTypeId'),
          sideId: eb.ref('excluded.sideId'),
          isVictim: eb.ref('excluded.isVictim'),
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

    const killmailEventsRaw = await this.db
      .selectFrom('killmail_events')
      .select([
        'killmailId',
        'victimCorpId',
        'victimCharacterId',
        'attackerCorpIds',
        'attackerCharacterIds',
      ])
      .where('battleId', '=', id)
      .execute();

    const killmailEvents = killmailEventsRaw.map((event) => ({
      killmailId: toBigInt(event.killmailId) ?? 0n,
      victimCorpId: toBigInt(event.victimCorpId),
      victimCharacterId: toBigInt(event.victimCharacterId),
      attackerCorpIds: event.attackerCorpIds ? toBigIntArray(event.attackerCorpIds) : [],
      attackerCharacterIds: event.attackerCharacterIds
        ? toBigIntArray(event.attackerCharacterIds)
        : [],
    }));

    const eventByKillmailId = new Map<bigint, (typeof killmailEvents)[number]>();
    killmailEvents.forEach((event) => {
      eventByKillmailId.set(event.killmailId, event);
    });

    const enrichmentByKillmailId = new Map<
      bigint,
      ReturnType<typeof KillmailEnrichmentSchema.parse>
    >();
    if (killmails.length > 0) {
      const enrichmentRows = await this.db
        .selectFrom('killmail_enrichments')
        .selectAll()
        .where(
          'killmailId',
          'in',
          killmails.map((killmail) => toBigInt(killmail.killmailId) ?? 0n),
        )
        .execute();

      enrichmentRows.forEach((row) => {
        const enrichment = KillmailEnrichmentSchema.parse({
          ...row,
          killmailId: toBigInt(row.killmailId) ?? 0n,
        });
        enrichmentByKillmailId.set(toBigInt(row.killmailId) ?? 0n, enrichment);
      });
    }

    const participantsRaw = await this.db
      .selectFrom('battle_participants')
      .selectAll()
      .where('battleId', '=', id)
      .execute();

    const participants = participantsRaw.map((participant) => ({
      ...participant,
      characterId: toBigInt(participant.characterId) ?? 0n,
      allianceId: toBigInt(participant.allianceId),
      corpId: toBigInt(participant.corpId),
      shipTypeId: toBigInt(participant.shipTypeId),
      sideId: toBigInt(participant.sideId),
    }));

    const mappedKillmails = killmails.map((killmail) => {
      const killmailId = toBigInt(killmail.killmailId) ?? 0n;
      const event = eventByKillmailId.get(killmailId);
      const enrichment = enrichmentByKillmailId.get(killmailId) ?? null;
      return {
        ...killmail,
        killmailId,
        victimAllianceId: toBigInt(killmail.victimAllianceId),
        victimCorpId: event?.victimCorpId ?? null,
        victimCharacterId: event?.victimCharacterId ?? null,
        attackerAllianceIds: killmail.attackerAllianceIds
          ? toBigIntArray(killmail.attackerAllianceIds)
          : [],
        attackerCorpIds: event?.attackerCorpIds ?? [],
        attackerCharacterIds: event?.attackerCharacterIds ?? [],
        iskValue: toBigInt(killmail.iskValue),
        sideId: toBigInt(killmail.sideId),
        enrichment,
      };
    });

    return {
      ...battle,
      systemId: toBigInt(battle.systemId) ?? 0n,
      totalKills: toBigInt(battle.totalKills) ?? 0n,
      totalIskDestroyed: toBigInt(battle.totalIskDestroyed) ?? 0n,
      killmails: mappedKillmails,
      participants,
    } satisfies BattleWithDetails;
  }

  async listBattles(
    filters: BattleFilters,
    limit: number,
    cursor?: BattleCursor,
  ): Promise<BattleRecord[]> {
    let query = this.db.selectFrom('battles').selectAll();

    if (filters.securityType) {
      query = query.where('securityType', '=', filters.securityType);
    }

    if (filters.systemId !== undefined) {
      query = query.where('systemId', '=', filters.systemId);
    }

    if (filters.since) {
      query = query.where('startTime', '>=', filters.since);
    }

    if (filters.until) {
      query = query.where('startTime', '<=', filters.until);
    }

    if (filters.allianceId !== undefined) {
      const allianceId = filters.allianceId;
      const allianceSubquery = this.db
        .selectFrom('killmail_events')
        .select('battleId')
        .where('battleId', 'is not', null)
        .where(
          sql<boolean>`("killmail_events"."victim_alliance_id" = CAST(${serializeBigIntRequired(
            allianceId,
          )} AS bigint) OR CAST(${serializeBigIntRequired(
            allianceId,
          )} AS bigint) = ANY("killmail_events"."attacker_alliance_ids"))`,
        );
      query = query.where('id', 'in', allianceSubquery);
    }

    if (filters.corpId !== undefined) {
      const corpId = filters.corpId;
      const corpSubquery = this.db
        .selectFrom('killmail_events')
        .select('battleId')
        .where('battleId', 'is not', null)
        .where(
          sql<boolean>`("killmail_events"."victim_corp_id" = CAST(${serializeBigIntRequired(
            corpId,
          )} AS bigint) OR CAST(${serializeBigIntRequired(
            corpId,
          )} AS bigint) = ANY("killmail_events"."attacker_corp_ids"))`,
        );
      query = query.where('id', 'in', corpSubquery);
    }

    if (filters.characterId !== undefined) {
      const characterId = filters.characterId;
      const characterSubquery = this.db
        .selectFrom('killmail_events')
        .select('battleId')
        .where('battleId', 'is not', null)
        .where(
          sql<boolean>`("killmail_events"."victim_character_id" = CAST(${serializeBigIntRequired(
            characterId,
          )} AS bigint) OR CAST(${serializeBigIntRequired(
            characterId,
          )} AS bigint) = ANY("killmail_events"."attacker_character_ids"))`,
        );
      query = query.where('id', 'in', characterSubquery);
    }

    if (cursor) {
      query = query.where((eb) =>
        eb.or([
          eb('startTime', '<', cursor.startTime),
          eb.and([eb('startTime', '=', cursor.startTime), eb('id', '<', cursor.id)]),
        ]),
      );
    }

    const rows = await query
      .orderBy('startTime', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      ...row,
      systemId: toBigInt(row.systemId) ?? 0n,
      totalKills: toBigInt(row.totalKills) ?? 0n,
      totalIskDestroyed: toBigInt(row.totalIskDestroyed) ?? 0n,
    }));
  }

  async getAllianceStatistics(allianceId: bigint) {
    // Get all battles involving this alliance
    const battleIds = await this.db
      .selectFrom('killmail_events')
      .select('battleId')
      .distinct()
      .where('battleId', 'is not', null)
      .where(
        sql<boolean>`("killmail_events"."victim_alliance_id" = CAST(${serializeBigIntRequired(
          allianceId,
        )} AS bigint) OR CAST(${serializeBigIntRequired(
          allianceId,
        )} AS bigint) = ANY("killmail_events"."attacker_alliance_ids"))`,
      )
      .execute();

    const battleIdList = battleIds
      .map((row) => row.battleId)
      .filter((id): id is string => id !== null);

    if (battleIdList.length === 0) {
      return null;
    }

    // Get total killmails and ISK statistics
    const killmailStats = await this.db
      .selectFrom('killmail_events')
      .select((eb) => [
        eb.fn.count('killmailId').distinct().as('totalKillmails'),
        eb.fn
          .sum(
            eb
              .case()
              .when('victimAllianceId', '=', allianceId)
              .then(sql<string>`COALESCE(isk_value, 0)`)
              .else(sql<string>`0`)
              .end(),
          )
          .as('totalIskLost'),
        eb.fn
          .sum(
            eb
              .case()
              .when(sql<boolean>`${allianceId} = ANY(attacker_alliance_ids)`, '=', true)
              .then(sql<string>`COALESCE(isk_value, 0)`)
              .else(sql<string>`0`)
              .end(),
          )
          .as('totalIskDestroyed'),
      ])
      .where('battleId', 'in', battleIdList)
      .executeTakeFirst();

    // Get participant statistics
    const participantStats = await this.db
      .selectFrom('battle_participants')
      .select((eb) => [eb.fn.avg(eb.fn.count('characterId')).over().as('avgParticipants')])
      .where('battleId', 'in', battleIdList)
      .where('allianceId', '=', allianceId)
      .groupBy('battleId')
      .executeTakeFirst();

    // Get most used ships
    const mostUsedShips = await this.db
      .selectFrom('battle_participants')
      .select((eb) => ['shipTypeId', eb.fn.count('shipTypeId').as('count')])
      .where('battleId', 'in', battleIdList)
      .where('allianceId', '=', allianceId)
      .where('shipTypeId', 'is not', null)
      .groupBy('shipTypeId')
      .orderBy('count', 'desc')
      .limit(10)
      .execute();

    // Get top opponents (alliances that fought against this alliance)
    const topOpponents = await this.db
      .selectFrom(
        sql<{ opponentAllianceId: string }>`
          (
            SELECT victim_alliance_id as opponent_alliance_id
            FROM killmail_events
            WHERE battle_id IN (${sql.join(battleIdList.map((id) => sql.lit(id)))})
              AND CAST(${serializeBigIntRequired(allianceId)} AS bigint) = ANY(attacker_alliance_ids)
              AND victim_alliance_id IS NOT NULL
            UNION ALL
            SELECT UNNEST(attacker_alliance_ids) as opponent_alliance_id
            FROM killmail_events
            WHERE battle_id IN (${sql.join(battleIdList.map((id) => sql.lit(id)))})
              AND victim_alliance_id = CAST(${serializeBigIntRequired(allianceId)} AS bigint)
          )
        `.as('opponents'),
      )
      .select((eb) => ['opponentAllianceId', eb.fn.countAll().as('battleCount')])
      .groupBy('opponentAllianceId')
      .orderBy('battleCount', 'desc')
      .limit(10)
      .execute();

    // Get top systems
    const topSystems = await this.db
      .selectFrom('battles')
      .select((eb) => ['systemId', eb.fn.countAll().as('battleCount')])
      .where('id', 'in', battleIdList)
      .groupBy('systemId')
      .orderBy('battleCount', 'desc')
      .limit(10)
      .execute();

    return {
      totalBattles: battleIdList.length,
      totalKillmails: Number(killmailStats?.totalKillmails ?? 0),
      totalIskDestroyed: toBigInt(killmailStats?.totalIskDestroyed) ?? 0n,
      totalIskLost: toBigInt(killmailStats?.totalIskLost) ?? 0n,
      averageParticipants: Number(participantStats?.avgParticipants ?? 0),
      mostUsedShips: mostUsedShips.map((ship) => ({
        shipTypeId: toBigInt(ship.shipTypeId) ?? 0n,
        count: Number(ship.count),
      })),
      topOpponents: topOpponents
        .map((opponent) => ({
          allianceId: toBigInt(opponent.opponentAllianceId) ?? 0n,
          battleCount: Number(opponent.battleCount),
        }))
        .filter((o) => o.allianceId !== 0n),
      topSystems: topSystems.map((system) => ({
        systemId: toBigInt(system.systemId) ?? 0n,
        battleCount: Number(system.battleCount),
      })),
    };
  }

  async getCorporationStatistics(corpId: bigint) {
    // Get all battles involving this corporation
    const battleIds = await this.db
      .selectFrom('killmail_events')
      .select('battleId')
      .distinct()
      .where('battleId', 'is not', null)
      .where(
        sql<boolean>`("killmail_events"."victim_corp_id" = CAST(${serializeBigIntRequired(
          corpId,
        )} AS bigint) OR CAST(${serializeBigIntRequired(
          corpId,
        )} AS bigint) = ANY("killmail_events"."attacker_corp_ids"))`,
      )
      .execute();

    const battleIdList = battleIds
      .map((row) => row.battleId)
      .filter((id): id is string => id !== null);

    if (battleIdList.length === 0) {
      return null;
    }

    // Get total killmails and ISK statistics
    const killmailStats = await this.db
      .selectFrom('killmail_events')
      .select((eb) => [
        eb.fn.count('killmailId').distinct().as('totalKillmails'),
        eb.fn
          .sum(
            eb
              .case()
              .when('victimCorpId', '=', corpId)
              .then(sql<string>`COALESCE(isk_value, 0)`)
              .else(sql<string>`0`)
              .end(),
          )
          .as('totalIskLost'),
        eb.fn
          .sum(
            eb
              .case()
              .when(sql<boolean>`${corpId} = ANY(attacker_corp_ids)`, '=', true)
              .then(sql<string>`COALESCE(isk_value, 0)`)
              .else(sql<string>`0`)
              .end(),
          )
          .as('totalIskDestroyed'),
      ])
      .where('battleId', 'in', battleIdList)
      .executeTakeFirst();

    // Get participant statistics
    const participantStats = await this.db
      .selectFrom('battle_participants')
      .select((eb) => [eb.fn.avg(eb.fn.count('characterId')).over().as('avgParticipants')])
      .where('battleId', 'in', battleIdList)
      .where('corpId', '=', corpId)
      .groupBy('battleId')
      .executeTakeFirst();

    // Get most used ships
    const mostUsedShips = await this.db
      .selectFrom('battle_participants')
      .select((eb) => ['shipTypeId', eb.fn.count('shipTypeId').as('count')])
      .where('battleId', 'in', battleIdList)
      .where('corpId', '=', corpId)
      .where('shipTypeId', 'is not', null)
      .groupBy('shipTypeId')
      .orderBy('count', 'desc')
      .limit(10)
      .execute();

    // Get top opponents
    const topOpponents = await this.db
      .selectFrom(
        sql<{ opponentAllianceId: string }>`
          (
            SELECT victim_alliance_id as opponent_alliance_id
            FROM killmail_events
            WHERE battle_id IN (${sql.join(battleIdList.map((id) => sql.lit(id)))})
              AND CAST(${serializeBigIntRequired(corpId)} AS bigint) = ANY(attacker_corp_ids)
              AND victim_alliance_id IS NOT NULL
            UNION ALL
            SELECT UNNEST(attacker_alliance_ids) as opponent_alliance_id
            FROM killmail_events
            WHERE battle_id IN (${sql.join(battleIdList.map((id) => sql.lit(id)))})
              AND victim_corp_id = CAST(${serializeBigIntRequired(corpId)} AS bigint)
          )
        `.as('opponents'),
      )
      .select((eb) => ['opponentAllianceId', eb.fn.countAll().as('battleCount')])
      .groupBy('opponentAllianceId')
      .orderBy('battleCount', 'desc')
      .limit(10)
      .execute();

    // Get top pilots
    const topPilots = await this.db
      .selectFrom('battle_participants')
      .select((eb) => ['characterId', eb.fn.count('battleId').distinct().as('battleCount')])
      .where('battleId', 'in', battleIdList)
      .where('corpId', '=', corpId)
      .groupBy('characterId')
      .orderBy('battleCount', 'desc')
      .limit(10)
      .execute();

    return {
      totalBattles: battleIdList.length,
      totalKillmails: Number(killmailStats?.totalKillmails ?? 0),
      totalIskDestroyed: toBigInt(killmailStats?.totalIskDestroyed) ?? 0n,
      totalIskLost: toBigInt(killmailStats?.totalIskLost) ?? 0n,
      averageParticipants: Number(participantStats?.avgParticipants ?? 0),
      mostUsedShips: mostUsedShips.map((ship) => ({
        shipTypeId: toBigInt(ship.shipTypeId) ?? 0n,
        count: Number(ship.count),
      })),
      topOpponents: topOpponents
        .map((opponent) => ({
          allianceId: toBigInt(opponent.opponentAllianceId) ?? 0n,
          battleCount: Number(opponent.battleCount),
        }))
        .filter((o) => o.allianceId !== 0n),
      topPilots: topPilots.map((pilot) => ({
        characterId: toBigInt(pilot.characterId) ?? 0n,
        battleCount: Number(pilot.battleCount),
      })),
    };
  }

  async getCharacterStatistics(characterId: bigint) {
    // Get all battles involving this character
    const battleIds = await this.db
      .selectFrom('killmail_events')
      .select('battleId')
      .distinct()
      .where('battleId', 'is not', null)
      .where(
        sql<boolean>`("killmail_events"."victim_character_id" = CAST(${serializeBigIntRequired(
          characterId,
        )} AS bigint) OR CAST(${serializeBigIntRequired(
          characterId,
        )} AS bigint) = ANY("killmail_events"."attacker_character_ids"))`,
      )
      .execute();

    const battleIdList = battleIds
      .map((row) => row.battleId)
      .filter((id): id is string => id !== null);

    if (battleIdList.length === 0) {
      return null;
    }

    // Get kills and losses count
    const killLossStats = await this.db
      .selectFrom('killmail_events')
      .select((eb) => [
        eb.fn
          .count(eb.case().when('victimCharacterId', '=', characterId).then(1).end())
          .as('totalLosses'),
        eb.fn
          .count(
            eb
              .case()
              .when(sql<boolean>`${characterId} = ANY(attacker_character_ids)`, '=', true)
              .then(1)
              .end(),
          )
          .as('totalKills'),
        eb.fn
          .sum(
            eb
              .case()
              .when('victimCharacterId', '=', characterId)
              .then(sql<string>`COALESCE(isk_value, 0)`)
              .else(sql<string>`0`)
              .end(),
          )
          .as('totalIskLost'),
        eb.fn
          .sum(
            eb
              .case()
              .when(sql<boolean>`${characterId} = ANY(attacker_character_ids)`, '=', true)
              .then(sql<string>`COALESCE(isk_value, 0)`)
              .else(sql<string>`0`)
              .end(),
          )
          .as('totalIskDestroyed'),
      ])
      .where('battleId', 'in', battleIdList)
      .executeTakeFirst();

    // Get most used ships
    const mostUsedShips = await this.db
      .selectFrom('battle_participants')
      .select((eb) => ['shipTypeId', eb.fn.count('shipTypeId').as('count')])
      .where('battleId', 'in', battleIdList)
      .where('characterId', '=', characterId)
      .where('shipTypeId', 'is not', null)
      .groupBy('shipTypeId')
      .orderBy('count', 'desc')
      .limit(10)
      .execute();

    // Get top opponents
    const topOpponents = await this.db
      .selectFrom(
        sql<{ opponentAllianceId: string }>`
          (
            SELECT victim_alliance_id as opponent_alliance_id
            FROM killmail_events
            WHERE battle_id IN (${sql.join(battleIdList.map((id) => sql.lit(id)))})
              AND CAST(${serializeBigIntRequired(characterId)} AS bigint) = ANY(attacker_character_ids)
              AND victim_alliance_id IS NOT NULL
            UNION ALL
            SELECT UNNEST(attacker_alliance_ids) as opponent_alliance_id
            FROM killmail_events
            WHERE battle_id IN (${sql.join(battleIdList.map((id) => sql.lit(id)))})
              AND victim_character_id = CAST(${serializeBigIntRequired(characterId)} AS bigint)
          )
        `.as('opponents'),
      )
      .select((eb) => ['opponentAllianceId', eb.fn.countAll().as('battleCount')])
      .groupBy('opponentAllianceId')
      .orderBy('battleCount', 'desc')
      .limit(10)
      .execute();

    // Get favorite systems
    const favoriteSystems = await this.db
      .selectFrom('battles')
      .select((eb) => ['systemId', eb.fn.countAll().as('battleCount')])
      .where('id', 'in', battleIdList)
      .groupBy('systemId')
      .orderBy('battleCount', 'desc')
      .limit(10)
      .execute();

    return {
      totalBattles: battleIdList.length,
      totalKills: Number(killLossStats?.totalKills ?? 0),
      totalLosses: Number(killLossStats?.totalLosses ?? 0),
      totalIskDestroyed: toBigInt(killLossStats?.totalIskDestroyed) ?? 0n,
      totalIskLost: toBigInt(killLossStats?.totalIskLost) ?? 0n,
      mostUsedShips: mostUsedShips.map((ship) => ({
        shipTypeId: toBigInt(ship.shipTypeId) ?? 0n,
        count: Number(ship.count),
      })),
      topOpponents: topOpponents
        .map((opponent) => ({
          allianceId: toBigInt(opponent.opponentAllianceId) ?? 0n,
          battleCount: Number(opponent.battleCount),
        }))
        .filter((o) => o.allianceId !== 0n),
      favoriteSystems: favoriteSystems.map((system) => ({
        systemId: toBigInt(system.systemId) ?? 0n,
        battleCount: Number(system.battleCount),
      })),
    };
  }

  /**
   * Count battles created since a given date
   */
  async countCreatedSince(since: Date): Promise<number> {
    const result = await this.db
      .selectFrom('battles')
      .select((eb) => eb.fn.count<string>('id').as('count'))
      .where('createdAt', '>=', since)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * Count battles in a time range (by start time)
   */
  async countInTimeRange(startTime: Date, endTime: Date): Promise<number> {
    const result = await this.db
      .selectFrom('battles')
      .select((eb) => eb.fn.count<string>('id').as('count'))
      .where('startTime', '>=', startTime)
      .where('startTime', '<=', endTime)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * Delete battles in a time range (for reclustering)
   */
  async deleteInTimeRange(startTime: Date, endTime: Date): Promise<void> {
    await this.db
      .deleteFrom('battles')
      .where('startTime', '>=', startTime)
      .where('startTime', '<=', endTime)
      .execute();
  }
}
