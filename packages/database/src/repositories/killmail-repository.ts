import type { DatabaseClient } from '../client.js';
import type { KillmailEventInsert, KillmailEventRecord } from '../types.js';
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
      .where(
        'killmailId',
        'in',
        killmailIds.map((id) => serializeBigIntRequired(id)),
      )
      .execute();
  }
}
