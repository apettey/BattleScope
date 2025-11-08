import type { Kysely } from 'kysely';
import type { Database, CharactersTable } from '../../schema.js';

export interface CharacterRecord {
  id: string;
  accountId: string;
  eveCharacterId: bigint;
  eveCharacterName: string;
  corpId: bigint;
  corpName: string;
  allianceId: bigint | null;
  allianceName: string | null;
  portraitUrl: string | null;
  esiAccessToken: Buffer | null;
  esiRefreshToken: Buffer | null;
  esiTokenExpiresAt: Date | null;
  scopes: string[];
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCharacterInput {
  accountId: string;
  eveCharacterId: bigint | number | string;
  eveCharacterName: string;
  corpId: bigint | number | string;
  corpName: string;
  allianceId?: bigint | number | string | null;
  allianceName?: string | null;
  portraitUrl?: string | null;
  esiAccessToken?: Buffer | null;
  esiRefreshToken?: Buffer | null;
  esiTokenExpiresAt?: Date | null;
  scopes?: string[];
}

export interface UpdateCharacterInput {
  corpId?: bigint | number | string;
  corpName?: string;
  allianceId?: bigint | number | string | null;
  allianceName?: string | null;
  portraitUrl?: string | null;
  esiAccessToken?: Buffer | null;
  esiRefreshToken?: Buffer | null;
  esiTokenExpiresAt?: Date | null;
  scopes?: string[];
  lastVerifiedAt?: Date | null;
}

/**
 * Repository for managing EVE characters
 */
export class CharacterRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Create a new character
   */
  async create(input: CreateCharacterInput): Promise<CharacterRecord> {
    const result = await this.db
      .insertInto('characters')
      .values({
        accountId: input.accountId,
        eveCharacterId: input.eveCharacterId,
        eveCharacterName: input.eveCharacterName,
        corpId: input.corpId,
        corpName: input.corpName,
        allianceId: input.allianceId ?? null,
        allianceName: input.allianceName ?? null,
        portraitUrl: input.portraitUrl ?? null,
        esiAccessToken: input.esiAccessToken ?? null,
        esiRefreshToken: input.esiRefreshToken ?? null,
        esiTokenExpiresAt: input.esiTokenExpiresAt ?? null,
        scopes: input.scopes ?? [],
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToRecord(result);
  }

  /**
   * Get character by ID
   */
  async getById(id: string): Promise<CharacterRecord | null> {
    const result = await this.db
      .selectFrom('characters')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return result ? this.mapToRecord(result) : null;
  }

  /**
   * Get character by EVE character ID
   */
  async getByEveCharacterId(eveCharacterId: bigint | number | string): Promise<CharacterRecord | null> {
    const result = await this.db
      .selectFrom('characters')
      .selectAll()
      .where('eveCharacterId', '=', BigInt(eveCharacterId))
      .executeTakeFirst();

    return result ? this.mapToRecord(result) : null;
  }

  /**
   * Get all characters for an account
   */
  async getByAccountId(accountId: string): Promise<CharacterRecord[]> {
    const results = await this.db
      .selectFrom('characters')
      .selectAll()
      .where('accountId', '=', accountId)
      .orderBy('createdAt', 'asc')
      .execute();

    return results.map((r) => this.mapToRecord(r));
  }

  /**
   * Update a character
   */
  async update(id: string, input: UpdateCharacterInput): Promise<CharacterRecord> {
    const result = await this.db
      .updateTable('characters')
      .set(input)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToRecord(result);
  }

  /**
   * Update character tokens
   */
  async updateTokens(
    id: string,
    accessToken: Buffer,
    refreshToken: Buffer,
    expiresAt: Date,
  ): Promise<void> {
    await this.db
      .updateTable('characters')
      .set({
        esiAccessToken: accessToken,
        esiRefreshToken: refreshToken,
        esiTokenExpiresAt: expiresAt,
        lastVerifiedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Update character verification timestamp
   */
  async updateLastVerified(id: string): Promise<void> {
    await this.db
      .updateTable('characters')
      .set({ lastVerifiedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Delete a character
   */
  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('characters').where('id', '=', id).execute();
  }

  /**
   * Upsert a character (create or update based on EVE character ID)
   */
  async upsert(input: CreateCharacterInput): Promise<CharacterRecord> {
    // Check if character exists
    const existing = await this.getByEveCharacterId(input.eveCharacterId);

    if (existing) {
      // Update existing character
      return this.update(existing.id, {
        corpId: input.corpId,
        corpName: input.corpName,
        allianceId: input.allianceId,
        allianceName: input.allianceName,
        portraitUrl: input.portraitUrl,
        esiAccessToken: input.esiAccessToken,
        esiRefreshToken: input.esiRefreshToken,
        esiTokenExpiresAt: input.esiTokenExpiresAt,
        scopes: input.scopes,
        lastVerifiedAt: new Date(),
      });
    }

    // Create new character
    return this.create(input);
  }

  /**
   * Get characters with expiring tokens (within next 5 minutes)
   */
  async getCharactersWithExpiringTokens(): Promise<CharacterRecord[]> {
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    const results = await this.db
      .selectFrom('characters')
      .selectAll()
      .where('esiTokenExpiresAt', '<=', fiveMinutesFromNow)
      .where('esiRefreshToken', 'is not', null)
      .execute();

    return results.map((r) => this.mapToRecord(r));
  }

  /**
   * Check if character exists for a different account
   */
  async existsForDifferentAccount(
    eveCharacterId: bigint | number | string,
    excludeAccountId: string,
  ): Promise<boolean> {
    const result = await this.db
      .selectFrom('characters')
      .select('id')
      .where('eveCharacterId', '=', BigInt(eveCharacterId))
      .where('accountId', '!=', excludeAccountId)
      .executeTakeFirst();

    return !!result;
  }

  /**
   * Map database result to CharacterRecord
   */
  private mapToRecord(row: unknown): CharacterRecord {
    const r = row as CharactersTable;
    return {
      id: r.id as unknown as string,
      accountId: r.accountId,
      eveCharacterId: r.eveCharacterId as unknown as bigint,
      eveCharacterName: r.eveCharacterName,
      corpId: r.corpId as unknown as bigint,
      corpName: r.corpName,
      allianceId: r.allianceId as unknown as bigint | null,
      allianceName: r.allianceName,
      portraitUrl: r.portraitUrl,
      esiAccessToken: r.esiAccessToken,
      esiRefreshToken: r.esiRefreshToken,
      esiTokenExpiresAt: r.esiTokenExpiresAt,
      scopes: r.scopes as unknown as string[],
      lastVerifiedAt: r.lastVerifiedAt as unknown as Date | null,
      createdAt: r.createdAt as unknown as Date,
      updatedAt: r.updatedAt as unknown as Date,
    };
  }
}
