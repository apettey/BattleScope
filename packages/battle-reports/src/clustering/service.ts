import type {
  BattleRepository,
  KillmailRepository,
  KillmailEnrichmentRepository,
  PilotShipHistoryRepository,
  BattleParticipantInsert,
  KillmailEventRecord,
} from '@battlescope/database';
import { trace } from '@opentelemetry/api';
import { pino } from 'pino';
import type { ClusteringEngine } from './engine.js';
import { ShipHistoryProcessor } from './ship-history-processor.js';

const tracer = trace.getTracer('battlescope.clusterer.service');

export interface ClustererStats {
  battles: number;
  processedKillmails: number;
  ignored: number;
  shipHistoryRecords: number;
}

export class ClustererService {
  private readonly logger = pino({
    name: 'clusterer-service',
    level: process.env.LOG_LEVEL ?? 'debug',
  });
  private readonly shipHistoryProcessor = new ShipHistoryProcessor();

  constructor(
    private readonly battleRepository: BattleRepository,
    private readonly killmailRepository: KillmailRepository,
    private readonly engine: ClusteringEngine,
    private readonly processingDelayMinutes = 30,
    private readonly enrichmentRepository?: KillmailEnrichmentRepository,
    private readonly shipHistoryRepository?: PilotShipHistoryRepository,
  ) {}

