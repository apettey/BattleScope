import { deriveSecurityType } from '@battlescope/shared';
import type { DatabaseClient } from '../client.js';
import type { KillmailEventInsert, KillmailEventRecord, KillmailFeedItem } from '../types.js';
import { KillmailEventSchema } from '../types.js';
import {
  serializeBigInt,
  serializeBigIntArray,
  serializeBigIntRequired,
  toBigInt,
  toBigIntArray,
} from './utils.js';

const isUniqueViolation = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const pgCode = (error as { code?: string }).code;
  if (pgCode === '23505') {
    return true;
  }

  const message = (error as { message?: string }).message ?? '';
  return message.includes('duplicate key value');
};

interface FeedQueryOptions {
  limit: number;
}

interface FeedSinceOptions extends FeedQueryOptions {
  since?: Date;
  after?: { occurredAt: Date; killmailId: bigint };
}

const toParticipantCount = (event: {
  victimCharacterId: bigint | null;
  attackerCharacterIds: readonly bigint[];
}): number => {
  const victimCount = event.victimCharacterId ? 1 : 0;
  const attackers = event.attackerCharacterIds.length;
  const total = victimCount + attackers;
  return total > 0 ? total : 1;
};

export class KillmailRepository {
  constructor(private readonly db: DatabaseClient) {}

  async insert(event: KillmailEventInsert): Promise<boolean> {
    const record = KillmailEventSchema.parse({
      ...event,
      fetchedAt: event.fetchedAt ?? new Date(),
    });

    try {
      await this.db
        .insertInto('killmail_events')
        .values({
          killmailId: serializeBigIntRequired(record.killmailId),
          systemId: serializeBigIntRequired(record.systemId),
          occurredAt: record.occurredAt,
          victimAllianceId: serializeBigInt(record.victimAllianceId),
          victimCorpId: serializeBigInt(record.victimCorpId),
          victimCharacterId: serializeBigInt(record.victimCharacterId),
          attackerAllianceIds: serializeBigIntArray(record.attackerAllianceIds),
          attackerCorpIds: serializeBigIntArray(record.attackerCorpIds),
          attackerCharacterIds: serializeBigIntArray(record.attackerCharacterIds),
          iskValue: serializeBigInt(record.iskValue),
          zkbUrl: record.zkbUrl,
          fetchedAt: record.fetchedAt,
        })
        .execute();
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  async fetchUnprocessed(limit = 500, delayMinutes = 30): Promise<KillmailEventRecord[]> {
    const cutoffTime = new Date(Date.now() - delayMinutes * 60 * 1000);
    const rows = await this.db
      .selectFrom('killmail_events')
      .selectAll()
      .where('processedAt', 'is', null)
      .where('occurredAt', '<=', cutoffTime)
      .orderBy('occurredAt', 'asc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      ...row,
      killmailId: toBigInt(row.killmailId) ?? 0n,
      systemId: toBigInt(row.systemId) ?? 0n,
      victimAllianceId: toBigInt(row.victimAllianceId),
      victimCorpId: toBigInt(row.victimCorpId),
      victimCharacterId: toBigInt(row.victimCharacterId),
      attackerAllianceIds: row.attackerAllianceIds ? toBigIntArray(row.attackerAllianceIds) : [],
      attackerCorpIds: row.attackerCorpIds ? toBigIntArray(row.attackerCorpIds) : [],
      attackerCharacterIds: row.attackerCharacterIds ? toBigIntArray(row.attackerCharacterIds) : [],
      iskValue: toBigInt(row.iskValue),
    }));
  }

  async markAsProcessed(
    killmailIds: readonly bigint[],
    battleId: string | null,
    processedAt = new Date(),
  ): Promise<void> {
    if (killmailIds.length === 0) {
      return;
    }

    await this.db
      .updateTable('killmail_events')
      .set({
        battleId,
        processedAt,
      })
      .where('killmailId', 'in', killmailIds)
      .execute();
  }

  private toFeedItem(row: {
    killmailId: bigint | number | string | null | undefined;
    systemId: bigint | number | string | null | undefined;
    occurredAt: Date;
    victimAllianceId: bigint | number | string | null | undefined;
    victimCorpId: bigint | number | string | null | undefined;
    victimCharacterId: bigint | number | string | null | undefined;
    attackerAllianceIds: readonly (bigint | number | string | null | undefined)[] | null;
    attackerCorpIds: readonly (bigint | number | string | null | undefined)[] | null;
    attackerCharacterIds: readonly (bigint | number | string | null | undefined)[] | null;
    iskValue: bigint | number | string | null | undefined;
    zkbUrl: string;
    battleId: string | null;
  }): KillmailFeedItem {
    const killmailId = toBigInt(row.killmailId) ?? 0n;
    const systemId = toBigInt(row.systemId) ?? 0n;
    const attackerAllianceIds = row.attackerAllianceIds
      ? toBigIntArray(row.attackerAllianceIds)
      : [];
    const attackerCorpIds = row.attackerCorpIds ? toBigIntArray(row.attackerCorpIds) : [];
    const attackerCharacterIds = row.attackerCharacterIds
      ? toBigIntArray(row.attackerCharacterIds)
      : [];

    const victimAllianceId = toBigInt(row.victimAllianceId);
    const victimCorpId = toBigInt(row.victimCorpId);
    const victimCharacterId = toBigInt(row.victimCharacterId);

    const participantCount = toParticipantCount({
      victimCharacterId,
      attackerCharacterIds,
    });

    return {
      killmailId,
      systemId,
      occurredAt: row.occurredAt,
      securityType: deriveSecurityType(systemId),
      victimAllianceId,
      victimCorpId,
      victimCharacterId,
      attackerAllianceIds,
      attackerCorpIds,
      attackerCharacterIds,
      iskValue: toBigInt(row.iskValue),
      zkbUrl: row.zkbUrl,
      battleId: row.battleId ?? null,
      participantCount,
    };
  }

