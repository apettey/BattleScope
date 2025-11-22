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

  /**
   * Find multiple enrichments by killmail IDs
   * Returns a Map for efficient lookup
   */
  async findByIds(killmailIds: bigint[]): Promise<Map<bigint, KillmailEnrichmentRecord>> {
    if (killmailIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .selectFrom('killmail_enrichments')
      .selectAll()
      .where('killmailId', 'in', killmailIds)
      .where('status', '=', 'succeeded')
      .execute();

    const result = new Map<bigint, KillmailEnrichmentRecord>();
    for (const row of rows) {
      const killmailId = toBigInt(row.killmailId) ?? 0n;
      const parsed = KillmailEnrichmentSchema.parse({
        ...row,
        killmailId,
      });
      result.set(killmailId, parsed);
    }

    return result;
  }

  /**
   * List all succeeded enrichments with pagination (for reset jobs)
   */
  async listSucceededPaginated(
    cursor: bigint | null,
    limit: number,
    fromDate?: Date,
  ): Promise<KillmailEnrichmentRecord[]> {
    let query = this.db
      .selectFrom('killmail_enrichments')
      .selectAll()
      .where('status', '=', 'succeeded')
      .orderBy('killmailId', 'asc')
      .limit(limit);

    if (cursor !== null) {
      query = query.where('killmailId', '>', cursor);
    }

    if (fromDate) {
      query = query.where('fetchedAt', '>=', fromDate);
    }

    const rows = await query.execute();

    return rows.map((row) =>
      KillmailEnrichmentSchema.parse({
        ...row,
        killmailId: toBigInt(row.killmailId) ?? 0n,
      }),
    );
  }

  /**
   * Count succeeded enrichments (for progress tracking)
   */
  async countSucceeded(fromDate?: Date): Promise<number> {
    let query = this.db
      .selectFrom('killmail_enrichments')
      .select((eb) => eb.fn.count('killmailId').as('count'))
      .where('status', '=', 'succeeded');

    if (fromDate) {
      query = query.where('fetchedAt', '>=', fromDate);
    }

    const result = await query.executeTakeFirst();
    return Number(result?.count ?? 0);
  }
}
