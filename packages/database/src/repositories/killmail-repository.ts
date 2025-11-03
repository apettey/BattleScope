import type { DatabaseClient } from '../client.js';
import type { KillmailEventInsert, KillmailEventRecord } from '../types.js';
import { KillmailEventSchema } from '../types.js';
import { serializeBigInt, toBigInt } from './utils.js';

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
          killmailId: record.killmailId,
          systemId: record.systemId,
          occurredAt: record.occurredAt,
          victimAllianceId: record.victimAllianceId,
          victimCorpId: record.victimCorpId,
          victimCharacterId: serializeBigInt(record.victimCharacterId),
          attackerAllianceIds: record.attackerAllianceIds,
          attackerCorpIds: record.attackerCorpIds,
          attackerCharacterIds: record.attackerCharacterIds.map((id) => id.toString()),
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

  async fetchUnprocessed(limit = 500): Promise<KillmailEventRecord[]> {
    const rows = await this.db
      .selectFrom('killmail_events')
      .selectAll()
      .where('processedAt', 'is', null)
      .orderBy('occurredAt', 'asc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      ...row,
      victimCharacterId: toBigInt(row.victimCharacterId),
      attackerCharacterIds: row.attackerCharacterIds
        .map((value) => toBigInt(value))
        .filter((value): value is bigint => value !== null),
      iskValue: toBigInt(row.iskValue),
    }));
  }

  async markAsProcessed(
    killmailIds: readonly number[],
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
      .where('killmailId', 'in', killmailIds as number[])
      .execute();
  }
}
