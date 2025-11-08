import type { Kysely } from 'kysely';
import type { Database } from '../../schema.js';

export interface AuditLogRecord {
  id: string;
  actorAccountId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  actorAccountId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export interface ListAuditLogsOptions {
  actorAccountId?: string;
  action?: string;
  targetType?: string;
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Repository for managing audit logs
 */
export class AuditLogRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Create an audit log entry
   */
  async create(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    const result = await this.db
      .insertInto('audit_logs')
      .values({
        actorAccountId: input.actorAccountId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata ?? {},
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: result.id,
      actorAccountId: result.actorAccountId,
      action: result.action,
      targetType: result.targetType,
      targetId: result.targetId,
      metadata: result.metadata,
      createdAt: result.createdAt,
    };
  }

  /**
   * Get audit log by ID
   */
  async getById(id: string): Promise<AuditLogRecord | null> {
    const result = await this.db
      .selectFrom('audit_logs')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return result
      ? {
          id: result.id,
          actorAccountId: result.actorAccountId,
          action: result.action,
          targetType: result.targetType,
          targetId: result.targetId,
          metadata: result.metadata,
          createdAt: result.createdAt,
        }
      : null;
  }

  /**
   * List audit logs with filters
   */
  async list(
    options: ListAuditLogsOptions = {},
  ): Promise<{ logs: AuditLogRecord[]; total: number }> {
    const {
      actorAccountId,
      action,
      targetType,
      limit = 50,
      offset = 0,
      startDate,
      endDate,
    } = options;

    let queryBuilder = this.db.selectFrom('audit_logs').selectAll();

    // Apply filters
    if (actorAccountId) {
      queryBuilder = queryBuilder.where('actorAccountId', '=', actorAccountId);
    }

    if (action) {
      queryBuilder = queryBuilder.where('action', '=', action);
    }

    if (targetType) {
      queryBuilder = queryBuilder.where('targetType', '=', targetType);
    }

    if (startDate) {
      queryBuilder = queryBuilder.where('createdAt', '>=', startDate);
    }

    if (endDate) {
      queryBuilder = queryBuilder.where('createdAt', '<=', endDate);
    }

    // Get total count
    const countResult = await queryBuilder
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();
    const total = Number(countResult?.count ?? 0);

    // Get paginated results
    const results = await queryBuilder
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return {
      logs: results.map((r) => ({
        id: r.id,
        actorAccountId: r.actorAccountId,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        metadata: r.metadata,
        createdAt: r.createdAt,
      })),
      total,
    };
  }

  /**
   * Get recent audit logs for an account
   */
  async getRecentByAccount(accountId: string, limit: number = 10): Promise<AuditLogRecord[]> {
    const results = await this.db
      .selectFrom('audit_logs')
      .selectAll()
      .where('actorAccountId', '=', accountId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();

    return results.map((r) => ({
      id: r.id,
      actorAccountId: r.actorAccountId,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Delete old audit logs (for cleanup/retention policies)
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.db
      .deleteFrom('audit_logs')
      .where('createdAt', '<', date)
      .executeTakeFirst();

    return Number(result.numDeletedRows ?? 0);
  }
}