  async processBatch(limit: number): Promise<ClustererStats> {
    return tracer.startActiveSpan('clusterer.processBatch', async (span) => {
      try {
        const killmails = await this.killmailRepository.fetchUnprocessed(
          limit,
          this.processingDelayMinutes,
        );
        span.setAttribute('killmail.batch.size', killmails.length);

        if (killmails.length === 0) {
          return { battles: 0, processedKillmails: 0, ignored: 0, shipHistoryRecords: 0 };
        }

        const timeRange =
          killmails.length > 0
            ? `${killmails[0].occurredAt.toISOString()} to ${killmails[killmails.length - 1].occurredAt.toISOString()}`
            : 'N/A';
        this.logger.info({ count: killmails.length, timeRange }, 'Processing killmail batch');

        // Fetch enrichments for ship history processing
        let enrichmentMap = new Map<
          bigint,
          Awaited<ReturnType<KillmailEnrichmentRepository['find']>>
        >();
        if (this.enrichmentRepository && this.shipHistoryRepository) {
          const killmailIds = killmails.map((km) => km.killmailId);
          enrichmentMap = await this.enrichmentRepository.findByIds(killmailIds);
          span.setAttribute('enrichments.found', enrichmentMap.size);
        }

        // Check for existing battles that might overlap with these killmails (retroactive attribution)
        const existingBattles = await this.findOverlappingBattles(killmails);
        span.setAttribute('existing.battles.found', existingBattles.size);

        this.logger.debug(
          {
            killmailCount: killmails.length,
            systemsChecked: Array.from(existingBattles.keys()).map(id => id.toString()),
            battlesFound: Array.from(existingBattles.values()).flat().length,
          },
          'Found existing battles for retroactive attribution check',
        );

        // Separate killmails into those that should be attributed to existing battles vs new battles
        const { retroactiveKillmails, newKillmails } = await this.separateKillmails(
          killmails,
          existingBattles,
        );
        span.setAttribute('retroactive.killmails', retroactiveKillmails.length);
        span.setAttribute('new.killmails', newKillmails.length);

        // Process retroactive attributions
        this.logger.debug(
          { retroactiveCount: retroactiveKillmails.length },
          'Processing retroactive attributions',
        );
        const updatedBattleCount = await this.processRetroactiveAttributions(
          retroactiveKillmails,
          enrichmentMap,
        );
        span.setAttribute('battles.updated', updatedBattleCount);
        this.logger.debug(
          { battlesUpdated: updatedBattleCount },
          'Completed retroactive attributions',
        );

        const { battles, ignoredKillmailIds } = this.engine.cluster(newKillmails);
        let totalShipHistoryRecords = 0;

        for (const plan of battles) {
          await tracer.startActiveSpan('clusterer.createBattle', async (battleSpan) => {
            try {
              battleSpan.setAttribute('battle.id', plan.battle.id);
              battleSpan.setAttribute('battle.killmails.count', plan.killmailIds.length);
              battleSpan.setAttribute('battle.participants.count', plan.participantInserts.length);
              battleSpan.setAttribute('battle.systemId', plan.battle.systemId.toString());

              // Create battle
              await tracer.startActiveSpan('db.createBattle', async (dbSpan) => {
                try {
                  await this.battleRepository.createBattle(plan.battle);
                  dbSpan.setAttribute('db.operation', 'INSERT');
                  dbSpan.setAttribute('db.table', 'battles');
                } finally {
                  dbSpan.end();
                }
              });

              // Upsert killmails
              await tracer.startActiveSpan('db.upsertKillmails', async (dbSpan) => {
                try {
                  await this.battleRepository.upsertKillmails(plan.killmailInserts);
                  dbSpan.setAttribute('db.operation', 'UPSERT');
                  dbSpan.setAttribute('db.table', 'battle_killmails');
                  dbSpan.setAttribute('db.records', plan.killmailInserts.length);
                } finally {
                  dbSpan.end();
                }
              });

              // Upsert participants
              await tracer.startActiveSpan('db.upsertParticipants', async (dbSpan) => {
                try {
                  await this.battleRepository.upsertParticipants(plan.participantInserts);
                  dbSpan.setAttribute('db.operation', 'UPSERT');
                  dbSpan.setAttribute('db.table', 'battle_participants');
                  dbSpan.setAttribute('db.records', plan.participantInserts.length);
                } finally {
                  dbSpan.end();
                }
              });

              // Process ship history if repositories are available
              if (this.shipHistoryRepository && enrichmentMap.size > 0) {
                await tracer.startActiveSpan('db.insertShipHistory', async (dbSpan) => {
                  try {
                    const planKillmails = killmails.filter((km) =>
                      plan.killmailIds.includes(km.killmailId),
                    );
                    const shipHistoryRecords = this.shipHistoryProcessor.processBatch(
                      planKillmails,
                      enrichmentMap as Map<
                        bigint,
                        NonNullable<typeof enrichmentMap extends Map<bigint, infer V> ? V : never>
                      >,
                    );
                    if (shipHistoryRecords.length > 0) {
                      await this.shipHistoryRepository!.insertBatch(shipHistoryRecords);
                      totalShipHistoryRecords += shipHistoryRecords.length;
                    }
                    dbSpan.setAttribute('db.operation', 'INSERT');
                    dbSpan.setAttribute('db.table', 'pilot_ship_history');
                    dbSpan.setAttribute('db.records', shipHistoryRecords.length);
                  } finally {
                    dbSpan.end();
                  }
                });
              }

              // Mark killmails as processed
              await tracer.startActiveSpan('db.markKillmailsProcessed', async (dbSpan) => {
                try {
                  await this.killmailRepository.markAsProcessed(plan.killmailIds, plan.battle.id);
                  dbSpan.setAttribute('db.operation', 'UPDATE');
                  dbSpan.setAttribute('db.table', 'killmail_events');
                  dbSpan.setAttribute('db.records', plan.killmailIds.length);
                } finally {
                  dbSpan.end();
                }
              });

              this.logger.info(
                {
                  battleId: plan.battle.id,
                  kills: plan.killmailIds.length,
                  participants: plan.participantInserts.length,
                  shipHistoryRecords: totalShipHistoryRecords,
                  systemId: plan.battle.systemId.toString(),
                  startTime: plan.battle.startTime.toISOString(),
                  endTime: plan.battle.endTime.toISOString(),
                  totalIskDestroyed: plan.battle.totalIskDestroyed.toString(),
                },
                'Created battle with participants and ship history',
              );
            } catch (error) {
              battleSpan.recordException(error as Error);
              battleSpan.setStatus({ code: 2, message: (error as Error).message });
              this.logger.error(
                {
                  error,
                  battleId: plan.battle.id,
                },
                'Failed to create battle',
              );
              throw error;
            } finally {
              battleSpan.end();
            }
          });
        }

        if (ignoredKillmailIds.length > 0) {
          await this.killmailRepository.markAsProcessed(ignoredKillmailIds, null);
          this.logger.info(
            { ignored: ignoredKillmailIds.length },
            'Ignored killmails below threshold',
          );
        }

        span.setAttribute('battles.created', battles.length);
        span.setAttribute('killmail.ignored', ignoredKillmailIds.length);
        span.setAttribute('shipHistory.records', totalShipHistoryRecords);

        return {
          battles: battles.length,
          processedKillmails: killmails.length,
          ignored: ignoredKillmailIds.length,
          shipHistoryRecords: totalShipHistoryRecords,
        };
      } catch (error) {
        this.logger.error({ err: error }, 'Failed to cluster killmails');
        span.recordException(error as Error);
        span.setStatus({ code: 2, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async runForever(intervalMs: number, batchSize: number, signal?: AbortSignal): Promise<void> {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    while (!signal?.aborted) {
      try {
        const stats = await this.processBatch(batchSize);
        this.logger.debug(stats, 'Cluster processed');
      } catch (error) {
        this.logger.error({ err: error }, 'Cluster batch failed');
      }
      await sleep(intervalMs);
    }

    this.logger.info('Clusterer loop stopped');
  }

  /**
   * Find existing battles that might overlap with the given killmails
   * Returns a map of systemId -> battles in that system
   */
  private async findOverlappingBattles(
    killmails: KillmailEventRecord[],
  ): Promise<Map<bigint, Awaited<ReturnType<BattleRepository['findOverlappingBattles']>>>> {
    const systemIds = new Set(killmails.map((km) => km.systemId));
    const battlesMap = new Map<bigint, Awaited<ReturnType<BattleRepository['findOverlappingBattles']>>>();

    // For each system, find battles that might overlap
    for (const systemId of systemIds) {
      const systemKillmails = killmails.filter((km) => km.systemId === systemId);
      if (systemKillmails.length === 0) continue;

      const times = systemKillmails.map((km) => km.occurredAt.getTime());
      const earliest = new Date(Math.min(...times));
      const latest = new Date(Math.max(...times));

      // Look back 60 minutes from the earliest killmail to catch battles that might still be ongoing
      const battles = await this.battleRepository.findOverlappingBattles(
        systemId,
        earliest,
        latest,
        60,
      );

      this.logger.debug(
        {
          systemId: systemId.toString(),
          earliest: earliest.toISOString(),
          latest: latest.toISOString(),
          battlesFound: battles.length,
          battleDetails: battles.map((b) => ({
            id: b.id,
            startTime: b.startTime.toISOString(),
            endTime: b.endTime.toISOString(),
          })),
        },
        'Checked for overlapping battles in system',
      );

      if (battles.length > 0) {
        battlesMap.set(systemId, battles);
      }
    }

    return battlesMap;
  }

  /**
   * Separate killmails into those that should be attributed to existing battles vs new battles
   */
  private async separateKillmails(
    killmails: KillmailEventRecord[],
    existingBattles: Map<bigint, Awaited<ReturnType<BattleRepository['findOverlappingBattles']>>>,
  ): Promise<{
    retroactiveKillmails: Array<{ killmail: KillmailEventRecord; battleId: string }>;
    newKillmails: KillmailEventRecord[];
  }> {
    const retroactiveKillmails: Array<{ killmail: KillmailEventRecord; battleId: string }> = [];
    const newKillmails: KillmailEventRecord[] = [];

    for (const killmail of killmails) {
      const systemBattles = existingBattles.get(killmail.systemId);
      if (!systemBattles || systemBattles.length === 0) {
        newKillmails.push(killmail);
        continue;
      }

      // Find the best matching battle based on temporal proximity and participant overlap
      let bestBattle: (typeof systemBattles)[number] | null = null;
      let bestScore = 0;

      for (const battle of systemBattles) {
        // Check if killmail is within or near the battle's time range
        const withinTimeRange =
          killmail.occurredAt >= battle.startTime && killmail.occurredAt <= battle.endTime;

        // Check if killmail extends the battle (before or after existing range)
        const extendsBackward =
          killmail.occurredAt < battle.startTime &&
          battle.startTime.getTime() - killmail.occurredAt.getTime() <= 30 * 60 * 1000;
        const extendsForward =
          killmail.occurredAt > battle.endTime &&
          killmail.occurredAt.getTime() - battle.endTime.getTime() <= 30 * 60 * 1000;

        // Check temporal proximity (within 30 minutes of battle)
        const timeDiffStart = Math.abs(
          killmail.occurredAt.getTime() - battle.startTime.getTime(),
        );
        const timeDiffEnd = Math.abs(killmail.occurredAt.getTime() - battle.endTime.getTime());
        const minTimeDiff = Math.min(timeDiffStart, timeDiffEnd);
        const withinTimeWindow = minTimeDiff <= 30 * 60 * 1000; // 30 minutes

        if (withinTimeRange || withinTimeWindow || extendsBackward || extendsForward) {
          // Calculate a score based on temporal proximity (closer is better)
          const score = 1 / (1 + minTimeDiff / 1000); // Score decreases with time distance
          if (score > bestScore) {
            bestScore = score;
            bestBattle = battle;
          }
        }
      }

      if (bestBattle) {
        retroactiveKillmails.push({ killmail, battleId: bestBattle.id });
        this.logger.info(
          {
            killmailId: killmail.killmailId.toString(),
            battleId: bestBattle.id,
            occurredAt: killmail.occurredAt.toISOString(),
            battleTimeRange: `${bestBattle.startTime.toISOString()} to ${bestBattle.endTime.toISOString()}`,
            bestScore,
          },
          'Retroactively attributing killmail to existing battle',
        );
      } else {
        this.logger.debug(
          {
            killmailId: killmail.killmailId.toString(),
            occurredAt: killmail.occurredAt.toISOString(),
            systemBattles: systemBattles?.length ?? 0,
          },
          'No matching battle found for killmail, will process as new',
        );
        newKillmails.push(killmail);
      }
    }

    return { retroactiveKillmails, newKillmails };
  }

  /**
   * Process retroactive attributions by updating existing battles
   */
  private async processRetroactiveAttributions(
    retroactiveKillmails: Array<{ killmail: KillmailEventRecord; battleId: string }>,
    enrichmentMap: Map<bigint, Awaited<ReturnType<KillmailEnrichmentRepository['find']>>>,
  ): Promise<number> {
    if (retroactiveKillmails.length === 0) {
      return 0;
    }

    // Group killmails by battle ID
    const killmailsByBattle = new Map<
      string,
      Array<{ killmail: KillmailEventRecord; battleId: string }>
    >();
    for (const item of retroactiveKillmails) {
      const existing = killmailsByBattle.get(item.battleId) ?? [];
      existing.push(item);
      killmailsByBattle.set(item.battleId, existing);
    }

    let updatedCount = 0;

    for (const [battleId, items] of killmailsByBattle.entries()) {
      await tracer.startActiveSpan('clusterer.updateBattle', async (span) => {
        try {
          span.setAttribute('battle.id', battleId);
          span.setAttribute('killmails.added', items.length);

          const killmails = items.map((item) => item.killmail);
          const times = killmails.map((km) => km.occurredAt.getTime());
          const earliestTime = new Date(Math.min(...times));
          const latestTime = new Date(Math.max(...times));

          const totalIsk = killmails.reduce((sum, km) => sum + (km.iskValue ?? 0n), 0n);

          // Update battle statistics
          const updatedBattle = await this.battleRepository.updateBattleWithKillmails(battleId, {
            totalKills: BigInt(killmails.length),
            totalIskDestroyed: totalIsk,
            earliestTime,
            latestTime,
          });

          // Upsert killmails into battle_killmails
          const killmailInserts = killmails.map((km) => ({
            battleId,
            killmailId: km.killmailId,
            zkbUrl: km.zkbUrl,
            occurredAt: km.occurredAt,
            victimAllianceId: km.victimAllianceId,
            attackerAllianceIds: km.attackerAllianceIds,
            iskValue: km.iskValue,
            sideId: null,
          }));
          await this.battleRepository.upsertKillmails(killmailInserts);

          // Extract and upsert participants
          const participantInserts = this.extractParticipants(battleId, killmails);
          await this.battleRepository.upsertParticipants(participantInserts);

          // Process ship history if available
          if (this.shipHistoryRepository && enrichmentMap.size > 0) {
            const shipHistoryRecords = this.shipHistoryProcessor.processBatch(
              killmails,
              enrichmentMap as Map<
                bigint,
                NonNullable<typeof enrichmentMap extends Map<bigint, infer V> ? V : never>
              >,
            );
            if (shipHistoryRecords.length > 0) {
              await this.shipHistoryRepository.insertBatch(shipHistoryRecords);
            }
          }

          // Mark killmails as processed
          await this.killmailRepository.markAsProcessed(
            killmails.map((km) => km.killmailId),
            battleId,
          );

          updatedCount++;

          this.logger.info(
            {
              battleId,
              addedKillmails: items.length,
              totalKills: updatedBattle.totalKills.toString(),
              totalIskDestroyed: updatedBattle.totalIskDestroyed.toString(),
              newTimeRange: `${updatedBattle.startTime.toISOString()} to ${updatedBattle.endTime.toISOString()}`,
            },
            'Updated battle with retroactive killmails',
          );
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: 2, message: (error as Error).message });
          this.logger.error({ error, battleId }, 'Failed to update battle with retroactive killmails');
          throw error;
        } finally {
          span.end();
        }
      });
    }

    return updatedCount;
  }

  /**
   * Extract participants from killmails (copied from engine.ts for use in retroactive attribution)
   */
  private extractParticipants(
    battleId: string,
    killmails: KillmailEventRecord[],
  ): BattleParticipantInsert[] {
    const participantMap = new Map<string, BattleParticipantInsert>();

    for (const killmail of killmails) {
      // Add victim as participant
      if (killmail.victimCharacterId) {
        const key = `${killmail.victimCharacterId}:${killmail.victimCharacterId}`;
        if (!participantMap.has(key)) {
          participantMap.set(key, {
            battleId,
            characterId: killmail.victimCharacterId,
            allianceId: killmail.victimAllianceId,
            corpId: killmail.victimCorpId,
            shipTypeId: null,
            sideId: null,
            isVictim: true,
          });
        }
      }

      // Add attackers as participants
      const attackerCount = killmail.attackerCharacterIds?.length ?? 0;
      for (let i = 0; i < attackerCount; i++) {
        const characterId = killmail.attackerCharacterIds[i];
        const corpId = killmail.attackerCorpIds?.[i] ?? null;
        const allianceId = killmail.attackerAllianceIds?.[i] ?? null;

        const key = `${characterId}:${characterId}`;
        if (!participantMap.has(key)) {
          participantMap.set(key, {
            battleId,
            characterId,
            allianceId,
            corpId,
            shipTypeId: null,
            sideId: null,
            isVictim: false,
          });
        }
      }
    }

    return Array.from(participantMap.values());
  }
}