  async fetchRecentFeed(options: FeedQueryOptions): Promise<KillmailFeedItem[]> {
    const limit = options.limit;
    const rows = await this.db
      .selectFrom('killmail_events')
      .select([
        'killmailId',
        'systemId',
        'occurredAt',
        'victimAllianceId',
        'victimCorpId',
        'victimCharacterId',
        'attackerAllianceIds',
        'attackerCorpIds',
        'attackerCharacterIds',
        'iskValue',
        'zkbUrl',
        'battleId',
      ])
      .orderBy('occurredAt', 'desc')
      .orderBy('killmailId', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row) => this.toFeedItem(row));
  }

  async fetchFeedSince(options: FeedSinceOptions): Promise<KillmailFeedItem[]> {
    const limit = options.limit;
    const { after, since } = options;
    let query = this.db
      .selectFrom('killmail_events')
      .select([
        'killmailId',
        'systemId',
        'occurredAt',
        'victimAllianceId',
        'victimCorpId',
        'victimCharacterId',
        'attackerAllianceIds',
        'attackerCorpIds',
        'attackerCharacterIds',
        'iskValue',
        'zkbUrl',
        'battleId',
      ]);

    if (after) {
      query = query.where((eb) =>
        eb.or([
          eb('occurredAt', '>', after.occurredAt),
          eb.and([
            eb('occurredAt', '=', after.occurredAt),
            eb('killmailId', '>', after.killmailId),
          ]),
        ]),
      );
    } else if (since) {
      query = query.where('occurredAt', '>', since);
    }

    const rows = await query
      .orderBy('occurredAt', 'asc')
      .orderBy('killmailId', 'asc')
      .limit(limit)
      .execute();

    return rows.map((row) => this.toFeedItem(row));
  }

  /**
   * Count killmails since a given date
   */
  async countSince(since: Date): Promise<number> {
    const result = await this.db
      .selectFrom('killmail_events')
      .select((eb) => eb.fn.count<string>('killmailId').as('count'))
      .where('occurredAt', '>=', since)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * Count unprocessed killmails
   */
  async countUnprocessed(): Promise<number> {
    const result = await this.db
      .selectFrom('killmail_events')
      .select((eb) => eb.fn.count<string>('killmailId').as('count'))
      .where('processedAt', 'is', null)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * Get recently processed killmails
   */
  async getRecentProcessed(limit: number): Promise<KillmailEventRecord[]> {
    const rows = await this.db
      .selectFrom('killmail_events')
      .selectAll()
      .where('processedAt', 'is not', null)
      .orderBy('processedAt', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      ...row,
      killmailId: toBigInt(row.killmailId) ?? 0n,
      systemId: toBigInt(row.systemId) ?? 0n,
      victimAllianceId: toBigInt(row.victimAllianceId),
      victimCorpId: toBigInt(row.victimCorpId),
      victimCharacterId: toBigInt(row.victimCharacterId),
      attackerAllianceIds: row.attackerAllianceIds ? toBigIntArray(row.attackerAllianceIds) : [],
      attackerCorpIds: row.attackerCorpIds ? toBigIntArray(row.attackerCorpIds) : [],
      attackerCharacterIds: row.attackerCharacterIds ? toBigIntArray(row.attackerCharacterIds) : [],
      iskValue: toBigInt(row.iskValue),
    }));
  }

  /**
   * Count killmails in a time range
   */
  async countInTimeRange(startTime: Date, endTime: Date): Promise<number> {
    const result = await this.db
      .selectFrom('killmail_events')
      .select((eb) => eb.fn.count<string>('killmailId').as('count'))
      .where('occurredAt', '>=', startTime)
      .where('occurredAt', '<=', endTime)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * Reset processedAt for killmails in a time range (for reclustering)
   */
  async resetProcessedInTimeRange(startTime: Date, endTime: Date): Promise<void> {
    await this.db
      .updateTable('killmail_events')
      .set({
        processedAt: null,
        battleId: null,
      })
      .where('occurredAt', '>=', startTime)
      .where('occurredAt', '<=', endTime)
      .execute();
  }

  /**
   * Find killmails by their IDs
   */
  async findByIds(killmailIds: bigint[]): Promise<KillmailEventRecord[]> {
    if (killmailIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .selectFrom('killmail_events')
      .selectAll()
      .where('killmailId', 'in', killmailIds)
      .execute();

    return rows.map((row) => ({
      ...row,
      killmailId: toBigInt(row.killmailId) ?? 0n,
      systemId: toBigInt(row.systemId) ?? 0n,
      victimAllianceId: toBigInt(row.victimAllianceId),
      victimCorpId: toBigInt(row.victimCorpId),
      victimCharacterId: toBigInt(row.victimCharacterId),
      attackerAllianceIds: row.attackerAllianceIds ? toBigIntArray(row.attackerAllianceIds) : [],
      attackerCorpIds: row.attackerCorpIds ? toBigIntArray(row.attackerCorpIds) : [],
      attackerCharacterIds: row.attackerCharacterIds ? toBigIntArray(row.attackerCharacterIds) : [],
      iskValue: toBigInt(row.iskValue),
    }));
  }
}
