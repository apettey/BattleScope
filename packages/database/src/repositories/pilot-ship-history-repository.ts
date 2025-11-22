import { sql } from 'kysely';
import type { DatabaseClient } from '../client.js';
import type {
  PilotShipHistoryInsert,
  PilotShipHistoryRecord,
  CharacterShipSummary,
  CharacterLossRecord,
} from '../types.js';
import { serializeBigIntRequired, toBigInt } from './utils.js';

const nowSql = sql<Date>`now()`;

export class PilotShipHistoryRepository {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Insert multiple ship history records, ignoring duplicates
   */
  async insertBatch(records: PilotShipHistoryInsert[]): Promise<number> {
    if (records.length === 0) {
      return 0;
    }

    const values = records.map((record) => ({
      killmailId: serializeBigIntRequired(record.killmailId),
      characterId: serializeBigIntRequired(record.characterId),
      shipTypeId: serializeBigIntRequired(record.shipTypeId),
      allianceId: record.allianceId ? serializeBigIntRequired(record.allianceId) : null,
      corpId: record.corpId ? serializeBigIntRequired(record.corpId) : null,
      systemId: serializeBigIntRequired(record.systemId),
      isLoss: record.isLoss,
      shipValue: record.shipValue ? serializeBigIntRequired(record.shipValue) : null,
      killmailValue: record.killmailValue ? serializeBigIntRequired(record.killmailValue) : null,
      occurredAt: record.occurredAt,
      zkbUrl: record.zkbUrl,
      createdAt: nowSql,
    }));

    const result = await this.db
      .insertInto('pilot_ship_history')
      .values(values)
      .onConflict((oc) => oc.constraint('unique_pilot_killmail').doNothing())
      .execute();

    return result.length;
  }

