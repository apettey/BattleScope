import type { Kysely } from 'kysely';
import type { Database, AccountsTable } from '../../schema.js';

export interface AccountRecord {
  id: string;
  email: string | null;
  displayName: string;
  primaryCharacterId: string | null;
  isBlocked: boolean;
  isDeleted: boolean;
  isSuperAdmin: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAccountInput {
  email?: string | null;
  displayName: string;
  primaryCharacterId?: string | null;
  isSuperAdmin?: boolean;
}

export interface UpdateAccountInput {
  email?: string | null;
  displayName?: string;
  primaryCharacterId?: string | null;
  isBlocked?: boolean;
  isSuperAdmin?: boolean;
  lastLoginAt?: Date | null;
}

export interface AccountListOptions {
  query?: string;
  limit?: number;
  offset?: number;
  includeBlocked?: boolean;
  includeDeleted?: boolean;
}

/**
 * Repository for managing accounts
 */
export class AccountRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Create a new account
   */
  async create(input: CreateAccountInput): Promise<AccountRecord> {
    const result = await this.db
      .insertInto('accounts')
      .values({
        email: input.email ?? null,
        displayName: input.displayName,
        primaryCharacterId: input.primaryCharacterId ?? null,
        isSuperAdmin: input.isSuperAdmin ?? false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToRecord(result);
  }

  /**
   * Get account by ID
   */
  async getById(id: string): Promise<AccountRecord | null> {
    const result = await this.db
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', id)
      .where('isDeleted', '=', false)
      .executeTakeFirst();

    return result ? this.mapToRecord(result) : null;
  }

  /**
   * Get account by email
   */
  async getByEmail(email: string): Promise<AccountRecord | null> {
    const result = await this.db
      .selectFrom('accounts')
      .selectAll()
      .where('email', '=', email)
      .where('isDeleted', '=', false)
      .executeTakeFirst();

    return result ? this.mapToRecord(result) : null;
  }

  /**
   * Get account by primary character ID
   */
  async getByPrimaryCharacterId(characterId: string): Promise<AccountRecord | null> {
    const result = await this.db
      .selectFrom('accounts')
      .selectAll()
      .where('primaryCharacterId', '=', characterId)
      .where('isDeleted', '=', false)
      .executeTakeFirst();

    return result ? this.mapToRecord(result) : null;
  }

  /**
   * Update an account
   */
  async update(id: string, input: UpdateAccountInput): Promise<AccountRecord> {
    const result = await this.db
      .updateTable('accounts')
      .set(input)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToRecord(result);
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    await this.db
      .updateTable('accounts')
      .set({ lastLoginAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Block an account
   */
  async block(id: string): Promise<void> {
    await this.db.updateTable('accounts').set({ isBlocked: true }).where('id', '=', id).execute();
  }

  /**
   * Unblock an account
   */
  async unblock(id: string): Promise<void> {
    await this.db.updateTable('accounts').set({ isBlocked: false }).where('id', '=', id).execute();
  }

  /**
   * Soft delete an account
   */
  async delete(id: string): Promise<void> {
    await this.db.updateTable('accounts').set({ isDeleted: true }).where('id', '=', id).execute();
  }

  /**
   * List accounts with optional filters
   */
  async list(
    options: AccountListOptions = {},
  ): Promise<{ accounts: AccountRecord[]; total: number }> {
    const {
      query,
      limit = 20,
      offset = 0,
      includeBlocked = false,
      includeDeleted = false,
    } = options;

    let queryBuilder = this.db.selectFrom('accounts').selectAll();

    // Filter by query (search in display name or email)
    if (query) {
      queryBuilder = queryBuilder.where((eb) =>
        eb.or([eb('displayName', 'ilike', `%${query}%`), eb('email', 'ilike', `%${query}%`)]),
      );
    }

    // Filter by blocked status
    if (!includeBlocked) {
      queryBuilder = queryBuilder.where('isBlocked', '=', false);
    }

    // Filter by deleted status
    if (!includeDeleted) {
      queryBuilder = queryBuilder.where('isDeleted', '=', false);
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
      accounts: results.map((r) => this.mapToRecord(r)),
      total,
    };
  }

  /**
   * Check if account exists by email
   */
  async existsByEmail(email: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('accounts')
      .select('id')
      .where('email', '=', email)
      .where('isDeleted', '=', false)
      .executeTakeFirst();

    return !!result;
  }

  /**
   * Map database result to AccountRecord
   */
  private mapToRecord(row: unknown): AccountRecord {
    const r = row as AccountsTable;
    return {
      id: r.id as unknown as string,
      email: r.email,
      displayName: r.displayName,
      primaryCharacterId: r.primaryCharacterId,
      isBlocked: r.isBlocked as unknown as boolean,
      isDeleted: r.isDeleted as unknown as boolean,
      isSuperAdmin: r.isSuperAdmin as unknown as boolean,
      lastLoginAt: r.lastLoginAt,
      createdAt: r.createdAt as unknown as Date,
      updatedAt: r.updatedAt as unknown as Date,
    };
  }
}
