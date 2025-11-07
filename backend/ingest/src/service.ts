import type { KillmailRepository, KillmailEventInsert, RulesetRecord } from '@battlescope/database';
import type { KillmailReference } from '@battlescope/shared';
import { trace } from '@opentelemetry/api';
import { pino } from 'pino';
import type { KillmailSource } from './source.js';
import type { RulesetCache } from './ruleset-cache.js';

export type IngestionResult = 'stored' | 'duplicate' | 'empty' | 'filtered';

const tracer = trace.getTracer('battlescope.ingest.service');

export interface KillmailEnrichmentProducer {
  enqueue(killmailId: bigint): Promise<void>;
}

export class IngestionService {
  private readonly logger = pino({
    name: 'ingest-service',
    level: process.env.LOG_LEVEL ?? 'info',
  });

  constructor(
    private readonly repository: KillmailRepository,
    private readonly rulesetCache: RulesetCache,
    private readonly source: KillmailSource,
    private readonly enrichmentProducer?: KillmailEnrichmentProducer,
  ) {}

  private async getActiveRuleset(): Promise<RulesetRecord> {
    return await this.rulesetCache.get();
  }

  private calculateParticipantCount(reference: KillmailReference): number {
    const victimCount = reference.victimCharacterId ? 1 : 0;
    const attackerCount = reference.attackerCharacterIds.length;
    const total = victimCount + attackerCount;
    return total > 0 ? total : 1;
  }

  private shouldIngest(reference: KillmailReference, ruleset: RulesetRecord): boolean {
    const participantCount = this.calculateParticipantCount(reference);

    // Check minimum pilots threshold
    if (participantCount < ruleset.minPilots) {
      return false;
    }

    // Build sets of tracked IDs for efficient lookup
    const trackedAllianceIds = new Set(ruleset.trackedAllianceIds.map((id) => id.toString()));
    const trackedCorpIds = new Set(ruleset.trackedCorpIds.map((id) => id.toString()));

    // If no tracking lists are configured and ignoreUnlisted is false, accept all
    const hasTrackingLists = trackedAllianceIds.size > 0 || trackedCorpIds.size > 0;
    if (!hasTrackingLists && !ruleset.ignoreUnlisted) {
      return true;
    }

    // If ignoreUnlisted is true and we have tracking lists, only accept tracked entities
    if (ruleset.ignoreUnlisted && hasTrackingLists) {
      const victimAllianceMatch =
        reference.victimAllianceId && trackedAllianceIds.has(reference.victimAllianceId.toString());
      const victimCorpMatch =
        reference.victimCorpId && trackedCorpIds.has(reference.victimCorpId.toString());

      const attackerAllianceMatch = reference.attackerAllianceIds.some((id) =>
        trackedAllianceIds.has(id.toString()),
      );
      const attackerCorpMatch = reference.attackerCorpIds.some((id) =>
        trackedCorpIds.has(id.toString()),
      );

      return victimAllianceMatch || victimCorpMatch || attackerAllianceMatch || attackerCorpMatch;
    }

    // Default: accept
    return true;
  }

  private toEvent(reference: KillmailReference): KillmailEventInsert {
    return {
      killmailId: reference.killmailId,
      systemId: reference.systemId,
      occurredAt: reference.occurredAt,
      victimAllianceId: reference.victimAllianceId,
      victimCorpId: reference.victimCorpId,
      victimCharacterId: reference.victimCharacterId,
      attackerAllianceIds: reference.attackerAllianceIds,
      attackerCorpIds: reference.attackerCorpIds,
      attackerCharacterIds: reference.attackerCharacterIds,
      iskValue: reference.iskValue,
      zkbUrl: reference.zkbUrl,
      fetchedAt: new Date(),
    } satisfies KillmailEventInsert;
  }

  async processNext(): Promise<IngestionResult> {
    return tracer.startActiveSpan('ingest.process', async (span) => {
      try {
        const reference = await this.source.pull();
        if (!reference) {
          span.addEvent('no-killmail');
          return 'empty';
        }

        span.setAttribute('killmail.id', Number(reference.killmailId));
        span.setAttribute('killmail.system', Number(reference.systemId));

        // Load active ruleset and check if we should ingest this killmail
        const ruleset = await this.getActiveRuleset();
        if (!this.shouldIngest(reference, ruleset)) {
          this.logger.debug({ killmailId: reference.killmailId }, 'Killmail filtered by ruleset');
          span.addEvent('filtered');
          return 'filtered';
        }

        const stored = await this.repository.insert(this.toEvent(reference));
        if (stored) {
          this.logger.info({ killmailId: reference.killmailId }, 'Stored killmail reference');
          span.addEvent('stored');
          if (this.enrichmentProducer) {
            try {
              await this.enrichmentProducer.enqueue(reference.killmailId);
              span.addEvent('enrichment.enqueued');
            } catch (error) {
              this.logger.warn(
                { err: error, killmailId: reference.killmailId },
                'Failed to enqueue enrichment job',
              );
              span.addEvent('enrichment.enqueue.failed');
            }
          }
          return 'stored';
        }

        span.addEvent('duplicate');
        return 'duplicate';
      } catch (error) {
        this.logger.error({ err: error }, 'Failed to process killmail');
        span.recordException(error as Error);
        span.setStatus({ code: 2, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async runForever(intervalMs: number, signal?: AbortSignal): Promise<void> {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    while (!signal?.aborted) {
      try {
        await this.processNext();
      } catch (error) {
        this.logger.error({ err: error }, 'Error during ingestion loop');
      }
      await sleep(intervalMs);
    }

    this.logger.info('Ingestion loop stopped');
  }
}