  /**
   * Get aggregated ship statistics for a character
   */
  async getCharacterShipSummary(characterId: bigint, limit = 20): Promise<CharacterShipSummary[]> {
    const rows = await this.db
      .selectFrom('pilot_ship_history')
      .select([
        'shipTypeId',
        (eb) => eb.fn.count('id').as('timesFlown'),
        (eb) => eb.fn.sum(sql<number>`CASE WHEN is_loss THEN 0 ELSE 1 END`).as('kills'),
        (eb) => eb.fn.sum(sql<number>`CASE WHEN is_loss THEN 1 ELSE 0 END`).as('losses'),
        (eb) =>
          eb.fn
            .coalesce(
              eb.fn.sum(sql<bigint>`CASE WHEN NOT is_loss THEN killmail_value ELSE 0 END`),
              sql<bigint>`0`,
            )
            .as('iskDestroyed'),
        (eb) =>
          eb.fn
            .coalesce(
              eb.fn.sum(sql<bigint>`CASE WHEN is_loss THEN ship_value ELSE 0 END`),
              sql<bigint>`0`,
            )
            .as('iskLost'),
      ])
      .where('characterId', '=', characterId)
      .groupBy('shipTypeId')
      .orderBy(sql`count(id)`, 'desc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      shipTypeId: toBigInt(row.shipTypeId) ?? 0n,
      timesFlown: Number(row.timesFlown),
      kills: Number(row.kills ?? 0),
      losses: Number(row.losses ?? 0),
      iskDestroyed: toBigInt(row.iskDestroyed) ?? 0n,
      iskLost: toBigInt(row.iskLost) ?? 0n,
    }));
  }

  /**
   * Get character's total ISK statistics
   */
  async getCharacterIskTotals(characterId: bigint): Promise<{
    totalIskDestroyed: bigint;
    totalIskLost: bigint;
    totalKills: number;
    totalLosses: number;
  }> {
    const row = await this.db
      .selectFrom('pilot_ship_history')
      .select([
        (eb) =>
          eb.fn
            .coalesce(
              eb.fn.sum(sql<bigint>`CASE WHEN NOT is_loss THEN killmail_value ELSE 0 END`),
              sql<bigint>`0`,
            )
            .as('totalIskDestroyed'),
        (eb) =>
          eb.fn
            .coalesce(
              eb.fn.sum(sql<bigint>`CASE WHEN is_loss THEN ship_value ELSE 0 END`),
              sql<bigint>`0`,
            )
            .as('totalIskLost'),
        (eb) => eb.fn.sum(sql<number>`CASE WHEN NOT is_loss THEN 1 ELSE 0 END`).as('totalKills'),
        (eb) => eb.fn.sum(sql<number>`CASE WHEN is_loss THEN 1 ELSE 0 END`).as('totalLosses'),
      ])
      .where('characterId', '=', characterId)
      .executeTakeFirst();

    return {
      totalIskDestroyed: toBigInt(row?.totalIskDestroyed) ?? 0n,
      totalIskLost: toBigInt(row?.totalIskLost) ?? 0n,
      totalKills: Number(row?.totalKills ?? 0),
      totalLosses: Number(row?.totalLosses ?? 0),
    };
  }

  /**
   * Get all losses for a character with pagination
   */
  async getCharacterLosses(
    characterId: bigint,
    limit = 50,
    cursor?: Date,
  ): Promise<CharacterLossRecord[]> {
    let query = this.db
      .selectFrom('pilot_ship_history')
      .select(['killmailId', 'zkbUrl', 'shipTypeId', 'shipValue', 'systemId', 'occurredAt'])
      .where('characterId', '=', characterId)
      .where('isLoss', '=', true)
      .orderBy('occurredAt', 'desc')
      .limit(limit);

    if (cursor) {
      query = query.where('occurredAt', '<', cursor);
    }

    const rows = await query.execute();

    return rows.map((row) => ({
      killmailId: toBigInt(row.killmailId) ?? 0n,
      zkbUrl: row.zkbUrl,
      shipTypeId: toBigInt(row.shipTypeId) ?? 0n,
      shipValue: toBigInt(row.shipValue),
      systemId: toBigInt(row.systemId) ?? 0n,
      occurredAt: row.occurredAt,
    }));
  }

  /**
   * Get killmails for a specific character + ship combination
   */
  async getCharacterShipKillmails(
    characterId: bigint,
    shipTypeId: bigint,
    limit = 50,
    cursor?: Date,
  ): Promise<PilotShipHistoryRecord[]> {
    let query = this.db
      .selectFrom('pilot_ship_history')
      .selectAll()
      .where('characterId', '=', characterId)
      .where('shipTypeId', '=', shipTypeId)
      .orderBy('occurredAt', 'desc')
      .limit(limit);

    if (cursor) {
      query = query.where('occurredAt', '<', cursor);
    }

    const rows = await query.execute();

    return rows.map((row) => ({
      id: row.id,
      killmailId: toBigInt(row.killmailId) ?? 0n,
      characterId: toBigInt(row.characterId) ?? 0n,
      shipTypeId: toBigInt(row.shipTypeId) ?? 0n,
      allianceId: toBigInt(row.allianceId),
      corpId: toBigInt(row.corpId),
      systemId: toBigInt(row.systemId) ?? 0n,
      isLoss: row.isLoss,
      shipValue: toBigInt(row.shipValue),
      killmailValue: toBigInt(row.killmailValue),
      occurredAt: row.occurredAt,
      zkbUrl: row.zkbUrl,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Count total records in the table
   */
  async countRecords(): Promise<number> {
    const result = await this.db
      .selectFrom('pilot_ship_history')
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * Delete all records (for full reset)
   */
  async truncate(): Promise<void> {
    await sql`TRUNCATE TABLE pilot_ship_history`.execute(this.db);
  }

  /**
   * Delete records after a specific date (for incremental reset)
   */
  async deleteAfterDate(fromDate: Date): Promise<number> {
    const result = await this.db
      .deleteFrom('pilot_ship_history')
      .where('occurredAt', '>=', fromDate)
      .execute();

    return Number(result[0]?.numDeletedRows ?? 0);
  }
}
