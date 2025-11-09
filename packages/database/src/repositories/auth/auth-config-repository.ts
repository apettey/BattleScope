import type { Kysely } from 'kysely';
import type { Database } from '../../schema.js';

export interface AuthConfigRecord {
  requireMembership: boolean;
  allowedCorpIds: bigint[];
  allowedAllianceIds: bigint[];
  deniedCorpIds: bigint[];
  deniedAllianceIds: bigint[];
  updatedAt: Date;
}

export interface UpdateAuthConfigInput {
  requireMembership?: boolean;
  allowedCorpIds?: (bigint | number | string)[];
  allowedAllianceIds?: (bigint | number | string)[];
  deniedCorpIds?: (bigint | number | string)[];
  deniedAllianceIds?: (bigint | number | string)[];
}

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

/**
 * Repository for managing auth configuration (singleton)
 */
export class AuthConfigRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly logger?: Logger,
  ) {}

  /**
   * Get the auth config (singleton)
   */
  async get(): Promise<AuthConfigRecord> {
    const result = await this.db
      .selectFrom('auth_config')
      .selectAll()
      .where('id', '=', true)
      .executeTakeFirst();

    if (!result) {
      // Should never happen due to migration seed, but handle gracefully
      throw new Error('Auth config not found');
    }

    return {
      requireMembership: result.requireMembership,
      allowedCorpIds: result.allowedCorpIds,
      allowedAllianceIds: result.allowedAllianceIds,
      deniedCorpIds: result.deniedCorpIds,
      deniedAllianceIds: result.deniedAllianceIds,
      updatedAt: result.updatedAt,
    };
  }

  /**
   * Update the auth config
   */
  async update(input: UpdateAuthConfigInput): Promise<AuthConfigRecord> {
    const result = await this.db
      .updateTable('auth_config')
      .set(input)
      .where('id', '=', true)
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      requireMembership: result.requireMembership,
      allowedCorpIds: result.allowedCorpIds,
      allowedAllianceIds: result.allowedAllianceIds,
      deniedCorpIds: result.deniedCorpIds,
      deniedAllianceIds: result.deniedAllianceIds,
      updatedAt: result.updatedAt,
    };
  }

  /**
   * Check if a character is allowed based on org membership
   */
  async isCharacterAllowed(corpId: bigint, allianceId: bigint | null): Promise<boolean> {
    const config = await this.get();

    this.logger?.info(
      {
        checkingAuth: {
          corpId: corpId.toString(),
          allianceId: allianceId?.toString() ?? null,
          config: {
            requireMembership: config.requireMembership,
            allowedCorpIds: config.allowedCorpIds.map((id) => id.toString()),
            allowedAllianceIds: config.allowedAllianceIds.map((id) => id.toString()),
            deniedCorpIds: config.deniedCorpIds.map((id) => id.toString()),
            deniedAllianceIds: config.deniedAllianceIds.map((id) => id.toString()),
          },
        },
      },
      'Starting auth check for character',
    );

    // Check deny lists first
    const isCorpDenied = config.deniedCorpIds.some((id) => id === corpId);
    if (isCorpDenied) {
      this.logger?.warn(
        {
          corpId: corpId.toString(),
          deniedCorpIds: config.deniedCorpIds.map((id) => id.toString()),
        },
        'Character DENIED: Corporation is in deny list',
      );
      return false;
    }

    if (allianceId) {
      const isAllianceDenied = config.deniedAllianceIds.some((id) => id === allianceId);
      if (isAllianceDenied) {
        this.logger?.warn(
          {
            allianceId: allianceId.toString(),
            deniedAllianceIds: config.deniedAllianceIds.map((id) => id.toString()),
          },
          'Character DENIED: Alliance is in deny list',
        );
        return false;
      }
    }

    // If require_membership is false, allow all
    if (!config.requireMembership) {
      this.logger?.info(
        {
          corpId: corpId.toString(),
          allianceId: allianceId?.toString() ?? null,
        },
        'Character ALLOWED: requireMembership is false (public access enabled)',
      );
      return true;
    }

    // Check allow lists
    const inAllowedCorp = config.allowedCorpIds.some((id) => id === corpId);
    const inAllowedAlliance =
      allianceId !== null && config.allowedAllianceIds.some((id) => id === allianceId);

    this.logger?.info(
      {
        corpId: corpId.toString(),
        allianceId: allianceId?.toString() ?? null,
        inAllowedCorp,
        inAllowedAlliance,
        allowedCorpIds: config.allowedCorpIds.map((id) => id.toString()),
        allowedAllianceIds: config.allowedAllianceIds.map((id) => id.toString()),
      },
      'Checking allow lists',
    );

    // Allow if in either allowed corps or allowed alliances
    const isAllowed = inAllowedCorp || inAllowedAlliance;

    if (isAllowed) {
      this.logger?.info(
        {
          corpId: corpId.toString(),
          allianceId: allianceId?.toString() ?? null,
          matchedBy: inAllowedCorp ? 'corporation' : 'alliance',
        },
        'Character ALLOWED: Found in allow list',
      );
    } else {
      this.logger?.warn(
        {
          corpId: corpId.toString(),
          allianceId: allianceId?.toString() ?? null,
          requireMembership: config.requireMembership,
          allowedCorpIds: config.allowedCorpIds.map((id) => id.toString()),
          allowedAllianceIds: config.allowedAllianceIds.map((id) => id.toString()),
        },
        'Character DENIED: Not in any allow list (requireMembership is true)',
      );
    }

    return isAllowed;
  }

  /**
   * Add a corporation to the allowed list
   */
  async addAllowedCorp(corpId: bigint | number | string): Promise<void> {
    const config = await this.get();
    const corpIdBigInt = BigInt(corpId);

    if (!config.allowedCorpIds.some((id) => id === corpIdBigInt)) {
      await this.update({
        allowedCorpIds: [...config.allowedCorpIds, corpIdBigInt],
      });
    }
  }

  /**
   * Remove a corporation from the allowed list
   */
  async removeAllowedCorp(corpId: bigint | number | string): Promise<void> {
    const config = await this.get();
    const corpIdBigInt = BigInt(corpId);

    await this.update({
      allowedCorpIds: config.allowedCorpIds.filter((id) => id !== corpIdBigInt),
    });
  }

  /**
   * Add an alliance to the allowed list
   */
  async addAllowedAlliance(allianceId: bigint | number | string): Promise<void> {
    const config = await this.get();
    const allianceIdBigInt = BigInt(allianceId);

    if (!config.allowedAllianceIds.some((id) => id === allianceIdBigInt)) {
      await this.update({
        allowedAllianceIds: [...config.allowedAllianceIds, allianceIdBigInt],
      });
    }
  }

  /**
   * Remove an alliance from the allowed list
   */
  async removeAllowedAlliance(allianceId: bigint | number | string): Promise<void> {
    const config = await this.get();
    const allianceIdBigInt = BigInt(allianceId);

    await this.update({
      allowedAllianceIds: config.allowedAllianceIds.filter((id) => id !== allianceIdBigInt),
    });
  }

  /**
   * Add a corporation to the denied list
   */
  async addDeniedCorp(corpId: bigint | number | string): Promise<void> {
    const config = await this.get();
    const corpIdBigInt = BigInt(corpId);

    if (!config.deniedCorpIds.some((id) => id === corpIdBigInt)) {
      await this.update({
        deniedCorpIds: [...config.deniedCorpIds, corpIdBigInt],
      });
    }
  }

  /**
   * Remove a corporation from the denied list
   */
  async removeDeniedCorp(corpId: bigint | number | string): Promise<void> {
    const config = await this.get();
    const corpIdBigInt = BigInt(corpId);

    await this.update({
      deniedCorpIds: config.deniedCorpIds.filter((id) => id !== corpIdBigInt),
    });
  }

  /**
   * Add an alliance to the denied list
   */
  async addDeniedAlliance(allianceId: bigint | number | string): Promise<void> {
    const config = await this.get();
    const allianceIdBigInt = BigInt(allianceId);

    if (!config.deniedAllianceIds.some((id) => id === allianceIdBigInt)) {
      await this.update({
        deniedAllianceIds: [...config.deniedAllianceIds, allianceIdBigInt],
      });
    }
  }

  /**
   * Remove an alliance from the denied list
   */
  async removeDeniedAlliance(allianceId: bigint | number | string): Promise<void> {
    const config = await this.get();
    const allianceIdBigInt = BigInt(allianceId);

    await this.update({
      deniedAllianceIds: config.deniedAllianceIds.filter((id) => id !== allianceIdBigInt),
    });
  }
}
