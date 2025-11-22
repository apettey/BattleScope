import type {
  BattleRepository,
  KillmailRepository,
  KillmailEnrichmentRepository,
  PilotShipHistoryRepository,
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
    level: process.env.LOG_LEVEL ?? 'info',
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

        const { battles, ignoredKillmailIds } = this.engine.cluster(killmails);
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
}
