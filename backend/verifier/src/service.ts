import type { Kysely } from 'kysely';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Database } from '@battlescope/database';
import {
  CharacterRepository,
  AuthConfigRepository,
  AuditLogRepository,
} from '@battlescope/database';
import { type EsiClient, EsiHttpError } from '@battlescope/esi-client';
import { EncryptionService } from '@battlescope/auth';
import type { CharacterVerificationResult, VerificationStats, CharacterToVerify } from './types.js';
import {
  verificationJobDuration,
  charactersProcessed,
  organizationChanges,
  sessionsInvalidated,
  esiErrors,
  lastRunTimestamp,
  totalCharactersGauge,
  failedCharactersGauge,
} from './metrics.js';
import type { Config } from './config.js';

export class CharacterVerifierService {
  private readonly characterRepo: CharacterRepository;
  private readonly authConfigRepo: AuthConfigRepository;
  private readonly auditLogRepo: AuditLogRepository;
  private esiErrorBudget = 100;

  constructor(
    private readonly db: Kysely<Database>,
    private readonly redis: Redis,
    private readonly esiClient: EsiClient,
    private readonly encryptionService: EncryptionService,
    private readonly config: Config,
    private readonly logger: Logger,
  ) {
    this.characterRepo = new CharacterRepository(db);
    this.authConfigRepo = new AuthConfigRepository(db, logger);
    this.auditLogRepo = new AuditLogRepository(db);
  }

  /**
   * Main entry point for the verification job
   */
  async run(): Promise<VerificationStats> {
    const startTime = Date.now();
    const stats: VerificationStats = {
      totalCharacters: 0,
      verified: 0,
      failed: 0,
      skipped: 0,
      orgChanged: 0,
      sessionsInvalidated: 0,
      duration: 0,
    };

    const endTimer = verificationJobDuration.startTimer();

    this.logger.info('Starting character verification job');

    try {
      // 1. Fetch characters to verify
      const characters = await this.getCharactersToVerify();
      stats.totalCharacters = characters.length;

      this.logger.info({ count: characters.length }, 'Characters to verify');

      if (characters.length === 0) {
        this.logger.info('No characters need verification at this time');
        stats.duration = Date.now() - startTime;
        return stats;
      }

      // 2. Process in batches to respect ESI rate limits
      const { batchSize, delayBetweenBatches } = this.config;

      for (let i = 0; i < characters.length; i += batchSize) {
        const batch = characters.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(characters.length / batchSize);

        this.logger.info(
          {
            batchNumber,
            totalBatches,
            batchSize: batch.length,
            progress: Math.round((i / characters.length) * 100),
          },
          'Processing batch',
        );

        // Process batch in parallel
        const results = await Promise.all(batch.map((char) => this.verifyCharacter(char)));

        // 3. Process results
        for (const result of results) {
          if (!result.success) {
            stats.failed++;
            charactersProcessed.inc({ status: 'failed' });
            failedCharactersGauge.inc();
            continue;
          }

          if (result.skipReason) {
            stats.skipped++;
            charactersProcessed.inc({ status: 'skipped' });
          } else {
            stats.verified++;
            charactersProcessed.inc({ status: 'success' });
          }

          // 4. Update database
          await this.updateCharacterVerification(result);

          // 5. Track org changes
          if (result.corpChanged || result.allianceChanged) {
            stats.orgChanged++;

            let changeType: 'corp' | 'alliance' | 'both';
            if (result.corpChanged && result.allianceChanged) {
              changeType = 'both';
            } else if (result.corpChanged) {
              changeType = 'corp';
            } else {
              changeType = 'alliance';
            }
            organizationChanges.inc({ type: changeType });
          }

          // 6. Invalidate session if needed
          if (!result.isAllowed) {
            await this.invalidateSessionIfDisallowed(result);
            stats.sessionsInvalidated++;
            sessionsInvalidated.inc({ reason: 'organization_changed' });
          }
        }

        // Delay between batches to avoid rate limiting
        if (i + batchSize < characters.length) {
          await this.sleep(delayBetweenBatches);
        }

        // Check error budget
        if (this.esiErrorBudget <= 0) {
          this.logger.error('ESI error budget exhausted, stopping verification');
          break;
        }
      }

      stats.duration = Date.now() - startTime;

      // Update metrics
      lastRunTimestamp.setToCurrentTime();
      totalCharactersGauge.set(stats.totalCharacters);

      this.logger.info(
        {
          stats,
          durationSeconds: Math.round(stats.duration / 1000),
        },
        'Character verification job completed',
      );

      return stats;
    } catch (error) {
      this.logger.error({ error, stats }, 'Character verification job failed');
      throw error;
    } finally {
      endTimer();
    }
  }

