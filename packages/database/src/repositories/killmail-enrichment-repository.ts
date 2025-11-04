import { sql } from 'kysely';
import type { DatabaseClient } from '../client.js';
import {
  KillmailEnrichmentSchema,
  KillmailEnrichmentStatusSchema,
  type KillmailEnrichmentRecord,
} from '../types.js';
import { serializeBigIntRequired, toBigInt } from './utils.js';

const nowSql = sql<Date>`now()`;

export class KillmailEnrichmentRepository {
  constructor(private readonly db: DatabaseClient) {}

  async upsertPending(killmailId: bigint): Promise<void> {
    await this.db
      .insertInto('killmail_enrichments')
      .values({
        killmailId: serializeBigIntRequired(killmailId),
        status: 'pending',
        payload: null,
        error: null,
        fetchedAt: null,
        createdAt: nowSql,
        updatedAt: nowSql,
      })
      .onConflict((oc) =>
        oc.column('killmailId').doUpdateSet({
          status: 'pending',
          payload: null,
          error: null,
          fetchedAt: null,
          updatedAt: nowSql,
        }),
      )
      .execute();
  }

  async markProcessing(killmailId: bigint): Promise<void> {
    await this.db
      .updateTable('killmail_enrichments')
      .set({ status: 'processing', updatedAt: nowSql, error: null })
      .where('killmailId', '=', killmailId)
      .execute();
  }

  async markSucceeded(
    killmailId: bigint,
    payload: Record<string, unknown>,
    fetchedAt: Date,
  ): Promise<void> {
    await this.db
      .insertInto('killmail_enrichments')
      .values({
        killmailId: serializeBigIntRequired(killmailId),
        status: 'succeeded',
        payload,
        error: null,
        fetchedAt,
        updatedAt: nowSql,
        createdAt: nowSql,
      })
      .onConflict((oc) =>
        oc.column('killmailId').doUpdateSet({
          status: 'succeeded',
          payload,
          error: null,
          fetchedAt,
          updatedAt: nowSql,
        }),
      )
      .execute();
  }

  async markFailed(killmailId: bigint, error: string): Promise<void> {
    await this.db
      .insertInto('killmail_enrichments')
      .values({
        killmailId: serializeBigIntRequired(killmailId),
        status: 'failed',
        error,
        payload: null,
        fetchedAt: null,
        updatedAt: nowSql,
        createdAt: nowSql,
      })
      .onConflict((oc) =>
        oc.column('killmailId').doUpdateSet({
          status: 'failed',
          error,
          payload: null,
          fetchedAt: null,
          updatedAt: nowSql,
        }),
      )
      .execute();
  }

  async find(killmailId: bigint): Promise<KillmailEnrichmentRecord | null> {
    const record = await this.db
      .selectFrom('killmail_enrichments')
      .selectAll()
      .where('killmailId', '=', killmailId)
      .executeTakeFirst();

    if (!record) {
      return null;
    }

    const parsed = KillmailEnrichmentSchema.parse({
      ...record,
      killmailId: toBigInt(record.killmailId) ?? 0n,
    });
    return parsed;
  }

  async listByStatus(status: string, limit = 100): Promise<KillmailEnrichmentRecord[]> {
    KillmailEnrichmentStatusSchema.parse(status);
    const rows = await this.db
      .selectFrom('killmail_enrichments')
      .selectAll()
      .where('status', '=', status)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row) =>
      KillmailEnrichmentSchema.parse({
        ...row,
        killmailId: toBigInt(row.killmailId) ?? 0n,
      }),
    );
  }
}
