import type { Kysely, Selectable } from 'kysely';
import type { Database, AccountsTable, CharactersTable } from '../../schema.js';

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
   * Set primary character for an account
   */
  async setPrimaryCharacter(accountId: string, characterId: string): Promise<void> {
    await this.db
      .updateTable('accounts')
      .set({ primaryCharacterId: characterId })
      .where('id', '=', accountId)
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

    // Get total count (create separate query without selectAll)
    const countQuery = this.db.selectFrom('accounts');

    // Apply same filters as main query
    let countBuilder = countQuery;
    if (query) {
      countBuilder = countBuilder.where((eb) =>
        eb.or([eb('displayName', 'ilike', `%${query}%`), eb('email', 'ilike', `%${query}%`)]),
      );
    }
    if (!includeBlocked) {
      countBuilder = countBuilder.where('isBlocked', '=', false);
    }
    if (!includeDeleted) {
      countBuilder = countBuilder.where('isDeleted', '=', false);
    }

    const countResult = await countBuilder
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
   * Get detailed account information with characters grouped by alliance and corporation
   * Used for admin View User Page
   */
  async getDetailWithCharactersGrouped(
    accountId: string,
  ): Promise<AccountDetailWithCharacters | null> {
    const account = await this.getById(accountId);
    if (!account) {
      return null;
    }

    // Get all characters for this account
    const characters = await this.db
      .selectFrom('characters')
      .selectAll()
      .where('accountId', '=', accountId)
      .orderBy('eveCharacterName', 'asc')
      .execute();

    // Get primary character details if exists
    let primaryCharacter: CharacterDetail | null = null;
    if (account.primaryCharacterId) {
      const primaryChar = characters.find((c) => c.id === account.primaryCharacterId);
      if (primaryChar) {
        primaryCharacter = this.mapCharacterToDetail(primaryChar, true);
      }
    }

    // Group characters by alliance and corporation
    const groupedMap = new Map<
      string,
      {
        allianceId: bigint | null;
        allianceName: string | null;
        corporations: Map<
          string,
          {
            corpId: bigint;
            corpName: string;
            characters: CharacterDetail[];
          }
        >;
      }
    >();

    for (const char of characters) {
      const allianceKey = char.allianceId?.toString() ?? 'null';
      const corpKey = char.corpId.toString();

      // Get or create alliance group
      if (!groupedMap.has(allianceKey)) {
        groupedMap.set(allianceKey, {
          allianceId: char.allianceId,
          allianceName: char.allianceName,
          corporations: new Map(),
        });
      }

      const allianceGroup = groupedMap.get(allianceKey)!;

      // Get or create corporation group
      if (!allianceGroup.corporations.has(corpKey)) {
        allianceGroup.corporations.set(corpKey, {
          corpId: char.corpId,
          corpName: char.corpName,
          characters: [],
        });
      }

      const corpGroup = allianceGroup.corporations.get(corpKey)!;
      corpGroup.characters.push(
        this.mapCharacterToDetail(char, char.id === account.primaryCharacterId),
      );
    }

    // Convert map to array format
    const charactersGrouped = Array.from(groupedMap.values()).map((alliance) => ({
      allianceId: alliance.allianceId?.toString() ?? null,
      allianceName: alliance.allianceName,
      corporations: Array.from(alliance.corporations.values()).map((corp) => ({
        corpId: corp.corpId.toString(),
        corpName: corp.corpName,
        characters: corp.characters,
      })),
    }));

    return {
      account,
      primaryCharacter,
      charactersGrouped,
      stats: {
        totalCharacters: characters.length,
      },
    };
  }

  /**
   * Promote account to SuperAdmin
   */
  async promoteToSuperAdmin(accountId: string): Promise<void> {
    await this.db
      .updateTable('accounts')
      .set({ isSuperAdmin: true })
      .where('id', '=', accountId)
      .execute();
  }

  /**
   * Demote account from SuperAdmin
   */
  async demoteFromSuperAdmin(accountId: string): Promise<void> {
    await this.db
      .updateTable('accounts')
      .set({ isSuperAdmin: false })
      .where('id', '=', accountId)
      .execute();
  }

  /**
   * Count total SuperAdmins (safety check to prevent demoting last admin)
   */
  async countSuperAdmins(): Promise<number> {
    const result = await this.db
      .selectFrom('accounts')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('isSuperAdmin', '=', true)
      .where('isDeleted', '=', false)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * Map character database result to CharacterDetail
   */
  private mapCharacterToDetail(
    char: Selectable<CharactersTable>,
    isPrimary: boolean,
  ): CharacterDetail {
    const now = new Date();
    const expiresAt = char.esiTokenExpiresAt ? new Date(char.esiTokenExpiresAt) : new Date(0);
    const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    let tokenStatus: 'valid' | 'expiring' | 'expired';
    if (expiresAt < now) {
      tokenStatus = 'expired';
    } else if (daysUntilExpiry < 7) {
      tokenStatus = 'expiring';
    } else {
      tokenStatus = 'valid';
    }

    return {
      id: char.id,
      eveCharacterId: char.eveCharacterId.toString(),
      eveCharacterName: char.eveCharacterName,
      portraitUrl:
        char.portraitUrl ??
        `https://images.evetech.net/characters/${char.eveCharacterId}/portrait?size=128`,
      corpId: char.corpId.toString(),
      corpName: char.corpName,
      allianceId: char.allianceId?.toString() ?? null,
      allianceName: char.allianceName,
      isPrimary,
      scopes: char.scopes,
      tokenExpiresAt: char.esiTokenExpiresAt ?? new Date(0),
      tokenStatus,
      lastVerifiedAt: char.lastVerifiedAt ?? new Date(0),
      createdAt: char.createdAt,
    };
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

/**
 * Character detail for admin view
 */
export interface CharacterDetail {
  id: string;
  eveCharacterId: string;
  eveCharacterName: string;
  portraitUrl: string;
  corpId: string;
  corpName: string;
  allianceId: string | null;
  allianceName: string | null;
  isPrimary: boolean;
  scopes: string[];
  tokenExpiresAt: Date;
  tokenStatus: 'valid' | 'expiring' | 'expired';
  lastVerifiedAt: Date;
  createdAt: Date;
}

/**
 * Detailed account view with characters grouped by alliance/corporation
 */
export interface AccountDetailWithCharacters {
  account: AccountRecord;
  primaryCharacter: CharacterDetail | null;
  charactersGrouped: {
    allianceId: string | null;
    allianceName: string | null;
    corporations: {
      corpId: string;
      corpName: string;
      characters: CharacterDetail[];
    }[];
  }[];
  stats: {
    totalCharacters: number;
  };
}