  /**
   * Get characters that need verification
   */
  private async getCharactersToVerify(): Promise<CharacterToVerify[]> {
    const thresholdDate = new Date(
      Date.now() - this.config.verificationThresholdMinutes * 60 * 1000,
    );

    const results = await this.db
      .selectFrom('characters')
      .selectAll()
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('accounts')
            .select('id')
            .whereRef('accounts.id', '=', 'characters.accountId')
            .where('accounts.isDeleted', '=', false)
            .where('accounts.isBlocked', '=', false),
        ),
      )
      .where((eb) =>
        eb.or([eb('lastVerifiedAt', 'is', null), eb('lastVerifiedAt', '<', thresholdDate)]),
      )
      .orderBy('lastVerifiedAt', 'asc')
      .limit(this.config.maxCharactersPerRun)
      .execute();

    return results.map((r) => ({
      id: r.id as string,
      accountId: r.accountId,
      eveCharacterId: r.eveCharacterId as bigint,
      eveCharacterName: r.eveCharacterName,
      currentCorpId: r.corpId as bigint,
      currentCorpName: r.corpName,
      currentAllianceId: r.allianceId as bigint | null,
      currentAllianceName: r.allianceName,
      esiAccessToken: r.esiAccessToken,
      esiRefreshToken: r.esiRefreshToken,
      esiTokenExpiresAt: r.esiTokenExpiresAt,
      lastVerifiedAt: r.lastVerifiedAt,
    }));
  }

  /**
   * Verify a single character
   */
  private async verifyCharacter(
    character: CharacterToVerify,
  ): Promise<CharacterVerificationResult> {
    try {
      // 1. Check if we have a token
      if (!character.esiAccessToken || !character.esiRefreshToken) {
        this.logger.warn(
          { characterId: character.id, eveCharacterId: character.eveCharacterId.toString() },
          'Character has no ESI tokens, using last known corporation/alliance',
        );

        // Still check if last known values are allowed
        const isAllowed = await this.authConfigRepo.isCharacterAllowed(
          character.currentCorpId,
          character.currentAllianceId,
        );

        return {
          characterId: character.id,
          accountId: character.accountId,
          success: true,
          corpChanged: false,
          allianceChanged: false,
          isAllowed,
          skipReason: 'token_revoked',
        };
      }

      // 2. Decrypt tokens
      let accessToken: string;
      try {
        accessToken = this.encryptionService.decryptFromBuffer(character.esiAccessToken);
      } catch (error) {
        this.logger.error({ error, characterId: character.id }, 'Failed to decrypt access token');

        // Use last known values
        const isAllowed = await this.authConfigRepo.isCharacterAllowed(
          character.currentCorpId,
          character.currentAllianceId,
        );

        return {
          characterId: character.id,
          accountId: character.accountId,
          success: true,
          corpChanged: false,
          allianceChanged: false,
          isAllowed,
          skipReason: 'token_revoked',
        };
      }

      // 3. Fetch current character info from ESI
      let characterInfo;
      try {
        characterInfo = await this.executeWithBackoff(() =>
          this.esiClient.getCharacterInfo(Number(character.eveCharacterId)),
        );
      } catch (error) {
        if (error instanceof EsiHttpError) {
          if (error.statusCode === 401 || error.statusCode === 403) {
            // Token revoked/invalid - use last known values
            this.logger.warn(
              {
                characterId: character.id,
                error: error.message,
                statusCode: error.statusCode,
              },
              'ESI token invalid/revoked, using last known corporation/alliance',
            );

            const isAllowed = await this.authConfigRepo.isCharacterAllowed(
              character.currentCorpId,
              character.currentAllianceId,
            );

            return {
              characterId: character.id,
              accountId: character.accountId,
              success: true,
              corpChanged: false,
              allianceChanged: false,
              isAllowed,
              skipReason: 'token_revoked',
            };
          }
        }

        // Other errors - fail and retry next hour
        this.logger.error(
          { error, characterId: character.id },
          'Failed to fetch character info from ESI',
        );

        esiErrors.inc({
          error_code: error instanceof EsiHttpError ? error.statusCode.toString() : 'unknown',
        });

        return {
          characterId: character.id,
          accountId: character.accountId,
          success: false,
          corpChanged: false,
          allianceChanged: false,
          isAllowed: true, // Fail open
          error: error instanceof Error ? error.message : 'Unknown error',
          skipReason: 'esi_error',
        };
      }

      // 4. Check if corp or alliance changed
      const corpChanged = BigInt(characterInfo.corporation_id) !== character.currentCorpId;
      const allianceChanged =
        (characterInfo.alliance_id ? BigInt(characterInfo.alliance_id) : null) !==
        character.currentAllianceId;

      // 5. If changed, fetch corp/alliance names
      let newCorpName = character.currentCorpName;
      let newAllianceName = character.currentAllianceName;

      if (corpChanged) {
        try {
          const corp = await this.executeWithBackoff(() =>
            this.esiClient.getCorporationInfo(characterInfo.corporation_id),
          );
          newCorpName = corp.name;
        } catch (error) {
          this.logger.error(
            { error, corpId: characterInfo.corporation_id },
            'Failed to fetch corporation info',
          );
          // Use existing name if fetch fails
        }
      }

      if (allianceChanged && characterInfo.alliance_id) {
        try {
          const alliance = await this.executeWithBackoff(() =>
            this.esiClient.getAllianceInfo(characterInfo.alliance_id!),
          );
          newAllianceName = alliance.name;
        } catch (error) {
          this.logger.error(
            { error, allianceId: characterInfo.alliance_id },
            'Failed to fetch alliance info',
          );
          // Use existing name if fetch fails
        }
      }

      // 6. Check if new org is allowed
      const isAllowed = await this.authConfigRepo.isCharacterAllowed(
        BigInt(characterInfo.corporation_id),
        characterInfo.alliance_id ? BigInt(characterInfo.alliance_id) : null,
      );

      return {
        characterId: character.id,
        accountId: character.accountId,
        success: true,
        corpChanged,
        allianceChanged,
        newCorpId: BigInt(characterInfo.corporation_id),
        newCorpName,
        newAllianceId: characterInfo.alliance_id ? BigInt(characterInfo.alliance_id) : null,
        newAllianceName: characterInfo.alliance_id ? newAllianceName : null,
        isAllowed,
      };
    } catch (error) {
      this.logger.error({ error, characterId: character.id }, 'Character verification failed');

      return {
        characterId: character.id,
        accountId: character.accountId,
        success: false,
        corpChanged: false,
        allianceChanged: false,
        isAllowed: true, // Fail open - don't invalidate on transient errors
        error: error instanceof Error ? error.message : 'Unknown error',
        skipReason: 'esi_error',
      };
    }
  }

  /**
   * Update character verification in database
   */
  private async updateCharacterVerification(result: CharacterVerificationResult): Promise<void> {
    if (!result.success || (!result.corpChanged && !result.allianceChanged)) {
      // Only update last_verified_at
      await this.characterRepo.update(result.characterId, {
        lastVerifiedAt: new Date(),
      });
      return;
    }

    // Update corp/alliance info
    await this.characterRepo.update(result.characterId, {
      corpId: result.newCorpId!,
      corpName: result.newCorpName!,
      allianceId: result.newAllianceId,
      allianceName: result.newAllianceName,
      lastVerifiedAt: new Date(),
    });

    this.logger.info(
      {
        characterId: result.characterId,
        corpChanged: result.corpChanged,
        allianceChanged: result.allianceChanged,
        newCorpId: result.newCorpId?.toString(),
        newAllianceId: result.newAllianceId?.toString(),
      },
      'Character organization changed',
    );
  }

  /**
   * Invalidate session if character is no longer allowed
   */
  private async invalidateSessionIfDisallowed(result: CharacterVerificationResult): Promise<void> {
    if (result.isAllowed) {
      return; // Character still in approved org, no action needed
    }

    this.logger.warn(
      {
        accountId: result.accountId,
        characterId: result.characterId,
        reason: 'organization_changed',
      },
      'Invalidating sessions due to organization change',
    );

    try {
      // 1. Get current session token for account
      const sessionToken = await this.redis.get(`battlescope:account-session:${result.accountId}`);

      if (sessionToken) {
        // 2. Delete session
        await this.redis.del(`battlescope:session:${sessionToken}`);

        // 3. Delete account-session mapping
        await this.redis.del(`battlescope:account-session:${result.accountId}`);

        this.logger.info(
          {
            accountId: result.accountId,
            sessionToken: sessionToken.substring(0, 8) + '...',
          },
          'Session invalidated',
        );
      }

      // 4. Audit log
      await this.auditLogRepo.create({
        actorAccountId: null, // System action
        action: 'session.invalidated',
        targetType: 'account',
        targetId: result.accountId,
        metadata: {
          reason: 'organization_changed',
          characterId: result.characterId,
          newCorpId: result.newCorpId?.toString(),
          newAllianceId: result.newAllianceId?.toString(),
        },
      });
    } catch (error) {
      this.logger.error({ error, accountId: result.accountId }, 'Failed to invalidate session');
      // Don't throw - we don't want to fail the entire job if session invalidation fails
    }
  }

  /**
   * Execute ESI call with exponential backoff on rate limit
   */
  private async executeWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        const result = await fn();
        this.esiErrorBudget = Math.min(100, this.esiErrorBudget + 1);
        return result;
      } catch (error) {
        if (error instanceof EsiHttpError && error.statusCode === 429) {
          // Too Many Requests
          this.esiErrorBudget--;

          if (this.esiErrorBudget <= 0) {
            this.logger.error('ESI error budget exhausted');
            throw new Error('ESI rate limit exceeded');
          }

          const delay = Math.pow(2, retries) * 1000; // Exponential backoff
          this.logger.warn({ delay, retries }, 'ESI rate limited, backing off');
          esiErrors.inc({ error_code: '429' });

          await this.sleep(delay);
          retries++;
        } else {
          throw error;
        }
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
